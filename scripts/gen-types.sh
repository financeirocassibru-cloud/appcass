#!/usr/bin/env bash
#
# Gera lib/db/types.generated.ts a partir do schema das migrations.
#
# Roda contra o Postgres descartável que scripts/with-pg.sh sobe, e não contra o
# projeto remoto: assim qualquer pessoa regera os tipos offline, sem credencial,
# e o resultado é função apenas do que está commitado em supabase/migrations/.
#
# Uso indireto:  npm run db:types

set -euo pipefail

: "${DATABASE_URL:?rode via scripts/with-pg.sh}"

OUT=lib/db/types.generated.ts
mkdir -p "$(dirname "$OUT")"

echo "→ Gerando tipos do schema"

# O CLI devolve o erro como JSON no stdout e ainda sai com status 0, então não
# dá para confiar só no código de saída: se a saída não tem `export type
# Database`, algo falhou e gravar o arquivo esconderia o problema.
TYPES=$(npx --no-install supabase gen types typescript --db-url "$DATABASE_URL")

if ! grep -q "export type Database" <<< "$TYPES"; then
  echo "✗ A geração falhou. Saída do CLI:" >&2
  echo "$TYPES" >&2
  exit 1
fi

{
  echo "// GERADO AUTOMATICAMENTE — não edite à mão."
  echo "//"
  echo "// Reproduza com \`npm run db:types\`, que aplica supabase/migrations/ num"
  echo "// Postgres descartável e lê o schema resultante. Se este arquivo divergir"
  echo "// do banco remoto, a causa é uma migration não aplicada lá — não edite"
  echo "// este arquivo para \"consertar\"."
  echo ""
  echo "$TYPES"
} > "$OUT"

# O CLI avisa que a saída vem sem formatação. Formatar torna o diff do arquivo
# gerado legível numa revisão de PR, e mantém o resultado estável entre geradas.
if npx --no-install oxfmt "$OUT" >/dev/null 2>&1; then
  echo "  formatado com oxfmt"
else
  echo "  aviso: oxfmt indisponível; o arquivo fica sem formatação" >&2
fi

echo "✓ $OUT ($(grep -c '' "$OUT") linhas)"
