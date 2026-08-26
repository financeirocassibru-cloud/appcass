# Setup

## Passos manuais do dono do projeto

Estes passos **não podem ser feitos por um agente** — dependem de conta, cartão e painel web.
Eles bloqueiam a Fase 1 do [`ROADMAP.md`](./ROADMAP.md).

1. **Criar o projeto no Supabase.** Região `sa-east-1` (São Paulo), para latência menor no
   Brasil. Guardar a senha do banco em local seguro — ela não é recuperável depois.
2. **Desligar o cadastro público.** Authentication → Sign In / Providers → desmarcar
   *Enable new user signups*. É esta opção que torna o app "por convite" de verdade; nenhuma
   policy de RLS substitui isso.
3. **Configurar SMTP próprio.** Authentication → Emails → SMTP Settings. O SMTP padrão do
   Supabase tem limite baixo de envio e não é adequado nem para uso familiar. Serve qualquer
   provedor (Resend, SendGrid, Amazon SES).
4. **Cadastrar as variáveis de ambiente na Vercel**, nos escopos Production e Preview. O
   projeto `appcass` já existe e já faz deploy de preview a cada PR — não precisa ser criado.
5. **Promover a primeira conta a admin.** Depois de criar a própria conta pelo fluxo normal,
   rodar no SQL Editor do Supabase:
   ```sql
   update profiles set role = 'admin' where id = (
     select id from auth.users where email = 'SEU_EMAIL_AQUI'
   );
   ```
   A partir daí, os demais convites saem pela tela `/ajustes/convites`.

## Variáveis de ambiente

| Variável | Escopo | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | Pública; a RLS é que protege os dados |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente e servidor | Pública; idem |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** | Ignora RLS. Só em `lib/supabase/admin.ts`, módulo com `import 'server-only'`. Nunca commitar, nunca prefixar com `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | cliente e servidor | URL canônica, para montar os links de callback do e-mail de convite |

Manter um `.env.example` versionado com as chaves e valores vazios; `.env.local` fica no
`.gitignore`.

No painel do Supabase, em Authentication → URL Configuration, cadastrar a `Site URL` de
produção e adicionar `https://*-appcass.vercel.app/**` em *Redirect URLs*, para que o login
funcione nos previews de PR — os previews deste projeto seguem o padrão
`appcass-git-<branch>-appcass.vercel.app`.

## Comandos

```bash
npx supabase start          # sobe Postgres, Auth e Studio locais via Docker
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
