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
