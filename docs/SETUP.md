# Setup

## Passos manuais do dono do projeto

Estes passos **não podem ser feitos por um agente** — dependem de conta, cartão e painel web.
Eles bloqueiam a Fase 1 do [`ROADMAP.md`](./ROADMAP.md).

1. **Criar o projeto no Supabase.** Região `sa-east-1` (São Paulo), para latência menor no
   Brasil. Guardar a senha do banco em local seguro — ela não é recuperável depois.
2. **Desligar o cadastro público.** Authentication → Sign In / Providers → desmarcar
   *Enable new user signups*. As contas são criadas pela API de admin, que ignora essa
   chave; desligá-la fecha a porta do cadastro aberto.
3. **Aplicar as migrations.** `npx supabase link --project-ref <ref> && npx supabase db push`.
4. **Cadastrar as variáveis de ambiente na Vercel**, nos escopos Production **e Preview**. O
   projeto `appcass` já existe e já faz deploy de preview a cada PR — não precisa ser criado.
   A `SUPABASE_SERVICE_ROLE_KEY` precisa estar nos dois escopos: o resgate de convite
   depende dela.
5. **Ligar a proteção contra senha vazada.** Authentication → Policies → *Leaked password
   protection*. Compara a senha escolhida contra a base do HaveIBeenPwned. Como a senha é o
   único fator de autenticação, vale o clique.

**SMTP não é necessário.** Nenhum e-mail é enviado: os convites são códigos gerados na tela
de ajustes e repassados por fora. Quando houver recuperação de senha por e-mail, o SMTP volta
para esta lista.

**Promover o primeiro admin por SQL também não é necessário.** Enquanto não existe nenhuma
conta, `/entrar` dispensa o código e cria a primeira já como administrador. A porta fecha
sozinha assim que essa conta existe.

## Variáveis de ambiente

| Variável | Escopo | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | Pública; a RLS é que protege os dados |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente e servidor | Pública; idem. Antes chamada "anon key" |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** | Ignora RLS. Só em `lib/supabase/admin.ts`, módulo com `import 'server-only'`. Necessária em Production **e** Preview, porque o resgate de convite cria a conta por ela. Nunca commitar, nunca prefixar com `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | cliente e servidor | URL canônica do app |

Manter um `.env.example` versionado com as chaves e valores vazios; `.env.local` fica no
`.gitignore`.

No painel do Supabase, em Authentication → URL Configuration, cadastrar a `Site URL` de
produção. Não há *Redirect URLs* a configurar enquanto o login for por senha: elas só passam
a importar quando existir link por e-mail.

## Comandos

```bash
npm run db:verify           # aplica as migrations num Postgres descartável e
                            # prova o isolamento por RLS — não precisa de Docker

npx supabase start          # stack completo local (Postgres, Auth, Studio).
                            # EXIGE Docker; não funciona em container sem daemon
npx supabase db reset       # recria o banco local aplicando migrations + seed
npx supabase db push        # aplica as migrations no projeto remoto

npm run dev
npm run typecheck
npm run lint
npm run test                # Vitest — lib/finance
npm run test:rls            # dois usuários; cada um só enxerga o próprio dado
npm run test:e2e            # Playwright
```

## Nota sobre o código legado

`legacy/google-apps-script/` guarda o código do app antigo (Google Apps Script + planilha)
apenas como **referência de regras de negócio**. Ele não é executado, não é testado e não é
mantido. Consultar para entender uma regra ou reproduzir um bug conhecido; nunca copiar
código de lá. Os problemas estruturais estão catalogados em
[`ARCHITECTURE.md`](./ARCHITECTURE.md#bugs-do-app-antigo-que-motivam-decisões-de-arquitetura).
