# Identidade e caminhos desta cópia do projeto. Usado por up.sh e down.sh.
# Espera RAIZ definido (raiz da cópia, caminho absoluto).
ESTADO="$RAIZ/.balcao"
LOGS="$ESTADO/logs"
PIDS="$ESTADO/pids"
UPLOADS="$ESTADO/uploads"
PROC="$RAIZ/scripts/lib/processos.mjs"

# Nome do projeto compose: pasta da cópia + hash do caminho absoluto.
# Duas worktrees nunca dividem container, volume nem rede.
_nome=$(basename "$RAIZ" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed 's/^-*//; s/-*$//' | cut -c1-30)
PROJETO="balcao-${_nome:-copia}-$(node "$PROC" id "$RAIZ")"

compose() {
  BALCAO_DB_PORT=${BALCAO_DB_PORT:-${DB_PORT:-5432}} docker compose -p "$PROJETO" -f "$RAIZ/docker-compose.yml" "$@"
}
