"""Testes do dash_agent_root.py (o ajudante root). Socket real com SO_PEERCRED, nginx/certbot/
systemctl FALSOS (tests/agente/falsos) e openssl de verdade. Nada aqui roda como outro usuário,
exceto o teste de uid diferente (só como root, com um processo filho em setuid(65534)).
"""
import http.server
import json
import os
import socket
import sys
import threading
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apoio  # noqa: E402
from apoio import root  # noqa: E402

ORIGEM = "https://checkout-e2e.com.br"


def carregar_casos(pasta):
    return {c["arquivo"][:-5]: c for c in apoio.ler_json(os.path.join(pasta, "casos.json"))["casos"]}


CASOS_GOLDEN = carregar_casos(apoio.GOLDEN)


def args_vhost(caso, **troca):
    a = {k: caso[k] for k in ("slug", "dominios", "principal", "origemCheckout", "checkout", "tls")}
    a.update(troca)
    return a


def gerar(caso):
    return root.gerar_vhost(caso["slug"], args_vhost(caso), caso["tls"], caso["ipv6"], caso["http2On"])


def pedido(op, args, ident=None):
    return (json.dumps({"id": ident or str(uuid.uuid4()), "op": op, "args": args}) + "\n").encode()


def falhar(r, nome, conteudo=""):
    apoio.escrever(os.path.join(r, "falhas", nome), conteudo)


class Goldens(unittest.TestCase):
    def test_vhost_igual_ao_golden(self):
        # Os goldens são os de tests/fixtures/vps/golden, que o vitest também lê (vps-constantes).
        self.assertEqual(len(CASOS_GOLDEN), 7)
        for nome, caso in CASOS_GOLDEN.items():
            with self.subTest(nome):
                with open(os.path.join(apoio.GOLDEN, nome + ".conf"), encoding="utf-8") as f:
                    self.assertEqual(gerar(caso), f.read())

    def test_goldens_passam_no_nginx_falso(self):
        for nome, caso in CASOS_GOLDEN.items():
            with self.subTest(nome):
                r = apoio.nova_raiz()
                self.addCleanup(apoio.apagar_raiz, r)
                if caso["http2On"]:
                    apoio.escrever(os.path.join(r, "nginx-versao"), "1.26.0")
                live = os.path.join(r, "etc/letsencrypt/live/dash-" + caso["slug"])
                for pem in ("fullchain.pem", "privkey.pem"):
                    apoio.escrever(os.path.join(live, pem), "x")
                with open(os.path.join(apoio.GOLDEN, nome + ".conf"), encoding="utf-8") as f:
                    apoio.escrever(os.path.join(r, "etc/nginx/sites-enabled/dash-" + caso["slug"] + ".conf"), f.read())
                ctx = apoio.contexto_root(r)
                t = root.executar(ctx, ["nginx", "-t"], 20)
                self.assertEqual(t.returncode, 0, t.stderr)

    def test_regex_sem_aspas_quebraria_o_nginx(self):
        r = apoio.nova_raiz()
        self.addCleanup(apoio.apagar_raiz, r)
        apoio.escrever(os.path.join(r, "etc/nginx/sites-enabled/x.conf"),
                       "server { listen 80; location ~* \\.[0-9a-f]{8,}\\.(?:js|css)$ { expires 1y; } }\n")
        self.assertNotEqual(root.executar(apoio.contexto_root(r), ["nginx", "-t"], 20).returncode, 0)

    def test_nenhum_valor_escapa_das_regras(self):
        for ruim in ({"dominios": ["loja.com.br;"]}, {"dominios": ["loja.com.br", "evil.com.br { }"]}, {"checkout": ORIGEM + "/checkout/x; return 200"},
                     {"origemCheckout": "https://a.com.br$request_uri"}, {"slug": "a b"}):
            a = dict(args_vhost(CASOS_GOLDEN["http"]), **ruim)
            if "dominios" in ruim:
                a["principal"] = ruim["dominios"][0]
            with self.assertRaises(root.Recusa, msg=ruim):
                root.validar_args("nginx.aplicar", a)


class Operacoes(apoio.TesteComRaiz):
    def setUp(self):
        super().setUp()
        self.ctx = apoio.contexto_root(self.r)
        self.www = os.path.join(self.r, "var/www/dash-funil")
        os.makedirs(os.path.join(self.www, "loja-e2e/vazio"))
        apoio.escrever(os.path.join(self.www, "loja-e2e/vazio/index.html"), "espera")
        self.www_antes = apoio.retrato(self.www)
        self.a = args_vhost(CASOS_GOLDEN["http-www"])
        self.conf = os.path.join(self.r, "etc/nginx/sites-available/dash-loja-e2e.conf")
        self.link = os.path.join(self.r, "etc/nginx/sites-enabled/dash-loja-e2e.conf")

    def tearDown(self):
        self.assertEqual(apoio.retrato(self.www), self.www_antes, "o root escreveu na árvore do dashagent")

    def chamados(self, programa=None):
        return [e["argv"] for e in apoio.executados(self.r) if programa is None or e["programa"] == programa]

    def test_aplicar_http(self):
        d = root.aplicar(self.ctx, self.a)
        self.assertEqual(d["modo"], "http")
        with open(self.conf, encoding="utf-8") as f:
            self.assertEqual(f.read(), root.gerar_vhost("loja-e2e", self.a, False, False, False))
        self.assertEqual(os.readlink(self.link), "../sites-available/dash-loja-e2e.conf")
        self.assertEqual(os.stat(self.conf).st_mode & 0o777, 0o644)
        self.assertIn(["reload", "nginx"], self.chamados("systemctl"))
        est = os.path.join(self.r, "var/lib/dash-agent-root/estado/loja-e2e.json")
        self.assertEqual(os.stat(est).st_mode & 0o777, 0o600)

    def test_nginx_recusou_restaura_byte_a_byte(self):
        root.aplicar(self.ctx, self.a)
        with open(self.conf, "rb") as f:
            antes = f.read()
        antes_reload = self.chamados("systemctl").count(["reload", "nginx"])
        falhar(self.r, "nginx-t-se-contem", "dominio-novo.com.br")
        novo = dict(self.a, dominios=["dominio-novo.com.br"], principal="dominio-novo.com.br")
        with self.assertRaises(root.Recusa) as e:
            root.aplicar(self.ctx, novo)
        self.assertEqual(e.exception.codigo, "nginx_recusou")
        with open(self.conf, "rb") as f:
            self.assertEqual(f.read(), antes)
        self.assertEqual(self.chamados("systemctl").count(["reload", "nginx"]), antes_reload)

    def test_nginx_recusou_arquivo_novo_some(self):
        falhar(self.r, "nginx-t-se-contem", "loja-e2e.com.br")
        with self.assertRaises(root.Recusa):
            root.aplicar(self.ctx, self.a)
        self.assertFalse(os.path.lexists(self.conf))
        self.assertFalse(os.path.lexists(self.link))
        self.assertNotIn(["reload", "nginx"], self.chamados("systemctl"))

    def test_nginx_ja_quebrado_nao_e_tocado(self):
        falhar(self.r, "nginx-t", "algo quebrado antes")
        with self.assertRaises(root.Recusa) as e:
            root.aplicar(self.ctx, self.a)
        self.assertEqual(e.exception.codigo, "nginx_ja_quebrado")
        self.assertFalse(os.path.lexists(self.conf))
        self.assertEqual(self.chamados("systemctl"), [])

    def test_colisao_de_server_name(self):
        apoio.escrever(os.path.join(self.r, "etc/nginx/sites-enabled/loja-antiga"),
                       "server {\n  listen 80;\n  server_name www.loja-e2e.com.br;\n  return 404;\n}\n")
        with self.assertRaises(root.Recusa) as e:
            root.aplicar(self.ctx, self.a)
        self.assertEqual(e.exception.codigo, "dominio_em_uso_no_nginx")
        self.assertFalse(os.path.lexists(self.conf))

    def test_colisao_com_outro_site_do_painel_e_curinga(self):
        outro = dict(self.a, slug="outra", dominios=["outra.com.br"], principal="outra.com.br")
        root.aplicar(self.ctx, outro)
        root.aplicar(self.ctx, self.a)  # nomes diferentes: ok
        with self.assertRaises(root.Recusa):
            root.aplicar(self.ctx, dict(self.a, slug="terceira"))  # mesmos domínios de loja-e2e
        apoio.escrever(os.path.join(self.r, "etc/nginx/conf.d/curinga.conf"), "server { listen 80; server_name *.exemplo-loja.com.br; return 404; }\n")
        with self.assertRaises(root.Recusa):
            root.aplicar(self.ctx, dict(self.a, slug="quarta", dominios=["a.exemplo-loja.com.br"], principal="a.exemplo-loja.com.br"))

    def test_colisao_com_regex_e_curinga_no_fim(self):
        # Nome exato vence regex e curinga no nginx: sem esta conferência, o vhost do painel tomaria
        # o domínio de um site feito à mão sem o nginx -t reclamar.
        manual = os.path.join(self.r, "etc/nginx/sites-enabled/loja-manual.conf")
        casos = [
            ("server_name ~^(www\\.)?loja-e2e\\.com\\.br$;", "dominio_em_uso_no_nginx"),
            ("server_name loja-e2e.*;", "dominio_em_uso_no_nginx"),
            ('server_name "~^\\d{1,3}\\.X|^LOJA-E2E\\.com\\.br$";', None),  # caixa do regex preservada: não casa
            ('server_name "~^(?<sub>\\w+)\\.loja-e2e\\.com\\.br$";', "server_name_em_regex"),  # só PCRE: não dá para conferir
            ("server_name ~^api\\.outro\\.com\\.br$ outro.com.br;", None),
        ]
        for linha, codigo in casos:
            with self.subTest(linha):
                apoio.escrever(manual, "server {\n  listen 80;\n  " + linha + "\n  return 404;\n}\n")
                if codigo is None:
                    root.aplicar(self.ctx, self.a)
                    root.remover_vhost(self.ctx, {"slug": "loja-e2e"})
                    continue
                with self.assertRaises(root.Recusa) as e:
                    root.aplicar(self.ctx, self.a)
                self.assertEqual(e.exception.codigo, codigo)
                self.assertFalse(os.path.lexists(self.conf))

    def test_slug_do_padrao_antigo_e_recusado(self):
        # "000-padrao" é o dash-<slug>.conf do servidor padrão das instalações antigas.
        for op, args in (("nginx.aplicar", dict(self.a, slug="000-padrao")), ("nginx.remover", {"slug": "000-padrao"}),
                         ("ssl.emitir", {"slug": "000-padrao", "dominios": self.a["dominios"], "email": None}), ("ssl.remover", {"slug": "000-padrao"})):
            with self.subTest(op), self.assertRaises(root.Recusa) as e:
                root.validar_args(op, args)
            self.assertEqual(e.exception.codigo, "args_invalidos")

    def test_tls_sem_certificado(self):
        with self.assertRaises(root.Recusa) as e:
            root.aplicar(self.ctx, dict(self.a, tls=True))
        self.assertEqual(e.exception.codigo, "certificado_ausente")

    def test_emitir_argv_exato_certificado_real_e_https(self):
        root.aplicar(self.ctx, self.a)
        d = root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": "dono@e2e-teste.com.br"})
        argv = self.chamados("certbot")[-1]
        self.assertEqual(argv, [
            "certonly", "--webroot", "-w", os.path.join(self.r, "var/lib/dash-agent-root/acme"), "--cert-name", "dash-loja-e2e",
            "--non-interactive", "--agree-tos", "--no-eff-email", "--keep-until-expiring", "--email", "dono@e2e-teste.com.br",
            "-d", "loja-e2e.com.br", "-d", "www.loja-e2e.com.br",
        ])
        self.assertFalse(any("hook" in a for a in argv))
        valido = datetime.strptime(d["validoAte"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        self.assertLess(abs(valido - (datetime.now(timezone.utc) + timedelta(days=90))), timedelta(minutes=10))
        with open(self.conf, encoding="utf-8") as f:
            self.assertEqual(f.read(), root.gerar_vhost("loja-e2e", self.a, True, False, False))
        acme = os.path.join(self.r, "var/lib/dash-agent-root/acme/.well-known/acme-challenge")
        self.assertEqual(os.listdir(acme), [])  # a sonda apaga o arquivo dela

    def test_emitir_sem_email(self):
        root.aplicar(self.ctx, self.a)
        root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        argv = self.chamados("certbot")[-1]
        self.assertIn("--register-unsafely-without-email", argv)
        self.assertNotIn("--email", argv)

    def test_emitir_sem_vhost_ou_com_outros_dominios(self):
        with self.assertRaises(root.Recusa) as e:
            root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": ["loja-e2e.com.br"], "email": None})
        self.assertEqual(e.exception.codigo, "vhost_ausente")
        root.aplicar(self.ctx, self.a)
        with self.assertRaises(root.Recusa):
            root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": ["loja-e2e.com.br"], "email": None})
        self.assertEqual(self.chamados("certbot"), [])

    def test_sonda_falhando_nao_chama_certbot(self):
        root.aplicar(self.ctx, self.a)
        falhar(self.r, "sonda")
        with self.assertRaises(root.Recusa) as e:
            root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        self.assertEqual(e.exception.codigo, "vhost_nao_responde")
        self.assertEqual(self.chamados("certbot"), [])

    def test_sonda_http_de_verdade(self):
        acme = os.path.join(self.r, "var/lib/dash-agent-root/acme")
        hosts = []

        class Nginx(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **k):
                super().__init__(*a, directory=acme, **k)

            def do_GET(self):
                hosts.append(self.headers.get("Host"))
                if self.headers.get("Host") == "www.loja-e2e.com.br" and responder_www[0] is False:
                    self.send_error(404)
                    return
                super().do_GET()

            def log_message(self, *a):
                pass

        responder_www = [True]
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Nginx)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        ctx = apoio.contexto_root(self.r, porta_sonda=srv.server_address[1])
        root.aplicar(ctx, self.a)
        root.emitir(ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        self.assertEqual(hosts, ["loja-e2e.com.br", "www.loja-e2e.com.br"])
        responder_www[0] = False
        with self.assertRaises(root.Recusa) as e:
            root.emitir(ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        self.assertEqual(e.exception.codigo, "vhost_nao_responde")

    def test_certbot_falhou_devolve_a_saida(self):
        root.aplicar(self.ctx, self.a)
        falhar(self.r, "certbot", "Certbot failed to authenticate some domains (authenticator: webroot). Detail: DNS problem: NXDOMAIN")
        with self.assertRaises(root.Recusa) as e:
            root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        self.assertEqual(e.exception.codigo, "certbot_falhou")
        self.assertIn("NXDOMAIN", str(e.exception))

    def test_remover_vhost_e_certificado(self):
        root.aplicar(self.ctx, self.a)
        root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        self.assertEqual(root.remover_vhost(self.ctx, {"slug": "loja-e2e"}), {"removido": True})
        self.assertFalse(os.path.lexists(self.conf) or os.path.lexists(self.link))
        self.assertEqual(root.remover_certificado(self.ctx, {"slug": "loja-e2e"}), {"removido": True})
        self.assertIn(["delete", "--cert-name", "dash-loja-e2e", "--non-interactive"], self.chamados("certbot"))
        self.assertEqual(root.remover_vhost(self.ctx, {"slug": "loja-e2e"}), {"removido": False})
        self.assertEqual(root.remover_certificado(self.ctx, {"slug": "loja-e2e"}), {"removido": False})

    def test_estado(self):
        root.aplicar(self.ctx, self.a)
        root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        e = root.estado(self.ctx, {})
        self.assertEqual(e["nginx"], {"versao": "1.24.0", "configOk": True, "ativo": True})
        self.assertEqual(e["certbot"], "2.9.0")
        self.assertEqual([c["slug"] for c in e["certificados"]], ["loja-e2e"])
        falhar(self.r, "nginx-inativo")
        self.assertFalse(root.estado(self.ctx, {})["nginx"]["ativo"])

    def test_http2_on_no_nginx_novo(self):
        apoio.escrever(os.path.join(self.r, "nginx-versao"), "1.26.0")
        root.aplicar(self.ctx, self.a)
        root.emitir(self.ctx, {"slug": "loja-e2e", "dominios": self.a["dominios"], "email": None})
        with open(self.conf, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("  http2 on;\n", texto)
        self.assertNotIn("ssl http2", texto)

    def test_pos_renovacao(self):
        os.environ["RENEWED_LINEAGE"] = "/etc/letsencrypt/live/outro-site"
        self.addCleanup(os.environ.pop, "RENEWED_LINEAGE", None)
        self.assertEqual(root.pos_renovacao(self.ctx), 0)
        self.assertEqual(self.chamados(), [])
        os.environ["RENEWED_LINEAGE"] = "/etc/letsencrypt/live/dash-loja-e2e"
        self.assertEqual(root.pos_renovacao(self.ctx), 0)
        self.assertEqual(self.chamados(), [["-t"], ["reload", "nginx"]])
        falhar(self.r, "nginx-t")
        self.assertEqual(root.pos_renovacao(self.ctx), 1)
        self.assertEqual(self.chamados()[-1], ["-t"])  # sem reload com o nginx quebrado

    def test_data_do_openssl(self):
        self.assertEqual(root.data_do_openssl("notAfter=Dec 22 12:00:00 2026 GMT\n"), "2026-12-22T12:00:00.000Z")
        self.assertEqual(root.data_do_openssl("notAfter=Jan  5 01:02:03 2027 GMT"), "2027-01-05T01:02:03.000Z")
        with self.assertRaises(root.Recusa):
            root.data_do_openssl("lixo")


class Atender(apoio.TesteComRaiz):
    """atender() com socketpair: SO_PEERCRED do próprio processo, sem subir servidor."""

    def setUp(self):
        super().setUp()
        self.ctx = apoio.contexto_root(self.r)

    def conversar(self, dados):
        a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        with a, b:
            a.sendall(dados)
            a.shutdown(socket.SHUT_WR)
            root.atender(self.ctx, b)
            b.close()
            return json.loads(a.recv(1 << 20) or b"null")

    def test_versao(self):
        ident = str(uuid.uuid4())
        self.assertEqual(self.conversar(pedido("versao", {}, ident)), {"id": ident, "ok": True, "dados": {"versao": root.VERSAO}})

    def test_recusas(self):
        casos = [
            (pedido("apagar_tudo", {}), "operacao_desconhecida"),
            (pedido("versao", {"extra": 1}), "args_invalidos"),
            (pedido("versao", {}, ident="nao-e-uuid"), "pedido_invalido"),
            ((json.dumps({"id": str(uuid.uuid4()), "op": "versao", "args": {}, "x": 1}) + "\n").encode(), "pedido_invalido"),
            (b'{"id":"%s","op":"versao","op":"estado","args":{}}\n' % str(uuid.uuid4()).encode(), "pedido_invalido"),
            (b"nao e json\n", "pedido_invalido"),
            (pedido("nginx.aplicar", args_vhost(CASOS_GOLDEN["http"], slug="../../etc")), "args_invalidos"),
            (pedido("ssl.emitir", {"slug": "a", "dominios": ["a.com.br"], "email": "-x@a.com.br"}), "args_invalidos"),
        ]
        for dados, codigo in casos:
            with self.subTest(codigo):
                r = self.conversar(dados)
                self.assertFalse(r["ok"])
                self.assertEqual(r["erro"], codigo)

    def test_pedido_acima_de_16kb(self):
        grande = pedido("nginx.remover", {"slug": "a" * 20000})
        r = self.conversar(grande)
        self.assertEqual((r["ok"], r["erro"]), (False, "pedido_grande"))

    def test_somente_leitura_recusa_mutantes(self):
        apoio.escrever(os.path.join(self.r, "etc/dash-agent/travas.json"), '{"pausado":false,"somenteLeitura":true}')
        for op, args in (("nginx.aplicar", args_vhost(CASOS_GOLDEN["http"])), ("nginx.remover", {"slug": "a"}),
                         ("ssl.emitir", {"slug": "a", "dominios": ["a.com.br"], "email": None}), ("ssl.remover", {"slug": "a"})):
            with self.subTest(op):
                r = self.conversar(pedido(op, args))
                self.assertEqual(r["erro"], "somente_leitura")
        self.assertTrue(self.conversar(pedido("estado", {}))["ok"])
        self.assertEqual(apoio.executados(self.r)[-1]["programa"] in ("nginx", "systemctl", "certbot"), True)
        self.assertFalse(os.listdir(os.path.join(self.r, "etc/nginx/sites-available")))

    def test_uid_diferente_nao_recebe_nada(self):
        ctx = apoio.contexto_root(self.r)
        ctx.uid_agente = os.getuid() + 12345
        a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        with a, b:
            a.sendall(pedido("versao", {}))
            root.atender(ctx, b)
            b.close()
            try:  # fechar com o pedido ainda não lido vira RST: EOF ou reset contam como silêncio
                resposta = a.recv(100)
            except ConnectionResetError:
                resposta = b""
            self.assertEqual(resposta, b"")


class SocketReal(apoio.TesteComRaiz):
    def setUp(self):
        super().setUp()
        self.h = apoio.HelperRoot(self.r)
        self.addCleanup(self.h.parar)

    def test_modos_do_socket_e_versao(self):
        st = os.stat(self.h.sock)
        self.assertEqual(st.st_mode & 0o777, 0o660)
        self.assertEqual(os.stat(os.path.dirname(self.h.sock)).st_mode & 0o777, 0o750)
        r = json.loads(apoio.pedir_socket(self.h.sock, pedido("versao", {})))
        self.assertTrue(r["ok"])

    def test_um_pedido_grande_nao_derruba_o_servidor(self):
        r = json.loads(apoio.pedir_socket(self.h.sock, pedido("nginx.remover", {"slug": "a" * 20000})))
        self.assertEqual(r["erro"], "pedido_grande")
        self.assertTrue(json.loads(apoio.pedir_socket(self.h.sock, pedido("versao", {})))["ok"])

    @unittest.skipUnless(os.geteuid() == 0, "precisa de root para trocar de uid no processo filho")
    def test_outro_uid_recebe_silencio(self):
        # Abre o caminho até o socket para o uid 65534 conseguir conectar: quem barra é o SO_PEERCRED.
        caminho = self.h.sock
        for p in (self.r, os.path.join(self.r, "run"), os.path.dirname(caminho)):
            os.chmod(p, 0o755)
        os.chmod(caminho, 0o666)
        leitura, escrita = os.pipe()
        pid = os.fork()
        if pid == 0:  # filho
            os.close(leitura)
            try:
                os.setgid(65534)
                os.setuid(65534)
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.settimeout(5)
                s.connect(caminho)
                try:  # o ajudante desliga sem ler: EOF, reset ou pipe quebrado são todos "silêncio"
                    s.sendall(pedido("versao", {}))
                    resposta = s.recv(100)
                except (BrokenPipeError, ConnectionResetError):
                    resposta = b""
                os.write(escrita, b"vazio" if resposta == b"" else b"respondeu:" + resposta)
            except Exception as e:  # noqa: BLE001
                os.write(escrita, ("erro:" + repr(e)).encode())
            finally:
                os._exit(0)
        os.close(escrita)
        os.waitpid(pid, 0)
        with os.fdopen(leitura, "rb") as f:
            self.assertEqual(f.read(), b"vazio")
        self.assertTrue(json.loads(apoio.pedir_socket(caminho, pedido("versao", {})))["ok"])


if __name__ == "__main__":
    unittest.main()
