#!/usr/bin/env bash
# Desinstalador do agente do Servidor do Funil, v1.0.0.
#   sudo bash /opt/dash-agent/desinstalar.sh [--remover-sites]      (ou: sudo dash-agent desinstalar)
# Para e remove as units, /opt/dash-agent, /var/lib/dash-agent*, /etc/dash-agent e o usuário
# dashagent. MANTÉM os sites no ar (vhosts, certificados e /var/www/dash-funil, que passa para o
# root), só que sem ninguém para atualizá-los. O gancho do certbot vira um mínimo, que não depende
# do agente: sem reload depois da renovação, o nginx seguiria com o certificado velho na memória
# até ele vencer. Com --remover-sites também apaga os sites, mas SÓ o que o painel criou: vhost
# dash-<slug>.conf (ou o servidor padrão) com o cabeçalho AVISO_GERADO na primeira linha, e
# certificado dash-<slug> renovado pelo webroot do ajudante. Um dash-loja.com.br.conf ou um
# certificado feito à mão com esse prefixo fica. Sempre termina com nginx -t e reload.
# Modo teste: DASH_SIMULAR=1 DASH_RAIZ=/tmp/x (ou --modo-teste --raiz /tmp/x), como no instalador.
set -euo pipefail
AVISO_GERADO="# dash-agent v1: gerado automaticamente. Não edite: será sobrescrito."
ACME="/var/lib/dash-agent-root/acme"

main() {
  local REMOVER_SITES=0
  SIM="${DASH_SIMULAR:-0}"
  R="${DASH_RAIZ:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --remover-sites) REMOVER_SITES=1; shift ;;
      --modo-teste) SIM=1; shift ;;
      --raiz)
        [ $# -ge 2 ] || falha "Falta o valor de --raiz."
        R="$2"
        shift 2
        ;;
      *) falha "Opção desconhecida: $1" ;;
    esac
  done
  [ "$SIM" = 0 ] || [ "$SIM" = 1 ] || falha "DASH_SIMULAR só aceita 0 ou 1."
  [ "$SIM" = 1 ] || [ -z "$R" ] || falha "DASH_RAIZ (--raiz) só vale com DASH_SIMULAR=1 (--modo-teste)."
  if [ "$SIM" = 1 ]; then
    case "$R" in /?*) ;; *) falha "O modo teste exige DASH_RAIZ com um caminho absoluto (e não a raiz /)." ;; esac
    [ -d "$R" ] || falha "A raiz de teste $R não existe."
    R="${R%/}"
  else
    [ "$(id -u)" -eq 0 ] || falha "Rode como root (sudo)."
  fi
  shopt -s nullglob
  local s="$R/etc/systemd/system" n="$R/etc/nginx" gancho="$R/etc/letsencrypt/renewal-hooks/deploy/dash-agent" arq nome

  echo "==> Parando o agente"
  sistema systemctl disable --now dash-agent.service 2>/dev/null || true
  sistema systemctl disable --now dash-agent-root.service 2>/dev/null || true
  rm -f -- "$s/dash-agent.service" "$s/dash-agent-root.service"
  rm -rf -- "$s/dash-agent-root.service.d"
  sistema systemctl daemon-reload || true

  echo "==> Removendo os arquivos do agente"
  rm -rf -- "$R/opt/dash-agent" "$R/var/lib/dash-agent" "$R/var/lib/dash-agent-root" "$R/etc/dash-agent" "$R/run/dash-agent-root"
  rm -f -- "$R/usr/local/sbin/dash-agent" "$gancho"

  if [ "$REMOVER_SITES" = 1 ]; then
    echo "==> Removendo os sites do painel"
    for arq in "$n"/sites-available/dash-*.conf; do
      nome="$(basename "$arq")"
      if ! conf_do_painel "$nome" "$arq"; then continue; fi
      if [ -L "$n/sites-enabled/$nome" ]; then rm -f -- "$n/sites-enabled/$nome"; fi
      rm -f -- "$arq"
    done
    # Link do painel que ficou sem o arquivo (remoção pela metade): aponta para o próprio nome.
    for arq in "$n"/sites-enabled/dash-*.conf; do
      nome="$(basename "$arq")"
      if [ -L "$arq" ] && [ ! -e "$arq" ] && nome_de_conf_do_painel "$nome" \
        && [ "$(readlink "$arq")" = "../sites-available/$nome" ]; then
        rm -f -- "$arq"
      fi
    done
    for arq in "$n"/snippets/dash-agent-*.conf "$n/conf.d/dash-agent.conf"; do
      if gerado_pelo_painel "$arq"; then rm -f -- "$arq"; fi
    done
    for arq in "$R"/etc/letsencrypt/live/dash-*; do
      nome="$(basename "$arq")"
      if certificado_do_painel "$nome"; then
        sistema certbot delete --cert-name "$nome" --non-interactive || true
      fi
    done
    rm -rf -- "$R/var/www/dash-funil"
  else
    gancho_minimo "$gancho"
    if [ -d "$R/var/www/dash-funil" ] && pode_mudar_dono; then
      # O uid do dashagent vai sumir; se for reusado por outro usuário, ele herdaria os sites.
      # Uma reinstalação devolve ao agente o que está root:root (instalar.sh, pasta_do_agente).
      chown -R -h root:root -- "$R/var/www/dash-funil"
    fi
  fi

  if id dashagent >/dev/null 2>&1 || [ "$SIM" = 1 ]; then
    sistema userdel dashagent || true
    sistema groupdel dashagent 2>/dev/null || true
  fi

  if sistema nginx -t; then
    sistema systemctl reload nginx.service || true
  else
    echo "AVISO: o nginx -t falhou; nada foi recarregado. Confira a configuração do nginx." >&2
  fi
  if [ "$REMOVER_SITES" = 1 ]; then
    echo "Pronto. O agente e os sites do painel foram removidos."
  else
    echo "Pronto. O agente foi removido; os sites continuam no ar até você apagá-los (rode de novo com --remover-sites)."
    if [ -e "$gancho" ]; then
      echo "Os certificados HTTPS continuam renovando sozinhos: o gancho mínimo em $gancho recarrega o nginx a cada renovação."
    fi
  fi
}

falha() {
  echo "ERRO: $*" >&2
  exit 1
}

sistema() {
  if [ "$SIM" != 1 ]; then
    "$@"
    return
  fi
  printf '%s\n' "$*" >>"$R/executados.log"
  if [ -n "${DASH_FALSOS:-}" ] && [ -x "$DASH_FALSOS/$1" ]; then
    PATH="$DASH_FALSOS:$PATH" RAIZ="$R" "$@"
    return
  fi
  return 0
}

# No modo teste o chown para root:root só roda como root (é o que o teste de reinstalação usa).
pode_mudar_dono() { [ "$SIM" != 1 ] || [ "$(id -u)" -eq 0 ]; }

# A mesma regra do slug do painel e do ajudante root: [a-z0-9], com "-" só no meio, até 40.
# LC_ALL=C: em alguns locales [a-z] casaria letra acentuada ou maiúscula.
eh_slug() {
  local LC_ALL=C
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ ]]
}

gerado_pelo_painel() { # arquivo comum com o cabeçalho que o instalador e o ajudante root escrevem
  [ -f "$1" ] && [ ! -L "$1" ] && [ "$(head -n 1 -- "$1")" = "$AVISO_GERADO" ]
}

nome_de_conf_do_painel() { # dash-<slug>.conf ou o servidor padrão (o nome novo; o antigo é um dash-<slug>)
  local slug
  case "$1" in
    dash--padrao.conf) return 0 ;;
    dash-*.conf)
      slug="${1#dash-}"
      eh_slug "${slug%.conf}"
      ;;
    *) return 1 ;;
  esac
}

conf_do_painel() { # NOME ARQUIVO
  nome_de_conf_do_painel "$1" && gerado_pelo_painel "$2"
}

certificado_do_painel() { # NOME: dash-<slug> emitido pelo ajudante (o webroot dele no renewal/<nome>.conf)
  case "$1" in dash-*) ;; *) return 1 ;; esac
  eh_slug "${1#dash-}" || return 1
  grep -Eqs "^[[:space:]]*webroot_path[[:space:]]*=[[:space:]]*$ACME,?[[:space:]]*$" "$R/etc/letsencrypt/renewal/$1.conf"
}

gancho_minimo() { # só quando sobra certificado do painel para o certbot.timer renovar
  local destino="$1" algum=0 arq
  for arq in "$R"/etc/letsencrypt/live/dash-*; do
    if certificado_do_painel "$(basename "$arq")"; then algum=1; fi
  done
  [ "$algum" = 1 ] && [ -d "$(dirname "$destino")" ] || return 0
  cat >"$destino.novo.$$" <<'EOF'
#!/bin/sh
# dash-agent desinstalado: os sites do painel continuam no ar. Recarrega o nginx (com nginx -t antes)
# quando o certbot renova um certificado dash-*; sem isso o nginx seguiria com o certificado velho.
PATH=/usr/sbin:/usr/bin:/sbin:/bin
case "$(basename "${RENEWED_LINEAGE:-}")" in dash-*) ;; *) exit 0 ;; esac
nginx -t -q && exec systemctl reload nginx.service
EOF
  chmod 0755 -- "$destino.novo.$$"
  mv -f -- "$destino.novo.$$" "$destino"
}

main "$@"
