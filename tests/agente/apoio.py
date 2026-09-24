"""Apoio dos testes do agente: carrega os .py de public/agente/v1, monta raízes de teste e sobe
um painel FALSO que confere cada pedido com uma implementação própria do §4 (não usa o código
do agente para conferir o agente).
"""
import base64
import hashlib
import hmac
import importlib.util
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode = True  # nada de __pycache__ dentro de public/ (a pasta é servida pela Vercel)

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, "..", ".."))
PUBLICO = os.path.join(REPO, "public", "agente", "v1")
FALSOS = os.path.join(AQUI, "falsos")
# Vetores do protocolo, casos de validação e goldens do nginx ficam num lugar só, lido pelos dois
# lados: o vitest confere o TS contra estes arquivos e o unittest confere o Python.
FIXTURES_TS = os.path.join(REPO, "tests", "fixtures", "vps")
GOLDEN = os.path.join(FIXTURES_TS, "golden")
P_PEDIDO, P_TAREFA = "dash-vps-pedido-v1", "dash-vps-tarefa-v1"


def carregar(nome_modulo, arquivo):
    spec = importlib.util.spec_from_file_location(nome_modulo, os.path.join(PUBLICO, arquivo))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


agente = carregar("dash_agent_teste", "dash_agent.py")
root = carregar("dash_agent_root_teste", "dash_agent_root.py")


def b64url(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def ler_json(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


NGINX_CONF = "events { worker_connections 768; }\nhttp {\n  include /etc/nginx/conf.d/*.conf;\n  include /etc/nginx/sites-enabled/*;\n}\n"
CABECALHOS = (
    'add_header X-Content-Type-Options "nosniff" always;\n'
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n'
    'add_header X-Frame-Options "SAMEORIGIN" always;\n'
)
TLS = "ssl_protocols TLSv1.2 TLSv1.3;\nssl_session_tickets off;\n"


def nova_raiz(prefixo="dash-agente-"):
    """Raiz de teste com a árvore do §7.1 (o que o instalador criaria) e um nginx.conf mínimo."""
    r = tempfile.mkdtemp(prefix=prefixo)
    os.chmod(r, 0o755)
    for pasta, modo in (
        ("var/lib/dash-agent", 0o700), ("var/lib/dash-agent/diario", 0o700), ("var/lib/dash-agent/tmp", 0o700),
        ("var/www/dash-funil", 0o755), ("etc/dash-agent", 0o755),
        ("var/lib/dash-agent-root", 0o755), ("var/lib/dash-agent-root/acme", 0o755), ("var/lib/dash-agent-root/estado", 0o700),
        ("etc/nginx/sites-available", 0o755), ("etc/nginx/sites-enabled", 0o755), ("etc/nginx/snippets", 0o755),
        ("etc/nginx/conf.d", 0o755), ("etc/letsencrypt/live", 0o755), ("run/dash-agent-root", 0o750),
    ):
        os.makedirs(os.path.join(r, pasta), exist_ok=True)
        os.chmod(os.path.join(r, pasta), modo)
    escrever(os.path.join(r, "etc/nginx/nginx.conf"), NGINX_CONF)
    escrever(os.path.join(r, "etc/nginx/snippets/dash-agent-cabecalhos.conf"), CABECALHOS)
    escrever(os.path.join(r, "etc/nginx/snippets/dash-agent-tls.conf"), TLS)
    escrever(os.path.join(r, "etc/dash-agent/travas.json"), '{"pausado":false,"somenteLeitura":false}\n')
    return r


def escrever(caminho, texto, modo=0o644):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(texto)
    os.chmod(caminho, modo)


def apagar_raiz(r):
    shutil.rmtree(r, ignore_errors=True)


def executados(r):
    caminho = os.path.join(r, "executados.jsonl")
    if not os.path.exists(caminho):
        return []
    with open(caminho, encoding="utf-8") as f:
        return [json.loads(linha) for linha in f if linha.strip()]


def retrato(pasta):
    """Tudo o que existe sob a pasta: caminho -> (tipo, modo, conteúdo ou alvo do link)."""
    saida = {}
    for base, pastas, arquivos in os.walk(pasta):
        for n in pastas + arquivos:
            c = os.path.join(base, n)
            st = os.lstat(c)
            if os.path.islink(c):
                saida[c] = ("link", os.readlink(c))
            elif os.path.isdir(c):
                saida[c] = ("pasta", st.st_mode & 0o7777)
            else:
                with open(c, "rb") as f:
                    saida[c] = ("arquivo", st.st_mode & 0o7777, hashlib.sha256(f.read()).hexdigest())
    return saida


def args_agente(r, **extra):
    import argparse

    base = dict(modo_teste=True, raiz=r, uid_esperado=os.getuid(), painel=None, remover_sites=False)
    base.update(extra)
    return argparse.Namespace(**base)


def contexto_root(r, **kw):
    return root.Contexto(raiz=r, uid_agente=os.getuid(), gid_agente=os.getgid(), executor="simulado", falsos=FALSOS, modo_teste=True, **kw)


class HelperRoot:
    """dash_agent_root.py servir --modo-teste num processo à parte (socket real, SO_PEERCRED real)."""

    def __init__(self, r, uid_agente=None, porta_sonda=None, com_falsos=True):
        self.r = r
        argv = [
            sys.executable, "-I", os.path.join(PUBLICO, "dash_agent_root.py"), "servir", "--modo-teste", "--raiz", r,
            "--uid-agente", str(os.getuid() if uid_agente is None else uid_agente), "--executor", "simulado",
        ] + (["--falsos", FALSOS] if com_falsos else [])
        if porta_sonda is not None:
            argv += ["--porta-sonda", str(porta_sonda)]
        self.proc = subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"})
        self.sock = os.path.join(r, "run/dash-agent-root/root.sock")
        limite = time.time() + 10
        while not os.path.exists(self.sock):
            if self.proc.poll() is not None or time.time() > limite:
                raise RuntimeError("o ajudante root não subiu: " + self.proc.stderr.read().decode(errors="replace"))
            time.sleep(0.02)

    def parar(self):
        self.proc.terminate()
        try:
            self.proc.wait(5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.proc.stderr.close()


def pedir_socket(caminho, dados, timeout=10):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect(caminho)
    try:
        s.sendall(dados)
        partes = []
        while True:
            b = s.recv(65536)
            if not b:
                break
            partes.append(b)
        return b"".join(partes)
    finally:
        s.close()


# --- Painel falso ---------------------------------------------------------------------------------

R_SEQ = re.compile(r"^[1-9][0-9]{0,15}$")
R_ASSIN = re.compile(r"^v1=([0-9a-f]{64})$")
R_BEARER = re.compile(r"^Bearer ([A-Za-z0-9_-]{43})$")
R_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


# Espelho dos schemas zod de src/features/vps/protocolo.ts (PedidoPulso, PedidoResultado e
# RESULTADO_POR_TIPO): o painel falso confere tudo o que o agente manda e anota cada violação.
R_SHA = re.compile(r"^[0-9a-f]{64}$")
R_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
R_CONTROLE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def _inteiro(v):
    return type(v) is int and abs(v) <= 2**53 - 1


def _iso(v):
    return isinstance(v, str) and len(v) <= 40 and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z", v))


def _texto(v, maximo):
    return isinstance(v, str) and len(v) <= maximo and not R_CONTROLE.search(v)


def conferir_pulso(d):
    erros = []
    ok = lambda cond, campo: cond or erros.append(campo)  # noqa: E731
    ok(_texto(d.get("versao"), 32), "versao")
    t = d.get("travas")
    ok(isinstance(t, dict) and isinstance(t.get("pausado"), bool) and isinstance(t.get("somenteLeitura"), bool), "travas")
    ok(d.get("executando") is None or (isinstance(d["executando"], str) and R_UUID.fullmatch(d["executando"])), "executando")
    ok(_inteiro(d.get("desvioMs", 0)), "desvioMs")
    ok(isinstance(d.get("ipv4", []), list) and len(d.get("ipv4", [])) <= 8, "ipv4")
    ok(isinstance(d.get("ipv6", []), list) and len(d.get("ipv6", [])) <= 8
       and all(isinstance(i, str) and re.fullmatch(r"[0-9A-Fa-f:.]{2,45}", i) for i in d.get("ipv6", [])), "ipv6")
    ok(d.get("visaoGeral") is None or (isinstance(d["visaoGeral"], str) and len(d["visaoGeral"]) <= 70_000), "visaoGeral")
    n = d.get("nginx")
    ok(n is None or (isinstance(n, dict) and (n.get("versao") is None or _texto(n["versao"], 64))
                     and isinstance(n.get("configOk"), bool) and isinstance(n.get("ativo"), bool)), "nginx")
    c = d.get("certificados")
    ok(c is None or (isinstance(c, list) and len(c) <= 200 and all(
        isinstance(x, dict) and R_SLUG.fullmatch(str(x.get("slug"))) and (x.get("validoAte") is None or _iso(x["validoAte"])) for x in c)), "certificados")
    sites = d.get("sites")
    ok(sites is None or (isinstance(sites, list) and len(sites) <= 200 and all(
        isinstance(x, dict) and R_SLUG.fullmatch(str(x.get("slug")))
        and (x.get("atual") is None or x["atual"] == "vazio" or R_UUID.fullmatch(str(x["atual"])))
        and isinstance(x.get("versoes"), list) and len(x["versoes"]) <= 50 and all(R_UUID.fullmatch(str(v)) for v in x["versoes"])
        for x in sites)), "sites")
    return erros


def _opcional(r, chave, regra):
    return chave not in r or regra(r[chave])


def conferir_resultado(tipo, corpo):
    erros = []
    ok = lambda cond, campo: cond or erros.append(campo)  # noqa: E731
    ok(_inteiro(corpo.get("seq")) and corpo["seq"] >= 1, "seq")
    ok(corpo.get("estado") in ("concluida", "falhou"), "estado")
    ok(corpo.get("erro") is None or (isinstance(corpo["erro"], str) and len(corpo["erro"]) <= 16_000), "erro")
    ok(_inteiro(corpo.get("duracaoMs")) and corpo["duracaoMs"] >= 0, "duracaoMs")
    r = corpo.get("resultado")
    ok(r is None or isinstance(r, dict), "resultado")
    if corpo.get("estado") != "concluida" or not isinstance(r, dict) or tipo is None:
        return erros
    ativacao = [
        ("versaoId", lambda v: isinstance(v, str) and bool(R_UUID.fullmatch(v)), True),
        ("anterior", lambda v: v is None or (isinstance(v, str) and len(v) <= 80), False),
        ("ativadaEm", _iso, False), ("repetida", lambda v: isinstance(v, bool), False),
    ]
    regras = {
        "servidor.coletar": [("visaoGeral", lambda v: isinstance(v, str) and len(v) <= 70_000, True)],
        "site.configurar": [("modo", lambda v: v in ("http", "https"), True), ("aplicadoEm", _iso, False),
                            ("aviso", lambda v: isinstance(v, str) and len(v) <= 64, False)],
        "site.publicar": ativacao + [
            ("arquivos", lambda v: _inteiro(v) and v >= 0, False), ("bytesDescompactados", lambda v: _inteiro(v) and v >= 0, False),
            ("indexSha256", lambda v: isinstance(v, str) and bool(R_SHA.fullmatch(v)), False),
            ("removidas", lambda v: isinstance(v, list) and len(v) <= 100 and all(R_UUID.fullmatch(str(x)) for x in v), False)],
        "site.ativar_versao": ativacao,
        "site.ssl_emitir": [("validoAte", lambda v: v is None or _iso(v), True),
                            ("dominios", lambda v: isinstance(v, list) and len(v) <= 4 and all(isinstance(x, str) and len(x) <= 253 for x in v), False)],
        "site.remover": [("movidoPara", lambda v: isinstance(v, str) and len(v) <= 512, False)],
    }[tipo]
    for chave, regra, obrigatoria in regras:
        if obrigatoria:
            ok(chave in r and regra(r[chave]), f"{tipo}.{chave}")
        else:
            ok(_opcional(r, chave, regra), f"{tipo}.{chave}")
    return erros


class PainelFalso:
    def __init__(self):
        self.violacoes = []  # o que o agente mandou fora do formato do protocolo.ts
        self.tipos = {}  # id da tarefa -> tipo (para conferir o resultado)
        self.servidor_id = str(uuid.uuid4())
        self.kp, self.kt = secrets.token_bytes(32), secrets.token_bytes(32)
        self.codigos = set()
        self.token_hash = None
        self.ultima_seq = 0
        self.fila = []  # envelopes entregues um por pulso
        self.resultados = []  # (id, corpo)
        self.recusar_resultados = 0  # quantos 500 antes de aceitar
        self.resultado_404 = set()
        self.artefatos = {}
        self.pulsos = []
        self.pedidos = []  # (metodo, caminho, seq, status)
        self.revogar = None  # None | "marca" | "sem_marca"
        self.redirecionar = False
        self.limitar = 0
        self.proximo_pulso = 5
        self.registros = []
        self.trava = threading.Lock()

    def __enter__(self):
        painel = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                painel._tratar(self, "GET")

            def do_POST(self):
                painel._tratar(self, "POST")

            def do_HEAD(self):
                self.send_response(200)
                self.end_headers()

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()
        self.httpd.server_close()

    def codigo(self):
        c = secrets.token_urlsafe(32)
        self.codigos.add(c)
        return c

    # Envelope assinado como o enfileirarTarefa do painel.
    def tarefa(self, tipo, params, seq=None, expira_em=None, ident=None, servidor_id=None, chave=None):
        with self.trava:
            if seq is None:
                self._seq_tarefa = getattr(self, "_seq_tarefa", 0) + 1
                seq = self._seq_tarefa
        ident = ident or str(uuid.uuid4())
        p = params if isinstance(params, str) else json.dumps(params, separators=(",", ":"), ensure_ascii=False)
        expira = int(time.time()) + 600 if expira_em is None else expira_em
        msg = "\n".join([P_TAREFA, servidor_id or self.servidor_id, ident, str(seq), tipo, str(expira), p])
        assinatura = hmac.new(chave or self.kt, msg.encode(), hashlib.sha256).hexdigest()
        self.tipos[ident] = tipo
        return {"id": ident, "seq": seq, "tipo": tipo, "params": p, "expiraEm": expira, "assinatura": assinatura}

    def _responder(self, h, status, corpo, extra=None, tipo="application/json"):
        dados = corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode()
        h.send_response(status)
        h.send_header("Content-Type", tipo)
        h.send_header("Content-Length", str(len(dados)))
        h.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            h.send_header(k, v)
        h.end_headers()
        h.wfile.write(dados)

    def _nao_autorizado(self, h):
        self._responder(h, 401, {"ok": False, "error": "unauthorized"}, {"WWW-Authenticate": "Dash-HMAC"})

    def _tratar(self, h, metodo):
        tamanho = int(h.headers.get("Content-Length") or 0)
        corpo = h.rfile.read(tamanho) if tamanho else b""
        caminho = h.path
        if caminho == "/api/agente/v1/registrar" and metodo == "POST":
            return self._registrar(h, corpo)
        # verificarPedido, na ordem do §4
        auth, sid = h.headers.get("Authorization", ""), h.headers.get("X-Dash-Servidor", "")
        seq_txt, assin = h.headers.get("X-Dash-Seq", ""), h.headers.get("X-Dash-Assinatura", "")
        m_auth, m_assin = R_BEARER.match(auth), R_ASSIN.match(assin)
        if not (m_auth and R_UUID.match(sid) and R_SEQ.match(seq_txt) and int(seq_txt) <= 2**53 - 1 and m_assin):
            self.pedidos.append((metodo, caminho, None, 400))
            return self._responder(h, 400, {"ok": False, "error": "invalid_request"})
        seq = int(seq_txt)
        if self.revogar == "marca":
            self.pedidos.append((metodo, caminho, seq, 401))
            return self._nao_autorizado(h)
        if self.revogar == "sem_marca":  # proteção da Vercel ou firewall: 401 sem a marca do Dash
            self.pedidos.append((metodo, caminho, seq, 401))
            return self._responder(h, 401, {"error": "unauthorized"}, tipo="text/html")
        if self.redirecionar:
            self.pedidos.append((metodo, caminho, seq, 307))
            return self._responder(h, 307, b"", {"Location": "/login"}, tipo="text/html")
        token_ok = self.token_hash is not None and hmac.compare_digest(hashlib.sha256(m_auth.group(1).encode()).hexdigest(), self.token_hash)
        canon = "\n".join([P_PEDIDO, metodo, caminho, sid, seq_txt, hashlib.sha256(corpo).hexdigest()])
        esperado = hmac.new(self.kp, canon.encode(), hashlib.sha256).hexdigest()
        if sid != self.servidor_id or not token_ok or not hmac.compare_digest(esperado, m_assin.group(1)):
            self.pedidos.append((metodo, caminho, seq, 401))
            return self._nao_autorizado(h)
        agora = int(time.time() * 1000)
        with self.trava:
            if abs(seq - agora) > 300_000:
                self.pedidos.append((metodo, caminho, seq, 409))
                return self._responder(h, 409, {"ok": False, "error": "clock_skew", "agora": agora, "ultimaSeq": self.ultima_seq})
            if seq <= self.ultima_seq:
                self.pedidos.append((metodo, caminho, seq, 409))
                return self._responder(h, 409, {"ok": False, "error": "replayed", "ultimaSeq": self.ultima_seq})
            self.ultima_seq = seq
        if self.limitar > 0:
            self.limitar -= 1
            self.pedidos.append((metodo, caminho, seq, 429))
            return self._responder(h, 429, {"ok": False, "error": "too_many_requests", "tenteEm": 1})
        self.pedidos.append((metodo, caminho, seq, 200))
        if caminho == "/api/agente/v1/pulso" and metodo == "POST":
            d = json.loads(corpo)
            self.pulsos.append(d)
            self.violacoes += ["pulso: " + e for e in conferir_pulso(d)]
            tarefa = None
            with self.trava:
                if d.get("executando") is None and self.fila:
                    tarefa = self.fila.pop(0)
            return self._responder(
                h, 200,
                {"ok": True, "agora": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "agoraMs": agora, "proximoPulsoEm": self.proximo_pulso, "tarefa": tarefa},
            )
        m = re.match(r"^/api/agente/v1/tarefas/([0-9a-f-]{36})/resultado$", caminho)
        if m and metodo == "POST":
            if m.group(1) in self.resultado_404:
                return self._responder(h, 404, {"ok": False, "error": "job_not_found"})
            with self.trava:
                if self.recusar_resultados > 0:
                    self.recusar_resultados -= 1
                    return self._responder(h, 500, {"ok": False, "error": "erro_interno"})
                self.resultados.append((m.group(1), json.loads(corpo)))
                self.violacoes += ["resultado: " + e for e in conferir_resultado(self.tipos.get(m.group(1)), self.resultados[-1][1])]
            return self._responder(h, 200, {"ok": True, "repetido": False})
        m = re.match(r"^/api/agente/v1/artefatos/([0-9a-f-]{36})$", caminho)
        if m and metodo == "GET" and m.group(1) in self.artefatos:
            dados = self.artefatos[m.group(1)]
            return self._responder(h, 200, dados, {"X-Dash-Sha256": hashlib.sha256(dados).hexdigest()}, tipo="application/zip")
        return self._responder(h, 404, {"ok": False, "error": "not_found"})

    def _registrar(self, h, corpo):
        d = json.loads(corpo)
        self.registros.append(d)
        with self.trava:
            if d.get("codigo") not in self.codigos:
                return self._responder(h, 401, {"ok": False, "error": "invalid_code"})
            self.codigos.discard(d["codigo"])  # uso único
            self.token_hash = d["tokenHash"]
            self.ultima_seq = 0
        return self._responder(
            h, 200,
            {"ok": True, "servidorId": self.servidor_id, "geracao": 1, "chavePedidos": b64url(self.kp), "chaveTarefas": b64url(self.kt), "ultimaSeqTarefa": 0, "proximoPulsoEm": 5},
        )


def registrar_agente(painel, r):
    """Registra o agente em-processo (o mesmo caminho do instalador) e devolve o Contexto."""
    import contextlib
    import io

    args = args_agente(r, painel=painel.url)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        agente.registrar(args, codigo=painel.codigo())
    return agente.Contexto(args_agente(r))


class TesteComRaiz(unittest.TestCase):
    def setUp(self):
        self.r = nova_raiz()
        self.addCleanup(apagar_raiz, self.r)
