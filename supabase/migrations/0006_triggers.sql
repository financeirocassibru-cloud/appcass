-- Triggers.

-- ---------------------------------------------------------------------------
-- updated_at automático.
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'categories',
    'entries',
    'recurring_rules',
    'installment_plans',
    'goals',
    'scenarios'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Novo usuário: cria o perfil e semeia as categorias DELE.
--
-- As nove categorias são as mesmas do app antigo, com a diferença que importa:
-- lá elas viviam numa aba sem coluna de usuário e eram compartilhadas por todo
-- mundo; aqui cada usuário recebe a sua cópia.
--
-- Fechar o convite não acontece aqui: o convite é por código e não conhece o
-- e-mail de quem vai resgatá-lo. Quem marca como aceito é a Server Action de
-- resgate, que já reivindicou o código antes de criar a conta.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  seed_category text;
  seed_order int := 0;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );

  foreach seed_category in array array[
    'Mercado', 'Farmácia', 'Alimentação', 'Transporte',
    'Luz', 'Água', 'Internet', 'Celular', 'Outros'
  ]
  loop
    insert into public.categories (user_id, name, kind, sort_order)
    values (new.id, seed_category, 'expense', seed_order);
    seed_order := seed_order + 1;
  end loop;

  insert into public.categories (user_id, name, kind, sort_order)
  values (new.id, 'Salário', 'income', 0), (new.id, 'Outras receitas', 'income', 1);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
