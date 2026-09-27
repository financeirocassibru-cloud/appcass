import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Toda escrita do supabase-js precisa de filtro.
 *
 * Este teste existe por causa de um bug que chegou em produção: a tela de
 * ajustar saldo gravava com
 *
 *     supabase.from('profiles').update({ ... }).select('id')
 *
 * sem `.eq()`, e falhava com **"UPDATE requires a WHERE clause"**. O PostgREST
 * recusa UPDATE e DELETE sem filtro — é a proteção dele contra o comando que
 * atualiza a tabela inteira — e essa recusa acontece **antes** da RLS.
 *
 * O erro veio de ler o invariante 3 do CLAUDE.md ("autorização é do banco, não
 * do código") como "não filtre nada na aplicação". As duas coisas convivem: a
 * RLS é quem **autoriza**, e o filtro é o que faz o pedido ser **aceito**.
 *
 * O teste é uma varredura de texto, não uma análise de tipos — grosseira de
 * propósito, porque o que ela precisa pegar é a ausência de uma chamada num
 * encadeamento curto, e isso é visível no texto.
 */

const ACTIONS_DIR = join(process.cwd(), 'lib', 'actions')

/** Métodos do PostgREST que satisfazem a exigência de cláusula WHERE. */
const FILTROS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'match',
  'filter',
  'not',
  'or',
]

const FILTRO_RE = new RegExp(`\\.(${FILTROS.join('|')})\\(`)

interface Escrita {
  arquivo: string
  linha: number
  metodo: string
  temFiltro: boolean
}

/**
 * Cada `.update(` / `.delete(` e o encadeamento que o segue.
 *
 * O corte é a primeira linha em branco depois da chamada: no estilo deste
 * projeto, o encadeamento inteiro fica num `const { data, error } = await ...`
 * seguido de linha vazia.
 */
function escritasDe(arquivo: string): Escrita[] {
  const conteudo = readFileSync(join(ACTIONS_DIR, arquivo), 'utf8')
  const encontradas: Escrita[] = []

  const re = /\.(update|delete)\(/g
  let match: RegExpExecArray | null

  while ((match = re.exec(conteudo)) !== null) {
    const restante = conteudo.slice(match.index)
    const fim = restante.indexOf('\n\n')
    const cadeia = fim > 0 ? restante.slice(0, fim) : restante

    encontradas.push({
      arquivo,
      linha: conteudo.slice(0, match.index).split('\n').length,
      metodo: match[1] ?? '',
      temFiltro: FILTRO_RE.test(cadeia),
    })
  }

  return encontradas
}

const arquivos = readdirSync(ACTIONS_DIR).filter((nome) => nome.endsWith('.ts'))

describe('escritas do supabase-js têm cláusula WHERE', () => {
  it('encontra os arquivos de action', () => {
    // Se a pasta mudar de lugar, o teste passaria vazio e não protegeria nada.
    expect(arquivos.length).toBeGreaterThan(5)
  })

  it('nenhum update ou delete sem filtro', () => {
    const todas = arquivos.flatMap(escritasDe)

    // Também protege contra a varredura silenciosamente parar de achar escritas.
    expect(todas.length).toBeGreaterThan(10)

    const semFiltro = todas.filter((e) => !e.temFiltro)
    const descricao = semFiltro.map((e) => `lib/actions/${e.arquivo}:${e.linha} .${e.metodo}()`)

    expect(descricao).toEqual([])
  })
})

/**
 * v1.1 — 2026-09-27: o invariante 17, nas actions que a interface passou a alcançar.
 *
 * `updateEntry`, `deleteEntry` e `toggleSettled` existiam desde a fase 3 **sem nenhuma tela que
 * as chamasse**. Com o Histórico editando e a Análise lançando de dentro do gráfico, elas viraram
 * o caminho normal — e é aí que o silêncio do supabase-js passa a custar: um `update` que não casa
 * nenhuma linha devolve **sucesso**, com `data` vazio. Foi esse silêncio que deixou a primeira
 * conta sem virar admin em produção, sem nenhum erro aparecer.
 *
 * O teste não tenta cobrir toda `lib/actions/`: três escritas de lá são best-effort de propósito
 * (`auth.ts` gravando `accepted_by`, `releaseInvite`, e o `delete` de override que varre por
 * alvo), e uma varredura cega exigiria uma lista de exceções que envelheceria sozinha. Aqui a
 * afirmação é estreita e verdadeira: estas três precisam conferir o resultado.
 */
describe('escritas de lançamento conferem o resultado (invariante 17)', () => {
  const conteudo = readFileSync(join(ACTIONS_DIR, 'entries.ts'), 'utf8')

  /** O corpo de uma action exportada, até a próxima declaração no topo do arquivo. */
  function corpoDe(nome: string): string {
    const inicio = conteudo.indexOf(`export async function ${nome}(`)
    expect(inicio, `${nome} deveria existir em lib/actions/entries.ts`).toBeGreaterThan(-1)
    const depois = conteudo.indexOf('\nexport ', inicio + 1)
    return depois > 0 ? conteudo.slice(inicio, depois) : conteudo.slice(inicio)
  }

  for (const nome of ['updateEntry', 'deleteEntry', 'toggleSettled']) {
    it(`${nome} pede o resultado de volta e recusa o caso de zero linhas`, () => {
      const corpo = corpoDe(nome)

      // `.select()` é o que faz o PostgREST devolver as linhas afetadas.
      expect(corpo, `${nome} sem .select() não tem como saber se casou alguma linha`).toMatch(
        /\.select\(/,
      )
      // E a conferência: sem ela o `.select()` não serve para nada.
      expect(corpo, `${nome} não confere se o resultado veio vazio`).toMatch(
        /length === 0|length !== 1|!data\b/,
      )
    })
  }

  it('as três continuam filtrando por id', () => {
    for (const nome of ['updateEntry', 'deleteEntry', 'toggleSettled']) {
      expect(corpoDe(nome), `${nome} sem .eq('id', ...)`).toMatch(/\.eq\('id'/)
    }
  })
  // v1.2 — 2026-09-27: a exclusão em lote de "Ver todos". Ela filtra por `.in(...)`, não por
  // `.eq('id')`, então tem asserção própria: as duas escritas pedem o resultado de volta,
  // ficam restritas aos lançamentos manuais, e zero linhas apagadas é erro.
  it('deleteEntries confere o resultado e só alcança lançamento manual', () => {
    const corpo = corpoDe('deleteEntries')

    expect(corpo.match(/\.delete\(\)/g) ?? []).toHaveLength(2)
    expect(corpo.match(/\.select\('id'\)/g) ?? []).toHaveLength(2)
    expect(corpo.match(/\.eq\('source', 'manual'\)/g) ?? []).toHaveLength(2)
    expect(corpo).toMatch(/\.in\('id', ids\)/)
    expect(corpo).toMatch(/\.in\('import_batch_id', importBatchIds\)/)
    expect(corpo, 'deleteEntries não recusa o caso de zero linhas').toMatch(/deleted === 0/)
  })

  // v1.3 — 2026-09-27: o "Categorizar" da seleção grava em lote por `.in('id')`, com asserção
  // própria pelo mesmo motivo de `deleteEntries`.
  it('applyCategories confere o resultado e só alcança lançamento manual', () => {
    const corpo = corpoDe('applyCategories')

    expect(corpo.match(/\.update\(/g) ?? []).toHaveLength(1)
    expect(corpo).toMatch(/\.update\(\{ category_id: categoryId \}\)\s*\.eq\('source', 'manual'\)\s*\.in\('id'/)
    expect(corpo).toMatch(/\.select\('id'\)/)
    expect(corpo, 'applyCategories não recusa o caso de zero linhas').toMatch(/updated === 0/)
  })
})
