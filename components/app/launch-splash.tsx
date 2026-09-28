import Image from 'next/image'

/**
 * Abertura do PWA — v1.2 — 28/09/2026.
 *
 * v1.2 (28/09/2026): o destino do voo é o primeiro logo `[data-cass-logo-target]` VISÍVEL. No
 * computador o logo do Início fica oculto e o destino é o da barra lateral; no celular a barra
 * lateral é que está oculta, então o destino continua sendo o do Início, como antes.
 *
 * v1.0 (27/09/2026): ao abrir o app instalado pelo ícone, o logo começa no centro da tela, sobre
 * o mesmo lilás da tela de abertura do sistema (`background_color` do manifest), e voa até o
 * logo do topo do Início. A intenção é que o logo do ícone pareça se tornar o logo do cabeçalho.
 * v1.1 (27/09/2026): o logo do overlay começa do mesmo tamanho do logo na tela de abertura do
 * Android. Era `min(48vw, 200px)` (~187 px num celular comum), e na troca da tela do sistema
 * para o overlay o logo "crescia" ~30% antes de voar. Ver `START_WIDTH`.
 *
 * Por que mora no layout de `(app)` e não na página: o Início é dinâmico e tem `loading.tsx`.
 * Numa carga completa, o HTML chega primeiro com o esqueleto, e o `<header>` com o logo só vem
 * depois, por streaming. O overlay precisa estar na tela desde o primeiro frame, então vem no
 * layout, e o script espera o logo de destino aparecer.
 *
 * Por que é um `<script>` inline e não um efeito do React: o script roda enquanto o navegador lê
 * o HTML, antes de desenhar a tela, então o app não pisca antes do overlay. Um `useEffect` só
 * rodaria depois da hidratação, com o Início já visível. Numa navegação do lado do cliente o
 * script não roda, e o overlay continua com `hidden`, que é o estado em que ele nasce.
 *
 * O overlay nunca é removido do DOM, só escondido: ele faz parte da árvore do React, e remover
 * um nó antes da hidratação quebraria a hidratação do shell inteiro.
 */

/**
 * v1.1 (27/09/2026): largura inicial do logo, igual à do último frame da tela de abertura.
 *
 * No Android 12+ essa tela é do sistema: ele desenha o ícone adaptativo do app, que o Chrome
 * gera a partir do `maskable-512.png`, num quadrado de 240 dp (ícone com fundo). No maskable o
 * logo ocupa 60% da largura (`escala: 0.6` em `scripts/gen-icons.mjs`), então no último frame do
 * sistema ele tem 0,6 × 240 = 144 dp. No Chrome do Android 1 px de CSS vale 1 dp na escala
 * padrão. Mudou a escala do maskable, muda aqui também.
 */
const SPLASH_ICON_DP = 240
const MASKABLE_LOGO_SCALE = 0.6
const START_WIDTH = Math.round(SPLASH_ICON_DP * MASKABLE_LOGO_SCALE)
// Proporção do `viewBox` do logo (409 × 291).
const START_HEIGHT = Math.round((START_WIDTH * 291) / 409)

// Chave do `sessionStorage`: a animação roda uma vez por abertura do app, não a cada recarga.
const STORAGE_KEY = 'cass:launch'
// Seletor do logo de destino, marcado pelo `<Logo target />` do Início.
const TARGET = '[data-cass-logo-target]'

const SCRIPT = `(function () {
  var el = document.getElementById('cass-launch');
  if (!el) return;
  var play = false;
  try {
    var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    play = standalone && location.pathname === '/' && !sessionStorage.getItem('${STORAGE_KEY}');
    if (play) sessionStorage.setItem('${STORAGE_KEY}', '1');
  } catch (e) {
    play = false;
  }
  if (!play || typeof el.animate !== 'function') return;

  el.hidden = false;
  var bg = el.firstElementChild;
  var logo = el.querySelector('img');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var done = false;
  var observer = null;
  var timer = 0;

  function finish(target) {
    if (done) return;
    done = true;
    if (observer) observer.disconnect();
    clearTimeout(timer);
    if (target) target.style.visibility = '';
    el.hidden = true;
  }

  // Saída sem voo: com movimento reduzido, se o destino não apareceu a tempo ou se algo falhou.
  function fadeOut(target) {
    if (done) return;
    if (target) target.style.visibility = '';
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 150 : 250, fill: 'forwards' })
      .onfinish = function () { finish(target); };
  }

  function fly(target) {
    var from = logo.getBoundingClientRect();
    var to = target.getBoundingClientRect();
    if (reduce || !from.width) return fadeOut(target);
    target.style.visibility = 'hidden';
    var dx = to.left + to.width / 2 - (from.left + from.width / 2);
    var dy = to.top + to.height / 2 - (from.top + from.height / 2);
    var s = to.width / from.width;
    bg.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 350, delay: 120, easing: 'ease-out', fill: 'forwards'
    });
    logo.animate(
      [{ transform: 'none' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')' }],
      { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
    ).onfinish = function () { finish(target); };
  }

  // O destino só serve quando já está no lugar: durante o streaming, o React o monta primeiro
  // num contêiner escondido, onde a largura medida é zero.
  // v1.2 (28/09/2026): o primeiro destino visível — um oculto também mede largura zero.
  function ready() {
    var all = document.querySelectorAll('${TARGET}');
    for (var i = 0; i < all.length; i++) {
      if (all[i].getBoundingClientRect().width > 0) return all[i];
    }
    return null;
  }

  function start(target) {
    if (observer) observer.disconnect();
    clearTimeout(timer);
    // Um frame para o layout assentar antes de medir.
    requestAnimationFrame(function () {
      try { fly(target); } catch (e) { fadeOut(target); }
    });
  }

  var found = ready();
  if (found) return start(found);
  observer = new MutationObserver(function () {
    var t = ready();
    if (t) start(t);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // O app nunca fica preso atrás do overlay: sem destino em 2,5 s, ele só some.
  timer = setTimeout(function () {
    if (observer) observer.disconnect();
    fadeOut(null);
  }, 2500);
})();`

export function LaunchSplash() {
  return (
    <>
      <div
        id="cass-launch"
        hidden
        aria-hidden="true"
        // O script mexe em `hidden` antes da hidratação; a diferença é esperada.
        suppressHydrationWarning
        className="pointer-events-none fixed inset-0 z-[100]"
      >
        {/* Mesmo lilás do `background_color` do manifest e do fundo dos ícones. */}
        <div className="absolute inset-0 bg-[#f7f3fb]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/icons/logo.svg"
            // v1.1 (27/09/2026): tamanho fixo da tela de abertura do Android, não mais `48vw`.
            width={START_WIDTH}
            height={START_HEIGHT}
            style={{ width: START_WIDTH, height: START_HEIGHT }}
            alt=""
            priority
            className="will-change-transform"
          />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  )
}
