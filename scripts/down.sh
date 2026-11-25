#!/usr/bin/env bash
# Derruba tudo o que `npm run up` iniciou NESTA cópia: API, worker, front e o
# container do Postgres. Não toca em outras cópias. Os dados do banco ficam no
# volume da cópia; para apagá-los também: npm run down -- --apagar-dados
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$RAIZ"
# shellcheck source=scripts/lib/copia.sh
. "$RAIZ/scripts/lib/copia.sh"

APAGAR=""
[ "${1:-}" = "--apagar-dados" ] && APAGAR="-v"

for nome in web worker api; do
  if node "$PROC" vivo "$PIDS/$nome.pid"; then
    echo "parando $nome"
  fi
  node "$PROC" parar "$PIDS/$nome.pid"
done

if command -v docker > /dev/null && docker info > /dev/null 2>&1; then
  [ -f "$ESTADO/portas" ] && . "$ESTADO/portas"
  echo "parando o Postgres ($PROJETO)"
  compose down $APAGAR > /dev/null 2>&1 || true
fi
echo "Cópia $PROJETO derrubada."
