#!/usr/bin/env bash
#
# Roda as asserções de RLS e constraints. Precisa das variáveis que
# scripts/with-pg.sh exporta — não é para ser chamado direto.
#
# Uso indireto:  npm run db:verify

set -euo pipefail

: "${PGBIN:?rode via scripts/with-pg.sh}"
: "${PG_SOCKET_DIR:?rode via scripts/with-pg.sh}"
: "${PG_PORT:?rode via scripts/with-pg.sh}"
: "${PG_DATABASE:?rode via scripts/with-pg.sh}"
: "${PG_STAGE:?rode via scripts/with-pg.sh}"

as_pg() {
  if [ "$(id -u)" -eq 0 ]; then
    su "${PG_AS_ROOT_USER:-postgres}" -c "$1"
  else
    bash -c "$1"
  fi
}

echo "→ Verificando RLS e constraints"
as_pg "$PGBIN/psql -h $PG_SOCKET_DIR -p $PG_PORT -U postgres -d $PG_DATABASE \
  -v ON_ERROR_STOP=1 -q -f $PG_STAGE/01_rls_proof.sql"

echo "✓ Banco verificado."
