#!/usr/bin/env bash
# Instalador do agente do Servidor do Funil, v1.0.0. O painel mostra o comando pronto:
#   T=$(mktemp -d) && curl -fsSL --proto '=https' --tlsv1.2 https://PAINEL/agente/v1/instalar.sh -o "$T/instalar.sh" \
#     && echo "<sha256>  $T/instalar.sh" | sha256sum -c --quiet - \
#     && printf '%s\n' '<CODIGO>' | sudo bash "$T/instalar.sh" --painel https://PAINEL
# O código de instalação chega pelo STDIN, nunca pelo argv (que aparece no ps de qualquer usuário).
# Os sha256 abaixo são injetados por scripts/vps/selar.mjs (npm run vps:selar): o agente só é
# instalado se o arquivo baixado bater com eles.
# Todo o corpo fica em funções e só roda na ÚLTIMA linha: um download cortado no meio nunca
# executa pela metade como root.
#
# Modo teste (DASH_SIMULAR=1 DASH_RAIZ=/tmp/x, ou --modo-teste --raiz /tmp/x): tudo o que é
# arquivo (pastas, donos, modos, units, snippets, gancho, travas, sha256, registrar) roda DE
# VERDADE sob a raiz falsa; apt-get, useradd, systemctl, ufw e nginx só são registrados em
# $RAIZ/executados.log (ou rodam os falsos de DASH_FALSOS); root, systemd, NTP, portas, espaço e
# apache viram linhas "AVISO:". aaPanel, cPanel, Plesk e sistema fora da lista abortam sempre.
set -euo pipefail
SHA_AGENTE="afbc097ab4e409928931127d501b7ca3b5d37b24ad598f9914331d59ef83bbbf"
SHA_ROOT="199dff8c3a7c954dd834b76401bec1de564daf6ada2fbf2b1197519b5e10f51f"
SHA_DESINSTALAR="d677cfe918aac1363e289e692f5933b63db651c0e0aa95e1afa9f8b169b09f40"
VERSAO="1.0.0"
AVISO_GERADO="# dash-agent v1: gerado automaticamente. Não edite: será sobrescrito."
# Servidor padrão (catch-all 444). O "-" logo depois de "dash-" nunca sai de um slug (a regex do slug
# começa por letra ou número), então nenhum dash-<slug>.conf do ajudante root cai neste arquivo.
PADRAO="dash--padrao.conf"
# Nome usado pelas instalações antigas: é o dash-<slug>.conf do slug "000-padrao" (hoje reservado).
PADRAO_ANTIGO="dash-000-padrao.conf"

main() {
  local PAINEL="" LOCAL=""
  SIM="${DASH_SIMULAR:-0}"
  R="${DASH_RAIZ:-}"
  AGENTE_TESTE="${DASH_USUARIO_AGENTE:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --painel | --local | --raiz | --usuario-agente)
        [ $# -ge 2 ] || falha "Falta o valor de $1."
        case "$1" in
          --painel) PAINEL="$2" ;;
          --local) LOCAL="$2" ;;
          --raiz) R="$2" ;;
          --usuario-agente) AGENTE_TESTE="$2" ;;
        esac
        shift 2
        ;;
      --modo-teste) SIM=1; shift ;;
      *) falha "Opção desconhecida: $1" ;;
    esac
  done
  umask 022
  [ "$SIM" = 0 ] || [ "$SIM" = 1 ] || falha "DASH_SIMULAR só aceita 0 ou 1."
  [ "$SIM" = 1 ] || [ -z "$R" ] || falha "DASH_RAIZ (--raiz) só vale com DASH_SIMULAR=1 (--modo-teste)."
  [ "$SIM" = 1 ] || [ -z "$AGENTE_TESTE" ] || falha "DASH_USUARIO_AGENTE só vale com DASH_SIMULAR=1 (--modo-teste)."
  if [ "$SIM" = 1 ]; then
    case "$R" in /?*) ;; *) falha "O modo teste exige DASH_RAIZ com um caminho absoluto (e não a raiz /)." ;; esac
    [ -d "$R" ] || falha "A raiz de teste $R não existe."
    R="${R%/}"
  fi
  AGENTE="${AGENTE_TESTE:-dashagent}"
  [[ "$AGENTE" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || falha "Nome de usuário do agente inválido."

  validar_painel "$PAINEL"
  local CODIGO
  CODIGO="$(ler_codigo)"
  conferir_selo
  passo "Conferindo o servidor"
  checar_requisitos
  sistema systemctl stop dash-agent.service 2>/dev/null || true # reinstalação: o agente velho não mexe no estado durante o registro
  passo "Instalando nginx, certbot e python3 (apt)"
  sistema apt-get update -q
  sistema env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends nginx certbot python3 openssl ssl-cert
  checar_python
  if ! id "$AGENTE" >/dev/null 2>&1; then
    sistema useradd --system --user-group --no-create-home --home-dir /var/lib/dash-agent --shell /usr/sbin/nologin "$AGENTE"
  fi
  passo "Baixando e conferindo o agente"
  baixar_e_conferir "$PAINEL" "$LOCAL"
  criar_pastas
  passo "Preparando o nginx"
  nginx_base
  instalar_gancho_certbot
  if ufw_ativo; then
    sistema ufw allow 80/tcp # nunca toca a 22
    sistema ufw allow 443/tcp
  fi
  instalar_units
  verificar_units
  sistema systemctl daemon-reload
  sistema systemctl enable dash-agent-root.service
  sistema systemctl restart dash-agent-root.service
  passo "Registrando este servidor no painel"
  registrar_agente "$PAINEL" "$CODIGO"
  sistema systemctl enable dash-agent.service
  sistema systemctl restart dash-agent.service
  echo "Pronto. Volte ao painel e confirme que este é o seu servidor."
}

falha() {
  echo "ERRO: $*" >&2
  exit 1
}

passo() { echo "==> $*"; }

registrar_log() { printf '%s\n' "$*" >>"$R/executados.log"; }

# Comando que mexe no sistema. No modo teste só fica registrado (ou roda o falso de DASH_FALSOS,
# com os falsos na frente do PATH e RAIZ apontando para a raiz de teste).
sistema() {
  if [ "$SIM" != 1 ]; then
    "$@"
    return
  fi
  registrar_log "$*"
  [ -n "${DASH_FALSOS:-}" ] || return 0
  local nome=""
  local a
  for a in "$@"; do
    case "$a" in
      env | *=*) continue ;;
      *) nome="$a"; break ;;
    esac
  done
  if [ -n "$nome" ] && [ -x "$DASH_FALSOS/$nome" ]; then
    PATH="$DASH_FALSOS:$PATH" RAIZ="$R" "$@"
    return
  fi
  return 0
}

como_agente() {
  if [ "$SIM" = 1 ] && [ -z "$AGENTE_TESTE" ]; then
    "$@"
  else
    runuser -u "$AGENTE" -- "$@"
  fi
}

dono() {
  if [ "$SIM" = 1 ] && [ -z "$AGENTE_TESTE" ]; then id -un; else printf '%s' "$AGENTE"; fi
}

ler_codigo() {
  local c=""
  if [ -t 0 ]; then
    read -r -s -p "Código de instalação (aparece no painel): " c || true
    echo >&2
  else
    IFS= read -r c || true
  fi
  c="${c%$'\r'}"
  [[ "$c" =~ ^[A-Za-z0-9_-]{43}$ ]] || falha "Código de instalação inválido. Copie o comando de novo no painel."
  printf '%s' "$c"
}

validar_painel() {
  if [[ "$1" =~ ^https://[a-z0-9.-]+(:[0-9]{1,5})?$ ]]; then return 0; fi
  if [ "$SIM" = 1 ] && [[ "$1" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$ ]]; then return 0; fi
  falha "Endereço do painel inválido: use --painel https://… (copie o comando de novo no painel)."
}

conferir_selo() {
  case "$SHA_AGENTE$SHA_ROOT$SHA_DESINSTALAR" in
    *__*) falha "Este instalador não foi selado (rode npm run vps:selar no painel)." ;;
  esac
}

# Passou (0) ou não. Fora do modo teste, reprovar aborta; no modo teste vira linha "AVISO:".
exigir() {
  local resultado="$1" nome="$2" mensagem="$3"
  if [ "$resultado" = 0 ]; then
    if [ "$SIM" = 1 ]; then registrar_log "CONFERIDO: $nome"; fi
    return 0
  fi
  if [ "$SIM" = 1 ]; then
    registrar_log "AVISO: $nome: $mensagem"
    return 0
  fi
  falha "$mensagem"
}

sistema_suportado() {
  local id ver
  id="$(sed -n 's/^ID=//p' "$R/etc/os-release" | tr -d '"' | head -n 1)"
  ver="$(sed -n 's/^VERSION_ID=//p' "$R/etc/os-release" | tr -d '"' | head -n 1)"
  case "$id:$ver" in
    ubuntu:22.04 | ubuntu:24.04 | debian:12 | debian:13) return 0 ;;
    *) falha "Sistema não suportado (${id:-?} ${ver:-?}). Use uma VPS limpa com Ubuntu 22.04/24.04 ou Debian 12/13." ;;
  esac
}

portas_livres() {
  command -v ss >/dev/null 2>&1 || return 2
  local linhas
  linhas="$(ss -Hltnp 2>/dev/null)" || return 2
  # Alguém que não é o nginx ouvindo em :80 ou :443 impede o funil de subir.
  if printf '%s\n' "$linhas" | awk '{print $4 " " $0}' | grep -E '^[^ ]*:(80|443) ' | grep -vq '"nginx"'; then
    return 1
  fi
  return 0
}

checar_requisitos() {
  [ -r "$R/etc/os-release" ] || falha "Não achei /etc/os-release: este servidor não parece Ubuntu nem Debian."
  sistema_suportado
  [ ! -e "$R/www/server/panel" ] || falha "Este servidor tem o aaPanel. O Servidor do Funil precisa de uma VPS limpa (sem aaPanel, cPanel ou Plesk)."
  [ ! -e "$R/usr/local/cpanel" ] || falha "Este servidor tem o cPanel. O Servidor do Funil precisa de uma VPS limpa (sem aaPanel, cPanel ou Plesk)."
  [ ! -e "$R/usr/local/psa" ] || falha "Este servidor tem o Plesk. O Servidor do Funil precisa de uma VPS limpa (sem aaPanel, cPanel ou Plesk)."
  local r
  if [ "$(id -u)" -eq 0 ]; then r=0; else r=1; fi
  exigir "$r" root "Rode como root (o comando do painel já usa sudo)."
  if [ -d /run/systemd/system ]; then r=0; else r=1; fi
  exigir "$r" systemd "Este servidor não usa systemd; o agente precisa dele."
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet apache2 2>/dev/null; then r=1; else r=0; fi
  exigir "$r" apache "O Apache está ligado e ocupa as portas 80/443. Use uma VPS limpa ou desligue o Apache."
  if portas_livres; then r=0; else r=$?; fi
  if [ "$r" = 2 ]; then
    echo "AVISO: não consegui conferir as portas 80 e 443 (falta o comando ss)." >&2
    if [ "$SIM" = 1 ]; then registrar_log "AVISO: portas: não consegui conferir (falta o comando ss)"; fi
  else
    exigir "$r" portas "As portas 80/443 estão ocupadas por outro programa (não o nginx). Desligue-o antes."
  fi
  local livre
  livre="$(df -Pk "${R:-/var}" 2>/dev/null | awk 'NR == 2 {print $4}')"
  if [ "${livre:-0}" -ge 1048576 ] 2>/dev/null; then r=0; else r=1; fi
  exigir "$r" espaco "Falta espaço: o agente precisa de 1 GB livre em /var."
  if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)" = yes ]; then r=0; else r=1; fi
  exigir "$r" ntp "O relógio da VPS não está sincronizado. Rode: sudo timedatectl set-ntp true, espere um minuto e tente de novo."
}

checar_python() {
  /usr/bin/python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null \
    || falha "Este servidor precisa do Python 3.10 ou mais novo (Ubuntu 22.04+ ou Debian 12+)."
}

conferir_sha() {
  local arquivo="$1" esperado="$2" real
  real="$(sha256sum "$arquivo" | cut -d ' ' -f 1)"
  [ "$real" = "$esperado" ] || falha "O arquivo $(basename "$arquivo") não confere com o selo deste instalador. Copie o comando de novo no painel."
}

escrever() { # escrever DESTINO MODO < conteúdo (troca atômica com mv)
  local destino="$1" modo="$2" tmp
  tmp="$destino.novo.$$"
  cat >"$tmp"
  chmod "$modo" -- "$tmp"
  mv -f -- "$tmp" "$destino"
}

pasta_root() {
  mkdir -p -- "$1"
  chmod "$2" -- "$1"
}

pasta_nova() { # só ajusta o modo se a pasta nasce agora (não mexe em /etc/letsencrypt de quem já usa)
  if [ ! -d "$1" ]; then pasta_root "$1" "$2"; fi
}

pasta_do_agente() { # pasta_do_agente CAMINHO MODO [devolver]
  # Tudo por descritor, a partir do pai: mkdir, abrir SEM seguir link (O_NOFOLLOW|O_DIRECTORY), e
  # fchown/fchmod no que foi aberto. Com "[ ! -L ]" seguido de "chmod caminho", um dono de /var/www
  # que não é o root (guias que mandam "chown -R www-data /var/www") trocaria a pasta por um link
  # entre a conferência e o chmod, e o modo cairia no alvo do link (um /etc/shadow legível, p. ex.).
  # "devolver" (só a pasta dos sites): o desinstalador que mantém os sites passa a árvore para
  # root:root; numa reinstalação o agente precisa dela de volta, senão publicar, voltar versão e
  # remover dão EACCES. Só o que está root:root muda de dono, andando por descritor (os.fwalk sem
  # seguir link), e arquivo com mais de um nome fica como está (seria um link físico para um arquivo
  # do sistema). O agente está parado aqui: ninguém mexe na árvore durante a volta.
  /usr/bin/python3 -I - "$1" "$2" "$(dono)" "${3:-}" <<'EOF' || falha "Não consegui preparar $1 (veja a mensagem acima); nada além dela foi mudado."
import os
import pwd
import stat
import sys

caminho, modo, dono, devolver = sys.argv[1], int(sys.argv[2], 8), pwd.getpwnam(sys.argv[3]), sys.argv[4] == "devolver"
try:
    pai = os.open(os.path.dirname(caminho), os.O_RDONLY | os.O_DIRECTORY)
    nome = os.path.basename(caminho)
    try:
        os.mkdir(nome, modo, dir_fd=pai)
    except FileExistsError:
        pass
    fd = os.open(nome, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=pai)
except OSError as e:
    print("ERRO: " + caminho + " não é uma pasta de verdade (link simbólico?): " + str(e.strerror), file=sys.stderr)
    sys.exit(1)
os.fchown(fd, dono.pw_uid, dono.pw_gid)
os.fchmod(fd, modo)
if devolver:
    for _rel, pastas, arquivos, dfd in os.fwalk(".", dir_fd=fd, follow_symlinks=False):
        for n in pastas + arquivos:
            st = os.stat(n, dir_fd=dfd, follow_symlinks=False)
            if st.st_uid != 0 or st.st_gid != 0:
                continue
            tipo = stat.S_IFMT(st.st_mode)
            if tipo == stat.S_IFDIR or tipo == stat.S_IFLNK or (tipo == stat.S_IFREG and st.st_nlink == 1):
                os.chown(n, dono.pw_uid, dono.pw_gid, dir_fd=dfd, follow_symlinks=False)
EOF
}

TMPD=""
limpar_tmp() { if [ -n "$TMPD" ]; then rm -rf -- "$TMPD"; fi; }

baixar_e_conferir() {
  local painel="$1" origem="$2" nome proto="=https"
  if [ "$SIM" = 1 ]; then proto="=http,https"; fi
  TMPD="$(mktemp -d)"
  trap limpar_tmp EXIT
  for nome in dash_agent.py dash_agent_root.py desinstalar.sh; do
    if [ -n "$origem" ]; then
      [ -f "$origem/$nome" ] || falha "Não achei $origem/$nome."
      cp -- "$origem/$nome" "$TMPD/$nome"
    else
      curl -fsSL --proto "$proto" --tlsv1.2 --max-time 120 -o "$TMPD/$nome" "$painel/agente/v1/$nome" \
        || falha "Não consegui baixar $nome do painel."
    fi
  done
  conferir_sha "$TMPD/dash_agent.py" "$SHA_AGENTE"
  conferir_sha "$TMPD/dash_agent_root.py" "$SHA_ROOT"
  conferir_sha "$TMPD/desinstalar.sh" "$SHA_DESINSTALAR"
  pasta_root "$R/opt/dash-agent" 0755
  install -m 0644 "$TMPD/dash_agent.py" "$R/opt/dash-agent/dash_agent.py"
  install -m 0644 "$TMPD/dash_agent_root.py" "$R/opt/dash-agent/dash_agent_root.py"
  install -m 0644 "$TMPD/desinstalar.sh" "$R/opt/dash-agent/desinstalar.sh"
  mkdir -p -- "$R/usr/local/sbin"
  escrever "$R/usr/local/sbin/dash-agent" 0755 <<'EOF'
#!/bin/sh
# CLI do dono: sudo dash-agent status | pausar | retomar | somente-leitura | liberar-escrita | reconectar | diagnostico | desinstalar
exec /usr/bin/python3 -I /opt/dash-agent/dash_agent.py "$@"
EOF
}

criar_pastas() {
  pasta_root "$R/etc/dash-agent" 0755
  # O www-data precisa atravessar até o acme: pai e acme em 0755, estado só do root.
  pasta_root "$R/var/lib/dash-agent-root" 0755
  pasta_root "$R/var/lib/dash-agent-root/acme" 0755
  pasta_root "$R/var/lib/dash-agent-root/acme/.well-known" 0755
  pasta_root "$R/var/lib/dash-agent-root/acme/.well-known/acme-challenge" 0755
  pasta_root "$R/var/lib/dash-agent-root/estado" 0700
  # Criadas ANTES de ligar as units: caminho ausente sem '-' em ReadWritePaths derruba a unit.
  pasta_nova "$R/etc/letsencrypt" 0755
  pasta_nova "$R/var/lib/letsencrypt" 0755
  pasta_nova "$R/var/log/letsencrypt" 0700
  mkdir -p -- "$R/etc/letsencrypt/renewal-hooks/deploy"
  pasta_nova "$R/var/lib" 0755
  pasta_nova "$R/var/www" 0755
  pasta_do_agente "$R/var/lib/dash-agent" 0700
  pasta_do_agente "$R/var/www/dash-funil" 0755 devolver
  if [ ! -e "$R/etc/dash-agent/travas.json" ]; then
    printf '%s\n' '{"pausado":false,"somenteLeitura":false}' | escrever "$R/etc/dash-agent/travas.json" 0644
  fi
}

versao_nginx() {
  if [ "$SIM" = 1 ]; then
    printf '%s' "${DASH_NGINX_VERSAO:-1.24.0}"
  else
    nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9][0-9.]*\).*|\1|p' | head -n 1
  fi
}

versao_ge() { # versao_ge ATUAL MINIMA
  [ -n "$1" ] && [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" = "$2" ]
}

diretiva_http_existe() { # já definida no contexto http (nginx.conf ou conf.d), fora do nosso arquivo?
  local n="$R/etc/nginx" arq
  for arq in "$n/nginx.conf" "$n"/conf.d/*.conf; do
    [ -f "$arq" ] || continue
    [ "$(basename "$arq")" != dash-agent.conf ] || continue
    if grep -Eqs "^[[:space:]]*$1[[:space:]]" "$arq"; then return 0; fi
  done
  return 1
}

tem_outro_padrao() {
  # O nome antigo NÃO é pulado: se ele ainda é um catch-all ligado (não migrou), é mesmo "outro"
  # default_server, e criar o novo daria "duplicate default server" no nginx -t.
  local n="$R/etc/nginx" arq
  for arq in "$n/nginx.conf" "$n"/conf.d/*.conf "$n"/sites-enabled/*; do
    [ -e "$arq" ] || continue
    case "$(basename "$arq")" in "$PADRAO" | dash-agent.conf) continue ;; esac
    if grep -Eqs '^[^#]*listen[^;#]*default_server' "$arq"; then return 0; fi
  done
  return 1
}

eh_padrao_do_instalador() { # o arquivo é o catch-all que este instalador grava (e não o vhost de um site)?
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  [ "$(head -n 1 -- "$1")" = "$AVISO_GERADO" ] || return 1
  grep -Eq '^[[:space:]]*server_name _;' "$1" && grep -Eq '^[^#]*listen[^;#]*default_server' "$1"
}

nginx_base() {
  local n="$R/etc/nginx" versao ipv6=0 criou_padrao=0 criou_conf=0 default_antigo="" migrou=0
  mkdir -p -- "$n/snippets" "$n/conf.d" "$n/sites-available" "$n/sites-enabled"
  versao="$(versao_nginx)"
  if [ -s "$R/proc/net/if_inet6" ]; then ipv6=1; fi
  # Incluído no server e em TODA location com add_header: o nginx não herda cabeçalhos para dentro dela.
  escrever "$n/snippets/dash-agent-cabecalhos.conf" 0644 <<EOF
$AVISO_GERADO
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "SAMEORIGIN" always;
EOF
  escrever "$n/snippets/dash-agent-tls.conf" 0644 <<EOF
$AVISO_GERADO
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:dash_agent_tls:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
EOF
  if [ ! -e "$n/conf.d/dash-agent.conf" ]; then criou_conf=1; fi
  {
    echo "$AVISO_GERADO"
    if ! diretiva_http_existe server_tokens; then echo "server_tokens off;"; fi
    if ! diretiva_http_existe server_names_hash_bucket_size; then echo "server_names_hash_bucket_size 128;"; fi
  } | escrever "$n/conf.d/dash-agent.conf" 0644
  # O "default" de fábrica só sai se estiver intocado (md5 igual ao conffile do dpkg).
  local link_default="$n/sites-enabled/default" esperado=""
  if [ -L "$link_default" ] && [ -f "$n/sites-available/default" ]; then
    if [ "$SIM" = 1 ]; then
      esperado="${DASH_MD5_DEFAULT:-}"
    else
      esperado="$(dpkg-query -W -f='${Conffiles}\n' nginx-common 2>/dev/null | awk '$1 == "/etc/nginx/sites-available/default" {print $2; exit}')"
    fi
    if [ -n "$esperado" ] && [ "$(md5sum "$n/sites-available/default" | cut -d ' ' -f 1)" = "$esperado" ]; then
      default_antigo="$(readlink "$link_default")"
      rm -f -- "$link_default"
    fi
  fi
  # Reinstalação sobre uma instalação antiga: o catch-all ligado com o nome velho passa para o nome
  # novo, com o mesmo conteúdo. Só se ainda for o catch-all original; se um site já tomou o arquivo
  # (slug "000-padrao"), o arquivo é do site e fica onde está.
  if [ -L "$n/sites-enabled/$PADRAO_ANTIGO" ] && [ "$(readlink "$n/sites-enabled/$PADRAO_ANTIGO")" = "../sites-available/$PADRAO_ANTIGO" ] \
    && eh_padrao_do_instalador "$n/sites-available/$PADRAO_ANTIGO" \
    && [ ! -e "$n/sites-available/$PADRAO" ] && [ ! -L "$n/sites-enabled/$PADRAO" ]; then
    migrou=1
    mv -f -- "$n/sites-available/$PADRAO_ANTIGO" "$n/sites-available/$PADRAO"
    ln -sfn "../sites-available/$PADRAO" "$n/sites-enabled/$PADRAO"
    rm -f -- "$n/sites-enabled/$PADRAO_ANTIGO"
  fi
  if [ ! -e "$n/sites-enabled/$PADRAO" ] && ! tem_outro_padrao; then
    criou_padrao=1
    {
      echo "$AVISO_GERADO"
      echo "# Servidor padrão: fecha a conexão (444) para Host desconhecido e para o IP puro."
      echo "server {"
      echo "  listen 80 default_server;"
      if [ "$ipv6" = 1 ]; then echo "  listen [::]:80 default_server;"; fi
      echo "  server_name _;"
      echo "  return 444;"
      echo "}"
      echo "server {"
      echo "  listen 443 ssl default_server;"
      if [ "$ipv6" = 1 ]; then echo "  listen [::]:443 ssl default_server;"; fi
      echo "  server_name _;"
      if versao_ge "$versao" 1.19.4; then
        echo "  ssl_reject_handshake on;"
      else
        echo "  ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;"
        echo "  ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;"
        echo "  return 444;"
      fi
      echo "}"
    } | escrever "$n/sites-available/$PADRAO" 0644
    ln -sfn "../sites-available/$PADRAO" "$n/sites-enabled/$PADRAO"
  fi
  if ! sistema nginx -t; then
    # Desfaz o que esta execução ligou e devolve o default de fábrica: nada do painel fica pela metade.
    if [ "$criou_padrao" = 1 ]; then rm -f -- "$n/sites-enabled/$PADRAO" "$n/sites-available/$PADRAO"; fi
    if [ "$migrou" = 1 ]; then
      mv -f -- "$n/sites-available/$PADRAO" "$n/sites-available/$PADRAO_ANTIGO"
      ln -sfn "../sites-available/$PADRAO_ANTIGO" "$n/sites-enabled/$PADRAO_ANTIGO"
      rm -f -- "$n/sites-enabled/$PADRAO"
    fi
    if [ "$criou_conf" = 1 ]; then rm -f -- "$n/conf.d/dash-agent.conf"; fi
    if [ -n "$default_antigo" ]; then ln -sfn "$default_antigo" "$link_default"; fi
    falha "O nginx recusou a configuração base (nginx -t). Nada do painel ficou ligado; veja a mensagem acima."
  fi
  sistema systemctl enable nginx.service
  sistema systemctl reload-or-restart nginx.service
}

instalar_gancho_certbot() {
  escrever "$R/etc/letsencrypt/renewal-hooks/deploy/dash-agent" 0755 <<'EOF'
#!/bin/sh
# dash-agent v1: recarrega o nginx (com nginx -t antes) quando o certbot renova um certificado dash-*.
exec /usr/bin/python3 -I /opt/dash-agent/dash_agent_root.py pos-renovacao
EOF
}

ufw_ativo() {
  if [ "$SIM" = 1 ]; then
    if [ -n "${DASH_FALSOS:-}" ]; then
      sistema ufw status | grep -q '^Status: active'
      return
    fi
    return 0 # simulado: as duas liberações ficam registradas no executados.log
  fi
  command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'
}

instalar_units() {
  local s="$R/etc/systemd/system"
  pasta_root "$s/dash-agent-root.service.d" 0755
  escrever "$s/dash-agent.service" 0644 <<'EOF'
[Unit]
Description=Agente do Servidor do Funil
After=network-online.target dash-agent-root.service
Wants=network-online.target
Requires=dash-agent-root.service
[Service]
User=dashagent
Group=dashagent
ExecStart=/usr/bin/python3 -I /opt/dash-agent/dash_agent.py rodar
Restart=always
RestartSec=10
RestartPreventExitStatus=3
UMask=0022
NoNewPrivileges=yes
ProtectSystem=strict
# As duas pastas são criadas pelo instalador antes do enable (o teste confere). Sem '-' de propósito.
ReadWritePaths=/var/www/dash-funil /var/lib/dash-agent
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
SystemCallFilter=@system-service
SystemCallArchitectures=native
RestrictSUIDSGID=yes
# Sem namespace novo: com user namespace sem privilégio (ligado de fábrica no Debian 12/13), uma falha
# no agente (que abre ZIP e lê resposta de rede) alcançaria a superfície do kernel que só root vê.
# Também sem mexer em sysctl, módulo, log do kernel, cgroup, hostname ou personalidade, sem tempo
# real e sem ver processo de outro usuário. ProcSubset=pid fica de fora de propósito: o OVERVIEW lê
# /proc/stat, /proc/meminfo e /proc/uptime, e o pulso lê /proc/net/if_inet6.
RestrictNamespaces=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectHostname=yes
ProtectProc=invisible
LockPersonality=yes
RestrictRealtime=yes
MemoryMax=256M
[Install]
WantedBy=multi-user.target
EOF
  if [ "$AGENTE" != dashagent ]; then # só no modo teste com DASH_USUARIO_AGENTE
    sed -i "s/^User=dashagent$/User=$AGENTE/; s/^Group=dashagent$/Group=$AGENTE/" "$s/dash-agent.service"
  fi
  escrever "$s/dash-agent-root.service" 0644 <<'EOF'
[Unit]
Description=Ajudante root do agente do Servidor do Funil
After=nginx.service
StartLimitIntervalSec=0
[Service]
ExecStart=/usr/bin/python3 -I /opt/dash-agent/dash_agent_root.py servir
RuntimeDirectory=dash-agent-root
RuntimeDirectoryMode=0750
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
  # O isolamento do ajudante fica num drop-in à parte: se o piloto travar, apagar este arquivo
  # devolve o ajudante ao modo simples sem mexer no resto.
  escrever "$s/dash-agent-root.service.d/10-protecao.conf" 0644 <<'EOF'
[Service]
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
# Caminho que não existe, sem '-', derruba a unit com 226/NAMESPACE (e o dash-agent junto, pelo Requires=).
# Com '-': o systemd ignora o caminho ausente. Só /etc/nginx e /var/lib/dash-agent-root ficam sem '-',
# porque o apt do nginx e o instalador garantem os dois.
ReadWritePaths=/etc/nginx /var/lib/dash-agent-root -/etc/letsencrypt -/var/lib/letsencrypt -/var/log/letsencrypt -/var/log/nginx -/var/lib/nginx
EOF
}

verificar_units() {
  command -v systemd-analyze >/dev/null 2>&1 || return 0
  local s="$R/etc/systemd/system" saida
  if saida="$(SYSTEMD_UNIT_PATH="$s:" systemd-analyze verify "$s/dash-agent-root.service" "$s/dash-agent.service" 2>&1)"; then
    if [ "$SIM" = 1 ]; then registrar_log "systemd-analyze verify: ok"; fi
  else
    printf 'AVISO: systemd-analyze verify: %s\n' "$saida" >&2
    if [ "$SIM" = 1 ]; then registrar_log "AVISO: systemd-analyze verify: $(printf '%s' "$saida" | head -n 3 | tr '\n' ' ')"; fi
  fi
}

registrar_agente() {
  local painel="$1" codigo="$2"
  local -a extra=()
  if [ "$SIM" = 1 ]; then extra=(--modo-teste --raiz "$R"); fi
  # printf é embutido do bash: o código não aparece em argv nenhum.
  if ! printf '%s\n' "$codigo" | como_agente /usr/bin/python3 -I "$R/opt/dash-agent/dash_agent.py" registrar --painel "$painel" ${extra[@]+"${extra[@]}"}; then
    falha "O registro no painel não foi concluído (veja a mensagem acima). O agente não foi ligado."
  fi
}

main "$@"
