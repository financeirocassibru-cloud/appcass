/**
 * Gera os PNGs do PWA a partir de `public/icons/logo.svg`.
 *
 *   npm run icons
 *
 * v1.0 — 27/09/2026: criado junto com a troca do ícone provisório pelo logo Cass. Os PNGs da
 * fase 6b tinham sido feitos à mão; agora trocar o logo é editar o SVG e rodar de novo.
 *
 * Usa o Chromium do `@playwright/test`, que já é dependência de desenvolvimento, para não
 * trazer um rasterizador só para isto. Todo ícone tem fundo sólido lilás claro: o iOS pinta
 * a transparência do `apple-touch-icon` de preto, e o Android recorta o maskable sobre o fundo.
 */
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const FUNDO = '#f7f3fb'
const logo = await readFile(new URL('../public/icons/logo.svg', import.meta.url), 'utf8')

/**
 * `escala` é a largura do logo em fração do lado do quadrado. O logo é largo (≈1,4:1), então
 * a largura é o que decide se ele cabe. No maskable, o Android garante só o círculo central de
 * 80% do lado: com 0,6 de largura a diagonal do logo fica em ≈0,74, dentro do círculo.
 */
const ICONES = [
  { arquivo: 'icon-192.png', lado: 192, escala: 0.8 },
  { arquivo: 'icon-512.png', lado: 512, escala: 0.8 },
  { arquivo: 'maskable-512.png', lado: 512, escala: 0.6 },
  { arquivo: 'apple-touch-icon.png', lado: 180, escala: 0.76 },
]

const executablePath = process.env.CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {})

for (const { arquivo, lado, escala } of ICONES) {
  const page = await browser.newPage({ viewport: { width: lado, height: lado } })
  await page.setContent(`<!doctype html>
    <html><body style="margin:0;width:${lado}px;height:${lado}px;background:${FUNDO};
      display:flex;align-items:center;justify-content:center">
      <div style="width:${Math.round(lado * escala)}px">${logo}</div>
    </body></html>`)
  await page.addStyleTag({ content: 'svg{display:block;width:100%;height:auto}' })
  await page.screenshot({ path: `public/icons/${arquivo}`, omitBackground: false })
  await page.close()
  console.log(`✓ public/icons/${arquivo} (${lado}×${lado})`)
}

await browser.close()
