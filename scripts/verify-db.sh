#!/usr/bin/env bash
#
# Aplica as migrations num Postgres descartável e roda as asserções de RLS e
# constraints. Não precisa de Docker nem do stack completo do Supabase — só do
# servidor Postgres, o que permite rodar em CI e em containers sem daemon.
#
# O que isto verifica de verdade:
#   - as 7 migrations aplicam limpo, em ordem, num banco vazio;
#   - as policies de RLS isolam usuários (dois usuários reais, um não vê o outro);
#   - os índices únicos parciais impedem ocorrência duplicada e dois cenários ativos;
#   - as constraints de dinheiro e data rejeitam o que devem rejeitar.
#
# O que NÃO verifica: o comportamento real do GoTrue. `supabase/tests/00_shim.sql`
# recria apenas o mínimo de `auth` necessário para as policies funcionarem.
#
# Uso: npm run db:verify

set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-55432}"
PGDATA="${PGDATA:-/var/tmp/appcass-verify-pgdata}"
PGSOCK="${PGSOCK:-/var/tmp}"
PGUSER_RUN="${PGUSER_RUN:-postgres}"
DB=appcass_verify
STAGE=/var/tmp/appcass-verify-sql

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
as_pg "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/server.log -o '-p $PGPORT -k $PGSOCK' -w start" >/dev/null

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

echo "→ Verificando RLS e constraints"
psql_run "-d $DB -v ON_ERROR_STOP=1 -q -f $STAGE/01_rls_proof.sql"

echo "✓ Banco verificado."
