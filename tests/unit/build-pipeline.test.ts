import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O pipeline de build precisa gerar o service worker.
 *
 * Este teste existe por causa de um bug que sobreviveu a três deploys e a um PR
 * inteiro dedicado a corrigi-lo. O `vercel.json` fixava
 *
 *     "buildCommand": "next build"
 *
 * e com isso a Vercel **nunca executava o script `build` do `package.json`**,
 * que é quem chama o `serwist build`. Resultado: `/sw.js` respondia 404 em
 * produção, o build passava verde, e o PR que "corrigiu" a ordem dos dois
 * comandos dentro do script não mudou nada — porque o script não era chamado.
 *
 * A lição é que um comando de build duplicado em dois arquivos é uma fonte da
 * verdade a mais do que cabe. O `package.json` é a fonte; o `vercel.json` não
 * repete.
 */

const raiz = process.cwd()
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const vercel = JSON.parse(readFileSync(join(raiz, 'vercel.json'), 'utf8')) as {
  buildCommand?: string
}

describe('pipeline de build', () => {
  it('o script build gera o service worker antes do next build', () => {
    const build = pkg.scripts.build ?? ''
    expect(build).toContain('serwist build')
    expect(build).toContain('next build')
    // A ordem importa: a Vercel coleta `public/` depois de rodar o build, então
    // o arquivo precisa existir quando o `next build` termina.
    expect(build.indexOf('serwist build')).toBeLessThan(build.indexOf('next build'))
  })

  it('o vercel.json não substitui o script de build', () => {
    // Sem `buildCommand`, o builder da Vercel roda o script `build` do
    // package.json. Com ele, ignora o script — e foi exatamente esse desvio que
    // deixou o service worker fora de todos os deploys.
    if (vercel.buildCommand !== undefined) {
      expect(vercel.buildCommand).toBe('npm run build')
    }
    expect(vercel.buildCommand ?? 'npm run build').toContain('npm run build')
  })

  it('o next.config.ts falha o build se o worker não foi gerado', () => {
    // Guarda de última linha: vale mesmo se alguém apontar o comando de build
    // para `next build` no painel da Vercel, que o repositório não enxerga.
    const config = readFileSync(join(raiz, 'next.config.ts'), 'utf8')
    expect(config).toContain("process.argv[2] === 'build'")
    expect(config).toContain('public')
    expect(config).toMatch(/throw new Error/)
  })
})
