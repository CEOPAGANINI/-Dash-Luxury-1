"""Testes de instalar.sh e desinstalar.sh no modo simulado (DASH_SIMULAR=1 + DASH_RAIZ).

Tudo o que é arquivo roda de verdade sob a raiz falsa; apt, useradd, systemctl, ufw e nginx só
ficam registrados (ou rodam os falsos com DASH_FALSOS). Os testes de recusa (sem modo simulado)
rodam com os falsos na frente do PATH: mesmo que o script passasse do ponto, nada real rodaria.
"""
import hashlib
import json
import os
import pwd
import re
import shutil
import stat
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apoio  # noqa: E402

INSTALADOR = os.path.join(apoio.PUBLICO, "instalar.sh")
DESINSTALADOR = os.path.join(apoio.PUBLICO, "desinstalar.sh")
UBUNTU_24 = 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n'
AVISO_GERADO = "# dash-agent v1: gerado automaticamente. Não edite: será sobrescrito."


def rodar(script, args, env=None, entrada="", timeout=120, falsos_no_path=False):
    # Nos testes de recusa os falsos vão na frente do PATH: rede de segurança caso o script
    # passasse do ponto. No modo simulado não: as conferências do servidor usam as ferramentas reais.
    caminho = (apoio.FALSOS + ":" if falsos_no_path else "") + "/usr/sbin:/usr/bin:/sbin:/bin"
    base = {"PATH": caminho, "LC_ALL": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
    base.update(env or {})
    return subprocess.run(["bash", script, *args], input=entrada, capture_output=True, text=True, env=base, timeout=timeout)


class Sintaxe(unittest.TestCase):
    def test_bash_n(self):
        for s in (INSTALADOR, DESINSTALADOR):
            r = subprocess.run(["bash", "-n", s], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_main_na_ultima_linha(self):
        for s in (INSTALADOR, DESINSTALADOR):
            with open(s, encoding="utf-8") as f:
                linhas = [linha for linha in f.read().splitlines() if linha.strip()]
            self.assertEqual(linhas[-1], 'main "$@"', s)
            # nada executável fora de funções: só comentários, set, atribuições e definições
            fora = []
            profundidade = 0
            for linha in linhas[:-1]:
                if profundidade == 0 and not re.match(r'^(#|set -euo pipefail$|[A-Z_]+="[^"]*"$|[a-z_]+\(\) \{|\}$)', linha):
                    fora.append(linha)
                profundidade += linha.count("{") - linha.count("}") if re.match(r"^[a-z_]+\(\) \{", linha) or profundidade else 0
            self.assertEqual(fora, [], s)

    def test_selo_em_dia(self):
        with open(INSTALADOR, encoding="utf-8") as f:
            texto = f.read()
        for var, arquivo in (("SHA_AGENTE", "dash_agent.py"), ("SHA_ROOT", "dash_agent_root.py"), ("SHA_DESINSTALAR", "desinstalar.sh")):
            with open(os.path.join(apoio.PUBLICO, arquivo), "rb") as f:
                real = hashlib.sha256(f.read()).hexdigest()
            self.assertIn(f'{var}="{real}"', texto, f"{arquivo} mudou: rode npm run vps:selar")

    def test_agente_versao_ts_em_dia(self):
        caminho = os.path.join(apoio.REPO, "src/features/vps/agente-versao.ts")
        if not os.path.exists(caminho):
            self.skipTest("src/features/vps/agente-versao.ts ainda não existe (gerado por npm run vps:selar)")
        with open(caminho, encoding="utf-8") as f:
            ts = f.read()
        if re.search(r'INSTALADOR_SHA256 =\s*"0{64}"', ts):
            self.skipTest("agente-versao.ts ainda com os zeros do molde: falta rodar npm run vps:selar na integração")
        for const, arquivo in (("INSTALADOR_SHA256", "instalar.sh"), ("AGENTE_SHA256", "dash_agent.py"), ("AGENTE_ROOT_SHA256", "dash_agent_root.py")):
            with open(os.path.join(apoio.PUBLICO, arquivo), "rb") as f:
                real = hashlib.sha256(f.read()).hexdigest()
            self.assertRegex(ts, rf'{const} =\s*"{real}"', f"{arquivo}: rode npm run vps:selar")


class Recusas(unittest.TestCase):
    """Sem modo simulado nada pode acontecer além da mensagem de erro."""

    def setUp(self):
        self.r = apoio.nova_raiz("dash-inst-")
        self.addCleanup(apoio.apagar_raiz, self.r)

    def test_http_sem_simular(self):
        r = rodar(INSTALADOR, ["--painel", "http://127.0.0.1:9"], env={"RAIZ": self.r}, entrada="a" * 43 + "\n", falsos_no_path=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("Endereço do painel inválido", r.stderr)
        self.assertEqual(apoio.executados(self.r), [])

    def test_raiz_sem_simular(self):
        r = rodar(INSTALADOR, ["--painel", "https://painel.com.br"], env={"DASH_RAIZ": self.r, "RAIZ": self.r}, entrada="a" * 43 + "\n", falsos_no_path=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("DASH_RAIZ", r.stderr)
        self.assertEqual(apoio.executados(self.r), [])
        r = rodar(INSTALADOR, ["--painel", "https://painel.com.br", "--raiz", self.r], env={"RAIZ": self.r}, entrada="a" * 43 + "\n", falsos_no_path=True)
        self.assertEqual(r.returncode, 1)

    def test_usuario_sem_simular(self):
        r = rodar(INSTALADOR, ["--painel", "https://painel.com.br"], env={"DASH_USUARIO_AGENTE": "nobody", "RAIZ": self.r}, entrada="a" * 43 + "\n", falsos_no_path=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("DASH_USUARIO_AGENTE", r.stderr)
        self.assertEqual(apoio.executados(self.r), [])

    def test_opcao_desconhecida_e_valor_faltando(self):
        self.assertEqual(rodar(INSTALADOR, ["--sudo-tudo"], falsos_no_path=True).returncode, 1)
        self.assertEqual(rodar(INSTALADOR, ["--painel"], falsos_no_path=True).returncode, 1)

    def test_desinstalar_raiz_sem_simular(self):
        r = rodar(DESINSTALADOR, ["--raiz", self.r], env={"RAIZ": self.r}, falsos_no_path=True)
        self.assertEqual(r.returncode, 1)
        self.assertTrue(os.path.isdir(os.path.join(self.r, "var/lib/dash-agent")))


class Simulado(unittest.TestCase):
    def setUp(self):
        self.r = apoio.nova_raiz("dash-inst-")
        self.addCleanup(apoio.apagar_raiz, self.r)
        # raiz "de fábrica": só o os-release e o que o apt do nginx criaria
        for p in os.listdir(self.r):
            apoio.apagar_raiz(os.path.join(self.r, p))
        apoio.escrever(os.path.join(self.r, "etc/os-release"), UBUNTU_24)
        for p in ("etc/nginx/sites-available", "etc/nginx/sites-enabled", "etc/nginx/conf.d", "etc/nginx/snippets"):
            os.makedirs(os.path.join(self.r, p))
        apoio.escrever(os.path.join(self.r, "etc/nginx/nginx.conf"), apoio.NGINX_CONF)
        self.painel = apoio.PainelFalso().__enter__()
        self.addCleanup(self.painel.__exit__, None, None, None)

    def instalar(self, codigo=None, extra_env=None, args=()):
        codigo = codigo or self.painel.codigo()
        env = {"DASH_SIMULAR": "1", "DASH_RAIZ": self.r}
        env.update(extra_env or {})
        r = rodar(INSTALADOR, ["--painel", self.painel.url, "--local", apoio.PUBLICO, *args], env=env, entrada=codigo + "\n")
        return r, codigo

    def log(self):
        with open(os.path.join(self.r, "executados.log"), encoding="utf-8") as f:
            return f.read().splitlines()

    def modo(self, rel):
        return stat.S_IMODE(os.lstat(os.path.join(self.r, rel)).st_mode)

    def test_instalacao_completa(self):
        r, codigo = self.instalar()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("confirme que este é o seu servidor", r.stdout)
        # o código foi pelo stdin até o painel, e não ficou em log nenhum
        self.assertEqual(self.painel.registros[-1]["codigo"], codigo)
        self.assertNotIn(codigo, "\n".join(self.log()))
        # árvore, donos e modos (§7.1)
        eu = pwd.getpwuid(os.getuid()).pw_name
        esperados = {
            "opt/dash-agent": 0o755, "opt/dash-agent/dash_agent.py": 0o644, "opt/dash-agent/dash_agent_root.py": 0o644,
            "opt/dash-agent/desinstalar.sh": 0o644, "usr/local/sbin/dash-agent": 0o755,
            "var/lib/dash-agent": 0o700, "var/lib/dash-agent/agente.json": 0o600, "var/www/dash-funil": 0o755,
            "etc/dash-agent/travas.json": 0o644, "var/lib/dash-agent-root": 0o755, "var/lib/dash-agent-root/acme": 0o755,
            "var/lib/dash-agent-root/estado": 0o700, "etc/letsencrypt": 0o755, "var/lib/letsencrypt": 0o755,
            "var/log/letsencrypt": 0o700, "etc/letsencrypt/renewal-hooks/deploy/dash-agent": 0o755,
            "etc/systemd/system/dash-agent.service": 0o644, "etc/systemd/system/dash-agent-root.service": 0o644,
            "etc/systemd/system/dash-agent-root.service.d/10-protecao.conf": 0o644,
            "etc/nginx/snippets/dash-agent-cabecalhos.conf": 0o644, "etc/nginx/snippets/dash-agent-tls.conf": 0o644,
            "etc/nginx/conf.d/dash-agent.conf": 0o644, "etc/nginx/sites-available/dash--padrao.conf": 0o644,
        }
        for rel, m in esperados.items():
            self.assertEqual(self.modo(rel), m, rel)
        for rel in ("var/lib/dash-agent", "var/www/dash-funil", "var/lib/dash-agent/agente.json"):
            self.assertEqual(pwd.getpwuid(os.lstat(os.path.join(self.r, rel)).st_uid).pw_name, eu, rel)
        for rel, nome in (("opt/dash-agent/dash_agent.py", "dash_agent.py"), ("opt/dash-agent/dash_agent_root.py", "dash_agent_root.py")):
            with open(os.path.join(self.r, rel), "rb") as a, open(os.path.join(apoio.PUBLICO, nome), "rb") as b:
                self.assertEqual(a.read(), b.read())
        self.assertEqual(apoio.ler_json(os.path.join(self.r, "etc/dash-agent/travas.json")), {"pausado": False, "somenteLeitura": False})
        self.assertEqual(os.readlink(os.path.join(self.r, "etc/nginx/sites-enabled/dash--padrao.conf")), "../sites-available/dash--padrao.conf")
        with open(os.path.join(self.r, "etc/nginx/sites-available/dash--padrao.conf"), encoding="utf-8") as f:
            padrao = f.read()
        self.assertIn("return 444;", padrao)
        self.assertIn("ssl_reject_handshake on;", padrao)
        with open(os.path.join(self.r, "etc/nginx/snippets/dash-agent-cabecalhos.conf"), encoding="utf-8") as f:
            self.assertEqual(f.read().count("always;"), 3)
        with open(os.path.join(self.r, "etc/letsencrypt/renewal-hooks/deploy/dash-agent"), encoding="utf-8") as f:
            self.assertIn("dash_agent_root.py pos-renovacao", f.read())
        with open(os.path.join(self.r, "usr/local/sbin/dash-agent"), encoding="utf-8") as f:
            self.assertIn('exec /usr/bin/python3 -I /opt/dash-agent/dash_agent.py "$@"', f.read())
        # o que só fica registrado
        log = self.log()
        for linha in (
            "apt-get update -q",
            "env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends nginx certbot python3 openssl ssl-cert",
            "useradd --system --user-group --no-create-home --home-dir /var/lib/dash-agent --shell /usr/sbin/nologin dashagent",
            "ufw allow 80/tcp", "ufw allow 443/tcp", "nginx -t", "systemctl daemon-reload",
            "systemctl enable dash-agent-root.service", "systemctl restart dash-agent-root.service",
            "systemctl enable dash-agent.service", "systemctl restart dash-agent.service",
        ):
            self.assertIn(linha, log)
        self.assertLess(log.index("systemctl restart dash-agent-root.service"), log.index("systemctl restart dash-agent.service"))
        self.assertFalse(any("22" in linha for linha in log if linha.startswith("ufw")))
        for conferencia in ("root", "systemd", "apache", "espaco", "ntp"):
            self.assertTrue(any(re.match(rf"^(CONFERIDO|AVISO): {conferencia}\b", linha) for linha in log), conferencia)
        self.assertTrue(any(linha.startswith(("CONFERIDO: portas", "AVISO: portas")) for linha in log))

    def test_cadeia_ate_o_acme_e_readwritepaths(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        caminho = ""
        for parte in ("var", "lib", "dash-agent-root", "acme"):
            caminho = os.path.join(caminho, parte)
            self.assertTrue(self.modo(caminho) & 0o001, "o www-data precisa atravessar " + caminho)
        unidades = {}
        for rel in ("etc/systemd/system/dash-agent.service", "etc/systemd/system/dash-agent-root.service.d/10-protecao.conf"):
            with open(os.path.join(self.r, rel), encoding="utf-8") as f:
                unidades[rel] = [linha for linha in f.read().splitlines() if linha.startswith("ReadWritePaths=")]
        todos = [c for linhas in unidades.values() for linha in linhas for c in linha.split("=", 1)[1].split()]
        self.assertTrue(todos)
        for c in todos:
            if c.startswith("-"):
                self.assertTrue(os.path.isdir(os.path.join(self.r, c[1:].lstrip("/"))) or c in ("-/var/log/nginx", "-/var/lib/nginx"), c)
            else:
                self.assertTrue(os.path.isdir(os.path.join(self.r, c.lstrip("/"))), "sem '-' e não existe: " + c)
        for c in ("-/etc/letsencrypt", "-/var/lib/letsencrypt", "-/var/log/letsencrypt"):
            self.assertIn(c, todos)
        with open(os.path.join(self.r, "etc/systemd/system/dash-agent.service"), encoding="utf-8") as f:
            unit = f.read()
        for linha in ("User=dashagent", "NoNewPrivileges=yes", "ProtectSystem=strict", "RestartPreventExitStatus=3", "CapabilityBoundingSet=",
                      "ExecStart=/usr/bin/python3 -I /opt/dash-agent/dash_agent.py rodar"):
            self.assertIn(linha + "\n", unit)

    def test_com_os_falsos(self):
        r, _ = self.instalar(extra_env={"DASH_FALSOS": apoio.FALSOS})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        programas = [e["programa"] for e in apoio.executados(self.r)]
        for p in ("apt-get", "useradd", "systemctl", "ufw", "nginx"):
            self.assertIn(p, programas)
        self.assertIn(["allow", "80/tcp"], [e["argv"] for e in apoio.executados(self.r) if e["programa"] == "ufw"])

    def test_nginx_recusa_a_base_e_nada_fica_ligado(self):
        apoio.escrever(os.path.join(self.r, "falhas/nginx-t"), "configuração quebrada")
        r, _ = self.instalar(extra_env={"DASH_FALSOS": apoio.FALSOS})
        self.assertEqual(r.returncode, 1)
        self.assertIn("O nginx recusou a configuração base", r.stderr)
        self.assertFalse(os.path.lexists(os.path.join(self.r, "etc/nginx/sites-enabled/dash--padrao.conf")))
        self.assertFalse(os.path.exists(os.path.join(self.r, "etc/nginx/conf.d/dash-agent.conf")))
        self.assertEqual(self.painel.registros, [])

    def test_outro_default_server_e_diretivas_existentes(self):
        apoio.escrever(os.path.join(self.r, "etc/nginx/sites-enabled/meu-padrao"), "server { listen 80 default_server; return 404; }\n")
        apoio.escrever(os.path.join(self.r, "etc/nginx/conf.d/meu.conf"), "server_tokens off;\n")
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(os.path.lexists(os.path.join(self.r, "etc/nginx/sites-enabled/dash--padrao.conf")))
        with open(os.path.join(self.r, "etc/nginx/conf.d/dash-agent.conf"), encoding="utf-8") as f:
            conf = f.read()
        self.assertNotIn("server_tokens", conf)
        self.assertIn("server_names_hash_bucket_size 128;", conf)

    def test_default_de_fabrica_so_sai_intocado(self):
        texto = "server { listen 80 default_server; root /var/www/html; }\n"
        apoio.escrever(os.path.join(self.r, "etc/nginx/sites-available/default"), texto)
        # link relativo: um absoluto apontaria para fora da raiz falsa (no servidor de verdade tanto faz)
        os.symlink("../sites-available/default", os.path.join(self.r, "etc/nginx/sites-enabled/default"))
        md5 = hashlib.md5(texto.encode()).hexdigest()
        r, _ = self.instalar(extra_env={"DASH_MD5_DEFAULT": "0" * 32})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.lexists(os.path.join(self.r, "etc/nginx/sites-enabled/default")))  # mexido: fica
        r, _ = self.instalar(extra_env={"DASH_MD5_DEFAULT": md5})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(os.path.lexists(os.path.join(self.r, "etc/nginx/sites-enabled/default")))
        self.assertTrue(os.path.lexists(os.path.join(self.r, "etc/nginx/sites-enabled/dash--padrao.conf")))

    def test_aapanel_cpanel_plesk_e_so_abortam(self):
        for rel, trecho in (("www/server/panel", "aaPanel"), ("usr/local/cpanel", "cPanel"), ("usr/local/psa", "Plesk")):
            with self.subTest(trecho):
                os.makedirs(os.path.join(self.r, rel))
                r, _ = self.instalar()
                self.assertEqual(r.returncode, 1)
                self.assertIn(trecho, r.stderr)
                self.assertIn("VPS limpa", r.stderr)
                self.assertEqual(self.painel.registros, [])
                apoio.apagar_raiz(os.path.join(self.r, rel))
        apoio.escrever(os.path.join(self.r, "etc/os-release"), 'ID=centos\nVERSION_ID="7"\n')
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 1)
        self.assertIn("Sistema não suportado", r.stderr)
        self.assertEqual(self.painel.registros, [])

    def test_codigo_invalido_ou_usado(self):
        r, _ = self.instalar(codigo="curto")
        self.assertEqual(r.returncode, 1)
        self.assertIn("Código de instalação inválido", r.stderr)
        r, _ = self.instalar(codigo="x" * 43)  # formato certo, mas o painel não conhece
        self.assertEqual(r.returncode, 1)
        self.assertIn("O registro no painel não foi concluído", r.stderr)
        self.assertNotIn("systemctl restart dash-agent.service", self.log())

    def test_arquivo_adulterado_nao_instala(self):
        local = os.path.join(self.r, "local")
        os.makedirs(local)
        for n in ("dash_agent.py", "dash_agent_root.py", "desinstalar.sh"):
            with open(os.path.join(apoio.PUBLICO, n), "rb") as a, open(os.path.join(local, n), "wb") as b:
                b.write(a.read())
        with open(os.path.join(local, "dash_agent.py"), "a", encoding="utf-8") as f:
            f.write("\n# uma linha a mais\n")
        r = rodar(INSTALADOR, ["--painel", self.painel.url, "--local", local], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r},
                  entrada=self.painel.codigo() + "\n")
        self.assertEqual(r.returncode, 1)
        self.assertIn("não confere com o selo", r.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.r, "opt/dash-agent/dash_agent.py")))

    def test_modo_teste_por_opcoes(self):
        codigo = self.painel.codigo()
        r = rodar(INSTALADOR, ["--modo-teste", "--raiz", self.r, "--painel", self.painel.url, "--local", apoio.PUBLICO], entrada=codigo + "\n")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.painel.registros[-1]["codigo"], codigo)

    def test_reinstalar_preserva_travas(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        apoio.escrever(os.path.join(self.r, "etc/dash-agent/travas.json"), '{"pausado":true,"somenteLeitura":false}')
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(apoio.ler_json(os.path.join(self.r, "etc/dash-agent/travas.json")), {"pausado": True, "somenteLeitura": False})
        self.assertEqual(len(self.painel.registros), 2)

    @unittest.skipUnless(os.geteuid() == 0, "precisa de root para chown e runuser")
    def test_usuario_do_agente_de_verdade(self):
        # nobody faz o papel do dashagent: chown real e registrar via runuser, sem criar usuário no sistema
        r, _ = self.instalar(extra_env={"DASH_USUARIO_AGENTE": "nobody"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for rel in ("var/lib/dash-agent", "var/www/dash-funil", "var/lib/dash-agent/agente.json", "var/lib/dash-agent/estado.json"):
            self.assertEqual(pwd.getpwuid(os.lstat(os.path.join(self.r, rel)).st_uid).pw_name, "nobody", rel)
        self.assertEqual(os.lstat(os.path.join(self.r, "var/lib/dash-agent-root/acme")).st_uid, 0)
        with open(os.path.join(self.r, "etc/systemd/system/dash-agent.service"), encoding="utf-8") as f:
            self.assertIn("User=nobody\n", f.read())
        # o agente (nobody) não consegue escrever no webroot do root
        t = subprocess.run(["runuser", "-u", "nobody", "--", "touch", os.path.join(self.r, "var/lib/dash-agent-root/acme/x")], capture_output=True)
        self.assertNotEqual(t.returncode, 0)

    def test_desinstalar_mantem_ou_remove_os_sites(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        site = os.path.join(self.r, "var/www/dash-funil/loja-com-br/vazio")
        os.makedirs(site)
        apoio.escrever(os.path.join(self.r, "etc/nginx/sites-available/dash-loja-com-br.conf"), AVISO_GERADO + "\nserver { listen 80; }\n")
        os.symlink("../sites-available/dash-loja-com-br.conf", os.path.join(self.r, "etc/nginx/sites-enabled/dash-loja-com-br.conf"))
        d = rodar(DESINSTALADOR, [], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r})
        self.assertEqual(d.returncode, 0, d.stderr)
        for rel in ("opt/dash-agent", "var/lib/dash-agent", "var/lib/dash-agent-root", "etc/dash-agent", "usr/local/sbin/dash-agent",
                    "etc/systemd/system/dash-agent.service", "etc/systemd/system/dash-agent-root.service.d",
                    "etc/letsencrypt/renewal-hooks/deploy/dash-agent"):
            self.assertFalse(os.path.lexists(os.path.join(self.r, rel)), rel)
        self.assertTrue(os.path.isdir(site))
        self.assertTrue(os.path.lexists(os.path.join(self.r, "etc/nginx/sites-enabled/dash-loja-com-br.conf")))
        self.assertIn("nginx -t", self.log())
        self.assertIn("userdel dashagent", self.log())
        d = rodar(DESINSTALADOR, ["--remover-sites"], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r})
        self.assertEqual(d.returncode, 0, d.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.r, "var/www/dash-funil")))
        self.assertEqual([n for n in os.listdir(os.path.join(self.r, "etc/nginx/sites-enabled")) if n.startswith("dash-")], [])
        self.assertTrue(os.path.isfile(os.path.join(self.r, "etc/nginx/nginx.conf")))

    # --- servidor padrão fora do espaço dash-<slug>.conf -------------------------------------------

    def test_padrao_com_nome_que_nenhum_slug_forma(self):
        # O ajudante root escreve dash-<slug>.conf; o slug começa por [a-z0-9], então "dash--padrao"
        # nunca é o arquivo de um site. O nome antigo (dash-000-padrao.conf) era o do slug "000-padrao".
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        root = apoio.root
        for nome in os.listdir(os.path.join(self.r, "etc/nginx/sites-available")):
            if "padrao" in nome:
                self.assertEqual(nome, "dash--padrao.conf")
                self.assertFalse(root.slug_ok(nome[len("dash-"):-len(".conf")]))
        self.assertFalse(root.slug_ok("000-padrao"))

    def _padrao_antigo(self, conteudo=None):
        """Deixa a raiz como uma instalação antiga: o catch-all ligado com o nome dash-000-padrao.conf."""
        n = os.path.join(self.r, "etc/nginx")
        with open(os.path.join(n, "sites-available/dash--padrao.conf"), encoding="utf-8") as f:
            original = f.read()
        os.unlink(os.path.join(n, "sites-enabled/dash--padrao.conf"))
        os.unlink(os.path.join(n, "sites-available/dash--padrao.conf"))
        apoio.escrever(os.path.join(n, "sites-available/dash-000-padrao.conf"), conteudo or original)
        os.symlink("../sites-available/dash-000-padrao.conf", os.path.join(n, "sites-enabled/dash-000-padrao.conf"))
        return original

    def test_reinstalar_migra_o_padrao_antigo(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        original = self._padrao_antigo()
        r, _ = self.instalar(extra_env={"DASH_FALSOS": apoio.FALSOS})  # nginx falso: um default_server duplicado quebraria o -t
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        n = os.path.join(self.r, "etc/nginx")
        self.assertFalse(os.path.lexists(os.path.join(n, "sites-enabled/dash-000-padrao.conf")))
        self.assertFalse(os.path.lexists(os.path.join(n, "sites-available/dash-000-padrao.conf")))
        self.assertEqual(os.readlink(os.path.join(n, "sites-enabled/dash--padrao.conf")), "../sites-available/dash--padrao.conf")
        with open(os.path.join(n, "sites-available/dash--padrao.conf"), encoding="utf-8") as f:
            self.assertEqual(f.read(), original)

    def test_reinstalar_nao_toma_o_arquivo_antigo_que_virou_site(self):
        # Se um site de slug "000-padrao" já sobrescreveu o arquivo antigo, ele é do site: fica onde
        # está, e o catch-all nasce de novo com o nome novo.
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        vhost = AVISO_GERADO + "\nserver {\n  listen 80;\n  server_name loja.com.br;\n  return 404;\n}\n"
        self._padrao_antigo(vhost)
        r, _ = self.instalar(extra_env={"DASH_FALSOS": apoio.FALSOS})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        n = os.path.join(self.r, "etc/nginx")
        with open(os.path.join(n, "sites-available/dash-000-padrao.conf"), encoding="utf-8") as f:
            self.assertEqual(f.read(), vhost)
        self.assertTrue(os.path.islink(os.path.join(n, "sites-enabled/dash-000-padrao.conf")))
        with open(os.path.join(n, "sites-available/dash--padrao.conf"), encoding="utf-8") as f:
            self.assertIn("listen 80 default_server;", f.read())

    # --- desinstalar: só o que o painel criou -----------------------------------------------------

    def _certificado(self, nome, renovacao):
        apoio.escrever(os.path.join(self.r, "etc/letsencrypt/live", nome, "fullchain.pem"), "x")
        apoio.escrever(os.path.join(self.r, "etc/letsencrypt/renewal", nome + ".conf"), renovacao)

    def test_remover_sites_so_apaga_o_que_o_painel_criou(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        n = os.path.join(self.r, "etc/nginx")
        vhosts = {
            "dash-loja.conf": AVISO_GERADO + "\nserver { listen 80; server_name loja.com.br; }\n",  # do painel
            "dash-luxury.com.br.conf": "server { listen 80; server_name dash-luxury.com.br; }\n",  # à mão, nome com ponto
            "dash-meu.conf": "# meu site\nserver { listen 80; server_name meu.com.br; }\n",  # à mão, nome de slug, sem cabeçalho
        }
        for nome, texto in vhosts.items():
            apoio.escrever(os.path.join(n, "sites-available", nome), texto)
            os.symlink("../sites-available/" + nome, os.path.join(n, "sites-enabled", nome))
        webroot_do_painel = "[renewalparams]\nauthenticator = webroot\nwebroot_path = /var/lib/dash-agent-root/acme,\n"
        self._certificado("dash-loja", webroot_do_painel)
        self._certificado("dash-luxury.com.br", "[renewalparams]\nauthenticator = nginx\ninstaller = nginx\n")
        self._certificado("dash-luxury", "[renewalparams]\nauthenticator = webroot\nwebroot_path = /var/www/html,\n")
        d = rodar(DESINSTALADOR, ["--remover-sites"], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r})
        self.assertEqual(d.returncode, 0, d.stderr)
        for nome in ("dash-loja.conf", "dash--padrao.conf"):
            self.assertFalse(os.path.lexists(os.path.join(n, "sites-available", nome)), nome)
            self.assertFalse(os.path.lexists(os.path.join(n, "sites-enabled", nome)), nome)
        for nome, texto in vhosts.items():
            if nome == "dash-loja.conf":
                continue
            with open(os.path.join(n, "sites-available", nome), encoding="utf-8") as f:
                self.assertEqual(f.read(), texto, nome)
            self.assertTrue(os.path.islink(os.path.join(n, "sites-enabled", nome)), nome)
        apagados = [linha for linha in self.log() if linha.startswith("certbot delete")]
        self.assertEqual(apagados, ["certbot delete --cert-name dash-loja --non-interactive"])
        for rel in ("snippets/dash-agent-cabecalhos.conf", "snippets/dash-agent-tls.conf", "conf.d/dash-agent.conf"):
            self.assertFalse(os.path.lexists(os.path.join(n, rel)), rel)

    def test_desinstalar_mantendo_os_sites_deixa_um_gancho_minimo(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        self._certificado("dash-loja", "[renewalparams]\nwebroot_path = /var/lib/dash-agent-root/acme,\n")
        d = rodar(DESINSTALADOR, [], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r})
        self.assertEqual(d.returncode, 0, d.stderr)
        gancho = os.path.join(self.r, "etc/letsencrypt/renewal-hooks/deploy/dash-agent")
        self.assertEqual(self.modo(gancho), 0o755)
        with open(gancho, encoding="utf-8") as f:
            texto = f.read()
        self.assertNotIn("/opt/dash-agent", texto)  # o agente acabou de sair
        self.assertIn("nginx -t -q && exec systemctl reload nginx.service", texto)
        self.assertEqual(subprocess.run(["sh", "-n", gancho]).returncode, 0)
        self.assertIn("recarrega o nginx a cada renovação", d.stdout)
        # certificado de outro site da máquina: o gancho sai sem tocar em nada
        s = subprocess.run(["sh", gancho], env={"RENEWED_LINEAGE": "/etc/letsencrypt/live/outro-site"}, capture_output=True)
        self.assertEqual(s.returncode, 0)
        # --remover-sites depois: sem certificado do painel, sem gancho
        d = rodar(DESINSTALADOR, ["--remover-sites"], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r})
        self.assertEqual(d.returncode, 0, d.stderr)
        self.assertFalse(os.path.lexists(gancho))

    # --- pasta dos sites: por descritor, e devolvida ao agente na reinstalação ---------------------

    def test_pasta_dos_sites_trocada_por_link_nao_passa(self):
        alvo = os.path.join(self.r, "alvo")
        os.makedirs(alvo)
        os.chmod(alvo, 0o700)
        os.makedirs(os.path.join(self.r, "var/www"))
        os.symlink(alvo, os.path.join(self.r, "var/www/dash-funil"))
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 1)
        self.assertIn("não é uma pasta de verdade", r.stderr)
        self.assertEqual(self.modo("alvo"), 0o700)  # o chmod não seguiu o link
        self.assertEqual(self.painel.registros, [])

    def test_unit_do_agente_fecha_o_kernel(self):
        r, _ = self.instalar()
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(os.path.join(self.r, "etc/systemd/system/dash-agent.service"), encoding="utf-8") as f:
            linhas = f.read().splitlines()
        for linha in ("RestrictNamespaces=yes", "ProtectKernelTunables=yes", "ProtectKernelModules=yes", "ProtectKernelLogs=yes",
                      "ProtectControlGroups=yes", "ProtectHostname=yes", "ProtectProc=invisible", "LockPersonality=yes",
                      "RestrictRealtime=yes", "SystemCallArchitectures=native"):
            self.assertIn(linha, linhas)
        # o OVERVIEW lê /proc/stat, /proc/meminfo e /proc/uptime: ProcSubset=pid os esconderia
        self.assertFalse(any(linha.startswith("ProcSubset=") for linha in linhas))
        if shutil.which("systemd-analyze"):
            self.assertIn("systemd-analyze verify: ok", self.log())

    @unittest.skipUnless(os.geteuid() == 0, "precisa de root para chown e runuser")
    def test_reinstalar_devolve_a_pasta_dos_sites_ao_agente(self):
        env = {"DASH_USUARIO_AGENTE": "nobody"}
        r, _ = self.instalar(extra_env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        nobody = pwd.getpwnam("nobody")
        www = os.path.join(self.r, "var/www/dash-funil")
        base = os.path.join(www, "loja")
        for p in (base, os.path.join(base, "releases"), os.path.join(base, "releases/v1"), os.path.join(base, "vazio"), os.path.join(www, ".lixeira")):
            os.makedirs(p, exist_ok=True)
        apoio.escrever(os.path.join(base, "releases/v1/index.html"), "a")
        os.symlink("vazio", os.path.join(base, "current"))
        # Um arquivo do sistema com um segundo nome dentro da árvore (link físico) e outro apontado por
        # um link simbólico: os dois continuam do root depois da reinstalação.
        sistema = os.path.join(self.r, "etc/passwd-falso")
        apoio.escrever(sistema, "root:x:0:0\n")
        os.link(sistema, os.path.join(base, "vazio/segundo-nome"))
        fora = os.path.join(self.r, "etc/shadow-falso")
        apoio.escrever(fora, "root:*:1:0\n", 0o600)
        os.symlink(fora, os.path.join(base, "vazio/link-para-fora"))
        for raiz, pastas, arquivos in os.walk(www):
            for nome in pastas + arquivos + [""]:
                os.lchown(os.path.join(raiz, nome), nobody.pw_uid, nobody.pw_gid)
        os.lchown(os.path.join(base, "vazio/segundo-nome"), 0, 0)
        os.lchown(os.path.join(base, "vazio/link-para-fora"), 0, 0)
        # desinstalar mantendo os sites: a árvore passa para root:root
        d = rodar(DESINSTALADOR, [], env={"DASH_SIMULAR": "1", "DASH_RAIZ": self.r})
        self.assertEqual(d.returncode, 0, d.stderr)
        self.assertEqual(os.lstat(os.path.join(base, "releases")).st_uid, 0)
        # reinstalar: o agente volta a ser dono do que era dele
        r, _ = self.instalar(extra_env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for rel in ("", "loja", "loja/releases", "loja/releases/v1", "loja/releases/v1/index.html", "loja/vazio", "loja/current", ".lixeira"):
            st = os.lstat(os.path.join(www, rel))
            self.assertEqual((st.st_uid, st.st_gid), (nobody.pw_uid, nobody.pw_gid), rel or "dash-funil")
        self.assertEqual(os.lstat(sistema).st_uid, 0)  # dois nomes: não muda de dono
        # O link em si volta para o agente (o disable_symlinks if_not_owner do vhost compara o dono do
        # link com o do alvo: current -> releases/<v> precisa dos dois iguais); o alvo, não.
        self.assertEqual(os.lstat(os.path.join(base, "vazio/link-para-fora")).st_uid, nobody.pw_uid)
        self.assertEqual((os.lstat(fora).st_uid, self.modo("etc/shadow-falso")), (0, 0o600))
        t = subprocess.run(["runuser", "-u", "nobody", "--", "mkdir", os.path.join(base, "releases/.tmp-teste")], capture_output=True)
        self.assertEqual(t.returncode, 0, t.stderr)


if __name__ == "__main__":
    unittest.main()
