-- Âncora do saldo: "nunca informou" deixa de ser "informou zero". v1.0 — 2026-09-27.
--
-- Até aqui o app deduzia se a pessoa já tinha dito quanto tem olhando para
-- `opening_balance_cents <> 0`. O default da coluna é 0, então quem salvava saldo
-- zerado — a resposta honesta de quem não tem nada na conta — continuava vendo o
-- convite "Você ainda não informou quanto tem" para sempre.
--
-- A distinção precisa de um fato gravado, não de um palpite sobre o valor: a data
-- em que a âncora foi salva pela última vez. Nula = nunca informou.
--
-- As migrations 0001–0014 já rodaram; correção de schema é migration nova, nunca
-- edição das anteriores (invariante 16).

alter table public.profiles
  add column opening_balance_set_at timestamptz null;

-- Quem grava a coluna é o banco, não a aplicação. `before update of` dispara sempre
-- que uma das duas colunas da âncora aparece no SET, mesmo sem mudar de valor — e é
-- isso que se quer: salvar 0 por cima do 0 padrão é informar o saldo.
--
-- Vale por qualquer caminho de escrita (a tela de ajustes e a operação
-- `update_balance_anchor` do assistente passam pela mesma Server Action, mas o
-- trigger não depende disso).
create function public.mark_balance_anchor_set()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.opening_balance_set_at = now();
  return new;
end;
$$;

create trigger mark_balance_anchor_set
  before update of opening_balance_cents, opening_balance_on on public.profiles
  for each row execute function public.mark_balance_anchor_set();

-- Função de trigger não tem uso pela API (padrão da 0008).
revoke execute on function public.mark_balance_anchor_set() from public, anon, authenticated;

-- Invariante 15: a coluna nova fica FORA do `grant update (...)` de `profiles`. Só o
-- trigger a escreve; a aplicação apenas lê.

-- Quem já tinha informado um valor diferente de zero continua configurado. Quem
-- tinha salvado zero antes desta migration não é distinguível de quem nunca salvou;
-- para essas contas o convite some assim que houver lançamentos (regra da tela) ou
-- quando o saldo for salvo de novo.
update public.profiles
   set opening_balance_set_at = updated_at
 where opening_balance_cents <> 0
   and opening_balance_set_at is null;
