#!/usr/bin/env bash
# Sobe o Balcão inteiro DESTA cópia (clone ou worktree): Postgres, migrations,
# seed, API, worker e front. Pode rodar de novo sem derrubar antes.
# Cada cópia tem as próprias portas, banco, pasta de anexos e worker.
# Uso: npm run up   (ou bash scripts/up.sh)
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$RAIZ"
# shellcheck source=scripts/lib/copia.sh
. "$RAIZ/scripts/lib/copia.sh"

passo() { printf '\n==> %s\n' "$*"; }
falhar() {
  printf '\nERRO: %s\n' "$*" >&2
  exit 1
}

# --- pré-requisitos ----------------------------------------------------------
command -v node > /dev/null || falhar "Node.js não encontrado (precisa do Node 22 ou superior)."
NODE_MAIOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAIOR" -ge 22 ] || falhar "Node $NODE_MAIOR encontrado; o Balcão precisa do Node 22 ou superior."
command -v docker > /dev/null || falhar "Docker não encontrado."
docker info > /dev/null 2>&1 || falhar "O Docker não está respondendo. Abra o Docker e rode de novo."
docker compose version > /dev/null 2>&1 || falhar "docker compose (v2) não encontrado."

mkdir -p "$ESTADO" "$LOGS" "$PIDS" "$UPLOADS"

# --- dependências (npm ci respeita o package-lock como está) ------------------
instalar() {
  local pasta=$1 carimbo hash_atual
  carimbo="$pasta/node_modules/.balcao-lock"
  hash_atual=$(node -e 'const c=require("crypto");process.stdout.write(c.createHash("sha1").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$pasta/package-lock.json")
  if [ -f "$carimbo" ] && [ "$(cat "$carimbo")" = "$hash_atual" ]; then
    return 0
  fi
  echo "    npm ci em ${pasta#"$RAIZ"}/"
  (cd "$pasta" && npm ci --no-audit --no-fund --loglevel=error > "$LOGS/npm-ci-$(basename "$pasta").log" 2>&1) ||
    falhar "npm ci falhou em ${pasta#"$RAIZ"/}. Veja $LOGS/npm-ci-$(basename "$pasta").log"
  printf '%s' "$hash_atual" > "$carimbo"
}
passo "Dependências"
instalar "$RAIZ"
instalar "$RAIZ/api"
instalar "$RAIZ/web"

# --- hook do Git ---------------------------------------------------------------
if git -C "$RAIZ" rev-parse --git-dir > /dev/null 2>&1; then
  git -C "$RAIZ" config core.hooksPath .githooks
  chmod +x "$RAIZ/.githooks/"* 2> /dev/null || true
fi

# --- processos desta cópia que já estavam no ar: reinicia limpo ----------------
for nome in api worker web; do
  node "$PROC" parar "$PIDS/$nome.pid"
done

# --- portas --------------------------------------------------------------------
# Reaproveita as portas da última subida desta cópia, se continuarem livres;
# senão procura a próxima livre a partir da padrão.
API_PORT=""
WEB_PORT=""
DB_PORT=""
[ -f "$ESTADO/portas" ] && . "$ESTADO/portas"

DB_RODANDO=$(compose ps --status running -q db 2> /dev/null || true)
if [ -n "$DB_RODANDO" ]; then
  DB_PORT=$(compose port db 5432 | sed 's/.*://')
elif [ -z "$DB_PORT" ] || node "$PROC" porta-ocupada "$DB_PORT"; then
  DB_PORT=$(node "$PROC" porta-livre 5432)
fi
if [ -z "$API_PORT" ] || node "$PROC" porta-ocupada "$API_PORT"; then
  API_PORT=$(node "$PROC" porta-livre 4000 "$DB_PORT")
fi
if [ -z "$WEB_PORT" ] || node "$PROC" porta-ocupada "$WEB_PORT"; then
  WEB_PORT=$(node "$PROC" porta-livre 5173 "$DB_PORT" "$API_PORT")
fi
printf 'API_PORT=%s\nWEB_PORT=%s\nDB_PORT=%s\n' "$API_PORT" "$WEB_PORT" "$DB_PORT" > "$ESTADO/portas"

API_URL="http://localhost:$API_PORT"
WEB_URL="http://localhost:$WEB_PORT"
DATABASE_URL="postgresql://balcao:balcao@localhost:$DB_PORT/balcao"
DATABASE_URL_TEST="postgresql://balcao:balcao@localhost:$DB_PORT/balcao_test"

# --- configuração da cópia (arquivos ignorados pelo Git, refeitos a cada subida) ---
cat > "$RAIZ/api/.env" << EOF
# Gerado por npm run up para esta cópia ($PROJETO). Não edite: é refeito a cada subida.
DATABASE_URL=$DATABASE_URL
DATABASE_URL_TEST=$DATABASE_URL_TEST
JWT_SECRET=dev-secret
AI_MODE=fake
OPENAI_API_KEY=
UPLOAD_DIR=$UPLOADS
PORT=$API_PORT
CORS_ORIGIN=$WEB_URL
TRIAGE_INTERVAL_MS=2000
EOF
cat > "$RAIZ/web/.env.local" << EOF
# Gerado por npm run up para esta cópia ($PROJETO). Não edite: é refeito a cada subida.
VITE_API_URL=$API_URL
EOF

# --- banco ---------------------------------------------------------------------
passo "Postgres ($PROJETO, porta $DB_PORT)"
BALCAO_DB_PORT=$DB_PORT compose up -d --wait db > "$LOGS/compose.log" 2>&1 ||
  falhar "o Postgres não subiu. Veja $LOGS/compose.log"

compose exec -T db psql -U balcao -d balcao -tAc "SELECT 1 FROM pg_database WHERE datname = 'balcao_test'" | grep -q 1 ||
  compose exec -T db psql -U balcao -d balcao -qc "CREATE DATABASE balcao_test" > /dev/null

passo "Migrations e seed"
(
  cd "$RAIZ/api"
  npx prisma generate > "$LOGS/prisma.log" 2>&1
  npx prisma migrate deploy >> "$LOGS/prisma.log" 2>&1
  DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy >> "$LOGS/prisma.log" 2>&1
) || falhar "migrations falharam. Veja $LOGS/prisma.log"
(cd "$RAIZ/api" && npm run seed > "$LOGS/seed.log" 2>&1) || falhar "a seed falhou. Veja $LOGS/seed.log"

# --- API, worker e front -------------------------------------------------------
passo "API, worker e front"
: > "$LOGS/api.log"
: > "$LOGS/worker.log"
: > "$LOGS/web.log"
node "$PROC" iniciar "$PIDS/api.pid" "$LOGS/api.log" "$RAIZ/api" -- \
  "$RAIZ/api/node_modules/.bin/tsx" watch --env-file=.env src/main.ts > /dev/null
node "$PROC" iniciar "$PIDS/worker.pid" "$LOGS/worker.log" "$RAIZ/api" -- \
  "$RAIZ/api/node_modules/.bin/tsx" --env-file=.env src/jobs/triage-worker.ts > /dev/null
node "$PROC" iniciar "$PIDS/web.pid" "$LOGS/web.log" "$RAIZ/web" -- \
  "$RAIZ/web/node_modules/.bin/vite" --port "$WEB_PORT" --strictPort > /dev/null

if ! node "$PROC" esperar "$API_URL/api/health" 60; then
  tail -20 "$LOGS/api.log" >&2
  falhar "a API não respondeu em $API_URL/api/health. Log: $LOGS/api.log"
fi
if ! node "$PROC" esperar "$WEB_URL" 60; then
  tail -20 "$LOGS/web.log" >&2
  falhar "o front não respondeu em $WEB_URL. Log: $LOGS/web.log"
fi
sleep 1
node "$PROC" vivo "$PIDS/worker.pid" || {
  tail -20 "$LOGS/worker.log" >&2
  falhar "o worker caiu. Log: $LOGS/worker.log"
}

cat << EOF

Balcão no ar ($PROJETO)
  Front:   $WEB_URL
  API:     $API_URL   (saúde: $API_URL/api/health)
  Banco:   $DATABASE_URL   (container do projeto compose $PROJETO)
  Anexos:  $UPLOADS
  Worker:  triagem a cada 2s, IA em modo fake
  Logs:    $LOGS
  Derrubar esta cópia: npm run down
EOF
