-- Views de agregação para o dashboard.
--
-- Todas com `security_invoker = on`: sem isso a view roda com os privilégios de
-- quem a criou e passa por cima da RLS das tabelas-base — um usuário veria o
-- resumo mensal de todos os outros.

create view public.v_monthly_summary
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  coalesce(sum(amount_cents) filter (where kind = 'income'), 0)  as income_cents,
  coalesce(sum(amount_cents) filter (where kind = 'expense'), 0) as expense_cents,
  coalesce(sum(amount_cents) filter (where kind = 'income'), 0)
    - coalesce(sum(amount_cents) filter (where kind = 'expense'), 0) as net_cents
from public.entries
group by user_id, date_trunc('month', occurred_on);

create view public.v_category_breakdown
with (security_invoker = on) as
select
  e.user_id,
  date_trunc('month', e.occurred_on)::date as month,
  e.category_id,
  c.name  as category_name,
  c.color as category_color,
  e.kind,
  sum(e.amount_cents) as total_cents
from public.entries e
left join public.categories c on c.id = e.category_id
group by e.user_id, date_trunc('month', e.occurred_on), e.category_id, c.name, c.color, e.kind;

-- Progresso da meta derivado da soma dos aportes, nunca de campo mutável.
create view public.v_goal_progress
with (security_invoker = on) as
select
  g.id as goal_id,
  g.user_id,
  g.name,
  g.target_amount_cents,
  g.target_date,
  coalesce(sum(gc.amount_cents), 0) as saved_cents,
  greatest(g.target_amount_cents - coalesce(sum(gc.amount_cents), 0), 0) as remaining_cents,
  least(
    round(coalesce(sum(gc.amount_cents), 0)::numeric * 100 / g.target_amount_cents, 2),
    100
  ) as pct
from public.goals g
left join public.goal_contributions gc on gc.goal_id = g.id
group by g.id, g.user_id, g.name, g.target_amount_cents, g.target_date;

-- Parcelas pagas contadas a partir dos lançamentos liquidados, não de um
-- contador `parcelasPagas` como no app antigo.
create view public.v_installment_progress
with (security_invoker = on) as
select
  p.id as plan_id,
  p.user_id,
  p.description,
  p.total_amount_cents,
  p.installments_count,
  count(e.id) filter (where e.is_settled) as paid_count,
  coalesce(sum(e.amount_cents) filter (where not e.is_settled), 0) as remaining_cents,
  min(e.occurred_on) filter (where not e.is_settled) as next_due_on
from public.installment_plans p
left join public.entries e
  on e.source = 'installment'
 and e.source_id = p.id
 and e.user_id = p.user_id
group by p.id, p.user_id, p.description, p.total_amount_cents, p.installments_count;
