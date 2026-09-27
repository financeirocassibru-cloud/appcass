-- Fase 13 — cartões e empréstimos: os tipos.
--
-- v1.0 — 2026-09-27. As migrations 0001–0019 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova.
--
-- Arquivo próprio, separado da 0021, por uma regra do Postgres: um valor acrescentado a um
-- enum com `alter type ... add value` não pode ser USADO na mesma transação em que nasceu
-- (55P04, "unsafe use of new value"). O aplicador de migrations do Supabase roda cada arquivo
-- numa transação, e a 0021 usa `credit_bill` em check, view e função. Com os dois no mesmo
-- arquivo, a migration passaria no `db:verify` (psql, sem transação única) e quebraria em
-- produção.

-- Cartão de crédito ou empréstimo: o de onde o dinheiro veio, quando não veio do saldo.
create type public.credit_account_kind as enum ('card', 'loan');

-- `credit_bill`: o pagamento da fatura do cartão (ou da parcela do empréstimo). É o único
-- lançamento que tira do saldo o que foi gasto no cartão. `source_id` = a conta,
-- `occurrence_key` = o vencimento pago.
alter type public.entry_source add value if not exists 'credit_bill';

-- `credit_carry`: o parcelamento do restante de uma fatura. Uma dívida nova, cobrada nas
-- faturas seguintes; `occurrence_key` = o vencimento de origem.
alter type public.entry_source add value if not exists 'credit_carry';
