# Instruções para agentes neste repositório

Antes de escrever qualquer código, leia [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e
[`docs/ROADMAP.md`](docs/ROADMAP.md). Implemente na ordem das fases do roadmap — cada fase é
um PR fechado, com testes verdes.

## Invariantes — não quebre nenhuma destas

Cada uma existe porque o app antigo errou exatamente ali. O catálogo dos bugs está em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

1. **Dinheiro é `bigint` de centavos.** Nunca `float`, nunca `numeric`, nunca
   `parseFloat(valor)`. Rateio (parcelas, aporte de meta) sempre via `splitCents()`, que
   garante que a soma das partes bate com o total.
2. **Data de competência é `date` puro** (`YYYY-MM-DD`), sem hora e sem timezone. É **proibido**
   `new Date("2026-03-05")` para cálculo de calendário — isso interpreta como UTC e desloca o
   dia em fuso negativo. Também é proibido `.toISOString().split('T')[0]` para extrair a data
   de um `Date` local. "Hoje" vem de `todayISO()`, fixado em `America/Sao_Paulo`.
3. **Autorização é do banco, não do código.** Toda tabela tem RLS habilitada e `user_id`.
   Nunca filtre por usuário só na query da aplicação. Policies usam `(select auth.uid())`,
   não `auth.uid()` solto.
4. **`SUPABASE_SERVICE_ROLE_KEY` só em `lib/supabase/admin.ts`**, com `import 'server-only'`
   no topo. Nunca em Client Component, nunca com prefixo `NEXT_PUBLIC_`.
5. **Mutação passa por Server Action.** Valide com Zod, execute, chame `revalidatePath`.
   Nada de chamada Supabase de escrita a partir de Client Component.
6. **Nenhuma tabela duplica dado de outra.** Cenários guardam apenas o delta
   (`scenario_overrides`), nunca uma cópia dos lançamentos. Foi a cópia em `dadosJSON` que
   destruiu a consistência do app antigo.
7. **Estado derivado é derivado.** Progresso de meta é `SUM(goal_contributions)`; parcelas
   pagas é `COUNT` de `entries` liquidadas. Não crie contadores mutáveis para isso.
8. **Ocorrência gerada é idempotente.** Materializar um custo fixo ou parcela usa upsert
   sobre `entries_generated_uniq (user_id, source, source_id, occurrence_key)`. Marcar como
   pago duas vezes não pode criar dois lançamentos.
9. **`lib/finance/` é puro.** Sem I/O, sem import de Supabase, sem `Date.now()` implícito —
   a data de referência entra por parâmetro. É o código que mais precisa de teste unitário.
10. **Identificadores em inglês, interface em português.** `entries`, `amount_cents`,
    `occurred_on` no código e no banco; "Lançamentos", "Valor", "Data" na tela. Sem acento em
    nome de tabela, coluna, variável ou arquivo.

## Convenções

- TypeScript strict. Sem `any` — se o tipo é desconhecido, use `unknown` e refine.
- Não copie código de `legacy/`. Consulte para entender a regra, reimplemente conforme os
  documentos em `docs/`.
- Antes de escrever qualquer gráfico, consulte a skill `dataviz`.

## Verificação antes de abrir PR

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Os oito cenários manuais que precisam passar estão no fim de
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#verificação) — cada um reproduz um bug real do
app antigo.
