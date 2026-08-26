# Código legado — referência apenas

Esta pasta guarda o app anterior, que rodava como Google Apps Script sobre uma planilha do
Google Sheets. Ele **não é executado, não é testado e não é mantido**.

| Arquivo | O que é |
|---|---|
| `google-apps-script/Code.gs.md` | Backend (`Code.gs`): 9 abas de planilha como banco, auth própria, CRUD, e o cálculo de fluxo diário (`calcularFluxoDiario`) |
| `google-apps-script/Index.html.md` | Frontend inteiro num único `Index.html`: HTML + CSS + ~90 funções JS globais |

**Use para** entender uma regra de negócio original ou reproduzir um bug conhecido.
**Não copie código daqui.** Os problemas estruturais que motivaram a reescrita estão
catalogados em [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

A extensão `.md` é herança de como os arquivos foram salvos originalmente; o conteúdo é
JavaScript e HTML, não markdown.
