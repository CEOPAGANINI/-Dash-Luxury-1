"""Compatibilidade e igualdade com o lado TypeScript.

- os dois .py compilam com a gramática do Python 3.10 e não usam API que só existe no 3.11+;
- nada de shell=True, os.system, os.popen, eval ou exec;
- OVERVIEW é o OVERVIEW_COMMAND do ChatGPT sem mudança, roda de verdade aqui e sai no formato;
- OVERVIEW, PAGINA_DE_ESPERA e a lista de lixo do ZIP iguais às do TS (lidas da fonte do TS);
- as units passam no systemd-analyze verify.
"""
import ast
import hashlib
import os
import py_compile
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apoio  # noqa: E402
from apoio import agente  # noqa: E402

ARQUIVOS = ("dash_agent.py", "dash_agent_root.py")
# sha256 do OVERVIEW_COMMAND de src/features/vps/ssh.ts do ChatGPT (String.raw, 1956 caracteres).
SHA_OVERVIEW_CHATGPT = "9af8948d61e7c820561a3ef1ab128ba96aa1c664483a6632fcf063d3340b36a6"
CHAVES_OVERVIEW = {"platform", "hostname", "os", "uptime", "cpu_before", "cpu_after", "cores", "memory", "disk", "user", "service",
                   "services_unavailable"}


def fonte(nome):
    with open(os.path.join(apoio.PUBLICO, nome), encoding="utf-8") as f:
        return f.read()


def literal_ts(texto, nome):
    """Valor de `export const NOME = ...` num arquivo TS: String.raw`...`, `...`, "..." ou '...',
    ou concatenação desses com '+'. Suficiente para constantes de texto sem interpolação."""
    m = re.search(rf"\bconst\s+{nome}\b[^=]*=\s*", texto)
    if not m:
        return None
    i, partes = m.end(), []
    while True:
        while texto[i].isspace():
            i += 1
        cru = texto.startswith("String.raw`", i)
        if cru:
            i += len("String.raw")
        aspa = texto[i]
        if aspa not in "`\"'":
            raise AssertionError(f"{nome}: literal que o teste não sabe ler")
        j, buf = i + 1, []
        while texto[j] != aspa:
            if texto[j] == "\\" and not cru:
                seq = texto[j + 1]
                mapa = {"n": "\n", "t": "\t", "\\": "\\", "'": "'", '"': '"', "`": "`", "$": "$"}
                if seq == "u":
                    buf.append(chr(int(texto[j + 2 : j + 6], 16)))
                    j += 6
                    continue
                buf.append(mapa[seq])
                j += 2
                continue
            if aspa == "`" and texto.startswith("${", j):
                raise AssertionError(f"{nome}: template com interpolação")
            buf.append(texto[j])
            j += 1
        partes.append("".join(buf))
        i = j + 1
        while texto[i].isspace():
            i += 1
        if texto[i] != "+":
            return "".join(partes)
        i += 1


def ts(rel):
    caminho = os.path.join(apoio.REPO, rel)
    if not os.path.exists(caminho):
        return None
    with open(caminho, encoding="utf-8") as f:
        return f.read()


class Gramatica(unittest.TestCase):
    def test_parse_310(self):
        for nome in ARQUIVOS:
            ast.parse(fonte(nome), filename=nome, feature_version=(3, 10))

    def test_py_compile(self):
        with tempfile.TemporaryDirectory() as d:
            for nome in ARQUIVOS:
                py_compile.compile(os.path.join(apoio.PUBLICO, nome), cfile=os.path.join(d, nome + "c"), doraise=True)

    def test_proibidos(self):
        for nome in ARQUIVOS:
            arvore = ast.parse(fonte(nome))
            achados = []
            for n in ast.walk(arvore):
                if isinstance(n, (ast.Import, ast.ImportFrom)):
                    mods = [a.name for a in n.names] + ([n.module] if isinstance(n, ast.ImportFrom) and n.module else [])
                    achados += [m for m in mods if m.split(".")[0] in ("tomllib", "exceptiongroup")]
                elif isinstance(n, ast.Attribute) and n.attr in ("UTC", "file_digest", "system", "popen"):
                    achados.append(n.attr)
                elif isinstance(n, ast.Name) and n.id in ("ExceptionGroup", "BaseExceptionGroup", "eval", "exec", "UTC"):
                    achados.append(n.id)
                elif isinstance(n, ast.keyword) and n.arg == "shell" and not (isinstance(n.value, ast.Constant) and n.value.value is False):
                    achados.append("shell=" + ast.unparse(n.value))
                elif type(n).__name__ == "TryStar":
                    achados.append("except*")
            self.assertEqual(achados, [], nome)

    def test_subprocess_sempre_com_lista(self):
        for nome in ARQUIVOS:
            for n in ast.walk(ast.parse(fonte(nome))):
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in ("run", "Popen", "call", "check_output"):
                    if isinstance(n.func.value, ast.Name) and n.func.value.id == "subprocess":
                        self.assertNotIsInstance(n.args[0], (ast.Constant, ast.JoinedStr, ast.BinOp), f"{nome}:{n.lineno}")

    def test_so_biblioteca_padrao(self):
        stdlib = set(sys.stdlib_module_names)
        for nome in ARQUIVOS:
            for n in ast.walk(ast.parse(fonte(nome))):
                if isinstance(n, ast.Import):
                    for a in n.names:
                        self.assertIn(a.name.split(".")[0], stdlib, a.name)
                elif isinstance(n, ast.ImportFrom):
                    self.assertIn((n.module or "").split(".")[0], stdlib, n.module)

    def test_versoes_iguais(self):
        self.assertEqual(agente.VERSAO, apoio.root.VERSAO)
        for script in ("instalar.sh",):
            self.assertIn(f'VERSAO="{agente.VERSAO}"', fonte(script))


class Overview(unittest.TestCase):
    def test_e_o_do_chatgpt_sem_mudanca(self):
        self.assertEqual(hashlib.sha256(agente.OVERVIEW.encode()).hexdigest(), SHA_OVERVIEW_CHATGPT)

    def test_igual_ao_ts(self):
        # Direto da fonte do TS (sem passar pelo constantes.json): o vitest faz o mesmo no sentido inverso.
        texto = ts("src/features/vps/overview.ts")
        self.assertEqual(literal_ts(texto, "OVERVIEW_COMMAND"), agente.OVERVIEW)

    def test_roda_de_verdade_e_sai_no_formato(self):
        r = subprocess.run(["/bin/sh", "-c", agente.OVERVIEW], capture_output=True, timeout=15, env=dict(agente.AMBIENTE_FIXO))
        self.assertEqual(r.returncode, 0, r.stderr)
        saida = r.stdout.decode()
        self.assertLessEqual(len(r.stdout), agente.LIM_VISAO)
        linhas = saida.rstrip("\n").split("\n")
        self.assertEqual((linhas[0], linhas[-1]), ("ORBIT_VPS_V1", "END_ORBIT_VPS_V1"))
        chaves = [linha.split("\t", 1)[0] for linha in linhas[1:-1]]
        self.assertEqual(set(chaves) - CHAVES_OVERVIEW, set())
        for k in ("platform", "hostname", "uptime", "cpu_before", "cpu_after", "memory", "disk"):
            self.assertIn(k, chaves)
        self.assertEqual(dict(linha.split("\t", 1) for linha in linhas[1:-1] if not linha.startswith(("user\t", "service\t")))["platform"], "linux")
        with open(os.path.join(apoio.FIXTURES_TS, "visao-geral-container.txt"), encoding="utf-8") as f:
            fx = f.read().rstrip("\n").split("\n")
        self.assertEqual((fx[0], fx[-1]), ("ORBIT_VPS_V1", "END_ORBIT_VPS_V1"))
        self.assertEqual({linha.split("\t", 1)[0] for linha in fx[1:-1]} - CHAVES_OVERVIEW, set())

    def test_coleta_tira_os_usuarios(self):
        saida = agente.coletar_visao()
        self.assertNotIn("\nuser\t", saida)
        self.assertTrue(saida.startswith("ORBIT_VPS_V1\n") and saida.endswith("END_ORBIT_VPS_V1\n"))


class IgualdadeComTs(unittest.TestCase):
    def test_pagina_de_espera(self):
        texto = ts("src/features/vps/modelo.ts")
        self.assertEqual(literal_ts(texto, "PAGINA_DE_ESPERA"), agente.PAGINA_DE_ESPERA)

    def test_lixo_do_zip(self):
        # A lista e o "._" moram em modelo.ts (o Servidor e o editor do funil
        # usam de lá); pacote-zip.ts só a reexporta.
        texto = ts("src/features/vps/modelo.ts")
        for nome in sorted(agente.IGNORAR_NOME) + list(agente.IGNORAR_NO_ZIP):
            self.assertIn(f'"{nome}"', texto, nome)
        self.assertIn('"._"', texto)

    def test_extensoes(self):
        texto = ts("src/features/vps/pacote-zip.ts")
        faltando = [e for e in sorted(agente.EXT) if not re.search(rf"\b{re.escape(e)}\b", texto)]
        self.assertEqual(faltando, [])


class Constantes(unittest.TestCase):
    """tests/fixtures/vps/constantes.json é gerado do TS; o agente e o ajudante precisam bater com ele."""

    def setUp(self):
        self.c = apoio.ler_json(os.path.join(apoio.FIXTURES_TS, "constantes.json"))

    def test_protocolo(self):
        self.assertEqual(self.c["prefixos"], {"pedido": agente.P_PEDIDO, "tarefa": agente.P_TAREFA})
        self.assertEqual({k: list(v) for k, v in agente.TIPOS.items()}, self.c["tipos"])
        self.assertEqual(sorted(agente.SO_LEITURA), sorted(self.c["somenteLeitura"]))
        m = self.c["marcaRevogacao"]
        self.assertEqual((m["status"], m["wwwAuthenticate"], m["corpo"]["error"]), (401, "Dash-HMAC", "unauthorized"))

    def test_regras(self):
        for mod in (agente, apoio.root):
            self.assertEqual(list(mod.SUFIXOS_BASE), self.c["sufixosBase"])
            self.assertEqual(list(mod.SUFIXOS_SITE), self.c["sufixosSite"])
            self.assertEqual(list(mod.SLUGS_RESERVADOS), self.c["slugsReservados"])
            for nome, atributo in (("uuid", "R_UUID"), ("slug", "R_SLUG"), ("rotulo", "R_ROTULO"), ("tld", "R_TLD"),
                                   ("localEmail", "R_LOCAL"), ("slugCheckout", "R_CHK"), ("ipv4Forma", "R_IPV4")):
                self.assertEqual(getattr(mod, atributo).pattern, self.c["regex"][nome], (mod.__name__, nome))
        self.assertEqual(agente.R_SHA.pattern, self.c["regex"]["sha256"])
        self.assertEqual(agente.R_SEG.pattern, self.c["regex"]["segmento"])

    def test_zip_e_textos(self):
        z = self.c["zip"]
        self.assertEqual(sorted(agente.EXT), sorted(z["extensoes"]))
        self.assertEqual(list(agente.IGNORAR_NO_ZIP), z["ignorarPrefixos"])
        self.assertEqual(sorted(agente.IGNORAR_NOME), sorted(z["ignorarNomes"]))
        self.assertEqual(z["ignorarComecoDoNome"], "._")
        self.assertEqual({k: agente.LIM[k] for k in z["limites"]}, z["limites"])
        self.assertEqual(agente.MARCADOR, z["marcador"])
        self.assertEqual(agente.PAGINA_DE_ESPERA, self.c["paginaDeEspera"])
        self.assertEqual(agente.OVERVIEW, self.c["overview"])

    def test_raiz_comum(self):
        # "Se TODOS os nomes que sobram depois do lixo (arquivos e pastas) começam com '<primeiro segmento>/', esse prefixo sai."
        class I:
            def __init__(self, n):
                self.filename = n

        casos = {("site/", "site/index.html", "site/css/a.css"): "site/", ("site/index.html", "outra/a.html"): "",
                 ("index.html", "css/a.css"): "", ("site/index.html",): "site/", ("a/b/index.html", "a/c.html"): "a/"}
        for nomes, esperado in casos.items():
            self.assertEqual(agente.raiz_comum([I(n) for n in nomes]), esperado, nomes)


class Zips(apoio.TesteComRaiz):
    def test_zips_do_ts_extraem(self):
        pasta = os.path.join(apoio.FIXTURES_TS, "zips")
        for nome in sorted(os.listdir(pasta)):
            with self.subTest(nome):
                destino = os.path.join(self.r, nome + ".d")
                os.mkdir(destino)
                n, total = agente.extrair(os.path.join(pasta, nome), destino)
                self.assertGreater(n, 0)
                self.assertTrue(os.path.isfile(os.path.join(destino, "index.html")))


class Units(unittest.TestCase):
    @unittest.skipUnless(shutil.which("systemd-analyze"), "systemd-analyze não está instalado")
    def test_systemd_analyze_verify(self):
        r = apoio.nova_raiz("dash-units-")
        self.addCleanup(apoio.apagar_raiz, r)
        apoio.escrever(os.path.join(r, "etc/os-release"), 'ID=ubuntu\nVERSION_ID="24.04"\n')
        with apoio.PainelFalso() as painel:
            p = subprocess.run(
                ["bash", os.path.join(apoio.PUBLICO, "instalar.sh"), "--painel", painel.url, "--local", apoio.PUBLICO],
                input=painel.codigo() + "\n", capture_output=True, text=True, timeout=120,
                env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "DASH_SIMULAR": "1", "DASH_RAIZ": r, "PYTHONDONTWRITEBYTECODE": "1"},
            )
        self.assertEqual(p.returncode, 0, p.stderr)
        s = os.path.join(r, "etc/systemd/system")
        v = subprocess.run(["systemd-analyze", "verify", os.path.join(s, "dash-agent-root.service"), os.path.join(s, "dash-agent.service")],
                           capture_output=True, text=True, env={"PATH": "/usr/bin:/bin", "SYSTEMD_UNIT_PATH": s + ":"})
        self.assertEqual(v.returncode, 0, v.stdout + v.stderr)
        with open(os.path.join(r, "executados.log"), encoding="utf-8") as f:
            self.assertIn("systemd-analyze verify: ok", f.read())


class Rastreio(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node não está instalado")
    def test_sintaxe(self):
        r = subprocess.run(["node", "--check", os.path.join(apoio.PUBLICO, "rastreio.js")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_campos_do_track(self):
        with open(os.path.join(apoio.PUBLICO, "rastreio.js"), encoding="utf-8") as f:
            js = f.read()
        for trecho in ('"infinity:aid"', '"/api/public/track"', 'mode: "cors"', 'credentials: "omit"', "keepalive: true", "productSlug",
                       '"page_view"', '"heartbeat"', '"click_buy"', "data-produto"):
            self.assertIn(trecho, js)


if __name__ == "__main__":
    unittest.main()
