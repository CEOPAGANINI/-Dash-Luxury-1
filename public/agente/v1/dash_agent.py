#!/usr/bin/env python3
"""dash-agent 1.0.0 - agente do Servidor do Funil. Roda como dashagent (sem privilégio).

Busca no painel, por HTTPS, tarefas assinadas; baixa o ZIP, extrai e troca a versão no ar.
Nginx e certbot ficam com o ajudante root (dash_agent_root.py), pedidos por um socket Unix
que só aceita 6 operações. Só biblioteca padrão, Python 3.10 ou mais novo: nada de API que
só existe a partir do 3.11 (o teste de compatibilidade confere).
"""
import argparse
import errno
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import socket
import ssl
import stat
import struct
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
import uuid
import zipfile
import zlib
from base64 import urlsafe_b64decode
from datetime import datetime, timezone

VERSAO, P_PEDIDO, P_TAREFA = "1.0.0", "dash-vps-pedido-v1", "dash-vps-tarefa-v1"
TIPOS = {  # tipo -> chaves EXATAS dos params (chave a mais ou a menos é recusa)
    "servidor.coletar": (),
    "site.configurar": ("siteId", "slug", "dominios", "principal", "origemCheckout", "checkout", "tls"),
    "site.publicar": ("siteId", "slug", "versaoId", "artefatoId", "sha256", "bytes"),
    "site.ativar_versao": ("siteId", "slug", "versaoId"),
    "site.ssl_emitir": ("siteId", "slug", "dominios", "email"),
    "site.remover": ("siteId", "slug"),
}
SO_LEITURA = {"servidor.coletar"}
R_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
R_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
R_SHA = re.compile(r"^[0-9a-f]{64}$")
R_ROTULO = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
R_TLD = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")
R_LOCAL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}$")  # nunca começa com '-' (viraria opção do certbot)
R_CHK = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")
# Sem ponto inicial (nada de dotfile nem '..'), sem controle nem / \ < > : " | ? *; o resto em segmento_ok
R_SEG = re.compile(r'^[^.\x00-\x1f\x7f-\x9f\/\\<>:"|?*][^\x00-\x1f\x7f-\x9f\/\\<>:"|?*]*$')
R_IPV4 = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
R_TIPO = re.compile(r"^[a-z][a-z._]{0,63}$")
R_CODIGO = re.compile(r"^[A-Za-z0-9_-]{43}$")
R_B64URL = re.compile(r"^[A-Za-z0-9_-]{43}=?$")
R_PAINEL = re.compile(r"^https://[a-z0-9.-]+(?::[0-9]{1,5})?$")
R_PAINEL_TESTE = re.compile(r"^http://(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$")
SUFIXOS_BASE = ("localhost", "local", "internal", "invalid", "test", "example", "arpa")
SUFIXOS_SITE = SUFIXOS_BASE + ("vercel.app",)  # um site na VPS não pode ser *.vercel.app; a ORIGEM do app pode
# Igual a SLUGS_RESERVADOS de modelo.ts: "000-padrao" era o servidor padrão do instalador antigo
# (dash-000-padrao.conf), que um site com esse slug sobrescreveria.
SLUGS_RESERVADOS = ("000-padrao",)
IGNORAR_NO_ZIP = ("__MACOSX/",)
IGNORAR_NOME = {".DS_Store", "Thumbs.db", "desktop.ini", ".htaccess"}  # e todo nome que começa com "._"
EXT = set("html htm css js mjs json txt xml webmanifest map svg png jpg jpeg gif webp avif ico woff woff2 ttf otf eot mp4 webm mp3 pdf".split())
LIM = {"zip": 3_000_000, "arquivos": 2000, "arquivo": 20 << 20, "total": 50 << 20, "json": 256 << 10}
LIM_VISAO = 64 * 1024  # o parser do painel recusa mais que isso (OUTPUT_LIMIT_BYTES)
SEQ_MAX = 2**53 - 1  # Number.MAX_SAFE_INTEGER: o painel recusa seq acima disso (Number.isSafeInteger)
MARCADOR = ".dash-release.json"
# Dono da pasta <slug>: o siteId que a criou. O slug só é único dentro de UM servidor do painel, e a
# mesma VPS pode ter pastas de outro (servidor removido do painel, que "continua servindo os sites",
# e a VPS registrada de novo). Fica fora de current/: o nginx não serve este arquivo.
MARCADOR_SITE = ".dash-site.json"
MANTER_VERSOES = 5  # a ativa + as 4 mais novas; voltar usa estas cópias, sem reenviar nada
AMBIENTE_FIXO = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"}

# Idêntico a OVERVIEW_COMMAND de src/features/vps/overview.ts (o teste de compatibilidade compara os dois).
# Roda como dashagent, sem nenhum valor vindo de fora: é o único script de shell do agente.
OVERVIEW = r"""export LC_ALL=C
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
printf 'ORBIT_VPS_V1\n'
if [ "$(uname -s 2>/dev/null)" != "Linux" ]; then
  printf 'platform\tunsupported\nEND_ORBIT_VPS_V1\n'
  exit 0
fi
printf 'platform\tlinux\n'
printf 'hostname\t'; uname -n 2>/dev/null
awk '/^PRETTY_NAME=/ { sub(/^PRETTY_NAME=/, ""); sub(/^"/, ""); sub(/"$/, ""); gsub(/\t/, " "); print "os\t" $0; exit }' /etc/os-release 2>/dev/null
awk 'NR == 1 { print "uptime\t" $1; exit }' /proc/uptime 2>/dev/null
awk '$1 == "cpu" { sum=0; for(i=2;i<=9;i++)sum+=$i; printf "cpu_before\t%.0f\t%.0f\n",sum,$5+$6 } /^cpu[0-9]+ / { cores++ } END { if(cores>0)print "cores\t" cores }' /proc/stat 2>/dev/null
sleep 1
awk '$1 == "cpu" { sum=0; for(i=2;i<=9;i++)sum+=$i; printf "cpu_after\t%.0f\t%.0f\n",sum,$5+$6; exit }' /proc/stat 2>/dev/null
awk '$1 == "MemTotal:" { total=$2 } $1 == "MemAvailable:" { available=$2; found=1 } END { if(total>0 && found)printf "memory\t%.0f\t%.0f\n",total,total-available }' /proc/meminfo 2>/dev/null
df -Pk / 2>/dev/null | awk 'NR == 2 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ { print "disk\t" $2 "\t" $3 }'
(if command -v getent >/dev/null 2>&1; then getent passwd 2>/dev/null; else cat /etc/passwd 2>/dev/null; fi) | awk -F: 'NF >= 7 && $3 ~ /^[0-9]+$/ { print "user\t" $1 "\t" $3 "\t" $6 "\t" $7; count++; if(count>=100)exit }'
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  for service in nginx apache2 mysql postgresql docker; do
    systemctl show "$service.service" --property=LoadState --property=ActiveState --no-pager 2>/dev/null | awk -F= -v name="$service" '$1 == "LoadState" { load=$2 } $1 == "ActiveState" { active=$2 } END { state="unknown"; if(load=="not-found")state="not-installed"; else if(active ~ /^(active|inactive|failed|activating|deactivating|reloading|maintenance)$/)state=active; print "service\t" name "\t" state }'
  done
else
  printf 'services_unavailable\t1\n'
fi
printf 'END_ORBIT_VPS_V1\n'
"""

# Idêntica a PAGINA_DE_ESPERA de src/features/vps/modelo.ts: a conferência "No ar" do painel
# compara o corpo byte a byte com ela para dizer "Mostra a página de espera". Só ASCII (o acento
# vai como &atilde;): nenhuma chance de o byte a byte divergir por codificação.
PAGINA_DE_ESPERA = (
    "<!doctype html>\n"
    '<html lang="pt-BR">\n'
    "<head>\n"
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '<meta name="robots" content="noindex">\n'
    "<title>Em breve</title>\n"
    "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;"
    "font-family:system-ui,sans-serif;background:#fafafa;color:#333}"
    "p{margin:0;padding:24px;text-align:center}</style>\n"
    "</head>\n"
    "<body>\n"
    "<p>Este site ainda n&atilde;o foi publicado.</p>\n"
    "</body>\n"
    "</html>\n"
)


class Recusa(Exception):
    """Recusa com código estável (vai para o painel como "codigo: mensagem")."""

    def __init__(self, codigo, msg=""):
        super().__init__(msg or codigo)
        self.codigo = codigo


class Revogado(Exception):
    pass


class RelogioFora(Exception):
    pass


class TentarDeNovo(Exception):
    pass


class Espere(Exception):
    def __init__(self, segundos):
        super().__init__(f"espere {segundos} s")
        self.segundos = segundos


class JaConhecida(Exception):
    """Reentrega: a tarefa já está no diário. Reenvia o resultado, nunca reexecuta."""

    def __init__(self, registro):
        super().__init__("tarefa já conhecida")
        self.registro = registro


def relogio():
    # Um ponto só para ler a hora: os testes adiantam e atrasam o relógio por aqui.
    return time.time()


def iso(momento=None):
    d = datetime.fromtimestamp(relogio() if momento is None else momento, tz=timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"  # igual ao toISOString do JS


def limpar(texto, maximo=2000):
    return re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", str(texto))[:maximo]


def texto_limpo(texto, maximo):
    """Sem NENHUM caractere de controle (nem tab nem quebra): é o textoLimpo do protocolo.ts."""
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", "", str(texto))[:maximo]


def resumo(e):
    return limpar(f"{type(e).__name__}: {e}", 300)


def log(msg):
    print(limpar(msg, 1000), file=sys.stderr, flush=True)


def sair(codigo, msg):
    print(msg, file=sys.stderr, flush=True)
    raise SystemExit(codigo)


# --- Regras compartilhadas (§8.1): as mesmas de modelo.ts e de dash_agent_root.py ------------------


def _sufixo(d, lista):
    return any(d == s or d.endswith("." + s) for s in lista)


def host_ok(d):  # HOST: sintaxe de nome público, já em minúsculo/punycode (quem normaliza é o painel)
    if not isinstance(d, str) or len(d) > 253 or R_IPV4.fullmatch(d):
        return False
    p = d.split(".")
    return len(p) >= 2 and all(R_ROTULO.fullmatch(x) for x in p) and bool(R_TLD.fullmatch(p[-1])) and not _sufixo(d, SUFIXOS_BASE)


def dominio_ok(d):  # DOMINIO_SITE
    return host_ok(d) and not _sufixo(d, SUFIXOS_SITE)


def origem_ok(o):  # ORIGEM: https + HOST, sem porta nem caminho; aceita *.vercel.app
    return isinstance(o, str) and o.startswith("https://") and host_ok(o[8:])


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


def _texto(v, regex):
    return isinstance(v, str) and bool(regex.fullmatch(v))


def slug_ok(s):  # SLUG: a regex e fora da lista de reservados
    return _texto(s, R_SLUG) and s not in SLUGS_RESERVADOS


def validar_params(tipo, p):
    if not isinstance(p, dict) or sorted(p) != sorted(TIPOS[tipo]):
        raise Recusa("params_invalidos", "chaves")

    def exige(ok, campo):
        if not ok:
            raise Recusa("params_invalidos", campo)

    for k in ("siteId", "versaoId", "artefatoId"):
        if k in p:
            exige(_texto(p[k], R_UUID), k)
    if "slug" in p:
        exige(slug_ok(p["slug"]), "slug")
    if "dominios" in p:
        ds = p["dominios"]
        exige(
            isinstance(ds, list) and 1 <= len(ds) <= 4 and all(isinstance(d, str) for d in ds)
            and len(set(ds)) == len(ds) and all(dominio_ok(d) for d in ds),
            "dominios",
        )
    if "principal" in p:
        exige(isinstance(p["principal"], str) and p["principal"] in p["dominios"], "principal")
    if "origemCheckout" in p:
        exige(origem_ok(p["origemCheckout"]), "origemCheckout")
    if "checkout" in p:
        exige(checkout_ok(p["checkout"], p["origemCheckout"]), "checkout")
    if "tls" in p:
        exige(isinstance(p["tls"], bool), "tls")
    if "sha256" in p:
        exige(_texto(p["sha256"], R_SHA), "sha256")
    if "bytes" in p:
        exige(type(p["bytes"]) is int and 1 <= p["bytes"] <= LIM["zip"], "bytes")
    if "email" in p:
        exige(email_ok(p["email"]), "email")


def _sem_duplicadas(pares):
    d = {}
    for k, v in pares:
        if k in d:  # JSON.parse e json.loads ficam com a última; chave repetida é sempre recusa
            raise ValueError("chave repetida: " + limpar(k, 40))
        d[k] = v
    return d


def _sem_constantes(nome):
    raise ValueError("constante não permitida: " + nome)


def json_estrito(texto):
    return json.loads(texto, object_pairs_hook=_sem_duplicadas, parse_constant=_sem_constantes)


def canonico_pedido(metodo, caminho, servidor_id, seq, corpo):
    """Igual a canonicoPedido de src/features/vps/chaves.ts (vetores em tests/fixtures/vps/vetores-protocolo.json)."""
    return "\n".join([P_PEDIDO, metodo, caminho, servidor_id, str(seq), hashlib.sha256(corpo).hexdigest()])


def mensagem_tarefa(servidor_id, t):
    """Igual a mensagemTarefa de src/features/vps/chaves.ts."""
    return "\n".join([P_TAREFA, servidor_id, t["id"], str(t["seq"]), t["tipo"], str(t["expiraEm"]), t["params"]])


def assinar(chave, texto):
    return hmac.new(chave, texto.encode("utf-8"), hashlib.sha256).hexdigest()


def b64d(texto):
    if not isinstance(texto, str) or not R_B64URL.fullmatch(texto):
        raise ValueError("chave em base64url inválida")
    chave = urlsafe_b64decode(texto.rstrip("=") + "=")
    if len(chave) != 32:
        raise ValueError("chave precisa de 32 bytes")
    return chave


# --- Arquivos locais -------------------------------------------------------------------------


class Caminhos:  # em --modo-teste tudo fica sob --raiz
    def __init__(self, raiz="/"):
        j = lambda *a: os.path.join(raiz, *a)  # noqa: E731
        self.raiz = raiz
        self.lib, self.www, self.travas = j("var/lib/dash-agent"), j("var/www/dash-funil"), j("etc/dash-agent/travas.json")
        self.sock = j("run/dash-agent-root/root.sock")
        self.os_release = j("etc/os-release")
        self.config, self.estado, self.diario, self.tmp, self.revogado = (
            os.path.join(self.lib, x) for x in ("agente.json", "estado.json", "diario", "tmp", "revogado")
        )

    def site(self, slug):
        if not slug_ok(slug):  # defesa extra: o slug já passou pela validação dos params
            raise Recusa("params_invalidos", "slug")
        return os.path.join(self.www, slug)


def ler_json(caminho, padrao=None):
    # O_NONBLOCK + S_ISREG: um FIFO (ou device) no lugar do JSON travaria o open/read para sempre, e
    # o "sudo dash-agent status" lê como root arquivos que o dashagent pode trocar. Vira ValueError,
    # o mesmo de um JSON estragado, que quem chama já trata.
    try:
        fd = os.open(caminho, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        if padrao is not None:
            return dict(padrao)
        raise
    with os.fdopen(fd, "rb") as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
            raise ValueError("não é um arquivo comum: " + limpar(os.path.basename(caminho), 80))
        bruto = f.read(1 << 20)
    return json.loads(bruto)


def _fsync_pasta(pasta):
    fd = os.open(pasta, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def gravar_json(caminho, dados, modo=0o600):
    # Grava ao lado e troca com rename(2): quem lê nunca vê meio arquivo, e o fsync garante
    # que a seq gravada sobrevive a uma queda de energia ANTES de o pedido sair.
    tmp = caminho + ".novo-" + secrets.token_hex(4)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, modo)
    try:
        os.fchmod(fd, modo)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(dados, f, separators=(",", ":"))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, caminho)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise
    _fsync_pasta(os.path.dirname(caminho))


def gravar_json_0600(caminho, dados):
    gravar_json(caminho, dados, 0o600)


def apagar_se_existe(caminho):
    try:
        os.unlink(caminho)
    except FileNotFoundError:
        pass


def exigir_dir_real(caminho):
    try:
        st = os.lstat(caminho)
    except FileNotFoundError:
        raise Recusa("pasta_ausente", os.path.basename(caminho)) from None
    if not stat.S_ISDIR(st.st_mode):  # lstat: um link simbólico nunca passa por pasta
        raise Recusa("pasta_invalida", os.path.basename(caminho))
    return caminho


def criar_dir_real(caminho, modo=0o755):
    try:
        os.mkdir(caminho, modo)
        os.chmod(caminho, modo)  # o umask do teste pode ser outro; o nginx (www-data) precisa de 0755
    except FileExistsError:
        pass
    return exigir_dir_real(caminho)


def escrever_se_diferente(caminho, dados, modo=0o644):
    try:
        fd = os.open(caminho, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as f:
            if f.read(len(dados) + 1) == dados:
                return False
    except (FileNotFoundError, OSError):
        pass
    tmp = os.path.join(os.path.dirname(caminho), ".novo-" + secrets.token_hex(4))
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, modo)
    try:
        os.fchmod(fd, modo)
        with os.fdopen(fd, "wb") as f:
            f.write(dados)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, caminho)
    except BaseException:
        apagar_se_existe(tmp)
        raise
    return True


def gravar_exclusivo(caminho, dados):
    fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    os.fchmod(fd, 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(dados, f, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())


def sha256_arquivo(caminho):
    h = hashlib.sha256()
    fd = os.open(caminho, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as f:
        while True:
            b = f.read(65536)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def ler_travas(cam):
    padrao = {"pausado": False, "somenteLeitura": False}
    try:
        t = ler_json(cam.travas)
    except FileNotFoundError:
        return padrao
    except (OSError, ValueError):
        return {"pausado": True, "somenteLeitura": True}  # arquivo estragado: falha fechada
    if not isinstance(t, dict):
        return {"pausado": True, "somenteLeitura": True}
    return {"pausado": t.get("pausado") is True, "somenteLeitura": t.get("somenteLeitura") is True}


# --- Cliente HTTP assinado ---------------------------------------------------------------------


class SemRedirecionar(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None  # 307 para /login vira ERRO, nunca sucesso


def eh_revogacao(e, corpo):  # só a marca do Dash revoga; 401 da proteção da Vercel ou de um firewall não
    if e.code != 401 or not (e.headers.get("WWW-Authenticate", "") or "").startswith("Dash-HMAC"):
        return False
    try:
        return json.loads(corpo).get("error") == "unauthorized"
    except Exception:
        return False


def _ler_ate(resposta, limite):
    partes, total = [], 0
    while total <= limite:
        b = resposta.read(min(65536, limite + 1 - total))
        if not b:
            break
        partes.append(b)
        total += len(b)
    return b"".join(partes)


def _ler_corpo_erro(e):
    try:
        return e.read(4096) or b"{}"
    except Exception:
        return b"{}"


def montar_opener(modo_teste):
    handlers = [SemRedirecionar, urllib.request.HTTPSHandler(context=ssl.create_default_context())]
    if modo_teste:
        handlers.append(urllib.request.ProxyHandler({}))  # o painel falso fica em 127.0.0.1: nada de proxy
    return urllib.request.build_opener(*handlers)


def painel_ok(painel, modo_teste):
    return bool(R_PAINEL.fullmatch(painel) or (modo_teste and R_PAINEL_TESTE.fullmatch(painel)))


def aprender_desvio(estado_path, agora_ms, t0, t1):
    # O painel manda a hora dele em todo pulso. Só muda o desvio guardado quando a diferença
    # passa de 30 s: evita reescrever o estado a cada pedido por causa da latência.
    if type(agora_ms) is not int or not (1_500_000_000_000 < agora_ms < 4_200_000_000_000):
        return
    novo = agora_ms - int((t0 + t1) / 2 * 1000)
    est = ler_json(estado_path)
    if abs(novo - int(est.get("desvioMs", 0))) > 30_000:
        est["desvioMs"] = novo
        gravar_json_0600(estado_path, est)


class Cliente:
    def __init__(self, cfg, estado_path, modo_teste):
        painel = str(cfg.get("painel", "")).rstrip("/")
        if not painel_ok(painel, modo_teste):
            raise SystemExit("O painel precisa ser https://")
        self.painel, self.cfg, self.estado_path, self.trava = painel, cfg, estado_path, threading.Lock()
        self.chave_pedidos = b64d(cfg["chavePedidos"])
        self.opener = montar_opener(modo_teste)

    def agora_ms(self):
        return int(relogio() * 1000) + int(ler_json(self.estado_path).get("desvioMs", 0))

    def pedir(self, metodo, caminho, corpo=None, limite=LIM["json"], binario=False):
        try:
            return self._pedir(metodo, caminho, corpo, limite, binario, primeira=True)
        except TentarDeNovo:  # fora da trava: a seq já foi reposicionada pelo 409
            return self._pedir(metodo, caminho, corpo, limite, binario, primeira=False)

    def _pedir(self, metodo, caminho, corpo, limite, binario, primeira):
        dados = b"" if corpo is None else json.dumps(corpo, separators=(",", ":")).encode()
        with self.trava:  # um pedido por vez: a seq sai em ordem
            est = ler_json(self.estado_path)
            seq = max(int(est.get("ultimaSeqPedido", 0)) + 1, int(relogio() * 1000) + int(est.get("desvioMs", 0)))
            if not 1 <= seq <= SEQ_MAX:
                raise Recusa("seq_fora", "seq fora do intervalo")
            est["ultimaSeqPedido"] = seq
            gravar_json_0600(self.estado_path, est)  # ANTES de enviar: um reinício nunca reusa a seq
            sig = assinar(self.chave_pedidos, canonico_pedido(metodo, caminho, self.cfg["servidorId"], seq, dados))
            cab = {
                "Authorization": "Bearer " + self.cfg["token"],
                "X-Dash-Servidor": self.cfg["servidorId"],
                "X-Dash-Seq": str(seq),
                "X-Dash-Assinatura": "v1=" + sig,
                "User-Agent": "dash-agent/" + VERSAO,
            }
            if metodo == "POST":
                cab["Content-Type"] = "application/json"
            req = urllib.request.Request(self.painel + caminho, data=dados if metodo == "POST" else None, method=metodo, headers=cab)
            t0 = relogio()
            try:
                with self.opener.open(req, timeout=60 if binario else 20) as r:
                    bruto = _ler_ate(r, limite)
                    if len(bruto) > limite:
                        raise Recusa("resposta_grande")
                    if binario:
                        return bruto
                    if "application/json" not in (r.headers.get("Content-Type", "") or ""):
                        raise Recusa("resposta_nao_json")
                    d = json.loads(bruto)
                    if not isinstance(d, dict):
                        raise Recusa("resposta_invalida")
                    aprender_desvio(self.estado_path, d.get("agoraMs"), t0, relogio())
                    return d
            except urllib.error.HTTPError as e:
                corpo_erro = _ler_corpo_erro(e)
                if eh_revogacao(e, corpo_erro):
                    raise Revogado() from None
                if e.code == 409:
                    try:
                        c = json.loads(corpo_erro)
                    except ValueError:
                        c = {}
                    erro = c.get("error") if isinstance(c, dict) else None
                    if erro in ("clock_skew", "replayed") and type(c.get("ultimaSeq")) is int and c["ultimaSeq"] >= 0:
                        est = ler_json(self.estado_path)
                        est["ultimaSeqPedido"] = c["ultimaSeq"]  # a seq recusada não foi consumida no painel
                        if erro == "clock_skew" and type(c.get("agora")) is int:
                            est["desvioMs"] = c["agora"] - int(relogio() * 1000)
                        gravar_json_0600(self.estado_path, est)
                        if primeira:
                            raise TentarDeNovo() from None
                        if erro == "clock_skew":
                            raise RelogioFora() from None
                if e.code == 429:
                    try:
                        espera = int(json.loads(corpo_erro).get("tenteEm", 5))
                    except Exception:
                        espera = 5
                    raise Espere(min(max(espera, 1), 300)) from None
                raise


def post_sem_assinatura(painel, caminho, corpo, modo_teste):
    opener = montar_opener(modo_teste)
    req = urllib.request.Request(
        painel + caminho,
        data=json.dumps(corpo, separators=(",", ":")).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "dash-agent/" + VERSAO},
    )
    with opener.open(req, timeout=30) as r:
        bruto = _ler_ate(r, LIM["json"])
        if len(bruto) > LIM["json"] or "application/json" not in (r.headers.get("Content-Type", "") or ""):
            raise Recusa("resposta_invalida")
        d = json.loads(bruto)
        if not isinstance(d, dict):
            raise Recusa("resposta_invalida")
        return d


# --- Canal com o ajudante root ------------------------------------------------------------------


def ler_linha(s, limite):
    partes, total = [], 0
    while True:
        b = s.recv(65536)
        if not b:
            break
        partes.append(b)
        total += len(b)
        if b"\n" in b or total > limite:
            break
    linha = b"".join(partes).split(b"\n", 1)[0]
    if len(linha) > limite:
        raise Recusa("resposta_grande")
    return linha


def pedir_root(ctx, op, args, timeout=60):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    ident = str(uuid.uuid4())
    try:
        try:
            s.connect(ctx.cam.sock)
        except OSError:
            raise Recusa("root_indisponivel", "O ajudante root não respondeu (dash-agent-root parado?).") from None
        # Confere quem está do outro lado: só o root (ou o uid do teste) responde por este socket.
        _pid, uid, _gid = struct.unpack("3i", s.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
        if uid not in ctx.uid_root:
            raise Recusa("root_falso", "O socket do ajudante não pertence ao root.")
        s.sendall(json.dumps({"id": ident, "op": op, "args": args}, separators=(",", ":")).encode() + b"\n")
        try:
            d = json.loads(ler_linha(s, 65536))
        except ValueError:
            raise Recusa("root_resposta_invalida", "O ajudante root não respondeu.") from None
    finally:
        s.close()
    if not isinstance(d, dict) or d.get("id") != ident:
        raise Recusa("root_resposta_invalida", "Resposta do ajudante root fora do formato.")
    if not d.get("ok"):
        raise Recusa(limpar(d.get("erro", "root_falhou"), 64), limpar(d.get("mensagem", ""), 2000))
    dados = d.get("dados")
    return dados if isinstance(dados, dict) else {}


# --- Contexto ------------------------------------------------------------------------------------


class Contexto:
    def __init__(self, args, exigir_registro=True):
        self.modo_teste = bool(args.modo_teste)
        self.cam = Caminhos(args.raiz if self.modo_teste else "/")
        # Dono esperado do socket do ajudante: root. No modo teste o ajudante pode rodar como o
        # próprio usuário do teste (ou como root no E2E), a menos que --uid-esperado diga qual.
        if self.modo_teste:
            self.uid_root = {args.uid_esperado} if args.uid_esperado is not None else {0, os.getuid()}
        else:
            self.uid_root = {0}
        self.espera_reenvio = 0.2 if self.modo_teste else 2.0
        self.cfg, self.cliente = None, None
        if exigir_registro:
            if os.path.exists(self.cam.revogado):
                sair(3, "O painel revogou este servidor. Rode: sudo dash-agent reconectar")
            try:
                self.cfg = ler_json(self.cam.config)
            except FileNotFoundError:
                sair(2, "Este servidor ainda não foi registrado. Cole o comando de instalação do painel.")
            self.cliente = Cliente(self.cfg, self.cam.estado, self.modo_teste)
        self.pulso_rapido = True
        self.proxima_visao = 0.0
        self.proximo_certificado = 0.0
        self.ultimos_ips = (0.0, [], [])


# --- Diário (idempotência da reentrega) -----------------------------------------------------------


def caminho_diario(ctx, ident):
    if not R_UUID.fullmatch(ident):  # o id só vira caminho depois da regex (e, fora daqui, da assinatura)
        raise Recusa("tarefa_malformada")
    return os.path.join(ctx.cam.diario, ident + ".json")


def ler_diario(ctx, ident):
    try:
        reg = ler_json(caminho_diario(ctx, ident))
    except FileNotFoundError:
        return None
    except ValueError:
        return {"id": ident, "estado": "falhou", "erro": "diario_ilegivel", "enviado": False}
    return reg if isinstance(reg, dict) else None


def diario(ctx, ident, registro):
    registro = dict(registro, id=ident, em=iso())
    gravar_json_0600(caminho_diario(ctx, ident), registro)
    return registro


def listar_diario(ctx):
    try:
        nomes = os.listdir(ctx.cam.diario)
    except FileNotFoundError:
        return []
    regs = []
    for n in sorted(nomes):
        if not n.endswith(".json") or not R_UUID.fullmatch(n[:-5]):
            continue
        reg = ler_diario(ctx, n[:-5])
        if reg is not None:
            regs.append(reg)
    return regs


def fechar_interrompidas(ctx):
    # 'executando' no disco ao iniciar = o processo caiu no meio. Nunca reexecuta: vira falha.
    for reg in listar_diario(ctx):
        if reg.get("estado") == "executando":
            diario(ctx, reg["id"], dict(reg, estado="falhou", erro="interrompida: o agente reiniciou no meio da tarefa", enviado=False))


def podar_diario(ctx, dias=7):
    limite = relogio() - dias * 86400
    for reg in listar_diario(ctx):
        if reg.get("estado") in ("concluida", "falhou") and reg.get("enviado"):
            caminho = caminho_diario(ctx, reg["id"])
            try:
                if os.lstat(caminho).st_mtime < limite:
                    os.unlink(caminho)
            except FileNotFoundError:
                pass


def postar_resultado(ctx, ident, seq, estado, resultado, erro, duracao_ms):
    corpo = {"seq": seq, "estado": estado, "resultado": resultado, "erro": None if erro is None else limpar(erro, 2000), "duracaoMs": int(duracao_ms)}
    return ctx.cliente.pedir("POST", f"/api/agente/v1/tarefas/{ident}/resultado", corpo)


def marcar_enviado(ctx, ident, descartado=None):
    reg = ler_diario(ctx, ident)
    if reg is None:
        return
    reg["enviado"] = True
    if descartado is not None:
        reg["descartado"] = descartado
    gravar_json_0600(caminho_diario(ctx, ident), reg)


def enviar_resultado(ctx, ident, seq, estado, resultado, erro, duracao_ms, com_diario=True):
    for tentativa in range(3):
        try:
            postar_resultado(ctx, ident, seq, estado, resultado, erro, duracao_ms)
            if com_diario:
                marcar_enviado(ctx, ident)
            return True
        except Revogado:
            raise
        except urllib.error.HTTPError as e:
            if e.code in (404, 409):  # o painel não quer mais este resultado: não insistir
                if com_diario:
                    marcar_enviado(ctx, ident, descartado=e.code)
                return False
            log(f"resultado de {ident} recusado ({e.code}); tento de novo")
        except Exception as e:
            log(f"resultado de {ident} não chegou: {resumo(e)}")
        if tentativa < 2:
            time.sleep(ctx.espera_reenvio * (tentativa + 1))
    return False  # fica 'enviado': False no diário; a próxima volta do laço reenvia


def reenviar_pendentes(ctx):  # roda em TODA volta do laço, não só no início
    for reg in listar_diario(ctx):
        if reg.get("estado") not in ("concluida", "falhou") or reg.get("enviado") or type(reg.get("seq")) is not int:
            continue
        try:
            postar_resultado(ctx, reg["id"], reg["seq"], reg["estado"], reg.get("resultado"), reg.get("erro"), reg.get("duracaoMs", 0))
            marcar_enviado(ctx, reg["id"])
        except Revogado:
            raise
        except urllib.error.HTTPError as e:
            if e.code in (404, 409):
                marcar_enviado(ctx, reg["id"], descartado=e.code)
            else:
                return  # painel com erro: tenta na próxima volta
        except Exception:
            return  # rede: tenta na próxima volta
    podar_diario(ctx)


# --- Verificação da tarefa (ordem do §4) ----------------------------------------------------------


def verificar_tarefa(ctx, t):
    # 1. formato
    chaves = ("id", "seq", "tipo", "params", "expiraEm", "assinatura")
    if not isinstance(t, dict) or sorted(t) != sorted(chaves):
        raise Recusa("tarefa_malformada")
    if not (
        _texto(t["id"], R_UUID) and type(t["seq"]) is int and 1 <= t["seq"] <= SEQ_MAX
        and _texto(t["tipo"], R_TIPO) and isinstance(t["params"], str) and len(t["params"]) <= 16384
        and type(t["expiraEm"]) is int and 0 < t["expiraEm"] <= SEQ_MAX and _texto(t["assinatura"], R_SHA)
    ):
        raise Recusa("tarefa_malformada")
    # 2. assinatura (antes de qualquer json.loads dos params)
    esperado = assinar(b64d(ctx.cfg["chaveTarefas"]), mensagem_tarefa(ctx.cfg["servidorId"], t))
    if not hmac.compare_digest(esperado, t["assinatura"]):
        raise Recusa("assinatura_invalida", "A assinatura da tarefa não confere.")
    # 3. diário: reentrega nunca reexecuta
    registro = ler_diario(ctx, t["id"])
    if registro is not None:
        raise JaConhecida(registro)
    # 4. validade
    agora = ctx.cliente.agora_ms() / 1000
    if t["expiraEm"] < agora - 120:
        raise Recusa("tarefa_expirada", "A tarefa venceu antes de chegar ao servidor.")
    if t["expiraEm"] > agora + 900 + 120:
        raise Recusa("tarefa_no_futuro", "A validade da tarefa está longe demais no futuro.")
    # 5. seq
    est = ler_json(ctx.cam.estado)
    if t["seq"] <= int(est.get("ultimaSeqTarefa", 0)):
        raise Recusa("tarefa_repetida", "Esta tarefa já foi executada ou é mais velha que a última.")
    # 6. tipo
    if t["tipo"] not in TIPOS:
        raise Recusa("tipo_desconhecido", "Este agente não conhece o tipo " + t["tipo"] + ".")
    # 7. travas locais
    travas = ler_travas(ctx.cam)
    if travas["pausado"] or (travas["somenteLeitura"] and t["tipo"] not in SO_LEITURA):
        raise Recusa("trava_local", "O dono travou este servidor na própria VPS.")
    # 8. parâmetros: chaves exatas e regex
    try:
        p = json_estrito(t["params"])
    except ValueError:
        raise Recusa("params_invalidos", "json") from None
    validar_params(t["tipo"], p)
    # 9. a seq é gravada (com fsync) ANTES de executar: uma tarefa nunca é revivida
    est["ultimaSeqTarefa"] = t["seq"]
    gravar_json_0600(ctx.cam.estado, est)
    return p


# --- ZIP e versões ------------------------------------------------------------------------------


def segmento_ok(s, utf8):
    # Igual a segmentoDoZipOk de modelo.ts. Até 255 BYTES (o limite de nome do Linux) e, com acento,
    # só nome marcado como UTF-8 no ZIP (bit 11) e já em NFC, como o editor do funil grava: sem a
    # marca, o zipfile lê cp437 (e o nome no disco sairia outro); em NFD, não casa com o link do HTML.
    if not R_SEG.fullmatch(s) or len(s.encode("utf-8")) > 255:
        return False
    return s.isascii() or (utf8 and unicodedata.is_normalized("NFC", s))


def eh_lixo(nome):
    base = nome.rstrip("/").rsplit("/", 1)[-1]
    return nome.startswith(IGNORAR_NO_ZIP) or base in IGNORAR_NOME or base.startswith("._")


def raiz_comum(infos):
    # Tira UMA pasta-raiz comum ("site/index.html" -> "index.html"), só quando TODAS as entradas
    # estão dentro dela. É a mesma regra do inspecionarZip do painel.
    nomes = [i.filename for i in infos]
    if not nomes or not all("/" in n for n in nomes):
        return ""
    primeiros = {n.split("/", 1)[0] for n in nomes}
    return primeiros.pop() + "/" if len(primeiros) == 1 else ""


def _abrir_subpasta(dir_fd, nome):
    try:
        os.mkdir(nome, 0o755, dir_fd=dir_fd)
    except FileExistsError:
        pass
    try:  # O_NOFOLLOW: se alguém trocou a pasta por um link, a abertura falha (ELOOP)
        fd = os.open(nome, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=dir_fd)
    except OSError:
        raise Recusa("zip_nome", nome) from None
    os.fchmod(fd, 0o755)
    return fd


def extrair(zip_path, destino):
    try:
        z = zipfile.ZipFile(zip_path)
    except (zipfile.BadZipFile, OSError):
        raise Recusa("zip_invalido", "O arquivo não é um ZIP válido.") from None
    with z:
        infos = [i for i in z.infolist() if not eh_lixo(i.filename)]
        prefixo = raiz_comum(infos)
        arquivos, vistos = {}, set()
        for i in infos:
            if i.flag_bits & 0x1:
                raise Recusa("zip_cifrado", i.filename)
            if (i.external_attr >> 16) & 0o170000 not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise Recusa("zip_link", i.filename)
            if i.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise Recusa("zip_metodo", i.filename)
            if i.is_dir():
                continue
            rel = i.filename[len(prefixo) :]
            partes = rel.split("/")
            utf8 = bool(i.flag_bits & 0x800)
            if "\\" in rel or not all(segmento_ok(s, utf8) for s in partes) or partes[0].startswith(".dash-"):
                raise Recusa("zip_nome", i.filename)
            if "." not in partes[-1] or partes[-1].rsplit(".", 1)[1].lower() not in EXT:
                raise Recusa("zip_extensao", i.filename)
            if rel.lower() in vistos:
                raise Recusa("zip_duplicado", i.filename)
            vistos.add(rel.lower())
            arquivos[rel] = i
        if "index.html" not in arquivos:
            raise Recusa("zip_sem_index", "O ZIP precisa de um index.html na raiz.")
        if len(arquivos) > LIM["arquivos"]:
            raise Recusa("zip_muitos_arquivos", f"{len(arquivos)} arquivos (o máximo é {LIM['arquivos']})")
        raiz_fd = os.open(destino, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        pastas = {"": raiz_fd}
        total = 0
        try:
            for rel, i in arquivos.items():
                partes = rel.split("/")
                atual = ""
                for seg in partes[:-1]:  # cada pasta aberta pelo fd da mãe: nunca segue link
                    prox = atual + "/" + seg if atual else seg
                    if prox not in pastas:
                        pastas[prox] = _abrir_subpasta(pastas[atual], seg)
                    atual = prox
                try:
                    fd = os.open(partes[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644, dir_fd=pastas[atual])
                except FileExistsError:
                    raise Recusa("zip_duplicado", i.filename) from None
                except OSError:
                    raise Recusa("zip_nome", i.filename) from None
                os.fchmod(fd, 0o644)
                n = 0
                try:
                    with os.fdopen(fd, "wb") as out, z.open(i) as src:  # z.open confere o CRC no fim
                        while True:
                            b = src.read(65536)
                            if not b:
                                break
                            n += len(b)
                            total += len(b)  # bytes REAIS, não os declarados no cabeçalho
                            if n > LIM["arquivo"] or total > LIM["total"]:
                                raise Recusa("zip_bomba", rel)
                            out.write(b)
                        out.flush()
                        os.fsync(out.fileno())
                except (zipfile.BadZipFile, EOFError, zlib.error):
                    raise Recusa("zip_corrompido", i.filename) from None
        finally:
            for fd in pastas.values():
                os.close(fd)
        return len(arquivos), total


def nome_do_alvo(base):
    try:
        alvo = os.readlink(os.path.join(base, "current"))
    except OSError:
        return None
    if alvo == "vazio":
        return "vazio"
    if alvo.startswith("releases/") and R_UUID.fullmatch(alvo[9:]):
        return alvo[9:]
    return None


RENAME_EXCHANGE, AT_FDCWD = 2, -100
VELHO_SAI_DEPOIS = 2.0  # segundos que o link antigo fica em disco depois de sair do ar


def _trocar_nomes(a, b):
    """renameat2(RENAME_EXCHANGE): troca os dois nomes de uma vez; False se o sistema não tem."""
    try:
        import ctypes

        libc = ctypes.CDLL(None, use_errno=True)
        f = libc.renameat2
    except (OSError, AttributeError):
        return False
    f.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    if f(AT_FDCWD, os.fsencode(a), AT_FDCWD, os.fsencode(b), RENAME_EXCHANGE) == 0:
        return True
    e = ctypes.get_errno()
    if e in (errno.EINVAL, errno.ENOSYS, errno.EOPNOTSUPP):
        return False
    raise OSError(e, os.strerror(e), b)


def apagar_links_velhos(base, idade=VELHO_SAI_DEPOIS):
    limite = time.time() - idade
    for n in os.listdir(base):
        if n.startswith(".current-"):
            caminho = os.path.join(base, n)
            try:
                st = os.lstat(caminho)
                if stat.S_ISLNK(st.st_mode) and st.st_ctime < limite:
                    os.unlink(caminho)
            except FileNotFoundError:
                pass


def trocar_current(base, alvo_rel):  # alvo_rel = "releases/<uuid>" ou "vazio"
    # Medido num ext4 (kernel 6.18): com rename(2) por cima do link, uma busca de caminho que
    # atravessa "current" no mesmo instante vê ENOENT de vez em quando (~1 em 20 mil trocas), porque
    # o link antigo é apagado no meio dela: seria um 404 no nginx. Com RENAME_EXCHANGE nenhum nome
    # some, e o link antigo (que fica com o nome temporário) só é apagado segundos depois: 0 em 100 mil.
    exigir_dir_real(os.path.join(base, alvo_rel))
    apagar_links_velhos(base)
    atual = os.path.join(base, "current")
    tmp = os.path.join(base, ".current-" + secrets.token_hex(4))
    os.symlink(alvo_rel, tmp)
    try:
        if not (os.path.islink(atual) and _trocar_nomes(tmp, atual)):
            os.replace(tmp, atual)  # sem RENAME_EXCHANGE (ou sem current ainda): rename(2), atômico
    except BaseException:
        apagar_se_existe(tmp)
        raise


def ler_marcador(pasta, versao_id=None):
    try:
        m = ler_json(os.path.join(pasta, MARCADOR))
    except (FileNotFoundError, OSError, ValueError):
        m = None
    if not isinstance(m, dict):
        m = None
    if versao_id is not None and (m is None or m.get("versaoId") != versao_id):
        raise Recusa("versao_inexistente", "Esta versão não está guardada no servidor.")
    return m or {}


def podar(base, manter=MANTER_VERSOES):
    rels = os.path.join(base, "releases")
    ativa = nome_do_alvo(base)
    versoes = []
    for n in os.listdir(rels):
        caminho = os.path.join(rels, n)
        try:
            st = os.lstat(caminho)
        except FileNotFoundError:
            continue
        if n.startswith(".tmp-"):  # sobra de uma extração que caiu no meio
            if stat.S_ISDIR(st.st_mode) and st.st_mtime < relogio() - 3600:
                shutil.rmtree(caminho, ignore_errors=True)
            continue
        if not R_UUID.fullmatch(n) or not stat.S_ISDIR(st.st_mode):
            continue
        versoes.append((str(ler_marcador(caminho).get("extraidaEm") or ""), st.st_mtime, n))
    outras = sorted((v for v in versoes if v[2] != ativa), reverse=True)
    vagas = manter - (1 if any(v[2] == ativa for v in versoes) else 0)
    removidas = sorted(v[2] for v in outras[max(vagas, 0) :])
    for n in removidas:
        shutil.rmtree(os.path.join(rels, n), ignore_errors=True)  # rmtree por fd: não segue links
    return removidas


def baixar_artefato(ctx, p):
    dados = ctx.cliente.pedir("GET", f"/api/agente/v1/artefatos/{p['artefatoId']}", limite=p["bytes"], binario=True)
    if len(dados) != p["bytes"]:
        raise Recusa("artefato_tamanho", "O ZIP baixado não tem o tamanho assinado.")
    if not hmac.compare_digest(hashlib.sha256(dados).hexdigest(), p["sha256"]):
        raise Recusa("artefato_sha", "O ZIP baixado não confere com o sha256 assinado.")
    criar_dir_real(ctx.cam.tmp, 0o700)
    caminho = os.path.join(ctx.cam.tmp, secrets.token_hex(8) + ".zip")
    fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(dados)
        f.flush()
        os.fsync(f.fileno())
    return caminho


# --- Executores das 6 tarefas ---------------------------------------------------------------------


def dono_da_pasta(base):
    """siteId gravado em <slug>/.dash-site.json, ou None (sem marcador, ilegível ou fora do formato)."""
    try:
        m = ler_json(os.path.join(base, MARCADOR_SITE))
    except (OSError, ValueError):
        return None
    site_id = m.get("siteId") if isinstance(m, dict) else None
    return site_id if _texto(site_id, R_UUID) else None


def recusa_de_outro_site(base):
    return Recusa(
        "slug_de_outro_site",
        f"A pasta {os.path.basename(base)} desta VPS é de outro site (outro servidor do painel ou uma instalação "
        "anterior). Nada foi mudado.",
    )


def exigir_dono(base, site_id):
    # Antes de mexer em qualquer coisa da pasta: publicar, voltar versão e podar numa pasta de outro
    # site trocariam o que está no ar lá e apagariam as versões dele.
    if dono_da_pasta(base) != site_id:
        raise recusa_de_outro_site(base)
    return base


def reservar_pasta(base, site_id):
    """site.configurar: cria <slug>/ com o marcador do dono, ou confere o dono da pasta que já existe."""
    criar_dir_real(base)
    dono = dono_da_pasta(base)
    if dono == site_id:
        return base
    # Pasta sem marcador mas com conteúdo (ou com um marcador ilegível) também não é deste site.
    if dono is not None or any(os.path.lexists(os.path.join(base, n)) for n in ("releases", "vazio", "current", MARCADOR_SITE)):
        raise recusa_de_outro_site(base)
    try:
        gravar_exclusivo(os.path.join(base, MARCADOR_SITE), {"v": 1, "siteId": site_id, "criadaEm": iso()})
    except FileExistsError:
        exigir_dono(base, site_id)  # outra execução gravou no meio: vale o que ficou lá
    return base


def t_publicar(ctx, p):
    base = exigir_dir_real(ctx.cam.site(p["slug"]))  # quem cria a pasta é o site.configurar
    exigir_dono(base, p["siteId"])
    rels = exigir_dir_real(os.path.join(base, "releases"))
    final = os.path.join(rels, p["versaoId"])
    if os.path.lexists(final):
        m = ler_marcador(final)
        if m.get("versaoId") == p["versaoId"] and hmac.compare_digest(str(m.get("sha256", "")), p["sha256"]):
            r = ativar(ctx, p, repetida=True)
            extras = {"arquivos": m.get("arquivos"), "bytesDescompactados": m.get("bytes"), "indexSha256": m.get("indexSha256")}
            r.update({k: v for k, v in extras.items() if v is not None}, removidas=podar(base))
            return r
        raise Recusa("versao_existe", "Já existe no servidor uma versão com este id e outro conteúdo.")
    zip_tmp = baixar_artefato(ctx, p)
    tmp = os.path.join(rels, ".tmp-" + secrets.token_hex(8))
    os.mkdir(tmp, 0o755)
    os.chmod(tmp, 0o755)
    try:
        n, total = extrair(zip_tmp, tmp)
        idx = sha256_arquivo(os.path.join(tmp, "index.html"))
        gravar_exclusivo(  # marcador POR ÚLTIMO: pasta sem marcador nunca conta como versão pronta
            os.path.join(tmp, MARCADOR),
            {"v": 1, "versaoId": p["versaoId"], "sha256": p["sha256"], "arquivos": n, "bytes": total, "indexSha256": idx, "extraidaEm": iso()},
        )
        _fsync_pasta(tmp)
        os.rename(tmp, final)
        _fsync_pasta(rels)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    finally:
        apagar_se_existe(zip_tmp)
    r = ativar(ctx, p)
    r.update(arquivos=n, bytesDescompactados=total, indexSha256=idx, removidas=podar(base))
    return r


def ativar(ctx, p, repetida=False):
    base = exigir_dono(exigir_dir_real(ctx.cam.site(p["slug"])), p["siteId"])
    pasta = os.path.join(base, "releases", p["versaoId"])
    try:
        exigir_dir_real(pasta)
    except Recusa:
        raise Recusa("versao_inexistente", "Esta versão não está guardada no servidor.") from None
    ler_marcador(pasta, p["versaoId"])
    anterior = nome_do_alvo(base)
    trocar_current(base, "releases/" + p["versaoId"])
    return {"versaoId": p["versaoId"], "anterior": anterior, "ativadaEm": iso(), "repetida": repetida}


def t_configurar(ctx, p):
    exigir_dir_real(ctx.cam.www)
    base = reservar_pasta(ctx.cam.site(p["slug"]), p["siteId"])  # antes do nginx: o vhost dash-<slug> é do dono da pasta
    for d in (os.path.join(base, "releases"), os.path.join(base, "vazio")):
        criar_dir_real(d, 0o755)
    escrever_se_diferente(os.path.join(base, "vazio", "index.html"), PAGINA_DE_ESPERA.encode("utf-8"))
    if not os.path.lexists(os.path.join(base, "current")):
        trocar_current(base, "vazio")
    args = {k: p[k] for k in ("slug", "dominios", "principal", "origemCheckout", "checkout", "tls")}
    try:
        return pedir_root(ctx, "nginx.aplicar", args)
    except Recusa as r:
        if r.codigo != "certificado_ausente" or not args["tls"]:
            raise
        d = pedir_root(ctx, "nginx.aplicar", dict(args, tls=False))  # VPS nova ou certificado apagado: cai para HTTP, honesto
        d["aviso"] = "certificado_ausente"
        return d  # d["modo"] == "http"


def t_ssl(ctx, p):
    return pedir_root(ctx, "ssl.emitir", {k: p[k] for k in ("slug", "dominios", "email")}, timeout=240)


def t_remover(ctx, p):
    base = ctx.cam.site(p["slug"])
    if os.path.lexists(base) and dono_da_pasta(base) != p["siteId"]:
        # A pasta (e com ela o vhost e o certificado dash-<slug>) é de outro site: deste não há nada
        # na VPS. Sai sem tocar em nada, e o painel pode tirar o site da lista.
        return {}
    pedir_root(ctx, "nginx.remover", {"slug": p["slug"]})
    pedir_root(ctx, "ssl.remover", {"slug": p["slug"]}, timeout=90)
    if not os.path.lexists(base):
        return {}  # nada a mover (já removido): o painel aceita movidoPara ausente, não null
    lixeira = criar_dir_real(os.path.join(ctx.cam.www, ".lixeira"))
    destino = os.path.join(lixeira, f"{p['slug']}-{int(relogio())}-{secrets.token_hex(3)}")
    os.rename(base, destino)  # sai do ar na hora; a pasta é apagada depois de 7 dias
    return {"movidoPara": destino}


def sem_usuarios(saida):
    # O painel descarta a lista de contas do sistema antes de gravar; ela nem sai da VPS.
    # Também mantém o resultado de servidor.coletar abaixo do teto de 32 KB da rota.
    return "".join(linha for linha in saida.splitlines(keepends=True) if not linha.startswith("user\t"))


def coletar_visao():
    try:
        r = subprocess.run(["/bin/sh", "-c", OVERVIEW], capture_output=True, timeout=15, env=dict(AMBIENTE_FIXO), stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        raise Recusa("coleta_demorou", "A leitura do servidor passou de 15 s.") from None
    return sem_usuarios(r.stdout[:LIM_VISAO].decode("utf-8", "replace"))


def t_coletar(ctx, p):
    return {"visaoGeral": coletar_visao()}


EXECUTORES = {
    "servidor.coletar": t_coletar,
    "site.configurar": t_configurar,
    "site.publicar": t_publicar,
    "site.ativar_versao": ativar,
    "site.ssl_emitir": t_ssl,
    "site.remover": t_remover,
}


# --- Pulso ---------------------------------------------------------------------------------------


def retrato_sites(ctx, maximo=200):
    try:
        nomes = sorted(os.listdir(ctx.cam.www))
    except FileNotFoundError:
        return []
    sites = []
    for slug in nomes:
        if not R_SLUG.fullmatch(slug):  # .lixeira e qualquer outra coisa ficam de fora
            continue
        base = os.path.join(ctx.cam.www, slug)
        try:
            if not stat.S_ISDIR(os.lstat(base).st_mode):
                continue
            rels = os.path.join(base, "releases")
            versoes = []
            for n in sorted(os.listdir(rels)) if os.path.isdir(rels) else []:
                pasta = os.path.join(rels, n)
                if R_UUID.fullmatch(n) and stat.S_ISDIR(os.lstat(pasta).st_mode) and ler_marcador(pasta).get("versaoId") == n:
                    versoes.append(n)
            versoes = versoes[:50]  # teto do painel; a poda deixa 5
        except OSError:
            continue
        sites.append({"slug": slug, "atual": nome_do_alvo(base), "versoes": versoes})
        if len(sites) >= maximo:
            break
    return sites


def descobrir_ipv4():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))  # UDP: nenhum pacote sai; só escolhe a interface da rota padrão
        ip = s.getsockname()[0]
    except OSError:
        return []
    finally:
        s.close()
    return [ip] if R_IPV4.fullmatch(ip) and not ip.startswith(("127.", "0.")) else []


def descobrir_ipv6():
    ips = []
    try:
        with open("/proc/net/if_inet6", encoding="ascii") as f:
            for linha in f:
                campos = linha.split()
                if len(campos) < 6 or campos[3] != "00" or campos[0].startswith(("fc", "fd")):
                    continue  # escopo 00 = global; fc00::/7 é rede privada
                h = campos[0]
                ip = ":".join(h[i : i + 4] for i in range(0, 32, 4))
                ips.append(socket.inet_ntop(socket.AF_INET6, socket.inet_pton(socket.AF_INET6, ip)))
    except (OSError, ValueError):
        return []
    return ips[:8]


def ips_atuais(ctx):
    em, v4, v6 = ctx.ultimos_ips
    if time.monotonic() - em > 300 or not em:
        v4, v6 = descobrir_ipv4(), descobrir_ipv6()
        ctx.ultimos_ips = (time.monotonic(), v4, v6)
    return v4, v6


def estado_do_root(ctx):
    try:
        return pedir_root(ctx, "estado", {}, timeout=60)
    except Recusa as r:
        log(f"estado do nginx indisponível: {r.codigo}")
        return None


def corpo_do_pulso(ctx, executando=None, extras=True):
    est = ler_json(ctx.cam.estado)
    v4, v6 = ips_atuais(ctx)
    corpo = {
        "versao": VERSAO,
        "travas": ler_travas(ctx.cam),
        "executando": executando,
        "desvioMs": int(est.get("desvioMs", 0)),
        "ipv4": v4,
        "ipv6": v6,
        "visaoGeral": None,
        "nginx": None,
        "certificados": None,
        "sites": retrato_sites(ctx),  # vai em todo pulso: é só listar pastas
    }
    if not extras:
        return corpo
    agora = time.monotonic()
    if agora >= ctx.proxima_visao:
        try:
            corpo["visaoGeral"] = coletar_visao()
        except Recusa as r:
            log(f"leitura do servidor falhou: {r.codigo}")
        root = estado_do_root(ctx)
        if root is not None:
            corpo["nginx"] = root.get("nginx")
            if agora >= ctx.proximo_certificado:
                corpo["certificados"] = root.get("certificados")
                ctx.proximo_certificado = agora + 6 * 3600
        ctx.proxima_visao = agora + (60 if ctx.pulso_rapido else 300)
    return corpo


def pulsar(ctx):
    r = ctx.cliente.pedir("POST", "/api/agente/v1/pulso", corpo_do_pulso(ctx))
    try:
        ctx.pulso_rapido = int(r.get("proximoPulsoEm", 30)) <= 5
    except (TypeError, ValueError):
        ctx.pulso_rapido = False
    return r


def pulso_de_fundo(ctx, ident):
    # Durante uma tarefa longa (certbot, ZIP grande) o painel precisa saber que o agente vive.
    # O pulso leva "executando": o painel não entrega outra tarefa nem reentrega esta.
    parar = threading.Event()

    def laco():
        while not parar.wait(30):
            try:
                ctx.cliente.pedir("POST", "/api/agente/v1/pulso", corpo_do_pulso(ctx, executando=ident, extras=False))
            except Exception as e:  # nunca derruba a tarefa; o laço principal trata revogação
                log("pulso de fundo falhou: " + resumo(e))

    th = threading.Thread(target=laco, name="pulso-de-fundo", daemon=True)
    th.start()

    def encerrar():
        parar.set()
        th.join(timeout=30)

    return encerrar


def processar(ctx, t):
    inicio = time.monotonic()
    duracao = lambda: int((time.monotonic() - inicio) * 1000)  # noqa: E731
    try:
        p = verificar_tarefa(ctx, t)
    except JaConhecida as j:  # reentrega: o que foi feito já está no diário
        reg = j.registro
        if reg.get("estado") == "executando":  # caiu no meio: nunca reexecuta
            reg = diario(ctx, t["id"], dict(reg, estado="falhou", erro="interrompida: o agente reiniciou no meio da tarefa", enviado=False))
        enviar_resultado(ctx, t["id"], t["seq"], reg.get("estado", "falhou"), reg.get("resultado"), reg.get("erro"), reg.get("duracaoMs", 0))
        return "reenviada"
    except Recusa as r:
        erro = f"{r.codigo}: {r}"
        if r.codigo in ("tarefa_malformada", "assinatura_invalida"):
            # Sem assinatura válida o id não pode virar registro no diário (seria um jeito de
            # "envenenar" o id de uma tarefa verdadeira que ainda vai chegar).
            if _texto(t.get("id") if isinstance(t, dict) else None, R_UUID) and type(t.get("seq")) is int:
                enviar_resultado(ctx, t["id"], t["seq"], "falhou", None, erro, duracao(), com_diario=False)
            return "recusada"
        diario(ctx, t["id"], {"estado": "falhou", "seq": t["seq"], "tipo": t["tipo"], "resultado": None, "erro": erro, "duracaoMs": duracao(), "enviado": False})
        enviar_resultado(ctx, t["id"], t["seq"], "falhou", None, erro, duracao())
        return "recusada"
    diario(ctx, t["id"], {"estado": "executando", "seq": t["seq"], "tipo": t["tipo"], "enviado": False})
    parar = pulso_de_fundo(ctx, t["id"])
    try:
        dados, estado, erro = EXECUTORES[t["tipo"]](ctx, p), "concluida", None
    except Recusa as r:
        dados, estado, erro = None, "falhou", f"{r.codigo}: {r}"
    except Revogado:
        diario(ctx, t["id"], {"estado": "falhou", "seq": t["seq"], "tipo": t["tipo"], "resultado": None, "erro": "revogado", "duracaoMs": duracao(), "enviado": True})
        raise
    except Exception as e:
        dados, estado, erro = None, "falhou", "erro_interno: " + resumo(e)
    finally:
        parar()
    diario(ctx, t["id"], {"estado": estado, "seq": t["seq"], "tipo": t["tipo"], "resultado": dados, "erro": erro, "duracaoMs": duracao(), "enviado": False})
    enviar_resultado(ctx, t["id"], t["seq"], estado, dados, erro, duracao())  # 3 tentativas; se falhar, fica no diário
    return estado


# --- Limpezas ------------------------------------------------------------------------------------


def limpar_sobras(ctx):
    for slug in os.listdir(ctx.cam.www) if os.path.isdir(ctx.cam.www) else []:
        base = os.path.join(ctx.cam.www, slug)
        if R_SLUG.fullmatch(slug) and os.path.isdir(base) and not os.path.islink(base):
            try:
                apagar_links_velhos(base)
            except OSError:
                pass
    limite = relogio() - 7 * 86400
    lixeira = os.path.join(ctx.cam.www, ".lixeira")
    for pasta, idade in ((lixeira, limite), (ctx.cam.tmp, relogio() - 86400)):
        try:
            nomes = os.listdir(pasta)
        except OSError:
            continue
        for n in nomes:
            caminho = os.path.join(pasta, n)
            try:
                st = os.lstat(caminho)
                if st.st_mtime >= idade:
                    continue
                if stat.S_ISDIR(st.st_mode):
                    shutil.rmtree(caminho, ignore_errors=True)
                else:
                    os.unlink(caminho)
            except OSError:
                pass


# --- Comandos ------------------------------------------------------------------------------------


def marcar_revogado(ctx):
    try:
        fd = os.open(ctx.cam.revogado, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        os.write(fd, (iso() + "\n").encode())
        os.close(fd)
    except OSError:
        pass


def exigir_nao_root(args):
    # Estes comandos rodam como dashagent (o systemd e o instalador cuidam disso). Como root eles
    # deixariam agente.json/estado.json/diario do root, e o serviço não conseguiria mais ler.
    if not args.modo_teste and os.geteuid() == 0:
        sair(1, "Este comando roda como dashagent, não como root. Use: sudo dash-agent status | reconectar | diagnostico.")


def preparar_raiz_de_teste(cam):
    # Só no modo teste: a raiz falsa ganha a árvore que o instalador criaria (§7.1).
    for pasta, modo in ((cam.lib, 0o700), (cam.www, 0o755), (os.path.dirname(cam.travas), 0o755)):
        os.makedirs(pasta, mode=modo, exist_ok=True)


def preparar_pastas(ctx):
    # Só o próprio agente cria diario/ e tmp/: um "sudo dash-agent status" nunca deixa pasta de root aqui.
    for pasta in (ctx.cam.diario, ctx.cam.tmp):
        criar_dir_real(pasta, 0o700)


def rodar(args):
    exigir_nao_root(args)
    ctx = Contexto(args)
    preparar_pastas(ctx)
    fechar_interrompidas(ctx)
    atraso, proxima_limpeza = 5, 0.0
    while True:
        try:
            if time.monotonic() >= proxima_limpeza:
                limpar_sobras(ctx)
                proxima_limpeza = time.monotonic() + 3600
            reenviar_pendentes(ctx)
            r = pulsar(ctx)
            atraso = 5
            if r.get("tarefa"):
                processar(ctx, r["tarefa"])
                continue
            espera = min(max(int(r.get("proximoPulsoEm", 30)), 5), 300)
            time.sleep(espera * (0.9 + secrets.randbelow(200) / 1000))  # espalha os pulsos no tempo
        except Revogado:
            marcar_revogado(ctx)
            log("O painel revogou este servidor. Rode: sudo dash-agent reconectar")
            raise SystemExit(3) from None
        except RelogioFora:
            log("Relógio da VPS fora de hora; o agente compensa, mas rode: sudo timedatectl set-ntp true")
            time.sleep(60)
        except Espere as e:
            time.sleep(e.segundos)
        except Exception as e:
            log("pulso falhou: " + resumo(e))
            time.sleep(atraso)
            atraso = min(atraso * 2, 300)


def uma_vez(args):
    """Pulsa e executa até ficar ocioso (usado pelos testes e pelo E2E)."""
    exigir_nao_root(args)
    ctx = Contexto(args)
    preparar_pastas(ctx)
    fechar_interrompidas(ctx)
    try:
        for _ in range(50):
            reenviar_pendentes(ctx)
            try:
                r = pulsar(ctx)
            except Espere as e:
                time.sleep(e.segundos)
                continue
            except urllib.error.HTTPError:
                raise  # resposta do painel (500, 401 sem a marca...): quem chamou decide
            except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
                # Conexão caída no meio do pulso (a resposta se perdeu): como no rodar, tenta de novo.
                # O painel reentrega a mesma tarefa e o diário impede a segunda execução.
                log("pulso falhou: " + resumo(e))
                time.sleep(1)
                continue
            if not r.get("tarefa"):
                break
            processar(ctx, r["tarefa"])
        reenviar_pendentes(ctx)
    except Revogado:
        marcar_revogado(ctx)
        log("O painel revogou este servidor. Rode: sudo dash-agent reconectar")
        raise SystemExit(3) from None
    return 0


def ler_os_release(caminho):
    try:
        with open(caminho, encoding="utf-8", errors="replace") as f:
            for linha in f:
                if linha.startswith("PRETTY_NAME="):
                    return texto_limpo(linha.split("=", 1)[1].strip().strip('"'), 200) or "Linux"
    except OSError:
        pass
    return "Linux"


def inventario(ctx):
    root = estado_do_root(ctx) or {}
    nginx = root.get("nginx") if isinstance(root.get("nginx"), dict) else {}
    v4, v6 = descobrir_ipv4(), descobrir_ipv6()
    return {
        "versao": VERSAO,
        "hostname": texto_limpo(socket.gethostname(), 253),
        "so": ler_os_release(ctx.cam.os_release if ctx.modo_teste and os.path.exists(ctx.cam.os_release) else "/etc/os-release"),
        "python": "%d.%d.%d" % sys.version_info[:3],
        "nginx": texto_limpo(nginx["versao"], 64) if isinstance(nginx.get("versao"), str) else None,
        "certbot": texto_limpo(root["certbot"], 64) if isinstance(root.get("certbot"), str) else None,
        "ipv4": v4,
        "ipv6": v6,
    }


def ler_codigo_do_stdin():
    codigo = sys.stdin.readline().strip()
    if not R_CODIGO.fullmatch(codigo):
        sair(2, "Código de instalação inválido. Copie o comando de novo no painel.")
    return codigo


def registrar(args, codigo=None):
    """Chamado pelo instalador como dashagent. O código chega pelo STDIN, nunca pelo argv."""
    exigir_nao_root(args)
    painel = str(args.painel or "").rstrip("/")
    if not painel_ok(painel, args.modo_teste):
        sair(2, "O endereço do painel precisa ser https://")
    ctx = Contexto(args, exigir_registro=False)
    if args.modo_teste:
        preparar_raiz_de_teste(ctx.cam)
    if not os.path.isdir(ctx.cam.lib):
        sair(2, "A pasta do agente não existe. Rode o instalador de novo.")
    codigo = codigo or ler_codigo_do_stdin()
    token = secrets.token_urlsafe(32)  # nasce aqui; o painel só guarda o sha256
    inv = inventario(ctx)
    try:
        r = post_sem_assinatura(
            painel,
            "/api/agente/v1/registrar",
            {"codigo": codigo, "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "agente": inv},
            args.modo_teste,
        )
    except urllib.error.HTTPError as e:
        if e.code == 401:
            sair(2, "Código de instalação inválido, vencido ou já usado. Gere um novo comando no painel.")
        if e.code == 429:
            sair(2, "Muitas tentativas seguidas. Espere um minuto e rode o comando de novo.")
        if e.code == 503:
            sair(2, "O painel ainda não está configurado para servidores (veja a tela Servidor).")
        sair(2, f"O painel recusou o registro (HTTP {e.code}).")
    except (urllib.error.URLError, OSError, Recusa, ValueError) as e:
        sair(2, "Não consegui falar com o painel: " + resumo(e))
    try:
        cfg = {
            "painel": painel,
            "servidorId": r["servidorId"],
            "token": token,
            "chavePedidos": r["chavePedidos"],
            "chaveTarefas": r["chaveTarefas"],
            "geracao": r["geracao"],
        }
        if not (r.get("ok") is True and _texto(cfg["servidorId"], R_UUID) and type(cfg["geracao"]) is int and cfg["geracao"] >= 0):
            raise ValueError("campos")
        b64d(cfg["chavePedidos"])
        b64d(cfg["chaveTarefas"])
        ultima = r["ultimaSeqTarefa"]
        if type(ultima) is not int or not 0 <= ultima <= SEQ_MAX:
            raise ValueError("ultimaSeqTarefa")
    except (KeyError, ValueError, TypeError):
        sair(2, "Resposta do painel inválida.")
    gravar_json_0600(ctx.cam.config, cfg)
    gravar_json_0600(ctx.cam.estado, {"ultimaSeqPedido": 0, "ultimaSeqTarefa": ultima, "desvioMs": 0})
    for pasta in (ctx.cam.diario, ctx.cam.tmp):
        criar_dir_real(pasta, 0o700)
    for reg in listar_diario(ctx):  # registro novo = geração nova; o diário antigo não vale mais
        apagar_se_existe(caminho_diario(ctx, reg["id"]))
    apagar_se_existe(ctx.cam.revogado)
    print(f"Registrado: {inv['hostname']} · {inv['so']} · IP {', '.join(inv['ipv4']) or 'desconhecido'}")
    print("Volte ao painel e confirme que este é o seu servidor.")
    return 0


def exigir_root(args):
    if not args.modo_teste and os.geteuid() != 0:
        sair(1, "Rode com sudo.")


def mudar_trava(args, **mudanca):
    exigir_root(args)
    cam = Caminhos(args.raiz if args.modo_teste else "/")
    travas = ler_travas(cam)
    travas.update(mudanca)
    os.makedirs(os.path.dirname(cam.travas), mode=0o755, exist_ok=True)
    gravar_json(cam.travas, travas, 0o644)  # root 0644: o agente só lê; o painel nunca desfaz
    print("Travas: pausado=%s, somente leitura=%s" % ("sim" if travas["pausado"] else "não", "sim" if travas["somenteLeitura"] else "não"))
    return 0


def para_o_terminal(valor, maximo=300):
    """Valor lido de agente.json/estado.json (arquivos do dashagent) a caminho do terminal do root.

    O status e o diagnóstico rodam com sudo, e esses arquivos são de quem o desenho confia menos que
    o root: json.loads transforma "\\u001b" num ESC de verdade, e sem limpeza um agente comprometido
    mandaria sequências ao terminal (OSC 52 grava a área de transferência, CSI 2J apaga a tela).
    """
    return texto_limpo(valor, maximo)


def status(args):
    cam = Caminhos(args.raiz if args.modo_teste else "/")
    try:
        cfg = ler_json(cam.config)
    except FileNotFoundError:
        print("Não registrado.")
        return 1
    except PermissionError:
        sair(1, "Rode com sudo.")
    except (OSError, ValueError):
        print("agente.json ilegível. Rode o comando de instalação do painel de novo.")
        return 1
    if not isinstance(cfg, dict):
        print("agente.json fora do formato. Rode o comando de instalação do painel de novo.")
        return 1
    try:
        est = ler_json(cam.estado, padrao={})
    except (OSError, ValueError):
        est = {}
    est = est if isinstance(est, dict) else {}
    travas = ler_travas(cam)
    ctx = Contexto(args, exigir_registro=False)
    pendentes = [r for r in listar_diario(ctx) if r.get("estado") in ("concluida", "falhou") and not r.get("enviado")]
    desvio = est.get("desvioMs", 0)
    print(f"Agente {VERSAO}")
    print(f"Painel: {para_o_terminal(cfg.get('painel'))}")
    print(f"Servidor: {para_o_terminal(cfg.get('servidorId'))} (chave geração {para_o_terminal(cfg.get('geracao'))})")
    print(f"Revogado: {'sim' if os.path.exists(cam.revogado) else 'não'}")
    print(f"Travas: pausado={'sim' if travas['pausado'] else 'não'}, somente leitura={'sim' if travas['somenteLeitura'] else 'não'}")
    print(f"Última seq: pedido {para_o_terminal(est.get('ultimaSeqPedido'))}, tarefa {para_o_terminal(est.get('ultimaSeqTarefa'))}")
    print(f"Desvio do relógio: {desvio // 1000 if type(desvio) is int else '?'} s")
    print(f"Resultados esperando envio: {len(pendentes)}")
    return 0


def diagnostico(args):
    cam = Caminhos(args.raiz if args.modo_teste else "/")
    ok = True

    def linha(bom, texto):
        nonlocal ok
        ok = ok and bom
        print(("ok    " if bom else "FALHA ") + texto)

    linha(sys.version_info >= (3, 10), "Python %d.%d.%d" % sys.version_info[:3])
    linha(os.path.isdir(cam.lib), "pasta do agente " + cam.lib)
    linha(os.path.isdir(cam.www), "pasta dos sites " + cam.www)
    linha(os.path.exists(cam.sock), "socket do ajudante root " + cam.sock)
    try:
        cfg = ler_json(cam.config)
        if not isinstance(cfg, dict):
            raise ValueError("agente.json fora do formato")
        painel = str(cfg.get("painel", ""))
        # Só um endereço que passa na regra do painel vai ao terminal (o comando roda como root).
        linha(True, "registrado em " + (painel if painel_ok(painel, args.modo_teste) else "(endereço inválido no agente.json)"))
    except (OSError, ValueError):
        cfg = None
        linha(False, "agente registrado (rode o comando de instalação do painel)")
    linha(not os.path.exists(cam.revogado), "acesso ao painel não revogado")
    travas = ler_travas(cam)
    linha(not travas["pausado"], "agente não pausado")
    if not args.modo_teste and shutil.which("systemctl"):
        for unidade in ("dash-agent-root.service", "dash-agent.service", "nginx.service"):
            r = subprocess.run(["systemctl", "is-active", unidade], capture_output=True, text=True, env=dict(AMBIENTE_FIXO))
            linha(r.stdout.strip() == "active", unidade + " ligado")
    if cfg and painel_ok(str(cfg.get("painel", "")), args.modo_teste):
        try:
            req = urllib.request.Request(str(cfg["painel"]) + "/agente/v1/rastreio.js", method="HEAD")
            with montar_opener(args.modo_teste).open(req, timeout=10):
                linha(True, "painel alcançável por HTTPS")
        except urllib.error.HTTPError as e:
            linha(e.code < 500, f"painel alcançável por HTTPS (HTTP {e.code})")
        except Exception as e:
            linha(False, "painel alcançável por HTTPS: " + resumo(e))
    return 0 if ok else 1


def reconectar(args):
    exigir_root(args)
    cam = Caminhos(args.raiz if args.modo_teste else "/")
    painel = args.painel
    if not painel:
        try:
            painel = ler_json(cam.config).get("painel")
        except (OSError, ValueError):
            sair(2, "Informe --painel https://… (o endereço do painel).")
    codigo = ler_codigo_do_stdin()
    if args.modo_teste or os.geteuid() != 0:
        args.painel = painel
        return registrar(args, codigo=codigo)
    # Como root: o registro roda como dashagent (os arquivos ficam dele) e o serviço é reiniciado.
    r = subprocess.run(
        ["runuser", "-u", "dashagent", "--", "/usr/bin/python3", "-I", os.path.abspath(__file__), "registrar", "--painel", painel],
        input=codigo + "\n", text=True, env=dict(AMBIENTE_FIXO),
    )
    if r.returncode != 0:
        return r.returncode
    subprocess.run(["systemctl", "restart", "dash-agent.service"], env=dict(AMBIENTE_FIXO))
    return 0


def desinstalar(args):
    exigir_root(args)
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "desinstalar.sh")
    if not os.path.isfile(script):
        sair(1, "Não achei " + script + ". Use o comando de desinstalação mostrado no painel.")
    argv = ["bash", script] + (["--remover-sites"] if args.remover_sites else [])
    return subprocess.run(argv, env=dict(AMBIENTE_FIXO)).returncode


def montar_cli():
    comum = argparse.ArgumentParser(add_help=False)
    comum.add_argument("--modo-teste", action="store_true", help="só para testes: http em 127.0.0.1 e caminhos sob --raiz")
    comum.add_argument("--raiz", default=None)
    comum.add_argument("--uid-esperado", type=int, default=None, help="uid do dono do socket do ajudante (teste)")
    cli = argparse.ArgumentParser(prog="dash-agent", description="Agente do Servidor do Funil " + VERSAO)
    sub = cli.add_subparsers(dest="comando", required=True)
    for nome in ("rodar", "uma-vez", "status", "pausar", "retomar", "somente-leitura", "liberar-escrita", "diagnostico"):
        sub.add_parser(nome, parents=[comum])
    for nome in ("registrar", "reconectar"):
        sub.add_parser(nome, parents=[comum]).add_argument("--painel", default=None)
    sub.add_parser("desinstalar", parents=[comum]).add_argument("--remover-sites", action="store_true")
    return cli


def main(argv=None):
    os.umask(0o022)  # 0755/0644 no que o nginx (www-data) lê, mesmo fora do systemd
    args = montar_cli().parse_args(argv)
    if bool(args.modo_teste) != bool(args.raiz):
        sair(2, "--raiz só vale junto com --modo-teste (e vice-versa).")
    if args.raiz and not os.path.isabs(args.raiz):
        sair(2, "--raiz precisa ser um caminho absoluto.")
    comandos = {
        "registrar": registrar,
        "rodar": rodar,
        "uma-vez": uma_vez,
        "status": status,
        "pausar": lambda a: mudar_trava(a, pausado=True),
        "retomar": lambda a: mudar_trava(a, pausado=False),
        "somente-leitura": lambda a: mudar_trava(a, somenteLeitura=True),
        "liberar-escrita": lambda a: mudar_trava(a, somenteLeitura=False),
        "diagnostico": diagnostico,
        "reconectar": reconectar,
        "desinstalar": desinstalar,
    }
    return comandos[args.comando](args) or 0


if __name__ == "__main__":
    sys.exit(main())
