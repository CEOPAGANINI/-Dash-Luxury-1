#!/usr/bin/env python3
"""dash-agent-root 1.0.0 - ajudante root do agente do Servidor do Funil.

Atende por um socket Unix só o uid do dashagent (SO_PEERCRED), um pedido por vez, e só 6
operações de nginx/certbot. Monta sozinho todo argv e todo texto de configuração a partir de
valores revalidados aqui (cópia própria das regras de dash_agent.py). Nunca escreve em
/var/www/dash-funil, nunca roda shell e nunca passa um --*-hook ao certbot.
"""
import argparse
import fcntl
import http.client
import json
import os
import pwd
import re
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import time
from datetime import datetime, timezone

VERSAO = "1.0.0"
OPS = {
    "nginx.aplicar": ("slug", "dominios", "principal", "origemCheckout", "checkout", "tls"),
    "nginx.remover": ("slug",),
    "ssl.emitir": ("slug", "dominios", "email"),
    "ssl.remover": ("slug",),
    "estado": (),
    "versao": (),
}
MUTANTES = {"nginx.aplicar", "nginx.remover", "ssl.emitir", "ssl.remover"}
PATH_FIXO = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"}
LIM_PEDIDO = 16384

# Caminhos que vão DENTRO do texto do nginx: são sempre os de produção, também no modo teste
# (o nginx falso traduz /etc/... para $RAIZ/etc/...). Os arquivos em si ficam sob ctx.raiz.
WWW = "/var/www/dash-funil"
ACME = "/var/lib/dash-agent-root/acme"
LIVE = "/etc/letsencrypt/live"
CABECALHOS = "/etc/nginx/snippets/dash-agent-cabecalhos.conf"
TLS_SNIPPET = "/etc/nginx/snippets/dash-agent-tls.conf"
AVISO_GERADO = "# dash-agent v1: gerado automaticamente. Não edite: será sobrescrito."

# --- Regras compartilhadas (§8.1): cópia própria, conferida contra casos-validacao.json -----------
R_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
R_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
R_ROTULO = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
R_TLD = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")
R_LOCAL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}$")
R_CHK = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")
R_IPV4 = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
SUFIXOS_BASE = ("localhost", "local", "internal", "invalid", "test", "example", "arpa")
SUFIXOS_SITE = SUFIXOS_BASE + ("vercel.app",)
# "000-padrao" era o servidor padrão do instalador antigo (sites-available/dash-000-padrao.conf):
# aplicar um site com esse slug trocaria o catch-all por um vhost comum, e remover apagaria o arquivo.
SLUGS_RESERVADOS = ("000-padrao",)


class Recusa(Exception):
    def __init__(self, codigo, msg=""):
        super().__init__(msg or codigo)
        self.codigo = codigo


def _sufixo(d, lista):
    return any(d == s or d.endswith("." + s) for s in lista)


def host_ok(d):
    if not isinstance(d, str) or len(d) > 253 or R_IPV4.fullmatch(d):
        return False
    p = d.split(".")
    return len(p) >= 2 and all(R_ROTULO.fullmatch(x) for x in p) and bool(R_TLD.fullmatch(p[-1])) and not _sufixo(d, SUFIXOS_BASE)


def dominio_ok(d):
    return host_ok(d) and not _sufixo(d, SUFIXOS_SITE)


def origem_ok(o):
    return isinstance(o, str) and o.startswith("https://") and host_ok(o[8:])


def slug_ok(s):
    return isinstance(s, str) and bool(R_SLUG.fullmatch(s)) and s not in SLUGS_RESERVADOS


def checkout_ok(u, o):
    if u is None:
        return True
    return isinstance(u, str) and origem_ok(o) and u.startswith(o + "/checkout/") and bool(R_CHK.fullmatch(u[len(o) + 10 :]))


def email_ok(e):
    if e is None:
        return True
    if not isinstance(e, str) or len(e) > 254 or e.count("@") != 1:
        return False
    loc, dom = e.split("@")
    return bool(R_LOCAL.fullmatch(loc)) and host_ok(dom.lower())


def validar_args(op, a):
    if not isinstance(a, dict) or sorted(a) != sorted(OPS[op]):
        raise Recusa("args_invalidos", "chaves")

    def exige(ok, campo):
        if not ok:
            raise Recusa("args_invalidos", campo)

    if "slug" in a:
        exige(slug_ok(a["slug"]), "slug")
    if "dominios" in a:
        ds = a["dominios"]
        exige(
            isinstance(ds, list) and 1 <= len(ds) <= 4 and all(isinstance(d, str) for d in ds)
            and len(set(ds)) == len(ds) and all(dominio_ok(d) for d in ds),
            "dominios",
        )
    if "principal" in a:
        exige(isinstance(a["principal"], str) and a["principal"] in a["dominios"], "principal")
    if "origemCheckout" in a:
        exige(origem_ok(a["origemCheckout"]), "origemCheckout")
    if "checkout" in a:
        exige(checkout_ok(a["checkout"], a["origemCheckout"]), "checkout")
    if "tls" in a:
        exige(isinstance(a["tls"], bool), "tls")
    if "email" in a:
        exige(email_ok(a["email"]), "email")


# --- Utilidades ----------------------------------------------------------------------------------


def iso(momento=None):
    d = datetime.now(timezone.utc) if momento is None else momento
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"


def limpar(texto, maximo=2000):
    return re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", str(texto))[:maximo]


def log(msg):
    print(limpar(msg, 1000), file=sys.stderr, flush=True)


def _sem_duplicadas(pares):
    d = {}
    for k, v in pares:
        if k in d:
            raise ValueError("chave repetida")
        d[k] = v
    return d


def _sem_constantes(nome):
    raise ValueError("constante não permitida")


def apagar_se_existe(caminho):
    try:
        os.unlink(caminho)
    except FileNotFoundError:
        pass


def ler_bytes(caminho):
    try:
        fd = os.open(caminho, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, "rb") as f:
        return f.read()


def escrever_atomico(caminho, dados, modo=0o644):
    if isinstance(dados, str):
        dados = dados.encode("utf-8")
    tmp = caminho + ".novo-" + secrets.token_hex(4)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, modo)
    try:
        os.fchmod(fd, modo)
        with os.fdopen(fd, "wb") as f:
            f.write(dados)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, caminho)  # rename(2): o nginx nunca lê meio arquivo
    except BaseException:
        apagar_se_existe(tmp)
        raise


def restaurar(caminho, anterior):
    if anterior is None:
        apagar_se_existe(caminho)
    else:
        escrever_atomico(caminho, anterior)


def criar_pasta(caminho, modo):
    try:
        os.mkdir(caminho, modo)
        os.chmod(caminho, modo)
    except FileExistsError:
        pass
    if os.path.islink(caminho) or not os.path.isdir(caminho):
        raise Recusa("pasta_invalida", caminho)


# --- Contexto ------------------------------------------------------------------------------------


class Contexto:
    def __init__(self, raiz="/", uid_agente=None, gid_agente=None, executor="real", falsos=None, porta_sonda=None, modo_teste=False):
        j = lambda *a: os.path.join(raiz, *a)  # noqa: E731
        self.raiz, self.modo_teste, self.executor, self.falsos = raiz, modo_teste, executor, falsos
        self.uid_agente, self.gid_agente, self.porta_sonda = uid_agente, gid_agente, porta_sonda
        self.nginx = j("etc/nginx")
        self.sa, self.se = j("etc/nginx/sites-available"), j("etc/nginx/sites-enabled")
        self.letsencrypt = j("etc/letsencrypt")
        self.live, self.renewal = j("etc/letsencrypt/live"), j("etc/letsencrypt/renewal")
        self.base_root = j("var/lib/dash-agent-root")
        self.acme, self.estado_dir = j("var/lib/dash-agent-root/acme"), j("var/lib/dash-agent-root/estado")
        self.run = j("run/dash-agent-root")
        self.sock, self.lock = j("run/dash-agent-root/root.sock"), j("run/dash-agent-root/nginx.lock")
        self.travas = j("etc/dash-agent/travas.json")
        self.proc_inet6 = j("proc/net/if_inet6") if modo_teste else "/proc/net/if_inet6"
        self.cache_certbot = (0.0, None)

    def resolver(self, argv):
        nome = argv[0]
        if self.executor == "simulado" and self.falsos:
            falso = os.path.join(self.falsos, nome)
            if os.path.isfile(falso):  # nginx, certbot e systemctl falsos; o openssl é sempre o real
                return [falso] + list(argv[1:])
        real = shutil.which(nome, path=PATH_FIXO["PATH"])
        if not real:
            raise Recusa("programa_ausente", f"{nome} não está instalado neste servidor.")
        return [real] + list(argv[1:])

    def ambiente(self):
        env = dict(PATH_FIXO)
        if self.executor == "simulado":
            env["RAIZ"] = self.raiz  # os falsos registram em $RAIZ/executados.jsonl
        return env

    def ipv6(self):
        try:
            with open(self.proc_inet6, encoding="ascii") as f:
                return any(len(c) >= 6 and c[3] == "00" and not c[0].startswith(("fc", "fd")) for c in (linha.split() for linha in f))
        except OSError:
            return False

    def versao_nginx(self):
        r = executar(self, ["nginx", "-v"], 20)
        m = re.search(r"nginx/(\d+)\.(\d+)\.(\d+)", r.stdout + r.stderr)
        return tuple(int(x) for x in m.groups()) if m else None

    def nginx_ge(self, minima):
        v = self.versao_nginx()
        return v is not None and v >= minima


def executar(ctx, argv, timeout):
    # argv sempre em lista, nunca shell. No modo simulado argv[0] vira tests/agente/falsos/<nome>.
    try:
        return subprocess.run(
            ctx.resolver(argv), shell=False, env=ctx.ambiente(), capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL
        )
    except subprocess.TimeoutExpired:
        raise Recusa("demorou", f"{argv[0]} passou de {timeout} s.") from None


def executar_ok(ctx, argv, timeout, codigo):
    r = executar(ctx, argv, timeout)
    if r.returncode != 0:
        raise Recusa(codigo, (r.stdout + r.stderr)[-2000:])
    return r


class trava:
    """flock em /run/dash-agent-root/nginx.lock: o gancho do certbot roda em outro processo."""

    def __init__(self, ctx):
        self.ctx, self.fd = ctx, None

    def __enter__(self):
        criar_pasta(self.ctx.run, 0o750)
        self.fd = os.open(self.ctx.lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        fcntl.flock(self.fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.fd, fcntl.LOCK_UN)
        os.close(self.fd)


def ler_travas(ctx):
    try:
        bruto = ler_bytes(ctx.travas)
    except OSError:
        bruto = b"{"
    if bruto is None:
        return {"pausado": False, "somenteLeitura": False}
    try:
        t = json.loads(bruto)
        return {"pausado": t.get("pausado") is True, "somenteLeitura": t.get("somenteLeitura") is True}
    except (ValueError, AttributeError):
        return {"pausado": True, "somenteLeitura": True}  # arquivo estragado: falha fechada


# --- Estado aplicado por slug (0600, fora da árvore do dashagent) ------------------------------


def salvar_estado(ctx, slug, dados):
    criar_pasta(ctx.estado_dir, 0o700)
    escrever_atomico(os.path.join(ctx.estado_dir, slug + ".json"), json.dumps(dados, separators=(",", ":")), 0o600)


def ler_estado(ctx, slug):
    bruto = ler_bytes(os.path.join(ctx.estado_dir, slug + ".json"))
    if bruto is None:
        return None
    try:
        est = json.loads(bruto)
        validar_args("nginx.aplicar", est)  # o que volta do disco também passa pelas regras
        return est
    except (ValueError, Recusa):
        return None


# --- Modelo do vhost (§8.5; goldens em tests/fixtures/vps/golden) -----------------------------


def _acme_location():
    return f"  location ^~ /.well-known/acme-challenge/ {{ root {ACME}; default_type text/plain; disable_symlinks on; try_files $uri =404; }}"


def _corpo_comum(slug, a):
    raiz_site = f"{WWW}/{slug}"
    linhas = [
        f"  root {raiz_site}/current;",
        "  index index.html;",
        f"  disable_symlinks if_not_owner from={raiz_site};",
        "  client_max_body_size 16k;",
        f"  include {CABECALHOS};",
        _acme_location(),
    ]
    if a["checkout"]:
        linhas.append(f"  location = /checkout {{ return 302 {a['checkout']}$is_args$args; }}")
    linhas += [
        f"  location ^~ /checkout/ {{ return 302 {a['origemCheckout']}$request_uri; }}",
        "  location ~ /\\. { deny all; }",
        # Regex com "{" precisa de aspas no nginx: sem elas o "{8,}" abriria um bloco.
        f'  location ~* "\\.[0-9a-f]{{8,}}\\.(?:js|css)$" {{ expires 1y; add_header Cache-Control "public, immutable"; include {CABECALHOS}; try_files $uri =404; }}',
        "  location ~* \\.(?:css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf)$ { expires 1h; try_files $uri =404; }",
        f'  location / {{ limit_except GET HEAD {{ deny all; }} add_header Cache-Control "no-cache"; include {CABECALHOS}; try_files $uri $uri/ $uri.html =404; }}',
        "  error_page 404 /404.html;",
    ]
    return linhas


def gerar_vhost(slug, a, tls, ipv6, http2_on):
    """Texto inteiro do dash-<slug>.conf. Só entra valor que passou por validar_args."""
    nomes = " ".join([a["principal"]] + [d for d in a["dominios"] if d != a["principal"]])
    l80 = ["  listen 80;"] + (["  listen [::]:80;"] if ipv6 else [])
    cab = [AVISO_GERADO]
    if not tls:
        return "\n".join(cab + ["server {"] + l80 + [f"  server_name {nomes};", "  server_tokens off;"] + _corpo_comum(slug, a) + ["}", ""])
    if http2_on:  # nginx >= 1.25.1: "http2" no listen virou aviso de obsoleto
        l443 = ["  listen 443 ssl;"] + (["  listen [::]:443 ssl;"] if ipv6 else []) + ["  http2 on;"]
    else:
        l443 = ["  listen 443 ssl http2;"] + (["  listen [::]:443 ssl http2;"] if ipv6 else [])
    redirecionar = (
        ["server {"] + l80 + [f"  server_name {nomes};", "  server_tokens off;", f"  include {CABECALHOS};", _acme_location()]
        + ["  location / { return 301 https://$host$request_uri; }", "}"]
    )
    https = (
        ["server {"] + l443
        + [
            f"  server_name {nomes};",
            "  server_tokens off;",
            f"  ssl_certificate {LIVE}/dash-{slug}/fullchain.pem;",
            f"  ssl_certificate_key {LIVE}/dash-{slug}/privkey.pem;",
            f"  include {TLS_SNIPPET};",
        ]
        + _corpo_comum(slug, a) + ["}"]
    )
    return "\n".join(cab + redirecionar + https + [""])


# --- Colisão de server_name ------------------------------------------------------------------------


def nomes_de_servidor(texto):
    # Valor entre aspas pode ter ';' e '{' (um regex como "~^\d{1,3}\.x$"): as aspas contam como um
    # pedaço só. O regex fica com a caixa original ("\D" em minúsculo viraria "\d"); nome comum é
    # comparado em minúsculo, como o nginx faz com o Host.
    sem_comentario = re.sub(r"#[^\n]*", "", texto)
    nomes = []
    for m in re.finditer(r"""(?:^|[\s;{}])server_name\s+((?:"[^"]*"|'[^']*'|[^;{}"'])+);""", sem_comentario):
        for bruto in re.findall(r""""[^"]*"|'[^']*'|[^\s"']+""", m.group(1)):
            nome = bruto[1:-1] if bruto[:1] in "\"'" else bruto
            nomes.append(nome if nome.startswith("~") else nome.lower())
    return nomes


def nome_cobre(nome, dominio):
    """True se este server_name responde pelo domínio; None se é um regex que não dá para conferir."""
    if nome in ("_", ""):
        return False  # o curinga "_" do servidor padrão e o nome vazio não são donos de domínio nenhum
    if nome.startswith("~"):
        # O nginx casa o regex (PCRE, sem âncora implícita) com o Host em minúsculo. Um regex que o
        # re do Python não compila (sintaxe só do PCRE) não dá para conferir: quem chama recusa.
        try:
            return re.search(nome[1:], dominio) is not None
        except re.error:
            return None
    if nome.startswith("*."):
        return dominio.endswith(nome[1:])
    if nome.startswith("."):
        return dominio == nome[1:] or dominio.endswith(nome)
    if nome.endswith(".*"):  # curinga no fim: "loja.*" responde por loja.com, loja.com.br...
        return dominio.startswith(nome[:-1])
    return nome == dominio


def colisao(ctx, slug, dominios):
    proprio = f"dash-{slug}.conf"
    arquivos = {}
    try:
        nomes = os.listdir(ctx.sa)
    except FileNotFoundError:
        nomes = []
    for n in nomes:  # confs do painel desligadas também contam
        if n.startswith("dash-") and n.endswith(".conf") and n != proprio:
            arquivos[os.path.join("/etc/nginx/sites-available", n)] = (ler_bytes(os.path.join(ctx.sa, n)) or b"").decode("utf-8", "replace")
    r = executar(ctx, ["nginx", "-T"], 20)
    if r.returncode == 0:
        atual = None
        for linha in r.stdout.splitlines(keepends=True):
            m = re.match(r"^# configuration file (.+):\s*$", linha)
            if m:
                atual = m.group(1)
                arquivos.setdefault(atual, "")
                continue
            if atual is not None:
                arquivos[atual] += linha
    # No nginx, nome exato vence curinga e regex: um vhost do painel com o domínio de um site feito à
    # mão (server_name ~^(www\.)?loja\.com$) passaria a responder no lugar dele sem o nginx -t reclamar.
    for caminho, texto in arquivos.items():
        if os.path.basename(caminho) == proprio:
            continue
        for nome in nomes_de_servidor(texto):
            for d in dominios:
                cobre = nome_cobre(nome, d)
                if cobre is None:
                    raise Recusa(
                        "server_name_em_regex",
                        f"O nginx deste servidor tem um server_name em regex em {caminho} ({limpar(nome, 120)}) que o painel "
                        "não consegue conferir; não dá para garantir que o domínio está livre.",
                    )
                if cobre:
                    raise Recusa("dominio_em_uso_no_nginx", f"O domínio {d} já está configurado em {caminho} neste servidor.")


# --- As 6 operações ------------------------------------------------------------------------------


def aplicar(ctx, a, tls=None):
    slug = a["slug"]
    tls = a["tls"] if tls is None else tls
    conf, link = os.path.join(ctx.sa, f"dash-{slug}.conf"), os.path.join(ctx.se, f"dash-{slug}.conf")
    if tls and not os.path.isfile(os.path.join(ctx.live, f"dash-{slug}", "fullchain.pem")):
        raise Recusa("certificado_ausente", "O certificado deste site não existe neste servidor.")
    with trava(ctx):
        if executar(ctx, ["nginx", "-t"], 20).returncode != 0:
            raise Recusa("nginx_ja_quebrado", "O nginx já estava com erro; nada foi mudado.")
        colisao(ctx, slug, a["dominios"])
        if os.path.lexists(link) and not os.path.islink(link):
            raise Recusa("conflito_arquivo", f"sites-enabled/dash-{slug}.conf não é um link; nada foi mudado.")
        anterior = ler_bytes(conf)
        link_novo = not os.path.islink(link)
        escrever_atomico(conf, gerar_vhost(slug, a, tls, ctx.ipv6(), ctx.nginx_ge((1, 25, 1))))
        if link_novo:
            os.symlink(f"../sites-available/dash-{slug}.conf", link)
        t = executar(ctx, ["nginx", "-t"], 20)
        if t.returncode != 0:
            restaurar(conf, anterior)  # byte a byte, ou apaga se o arquivo é novo
            if link_novo:
                apagar_se_existe(link)
            raise Recusa("nginx_recusou", (t.stdout + t.stderr)[-2000:])
        salvar_estado(ctx, slug, dict(a, tls=tls))
        executar_ok(ctx, ["systemctl", "reload", "nginx"], 30, "nginx_reload_falhou")
    return {"modo": "https" if tls else "http", "aplicadoEm": iso()}


def remover_vhost(ctx, a):
    slug = a["slug"]
    conf, link = os.path.join(ctx.sa, f"dash-{slug}.conf"), os.path.join(ctx.se, f"dash-{slug}.conf")
    with trava(ctx):
        if not os.path.lexists(conf) and not os.path.lexists(link):
            apagar_se_existe(os.path.join(ctx.estado_dir, slug + ".json"))
            return {"removido": False}
        if executar(ctx, ["nginx", "-t"], 20).returncode != 0:
            raise Recusa("nginx_ja_quebrado", "O nginx já estava com erro; nada foi mudado.")
        anterior = ler_bytes(conf)
        tinha_link = os.path.islink(link)
        if tinha_link:
            os.unlink(link)
        apagar_se_existe(conf)
        t = executar(ctx, ["nginx", "-t"], 20)
        if t.returncode != 0:
            restaurar(conf, anterior)
            if tinha_link:
                os.symlink(f"../sites-available/dash-{slug}.conf", link)
            raise Recusa("nginx_recusou", (t.stdout + t.stderr)[-2000:])
        apagar_se_existe(os.path.join(ctx.estado_dir, slug + ".json"))
        executar_ok(ctx, ["systemctl", "reload", "nginx"], 30, "nginx_reload_falhou")
    return {"removido": True}


def sonda_http(ctx, dominio, caminho, conteudo):
    if ctx.executor == "simulado" and ctx.porta_sonda is None:
        # Sem nginx de verdade: simula o nginx servindo o webroot, e $RAIZ/falhas/sonda força a falha.
        if os.path.exists(os.path.join(ctx.raiz, "falhas", "sonda")):
            return False
        return (ler_bytes(os.path.join(ctx.acme, caminho.lstrip("/"))) or b"").decode() == conteudo
    c = http.client.HTTPConnection("127.0.0.1", ctx.porta_sonda or 80, timeout=5)
    try:
        c.request("GET", caminho, headers={"Host": dominio, "User-Agent": "dash-agent-root/" + VERSAO})
        r = c.getresponse()
        return r.status == 200 and r.read(256).decode("utf-8", "replace").strip() == conteudo
    except OSError:
        return False
    finally:
        c.close()


def sondar(ctx, dominios):
    # Antes do certbot: o nginx deste servidor responde pelo Host de cada domínio na porta 80?
    # Pega vhost ausente ou nginx desligado sem gastar tentativa no Let's Encrypt.
    pasta = os.path.join(ctx.acme, ".well-known", "acme-challenge")
    criar_pasta(os.path.join(ctx.acme, ".well-known"), 0o755)
    criar_pasta(pasta, 0o755)
    nome = "dash-sonda-" + secrets.token_hex(8)
    conteudo = secrets.token_hex(16)
    escrever_atomico(os.path.join(pasta, nome), conteudo)
    try:
        for d in dominios:
            if not sonda_http(ctx, d, "/.well-known/acme-challenge/" + nome, conteudo):
                raise Recusa("vhost_nao_responde", f"O nginx deste servidor não respondeu por {d} na porta 80. Reaplique o site e confira se o nginx está ligado.")
    finally:
        apagar_se_existe(os.path.join(pasta, nome))


MESES = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}


def data_do_openssl(saida):
    # "notAfter=Dec 22 12:00:00 2026 GMT" (LC_ALL=C) -> "2026-12-22T12:00:00.000Z"
    m = re.search(r"notAfter=([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s+GMT", saida or "")
    if not m or m.group(1) not in MESES:
        raise Recusa("validade_ilegivel", "Não consegui ler a validade do certificado.")
    mes, dia, h, mi, s, ano = MESES[m.group(1)], int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6))
    return iso(datetime(ano, mes, dia, h, mi, s, tzinfo=timezone.utc))


def validade(ctx, slug):
    cert = os.path.join(ctx.live, f"dash-{slug}", "cert.pem")
    r = executar_ok(ctx, ["openssl", "x509", "-enddate", "-noout", "-in", cert], 10, "validade_ilegivel")
    return data_do_openssl(r.stdout)


def argv_certbot(ctx, a):
    argv = [
        "certbot", "certonly", "--webroot", "-w", ctx.acme, "--cert-name", f"dash-{a['slug']}",
        "--non-interactive", "--agree-tos", "--no-eff-email", "--keep-until-expiring",
    ]
    argv += ["--email", a["email"]] if a["email"] else ["--register-unsafely-without-email"]
    for d in a["dominios"]:
        argv += ["-d", d]
    return argv  # nenhum --*-hook jamais entra aqui: a renovação usa o gancho fixo do instalador


def emitir(ctx, a):
    est = ler_estado(ctx, a["slug"])
    if not est or sorted(est["dominios"]) != sorted(a["dominios"]):
        raise Recusa("vhost_ausente", "O site ainda não foi aplicado no nginx com estes domínios. Reaplique o site.")
    sondar(ctx, a["dominios"])
    r = executar(ctx, argv_certbot(ctx, a), 180)
    if r.returncode != 0:
        raise Recusa("certbot_falhou", (r.stdout + r.stderr)[-2000:])
    valido = validade(ctx, a["slug"])
    aplicar(ctx, est, tls=True)
    return {"validoAte": valido, "dominios": a["dominios"]}


def remover_certificado(ctx, a):
    nome = f"dash-{a['slug']}"
    if not os.path.lexists(os.path.join(ctx.live, nome)) and not os.path.lexists(os.path.join(ctx.renewal, nome + ".conf")):
        return {"removido": False}  # idempotente: não há o que apagar
    executar_ok(ctx, ["certbot", "delete", "--cert-name", nome, "--non-interactive"], 60, "certbot_falhou")
    return {"removido": True}


def versao_certbot(ctx):
    # "certbot --version" sobe um Python inteiro; o estado é pedido a cada poucos minutos, então a
    # versão fica guardada por 6 h (só muda com apt, e o dono reinstala para atualizar).
    agora = time.monotonic()
    em, versao = ctx.cache_certbot
    if em and agora - em < 6 * 3600:
        return versao
    versao = None
    try:
        rc = executar(ctx, ["certbot", "--version"], 30)
        m = re.search(r"certbot\s+(\d+\.\d+(?:\.\d+)?)", rc.stdout + rc.stderr)
        versao = m.group(1) if m else None
    except Recusa:
        pass
    ctx.cache_certbot = (agora, versao)
    return versao


def estado(ctx, a):
    v = ctx.versao_nginx()
    teste = executar(ctx, ["nginx", "-t"], 20)
    ativo = executar(ctx, ["systemctl", "is-active", "nginx"], 10)
    certbot = versao_certbot(ctx)
    certificados = []
    try:
        nomes = sorted(os.listdir(ctx.live))
    except OSError:
        nomes = []
    for n in nomes:
        if not n.startswith("dash-") or not R_SLUG.fullmatch(n[5:]):
            continue
        try:
            certificados.append({"slug": n[5:], "validoAte": validade(ctx, n[5:])})
        except Recusa:
            continue
        if len(certificados) >= 200:
            break
    return {
        "nginx": {"versao": ".".join(map(str, v)) if v else None, "configOk": teste.returncode == 0, "ativo": ativo.stdout.strip() == "active"},
        "certbot": certbot,
        "certificados": certificados,
    }


IMPL = {
    "nginx.aplicar": aplicar,
    "nginx.remover": remover_vhost,
    "ssl.emitir": emitir,
    "ssl.remover": remover_certificado,
    "estado": estado,
    "versao": lambda c, a: {"versao": VERSAO},
}


# --- Socket ----------------------------------------------------------------------------------------


def ler_linha(conn, limite):
    partes, total = [], 0
    while True:
        b = conn.recv(65536)
        if not b:
            break
        partes.append(b)
        total += len(b)
        if b"\n" in b:
            break
        if total > limite:
            raise Recusa("pedido_grande", f"Pedido acima de {limite} bytes.")
    linha = b"".join(partes).split(b"\n", 1)[0]
    if len(linha) > limite:
        raise Recusa("pedido_grande", f"Pedido acima de {limite} bytes.")
    return linha


def responder(conn, resp):
    try:
        conn.sendall(json.dumps(resp, separators=(",", ":")).encode() + b"\n")
        conn.shutdown(socket.SHUT_WR)
        conn.settimeout(1)
        for _ in range(64):  # esvazia o que sobrou: fechar com dado pendente vira RST e o cliente perde a resposta
            if not conn.recv(65536):
                break
    except OSError:
        pass


def peer_uid(conn):
    _pid, uid, _gid = struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
    return uid


def atender(ctx, conn):
    if peer_uid(conn) != ctx.uid_agente:
        return  # silêncio para qualquer outro processo
    conn.settimeout(10)
    ident = None
    try:
        try:
            ped = json.loads(ler_linha(conn, LIM_PEDIDO), object_pairs_hook=_sem_duplicadas, parse_constant=_sem_constantes)
        except ValueError:
            raise Recusa("pedido_invalido", "JSON inválido.") from None
        if not isinstance(ped, dict) or sorted(ped) != ["args", "id", "op"] or not isinstance(ped["id"], str) or not R_UUID.fullmatch(ped["id"]):
            raise Recusa("pedido_invalido", "Formato do pedido inválido.")
        ident, op = ped["id"], ped["op"]
        if not isinstance(op, str) or op not in OPS:
            raise Recusa("operacao_desconhecida", "Operação fora da lista.")
        validar_args(op, ped["args"])
        if op in MUTANTES:
            t = ler_travas(ctx)
            if t["somenteLeitura"]:
                raise Recusa("somente_leitura", "O dono deixou este servidor em somente leitura na própria VPS.")
            if t["pausado"]:
                raise Recusa("pausado", "O dono pausou o agente na própria VPS.")
        conn.settimeout(240)
        resp = {"id": ident, "ok": True, "dados": IMPL[op](ctx, ped["args"])}
    except Recusa as r:
        resp = {"id": ident, "ok": False, "erro": r.codigo, "mensagem": limpar(str(r))[-2000:]}
    except Exception as e:
        log("erro interno: " + limpar(repr(e), 500))
        resp = {"id": ident, "ok": False, "erro": "erro_interno", "mensagem": limpar(repr(e), 500)}
    responder(conn, resp)


def servir(ctx):
    criar_pasta(ctx.run, 0o750)
    if os.geteuid() == 0:
        os.chown(ctx.run, 0, ctx.gid_agente)
        os.chmod(ctx.run, 0o750)
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    apagar_se_existe(ctx.sock)
    antigo = os.umask(0o177)  # o socket nasce 0600 e só depois abre para o grupo: sem janela 0777
    try:
        s.bind(ctx.sock)
    finally:
        os.umask(antigo)
    if os.geteuid() == 0:
        os.chown(ctx.sock, 0, ctx.gid_agente)
    os.chmod(ctx.sock, 0o660)
    s.listen(4)
    log(f"dash-agent-root {VERSAO} ouvindo em {ctx.sock}")
    while True:
        conn, _ = s.accept()
        with conn:  # serializa: um pedido por vez
            try:
                atender(ctx, conn)
            except OSError as e:
                log("conexão perdida: " + limpar(repr(e), 200))


def pos_renovacao(ctx):
    # Gancho de deploy do certbot (instalado pelo instalador em renewal-hooks/deploy). Só age nos
    # certificados do painel; nginx -t antes do reload para nunca derrubar o que está no ar.
    linhagem = os.environ.get("RENEWED_LINEAGE", "")
    if linhagem and not os.path.basename(linhagem.rstrip("/")).startswith("dash-"):
        return 0
    with trava(ctx):
        t = executar(ctx, ["nginx", "-t"], 20)
        if t.returncode != 0:
            log("nginx -t falhou depois da renovação; nada recarregado: " + (t.stdout + t.stderr)[-500:])
            return 1
        return executar(ctx, ["systemctl", "reload", "nginx"], 30).returncode


# Só no modo teste: o que o instalador deixaria pronto para o nginx (falso) aceitar os vhosts.
BASE_DE_TESTE = {
    "etc/nginx/snippets/dash-agent-cabecalhos.conf": AVISO_GERADO + '\nadd_header X-Content-Type-Options "nosniff" always;\n',
    "etc/nginx/snippets/dash-agent-tls.conf": AVISO_GERADO + "\nssl_protocols TLSv1.2 TLSv1.3;\n",
}


def preparar_raiz_de_teste(ctx):
    for pasta in (ctx.sa, ctx.se, os.path.join(ctx.nginx, "snippets"), os.path.join(ctx.nginx, "conf.d"), ctx.live, ctx.acme,
                  ctx.estado_dir, os.path.dirname(ctx.run)):
        os.makedirs(pasta, exist_ok=True)
    for rel, texto in BASE_DE_TESTE.items():
        caminho = os.path.join(ctx.raiz, rel)
        if not os.path.exists(caminho):
            escrever_atomico(caminho, texto)


def montar_contexto(args):
    if args.modo_teste:
        if not args.raiz or not os.path.isabs(args.raiz) or args.uid_agente is None:
            raise SystemExit("--modo-teste exige --raiz absoluta e --uid-agente.")
        falsos = args.falsos
        if args.executor == "simulado" and not falsos:  # no repositório: tests/agente/falsos
            falsos = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../tests/agente/falsos"))
            if not os.path.isdir(falsos):
                raise SystemExit("--executor simulado exige --falsos DIR.")
        gid_agente = os.getgid()
        if os.geteuid() == 0 and args.uid_agente != 0:
            # E2E com separação real de usuário (ajudante como root, agente como outro uid): a pasta
            # e o socket abrem para o grupo do usuário do agente, como o dashagent na produção.
            # Com o gid do root, o agente levaria EACCES no connect e nem chegaria ao SO_PEERCRED.
            try:
                gid_agente = pwd.getpwuid(args.uid_agente).pw_gid
            except KeyError:
                raise SystemExit("--uid-agente não existe neste sistema.") from None
        ctx = Contexto(
            raiz=args.raiz, uid_agente=args.uid_agente, gid_agente=gid_agente, executor=args.executor,
            falsos=os.path.abspath(falsos) if falsos else None, porta_sonda=args.porta_sonda, modo_teste=True,
        )
        preparar_raiz_de_teste(ctx)
        return ctx
    if args.raiz or args.executor != "real" or args.falsos or args.uid_agente is not None or args.porta_sonda is not None:
        raise SystemExit("Opções de teste só valem com --modo-teste.")
    if os.geteuid() != 0:
        raise SystemExit("O ajudante precisa rodar como root.")
    try:
        u = pwd.getpwnam("dashagent")
    except KeyError:
        raise SystemExit("O usuário dashagent não existe. Rode o instalador de novo.") from None
    return Contexto(uid_agente=u.pw_uid, gid_agente=u.pw_gid)


def main(argv=None):
    cli = argparse.ArgumentParser(prog="dash-agent-root", description="Ajudante root do Servidor do Funil " + VERSAO)
    cli.add_argument("comando", choices=("servir", "pos-renovacao"))
    cli.add_argument("--modo-teste", action="store_true")
    cli.add_argument("--raiz", default=None)
    cli.add_argument("--uid-agente", type=int, default=None)
    cli.add_argument("--executor", choices=("real", "simulado"), default="real")
    cli.add_argument("--falsos", default=None)
    cli.add_argument("--porta-sonda", type=int, default=None)
    args = cli.parse_args(argv)
    ctx = montar_contexto(args)
    if args.comando == "servir":
        servir(ctx)
        return 0
    return pos_renovacao(ctx)


if __name__ == "__main__":
    sys.exit(main())
