#!/usr/bin/env bash
# Ponta a ponta REAL do Servidor do Funil (§14.E). Fora do npm test: npm run e2e:vps, como root.
#
# Dois `next build`, um por modo, com as NEXT_PUBLIC definidas NO BUILD: o Next embute o valor
# delas também no bundle do Node, então trocar a variável só no `next start` não muda o modo.
#   A) demo (NEXT_PUBLIC_SUPABASE_* vazias): o fluxo inteiro, com Postgres 16 de verdade, o
#      instalador em raiz falsa e o agente rodando como outro usuário (dash-e2e), falando com o
#      ajudante root (root) por socket Unix com SO_PEERCRED. No demo nenhuma action passa da guarda,
#      então o lado do painel é o scripts/vps/semear.ts (os serviços reais, sem next/*).
#   B) Supabase inalcançável (https://e2e.invalid): /servidor pede login, e as rotas do agente
#      respondem sem esperar o Supabase (o proxy tem atalho para elas).
#
# O .env.local sai do caminho durante os builds e o next start (com ele o build embute o Supabase
# de verdade e tudo vai para /login) e volta SEMPRE, pelo trap, inclusive em falha. O .next que
# existia também é guardado e devolvido no fim: o next-env.d.ts importa .next/types, e deixar o
# build B (ou nada) no lugar quebraria o tsc e o next dev de quem vem depois.
#
# Variáveis: DASH_E2E_PORTA (padrão 3417). Nada de segredo vai para o log: a senha do banco e a
# VPS_CHAVE_MESTRA são aleatórias, só existem no ambiente deste processo e morrem com ele.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORTA="${DASH_E2E_PORTA:-3417}"
URL="http://127.0.0.1:$PORTA"
USUARIO="dash-e2e"
BANCO="dash_vps_e2e"
PAPEL="dash_e2e"
MIGRACOES=(0000_burly_dagger 0001_abnormal_chamber 0002_aromatic_war_machine 0003_slow_wild_child
  0004_executive_analytics_mart 0005_ads_manager 0001_enable_rls 0006_vps)

RAIZ=""
TRAB=""
ENV_MOVIDO=0
NEXT_GUARDADO=0
USUARIO_CRIADO=0
BANCO_CRIADO=0
PID_NEXT=""
FALHOU=0

log() { printf '\n##### %s\n' "$*"; }
falha() {
  echo "ERRO: $*" >&2
  exit 1
}

parar_next() {
  if [ -n "$PID_NEXT" ]; then kill "$PID_NEXT" 2>/dev/null || true; fi
  local p
  for p in $(ps -eo pid,comm | awk '$2=="next-server"{print $1}'); do kill "$p" 2>/dev/null || true; done
  local i
  for i in $(seq 1 50); do
    if ! ps -eo pid,comm | awk '$2=="next-server"{found=1} END{exit !found}'; then break; fi
    sleep 0.2
  done
  PID_NEXT=""
}

limpar() {
  local codigo=$?
  set +e
  log "Limpeza"
  parar_next
  # Sem isto o psql do postgres herdaria PGUSER/PGDATABASE do teste e tentaria entrar no banco que
  # acabou de ser apagado (o papel ficaria para trás).
  unset PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD
  if [ "$BANCO_CRIADO" = 1 ]; then
    runuser -u postgres -- dropdb --if-exists "$BANCO" && echo "banco $BANCO apagado"
    runuser -u postgres -- psql -X -q -c "DROP ROLE IF EXISTS $PAPEL" && echo "papel $PAPEL apagado"
  fi
  pg_ctlcluster 16 main stop 2>/dev/null
  pg_lsclusters | sed -n '2p'
  if [ "$USUARIO_CRIADO" = 1 ]; then
    userdel "$USUARIO" 2>/dev/null
    getent group "$USUARIO" >/dev/null && groupdel "$USUARIO"
    getent passwd "$USUARIO" >/dev/null || echo "usuário $USUARIO removido"
  fi
  if [ -n "$RAIZ" ]; then rm -rf -- "$RAIZ"; fi
  if [ -n "$TRAB" ]; then # só mexe no .next depois de o script ter guardado o original
    rm -rf -- "$REPO/.next"
    if [ "$NEXT_GUARDADO" = 1 ]; then mv -- "$TRAB/next-guardado" "$REPO/.next" && echo ".next original devolvido"; fi
  fi
  if [ "$ENV_MOVIDO" = 1 ]; then mv -- "$REPO/.env.local.bak" "$REPO/.env.local" && echo ".env.local restaurado"; fi
  if [ -n "$TRAB" ]; then
    if [ "$codigo" = 0 ]; then rm -rf -- "$TRAB"; else echo "Logs guardados em $TRAB"; fi
  fi
  exit "$codigo"
}

# --- Pré-requisitos ----------------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || falha "Rode como root (useradd, runuser, pg_ctlcluster e o ajudante root)."
for programa in pg_ctlcluster psql runuser useradd openssl curl node /usr/bin/python3; do
  command -v "$programa" >/dev/null 2>&1 || falha "Falta $programa."
done
/usr/bin/python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || falha "O agente precisa de Python 3.10+ em /usr/bin/python3."
[ -x "$REPO/node_modules/.bin/next" ] && [ -x "$REPO/node_modules/.bin/tsx" ] || falha "Rode npm ci antes."
if curl -s --noproxy '*' -o /dev/null -m 2 "$URL"; then falha "A porta $PORTA já está em uso."; fi
if [ -e "$REPO/.env.local.bak" ]; then falha ".env.local.bak já existe: confira e restaure à mão antes de rodar."; fi

trap limpar EXIT
trap 'exit 130' INT TERM

TRAB="$(mktemp -d /tmp/dash-e2e-trabalho.XXXXXX)"
RAIZ="$(mktemp -d /tmp/dash-e2e.XXXXXX)"
chmod 0755 "$RAIZ" # não o scratchpad (0700): o nobody e o dash-e2e precisam atravessar

if [ -e "$REPO/.env.local" ]; then
  mv -- "$REPO/.env.local" "$REPO/.env.local.bak"
  ENV_MOVIDO=1
fi
if [ -e "$REPO/.next" ]; then
  mv -- "$REPO/.next" "$TRAB/next-guardado"
  NEXT_GUARDADO=1
  # O cache de compilação continua valendo e deixa os dois builds mais rápidos.
  if [ -d "$TRAB/next-guardado/cache" ]; then
    mkdir -p "$REPO/.next"
    cp -a "$TRAB/next-guardado/cache" "$REPO/.next/cache"
  fi
fi

# --- Postgres 16 -------------------------------------------------------------------------------------
log "Postgres 16"
pg_ctlcluster 16 main start 2>/dev/null || true
for i in $(seq 1 50); do
  if runuser -u postgres -- pg_isready -q; then break; fi
  sleep 0.2
done
runuser -u postgres -- pg_isready || falha "O Postgres 16 não subiu."
runuser -u postgres -- dropdb --if-exists "$BANCO"
runuser -u postgres -- psql -X -q -c "DROP ROLE IF EXISTS $PAPEL"
SENHA="$(openssl rand -hex 24)"
BANCO_CRIADO=1
# printf é embutido do bash: a senha não aparece no argv de nenhum processo.
printf "CREATE ROLE %s LOGIN PASSWORD '%s';\n" "$PAPEL" "$SENHA" | runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1
runuser -u postgres -- createdb -O "$PAPEL" "$BANCO"
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER="$PAPEL" PGDATABASE="$BANCO" PGPASSWORD="$SENHA"
for m in "${MIGRACOES[@]}"; do
  psql -X -q -v ON_ERROR_STOP=1 -f "$REPO/src/database/migrations/$m.sql" >/dev/null
  echo "migração $m aplicada"
done
export DATABASE_URL="postgres://$PAPEL:$SENHA@127.0.0.1:5432/$BANCO"

# --- Usuário do agente ---------------------------------------------------------------------------------
log "Usuário $USUARIO"
if getent passwd "$USUARIO" >/dev/null; then userdel "$USUARIO"; fi
if getent group "$USUARIO" >/dev/null; then groupdel "$USUARIO"; fi
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$USUARIO"
USUARIO_CRIADO=1
id "$USUARIO"

# --- Ambiente comum (exportado ANTES de cada build: as NEXT_PUBLIC entram no bundle) ------------------
VPS_CHAVE_MESTRA="$(openssl rand -base64 48 | tr -d '\n')"
export VPS_CHAVE_MESTRA
export VPS_DONOS="dono@e2e-teste.com.br"
export VPS_CHECKOUT_ORIGENS="https://checkout-e2e.com.br"
export NEXT_PUBLIC_APP_URL="$URL"
export NEXT_TELEMETRY_DISABLED=1
unset VERCEL VERCEL_ENV VERCEL_URL VERCEL_PROJECT_PRODUCTION_URL NODE_ENV

construir() { # construir ROTULO URL_SUPABASE CHAVE_SUPABASE
  local inicio=$SECONDS
  log "next build $1 (NEXT_PUBLIC_SUPABASE_URL='$2')"
  if ! (cd "$REPO" && NEXT_PUBLIC_SUPABASE_URL="$2" NEXT_PUBLIC_SUPABASE_ANON_KEY="$3" node_modules/.bin/next build) >"$TRAB/build-$1.log" 2>&1; then
    tail -n 60 "$TRAB/build-$1.log"
    falha "next build $1 falhou."
  fi
  grep -E '^(Route|├|└|┌).*servidor|○ \(Static\)|ƒ \(Dynamic\)' "$TRAB/build-$1.log" | head -n 12 || true
  echo "build $1 pronto em $((SECONDS - inicio)) s"
}

iniciar() { # iniciar ROTULO URL_SUPABASE CHAVE_SUPABASE
  log "next start $1 na porta $PORTA"
  (cd "$REPO" && NEXT_PUBLIC_SUPABASE_URL="$2" NEXT_PUBLIC_SUPABASE_ANON_KEY="$3" exec node_modules/.bin/next start -p "$PORTA" -H 127.0.0.1) >"$TRAB/next-$1.log" 2>&1 &
  PID_NEXT=$!
  local i
  for i in $(seq 1 150); do
    if curl -fsS --noproxy '*' -o /dev/null "$URL/agente/v1/rastreio.js" 2>/dev/null; then
      echo "next start $1 respondendo"
      return 0
    fi
    kill -0 "$PID_NEXT" 2>/dev/null || break
    sleep 0.2
  done
  tail -n 40 "$TRAB/next-$1.log"
  falha "next start $1 não respondeu."
}

# --- Build A: demo ---------------------------------------------------------------------------------------
construir a "" ""
iniciar a "" ""
log "Fase demo (build A)"
/usr/bin/python3 "$REPO/scripts/vps/e2e_teste.py" demo --painel "$URL" --raiz "$RAIZ" --trabalho "$TRAB" \
  --usuario "$USUARIO" --log-next "$TRAB/next-a.log" || FALHOU=1
parar_next

# --- Build B: Supabase inalcançável ----------------------------------------------------------------------
construir b "https://e2e.invalid" "e2e"
iniciar b "https://e2e.invalid" "e2e"
log "Fase protegido (build B)"
/usr/bin/python3 "$REPO/scripts/vps/e2e_teste.py" protegido --painel "$URL" --log-next "$TRAB/next-b.log" || FALHOU=1
parar_next

log "Playwright (opcional, §14.E): não roda neste script"
if [ "$FALHOU" = 0 ]; then log "E2E: TUDO PASSOU"; else log "E2E: HOUVE FALHA (veja acima)"; fi
exit "$FALHOU"
