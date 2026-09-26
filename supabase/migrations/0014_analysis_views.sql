-- Views de agregação da tela de Análise.
--
-- v1.0 — 2026-09-26. As migrations 0001–0013 já rodaram no projeto real e são imutáveis
-- (invariante 16); o que falta vira migration nova.
--
-- `v_category_breakdown` (0007) já responde "mês × categoria × tipo", e serve tanto ao ranking
-- de gastos do período quanto ao "fora da curva". O que não existia é a agregação por
-- **origem** do lançamento, que é a pergunta do comprometimento da renda: quanto do mês já
-- estava preso em conta fixa e parcela antes de a pessoa decidir qualquer coisa.
--
-- `security_invoker = on`, como todas as outras: sem isso a view roda com os privilégios de
-- quem a criou e passa por cima da RLS das tabelas-base — uma pessoa veria o comprometimento
-- da renda de todas as outras.
--
-- Soma liquidado e pendente juntos, de propósito e ao contrário do saldo: a pergunta aqui é
-- "quanto deste mês está comprometido", e uma conta fixa que ainda não venceu está tão
-- comprometida quanto a que já foi paga. É a mesma escolha que `v_monthly_summary` faz, pela
-- mesma razão.

create view public.v_source_breakdown
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  kind,
  source,
  sum(amount_cents) as total_cents,
  count(*) as entry_count
from public.entries
group by user_id, date_trunc('month', occurred_on), kind, source;
