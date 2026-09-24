# Servidor do Funil (VPS)

O menu **Servidor** hospeda as páginas do funil numa VPS Ubuntu do próprio dono, sem aaPanel: o painel na Vercel manda tarefas assinadas, e um agente na VPS baixa, confere e publica. Este documento é o que o dono (ou quem mantém o painel) precisa para ligar, testar e fazer o piloto.

## 1. Como funciona

```
Navegador do dono ──(sessão Supabase)──▶ Vercel: /servidor/*, server actions,
                                          GET /api/painel/vps/estado, POST /api/painel/vps/publicar
                                                │  Postgres: tabelas vps_* (só hashes, parâmetros e ZIP de vida curta)
                                                ▼
VPS: dash-agent (usuário dashagent) ──HTTPS + HMAC em todo pedido──▶ /api/agente/v1/{registrar, pulso,
        │                                                              tarefas/:id/resultado, artefatos/:id}
        │ socket /run/dash-agent-root/root.sock (0660 root:dashagent, SO_PEERCRED)
        ▼
     dash-agent-root (root) ─▶ nginx -t / reload, certbot, /etc/nginx/sites-*/dash-*.conf
     nginx serve /var/www/dash-funil/<slug>/current → releases/<uuid>; /checkout → 302 para o app
```

- **Quem manda é o agente**: ele busca as tarefas no painel. Não há SSH nem porta aberta para o painel na VPS; a única conexão do painel com ela é a conferência "No ar", que abre o site pelas portas 80/443 como um visitante.
- **O painel não guarda segredo reversível.** As chaves de cada servidor são derivadas de `VPS_CHAVE_MESTRA` + id do servidor + geração. O token do agente nasce na VPS; o banco guarda só o sha256 dele. Um dump do banco não abre nada.
- **Toda tarefa é assinada** (HMAC com seq e validade). O agente confere a assinatura antes de ler os parâmetros, grava a seq antes de executar e guarda um diário: a mesma tarefa entregue duas vezes executa uma vez só.
- **O root só faz 6 coisas**, pedidas por socket: aplicar e remover vhost, emitir e remover certificado, estado e versão. Nada de shell, argv sempre em lista, sem hooks no certbot.
- **Não há cron na Vercel.** O agente pulsa a cada 30 s (5 s logo depois de uma ação ou com a tela aberta), e as transições (tarefa vencida, sem resposta) acontecem na leitura.

## 2. Variáveis de ambiente (Vercel)

| Variável                  | Obrigatória | Regra                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | sim         | Já existe (pooler 6543).                                                                                                                                                                                                                                                        |
| `VPS_DONOS`               | sim         | Lista separada por vírgula. Item com `@` casa com o e-mail da sessão e **só vale com o e-mail confirmado**. Item sem `@` casa com o id da conta. Vazia: **ninguém** opera.                                                                                                      |
| `VPS_CHAVE_MESTRA`        | sim         | 32 caracteres ou mais: `openssl rand -base64 48`. Trocar depois derruba todos os agentes (401) e cada VPS precisa de `sudo dash-agent reconectar`.                                                                                                                              |
| `NEXT_PUBLIC_APP_URL`     | recomendada | Tem de ser o `https://` de produção. Fora de https (ou em preview), criar servidor fica bloqueado: o agente exige https e a proteção de preview da Vercel responde 401. **É NEXT_PUBLIC: entra no build, e trocar exige redeploy** (vale também para `NEXT_PUBLIC_SUPABASE_*`). |
| `VPS_CHECKOUT_ORIGENS`    | não         | Origens https extras que podem receber o `/checkout` dos sites (ex.: `https://checkout.loja.com`). Cada item passa pela regra de origem; os hosts dessas origens não podem virar site.                                                                                          |
| `VPS_LOGIN_RECENTE_HORAS` | não         | Padrão 12 (aceita fração, até 720). Publicar, trocar domínio ou checkout e remover exigem login feito nesse intervalo, medido pelo `amr` da própria sessão.                                                                                                                     |

`ENCRYPTION_KEY` não é usada pela VPS. Os avisos por e-mail (`RESEND_*`) ficaram fora desta entrega.

## 3. Banco

Rode `src/database/migrations/0006_vps.sql` no SQL Editor do Supabase, depois da 0004 e da 0005 (ver [DEPLOY.md](DEPLOY.md), seção 3). É idempotente e liga o RLS nas 7 tabelas. Se não for rodada, o painel tenta criar as tabelas na primeira leitura (`ensureVpsSchema`, com `lock_timeout` de 3 s); se não conseguir, a tela pede a 0006. **Não** use `npm run db:generate`: o snapshot antigo recriaria as tabelas de anúncios.

**Se o banco recebeu o SQL da antiga VPS por SSH** (`docs/sql/vps-panel.sql`, que o `/servidor` do trabalho do ChatGPT mandava colar e que ficou arquivado no ramo `chatgpt-trabalho`):

- a `vps_operation_attempts` de lá não tem `workspace_id`. A 0006 (e o `ensureVpsSchema`) acrescenta a coluna, apaga as tentativas antigas sem workspace (a tabela é só o limitador de 10 ações por minuto) e tira o índice repetido `vps_operation_attempts_owner_at_idx`. Não é preciso fazer nada à mão;
- a `vps_connections` guardava host, usuário e credenciais SSH criptografadas com a `ENCRYPTION_KEY`, e o Servidor do Funil não usa essa tabela. Apague-a no SQL Editor do Supabase: `DROP TABLE IF EXISTS public.vps_connections;`.

## 4. Na Vercel

- **Firewall:** crie uma regra de rate limit em `/api/agente/*` (por IP; algo como 120 pedidos por minuto é folgado para um agente). O app já tem um freio em memória por instância, antes do banco: 30 por minuto por IP no registro e 120 nas rotas com HMAC (pulso, resultado e artefato), além do freio de 1 s do pulso. Mas é por instância; a regra da plataforma segura rajadas antes de chegar à função. Não dá para testar isso neste repositório.
- **Proxy:** `/api/agente/`, `/agente/` e `/legal/` são públicos. As rotas do agente não chamam o Supabase Auth (quem autentica é o HMAC dentro da rota).
- **Rastreio entre domínios:** o CORS de `/api/public/track` aceita os domínios de site com DNS conferido. A lista fica 60 s em cache por instância: um domínio que acabou de passar no DNS pode levar até 1 min para o rastreio começar a contar.

## 5. Na VPS

**Instalar.** Em **Servidor → Adicionar servidor**, o painel mostra um comando. Ele baixa `instalar.sh`, confere o sha256 e só então roda como root; o código de instalação (uso único, 30 min) entra pelo **stdin**, nunca pelo argv. O sha256 garante que o arquivo chegou inteiro; **não** protege contra um painel comprometido: quem controla o deploy controla o instalador.

O instalador aceita Ubuntu 22.04/24.04 e Debian 12/13 (Python 3.10 ou mais novo), recusa máquina com aaPanel, cPanel ou Plesk, instala nginx, certbot e python3, cria o usuário `dashagent`, as pastas e as duas units (`dash-agent`, sem namespace novo nem acesso a sysctl, módulos, log do kernel e processos de outros usuários, e `dash-agent-root`, com o isolamento do root no drop-in `10-protecao.conf`), e registra o agente. Depois o dono volta ao painel e confirma "É o meu servidor".

O servidor padrão do nginx (fecha a conexão para Host desconhecido e para o IP puro) fica em `sites-available/dash--padrao.conf`, um nome que nenhum site do painel forma. As instalações antigas usavam `dash-000-padrao.conf`, o mesmo arquivo de um site de slug `000-padrao`: reinstalar migra o arquivo, e esse slug fica reservado no painel, no agente e no ajudante root.

Cada pasta `/var/www/dash-funil/<slug>` guarda o site dono em `.dash-site.json` (fora de `current/`, o nginx não serve). A mesma VPS pode ter pastas de outro servidor do painel (um servidor removido continua servindo os sites): o agente recusa configurar, publicar ou voltar versão numa pasta de outro site (`slug_de_outro_site`), e o painel não dá a um site novo um slug que o agente relatou no disco.

**Comandos do dono** (na VPS, como root):

| Comando                                               | O que faz                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sudo dash-agent status`                              | Painel, servidor, geração da chave, travas, últimas seq, desvio do relógio e resultados esperando envio.                                                                                                                                                                                                                                                                                                          |
| `sudo dash-agent diagnostico`                         | Confere Python, pastas, socket do ajudante, registro, revogação, travas, as units (`dash-agent-root`, `dash-agent`, `nginx`) e se o painel responde por HTTPS.                                                                                                                                                                                                                                                    |
| `sudo dash-agent pausar` / `retomar`                  | Para de aceitar tarefas (o painel não desfaz).                                                                                                                                                                                                                                                                                                                                                                    |
| `sudo dash-agent somente-leitura` / `liberar-escrita` | Só aceita leitura de saúde.                                                                                                                                                                                                                                                                                                                                                                                       |
| `sudo dash-agent reconectar`                          | Registra de novo com um código novo do painel (código pelo stdin).                                                                                                                                                                                                                                                                                                                                                |
| `sudo dash-agent desinstalar [--remover-sites]`       | Remove o agente. Sem a opção, os sites continuam no ar (vhosts, certificados e arquivos ficam), só que sem ninguém para atualizá-los; um gancho mínimo do certbot continua recarregando o nginx quando um certificado renova. Com a opção, apaga só o que o painel criou (vhost com o cabeçalho do agente, certificado renovado pelo webroot do ajudante). Reinstalar depois devolve a pasta dos sites ao agente. |

Remover o servidor no painel gira a geração das chaves: no pulso seguinte o agente leva o 401 com a marca `WWW-Authenticate: Dash-HMAC` e sai com código 3 (o systemd não reinicia). Um 401 sem essa marca (proteção da Vercel, firewall) não derruba o agente.

## 6. Decisões que vieram dos testes

- **Regex do nginx entre aspas.** A regra de cache dos arquivos com hash é `location ~* "\.[0-9a-f]{8,}\.(?:js|css)$"`. Sem aspas, o `{` encerra a palavra no tokenizador do nginx e o `nginx -t` recusa o arquivo. Os goldens de `tests/fixtures/vps/golden` já têm as aspas, e os dois lados (vitest e unittest) conferem.
- **Troca de `current` com `RENAME_EXCHANGE`.** Com `rename(2)` de um link novo por cima de `current`, quem lia através do link naquele instante via `ENOENT` de vez em quando (cerca de 1 em 20 mil trocas, medido em ext4 com kernel 6.18); no nginx isso seria um 404. O agente usa `renameat2(RENAME_EXCHANGE)` (via ctypes, só biblioteca padrão) e apaga o link antigo 2 s depois: 0 erros em 100 mil trocas. Sem `renameat2` no sistema, volta para `os.replace`.
- **`re.fullmatch` em todas as regras do Python.** O `$` do Python casa antes de uma quebra de linha final (`"loja.com.br\n"` passava). Os casos com `\n` estão em `tests/fixtures/vps/casos-validacao.json`.
- **Teto da seq = 2^53 − 1** nos dois lados (`Number.isSafeInteger` no painel, `SEQ_MAX` no agente).
- **Saída do OVERVIEW sem as linhas `user`.** O comando é o do ChatGPT sem mudança (sha256 fixado no teste), mas as contas do sistema nem saem da VPS: o painel já as descartava.

## 7. Testes

| Comando                                                    | O que cobre                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                 | Vitest: modelo, chaves, protocolo, ZIP, DNS, conferência, schema, arquitetura (nenhum `"use client"` alcança código de servidor), rotas, actions e telas. Os testes de banco usam PGlite 0.5.8 com os parsers do postgres-js (int8 volta string, como em produção).                                                        |
| `npx vitest run tests/integration/vps-agente-real.test.ts` | Ponta a ponta rápida: as rotas reais de `/api/agente/v1` sobre PGlite e o agente e o ajudante root **reais** em Python (registrar, confirmar, coletar, site, publicar A e B, voltar, HTTPS, resposta de pulso perdida, resultado que não chega, adulteração no banco, remover, revogar). Pula se não houver Python ≥ 3.10. |
| `npm run test:agente`                                      | unittest do agente, do ajudante root e do instalador (nginx, certbot, systemctl, apt e ufw falsos).                                                                                                                                                                                                                        |
| `npm run vps:selar`                                        | Recalcula os sha256 de `public/agente/v1` no instalador e em `src/features/vps/agente-versao.ts`. Rode depois de qualquer mudança nos arquivos do agente: `tests/unit/vps-agente-versao.test.ts` falha se alguém esquecer.                                                                                                 |

Os vetores do protocolo (`tests/fixtures/vps/vetores-protocolo.json`), os casos de validação (`casos-validacao.json`), as constantes (`constantes.json`) e os goldens do nginx (`golden/`) são **um arquivo só para os dois lados**: o vitest confere o TypeScript e o unittest confere o Python contra os mesmos bytes. O OVERVIEW e a página de espera também são comparados direto da fonte (o TS lê o `.py` e o Python lê o `.ts`).

**Pulam fora de root:** o teste de `SO_PEERCRED` com outro uid (um processo filho em `setuid(65534)`) e o de dono dos arquivos do instalador. Num runner de CI sem root eles aparecem como pulados, não como aprovados.

**Não se prova neste repositório:** `nginx -t` real, certbot e Let's Encrypt reais (inclusive reemitir depois de trocar domínios), systemd e o isolamento de verdade (drop-in, `ProtectSystem=strict` com o socket, `systemctl reload`), apt, ufw, `ss`, DNS público, a regra de firewall da Vercel e o redeploy das `NEXT_PUBLIC_*`. O teste ponta a ponta com dois `next build`, Postgres 16 real, um usuário separado e o agente Python de verdade existe e passa: `npm run e2e:vps` (como root; porta em `DASH_E2E_PORTA`, padrão 3417). Ele prova o protocolo, o banco e o agente — mas com nginx, certbot e systemctl falsos. Por isso o portão final continua a ser o piloto numa VPS descartável.

## 8. Piloto (antes de usar com o funil de verdade)

Numa VPS Ubuntu 24.04 descartável, com um subdomínio de teste:

1. Instalar pelo comando do painel; conferir `sudo dash-agent diagnostico`.
2. Confirmar "É o meu servidor"; a saúde (disco, memória, CPU, nginx) aparece em até 1 min.
3. Criar um site com o subdomínio; a página de espera responde em `http://`.
4. Apontar o DNS e verificar; o HTTPS é pedido sozinho e o vhost passa para 443.
5. Publicar um ZIP; "No ar" confere o conteúdo pelo lado de fora.
6. Publicar outro ZIP e **voltar** para o primeiro.
7. Trocar os domínios do site e reemitir o certificado.
8. Reinstalar o agente: na mesma máquina o HTTPS continua; numa máquina nova o site cai para HTTP com o aviso e as versões antigas viram "Removida".
9. `sudo dash-agent pausar` e tentar publicar: o painel não entrega a tarefa (ela vence em 10 min e a tela diz que o servidor não buscou); `retomar`. O mesmo com `somente-leitura` (a leitura de saúde continua).
10. Remover o site; remover o servidor (o agente sai com código 3); `sudo dash-agent desinstalar`.

Se o isolamento do root travar alguma operação (socket, reload), apague `/etc/systemd/system/dash-agent-root.service.d/10-protecao.conf`, rode `systemctl daemon-reload && systemctl restart dash-agent-root` e registre o que falhou.
