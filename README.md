# appcass — App de finanças pessoais

Reconstrução de um app de finanças pessoais que rodava como Google Apps Script sobre uma
planilha do Google Sheets. A nova versão é uma aplicação Next.js hospedada na Vercel, com
Postgres, autenticação e RLS no Supabase.

**Estado atual: arquitetura definida, implementação ainda não iniciada.**

## Documentação

| Documento | Para quê |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Contexto, bugs do app antigo, decisões, stack, segurança. **Comece por aqui.** |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Schema SQL completo, RLS, triggers, views, motor de projeção |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Fases de implementação com critérios de aceite |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Navegação, telas, cor, acessibilidade |
| [`docs/SETUP.md`](docs/SETUP.md) | Passos manuais no Supabase e na Vercel, variáveis de ambiente |
| [`legacy/`](legacy/) | Código do app antigo — referência de regra de negócio, não para copiar |

## Funcionalidades previstas

Lançamentos (gastos e rendas) com categorias · custos fixos e rendas recorrentes · compras
parceladas · metas de economia · projeção de saldo dia a dia com cenários hipotéticos ·
PWA instalável, mobile-first · acesso multiusuário por convite.
