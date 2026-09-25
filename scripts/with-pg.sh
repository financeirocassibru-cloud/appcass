#!/usr/bin/env bash
#
# Sobe um Postgres descartável, aplica o shim de ambiente e as migrations, e
# executa o comando recebido com DATABASE_URL apontando para ele. Derruba tudo
# na saída.
#
# Não precisa de Docker nem de credencial do Supabase — só do servidor Postgres.
# É o que permite verificar o schema em CI e em container sem daemon.
#
# Uso:  scripts/with-pg.sh <comando> [args...]
#
# O shim (supabase/tests/00_shim.sql) recria o mínimo que o Supabase fornece:
# schemas auth/extensions, auth.users, os papéis e as concessões padrão. Ele roda
# ANTES das migrations, para que os `revoke` delas tenham o que revogar.

set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-55432}"
PGDATA="${PGDATA:-/var/tmp/appcass-pgdata}"
PGSOCK="${PGSOCK:-/var/tmp}"
PGUSER_RUN="${PGUSER_RUN:-postgres}"
DB="${PGDATABASE_NAME:-appcass_tmp}"
STAGE=/var/tmp/appcass-sql

if [ "$#" -eq 0 ]; then
  echo "uso: $0 <comando> [args...]" >&2
  exit 64
fi

if [ ! -x "$PGBIN/initdb" ]; then
  echo "Postgres não encontrado em $PGBIN." >&2
  echo "Instale o servidor (apt-get install -y postgresql-16) ou defina PGBIN." >&2
  exit 127
fi

# Quem roda como root precisa de um usuário sem privilégio para o initdb.
as_pg() {
  if [ "$(id -u)" -eq 0 ]; then
    su "$PGUSER_RUN" -c "$1"
  else
    bash -c "$1"
  fi
}

cleanup() {
  as_pg "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PGDATA" "$STAGE"
}
trap cleanup EXIT

if [ "$(id -u)" -eq 0 ] && ! id "$PGUSER_RUN" >/dev/null 2>&1; then
  useradd -m "$PGUSER_RUN"
fi

rm -rf "$PGDATA"
mkdir -p "$PGDATA"
[ "$(id -u)" -eq 0 ] && chown -R "$PGUSER_RUN" "$PGDATA"
chmod 700 "$PGDATA"

echo "→ Criando cluster descartável"
as_pg "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8 --locale=C" >/dev/null

echo "→ Subindo Postgres na porta $PGPORT"
as_pg "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/server.log -o '-p $PGPORT -k $PGSOCK -h 127.0.0.1' -w start" >/dev/null

psql_run() {
  as_pg "$PGBIN/psql -h $PGSOCK -p $PGPORT -U postgres $*"
}

psql_run "-q -c 'create database $DB'" >/dev/null

# Estágio legível pelo usuário do Postgres.
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp supabase/migrations/*.sql supabase/tests/*.sql "$STAGE/"
chmod -R a+rX "$STAGE"

echo "→ Aplicando o shim de ambiente"
psql_run "-d $DB -v ON_ERROR_STOP=1 -q -f $STAGE/00_shim.sql" >/dev/null

echo "→ Aplicando migrations"
for file in supabase/migrations/*.sql; do
  name=$(basename "$file")
  psql_run "-d $DB -v ON_ERROR_STOP=1 -q -f $STAGE/$name" >/dev/null
  echo "   ✓ $name"
done

# TCP e não socket: é o que uma URL de conexão aceita. `sslmode=disable` porque
# este cluster descartável não tem TLS, e o cliente do Supabase exige TLS por
# padrão.
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable"
export PG_SOCKET_DIR="$PGSOCK"
export PG_PORT="$PGPORT"
export PG_DATABASE="$DB"
export PG_STAGE="$STAGE"
export PG_AS_ROOT_USER="$PGUSER_RUN"
export PGBIN

# Sem `exec`: ele substituiria este shell e o `trap cleanup EXIT` nunca rodaria,
# deixando um Postgres órfão e o diretório de dados para trás.
"$@"
