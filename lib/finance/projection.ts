import { compareISO, eachDay, isWithin, type ISODate } from './date'
import { expandGoal } from './goals'
import { expandRecurringRule } from './recurrence'
import type {
  DayProjection,
  Entry,
  Occurrence,
  OverrideTarget,
  ProjectRangeOptions,
  ProjectWindowOptions,
  Scenario,
  ScenarioOverride,
} from './types'

/**
 * Os lançamentos que a projeção deve considerar — e só eles.
 *
 * Esta função é o **complemento exato** de `computeBalance()`. As duas dividem
 * os lançamentos em dois grupos que não se sobrepõem:
 *
 * - `computeBalance` soma os **liquidados até hoje**: é o saldo de onde a
 *   projeção parte.
 * - esta soma o que **ainda vai acontecer**: é o que a projeção acrescenta.
 *
 * Se as duas contassem o mesmo lançamento, ele entraria duas vezes no saldo
 * projetado. O caso concreto: um gasto liquidado hoje já está descontado do
 * saldo atual; se a projeção começa hoje e também o vê, o dia de hoje fecha com
 * o valor descontado em dobro.
 *
 * Duas consequências do desenho:
 *
 * - **Pendente atrasado entra**, mesmo vencido antes de hoje. Ele não está no
 *   saldo (não foi liquidado) e não desapareceu por vencer — continua devido.
 *   Quem o coloca no primeiro dia da janela é `rollOverdueTo`, abaixo.
 * - **Liquidado com data futura entra.** É raro, mas acontece: `computeBalance`
 *   só olha até hoje, então esse lançamento ainda não está no saldo.
 */
export function entriesAheadOf(entries: readonly Entry[], today: ISODate): Entry[] {
  return entries.filter((entry) => !(entry.isSettled && entry.occurredOn <= today))
}

/**
 * Traz para `from` o que venceu antes dele.
 *
 * A janela da projeção começa hoje, mas uma conta vencida em março continua
 * devida em setembro. Deixá-la fora da janela faria a projeção parecer melhor
 * do que é — o erro mais perigoso que um app de finanças pode cometer, porque
 * erra para o lado de gastar.
 *
 * Empurrar para o primeiro dia é uma suposição, não um fato, e a tela precisa
 * dizer isso. Mas é a suposição menos enganosa das disponíveis: a alternativa é
 * fingir que a dívida não existe.
 */
export function rollOverdueTo<T extends { occurredOn: ISODate }>(
  items: readonly T[],
  from: ISODate,
): T[] {
  return items.map((item) => (item.occurredOn < from ? { ...item, occurredOn: from } : item))
}

/**
 * Chave de rastreio de uma ocorrência gerada: `source:sourceId:occurrenceKey`.
 *
 * É a mesma tripla do índice `entries_generated_uniq` e a mesma que
 * `expandRecurringRule` põe em `Occurrence.key`. Lançamento manual não tem
 * ocorrência prevista para casar, então não entra no índice.
 */
function generatedKeyOf(entry: Entry): string | null {
  if (entry.source === 'manual' || !entry.sourceId || !entry.occurrenceKey) return null
  return `${entry.source}:${entry.sourceId}:${entry.occurrenceKey}`
}

/**
 * Descarta as ocorrências previstas que já viraram lançamento real.
 *
 * É o passo que impede a contagem em dobro do app antigo: lá o custo fixo
 * marcado como pago continuava aparecendo como previsto, e o mês fechava com o
 * aluguel cobrado duas vezes.
 *
 * Exportada porque a agenda do Início faz exatamente a mesma junção que a
 * projeção faz. Se a construção da chave existisse em duas cópias, elas
 * divergiriam na primeira mudança e o bug voltaria pela porta dos fundos.
 */
export function dedupeAgainstEntries<T extends { key: string }>(
  occurrences: readonly T[],
  entries: readonly Entry[],
): T[] {
  const materialized = new Set<string>()
  for (const entry of entries) {
    const key = generatedKeyOf(entry)
    if (key !== null) materialized.add(key)
  }

  return occurrences.filter((occurrence) => !materialized.has(occurrence.key))
}

/**
 * Projeção de saldo dia a dia.
 *
 * Substitui `calcularFluxoDiario` do app antigo. A diferença estrutural está no
 * passo 3: como os geradores (custos fixos, parcelas, metas) materializam
 * lançamentos reais rastreados por `source`/`sourceId`/`occurrenceKey`, a
 * projeção sabe descartar a ocorrência prevista quando o fato já aconteceu. No
 * app antigo os dois conviviam e o mesmo custo fixo era contado duas vezes
 * depois de marcado como pago.
 *
 * Parcelamentos não são expandidos aqui: as N parcelas já são `entries` desde a
 * criação do plano.
 */
export function projectRange(options: ProjectRangeOptions): DayProjection[] {
  const { from, to, openingBalanceCents, data, scenario } = options
  if (compareISO(from, to) > 0) return []

  // 1. Lançamentos reais no intervalo.
  const realized: Occurrence[] = data.entries
    .filter((entry) => isWithin(entry.occurredOn, from, to))
    .map(entryToOccurrence)

  // 2. Expandir recorrências.
  const projected: Occurrence[] = []
  for (const rule of data.recurringRules) {
    projected.push(...expandRecurringRule(rule, from, to))
  }

  // 4. Metas — aporte mensal derivado do prazo real.
  for (const goal of data.goals) {
    projected.push(...expandGoal(goal, from, to))
  }

  // 3. Descartar o que já virou lançamento real.
  const deduped = dedupeAgainstEntries(projected, data.entries)

  // 5. Aplicar o cenário, se houver.
  const all = scenario
    ? applyScenario([...realized, ...deduped], scenario, from, to)
    : [...realized, ...deduped]

  // 6. Acumular por dia.
  return accumulate(all, from, to, openingBalanceCents)
}

/**
 * Projeção de saldo dia a dia sobre uma janela que pode começar no **passado**.
 *
 * v1.1 — 2026-09-26: nova. Até aqui a projeção só olhava para frente (`from = hoje`), e a
 * Análise precisa de uma curva única em que arrastar para trás mostra o que aconteceu e para
 * frente o que vem.
 *
 * A janela tem duas metades com regras diferentes, e a diferença é o ponto inteiro da função:
 *
 * - **Antes de hoje o dia é fato.** O movimento é a soma dos lançamentos **liquidados** daquele
 *   dia. Pendente não entra: o dinheiro não saiu da conta. Recorrência e meta **não** são
 *   expandidas — inventar previsão sobre um dia que já passou é desenhar um gasto que não
 *   aconteceu.
 * - **De hoje em diante é previsão.** Vale o mesmo que `projectRange`: os pendentes e os
 *   liquidados com data futura (`entriesAheadOf`), as recorrências e metas expandidas e
 *   deduplicadas, e o cenário por cima.
 *
 * `projectRange` continua existindo e não foi tocada. As duas não são a mesma função com um
 * parâmetro a mais: `projectRange` exige que o chamador já tenha rodado `entriesAheadOf` e
 * `rollOverdueTo`, enquanto aqui a partição depende da janela e por isso pertence à função. Um
 * booleano que ligasse e desligasse a prevenção de contagem em dobro teria exatamente a forma
 * do bug que ela previne. `tests/unit/projection-span.test.ts` prova que, com `from = hoje`, as
 * duas devolvem a mesma série — é a rede contra elas divergirem.
 *
 * **A costura.** No dia `today` o saldo tem de fechar no mesmo número que a tela mostra hoje:
 * partindo do saldo do dia anterior a `from`, somar os liquidados até hoje reconstrói
 * exatamente `getCurrentBalance(today)`, e o que se acrescenta em cima é o que ainda vai
 * acontecer hoje. Se as duas metades se sobrepusessem num único lançamento, ele entraria duas
 * vezes — o erro que destruiu o saldo do app antigo.
 *
 * Pura: `today` entra por parâmetro (invariante 9).
 */
export function projectWindow(options: ProjectWindowOptions): DayProjection[] {
  const { from, to, today, openingBalanceCents, data, scenario } = options
  if (compareISO(from, to) > 0) return []

  // Onde o fato termina e a previsão começa, dentro desta janela.
  const pastTo = compareISO(to, today) < 0 ? to : today
  const futureFrom = compareISO(from, today) > 0 ? from : today
  const hasFuture = compareISO(to, today) >= 0

  // 1. O passado: o lado "já aconteceu" da partição, recortado pela janela.
  const history: Occurrence[] = data.entries
    .filter((entry) => entry.isSettled && entry.occurredOn <= today)
    .filter((entry) => isWithin(entry.occurredOn, from, pastTo))
    .map(entryToOccurrence)

  // 2. O futuro. Sem nenhum dia a partir de hoje dentro da janela não há o que projetar — e,
  //    principalmente, não há onde somar uma conta vencida: empurrá-la para um dia do passado
  //    fabricaria história que contradiz os liquidados daquele mesmo dia. Ela sai da série, e
  //    quem avisa é a tela, com o total que a camada de query devolve.
  const ahead: Occurrence[] = hasFuture
    ? rollOverdueTo(entriesAheadOf(data.entries, today), futureFrom)
        .filter((entry) => isWithin(entry.occurredOn, futureFrom, to))
        .map(entryToOccurrence)
    : []

  // 3. Recorrências e metas, expandidas de `futureFrom` — nunca de `from`.
  //
  //    Não é simetria: é correção. `expandGoal` divide o que falta pelos meses **da janela**,
  //    então um `from` no passado espalha o aporte por meses que já passaram e o aporte futuro
  //    sai menor — sem erro, sem aviso. E `expandRecurringRule` com `from` no passado
  //    ressuscita a conta fixa do mês passado que nunca virou lançamento, porque não há
  //    lançamento real para `dedupeAgainstEntries` casar com ela.
  const projected: Occurrence[] = []
  if (hasFuture) {
    for (const rule of data.recurringRules) {
      projected.push(...expandRecurringRule(rule, futureFrom, to))
    }
    for (const goal of data.goals) {
      projected.push(...expandGoal(goal, futureFrom, to))
    }
  }
  const deduped = dedupeAgainstEntries(projected, data.entries)

  // 4. O cenário alcança só a previsão. Um `dateOverride` poderia mover uma ocorrência para
  //    trás e um item hipotético poderia ser datado no passado; hipótese não é fato.
  const future = scenario
    ? applyScenario([...ahead, ...deduped], scenario, futureFrom, to)
    : [...ahead, ...deduped]

  return accumulate([...history, ...future], from, to, openingBalanceCents)
}

function entryToOccurrence(entry: Entry): Occurrence {
  const key =
    entry.source === 'manual' || !entry.sourceId || !entry.occurrenceKey
      ? `entry:${entry.id}`
      : `${entry.source}:${entry.sourceId}:${entry.occurrenceKey}`

  return {
    key,
    date: entry.occurredOn,
    kind: entry.kind,
    amountCents: entry.amountCents,
    description: entry.description,
    origin: 'entry',
    sourceId: entry.sourceId,
    categoryId: entry.categoryId,
    isRealized: true,
    isSettled: entry.isSettled,
  }
}

/**
 * O alvo de override de uma ocorrência: como o cenário se refere a ela.
 *
 * **Exportada de propósito.** A tela grava o override e o motor o lê de volta;
 * se as duas montassem o alvo por conta própria, divergiriam na primeira
 * mudança e o override deixaria de casar — silenciosamente, porque um override
 * que não casa simplesmente não faz nada. A pessoa clicaria em "excluir este
 * gasto do cenário" e veria o gasto continuar ali.
 *
 * Então existe uma função só, e os dois lados a chamam.
 *
 * Um detalhe que parece estranho e é deliberado: uma ocorrência **já
 * materializada** de conta fixa tem `origin: 'entry'` (é uma linha de
 * `entries`), mas seu `targetId` é o id da **regra**, não o da linha. É o que
 * mantém o override válido para aquela ocorrência quer ela já tenha virado
 * lançamento ou não — que é como a pessoa pensa sobre "o aluguel de junho".
 */
export interface OverrideTargetRef {
  targetType: OverrideTarget
  targetId: string
  /** `null` quando o override vale para todas as ocorrências do alvo. */
  occurrenceKey: string | null
}

export function overrideTargetOf(occurrence: Occurrence): OverrideTargetRef {
  const parts = occurrence.key.split(':')
  const occurrenceKey = parts.length >= 3 ? (parts[2] ?? null) : null

  const targetType: OverrideTarget =
    occurrence.origin === 'recurring'
      ? 'recurring_rule'
      : occurrence.origin === 'goal'
        ? 'goal'
        : 'entry'

  const targetId =
    occurrence.origin === 'entry' && occurrence.key.startsWith('entry:')
      ? occurrence.key.slice('entry:'.length)
      : (occurrence.sourceId ?? '')

  return { targetType, targetId, occurrenceKey }
}

function findOverride(
  overrides: readonly ScenarioOverride[],
  occurrence: Occurrence,
): ScenarioOverride | undefined {
  const { targetType, targetId, occurrenceKey: key } = overrideTargetOf(occurrence)

  // Override de uma ocorrência específica vence o que vale para todas.
  return (
    overrides.find(
      (o) => o.targetType === targetType && o.targetId === targetId && o.occurrenceKey === key,
    ) ??
    overrides.find(
      (o) => o.targetType === targetType && o.targetId === targetId && o.occurrenceKey === null,
    )
  )
}

/**
 * Aplica os desvios do cenário sobre as ocorrências reais.
 *
 * Nada é escrito de volta: o cenário só altera o que a projeção mostra. É o que
 * impede o vazamento que o `syncPlanToGlobal` do app antigo causava, onde
 * editar um valor dentro do planejamento sobrescrevia o lançamento real.
 */
function applyScenario(
  occurrences: readonly Occurrence[],
  scenario: Scenario,
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  const result: Occurrence[] = []

  for (const occurrence of occurrences) {
    const override = findOverride(scenario.overrides, occurrence)

    if (override && !override.isIncluded) continue

    if (override) {
      const date = override.dateOverride ?? occurrence.date
      if (!isWithin(date, from, to)) continue
      result.push({
        ...occurrence,
        date,
        amountCents: override.amountCentsOverride ?? occurrence.amountCents,
      })
      continue
    }

    result.push(occurrence)
  }

  for (const extra of scenario.entries) {
    if (!isWithin(extra.occursOn, from, to)) continue
    result.push({
      key: `scenario:${extra.id}`,
      date: extra.occursOn,
      kind: extra.kind,
      amountCents: extra.amountCents,
      description: extra.description,
      origin: 'scenario',
      sourceId: extra.id,
      categoryId: extra.categoryId,
      isRealized: false,
      isSettled: false,
    })
  }

  return result
}

function accumulate(
  occurrences: readonly Occurrence[],
  from: ISODate,
  to: ISODate,
  openingBalanceCents: number,
): DayProjection[] {
  const byDate = new Map<ISODate, Occurrence[]>()
  for (const occurrence of occurrences) {
    const bucket = byDate.get(occurrence.date)
    if (bucket) bucket.push(occurrence)
    else byDate.set(occurrence.date, [occurrence])
  }

  let balance = openingBalanceCents

  // Todos os dias do intervalo, inclusive os sem movimento — o gráfico de saldo
  // precisa de uma série contínua.
  return eachDay(from, to).map((date) => {
    const dayOccurrences = (byDate.get(date) ?? []).sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    )

    let inflowCents = 0
    let outflowCents = 0
    for (const occurrence of dayOccurrences) {
      if (occurrence.kind === 'income') inflowCents += occurrence.amountCents
      else outflowCents += occurrence.amountCents
    }

    balance = balance + inflowCents - outflowCents

    return { date, occurrences: dayOccurrences, inflowCents, outflowCents, balanceCents: balance }
  })
}

/** Primeiro dia em que o saldo projetado fica negativo, se houver. */
export function firstNegativeDay(projection: readonly DayProjection[]): DayProjection | null {
  return projection.find((day) => day.balanceCents < 0) ?? null
}
