/**
 * Checagem do PWA contra um build de produção.
 *
 *   npm run build
 *   npx next start -p 3100 &
 *   npm run verify:pwa
 *
 * Existe porque nada disto aparece no `typecheck`, no `lint` ou no `vitest`: o
 * service worker só é exercido por um navegador de verdade, servido por um build
 * de produção. Duas falhas reais passaram por aqui sem ninguém ver:
 *
 * 1. `/sw.js` respondendo **404 em produção** — o arquivo é gerado no build e
 *    não entrava no deploy. Daí a checagem 1.
 * 2. Uma asserção frouxa numa versão anterior desta checagem, que aceitava
 *    qualquer conteúdo com mais de 500 bytes como "abriu offline" e por isso
 *    passava mesmo quando a navegação caía na página de offline. As asserções
 *    abaixo comparam **conteúdo**, não tamanho.
 *
 * Não roda no CI: depende de um servidor de pé e de um Chromium. É verificação
 * de quem mexe no worker, no `serwist.config.ts` ou no matcher do `proxy.ts`.
 */
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:3100'
const executablePath = process.env.CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {}).catch((erro) => {
  console.error('Não foi possível abrir o Chromium. Defina CHROMIUM_PATH se ele não está no lugar padrão.')
  throw erro
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

const falhas = []
const ok = (nome, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${nome}${extra ? ` — ${extra}` : ''}`)
  if (!cond) falhas.push(nome)
}

// 1. O worker é servido da raiz. Foi isto que faltou em produção: o arquivo é
//    gerado no build, e antes da correção não entrava no deploy (404).
const sw = await page.request.get(`${BASE}/sw.js`).catch(() => null)
if (!sw) {
  console.error(`Nada respondendo em ${BASE}. Suba o build de produção antes: npm run build && npx next start -p 3100`)
  process.exit(2)
}
ok('/sw.js servido da raiz', sw.ok(), `HTTP ${sw.status()}`)
const corpo = await sw.text()
ok('o worker foi compilado no ramo de produção', corpo.includes('pages-rsc-prefetch'),
   'sem isto o defaultCache é NetworkOnly e nada é guardado')
ok('nenhum process.env sobrou no worker', !corpo.includes('process.env'))

// 2. Manifest e ícones.
const mf = await page.request.get(`${BASE}/manifest.webmanifest`)
ok('manifest servido', mf.ok(), `HTTP ${mf.status()}`)
const manifest = await mf.json()
ok('display standalone', manifest.display === 'standalone', manifest.display)
ok('tem ícone maskable', manifest.icons.some((i) => String(i.purpose).includes('maskable')))
for (const icone of manifest.icons) {
  const res = await page.request.get(BASE + icone.src)
  ok(`ícone ${icone.sizes}`, res.ok(), `HTTP ${res.status()}`)
}

// 3. A página de offline responde sem sessão.
const off = await page.request.get(`${BASE}/~offline`)
ok('/~offline responde sem sessão', off.ok() && (await off.text()).includes('Sem conexão'))

// 4. Registro e controle de verdade no navegador.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration()
  if (!r) return { ok: false, scope: null }
  await navigator.serviceWorker.ready
  return { ok: true, scope: r.scope }
})
ok('worker registrado', reg.ok, reg.scope ?? '')
ok('escopo é a raiz', (reg.scope ?? '').endsWith('/'), reg.scope ?? '')
for (let i = 0; i < 30 && !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))); i++) {
  await page.waitForTimeout(200)
}
ok('worker controla a página', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))

// 5. Ícone precacheado serve sem rede.
await ctx.setOffline(true)
const icone = await page.evaluate(async () => {
  try { const r = await fetch('/icons/icon-192.png'); return r.ok } catch { return false }
})
ok('ícone precacheado serve offline', icone)

// 6. Rota nunca visitada cai na página de offline, não num erro do navegador.
await page.goto(`${BASE}/rota-que-nunca-existiu`, { waitUntil: 'domcontentloaded' }).catch(() => null)
ok('rota não visitada cai no fallback', (await page.content()).includes('Sem conexão'))

// 7. Nenhuma rota de sessão guardada em cache algum — é a regra de privacidade
//    do `NEVER_CACHE` em `app/sw.ts`, e é isto que dá para afirmar olhando o
//    armazenamento. (O que o navegador faz com o documento na memória dele, ao
//    voltar para uma URL já visitada, não passa pelo worker e não é promessa
//    nossa: uma tela de login restaurada assim não carrega dado de ninguém.)
const guardadas = await page.evaluate(async () => {
  const achadas = []
  for (const nome of await caches.keys()) {
    for (const req of await (await caches.open(nome)).keys()) {
      achadas.push(`${nome} → ${new URL(req.url).pathname}`)
    }
  }
  return achadas
})
const sessao = guardadas.filter((e) => /\/(auth|login|entrar)(\/|$)/.test(e.split(' → ')[1]))
ok('nenhuma rota de sessão em cache', sessao.length === 0, sessao.join(', ') || `${guardadas.length} entradas, nenhuma de sessão`)

await ctx.setOffline(false)
await browser.close()
console.log(falhas.length === 0 ? '\nTODAS AS CHECAGENS DE PWA PASSARAM' : `\nFALHARAM: ${falhas.join(', ')}`)
process.exit(falhas.length === 0 ? 0 : 1)
