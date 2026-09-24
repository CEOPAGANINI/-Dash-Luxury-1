#!/usr/bin/env python3
"""Ponta a ponta REAL do Servidor do Funil (§14.E). Quem chama é scripts/vps/e2e.sh, como root.

  e2e_teste.py demo      --painel URL --raiz DIR --trabalho DIR --usuario dash-e2e [--log-next ARQ]
  e2e_teste.py protegido --painel URL [--log-next ARQ]

Fase `demo` (build sem Supabase): o painel de verdade (`next start` + Postgres 16) conversa com o
agente de verdade, instalado pelo instalar.sh em raiz falsa e rodando como outro usuário
(dash-e2e), que fala com o ajudante root (como root) por socket Unix com SO_PEERCRED real. O lado
do painel é comandado por scripts/vps/semear.ts (os serviços reais, sem next/*); o banco e o disco
são conferidos por psql e pelo sistema de arquivos. nginx, certbot e systemctl são os falsos de
tests/agente/falsos: o certificado é gerado de verdade pelo openssl, mas nada é servido por nginx.
No lugar do nginx, um `python3 -m http.server` rodando como `nobody` (outro usuário, como o
www-data) serve o `current` e o curl confere o conteúdo.

Fase `protegido` (build com Supabase inalcançável): /servidor manda para o login e as rotas do
agente respondem sem passar pelo Supabase.

Cada passo imprime as verificações (ok/FALHOU). Um passo crítico que falha interrompe os que
dependem dele, que aparecem como NÃO RODOU. Sai 0 só se tudo passou.
"""
import argparse
import base64
import functools
import hashlib
import hmac
import http.server
import io
import json
import os
import pwd
import re
import secrets
import socket
import ssl
import stat
import struct
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
import uuid
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PUBLICO = os.path.join(REPO, "public", "agente", "v1")
FIXTURES = os.path.join(REPO, "tests", "fixtures", "vps")
FALSOS = os.path.join(REPO, "tests", "agente", "falsos")
TSX = os.path.join(REPO, "node_modules", ".bin", "tsx")
SEMEAR = os.path.join(REPO, "scripts", "vps", "semear.ts")
PYTHON = "/usr/bin/python3"  # o mesmo que as units e o instalador usam

DOMINIO = "loja-e2e.com.br"
SLUG = "loja-e2e"
ORIGEM = "https://checkout-e2e.com.br"
DONO = "dono@e2e-teste.com.br"
NOME_SERVIDOR = "VPS E2E"
IP_DO_SERVIDOR = "45.10.20.30"  # o IP "público" informado no painel (ip_override)
IP_ERRADO = "45.10.20.99"  # o DNS apontando para outro lugar
FORA_DA_RAIZ = "/tmp/dash-e2e-zip-slip.html"  # o alvo do zip slip: não pode existir nunca
AMBIENTE_MINIMO = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C.UTF-8"}
_OCTETO = r"(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)"
# Um IPv4 de verdade no HTML (sem pegar pedaço de número de path SVG, hash ou versão).
R_IPV4_NO_TEXTO = r"(?<![\d.])" + r"\.".join([_OCTETO] * 4) + r"(?![\d.])"


# --- Relatório --------------------------------------------------------------------------------------


class Falha(Exception):
    pass


class Relatorio:
    def __init__(self, fase):
        self.fase = fase
        self.passos = []
        self.ok = 0
        self.falhas = 0
        self.parado_por = None

    def conferir(self, condicao, texto, detalhe=None):
        if condicao:
            self.ok += 1
            print("    ok      " + texto, flush=True)
            return
        self.falhas += 1
        print("    FALHOU  " + texto + ("" if detalhe is None else "\n            -> " + str(detalhe)[:1500]), flush=True)
        raise Falha(texto)

    def passo(self, nome, funcao, critico=True):
        if self.parado_por:
            print(f"\n[NÃO RODOU] {nome} (depende de: {self.parado_por})", flush=True)
            self.passos.append((nome, "NÃO RODOU"))
            return
        print(f"\n=== {nome}", flush=True)
        inicio = time.monotonic()
        try:
            funcao()
            estado = "PASSOU"
        except Falha:
            estado = "FALHOU"
        except Exception:
            self.falhas += 1
            print("    FALHOU  erro inesperado:\n" + traceback.format_exc(), flush=True)
            estado = "FALHOU"
        print(f"--- {estado} em {time.monotonic() - inicio:.1f} s: {nome}", flush=True)
        self.passos.append((nome, estado))
        if estado == "FALHOU" and critico:
            self.parado_por = nome

    def resumo(self):
        contagem = {e: sum(1 for _, x in self.passos if x == e) for e in ("PASSOU", "FALHOU", "NÃO RODOU")}
        print(f"\n##### Fase {self.fase}: resumo", flush=True)
        for nome, estado in self.passos:
            print(f"  [{estado}] {nome}")
        print(
            f"  Passos: {len(self.passos)} | passaram {contagem['PASSOU']} | falharam {contagem['FALHOU']} | "
            f"não rodaram {contagem['NÃO RODOU']}"
        )
        print(f"  Verificações: {self.ok} ok | {self.falhas} falharam", flush=True)
        return 0 if contagem["FALHOU"] == 0 and contagem["NÃO RODOU"] == 0 and self.falhas == 0 else 1


REL = None


def conferir(condicao, texto, detalhe=None):
    REL.conferir(condicao, texto, detalhe)


def info(texto):
    print("    ·       " + texto, flush=True)


# --- Utilidades ------------------------------------------------------------------------------------


def sha256(dados):
    return hashlib.sha256(dados).hexdigest()


def ler(caminho, modo="rb"):
    with open(caminho, modo) as f:
        return f.read()


def constante_ts(arquivo, nome):
    m = re.search(r"export const " + nome + r' =\s*"([^"]*)"', ler(arquivo, "r"))
    if not m:
        raise RuntimeError(f"não achei {nome} em {arquivo}")
    return m.group(1)


def constantes_do_selo():
    arquivo = os.path.join(REPO, "src", "features", "vps", "agente-versao.ts")
    return {n: constante_ts(arquivo, n) for n in ("INSTALADOR_SHA256", "AGENTE_SHA256", "AGENTE_ROOT_SHA256")}


def frase_do_demo():
    return constante_ts(os.path.join(REPO, "src", "features", "vps", "pre-requisitos.tsx"), "FRASE_DO_DEMO")


def pagina_de_espera():
    # A constante do TS e a do Python são conferidas iguais pelo test_compat; aqui vale a do TS.
    fonte = ler(os.path.join(REPO, "src", "features", "vps", "modelo.ts"), "r")
    m = re.search(r"export const PAGINA_DE_ESPERA = `([^`]*)`", fonte)
    if not m:
        raise RuntimeError("não achei PAGINA_DE_ESPERA em modelo.ts")
    return m.group(1).encode("utf-8")


def golden(nome):
    return ler(os.path.join(FIXTURES, "golden", nome))


# --- HTTP (sem proxy e sem seguir redirecionamento) -------------------------------------------------


class _SemRedirecionar(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_ABRIDOR = urllib.request.build_opener(_SemRedirecionar, urllib.request.ProxyHandler({}))


class Painel:
    def __init__(self, url):
        self.url = url.rstrip("/")

    def pedir(self, metodo, caminho, corpo=None, cabecalhos=None, timeout=30):
        req = urllib.request.Request(self.url + caminho, data=corpo, method=metodo, headers=cabecalhos or {})
        try:
            with _ABRIDOR.open(req, timeout=timeout) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def json(self, bruto):
        try:
            return json.loads(bruto)
        except ValueError:
            return None


# --- Banco (psql com PGHOST/PGUSER/PGPASSWORD do ambiente: nada de segredo no argv) ----------------


def psql(sql):
    r = subprocess.run(
        ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, timeout=60
    )
    if r.returncode != 0:
        raise RuntimeError("psql falhou: " + r.stderr.strip())
    return r.stdout.strip()


def linhas(sql):
    return json.loads(psql(f"select coalesce(json_agg(t), '[]'::json) from ({sql}) t"))


def esperar_auditoria(acao, entidade, segundos=10):
    """O after() roda depois da resposta: dá um tempo para a linha aparecer."""
    limite = time.time() + segundos
    while time.time() < limite:
        if psql(f"select count(*) from audit_logs where action = {q(acao)} and entity_id = {q(entidade)}") != "0":
            return True
        time.sleep(0.2)
    return False


def linha(sql):
    todas = linhas(sql)
    return todas[0] if todas else None


def q(texto):
    """Literal SQL (os valores daqui são uuids e textos do próprio teste)."""
    return "'" + str(texto).replace("'", "''") + "'"


# --- Painel: semear.ts ------------------------------------------------------------------------------


def semear(comando, **opcoes):
    argv = [TSX, SEMEAR, comando]
    for nome, valor in opcoes.items():
        argv += ["--" + nome.replace("_", "-"), str(valor)]
    r = subprocess.run(argv, cwd=REPO, capture_output=True, text=True, timeout=180)
    ultima = (r.stdout.strip().splitlines() or [""])[-1]
    try:
        dados = json.loads(ultima)
    except ValueError:
        dados = None
    if r.returncode not in (0, 3) or dados is None:
        raise RuntimeError(f"semear {comando} saiu com {r.returncode}: {r.stderr.strip()[-3000:]} {r.stdout[-500:]}")
    return r.returncode, dados


def semear_ok(comando, **opcoes):
    codigo, dados = semear(comando, **opcoes)
    conferir(codigo == 0 and dados.get("ok") is True, f"painel: {comando} aceito", dados)
    return dados


# --- Raiz falsa, agente e ajudante --------------------------------------------------------------------


class Ambiente:
    def __init__(self, args):
        self.painel = Painel(args.painel)
        self.raiz = args.raiz
        self.trabalho = args.trabalho
        self.usuario = args.usuario
        self.log_next = args.log_next
        self.uid = pwd.getpwnam(args.usuario).pw_uid if args.usuario else None
        self.gid = pwd.getpwnam(args.usuario).pw_gid if args.usuario else None
        self.ajudante = None
        self.processos = []
        self.servidor_id = None
        self.site_id = None
        self.versoes = {}
        self.indices = {}
        self.artefatos = {}
        self.ultimo_pulso_do_teste = 0.0

    def r(self, *partes):
        return os.path.join(self.raiz, *partes)

    @property
    def pasta_site(self):
        return self.r("var/www/dash-funil", SLUG)

    @property
    def vhost(self):
        return self.r("etc/nginx/sites-available", f"dash-{SLUG}.conf")

    def como_agente(self, argv, entrada=None, timeout=300):
        return subprocess.run(
            ["runuser", "-u", self.usuario, "--"] + argv, input=entrada, capture_output=True, text=True,
            timeout=timeout, env=dict(AMBIENTE_MINIMO), cwd=self.raiz,
        )

    def agente(self, *comando, entrada=None, timeout=300):
        argv = [PYTHON, "-I", self.r("opt/dash-agent/dash_agent.py"), *comando, "--modo-teste", "--raiz", self.raiz]
        return self.como_agente(argv, entrada=entrada, timeout=timeout)

    def uma_vez(self, esperado=0):
        # Logo depois de um pulso do próprio teste o painel frearia o agente (429 e 5 s de espera).
        espera = 1.2 - (time.monotonic() - self.ultimo_pulso_do_teste)
        if espera > 0:
            time.sleep(espera)
        r = self.agente("uma-vez")
        conferir(r.returncode == esperado, f"agente (dash-e2e): uma-vez saiu com {esperado}", f"saiu {r.returncode}: {r.stderr[-2000:]}")
        return r

    def cfg(self):
        return json.loads(ler(self.r("var/lib/dash-agent/agente.json")))

    def estado_do_agente(self):
        return json.loads(ler(self.r("var/lib/dash-agent/estado.json")))

    def executados(self):
        caminho = self.r("executados.jsonl")
        if not os.path.exists(caminho):
            return []
        return [json.loads(x) for x in ler(caminho, "r").splitlines() if x.strip()]

    def recargas(self):
        return sum(1 for x in self.executados() if x["programa"] == "systemctl" and x["argv"][:1] == ["reload"])

    def current(self):
        return os.readlink(os.path.join(self.pasta_site, "current"))

    def tarefa(self, ident):
        return linha(f"select status, error, type, result, seq, delivered_at is not null as entregue from vps_jobs where id = {q(ident)}")

    def iniciar_ajudante(self):
        argv = [
            PYTHON, "-I", self.r("opt/dash-agent/dash_agent_root.py"), "servir", "--modo-teste", "--raiz", self.raiz,
            "--uid-agente", str(self.uid), "--executor", "simulado", "--falsos", FALSOS,
        ]
        self.ajudante = subprocess.Popen(
            argv, stdout=subprocess.DEVNULL, stderr=open(os.path.join(self.trabalho, "ajudante-root.log"), "ab"),
            env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"}, cwd=self.raiz,
        )
        sock = self.r("run/dash-agent-root/root.sock")
        limite = time.time() + 15
        while not os.path.exists(sock):
            if self.ajudante.poll() is not None or time.time() > limite:
                raise Falha("o ajudante root não subiu (veja ajudante-root.log)")
            time.sleep(0.05)
        return sock

    def encerrar(self):
        for p in [self.ajudante] + self.processos:
            if p is not None and p.poll() is None:
                p.terminate()
                try:
                    p.wait(5)
                except subprocess.TimeoutExpired:
                    p.kill()


# --- Pedidos assinados pelo próprio teste (com o token e a chave do agente) --------------------------


def b64d(texto):
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def corpo_do_pulso():
    return json.dumps(
        {
            "versao": "1.0.0",
            "travas": {"pausado": False, "somenteLeitura": False},
            "executando": None,
            "desvioMs": 0,
            "ipv4": [],
            "ipv6": [],
            "visaoGeral": None,
            "nginx": None,
            "certificados": None,
            "sites": None,  # sem reconciliação: o teste não fala pelo disco da VPS
        },
        separators=(",", ":"),
    ).encode()


def assinar_pedido(cfg, metodo, caminho, seq, corpo):
    # Implementação própria (não a do agente) do canonicoPedido de chaves.ts.
    canonico = "\n".join(["dash-vps-pedido-v1", metodo, caminho, cfg["servidorId"], str(seq), sha256(corpo)])
    return hmac.new(b64d(cfg["chavePedidos"]), canonico.encode(), hashlib.sha256).hexdigest()


def proxima_seq(servidor_id):
    ultima = int(psql(f"select agent_last_seq from vps_servers where id = {q(servidor_id)}"))
    return max(int(time.time() * 1000), ultima + 1)


def pulso_assinado(amb, cfg, seq=None, assinatura=None, token=None, esperar_freio=True):
    if esperar_freio:
        time.sleep(1.2)  # o painel freia pulsos a menos de 1 s um do outro (429)
    corpo = corpo_do_pulso()
    seq = proxima_seq(cfg["servidorId"]) if seq is None else seq
    cab = {
        "Authorization": "Bearer " + (token or cfg["token"]),
        "X-Dash-Servidor": cfg["servidorId"],
        "X-Dash-Seq": str(seq),
        "X-Dash-Assinatura": "v1=" + (assinatura or assinar_pedido(cfg, "POST", "/api/agente/v1/pulso", seq, corpo)),
        "Content-Type": "application/json",
    }
    status, cabecalhos, bruto = amb.painel.pedir("POST", "/api/agente/v1/pulso", corpo, cab)
    amb.ultimo_pulso_do_teste = time.monotonic()
    return status, cabecalhos, amb.painel.json(bruto), seq, cab, corpo


def eh_marca_dash(status, cabecalhos, dados):
    return (
        status == 401
        and (cabecalhos.get("WWW-Authenticate") or "").startswith("Dash-HMAC")
        and dados == {"ok": False, "error": "unauthorized"}
    )


# --- ZIPs do teste ----------------------------------------------------------------------------------

RASTREIO = '<script src="http://127.0.0.1/agente/v1/rastreio.js" data-produto="cadeira" defer></script>'


def zip_do_site(nome, versao, com_rastreio=False):
    arquivos = {
        "index.html": (
            f"<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Loja E2E</title>"
            f"<link rel=\"stylesheet\" href=\"css/estilo.css\"><h1>Versão {versao}</h1>"
            f"<a href=\"/checkout?qty=1\">Comprar</a>{RASTREIO if com_rastreio else ''}\n"
        ).encode(),
        "css/estilo.css": f"h1{{color:#{secrets.token_hex(3)}}} /* {versao} */\n".encode(),
        "obrigado/index.html": f"<!doctype html><p>Obrigado ({versao})</p>\n".encode(),
        "termos.html": b"<!doctype html><p>Termos</p>\n",
        "img/logo.svg": b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\n',
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for caminho, dados in arquivos.items():
            z.writestr(caminho, dados)
        z.writestr("__MACOSX/._index.html", b"lixo do macOS")  # ignorado nos dois lados
    caminho = os.path.join(AMB.trabalho, nome)
    with open(caminho, "wb") as f:
        f.write(buf.getvalue())
    return caminho, arquivos


def zip_slip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("index.html", b"<!doctype html><p>isca</p>\n")
        z.writestr("../../../../../../../../.." + FORA_DA_RAIZ, b"<p>escapou da pasta</p>\n")
    caminho = os.path.join(AMB.trabalho, "zip-slip.zip")
    with open(caminho, "wb") as f:
        f.write(buf.getvalue())
    return caminho


def arvore(pasta):
    """{caminho relativo: (sha256, modo)} de uma versão (arquivos e pastas; nunca segue link)."""
    saida = {}
    for atual, pastas, nomes in os.walk(pasta):
        for n in pastas + nomes:
            c = os.path.join(atual, n)
            st = os.lstat(c)
            rel = os.path.relpath(c, pasta)
            saida[rel] = (sha256(ler(c)) if stat.S_ISREG(st.st_mode) else None, stat.S_IMODE(st.st_mode), st.st_uid)
    return saida


# --- DNS local (autoritativo para a zona do teste) --------------------------------------------------


class DnsDoTeste:
    """Servidor DNS mínimo em UDP. O painel consulta com o Resolver de verdade do Node (node:dns),
    apontado para cá: a zona é do teste (ninguém é dono de loja-e2e.com.br), o protocolo é o real."""

    def __init__(self):
        self.zona = {}
        self.consultas = []
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.endereco = "127.0.0.1:%d" % self.sock.getsockname()[1]
        threading.Thread(target=self._laco, daemon=True).start()

    def _laco(self):
        while True:
            try:
                dados, origem = self.sock.recvfrom(4096)
                resposta = self._responder(dados)
                if resposta:
                    self.sock.sendto(resposta, origem)
            except OSError:
                return
            except Exception:  # pacote torto: ignora, como um servidor de verdade
                continue

    def _responder(self, dados):
        ident, flags, qd = struct.unpack(">HHH", dados[:6])
        if qd != 1:
            return None
        i, rotulos = 12, []
        while dados[i]:
            n = dados[i]
            rotulos.append(dados[i + 1 : i + 1 + n].decode("ascii").lower())
            i += 1 + n
        i += 1
        tipo, _classe = struct.unpack(">HH", dados[i : i + 4])
        pergunta = dados[12 : i + 4]
        nome = ".".join(rotulos)
        self.consultas.append((nome, tipo))
        registros = self.zona.get(nome)
        respostas = []
        if registros is not None and tipo == 1:
            respostas = [struct.pack(">HHHIH", 0xC00C, 1, 1, 5, 4) + socket.inet_aton(ip) for ip in registros.get("A", [])]
        if registros is not None and tipo == 28:
            respostas = [struct.pack(">HHHIH", 0xC00C, 28, 1, 5, 16) + socket.inet_pton(socket.AF_INET6, ip) for ip in registros.get("AAAA", [])]
        rcode = 0 if registros is not None else 3  # NXDOMAIN fora da zona
        cab = struct.pack(">HHHHHH", ident, 0x8000 | 0x0400 | (flags & 0x0100) | 0x0080 | rcode, 1, len(respostas), 0, 0)
        return cab + pergunta + b"".join(respostas)


# --- Servidores que ficam no lugar do nginx ---------------------------------------------------------


def porta_livre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    porta = s.getsockname()[1]
    s.close()
    return porta


class Estatico:
    """`python3 -m http.server` como nobody sobre o `current` (segue o link a cada pedido)."""

    def __init__(self, pasta):
        self.porta = porta_livre()
        self.proc = subprocess.Popen(
            ["runuser", "-u", "nobody", "--", PYTHON, "-m", "http.server", str(self.porta), "--bind", "127.0.0.1", "--directory", pasta],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=dict(AMBIENTE_MINIMO), cwd="/",
        )
        AMB.processos.append(self.proc)
        limite = time.time() + 10
        while True:
            try:
                socket.create_connection(("127.0.0.1", self.porta), timeout=1).close()
                break
            except OSError:
                if time.time() > limite:
                    raise Falha("o http.server não subiu")
                time.sleep(0.05)

    def curl(self, caminho):
        saida = os.path.join(AMB.trabalho, "curl-" + secrets.token_hex(4))
        r = subprocess.run(
            ["curl", "-sS", "--noproxy", "*", "-o", saida, "-w", "%{http_code}", f"http://127.0.0.1:{self.porta}{caminho}"],
            capture_output=True, text=True, timeout=30,
        )
        corpo = ler(saida) if os.path.exists(saida) else b""
        return r.stdout.strip(), corpo


def servidor_tls(pasta, certificado, chave):
    """HTTPS com o certificado que o certbot falso emitiu, servindo o `current` (para o "No ar")."""

    class Quieto(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quieto, directory=pasta))
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certificado, chave)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Vigia:
    """Lê current/index.html sem parar enquanto o agente troca a versão: nunca pode dar ENOENT."""

    def __init__(self, pasta):
        self.alvo = os.path.join(pasta, "current", "index.html")
        self.leituras, self.erros, self.parar = 0, [], threading.Event()
        self.th = threading.Thread(target=self._laco, daemon=True)
        self.th.start()

    def _laco(self):
        while not self.parar.is_set():
            try:
                with open(self.alvo, "rb") as f:
                    f.read()
                self.leituras += 1
            except OSError as e:
                self.erros.append(repr(e))

    def fim(self):
        self.parar.set()
        self.th.join(5)
        return self.leituras, self.erros


AMB = None


# =====================================================================================================
# Fase demo: o fluxo inteiro
# =====================================================================================================


def passo_build_demo():
    frase = frase_do_demo()
    telas = ["/servidor", "/servidor/novo", "/servidor/sites", f"/servidor/{uuid.uuid4()}", f"/servidor/sites/{uuid.uuid4()}"]
    for caminho in telas:
        status, cab, bruto = AMB.painel.pedir("GET", caminho)
        html = bruto.decode("utf-8", "replace")
        conferir(status == 200, f"GET {caminho} dá 200 (e não 307 para /login): o build é demo", f"HTTP {status} {cab.get('Location')}")
        conferir(frase in html, f"{caminho} mostra a frase do demo")
        conferir("<form" not in html, f"{caminho} não tem formulário")
        ips = set(re.findall(R_IPV4_NO_TEXTO, html))
        conferir(not ips, f"{caminho} não mostra IP", ips)
    status, _, bruto = AMB.painel.pedir("GET", "/api/painel/vps/estado")
    conferir(status in (401, 403), "GET /api/painel/vps/estado no demo dá 401/403", f"HTTP {status}: {bruto[:200]!r}")


def passo_arquivos_servidos():
    selo = constantes_do_selo()
    esperados = {
        "instalar.sh": selo["INSTALADOR_SHA256"],
        "dash_agent.py": selo["AGENTE_SHA256"],
        "dash_agent_root.py": selo["AGENTE_ROOT_SHA256"],
    }
    for nome, sha in esperados.items():
        status, _, bruto = AMB.painel.pedir("GET", f"/agente/v1/{nome}")
        conferir(status == 200, f"GET /agente/v1/{nome} dá 200")
        conferir(sha256(bruto) == sha, f"sha256 de {nome} servido pelo painel = constante selada")
        conferir(bruto == ler(os.path.join(PUBLICO, nome)), f"{nome} servido = arquivo do repositório")
    instalador = ler(os.path.join(PUBLICO, "instalar.sh"), "r")
    for var, arq in (("SHA_AGENTE", "dash_agent.py"), ("SHA_ROOT", "dash_agent_root.py"), ("SHA_DESINSTALAR", "desinstalar.sh")):
        m = re.search(r'^' + var + r'="([0-9a-f]{64})"$', instalador, re.M)
        conferir(bool(m) and m.group(1) == sha256(ler(os.path.join(PUBLICO, arq))), f"instalar.sh traz o sha256 certo de {arq}")
    for nome in ("desinstalar.sh", "rastreio.js"):
        status, _, _ = AMB.painel.pedir("GET", f"/agente/v1/{nome}")
        conferir(status == 200, f"GET /agente/v1/{nome} dá 200")


def passo_criar_servidor():
    d = semear_ok("servidor", nome=NOME_SERVIDOR)
    AMB.servidor_id, AMB.codigo, AMB.comando = d["servidorId"], d["codigo"], d["comando"]
    selo = constantes_do_selo()
    conferir(re.fullmatch(r"[A-Za-z0-9_-]{43}", AMB.codigo) is not None, "código de instalação com 43 caracteres base64url")
    conferir(f'echo "{selo["INSTALADOR_SHA256"]}  $T/instalar.sh" | sha256sum -c --quiet -' in AMB.comando,
             "o comando confere o sha256 do instalador com sha256sum -c", AMB.comando)
    conferir(f"printf '%s\\n' '{AMB.codigo}' |" in AMB.comando and f'"$T/instalar.sh" --painel {AMB.painel.url};' in AMB.comando,
             "o código vai pelo stdin e o sudo só recebe o caminho e --painel", AMB.comando)
    srv = linha(f"select status, enroll_code_hash, enroll_expires_at > now() as valido, agent_token_hash from vps_servers where id = {q(AMB.servidor_id)}")
    conferir(srv["status"] == "aguardando_agente", "banco: servidor em aguardando_agente", srv)
    conferir(srv["enroll_code_hash"] == sha256(AMB.codigo.encode()) and srv["valido"], "banco: só o sha256 do código, com validade")
    bruto = psql(f"select row_to_json(s)::text from vps_servers s where id = {q(AMB.servidor_id)}")
    conferir(AMB.codigo not in bruto, "o código em si não aparece em nenhuma coluna")
    info(f"servidor {AMB.servidor_id}")


def passo_instalar():
    # Como o comando do painel: baixa o instalador do painel e confere o sha256 ANTES de rodar.
    status, _, bruto = AMB.painel.pedir("GET", "/agente/v1/instalar.sh")
    conferir(status == 200, "instalador baixado do painel")
    destino = os.path.join(AMB.trabalho, "instalar.sh")
    with open(destino, "wb") as f:
        f.write(bruto)
    selo = constantes_do_selo()["INSTALADOR_SHA256"]
    r = subprocess.run(["sha256sum", "-c", "--quiet", "-"], input=f"{selo}  {destino}\n", capture_output=True, text=True)
    conferir(r.returncode == 0, "sha256sum -c do instalador baixado confere", r.stderr)
    os.makedirs(AMB.r("etc"), exist_ok=True)
    with open(AMB.r("etc/os-release"), "w") as f:
        f.write('PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n')
    ambiente = dict(AMBIENTE_MINIMO, DASH_SIMULAR="1", DASH_RAIZ=AMB.raiz, DASH_USUARIO_AGENTE=AMB.usuario)
    # Sem --local: o instalador baixa os .py do próprio painel (curl) e confere os sha256 selados.
    r = subprocess.run(
        ["bash", destino, "--painel", AMB.painel.url], input=AMB.codigo + "\n", capture_output=True, text=True,
        timeout=300, env=ambiente, cwd=AMB.raiz,
    )
    for texto in r.stdout.strip().splitlines()[-8:]:
        info("instalador: " + texto)
    conferir(r.returncode == 0, "instalar.sh saiu com 0", r.stderr[-3000:])
    conferir("Volte ao painel e confirme" in r.stdout, "o instalador pede a confirmação no painel")
    # Árvore, donos e modos (§7.1).
    esperado = {
        "opt/dash-agent": (0, 0o755), "opt/dash-agent/dash_agent.py": (0, 0o644), "opt/dash-agent/dash_agent_root.py": (0, 0o644),
        "var/lib/dash-agent": (AMB.uid, 0o700), "var/www/dash-funil": (AMB.uid, 0o755),
        "var/lib/dash-agent-root": (0, 0o755), "var/lib/dash-agent-root/acme": (0, 0o755), "var/lib/dash-agent-root/estado": (0, 0o700),
        "etc/dash-agent/travas.json": (0, 0o644), "etc/letsencrypt": (0, 0o755), "var/log/letsencrypt": (0, 0o700),
        "etc/letsencrypt/renewal-hooks/deploy/dash-agent": (0, 0o755), "usr/local/sbin/dash-agent": (0, 0o755),
    }
    for rel, (uid, modo) in esperado.items():
        st = os.lstat(AMB.r(rel))
        conferir(st.st_uid == uid and stat.S_IMODE(st.st_mode) == modo, f"{rel}: dono {uid}, modo {oct(modo)}",
                 f"dono {st.st_uid}, modo {oct(stat.S_IMODE(st.st_mode))}")
    for rel, arq in (("opt/dash-agent/dash_agent.py", "dash_agent.py"), ("opt/dash-agent/dash_agent_root.py", "dash_agent_root.py")):
        conferir(ler(AMB.r(rel)) == ler(os.path.join(PUBLICO, arq)), f"{rel} instalado = o do repositório")
    unit = ler(AMB.r("etc/systemd/system/dash-agent.service"), "r")
    conferir(f"User={AMB.usuario}" in unit and "ReadWritePaths=/var/www/dash-funil /var/lib/dash-agent" in unit,
             "unit do agente com o usuário do teste e ReadWritePaths")
    conferir(os.path.exists(AMB.r("etc/systemd/system/dash-agent-root.service.d/10-protecao.conf")), "drop-in de proteção do ajudante")
    log = ler(AMB.r("executados.log"), "r")
    for trecho in ("apt-get install -y -q --no-install-recommends nginx certbot", "systemctl restart dash-agent-root.service",
                   "systemctl enable dash-agent.service", "ufw allow 80/tcp", "ufw allow 443/tcp", "nginx -t"):
        conferir(trecho in log, f"executados.log registra: {trecho}")
    conferir("ufw allow 22" not in log and "sshd" not in log, "o instalador não toca a porta 22 nem o ssh")
    for x in [x for x in log.splitlines() if x.startswith("AVISO:")]:
        info("instalador (modo teste): " + x)
    cfg_st = os.lstat(AMB.r("var/lib/dash-agent/agente.json"))
    conferir(cfg_st.st_uid == AMB.uid and stat.S_IMODE(cfg_st.st_mode) == 0o600, "agente.json do dash-e2e, 0600")


def passo_registro():
    cfg = AMB.cfg()
    conferir(cfg["servidorId"] == AMB.servidor_id and cfg["painel"] == AMB.painel.url, "agente.json aponta para este servidor e painel")
    srv = linha(
        f"select status, agent_token_hash, enroll_code_hash, key_generation, hostname, os_name, agent_version from vps_servers where id = {q(AMB.servidor_id)}"
    )
    conferir(srv["status"] == "aguardando_confirmacao", "banco: aguardando_confirmacao", srv)
    conferir(srv["agent_token_hash"] == sha256(cfg["token"].encode()), "banco: só o sha256 do token que nasceu na VPS")
    conferir(srv["enroll_code_hash"] is None, "banco: o código foi consumido (uso único)")
    conferir(srv["key_generation"] == 1 and cfg["geracao"] == 1, "geração de chave 1 dos dois lados")
    conferir(srv["hostname"] == socket.gethostname() and srv["os_name"] == "Ubuntu 24.04.1 LTS", "hostname e SO relatados", srv)
    conferir(esperar_auditoria("vps.servidor.registrado", AMB.servidor_id), "auditoria gravada pelo after() do next start")
    corpo = json.dumps({"codigo": AMB.codigo, "tokenHash": "a" * 64, "agente": {"versao": "1.0.0", "hostname": "x", "so": "Ubuntu"}}).encode()
    status, _, bruto = AMB.painel.pedir("POST", "/api/agente/v1/registrar", corpo, {"Content-Type": "application/json"})
    conferir(status == 401 and AMB.painel.json(bruto) == {"ok": False, "error": "invalid_code"}, "o mesmo código de novo dá 401 invalid_code",
             f"HTTP {status} {bruto[:200]!r}")


def passo_ajudante_root():
    sock = AMB.iniciar_ajudante()
    st, pasta = os.lstat(sock), os.lstat(os.path.dirname(sock))
    conferir(st.st_uid == 0 and st.st_gid == AMB.gid and stat.S_IMODE(st.st_mode) == 0o660, "socket root:dash-e2e 0660",
             f"{st.st_uid}:{st.st_gid} {oct(stat.S_IMODE(st.st_mode))}")
    conferir(pasta.st_uid == 0 and pasta.st_gid == AMB.gid and stat.S_IMODE(pasta.st_mode) == 0o750, "pasta do socket root:dash-e2e 0750")
    pedido = json.dumps({"id": str(uuid.uuid4()), "op": "versao", "args": {}})
    script = (
        "import socket,sys;s=socket.socket(socket.AF_UNIX);s.settimeout(10);s.connect(sys.argv[1]);"
        "s.sendall(sys.argv[2].encode()+b'\\n');d=b''\n"
        "while True:\n b=s.recv(65536)\n if not b: break\n d+=b\nprint(d.decode())"
    )
    r = AMB.como_agente([PYTHON, "-I", "-c", script, sock, pedido])
    resposta = json.loads(r.stdout or "{}") if r.returncode == 0 else {}
    conferir(resposta.get("ok") is True and resposta.get("dados", {}).get("versao") == "1.0.0", "dash-e2e conversa com o ajudante", r.stderr)
    # Root também é "outro uid": o SO_PEERCRED do ajudante só atende o uid do agente.
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(10)
    s.connect(sock)
    try:
        s.sendall(pedido.encode() + b"\n")
        silencio = s.recv(100)
    except (BrokenPipeError, ConnectionResetError):
        silencio = b""
    finally:
        s.close()
    conferir(silencio == b"", "outro uid (root) conecta e recebe silêncio: SO_PEERCRED real")
    r = subprocess.run(["runuser", "-u", "nobody", "--", PYTHON, "-I", "-c", script, sock, pedido], capture_output=True, text=True, env=dict(AMBIENTE_MINIMO), cwd="/")
    conferir(r.returncode != 0 and "Permission" in r.stderr, "nobody nem chega ao socket (pasta 0750)", r.stderr[-300:])
    alvo = AMB.r("var/lib/dash-agent-root/acme/.well-known/acme-challenge/dash-e2e-escrita")
    r = AMB.como_agente(["touch", alvo])
    conferir(r.returncode != 0 and not os.path.exists(alvo), "dash-e2e não escreve no webroot ACME do root", r.stderr)
    r = AMB.como_agente(["touch", AMB.r("etc/nginx/sites-available/dash-e2e-intruso.conf")])
    conferir(r.returncode != 0, "dash-e2e não escreve em /etc/nginx")


def passo_antes_de_confirmar():
    AMB.uma_vez()
    srv = linha(f"select last_pulse_at is not null as pulsou, last_overview is not null as leu, status from vps_servers where id = {q(AMB.servidor_id)}")
    conferir(srv["pulsou"], "o pulso do agente chegou ao painel")
    codigo, d = semear("ler-agora", servidor=AMB.servidor_id)
    conferir(codigo == 3 and d.get("codigo") == "servidor_nao_pronto", "antes do 'é o meu' o painel não enfileira nada", d)
    conferir(psql(f"select count(*) from vps_jobs where server_id = {q(AMB.servidor_id)}") == "0", "nenhuma tarefa no banco")


def passo_confirmar():
    d = semear_ok("confirmar", servidor=AMB.servidor_id, resposta="sim")
    conferir(d.get("sitesReaplicados") == 0, "nenhum site para reaplicar ainda")
    srv = linha(f"select status, confirmed_at is not null as confirmado, confirmed_by from vps_servers where id = {q(AMB.servidor_id)}")
    conferir(srv["status"] == "ativo" and srv["confirmado"] and srv["confirmed_by"] == DONO, "banco: ativo, confirmado pelo dono", srv)


def passo_metricas():
    uptime_antes = float(ler("/proc/uptime", "r").split()[0])
    d = semear_ok("ler-agora", servidor=AMB.servidor_id)
    AMB.uma_vez()
    uptime_depois = float(ler("/proc/uptime", "r").split()[0])
    t = AMB.tarefa(d["tarefaId"])
    conferir(t["status"] == "concluida" and t["type"] == "servidor.coletar", "servidor.coletar concluída", t)
    srv = linha(
        f"select last_overview as v, last_overview_error as erro, extract(epoch from now() - last_overview_at) as idade, "
        f"capabilities from vps_servers where id = {q(AMB.servidor_id)}"
    )
    v = srv["v"]
    conferir(srv["erro"] is None and v is not None and srv["idade"] < 120, "leitura gravada agora, sem erro de parse", srv)
    meminfo = dict(x.split(":", 1) for x in ler("/proc/meminfo", "r").splitlines())
    total_mem = int(meminfo["MemTotal"].split()[0]) * 1024
    nucleos = sum(1 for x in ler("/proc/stat", "r").splitlines() if re.match(r"cpu\d+ ", x))
    vfs = os.statvfs("/")
    total_disco = vfs.f_blocks * vfs.f_frsize
    pretty = next((x.split("=", 1)[1].strip().strip('"') for x in ler("/etc/os-release", "r").splitlines() if x.startswith("PRETTY_NAME=")), None)
    info(f"lido: host={v.get('hostname')} cpu={v.get('cpuPercent')}% x{v.get('cpuCores')} mem={v.get('memory')} disco={v.get('disk')} uptime={v.get('uptimeSeconds')}")
    conferir(v["hostname"] == socket.gethostname(), "hostname = uname -n do container")
    conferir(v["os"] == pretty, "SO = PRETTY_NAME do /etc/os-release do container", v["os"])
    conferir(v["memory"]["totalBytes"] == total_mem and 0 < v["memory"]["usedBytes"] <= total_mem, "memória total = MemTotal do /proc/meminfo")
    conferir(v["cpuCores"] == nucleos, f"núcleos = {nucleos} linhas cpuN do /proc/stat", v["cpuCores"])
    conferir(v["cpuPercent"] is None or 0 <= v["cpuPercent"] <= 100, "CPU em porcentagem de 0 a 100")
    conferir(abs(v["disk"]["totalBytes"] - total_disco) <= 1024, "disco total = statvfs('/')", (v["disk"], total_disco))
    conferir(uptime_antes - 5 <= v["uptimeSeconds"] <= uptime_depois + 5, "tempo ativo = /proc/uptime", (uptime_antes, v["uptimeSeconds"], uptime_depois))
    conferir("users" not in v and "sampledAt" not in v, "sem a lista de usuários e sem sampledAt no banco")
    conferir(not any("usuário" in w.lower() for w in v.get("warnings", [])), "sem avisos sobre usuários")
    conferir((srv["capabilities"] or {}).get("nginx", {}).get("versao") == "1.24.0", "o pulso levou o estado do nginx (falso) pelo ajudante", srv["capabilities"])


def passo_criar_site():
    d = semear_ok("site", servidor=AMB.servidor_id, nome="Loja E2E", dominio=DOMINIO, www="sim", origem=ORIGEM)
    AMB.site_id, AMB.tarefa_configurar = d["siteId"], d["tarefaId"]
    conferir(d["slug"] == SLUG, "slug derivado do nome", d)
    dominios = linhas(f"select hostname, is_primary from vps_site_domains where site_id = {q(AMB.site_id)} order by hostname")
    conferir(dominios == [{"hostname": DOMINIO, "is_primary": True}, {"hostname": "www." + DOMINIO, "is_primary": False}], "banco: domínio e www", dominios)
    t = linha(f"select status, type, params, seq from vps_jobs where id = {q(AMB.tarefa_configurar)}")
    p = json.loads(t["params"])
    conferir(t["status"] == "pendente" and t["type"] == "site.configurar", "site.configurar pendente", t)
    conferir(p["tls"] is False and p["origemCheckout"] == ORIGEM and p["dominios"] == [DOMINIO, "www." + DOMINIO], "params assinados", p)
    site = linha(f"select status from vps_sites where id = {q(AMB.site_id)}")
    conferir(site["status"] == "configurando", "site em configurando")


def passo_dns():
    semear_ok("informar-ip", servidor=AMB.servidor_id, ip=IP_DO_SERVIDOR)
    AMB.dns.zona = {DOMINIO: {"A": [IP_ERRADO]}, "www." + DOMINIO: {"A": [IP_ERRADO]}}
    d = semear_ok("dns", site=AMB.site_id, servidor_dns=AMB.dns.endereco)
    conferir([x["status"] for x in d["dominios"]] == ["outro_ip", "outro_ip"] and not d["httpsPedido"], "DNS para outro IP: outro_ip, sem HTTPS", d)
    conferir("Cloudflare" in d["dominios"][0]["mensagem"], "a mensagem lembra da nuvem cinza da Cloudflare")
    conferir((DOMINIO, 1) in AMB.dns.consultas and (DOMINIO, 28) in AMB.dns.consultas, "o painel consultou A e AAAA no DNS do teste", AMB.dns.consultas)
    AMB.dns.zona = {DOMINIO: {"A": [IP_DO_SERVIDOR]}, "www." + DOMINIO: {"A": [IP_DO_SERVIDOR]}}
    d = semear_ok("dns", site=AMB.site_id, servidor_dns=AMB.dns.endereco)
    conferir([x["status"] for x in d["dominios"]] == ["ok", "ok"], "DNS certo: ok nos dois", d)
    conferir(d["httpsPedido"] is False, "sem nginx aplicado ainda, o HTTPS não é pedido (pré-condição)")
    dom = linhas(f"select dns_status, dns_detail->'a' as a from vps_site_domains where site_id = {q(AMB.site_id)}")
    conferir(all(x["dns_status"] == "ok" and x["a"] == [IP_DO_SERVIDOR] for x in dom), "banco: dns_status ok com o A visto", dom)


def passo_configurar():
    antes = AMB.recargas()
    AMB.uma_vez()
    t = AMB.tarefa(AMB.tarefa_configurar)
    conferir(t["status"] == "concluida", "site.configurar concluída", t)
    conferir(ler(AMB.vhost) == golden("http-www.conf"), "vhost gerado = golden http-www.conf")
    conferir(os.readlink(AMB.r("etc/nginx/sites-enabled", f"dash-{SLUG}.conf")) == f"../sites-available/dash-{SLUG}.conf", "vhost ligado em sites-enabled")
    conferir(AMB.recargas() == antes + 1, "nginx -t e reload (falsos) uma vez")
    conferir(AMB.current() == "vazio", "current -> vazio (página de espera)")
    conferir(ler(os.path.join(AMB.pasta_site, "vazio/index.html")) == pagina_de_espera(), "vazio/index.html = PAGINA_DE_ESPERA do painel")
    site = linha(f"select status, nginx_applied_at is not null as aplicado, nginx_error, reported_present, reported_release from vps_sites where id = {q(AMB.site_id)}")
    conferir(site["status"] == "ativo" and site["aplicado"] and site["nginx_error"] is None, "banco: site ativo com nginx aplicado", site)
    conferir(site["reported_present"] is True and site["reported_release"] == "vazio", "banco: o pulso informa a pasta e o 'vazio'", site)
    AMB.estatico = Estatico(os.path.join(AMB.pasta_site, "current"))
    status, corpo = AMB.estatico.curl("/")
    conferir(status == "200" and corpo == pagina_de_espera(), "curl no current servido por outro usuário (nobody): página de espera", status)


def passo_https():
    d = semear_ok("dns", site=AMB.site_id, servidor_dns=AMB.dns.endereco)
    conferir(d["httpsPedido"] is True, "DNS certo + nginx aplicado: o HTTPS é pedido sozinho", d)
    site = linha(f"select tls_status from vps_sites where id = {q(AMB.site_id)}")
    conferir(site["tls_status"] == "emitindo", "banco: tls emitindo")
    AMB.uma_vez()
    t = linha(f"select status, error from vps_jobs where site_id = {q(AMB.site_id)} and type = 'site.ssl_emitir' order by seq desc limit 1")
    conferir(t["status"] == "concluida", "site.ssl_emitir concluída", t)
    site = linha(f"select tls_status, tls_error, extract(epoch from tls_expires_at - now()) / 86400 as dias from vps_sites where id = {q(AMB.site_id)}")
    conferir(site["tls_status"] == "ativo" and site["tls_error"] is None and 85 < site["dias"] < 91, "banco: HTTPS ativo por ~90 dias", site)
    cert = AMB.r("etc/letsencrypt/live", f"dash-{SLUG}", "fullchain.pem")
    r = subprocess.run(["openssl", "x509", "-noout", "-checkend", "86400", "-ext", "subjectAltName", "-in", cert], capture_output=True, text=True)
    conferir(r.returncode == 0 and f"DNS:{DOMINIO}" in r.stdout and f"DNS:www.{DOMINIO}" in r.stdout, "certificado real (openssl) com os dois nomes", r.stdout)
    certbot = [x["argv"] for x in AMB.executados() if x["programa"] == "certbot" and x["argv"][:1] == ["certonly"]]
    esperado = [
        "certonly", "--webroot", "-w", "/var/lib/dash-agent-root/acme", "--cert-name", f"dash-{SLUG}", "--non-interactive", "--agree-tos",
        "--no-eff-email", "--keep-until-expiring", "--email", DONO, "-d", DOMINIO, "-d", "www." + DOMINIO,
    ]
    # No modo teste o webroot é o da raiz falsa; o resto do argv é o de produção.
    esperado[3] = AMB.r("var/lib/dash-agent-root/acme")
    ultimo = certbot[-1] if certbot else []
    conferir(ultimo == esperado, "argv exato do certbot", ultimo)
    conferir(not any("hook" in a for a in ultimo), "nenhum --*-hook no certbot")
    conferir(ler(AMB.vhost) == golden("https.conf"), "vhost = golden https.conf (80 redireciona, 443 com o certificado)")


def publicar(nome, versao, com_rastreio=False):
    caminho, arquivos = zip_do_site(nome, versao, com_rastreio)
    d = semear_ok("publicar", site=AMB.site_id, zip=caminho)
    AMB.versoes[versao] = d["versaoId"]
    AMB.indices[versao] = arquivos
    r = linha(f"select status, artifact_id, index_sha256, has_tracking from vps_releases where id = {q(d['versaoId'])}")
    conferir(r["status"] == "enviando" and r["artifact_id"] is not None, f"versão {versao}: enviando, com o ZIP no banco", r)
    AMB.artefatos[versao] = r["artifact_id"]
    conferir(r["index_sha256"] == sha256(arquivos["index.html"]), f"versão {versao}: index_sha256 do painel = sha256 do index.html")
    conferir(r["has_tracking"] is com_rastreio, f"versão {versao}: rastreio {'presente' if com_rastreio else 'ausente'} detectado")
    return d


def conferir_versao_no_disco(versao):
    ident = AMB.versoes[versao]
    pasta = os.path.join(AMB.pasta_site, "releases", ident)
    for rel, dados in AMB.indices[versao].items():
        conferir(ler(os.path.join(pasta, rel)) == dados, f"versão {versao}: {rel} igual ao do ZIP")
    conferir(not os.path.exists(os.path.join(pasta, "__MACOSX")), f"versão {versao}: __MACOSX ignorado")
    marcador = json.loads(ler(os.path.join(pasta, ".dash-release.json")))
    conferir(marcador["versaoId"] == ident, f"versão {versao}: marcador com o id certo")
    modos = arvore(pasta)
    ruins = {k: v for k, v in modos.items() if v[2] != AMB.uid or v[1] != (0o755 if v[0] is None else 0o644)}
    conferir(not ruins, f"versão {versao}: tudo do dash-e2e, pastas 0755 e arquivos 0644 (o nginx lê)", ruins)
    return pasta


def passo_publicar_a():
    d = publicar("site-a.zip", "A", com_rastreio=True)
    AMB.uma_vez()
    t = AMB.tarefa(d["tarefaId"])
    conferir(t["status"] == "concluida", "site.publicar concluída", t)
    conferir(AMB.current() == f"releases/{AMB.versoes['A']}", "current -> releases/<A>")
    AMB.pasta_a = conferir_versao_no_disco("A")
    AMB.arvore_a = arvore(AMB.pasta_a)
    r = linha(f"select status, is_active, artifact_id, file_count from vps_releases where id = {q(AMB.versoes['A'])}")
    conferir(r["status"] == "no_servidor" and r["is_active"], "banco: A no servidor e ativa", r)
    conferir(psql(f"select count(*) from vps_artifacts where id = {q(AMB.artefatos['A'])}") == "0",
             "o ZIP saiu do banco quando a publicação terminou", r)
    conferir(psql(f"select count(*) from vps_artifacts a join vps_releases r on r.artifact_id = a.id where r.site_id = {q(AMB.site_id)}") == "0",
             "nenhum artefato do site sobrou no banco")
    status, corpo = AMB.estatico.curl("/")
    conferir(status == "200" and corpo == AMB.indices["A"]["index.html"], "curl: 200 com o index.html do ZIP A")
    status, corpo = AMB.estatico.curl("/obrigado/")
    conferir(status == "200" and corpo == AMB.indices["A"]["obrigado/index.html"], "curl: /obrigado/ do ZIP A")


def passo_publicar_b():
    d = publicar("site-b.zip", "B")
    vigia = Vigia(AMB.pasta_site)
    AMB.uma_vez()
    leituras, erros = vigia.fim()
    conferir(AMB.tarefa(d["tarefaId"])["status"] == "concluida", "site.publicar de B concluída")
    conferir(AMB.current() == f"releases/{AMB.versoes['B']}", "current -> releases/<B>")
    conferir(leituras > 50 and not erros, f"troca atômica: {leituras} leituras de current/index.html durante a troca, nenhum erro", erros[:5])
    conferir_versao_no_disco("B")
    conferir(arvore(AMB.pasta_a) == AMB.arvore_a, "versão A intocada (imutável) depois de publicar B")
    ativas = linhas(f"select id from vps_releases where site_id = {q(AMB.site_id)} and is_active")
    conferir(ativas == [{"id": AMB.versoes["B"]}], "banco: só B ativa", ativas)
    status, corpo = AMB.estatico.curl("/")
    conferir(status == "200" and corpo == AMB.indices["B"]["index.html"], "curl: agora serve B")


def passo_voltar():
    antes = psql(f"select count(*) from vps_artifacts where workspace_id = (select workspace_id from vps_sites where id = {q(AMB.site_id)})")
    d = semear_ok("ativar", versao=AMB.versoes["A"])
    t = linha(f"select type, params from vps_jobs where id = {q(d['tarefaId'])}")
    conferir(t["type"] == "site.ativar_versao" and "artefatoId" not in t["params"], "voltar não reenvia o ZIP (só o id da versão)", t)
    vigia = Vigia(AMB.pasta_site)
    AMB.uma_vez()
    leituras, erros = vigia.fim()
    conferir(AMB.tarefa(d["tarefaId"])["status"] == "concluida", "site.ativar_versao concluída")
    conferir(AMB.current() == f"releases/{AMB.versoes['A']}", "current -> releases/<A> de novo")
    conferir(leituras > 50 and not erros, f"troca atômica: {leituras} leituras, nenhum erro", erros[:5])
    ativas = linhas(f"select id from vps_releases where site_id = {q(AMB.site_id)} and is_active")
    conferir(ativas == [{"id": AMB.versoes["A"]}], "banco: A ativa de novo", ativas)
    conferir(psql(f"select count(*) from vps_artifacts where workspace_id = (select workspace_id from vps_sites where id = {q(AMB.site_id)})") == antes,
             "nenhum ZIP novo no banco")
    status, corpo = AMB.estatico.curl("/")
    conferir(status == "200" and corpo == AMB.indices["A"]["index.html"], "curl: serve A de novo")


def passo_no_ar():
    live = AMB.r("etc/letsencrypt/live", f"dash-{SLUG}")
    srv = servidor_tls(os.path.join(AMB.pasta_site, "current"), os.path.join(live, "fullchain.pem"), os.path.join(live, "privkey.pem"))
    try:
        d = semear_ok("conferir", site=AMB.site_id, porta=srv.server_address[1], ca=os.path.join(live, "fullchain.pem"))
    finally:
        srv.shutdown()
    conferir(d["noAr"]["estado"] == "ok", "No ar: o painel buscou / por HTTPS (certificado verificado) e o sha256 bateu com a versão ativa", d)
    conferir(d["noAr"]["url"] == f"https://{DOMINIO}/", "a conferência usa o domínio principal com https")


def passo_poda():
    for versao in ("C", "D", "E", "F"):
        d = publicar(f"site-{versao.lower()}.zip", versao)
        AMB.uma_vez()
        conferir(AMB.tarefa(d["tarefaId"])["status"] == "concluida", f"publicar {versao} concluída")
    conferir(AMB.current() == f"releases/{AMB.versoes['F']}", "current -> F")
    no_disco = sorted(n for n in os.listdir(os.path.join(AMB.pasta_site, "releases")))
    esperadas = sorted(AMB.versoes[v] for v in ("B", "C", "D", "E", "F"))
    conferir(no_disco == esperadas, "poda: ficam a ativa + as 4 mais novas (A, a mais velha, saiu)", no_disco)
    rel = {x["id"]: x for x in linhas(f"select id, status, is_active from vps_releases where site_id = {q(AMB.site_id)}")}
    conferir(rel[AMB.versoes["A"]]["status"] == "removida" and not rel[AMB.versoes["A"]]["is_active"], "banco: A virou removida", rel[AMB.versoes["A"]])
    conferir(all(rel[AMB.versoes[v]]["status"] == "no_servidor" for v in "BCDEF"), "banco: B a F no servidor")
    codigo, d = semear("ativar", versao=AMB.versoes["A"])
    conferir(codigo == 3 and d["codigo"] == "estado_invalido", "voltar para a versão podada é recusado pelo painel", d)


def passo_reentrega():
    cfg = AMB.cfg()
    # (a) A resposta do pulso se perde: o teste "é" esse pulso e joga fora a tarefa que recebeu.
    d = semear_ok("reaplicar", site=AMB.site_id)
    status, _, dados, _, _, _ = pulso_assinado(AMB, cfg)
    conferir(status == 200 and (dados.get("tarefa") or {}).get("id") == d["tarefaId"], "um pulso levou a tarefa (e a resposta 'se perdeu')", dados)
    conferir(AMB.tarefa(d["tarefaId"])["status"] == "entregue", "banco: tarefa entregue")
    antes = AMB.recargas()
    AMB.uma_vez()
    t = AMB.tarefa(d["tarefaId"])
    conferir(t["status"] == "concluida", "o agente recebeu a MESMA tarefa de novo e concluiu", t)
    conferir(AMB.recargas() == antes + 1, "executou uma vez só (um reload)")
    diario = json.loads(ler(AMB.r("var/lib/dash-agent/diario", d["tarefaId"] + ".json")))
    conferir(diario.get("estado") == "concluida" and diario.get("enviado") is True, "diário: concluída e enviada", diario)
    # (b) O resultado "não chegou": o banco volta a tarefa para entregue, como se o POST tivesse caído.
    resultado = t["result"]
    psql(f"update vps_jobs set status = 'entregue', finished_at = null, result = null, error = null where id = {q(d['tarefaId'])}")
    time.sleep(1.2)
    antes = AMB.recargas()
    AMB.uma_vez()
    t = AMB.tarefa(d["tarefaId"])
    conferir(t["status"] == "concluida" and t["result"] == resultado, "reentrega: o diário reenviou o mesmo resultado", t)
    conferir(AMB.recargas() == antes, "reentrega com diário não executou de novo (nenhum reload)")
    conferir(ler(AMB.vhost) == golden("https.conf"), "vhost continua igual ao golden https.conf")


def passo_protocolo():
    cfg = AMB.cfg()
    status, _, dados, seq, cab, corpo = pulso_assinado(AMB, cfg)
    conferir(status == 200 and dados.get("ok") is True, "pulso assinado pelo teste (implementação própria do HMAC) aceito", dados)
    status, _, bruto = AMB.painel.pedir("POST", "/api/agente/v1/pulso", corpo, cab)
    dados = AMB.painel.json(bruto)
    conferir(status == 409 and dados == {"ok": False, "error": "replayed", "ultimaSeq": seq}, "o mesmo pedido de novo: 409 replayed com ultimaSeq (número)", dados)
    falsa = assinar_pedido(cfg, "POST", "/api/agente/v1/pulso", seq + 1, corpo)
    falsa = ("0" if falsa[0] != "0" else "1") + falsa[1:]
    status, cabecalhos, dados, _, _, _ = pulso_assinado(AMB, cfg, seq=seq + 1, assinatura=falsa, esperar_freio=False)
    conferir(eh_marca_dash(status, cabecalhos, dados), "assinatura falsa: 401 com WWW-Authenticate: Dash-HMAC", (status, dict(cabecalhos), dados))
    status, cabecalhos, dados, _, _, _ = pulso_assinado(AMB, cfg, seq=seq + 2, token=secrets.token_urlsafe(32), esperar_freio=False)
    conferir(eh_marca_dash(status, cabecalhos, dados), "token de outro: o mesmo 401 com a marca", (status, dados))
    futuro = int(time.time() * 1000) + 10 * 60_000
    status, _, dados, _, _, _ = pulso_assinado(AMB, cfg, seq=futuro, esperar_freio=False)
    agora = int(time.time() * 1000)
    conferir(status == 409 and dados.get("error") == "clock_skew" and dados.get("ultimaSeq") == seq, "relógio 10 min adiantado: 409 clock_skew com ultimaSeq", dados)
    conferir(type(dados.get("agora")) is int and abs(dados["agora"] - agora) < 10_000, "o 409 traz a hora do painel para o agente se acertar", dados)
    conferir(int(psql(f"select agent_last_seq from vps_servers where id = {q(AMB.servidor_id)}")) == seq, "nenhum pedido recusado avançou a seq")
    AMB.uma_vez()


def passo_zip_slip():
    if os.path.lexists(FORA_DA_RAIZ):
        os.unlink(FORA_DA_RAIZ)
    caminho = zip_slip()
    antes = psql(f"select count(*) from vps_releases where site_id = {q(AMB.site_id)}")
    codigo, d = semear("publicar", site=AMB.site_id, zip=caminho)
    problemas = d.get("problemas") or []
    conferir(codigo == 3 and any(".." in p.get("arquivo", "") for p in problemas), "painel: inspecionarZip recusa o ZIP com '..'", d)
    info("motivo no painel: " + "; ".join(f"{p['arquivo']}: {p['motivo']}" for p in problemas)[:300])
    conferir(psql(f"select count(*) from vps_releases where site_id = {q(AMB.site_id)}") == antes, "nenhuma versão criada")
    atual = AMB.current()
    releases = sorted(os.listdir(os.path.join(AMB.pasta_site, "releases")))
    d = semear_ok("publicar-forjado", site=AMB.site_id, zip=caminho)
    conferir(d["painelRecusaria"] is True, "a tarefa forjada pulou a inspeção que recusaria o ZIP")
    AMB.uma_vez()
    t = AMB.tarefa(d["tarefaId"])
    conferir(t["status"] == "falhou" and (t["error"] or "").startswith("zip_nome"), "agente: extração recusada (zip_nome), mesmo com a tarefa assinada", t)
    r = linha(f"select status, error from vps_releases where id = {q(d['versaoId'])}")
    conferir(r["status"] == "falhou", "banco: versão forjada falhou", r)
    conferir(psql(f"select count(*) from vps_artifacts where id = {q(d['artefatoId'])}") == "0", "o ZIP forjado saiu do banco")
    conferir(not os.path.lexists(FORA_DA_RAIZ), f"{FORA_DA_RAIZ} não foi criado")
    achados = [os.path.join(a, n) for a, _, ns in os.walk(AMB.raiz) for n in ns if n == os.path.basename(FORA_DA_RAIZ)]
    conferir(not achados, "nenhum arquivo do zip slip em lugar nenhum da raiz", achados)
    conferir(sorted(os.listdir(os.path.join(AMB.pasta_site, "releases"))) == releases, "nenhuma pasta nova (nem .tmp-*) em releases")
    conferir(AMB.current() == atual, "current não mudou")


def passo_injecao():
    d = semear_ok("injecao", servidor=AMB.servidor_id)
    for x in d["resultados"]:
        conferir(x["recusado"] and x.get("codigo") == "dados_invalidos", f"painel recusa domínio/origem {x['dominio']!r} / {x['origem']!r}", x)
    conferir(d["tarefasAntes"] == d["tarefasDepois"], "nenhuma tarefa criada pelas tentativas")
    vhost = ler(AMB.vhost)
    seq_tarefa = AMB.estado_do_agente()["ultimaSeqTarefa"]
    antes = AMB.recargas()
    params = {
        "siteId": AMB.site_id, "slug": SLUG, "dominios": [DOMINIO + ";include /etc/shadow", "www." + DOMINIO],
        "principal": DOMINIO + ";include /etc/shadow", "origemCheckout": ORIGEM, "checkout": None, "tls": True,
    }
    f = semear_ok("forjar-tarefa", servidor=AMB.servidor_id, tipo="site.configurar", site=AMB.site_id, params=json.dumps(params))
    conferir(f["painelRecusou"] is not None, "o painel (montarParams) recusaria estes parâmetros", f)
    AMB.uma_vez()
    t = AMB.tarefa(f["tarefaId"])
    conferir(t["status"] == "falhou" and (t["error"] or "").startswith("params_invalidos"), "agente: tarefa assinada com injeção recusada (params_invalidos)", t)
    params = {"siteId": AMB.site_id, "slug": "../../etc"}
    f = semear_ok("forjar-tarefa", servidor=AMB.servidor_id, tipo="site.remover", site=AMB.site_id, params=json.dumps(params))
    AMB.uma_vez()
    t = AMB.tarefa(f["tarefaId"])
    conferir(t["status"] == "falhou" and (t["error"] or "").startswith("params_invalidos"), "agente: slug '../../etc' recusado", t)
    conferir(ler(AMB.vhost) == vhost and AMB.recargas() == antes, "nada mudou no nginx")
    conferir(os.path.isdir(AMB.pasta_site) and os.path.isdir(AMB.r("etc")), "nenhuma pasta removida")
    conferir(AMB.estado_do_agente()["ultimaSeqTarefa"] == seq_tarefa, "tarefa recusada não avança a seq do agente")
    pedido = json.dumps({"id": str(uuid.uuid4()), "op": "nginx.aplicar", "args": {
        "slug": SLUG, "dominios": [DOMINIO + ";return 200"], "principal": DOMINIO + ";return 200",
        "origemCheckout": ORIGEM, "checkout": None, "tls": False}})
    script = (
        "import socket,sys;s=socket.socket(socket.AF_UNIX);s.settimeout(10);s.connect(sys.argv[1]);"
        "s.sendall(sys.argv[2].encode()+b'\\n');d=b''\n"
        "while True:\n b=s.recv(65536)\n if not b: break\n d+=b\nprint(d.decode())"
    )
    r = AMB.como_agente([PYTHON, "-I", "-c", script, AMB.r("run/dash-agent-root/root.sock"), pedido])
    resposta = json.loads(r.stdout or "{}") if r.returncode == 0 else {}
    conferir(resposta.get("ok") is False and resposta.get("erro") == "args_invalidos", "ajudante root recusa o mesmo domínio direto no socket", resposta)
    conferir(ler(AMB.vhost) == vhost, "vhost intacto")


def passo_adulteracao():
    vhost = ler(AMB.vhost)
    antes = AMB.recargas()
    seq_tarefa = AMB.estado_do_agente()["ultimaSeqTarefa"]
    d = semear_ok("reaplicar", site=AMB.site_id)
    # Quem só tem o banco (sem a VPS_CHAVE_MESTRA) troca o domínio da tarefa já assinada.
    psql(f"update vps_jobs set params = replace(params, {q(DOMINIO)}, 'loja-e2f.com.br') where id = {q(d['tarefaId'])}")
    conferir("loja-e2f.com.br" in linha(f"select params from vps_jobs where id = {q(d['tarefaId'])}")["params"], "params adulterados no banco")
    AMB.uma_vez()
    t = AMB.tarefa(d["tarefaId"])
    conferir(t["status"] == "falhou" and (t["error"] or "").startswith("assinatura_invalida"), "agente: falhou com assinatura_invalida", t)
    conferir(ler(AMB.vhost) == vhost and AMB.recargas() == antes, "disco intacto: vhost igual e nenhum reload")
    conferir(AMB.estado_do_agente()["ultimaSeqTarefa"] == seq_tarefa, "assinatura inválida não avança a seq do agente")
    conferir(not os.path.exists(AMB.r("var/lib/dash-agent/diario", d["tarefaId"] + ".json")), "o id da tarefa falsa não vira registro no diário")


def passo_concorrencia():
    d = semear_ok("sites-paralelos", servidor=AMB.servidor_id, quantos=10, prefixo="paralelo")
    seqs = [t["seq"] for t in d["tarefas"]]
    conferir(len(seqs) == 10 and len(set(seqs)) == 10 and seqs == list(range(seqs[0], seqs[0] + 10)), "10 enfileiramentos em paralelo: 10 seqs únicas e seguidas", seqs)
    # No banco, sem o freio do pulso: duas reivindicações ao mesmo tempo, cada uma segurando a trava 1 s.
    r = semear_ok("reivindicar-paralelo", servidor=AMB.servidor_id, quantos=2)
    ids = [x["id"] for x in r["entregues"] if x]
    info(f"duas reivindicações simultâneas no banco: seqs {[x['seq'] for x in r['entregues'] if x]} em {r['ms']} ms")
    conferir(len(ids) == 2 and len(set(ids)) == 2, "SKIP LOCKED: duas reivindicações simultâneas levam tarefas diferentes, nunca a mesma", r)
    conferir(r["ms"] < 1800, "e nenhuma esperou a trava da outra (perto de 1 s, não de 2 s)", r["ms"])
    # Por HTTP: dois pulsos ao mesmo tempo, com seqs diferentes e assinaturas válidas.
    cfg = AMB.cfg()
    time.sleep(1.2)
    base = proxima_seq(cfg["servidorId"])
    barreira, saidas = threading.Barrier(2), [None, None]

    def pulsar(i):
        barreira.wait()
        saidas[i] = pulso_assinado(AMB, cfg, seq=base + i, esperar_freio=False)

    ths = [threading.Thread(target=pulsar, args=(i,)) for i in range(2)]
    for th in ths:
        th.start()
    for th in ths:
        th.join(30)
    resumo = [(s[0], (s[2] or {}).get("error"), ((s[2] or {}).get("tarefa") or {}).get("id")) for s in saidas]
    info(f"dois pulsos ao mesmo tempo: {resumo}")
    com_tarefa = [x[2] for x in resumo if x[2]]
    conferir(len(com_tarefa) == 1 and com_tarefa[0] in ids, "só um dos dois pulsos simultâneos recebeu tarefa (a já entregue, reentregue)", resumo)
    conferir(psql(f"select count(*) from vps_jobs where server_id = {q(AMB.servidor_id)} and status = 'entregue'") == "2", "banco: nenhuma reivindicação a mais")
    AMB.uma_vez()
    estados = linhas(f"select status from vps_jobs where id in ({', '.join(q(t['id']) for t in d['tarefas'])})")
    conferir(all(x["status"] == "concluida" for x in estados), "o agente concluiu as 10 (uma por vez, as entregues primeiro)", estados)
    vhosts = [n for n in os.listdir(AMB.r("etc/nginx/sites-available")) if n.startswith("dash-paralelo-")]
    conferir(len(vhosts) == 10, "10 vhosts gerados", vhosts)


def passo_revogar_token():
    velho = AMB.cfg()
    d = semear_ok("nova-instalacao", servidor=AMB.servidor_id)
    r = AMB.agente("registrar", "--painel", AMB.painel.url, entrada=d["codigo"] + "\n")
    conferir(r.returncode == 0, "reconectar: registrar como dash-e2e com o código novo pelo stdin", r.stderr[-1000:])
    novo = AMB.cfg()
    srv = linha(f"select status, key_generation, agent_token_hash from vps_servers where id = {q(AMB.servidor_id)}")
    conferir(novo["token"] != velho["token"] and novo["geracao"] == 2 and srv["key_generation"] == 2, "token novo e geração 2", srv)
    conferir(srv["agent_token_hash"] == sha256(novo["token"].encode()) and srv["status"] == "aguardando_confirmacao", "banco: token novo, aguardando confirmação")
    status, cabecalhos, dados, _, _, _ = pulso_assinado(AMB, velho)
    conferir(eh_marca_dash(status, cabecalhos, dados), "o token revogado leva 401 com WWW-Authenticate: Dash-HMAC", (status, dict(cabecalhos), dados))
    AMB.uma_vez()
    c = semear_ok("confirmar", servidor=AMB.servidor_id, resposta="sim")
    conferir(c["sitesReaplicados"] == 11, "confirmar de novo reaplica os 11 sites", c)
    AMB.uma_vez()
    abertas = psql(f"select count(*) from vps_jobs where server_id = {q(AMB.servidor_id)} and status in ('pendente', 'entregue')")
    conferir(abertas == "0", "os 11 site.configurar rodaram")
    conferir(ler(AMB.vhost) == golden("https.conf"), "o site com HTTPS continua igual ao golden https.conf")


def passo_remover_site():
    d = semear_ok("remover-site", site=AMB.site_id, confirmacao=DOMINIO)
    AMB.uma_vez()
    conferir(AMB.tarefa(d["tarefaId"])["status"] == "concluida", "site.remover concluída")
    conferir(not os.path.exists(AMB.vhost) and not os.path.lexists(AMB.r("etc/nginx/sites-enabled", f"dash-{SLUG}.conf")), "vhost e link saíram do nginx")
    conferir(not os.path.exists(AMB.pasta_site), "a pasta do site saiu de /var/www/dash-funil")
    conferir(any(n.startswith(SLUG + "-") for n in os.listdir(AMB.r("var/www/dash-funil/.lixeira"))), "foi para a .lixeira")
    conferir(not os.path.exists(AMB.r("etc/letsencrypt/live", f"dash-{SLUG}")), "certificado removido (certbot delete)")
    site = linha(f"select deleted_at is not null as removido from vps_sites where id = {q(AMB.site_id)}")
    conferir(site["removido"], "banco: site removido")
    conferir(psql(f"select count(*) from vps_site_domains where site_id = {q(AMB.site_id)}") == "0", "banco: domínios apagados")
    conferir(psql(f"select count(*) from vps_releases where site_id = {q(AMB.site_id)} and is_active") == "0", "banco: nenhuma versão ativa")
    conferir(esperar_auditoria("vps.site.removido", AMB.site_id), "auditoria da remoção gravada pelo after()")


def passo_remover_servidor():
    cfg = AMB.cfg()
    semear_ok("remover-servidor", servidor=AMB.servidor_id, confirmacao=NOME_SERVIDOR)
    srv = linha(f"select status, agent_token_hash, deleted_at is not null as removido from vps_servers where id = {q(AMB.servidor_id)}")
    conferir(srv["status"] == "revogado" and srv["agent_token_hash"] is None and srv["removido"], "banco: revogado, sem token", srv)
    status, cabecalhos, dados, _, _, _ = pulso_assinado(AMB, cfg)
    conferir(eh_marca_dash(status, cabecalhos, dados), "pedido com o token do servidor removido: 401 com a marca", (status, dados))
    AMB.uma_vez(esperado=3)
    conferir(os.path.exists(AMB.r("var/lib/dash-agent/revogado")), "o agente gravou 'revogado'")
    AMB.uma_vez(esperado=3)


def fase_demo(args):
    global AMB
    AMB = Ambiente(args)
    AMB.dns = DnsDoTeste()
    try:
        REL.passo("O build A é demo: as 5 telas mostram só a frase, sem formulário nem IP", passo_build_demo, critico=False)
        REL.passo("O painel serve os arquivos do agente com os sha256 selados", passo_arquivos_servidos, critico=False)
        REL.passo("Criar servidor no painel e o comando de instalação", passo_criar_servidor)
        REL.passo("Instalador em modo teste (baixado do painel, código pelo stdin, usuário dash-e2e)", passo_instalar)
        REL.passo("Registro com o código de uso único", passo_registro)
        REL.passo("Ajudante root como root: SO_PEERCRED real e webroot fora do alcance do agente", passo_ajudante_root)
        REL.passo("Antes do 'é o meu' nenhuma tarefa sai", passo_antes_de_confirmar)
        REL.passo("Confirmar 'é o meu'", passo_confirmar)
        REL.passo("Pulso com as métricas reais do container (parseVpsOverviewOutput)", passo_metricas)
        REL.passo("Criar site com domínio", passo_criar_site)
        REL.passo("Conferência de DNS (Resolver real do Node contra um DNS local com a zona do teste)", passo_dns)
        REL.passo("site.configurar: vhost igual ao golden e página de espera", passo_configurar)
        REL.passo("HTTPS pedido sozinho com o DNS certo (certbot falso, certificado real)", passo_https)
        REL.passo("Publicar ZIP: versão imutável no disco", passo_publicar_a)
        REL.passo("Ativar a nova versão com troca atômica do link current", passo_publicar_b)
        REL.passo("Voltar para a versão anterior", passo_voltar)
        REL.passo("No ar: conferência pelo lado de fora com o certificado emitido", passo_no_ar, critico=False)
        REL.passo("Poda: a ativa + as 4 mais novas", passo_poda)
        REL.passo("Reentrega idempotente (pulso perdido e resultado perdido)", passo_reentrega)
        REL.passo("Replay, assinatura falsa e relógio fora", passo_protocolo, critico=False)
        REL.passo("ZIP com zip slip recusado no painel e no agente", passo_zip_slip, critico=False)
        REL.passo("Parâmetro com injeção recusado no painel, no agente e no ajudante root", passo_injecao, critico=False)
        REL.passo("Adulteração dos params no banco: assinatura_invalida e disco intacto", passo_adulteracao, critico=False)
        REL.passo("Concorrência real: 10 enfileiramentos paralelos, SKIP LOCKED e 2 pulsos simultâneos", passo_concorrencia, critico=False)
        REL.passo("Token revogado (reconectar) leva 401 com a marca; confirmar reaplica os sites", passo_revogar_token)
        REL.passo("Remover site", passo_remover_site)
        REL.passo("Remover servidor: o agente sai com 3", passo_remover_servidor)
    finally:
        AMB.encerrar()
        if os.path.lexists(FORA_DA_RAIZ):
            os.unlink(FORA_DA_RAIZ)


# =====================================================================================================
# Fase protegido: build B, com Supabase inalcançável
# =====================================================================================================


def fase_protegido(args):
    painel = Painel(args.painel)

    def login():
        status, cab, _ = painel.pedir("GET", "/servidor")
        conferir(status == 307 and "/login" in (cab.get("Location") or ""), "GET /servidor dá 307 para /login", (status, cab.get("Location")))
        status, _, _ = painel.pedir("GET", "/legal/termos")
        conferir(status == 200, "GET /legal/termos dá 200 sem login")
        status, _, bruto = painel.pedir("GET", "/agente/v1/instalar.sh")
        conferir(status == 200 and sha256(bruto) == constantes_do_selo()["INSTALADOR_SHA256"], "GET /agente/v1/instalar.sh dá 200 com o sha256 selado")

    def agente_sem_supabase():
        status, _, bruto = painel.pedir("POST", "/api/agente/v1/pulso", b"{}", {"Content-Type": "application/json"})
        conferir(status == 400 and painel.json(bruto) == {"ok": False, "error": "invalid_request"}, "pulso sem cabeçalhos: 400 invalid_request", (status, bruto[:200]))
        corpo = corpo_do_pulso()
        seq = int(time.time() * 1000)
        cab = {
            "Authorization": "Bearer " + secrets.token_urlsafe(32), "X-Dash-Servidor": str(uuid.uuid4()), "X-Dash-Seq": str(seq),
            "X-Dash-Assinatura": "v1=" + secrets.token_hex(32), "Content-Type": "application/json",
        }
        inicio = time.monotonic()
        status, cabecalhos, bruto = painel.pedir("POST", "/api/agente/v1/pulso", corpo, cab)
        tempo = time.monotonic() - inicio
        conferir(eh_marca_dash(status, cabecalhos, painel.json(bruto)), "cabeçalhos no formato e assinatura falsa: 401 JSON com Dash-HMAC", (status, bruto[:200]))
        conferir(tempo < 2, f"respondeu em {tempo:.2f} s (o proxy não foi ao e2e.invalid)")

    REL.passo("Build B: /servidor pede login; /legal e /agente são públicos", login, critico=False)
    REL.passo("Build B: rotas do agente sem passar pelo Supabase", agente_sem_supabase, critico=False)


def main():
    global REL
    cli = argparse.ArgumentParser()
    cli.add_argument("fase", choices=("demo", "protegido"))
    cli.add_argument("--painel", required=True)
    cli.add_argument("--raiz")
    cli.add_argument("--trabalho")
    cli.add_argument("--usuario")
    cli.add_argument("--log-next")
    args = cli.parse_args()
    REL = Relatorio(args.fase)
    if args.fase == "demo":
        if os.geteuid() != 0:
            print("A fase demo roda como root (runuser, ajudante root).", file=sys.stderr)
            return 2
        fase_demo(args)
    else:
        fase_protegido(args)
    codigo = REL.resumo()
    if codigo and args.log_next and os.path.exists(args.log_next):
        print("\n----- últimas linhas do next start -----")
        print(ler(args.log_next, "r")[-4000:])
    return codigo


if __name__ == "__main__":
    sys.exit(main())
