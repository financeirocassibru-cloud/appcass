-- Fase 7b — Mostrar as etapas do assistente. v1.0 — 2026-09-26.
--
-- Uma coluna só, e ela existe por um pedido de experiência: a folha do assistente
-- passou a ter dois tempos (triagem barata em primeiro plano, proposta pesada em
-- background), e quem quiser acompanhar as etapas do processamento agora pode ligar
-- isso. Desligado por padrão, porque a etapa interessa a quem quer olhar, não a quem
-- só quer registrar um gasto.
--
-- O que a trilha mostra são as etapas do APP — "li sua frase", "buscando suas
-- categorias" — e o texto que o próprio modelo emitir. Não é raciocínio inventado, e
-- por isso a coluna se chama `ai_show_reasoning` mas a tela fala em "etapas".
--
-- As migrations 0001–0012 já rodaram; correção de schema é migration nova, nunca
-- edição das anteriores (invariante 16).

alter table public.profiles
  add column ai_show_reasoning boolean not null default false;

-- Invariante 15: RLS decide a LINHA, GRANT decide a COLUNA — e coluna nova **não
-- herda** concessão nenhuma. Sem esta linha a tela de ajustes gravaria e o Postgres
-- recusaria, exatamente como a 0012 anotou ao acrescentar as outras três.
--
-- A concessão é nominal, uma coluna por vez: `role` e `id` continuam fora, como a 0008
-- deixou depois da escalada em que a policy "edite a própria linha" permitia
-- `update profiles set role='admin' where id = auth.uid()`.
grant update (ai_show_reasoning) on public.profiles to authenticated;
