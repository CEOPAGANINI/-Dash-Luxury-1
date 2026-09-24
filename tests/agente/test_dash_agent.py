"""Testes do dash_agent.py (roda como dashagent na VPS). unittest da biblioteca padrão; também roda
no pytest. Nada aqui toca a rede de fora nem o sistema: painel falso em 127.0.0.1, ajudante root
simulado (nginx/certbot/systemctl falsos) e tudo sob uma raiz temporária.
"""
import base64
import contextlib
import errno
import hashlib
import io
import json
import os
import signal
import stat
import subprocess
import sys
import threading
import time
import unittest
import urllib.error
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apoio  # noqa: E402
import gerar_zips  # noqa: E402
from apoio import agente  # noqa: E402

SITE = "a3b1c2d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
ORIGEM = "https://dash-board-psi-one.vercel.app"


def params_configurar(slug="loja-com-br", tls=False, dominios=None):
    dominios = dominios or ["loja.com.br", "www.loja.com.br"]
    return {"siteId": SITE, "slug": slug, "dominios": dominios, "principal": dominios[0], "origemCheckout": ORIGEM,
            "checkout": ORIGEM + "/checkout/cadeira-x", "tls": tls}


def publicar(painel, zbytes, slug="loja-com-br", versao=None):
    art = str(uuid.uuid4())
    painel.artefatos[art] = zbytes
    return painel.tarefa("site.publicar", {"siteId": SITE, "slug": slug, "versaoId": versao or str(uuid.uuid4()), "artefatoId": art,
                                           "sha256": hashlib.sha256(zbytes).hexdigest(), "bytes": len(zbytes)})


def zip_simples(texto):
    return gerar_zips.montar([("index.html", texto.encode()), ("css/a.css", b"body{}")])


def silencioso():
    pilha = contextlib.ExitStack()
    pilha.enter_context(contextlib.redirect_stderr(io.StringIO()))
    pilha.enter_context(contextlib.redirect_stdout(io.StringIO()))
    return pilha


def conferir_casos(teste, caminho, mod):
    """Mesmo leitor para os casos do agente e os de tests/fixtures/vps (formato {valor, ok})."""
    c = apoio.ler_json(caminho)
    regras = {
        "host": mod.host_ok, "dominioSite": mod.dominio_ok, "origem": mod.origem_ok, "email": mod.email_ok,
        "slug": mod.slug_ok,
        "uuid": lambda v: isinstance(v, str) and bool(mod.R_UUID.fullmatch(v)),
    }
    if mod is agente:
        regras.update({
            "sha256": lambda v: isinstance(v, str) and bool(agente.R_SHA.fullmatch(v)),
            "segmento": lambda v: isinstance(v, str) and agente.segmento_ok(v, True) and not v.startswith(".dash-"),
            "bytes": lambda v: type(v) is int and 1 <= v <= agente.LIM["zip"],
        })
    for chave, regra in regras.items():
        for caso in c.get(chave, []):
            with teste.subTest(regra=chave, valor=caso["valor"]):
                teste.assertEqual(regra(caso["valor"]), caso["ok"])
    for caso in c.get("checkout", []):
        with teste.subTest(regra="checkout", valor=caso["url"]):
            teste.assertEqual(mod.checkout_ok(caso["url"], caso["origem"]), caso["ok"])
    for caso in c.get("normalizacao", []):
        with teste.subTest(regra="normalizacao", valor=caso["entrada"]):
            if caso["entrada"] != caso["saida"]:  # a entrada crua do dono nunca chega ao agente sem normalizar
                teste.assertFalse(mod.host_ok(caso["entrada"]))
    if mod is agente:
        for caso in c.get("params", []):
            with teste.subTest(regra="params", tipo=caso["tipo"], motivo=caso.get("motivo")):
                if caso["ok"]:
                    agente.validar_params(caso["tipo"], caso["params"])
                else:
                    with teste.assertRaises(agente.Recusa):
                        agente.validar_params(caso["tipo"], caso["params"])
    else:
        ops = {"site.configurar": "nginx.aplicar", "site.ssl_emitir": "ssl.emitir", "site.remover": "nginx.remover"}
        for caso in c.get("params", []):
            if caso["tipo"] not in ops or not isinstance(caso["params"], dict):
                continue
            args = {k: v for k, v in caso["params"].items() if k in apoio.root.OPS[ops[caso["tipo"]]]}
            if sorted(args) != sorted(apoio.root.OPS[ops[caso["tipo"]]]):
                continue  # chave faltando: o agente recusa antes de pedir ao root
            with teste.subTest(regra="args do root", tipo=caso["tipo"], motivo=caso.get("motivo")):
                siteid_ok = bool(agente.R_UUID.fullmatch(str(caso["params"].get("siteId"))))
                extra_ok = sorted(caso["params"]) == sorted(agente.TIPOS[caso["tipo"]])
                if caso["ok"] or not (siteid_ok and extra_ok):
                    if caso["ok"]:
                        apoio.root.validar_args(ops[caso["tipo"]], args)
                    continue
                with teste.assertRaises(apoio.root.Recusa):
                    apoio.root.validar_args(ops[caso["tipo"]], args)


class Validadores(unittest.TestCase):
    def test_casos_compartilhados_com_o_ts(self):
        # O mesmo arquivo que o vitest confere contra modelo.ts: uma regra que diverge falha nos dois.
        for mod in (agente, apoio.root):
            conferir_casos(self, os.path.join(apoio.FIXTURES_TS, "casos-validacao.json"), mod)

    def test_obrigatorios_do_8_1(self):
        self.assertTrue(agente.origem_ok("https://dash-board-psi-one.vercel.app"))
        self.assertFalse(agente.dominio_ok("loja.vercel.app"))
        self.assertTrue(agente.host_ok("loja.vercel.app"))

    def test_params_por_tipo(self):
        bons = {
            "servidor.coletar": {},
            "site.configurar": params_configurar(),
            "site.publicar": {"siteId": SITE, "slug": "a", "versaoId": SITE, "artefatoId": SITE, "sha256": "ab" * 32, "bytes": 3_000_000},
            "site.ativar_versao": {"siteId": SITE, "slug": "a", "versaoId": SITE},
            "site.ssl_emitir": {"siteId": SITE, "slug": "a", "dominios": ["loja.com.br"], "email": None},
            "site.remover": {"siteId": SITE, "slug": "a"},
        }
        for tipo, p in bons.items():
            agente.validar_params(tipo, p)
            with self.assertRaises(agente.Recusa, msg=tipo):
                agente.validar_params(tipo, dict(p, extra=1))
        ruins = [
            ("site.publicar", "bytes", 3_000_001), ("site.publicar", "bytes", True), ("site.publicar", "bytes", "10"),
            ("site.publicar", "sha256", "AB" * 32), ("site.publicar", "versaoId", "../x"),
            ("site.configurar", "dominios", []), ("site.configurar", "dominios", ["a.com.br"] * 2),
            ("site.configurar", "dominios", ["a.com.br", "b.com.br", "c.com.br", "d.com.br", "e.com.br"]),
            ("site.configurar", "dominios", ["loja.vercel.app"]), ("site.configurar", "principal", "outro.com.br"),
            ("site.configurar", "tls", 1), ("site.configurar", "checkout", "https://outra.com.br/checkout/x"),
            ("site.configurar", "slug", "Loja"), ("site.ssl_emitir", "email", "-x@loja.com.br"),
            ("site.configurar", "dominios", [["a.com.br"]]),
            ("site.publicar", "bytes", 1.0),  # "bytes":1.0 no JSON vira float aqui; o JS nem distingue, por isso fica fora do fixture
        ]
        for tipo, campo, valor in ruins:
            with self.assertRaises(agente.Recusa, msg=(tipo, campo, valor)):
                agente.validar_params(tipo, dict(bons[tipo], **{campo: valor}))
        with self.assertRaises(agente.Recusa):
            agente.validar_params("site.remover", {"siteId": SITE})

    def test_json_estrito(self):
        with self.assertRaises(ValueError):
            agente.json_estrito('{"slug":"a","slug":"b"}')
        with self.assertRaises(ValueError):
            agente.json_estrito('{"bytes":NaN}')


class Vetores(unittest.TestCase):
    def test_vetores_do_ts(self):
        """tests/fixtures/vps/vetores-protocolo.json foi calculado pelo chaves.ts/protocolo.ts; aqui cada
        valor é recalculado com hmac/hashlib, sem passar pelo código do agente na derivação."""
        import hmac as _hmac

        v = apoio.ler_json(os.path.join(apoio.FIXTURES_TS, "vetores-protocolo.json"))
        mestra = v["mestra"].encode()
        for d in v["derivacao"] + [dict(v["chaves"], geracao=v["geracao"])]:
            for prefixo, campo in ((agente.P_PEDIDO, "pedidos"), (agente.P_TAREFA, "tarefas")):
                chave = _hmac.new(mestra, f"{prefixo}:{v['servidorId']}:{d['geracao']}".encode(), "sha256").digest()
                self.assertEqual(apoio.b64url(chave), d[campo])
        self.assertEqual(hashlib.sha256(v["token"]["valor"].encode()).hexdigest(), v["token"]["sha256"])
        kp, kt = agente.b64d(v["chaves"]["pedidos"]), agente.b64d(v["chaves"]["tarefas"])
        for p in v["pedidos"]:
            corpo = base64.b64decode(p["corpoBase64"])
            self.assertEqual(corpo, p["corpo"].encode("utf-8"))
            self.assertEqual(hashlib.sha256(corpo).hexdigest(), p["corpoSha256"])
            canon = agente.canonico_pedido(p["metodo"], p["caminho"], v["servidorId"], p["seq"], corpo)
            self.assertEqual(canon, p["canonico"], p["nome"])
            self.assertEqual(agente.assinar(kp, canon), p["assinatura"], p["nome"])
        for t in v["tarefas"]:
            with self.subTest(t["nome"]):
                msg = agente.mensagem_tarefa(t.get("servidorId", v["servidorId"]), t["tarefa"])
                if t["valida"]:
                    self.assertEqual(msg, t["mensagem"])
                    self.assertEqual(agente.assinar(kt, msg), t["assinatura"])
                else:
                    self.assertNotEqual(agente.assinar(kt, msg), t["assinatura"])

    def test_verificar_tarefa_com_os_vetores_do_ts(self):
        v = apoio.ler_json(os.path.join(apoio.FIXTURES_TS, "vetores-protocolo.json"))
        r = apoio.nova_raiz()
        self.addCleanup(apoio.apagar_raiz, r)
        apoio.escrever(os.path.join(r, "var/lib/dash-agent/agente.json"), json.dumps(
            {"painel": "http://127.0.0.1:9", "servidorId": v["servidorId"], "token": v["token"]["valor"],
             "chavePedidos": v["chaves"]["pedidos"], "chaveTarefas": v["chaves"]["tarefas"], "geracao": v["geracao"]}), 0o600)
        estado = os.path.join(r, "var/lib/dash-agent/estado.json")
        antigo = agente.relogio
        self.addCleanup(setattr, agente, "relogio", antigo)
        for t in v["tarefas"]:
            with self.subTest(t["nome"]):
                apoio.escrever(estado, '{"ultimaSeqPedido":0,"ultimaSeqTarefa":0,"desvioMs":0}', 0o600)
                ctx = agente.Contexto(apoio.args_agente(r))
                ctx.cfg = dict(ctx.cfg, servidorId=t.get("servidorId", v["servidorId"]))
                agente.relogio = lambda: t["tarefa"]["expiraEm"] - 300  # dentro da validade assinada
                envelope = dict(t["tarefa"], assinatura=t["assinatura"])
                if t["valida"]:
                    agente.verificar_tarefa(ctx, envelope)
                    self.assertEqual(apoio.ler_json(estado)["ultimaSeqTarefa"], t["tarefa"]["seq"])
                else:
                    with self.assertRaises(agente.Recusa) as e:
                        agente.verificar_tarefa(ctx, envelope)
                    self.assertEqual(e.exception.codigo, "assinatura_invalida")
                    self.assertEqual(apoio.ler_json(estado)["ultimaSeqTarefa"], 0)

    def test_teto_da_seq_e_o_do_js(self):
        # Number.isSafeInteger: 2^53 - 1 é o maior inteiro que o painel aceita (seq de pedido e de tarefa).
        self.assertEqual(agente.SEQ_MAX, 2**53 - 1)
        v = apoio.ler_json(os.path.join(apoio.FIXTURES_TS, "vetores-protocolo.json"))
        self.assertIn(str(agente.SEQ_MAX), [p["seq"] for p in v["pedidos"]])
        self.assertIn(agente.SEQ_MAX, [t["tarefa"]["seq"] for t in v["tarefas"] if t["valida"]])


class ComPainel(apoio.TesteComRaiz):
    """Agente registrado num painel falso; o ajudante root sobe só quando o teste pede."""

    def setUp(self):
        super().setUp()
        self.painel = apoio.PainelFalso().__enter__()
        self.addCleanup(self.painel.__exit__, None, None, None)
        self.addCleanup(lambda: self.assertEqual(self.painel.violacoes, [], "o agente mandou algo fora do formato do protocolo.ts"))
        self.ctx = apoio.registrar_agente(self.painel, self.r)
        self.ctx.espera_reenvio = 0
        self.www = os.path.join(self.r, "var/www/dash-funil")

    def subir_root(self):
        h = apoio.HelperRoot(self.r)
        self.addCleanup(h.parar)
        return h

    def estado(self):
        return apoio.ler_json(os.path.join(self.r, "var/lib/dash-agent/estado.json"))

    def processar(self, t):
        with silencioso():
            return agente.processar(self.ctx, t)

    def uma_vez(self):
        with silencioso():
            return agente.uma_vez(apoio.args_agente(self.r))


class Registro(ComPainel):
    def test_arquivos_e_modos(self):
        cfg = os.path.join(self.r, "var/lib/dash-agent/agente.json")
        self.assertEqual(os.stat(cfg).st_mode & 0o777, 0o600)
        d = apoio.ler_json(cfg)
        self.assertEqual(d["servidorId"], self.painel.servidor_id)
        self.assertEqual(len(d["token"]), 43)
        self.assertEqual(self.painel.token_hash, hashlib.sha256(d["token"].encode()).hexdigest())
        self.assertEqual(self.estado(), {"ultimaSeqPedido": 0, "ultimaSeqTarefa": 0, "desvioMs": 0})
        inv = self.painel.registros[0]["agente"]
        self.assertEqual(sorted(inv), ["certbot", "hostname", "ipv4", "ipv6", "nginx", "python", "so", "versao"])
        self.assertNotIn(d["token"], json.dumps(self.painel.registros))  # só o sha256 sai da VPS

    def test_codigo_usado_ou_errado_sai_com_2(self):
        args = apoio.args_agente(self.r, painel=self.painel.url)
        with silencioso(), self.assertRaises(SystemExit) as e:
            agente.registrar(args, codigo="x" * 43)
        self.assertEqual(e.exception.code, 2)

    def test_registro_pela_cli_le_o_codigo_do_stdin(self):
        codigo = self.painel.codigo()
        r = subprocess.run(
            [sys.executable, "-I", os.path.join(apoio.PUBLICO, "dash_agent.py"), "registrar", "--painel", self.painel.url,
             "--modo-teste", "--raiz", self.r, "--uid-esperado", str(os.getuid())],
            input=codigo + "\n", capture_output=True, text=True, timeout=60, env={"PATH": "/usr/bin:/bin"},
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("confirme que este é o seu servidor", r.stdout)
        self.assertEqual(self.painel.registros[-1]["codigo"], codigo)


class VerificacaoDaTarefa(ComPainel):
    def recusa(self, t, codigo):
        antes_www, antes_est = apoio.retrato(self.www), self.estado()["ultimaSeqTarefa"]
        with self.assertRaises(agente.Recusa) as e:
            agente.verificar_tarefa(self.ctx, t)
        self.assertEqual(e.exception.codigo, codigo)
        self.assertEqual(apoio.retrato(self.www), antes_www)
        self.assertEqual(self.estado()["ultimaSeqTarefa"], antes_est)

    def test_tarefa_boa_grava_a_seq_antes(self):
        t = self.painel.tarefa("servidor.coletar", {}, seq=7)
        self.assertEqual(agente.verificar_tarefa(self.ctx, t), {})
        self.assertEqual(self.estado()["ultimaSeqTarefa"], 7)

    def test_adulteracoes_de_um_byte(self):
        boa = self.painel.tarefa("site.configurar", params_configurar(), seq=5)
        for campo, valor in (
            ("params", boa["params"].replace("loja.com.br", "loja.com.bq", 1)),
            ("seq", 6),
            ("tipo", "site.remover"),
            ("expiraEm", boa["expiraEm"] + 1),
            ("assinatura", ("0" if boa["assinatura"][0] != "0" else "1") + boa["assinatura"][1:]),
        ):
            self.recusa(dict(boa, **{campo: valor}), "assinatura_invalida")
        outro_servidor = self.painel.tarefa("servidor.coletar", {}, seq=5, servidor_id=str(uuid.uuid4()))
        self.recusa(outro_servidor, "assinatura_invalida")
        self.assertEqual(os.listdir(os.path.join(self.r, "var/lib/dash-agent/diario")), [])

    def test_formato(self):
        boa = self.painel.tarefa("servidor.coletar", {}, seq=5)
        for ruim in (dict(boa, seq="5"), dict(boa, seq=True), dict(boa, id="../../x"), dict(boa, extra=1),
                     {k: v for k, v in boa.items() if k != "assinatura"}, dict(boa, expiraEm=1.5), "texto"):
            self.recusa(ruim, "tarefa_malformada")

    def test_validade_seq_tipo_e_chaves(self):
        agora = int(time.time())
        self.recusa(self.painel.tarefa("servidor.coletar", {}, seq=5, expira_em=agora - 121), "tarefa_expirada")
        self.recusa(self.painel.tarefa("servidor.coletar", {}, seq=5, expira_em=agora + 1021 + 5), "tarefa_no_futuro")
        agente.verificar_tarefa(self.ctx, self.painel.tarefa("servidor.coletar", {}, seq=9))
        self.recusa(self.painel.tarefa("servidor.coletar", {}, seq=9), "tarefa_repetida")
        self.recusa(self.painel.tarefa("servidor.coletar", {}, seq=8), "tarefa_repetida")
        self.recusa(self.painel.tarefa("site.apagar_tudo", {}, seq=10), "tipo_desconhecido")
        self.recusa(self.painel.tarefa("servidor.coletar", {"a": 1}, seq=10), "params_invalidos")
        self.recusa(self.painel.tarefa("site.remover", '{"siteId":"%s","slug":"a","slug":"b"}' % SITE, seq=10), "params_invalidos")

    def test_travas_locais(self):
        travas = os.path.join(self.r, "etc/dash-agent/travas.json")
        apoio.escrever(travas, '{"pausado":false,"somenteLeitura":true}')
        self.recusa(self.painel.tarefa("site.remover", {"siteId": SITE, "slug": "a"}, seq=5), "trava_local")
        agente.verificar_tarefa(self.ctx, self.painel.tarefa("servidor.coletar", {}, seq=6))  # leitura passa
        apoio.escrever(travas, '{"pausado":true,"somenteLeitura":false}')
        self.recusa(self.painel.tarefa("servidor.coletar", {}, seq=7), "trava_local")
        apoio.escrever(travas, "{estragado")
        self.recusa(self.painel.tarefa("servidor.coletar", {}, seq=7), "trava_local")  # falha fechada

    def test_assinatura_invalida_vai_ao_painel_sem_diario(self):
        t = dict(self.painel.tarefa("servidor.coletar", {}, seq=5), params='{"x":1}')
        self.assertEqual(self.processar(t), "recusada")
        self.assertEqual(self.painel.resultados[-1][1]["estado"], "falhou")
        self.assertTrue(self.painel.resultados[-1][1]["erro"].startswith("assinatura_invalida"))
        self.assertEqual(os.listdir(os.path.join(self.r, "var/lib/dash-agent/diario")), [])
        self.assertEqual(self.estado()["ultimaSeqTarefa"], 0)


class Reentrega(ComPainel):
    def test_mesma_tarefa_executa_uma_vez(self):
        chamadas = []
        original = agente.EXECUTORES["servidor.coletar"]
        agente.EXECUTORES["servidor.coletar"] = lambda ctx, p: chamadas.append(1) or {"visaoGeral": "x"}
        self.addCleanup(agente.EXECUTORES.__setitem__, "servidor.coletar", original)
        t = self.painel.tarefa("servidor.coletar", {}, seq=3)
        self.assertEqual(self.processar(t), "concluida")
        self.assertEqual(self.processar(t), "reenviada")
        self.assertEqual(len(chamadas), 1)
        self.assertEqual([r[1] for r in self.painel.resultados][0]["resultado"], {"visaoGeral": "x"})
        self.assertEqual(self.painel.resultados[0][1], self.painel.resultados[1][1] | {"duracaoMs": self.painel.resultados[0][1]["duracaoMs"]})

    def test_diario_executando_volta_interrompida(self):
        chamadas = []
        original = agente.EXECUTORES["servidor.coletar"]
        agente.EXECUTORES["servidor.coletar"] = lambda ctx, p: chamadas.append(1) or {}
        self.addCleanup(agente.EXECUTORES.__setitem__, "servidor.coletar", original)
        t = self.painel.tarefa("servidor.coletar", {}, seq=3)
        agente.diario(self.ctx, t["id"], {"estado": "executando", "seq": 3, "tipo": t["tipo"], "enviado": False})
        self.processar(t)
        self.assertEqual(chamadas, [])
        corpo = self.painel.resultados[-1][1]
        self.assertEqual(corpo["estado"], "falhou")
        self.assertIn("interrompida", corpo["erro"])

    def test_reinicio_fecha_as_interrompidas(self):
        ident = str(uuid.uuid4())
        agente.diario(self.ctx, ident, {"estado": "executando", "seq": 3, "tipo": "servidor.coletar", "enviado": False})
        agente.fechar_interrompidas(self.ctx)
        reg = agente.ler_diario(self.ctx, ident)
        self.assertEqual((reg["estado"], reg["enviado"]), ("falhou", False))

    def test_pulso_perdido_reentrega_pelo_uma_vez(self):
        t = self.painel.tarefa("servidor.coletar", {}, seq=1)
        self.painel.fila += [t, t]  # o painel reentrega a MESMA tarefa assinada
        self.uma_vez()
        self.assertEqual(len(self.painel.resultados), 2)
        self.assertEqual({r[1]["estado"] for r in self.painel.resultados}, {"concluida"})
        visao = self.painel.resultados[0][1]["resultado"]["visaoGeral"]
        self.assertTrue(visao.startswith("ORBIT_VPS_V1\n") and visao.endswith("END_ORBIT_VPS_V1\n"))
        self.assertNotIn("\nuser\t", visao)


class DiarioReenviado(ComPainel):
    def test_recusa_tres_vezes_e_aceita_na_volta_seguinte(self):
        self.painel.recusar_resultados = 3
        t = self.painel.tarefa("servidor.coletar", {}, seq=1)
        self.processar(t)
        self.assertEqual(self.painel.resultados, [])
        self.assertFalse(agente.ler_diario(self.ctx, t["id"])["enviado"])
        with silencioso():
            agente.reenviar_pendentes(self.ctx)  # próxima volta do laço, sem reinício
        self.assertEqual(len(self.painel.resultados), 1)
        self.assertTrue(agente.ler_diario(self.ctx, t["id"])["enviado"])

    def test_404_descarta(self):
        self.painel.recusar_resultados = 3
        t = self.painel.tarefa("servidor.coletar", {}, seq=1)
        self.processar(t)
        self.painel.resultado_404.add(t["id"])
        with silencioso():
            agente.reenviar_pendentes(self.ctx)
        reg = agente.ler_diario(self.ctx, t["id"])
        self.assertEqual((reg["enviado"], reg["descartado"]), (True, 404))


class Relogio(ComPainel):
    def setUp(self):
        super().setUp()
        self.addCleanup(setattr, agente, "relogio", agente.relogio)

    def test_adiantado_dez_minutos(self):
        agente.relogio = lambda: time.time() + 600
        with silencioso():
            r = agente.pulsar(self.ctx)
        self.assertTrue(r["ok"])
        status = [p[3] for p in self.painel.pedidos]
        self.assertEqual(status, [409, 200])
        self.assertLess(abs(self.estado()["desvioMs"] + 600_000), 5_000)
        agente.relogio = time.time  # o relógio "volta"
        with silencioso():
            agente.pulsar(self.ctx)
            agente.pulsar(self.ctx)
        self.assertEqual([p[3] for p in self.painel.pedidos][2:], [200, 200])
        self.assertLess(abs(self.estado()["desvioMs"]), 5_000)  # aprendeu de novo pelo agoraMs

    def test_seq_monotonica_com_relogio_voltando(self):
        with silencioso():
            agente.pulsar(self.ctx)
            agente.relogio = lambda: time.time() - 3600
            agente.pulsar(self.ctx)
            agente.pulsar(self.ctx)
        seqs = [p[2] for p in self.painel.pedidos]
        self.assertEqual(seqs, sorted(set(seqs)))
        self.assertEqual({p[3] for p in self.painel.pedidos}, {200})

    def test_seq_gravada_antes_de_enviar(self):
        self.painel.redirecionar = True  # o pedido falha, mas a seq já está no disco
        with silencioso(), self.assertRaises(urllib.error.HTTPError):
            agente.pulsar(self.ctx)
        self.assertEqual(self.estado()["ultimaSeqPedido"], self.painel.pedidos[-1][2])

    def test_tarefa_com_relogio_errado_usa_o_desvio(self):
        agente.relogio = lambda: time.time() + 3600
        with silencioso():
            agente.pulsar(self.ctx)  # aprende o desvio de -1 h pelo 409 clock_skew
        t = self.painel.tarefa("servidor.coletar", {}, seq=4)
        self.assertEqual(agente.verificar_tarefa(self.ctx, t), {})


class Cliente(ComPainel):
    def test_redirect_vira_erro(self):
        self.painel.redirecionar = True
        with self.assertRaises(urllib.error.HTTPError) as e:
            agente.pulsar(self.ctx)
        self.assertEqual(e.exception.code, 307)

    def test_http_fora_do_modo_teste(self):
        cfg = apoio.ler_json(os.path.join(self.r, "var/lib/dash-agent/agente.json"))
        with self.assertRaises(SystemExit):
            agente.Cliente(cfg, self.ctx.cam.estado, modo_teste=False)
        self.assertFalse(agente.painel_ok("https://painel.com.br/x", False))
        self.assertTrue(agente.painel_ok("https://dash-board-psi-one.vercel.app", False))

    def test_401_com_e_sem_marca(self):
        self.painel.revogar = "sem_marca"
        with self.assertRaises(urllib.error.HTTPError):
            agente.pulsar(self.ctx)
        self.painel.revogar = "marca"
        with self.assertRaises(agente.Revogado):
            agente.pulsar(self.ctx)

    def test_429_espera(self):
        self.painel.limitar = 1
        with self.assertRaises(agente.Espere) as e:
            agente.pulsar(self.ctx)
        self.assertEqual(e.exception.segundos, 1)

    def test_pulso_leva_sites_travas_e_visao(self):
        with silencioso():
            agente.pulsar(self.ctx)
        p = self.painel.pulsos[-1]
        self.assertEqual(sorted(p), ["certificados", "desvioMs", "executando", "ipv4", "ipv6", "nginx", "sites", "travas", "versao", "visaoGeral"])
        self.assertEqual(p["travas"], {"pausado": False, "somenteLeitura": False})
        self.assertEqual(p["sites"], [])
        self.assertTrue(p["visaoGeral"].startswith("ORBIT_VPS_V1\n"))


class Revogacao(apoio.TesteComRaiz):
    def rodar(self, painel):
        return subprocess.Popen(
            [sys.executable, "-I", os.path.join(apoio.PUBLICO, "dash_agent.py"), "rodar", "--modo-teste", "--raiz", self.r,
             "--uid-esperado", str(os.getuid())],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={"PATH": "/usr/bin:/bin"},
        )

    def test_401_com_a_marca_sai_com_3(self):
        with apoio.PainelFalso() as painel:
            apoio.registrar_agente(painel, self.r)
            painel.revogar = "marca"
            p = self.rodar(painel)
            try:
                self.assertEqual(p.wait(30), 3)
            finally:
                p.kill()
                p.communicate()
        self.assertTrue(os.path.exists(os.path.join(self.r, "var/lib/dash-agent/revogado")))
        r = subprocess.run([sys.executable, "-I", os.path.join(apoio.PUBLICO, "dash_agent.py"), "rodar", "--modo-teste", "--raiz", self.r],
                           capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 3)  # e não volta sozinho: precisa de reconectar

    def test_401_sem_a_marca_segue_com_backoff(self):
        with apoio.PainelFalso() as painel:
            apoio.registrar_agente(painel, self.r)
            painel.revogar = "sem_marca"
            p = self.rodar(painel)
            try:
                limite = time.time() + 20
                while not painel.pedidos and time.time() < limite:
                    time.sleep(0.05)
                time.sleep(1)
                self.assertIsNone(p.poll(), "o agente não pode sair por um 401 sem a marca do Dash")
                self.assertTrue(painel.pedidos)
            finally:
                p.send_signal(signal.SIGTERM)
                p.communicate(timeout=10)
        self.assertFalse(os.path.exists(os.path.join(self.r, "var/lib/dash-agent/revogado")))


class Extracao(apoio.TesteComRaiz):
    @classmethod
    def setUpClass(cls):
        cls.casos = gerar_zips.casos()

    def extrair(self, nome):
        dados, _ = self.casos[nome]
        z = os.path.join(self.r, nome + ".zip")
        with open(z, "wb") as f:
            f.write(dados)
        destino = os.path.join(self.r, "destino-" + nome)
        os.mkdir(destino)
        return destino, lambda: agente.extrair(z, destino)

    def test_maliciosos(self):
        for nome, (_dados, codigo) in self.casos.items():
            if codigo is None:
                continue
            with self.subTest(nome):
                destino, rodar = self.extrair(nome)
                with self.assertRaises(agente.Recusa) as e:
                    rodar()
                self.assertEqual(e.exception.codigo, codigo)
                for base, _p, arquivos in os.walk(destino):
                    for a in arquivos:
                        self.assertNotIn(a, ("fora.html", "x.txt", "link.html", ".env", "script.php"))

    def test_bom_com_modos(self):
        destino, rodar = self.extrair("bom")
        n, total = rodar()
        self.assertEqual(n, 6)
        self.assertEqual(total, sum(len(d) for d in (gerar_zips.INDEX, b"body{margin:0}", b"console.log(1)", b"<p>Obrigado</p>", b"<p>Termos</p>")) + 108)
        for base, pastas, arquivos in os.walk(destino):
            for p in pastas:
                self.assertEqual(os.stat(os.path.join(base, p)).st_mode & 0o777, 0o755)
            for a in arquivos:
                self.assertEqual(os.stat(os.path.join(base, a)).st_mode & 0o777, 0o644)

    def test_lixo_ignorado_e_pasta_raiz_removida(self):
        destino, rodar = self.extrair("pasta_raiz_e_lixo")
        self.assertEqual(rodar(), (2, len(gerar_zips.INDEX) + 6))
        achados = sorted(os.path.relpath(os.path.join(b, a), destino) for b, _p, arqs in os.walk(destino) for a in arqs)
        self.assertEqual(achados, ["css/estilo.css", "index.html"])

    def test_acento_em_utf8_nfc(self):
        destino, rodar = self.extrair("acento_nfc")
        self.assertEqual(rodar(), (3, 2 * len(gerar_zips.INDEX) + 1))
        achados = sorted(os.path.relpath(os.path.join(b, a), destino) for b, _p, arqs in os.walk(destino) for a in arqs)
        self.assertEqual(achados, ["img/promoção.png", "index.html", "verão/oferta.html"])

    def test_bomba_para_nos_bytes_reais(self):
        antigo = dict(agente.LIM)
        self.addCleanup(agente.LIM.update, antigo)
        agente.LIM["arquivo"] = 1000  # mesmo com cabeçalho honesto e pequeno, o teto é o do que sai do zlib
        destino, rodar = self.extrair("bom")
        dados = gerar_zips.montar([("index.html", b"x" * 5000)])
        with open(os.path.join(self.r, "bom.zip"), "wb") as f:
            f.write(dados)
        with self.assertRaises(agente.Recusa) as e:
            rodar()
        self.assertEqual(e.exception.codigo, "zip_bomba")
        self.assertLessEqual(os.path.getsize(os.path.join(destino, "index.html")), 1000)


class Publicacao(ComPainel):
    def setUp(self):
        super().setUp()
        self.subir_root()
        self.processar(self.painel.tarefa("site.configurar", params_configurar()))
        self.base = os.path.join(self.www, "loja-com-br")

    def ultimo(self):
        return self.painel.resultados[-1][1]

    def test_configurar_cria_pagina_de_espera(self):
        r = self.ultimo()
        self.assertEqual(r["estado"], "concluida", r)
        self.assertEqual(r["resultado"]["modo"], "http")
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "vazio")
        with open(os.path.join(self.base, "vazio/index.html"), encoding="utf-8") as f:
            self.assertEqual(f.read(), agente.PAGINA_DE_ESPERA)
        for p in ("", "releases", "vazio"):
            self.assertEqual(os.stat(os.path.join(self.base, p)).st_mode & 0o777, 0o755)
        self.assertTrue(os.path.isfile(os.path.join(self.r, "etc/nginx/sites-available/dash-loja-com-br.conf")))

    def test_configurar_tls_sem_certificado_cai_para_http(self):
        self.processar(self.painel.tarefa("site.configurar", params_configurar(tls=True)))
        r = self.ultimo()
        self.assertEqual(r["estado"], "concluida", r)
        self.assertEqual((r["resultado"]["modo"], r["resultado"]["aviso"]), ("http", "certificado_ausente"))

    def test_publicar_voltar_e_podar(self):
        versoes = []
        for i in range(7):
            v = str(uuid.uuid4())
            versoes.append(v)
            self.processar(publicar(self.painel, zip_simples(f"<h1>versao {i}</h1>"), versao=v))
            r = self.ultimo()
            self.assertEqual(r["estado"], "concluida", r)
            self.assertEqual(os.readlink(os.path.join(self.base, "current")), "releases/" + v)
            time.sleep(0.002)
        self.assertEqual(r["resultado"]["arquivos"], 2)
        self.assertEqual(r["resultado"]["indexSha256"], hashlib.sha256(b"<h1>versao 6</h1>").hexdigest())
        guardadas = sorted(n for n in os.listdir(os.path.join(self.base, "releases")))
        self.assertEqual(guardadas, sorted(versoes[2:]))  # a ativa + as 4 mais novas
        self.assertEqual(sorted(self.painel.resultados[-2][1]["resultado"]["removidas"] + r["resultado"]["removidas"]), sorted(versoes[:2]))
        self.assertEqual(os.listdir(os.path.join(self.r, "var/lib/dash-agent/tmp")), [])
        # voltar para uma versão guardada
        self.processar(self.painel.tarefa("site.ativar_versao", {"siteId": SITE, "slug": "loja-com-br", "versaoId": versoes[3]}))
        r = self.ultimo()
        self.assertEqual(r["estado"], "concluida", r)
        self.assertEqual((r["resultado"]["versaoId"], r["resultado"]["anterior"]), (versoes[3], versoes[6]))
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "releases/" + versoes[3])
        # a versão podada não volta
        self.processar(self.painel.tarefa("site.ativar_versao", {"siteId": SITE, "slug": "loja-com-br", "versaoId": versoes[0]}))
        self.assertTrue(self.ultimo()["erro"].startswith("versao_inexistente"))
        # o pulso conta o que está no disco
        with silencioso():
            agente.pulsar(self.ctx)
        self.assertEqual(self.painel.pulsos[-1]["sites"], [{"slug": "loja-com-br", "atual": versoes[3], "versoes": sorted(versoes[2:])}])

    def test_marcador_por_ultimo_e_modos(self):
        v = str(uuid.uuid4())
        self.processar(publicar(self.painel, gerar_zips.casos()["bom"][0], versao=v))
        pasta = os.path.join(self.base, "releases", v)
        marcador = os.stat(os.path.join(pasta, ".dash-release.json"))
        for base, pastas, arquivos in os.walk(pasta):
            for a in arquivos:
                st = os.stat(os.path.join(base, a))
                self.assertEqual(st.st_mode & 0o777, 0o644)
                self.assertLessEqual(st.st_mtime_ns, marcador.st_mtime_ns)
            for p in pastas:
                self.assertEqual(os.stat(os.path.join(base, p)).st_mode & 0o777, 0o755)
        m = apoio.ler_json(os.path.join(pasta, ".dash-release.json"))
        self.assertEqual((m["versaoId"], m["arquivos"]), (v, 6))

    def test_falhas_nao_deixam_sobras(self):
        for nome in ("traversal", "symlink", "bomba_arquivo", "sem_index", "mentindo_tamanho"):
            with self.subTest(nome):
                self.processar(publicar(self.painel, gerar_zips.casos()[nome][0]))
                r = self.ultimo()
                self.assertEqual(r["estado"], "falhou")
                self.assertTrue(r["erro"].startswith(gerar_zips.casos()[nome][1]), r["erro"])
                self.assertEqual(os.listdir(os.path.join(self.base, "releases")), [])
                self.assertEqual(os.listdir(os.path.join(self.r, "var/lib/dash-agent/tmp")), [])
                self.assertEqual(os.readlink(os.path.join(self.base, "current")), "vazio")

    def test_sha_errado_nao_extrai(self):
        t = publicar(self.painel, zip_simples("a"))
        p = json.loads(t["params"])
        self.painel.artefatos[p["artefatoId"]] = zip_simples("b")  # o painel (ou um MITM) troca o ZIP
        self.processar(t)
        self.assertTrue(self.ultimo()["erro"].startswith("artefato_"))
        self.assertEqual(os.listdir(os.path.join(self.base, "releases")), [])

    def test_publicar_repetido_reativa_sem_baixar(self):
        z = zip_simples("x")
        t = publicar(self.painel, z)
        self.processar(t)
        p = json.loads(t["params"])
        del self.painel.artefatos[p["artefatoId"]]  # a linha do artefato some quando a publicação termina
        t2 = self.painel.tarefa("site.publicar", p)
        self.processar(t2)
        r = self.ultimo()
        self.assertEqual(r["estado"], "concluida", r)
        self.assertTrue(r["resultado"]["repetida"])

    def test_troca_atomica(self):
        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        self.processar(publicar(self.painel, zip_simples("A"), versao=a))
        self.processar(publicar(self.painel, zip_simples("B"), versao=b))
        parar, erros, leituras = threading.Event(), [], [0]

        def olhar():
            alvo = os.path.join(self.base, "current", "index.html")
            while not parar.is_set():
                try:
                    os.stat(alvo)
                    leituras[0] += 1
                except OSError as e:
                    erros.append(e.errno)

        th = threading.Thread(target=olhar)
        th.start()
        try:
            for i in range(2000):  # a spec pede 200; 2000 dá chance real de pegar a volta do rename(2) simples
                agente.trocar_current(self.base, "releases/" + (a if i % 2 else b))
        finally:
            parar.set()
            th.join()
        self.assertNotIn(errno.ENOENT, erros)
        self.assertEqual(erros, [])
        self.assertGreater(leituras[0], 0)
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "releases/" + a)  # a última (i=1999) foi para a

    def test_troca_sem_renameat2(self):
        original = agente._trocar_nomes
        agente._trocar_nomes = lambda x, y: False  # libc antiga ou sistema de arquivos sem RENAME_EXCHANGE
        self.addCleanup(setattr, agente, "_trocar_nomes", original)
        a = str(uuid.uuid4())
        self.processar(publicar(self.painel, zip_simples("A"), versao=a))
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "releases/" + a)
        agente.trocar_current(self.base, "vazio")
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "vazio")

    def test_link_antigo_sai_depois(self):
        a = str(uuid.uuid4())
        self.processar(publicar(self.painel, zip_simples("A"), versao=a))
        agente.trocar_current(self.base, "vazio")
        velhos = [os.readlink(os.path.join(self.base, n)) for n in os.listdir(self.base) if n.startswith(".current-")]
        self.assertIn("releases/" + a, velhos)  # o link que saiu do ar ainda está em disco (buscas em andamento)
        agente.apagar_links_velhos(self.base, idade=-1)
        self.assertEqual([n for n in os.listdir(self.base) if n.startswith(".current-")], [])
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "vazio")

    def test_remover_vai_para_a_lixeira(self):
        self.processar(publicar(self.painel, zip_simples("x")))
        self.processar(self.painel.tarefa("site.remover", {"siteId": SITE, "slug": "loja-com-br"}))
        r = self.ultimo()
        self.assertEqual(r["estado"], "concluida", r)
        self.assertFalse(os.path.exists(self.base))
        self.assertTrue(os.path.isdir(r["resultado"]["movidoPara"]))
        self.assertFalse(os.path.exists(os.path.join(self.r, "etc/nginx/sites-available/dash-loja-com-br.conf")))
        self.processar(self.painel.tarefa("site.remover", {"siteId": SITE, "slug": "loja-com-br"}))
        self.assertEqual(self.ultimo()["resultado"], {})  # idempotente (movidoPara ausente, nunca null)

    def test_marcador_do_dono_fica_fora_do_current(self):
        marcador = os.path.join(self.base, ".dash-site.json")
        self.assertEqual(apoio.ler_json(marcador)["siteId"], SITE)
        self.assertEqual(os.stat(marcador).st_mode & 0o777, 0o644)
        self.assertEqual(agente.dono_da_pasta(self.base), SITE)
        self.processar(self.painel.tarefa("site.configurar", params_configurar()))  # reaplicar o mesmo site: ok
        self.assertEqual(self.ultimo()["estado"], "concluida", self.ultimo())

    def test_pasta_de_outro_site_nao_e_tomada(self):
        # Mesma VPS, outro servidor do painel (removido e registrado de novo, por exemplo): o slug
        # "loja-com-br" volta num site com outro siteId. Nada do site dono da pasta pode mudar.
        v = str(uuid.uuid4())
        self.processar(publicar(self.painel, zip_simples("A"), versao=v))
        conf = os.path.join(self.r, "etc/nginx/sites-available/dash-loja-com-br.conf")
        with open(conf, encoding="utf-8") as f:
            vhost = f.read()
        outro = str(uuid.uuid4())
        self.processar(self.painel.tarefa("site.configurar", dict(params_configurar(dominios=["outra-loja.com.br"]), siteId=outro)))
        self.assertTrue(self.ultimo()["erro"].startswith("slug_de_outro_site"), self.ultimo())
        z = zip_simples("B")
        art = str(uuid.uuid4())
        self.painel.artefatos[art] = z
        self.processar(self.painel.tarefa("site.publicar", {"siteId": outro, "slug": "loja-com-br", "versaoId": str(uuid.uuid4()),
                                                           "artefatoId": art, "sha256": hashlib.sha256(z).hexdigest(), "bytes": len(z)}))
        self.assertTrue(self.ultimo()["erro"].startswith("slug_de_outro_site"), self.ultimo())
        self.processar(self.painel.tarefa("site.ativar_versao", {"siteId": outro, "slug": "loja-com-br", "versaoId": v}))
        self.assertTrue(self.ultimo()["erro"].startswith("slug_de_outro_site"), self.ultimo())
        # remover o site novo não mexe na pasta, no vhost nem no certificado do outro: deste não há nada aqui
        self.processar(self.painel.tarefa("site.remover", {"siteId": outro, "slug": "loja-com-br"}))
        r = self.ultimo()
        self.assertEqual((r["estado"], r["resultado"]), ("concluida", {}), r)
        self.assertEqual(os.readlink(os.path.join(self.base, "current")), "releases/" + v)
        self.assertEqual(os.listdir(os.path.join(self.base, "releases")), [v])
        with open(conf, encoding="utf-8") as f:
            self.assertEqual(f.read(), vhost)
        self.assertEqual(agente.dono_da_pasta(self.base), SITE)

    def test_pasta_sem_marcador(self):
        # Com conteúdo (de uma versão sem marcador, ou feita à mão): não é deste site.
        legado = os.path.join(self.www, "legado")
        os.makedirs(os.path.join(legado, "vazio"))
        os.symlink("vazio", os.path.join(legado, "current"))
        outro = str(uuid.uuid4())
        self.processar(self.painel.tarefa("site.configurar", dict(params_configurar(slug="legado", dominios=["legado.com.br"]), siteId=outro)))
        self.assertTrue(self.ultimo()["erro"].startswith("slug_de_outro_site"), self.ultimo())
        self.assertFalse(os.path.lexists(os.path.join(legado, ".dash-site.json")))
        # Vazia (um configurar que caiu entre o mkdir e o marcador): o site toma para si.
        vazia = os.path.join(self.www, "vazia")
        os.makedirs(vazia)
        self.processar(self.painel.tarefa("site.configurar", dict(params_configurar(slug="vazia", dominios=["vazia.com.br"]), siteId=outro)))
        self.assertEqual(self.ultimo()["estado"], "concluida", self.ultimo())
        self.assertEqual(agente.dono_da_pasta(vazia), outro)

    def test_ssl_emite_e_vira_https(self):
        self.processar(self.painel.tarefa("site.ssl_emitir", {"siteId": SITE, "slug": "loja-com-br", "dominios": ["loja.com.br", "www.loja.com.br"],
                                                              "email": "dono@e2e-teste.com.br"}))
        r = self.ultimo()
        self.assertEqual(r["estado"], "concluida", r)
        self.assertRegex(r["resultado"]["validoAte"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        with open(os.path.join(self.r, "etc/nginx/sites-available/dash-loja-com-br.conf"), encoding="utf-8") as f:
            self.assertIn("listen 443 ssl", f.read())


class RaizVazia(unittest.TestCase):
    """Como o §14.D sobe as peças: raiz vazia, ajudante sem --falsos, agente com --modo-teste."""

    def test_do_zero(self):
        import tempfile

        r = tempfile.mkdtemp(prefix="dash-vazia-")
        self.addCleanup(apoio.apagar_raiz, r)
        h = apoio.HelperRoot(r, com_falsos=False)
        self.addCleanup(h.parar)
        with apoio.PainelFalso() as painel:
            ctx = apoio.registrar_agente(painel, r)
            ctx.espera_reenvio = 0
            with silencioso():
                agente.processar(ctx, painel.tarefa("site.configurar", params_configurar()))
            corpo = painel.resultados[-1][1]
            self.assertEqual(corpo["estado"], "concluida", corpo)
            self.assertEqual(os.readlink(os.path.join(r, "var/www/dash-funil/loja-com-br/current")), "vazio")
            self.assertTrue(os.path.isfile(os.path.join(r, "etc/nginx/sites-available/dash-loja-com-br.conf")))


class Socket(ComPainel):
    def test_socket_de_outro_dono_e_recusado(self):
        self.subir_root()
        self.ctx.uid_root = {os.getuid() + 4242}  # quem responde não é quem o agente espera
        with self.assertRaises(agente.Recusa) as e:
            agente.pedir_root(self.ctx, "versao", {})
        self.assertEqual(e.exception.codigo, "root_falso")

    def test_root_parado(self):
        with self.assertRaises(agente.Recusa) as e:
            agente.pedir_root(self.ctx, "versao", {})
        self.assertEqual(e.exception.codigo, "root_indisponivel")


class Cli(apoio.TesteComRaiz):
    @unittest.skipUnless(os.geteuid() == 0, "só faz sentido como root")
    def test_agente_nao_roda_como_root(self):
        for comando in ("rodar", "uma-vez", "registrar"):
            r = self.cli(comando, entrada="x" * 43 + "\n")
            self.assertEqual(r.returncode, 1, comando)
            self.assertIn("roda como dashagent", r.stderr)

    def cli(self, *args, entrada=None):
        return subprocess.run([sys.executable, "-I", os.path.join(apoio.PUBLICO, "dash_agent.py"), *args],
                              input=entrada, capture_output=True, text=True, timeout=60, env={"PATH": "/usr/bin:/bin"})

    def test_travas_pela_cli(self):
        r = self.cli("somente-leitura", "--modo-teste", "--raiz", self.r)
        self.assertEqual(r.returncode, 0, r.stderr)
        caminho = os.path.join(self.r, "etc/dash-agent/travas.json")
        self.assertEqual(apoio.ler_json(caminho), {"pausado": False, "somenteLeitura": True})
        self.assertEqual(os.stat(caminho).st_mode & 0o777, 0o644)
        self.cli("pausar", "--modo-teste", "--raiz", self.r)
        self.cli("liberar-escrita", "--modo-teste", "--raiz", self.r)
        self.assertEqual(apoio.ler_json(caminho), {"pausado": True, "somenteLeitura": False})
        self.cli("retomar", "--modo-teste", "--raiz", self.r)
        self.assertEqual(apoio.ler_json(caminho), {"pausado": False, "somenteLeitura": False})

    def test_raiz_so_com_modo_teste(self):
        self.assertEqual(self.cli("status", "--raiz", self.r).returncode, 2)
        self.assertEqual(self.cli("status", "--modo-teste").returncode, 2)

    def test_status_nao_mostra_segredo(self):
        with apoio.PainelFalso() as painel:
            apoio.registrar_agente(painel, self.r)
        r = self.cli("status", "--modo-teste", "--raiz", self.r)
        self.assertEqual(r.returncode, 0, r.stderr)
        cfg = apoio.ler_json(os.path.join(self.r, "var/lib/dash-agent/agente.json"))
        for segredo in (cfg["token"], cfg["chavePedidos"], cfg["chaveTarefas"]):
            self.assertNotIn(segredo, r.stdout + r.stderr)
        self.assertIn(cfg["servidorId"], r.stdout)

    def test_status_e_diagnostico_nao_passam_controle_ao_terminal(self):
        # sudo dash-agent status/diagnostico rodam como root e leem arquivos do dashagent: um agente
        # comprometido não pode mandar sequências de terminal (OSC 52, CSI 2J) para a sessão do root.
        with apoio.PainelFalso() as painel:
            apoio.registrar_agente(painel, self.r)
        lib = os.path.join(self.r, "var/lib/dash-agent")
        cfg = apoio.ler_json(os.path.join(lib, "agente.json"))
        cfg.update(painel="\u001b]52;c;Y3VybCBldmlsfHNoCg==\u0007https://x.com", servidorId="\u001b[2J", geracao="\u009b31m")
        apoio.escrever(os.path.join(lib, "agente.json"), json.dumps(cfg), 0o600)
        est = apoio.ler_json(os.path.join(lib, "estado.json"))
        est.update(ultimaSeqPedido="\u001b]0;titulo\u0007", ultimaSeqTarefa="\u001b[8m")
        apoio.escrever(os.path.join(lib, "estado.json"), json.dumps(est), 0o600)
        saidas = {}
        for comando in ("status", "diagnostico"):
            r = self.cli(comando, "--modo-teste", "--raiz", self.r)
            saidas[comando] = r.stdout
            for controle in ("\x1b", "\x07", "\x9b"):
                self.assertNotIn(controle, r.stdout + r.stderr, comando)
        self.assertIn("Servidor: [2J", saidas["status"])  # o texto sobra, o ESC não
        self.assertIn("registrado em (endereço inválido no agente.json)", saidas["diagnostico"])

    def test_fifo_no_lugar_do_json_nao_trava_o_status(self):
        with apoio.PainelFalso() as painel:
            apoio.registrar_agente(painel, self.r)
        caminho = os.path.join(self.r, "var/lib/dash-agent/agente.json")
        os.unlink(caminho)
        os.mkfifo(caminho)
        for comando in ("status", "diagnostico"):
            r = subprocess.run([sys.executable, "-I", os.path.join(apoio.PUBLICO, "dash_agent.py"), comando, "--modo-teste", "--raiz", self.r],
                               capture_output=True, text=True, timeout=20, env={"PATH": "/usr/bin:/bin"})
            self.assertEqual(r.returncode, 1, comando + ": " + r.stdout + r.stderr)
        with self.assertRaises(ValueError):
            agente.ler_json(caminho)

    def test_uma_vez_contra_painel_falso(self):
        with apoio.PainelFalso() as painel:
            apoio.registrar_agente(painel, self.r)
            painel.fila.append(painel.tarefa("servidor.coletar", {}))
            r = self.cli("uma-vez", "--modo-teste", "--raiz", self.r, "--uid-esperado", str(os.getuid()))
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(painel.resultados[-1][1]["estado"], "concluida")


if __name__ == "__main__":
    unittest.main()
