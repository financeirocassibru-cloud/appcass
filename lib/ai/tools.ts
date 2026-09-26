/**
 * A superfície de ação da IA. v1.0 — 2026-09-26.
 *
 * Módulo **puro**: só dados. Cada entrada aqui espelha uma Server Action que já
 * existe em `lib/actions/`, e nada mais — a IA não ganha um caminho próprio de
 * escrita, ganha um vocabulário para pedir o que a tela já sabe fazer.
 *
 * Três regras estão codificadas nas descrições porque o modelo não tem como
 * adivinhá-las, e errá-las produz dado errado em vez de erro:
 *
 *  1. **Dinheiro é centavo inteiro** (invariante 1). "R$ 87,50" é `8750`.
 *     Mandar `87.5` criaria um lançamento de oitenta e sete centavos.
 *  2. **Data é `YYYY-MM-DD`** (invariante 2). "Hoje" chega pronto no contexto,
 *     resolvido em `America/Sao_Paulo`; o modelo nunca calcula a data de hoje.
 *  3. **Todo `id` vem do contexto.** O modelo não inventa UUID; se o alvo não
 *     está na lista que recebeu, ele pergunta em vez de chutar.
 *
 * Os nomes são em inglês (invariante 10) e batem com o nome da action, para que
 * a correspondência em `proposal.ts` seja óbvia na leitura.
 */

/** Parâmetro no subconjunto de JSON Schema que a API aceita. */
export interface ToolParameterSchema {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: readonly string[]
  items?: ToolParameterSchema
}

export interface ToolDeclaration {
  type: 'function'
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameterSchema>
    required: readonly string[]
  }
}

const CENTS: ToolParameterSchema = {
  type: 'integer',
  description:
    'Valor em CENTAVOS inteiros, sempre positivo. R$ 87,50 é 8750; R$ 2.400,00 é 240000. Nunca use decimal.',
}

const DATE: ToolParameterSchema = {
  type: 'string',
  description: 'Data no formato YYYY-MM-DD. Use a data de hoje que veio no contexto como referência.',
}

const KIND: ToolParameterSchema = {
  type: 'string',
  enum: ['expense', 'income'],
  description: 'expense para saída de dinheiro, income para entrada.',
}

const CATEGORY: ToolParameterSchema = {
  type: 'string',
  description:
    'id de uma categoria da lista do contexto. Omita se nenhuma servir — não invente id. Para categoria que ainda não existe, chame create_category antes e use category_name aqui.',
}

const CATEGORY_NAME: ToolParameterSchema = {
  type: 'string',
  description:
    'Nome de uma categoria criada por create_category nesta mesma resposta. Use apenas quando a categoria ainda não existia; caso contrário use category_id.',
}

const ID = (what: string): ToolParameterSchema => ({
  type: 'string',
  description: `id de ${what}, exatamente como veio no contexto.`,
})

function tool(
  name: string,
  description: string,
  properties: Record<string, ToolParameterSchema>,
  required: readonly string[],
): ToolDeclaration {
  return { type: 'function', name, description, parameters: { type: 'object', properties, required } }
}

/**
 * Tudo que a IA pode propor — criar, alterar e excluir.
 *
 * Proposta, não execução: nada daqui roda antes de a pessoa confirmar na tela.
 */
export const TOOLS: readonly ToolDeclaration[] = [
  // --- Lançamentos --------------------------------------------------------
  tool(
    'create_entry',
    'Registra um gasto ou uma receita avulsa. É a operação mais comum: use para qualquer coisa que já aconteceu ou tem data única.',
    {
      kind: KIND,
      amount_cents: CENTS,
      occurred_on: DATE,
      description: { type: 'string', description: 'Descrição curta, até 120 caracteres. Ex.: "Mercado".' },
      category_id: CATEGORY,
      category_name: CATEGORY_NAME,
      notes: { type: 'string', description: 'Observação livre, opcional.' },
      is_settled: {
        type: 'boolean',
        description:
          'true se o dinheiro JÁ saiu ou entrou (pago/recebido). false se é uma conta a pagar ou a receber no futuro.',
      },
    },
    ['kind', 'amount_cents', 'occurred_on', 'description', 'is_settled'],
  ),
  tool(
    'update_entry',
    'Altera um lançamento existente. Mande TODOS os campos, inclusive os que não mudaram — o que vier é o que fica gravado.',
    {
      id: ID('um lançamento'),
      kind: KIND,
      amount_cents: CENTS,
      occurred_on: DATE,
      description: { type: 'string', description: 'Descrição curta.' },
      category_id: CATEGORY,
      notes: { type: 'string', description: 'Observação livre, opcional.' },
      is_settled: { type: 'boolean', description: 'Se já foi pago ou recebido.' },
    },
    ['id', 'kind', 'amount_cents', 'occurred_on', 'description', 'is_settled'],
  ),
  tool('delete_entry', 'Apaga um lançamento em definitivo.', { id: ID('um lançamento') }, ['id']),
  tool(
    'settle_entry',
    'Marca um lançamento pendente como pago/recebido, ou desmarca. A data de liquidação sai da data do próprio lançamento.',
    { id: ID('um lançamento'), is_settled: { type: 'boolean', description: 'true marca como pago, false volta a pendente.' } },
    ['id', 'is_settled'],
  ),

  // --- Contas fixas e receitas recorrentes --------------------------------
  tool(
    'create_recurring',
    'Cria uma conta fixa ou receita recorrente — algo que se repete todo mês, toda semana ou todo ano. Ex.: "aluguel de 2.400 todo dia 10", "salário todo dia 5". NÃO use para uma compra única.',
    {
      kind: KIND,
      description: { type: 'string', description: 'Descrição curta, até 120 caracteres.' },
      amount_cents: CENTS,
      category_id: CATEGORY,
      category_name: CATEGORY_NAME,
      frequency: { type: 'string', enum: ['monthly', 'weekly', 'yearly'], description: 'Periodicidade.' },
      day_of_month: {
        type: 'integer',
        description:
          'Dia do vencimento, 1 a 31. SÓ para frequency="monthly" — em semanal ou anual, omita: o vencimento sai de starts_on.',
      },
      starts_on: DATE,
      ends_on: { type: 'string', description: 'Data do último vencimento, YYYY-MM-DD. Omita se não tem fim previsto.' },
    },
    ['kind', 'description', 'amount_cents', 'frequency', 'starts_on'],
  ),
  tool(
    'update_recurring',
    'Altera uma conta fixa. Mande todos os campos, inclusive os que não mudaram.',
    {
      id: ID('uma conta fixa'),
      kind: KIND,
      description: { type: 'string', description: 'Descrição curta.' },
      amount_cents: CENTS,
      category_id: CATEGORY,
      frequency: { type: 'string', enum: ['monthly', 'weekly', 'yearly'], description: 'Periodicidade.' },
      day_of_month: { type: 'integer', description: 'Dia do vencimento, 1 a 31, só para mensal.' },
      starts_on: DATE,
      ends_on: { type: 'string', description: 'Data do último vencimento, ou omita.' },
    },
    ['id', 'kind', 'description', 'amount_cents', 'frequency', 'starts_on'],
  ),
  tool(
    'toggle_recurring_active',
    'Liga ou desliga uma conta fixa sem apagá-la. Desligada, ela para de aparecer na projeção mas o histórico fica.',
    { id: ID('uma conta fixa'), is_active: { type: 'boolean', description: 'true reativa, false pausa.' } },
    ['id', 'is_active'],
  ),
  tool('delete_recurring', 'Apaga uma conta fixa em definitivo.', { id: ID('uma conta fixa') }, ['id']),
  tool(
    'materialize_recurring',
    'Marca uma ocorrência específica de conta fixa como paga, criando o lançamento correspondente. Ex.: "paguei o aluguel deste mês".',
    { rule_id: ID('uma conta fixa'), occurs_on: DATE },
    ['rule_id', 'occurs_on'],
  ),

  // --- Parcelamentos ------------------------------------------------------
  tool(
    'create_installment_plan',
    'Cria uma compra parcelada. Use no mínimo 2 parcelas — para "em 1x", use create_entry. O valor é o TOTAL da compra, não o da parcela: "3x de 100" é total_amount_cents=30000.',
    {
      description: { type: 'string', description: 'Descrição curta, até 100 caracteres.' },
      total_amount_cents: { type: 'integer', description: 'Valor TOTAL da compra, em centavos. "3x de R$ 100" é 30000.' },
      installments_count: { type: 'integer', description: 'Número de parcelas, de 2 a 360.' },
      first_due_on: DATE,
      category_id: CATEGORY,
      category_name: CATEGORY_NAME,
    },
    ['description', 'total_amount_cents', 'installments_count', 'first_due_on'],
  ),
  tool(
    'delete_installment_plan',
    'Apaga um parcelamento. As parcelas já pagas continuam no extrato; só as pendentes somem.',
    { id: ID('um parcelamento') },
    ['id'],
  ),

  // --- Metas --------------------------------------------------------------
  tool(
    'create_goal',
    'Cria uma meta de poupança. Ex.: "quero juntar 10 mil até dezembro".',
    {
      name: { type: 'string', description: 'Nome da meta, até 60 caracteres.' },
      target_amount_cents: CENTS,
      target_date: { type: 'string', description: 'Data-objetivo, YYYY-MM-DD. Omita se não há prazo.' },
      monthly_contribution_cents: {
        type: 'integer',
        description: 'Aporte mensal em centavos. Omita para o app calcular a partir do prazo.',
      },
    },
    ['name', 'target_amount_cents'],
  ),
  tool(
    'update_goal',
    'Altera uma meta. Mande todos os campos, inclusive os que não mudaram.',
    {
      id: ID('uma meta'),
      name: { type: 'string', description: 'Nome da meta.' },
      target_amount_cents: CENTS,
      target_date: { type: 'string', description: 'Data-objetivo, ou omita.' },
      monthly_contribution_cents: { type: 'integer', description: 'Aporte mensal em centavos, ou omita.' },
    },
    ['id', 'name', 'target_amount_cents'],
  ),
  tool(
    'archive_goal',
    'Arquiva uma meta concluída ou abandonada, ou a restaura. Preserva o histórico de aportes.',
    { id: ID('uma meta'), archive: { type: 'boolean', description: 'true arquiva, false restaura.' } },
    ['id', 'archive'],
  ),
  tool('delete_goal', 'Apaga uma meta e todos os aportes dela em definitivo.', { id: ID('uma meta') }, ['id']),
  tool(
    'create_contribution',
    'Registra um aporte numa meta, ou uma retirada. Ex.: "guardei 500 na viagem", "tirei 200 da reserva".',
    {
      goal_id: ID('uma meta'),
      amount_cents: CENTS,
      is_withdrawal: { type: 'boolean', description: 'false para guardar dinheiro, true para tirar.' },
      occurred_on: DATE,
      note: { type: 'string', description: 'Observação livre, opcional.' },
    },
    ['goal_id', 'amount_cents', 'is_withdrawal', 'occurred_on'],
  ),
  tool('delete_contribution', 'Apaga um aporte de meta.', { id: ID('um aporte') }, ['id']),

  // --- Categorias ---------------------------------------------------------
  tool(
    'create_category',
    'Cria uma categoria nova. Use só quando nenhuma das existentes serve. Chame ANTES das operações que vão usá-la, e nelas informe category_name com este mesmo nome.',
    {
      name: { type: 'string', description: 'Nome da categoria, até 40 caracteres.' },
      kind: KIND,
      color: { type: 'string', description: 'Cor em hexadecimal, ex. "#7c3aed". Omita para a cor padrão.' },
    },
    ['name', 'kind'],
  ),
  tool('rename_category', 'Renomeia uma categoria.', { id: ID('uma categoria'), name: { type: 'string', description: 'Novo nome.' } }, ['id', 'name']),
  tool(
    'archive_category',
    'Arquiva uma categoria para ela sumir das listas, ou a restaura. Os lançamentos dela continuam existindo.',
    { id: ID('uma categoria'), archive: { type: 'boolean', description: 'true arquiva, false restaura.' } },
    ['id', 'archive'],
  ),

  // --- Cenários de projeção ----------------------------------------------
  tool(
    'create_scenario',
    'Cria um cenário de projeção — uma simulação "e se", que não altera nenhum dado real.',
    {
      name: { type: 'string', description: 'Nome do cenário, até 60 caracteres.' },
      starts_on: DATE,
      ends_on: DATE,
    },
    ['name', 'starts_on', 'ends_on'],
  ),
  tool('rename_scenario', 'Renomeia um cenário.', { id: ID('um cenário'), name: { type: 'string', description: 'Novo nome.' } }, ['id', 'name']),
  tool('delete_scenario', 'Apaga um cenário e as simulações dele. Nenhum dado real é tocado.', { id: ID('um cenário') }, ['id']),
  tool('activate_scenario', 'Torna um cenário o ativo. Só um fica ativo por vez.', { id: ID('um cenário') }, ['id']),
  tool(
    'create_scenario_entry',
    'Adiciona um item hipotético a um cenário — dinheiro que entraria ou sairia só na simulação.',
    {
      scenario_id: ID('um cenário'),
      kind: KIND,
      description: { type: 'string', description: 'Descrição curta.' },
      amount_cents: CENTS,
      occurs_on: DATE,
    },
    ['scenario_id', 'kind', 'description', 'amount_cents', 'occurs_on'],
  ),
  tool('delete_scenario_entry', 'Remove um item hipotético de um cenário.', { id: ID('um item de cenário') }, ['id']),

  // --- Âncora do saldo ----------------------------------------------------
  tool(
    'update_balance_anchor',
    'Informa quanto a pessoa tem HOJE. É a partir daqui que todo saldo e toda projeção são calculados. Use quando ela disser quanto tem na conta.',
    {
      opening_balance_cents: { type: 'integer', description: 'Quanto tem, em centavos, sempre POSITIVO. O sinal vai em is_negative.' },
      opening_balance_on: DATE,
      is_negative: { type: 'boolean', description: 'true se o saldo está negativo (conta no vermelho).' },
    },
    ['opening_balance_cents', 'opening_balance_on', 'is_negative'],
  ),
]

/** Os nomes das ferramentas, para o teste cruzar com as variantes da proposta. */
export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name)
