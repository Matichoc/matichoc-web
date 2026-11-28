// Cortina de chocolate: la transición de cine al entrar a un juego y al volver al menú. El chocolate baja chorreando
// hasta tapar la pantalla, el cambio se hace cuando ya no se ve nada (así no se nota el salto ni el mundo armándose a
// medias) y después el chocolate sigue de largo hacia abajo y destapa la pantalla nueva.
// Es una sola pieza de HTML que se mueve entera (solo cambia su posición): no usa el 3D ni efectos de pantalla
// completa, así que cuesta lo mismo en un celular barato que en uno caro.
// No aparece con «reducir movimiento» ni en las pruebas automáticas (?debug3d o ?nosplash), salvo que se pida con
// ?cortina (para grabarla).
import * as audio from "./audio.js?v=bfcb83ff05";

const IN_MS = 280; // lo que tarda en tapar
const OUT_MS = 320; // lo que tarda en destapar
const MIN_HOLD = 110; // tapada, como mínimo (que se alcance a ver el logo)
const MAX_HOLD = 1200; // tapada, como máximo, aunque el juego siga cargando

let el = null;
let busy = false;

function skip() {
  const q = location.search;
  if (/[?&]cortina\b/.test(q)) return false;
  if (/[?&](debug3d|nosplash)\b/.test(q)) return true;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

/** El borde de abajo: gotas de distinto largo, dibujadas una sola vez. [centro, ancho, largo] sobre un ancho de 1000. */
function dripPath() {
  const drips = [[58, 72, 70], [168, 58, 118], [286, 82, 54], [398, 56, 138], [520, 86, 76], [642, 60, 108], [752, 78, 58], [862, 58, 128], [954, 62, 72]];
  let d = "M0,0H1000V22";
  for (const [c, w, len] of drips.reverse()) {
    const r = c + w / 2, l = c - w / 2, k = w / 2;
    d += `L${r + 16},22Q${r},22 ${r},38V${len - k}A${k},${k} 0 0 1 ${l},${len - k}V38Q${l},22 ${l - 16},22`;
  }
  return d + "L0,22Z";
}

function build() {
  el = document.createElement("div");
  el.id = "choco-curtain";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="cc-body">
    <svg class="cc-top" viewBox="0 0 1000 40" preserveAspectRatio="none"><path d="M0,40V22Q125,0 250,20T500,16T750,24T1000,10V40Z"/></svg>
    <div class="cc-fill"></div>
    <svg class="cc-drip" viewBox="0 0 1000 140" preserveAspectRatio="none"><path d="${dripPath()}"/></svg>
    <img class="cc-logo" src="assets/brand/logo-badge.png" alt="">
  </div>`;
  document.body.appendChild(el);
  const logo = el.querySelector(".cc-logo");
  if (logo.decode) logo.decode().catch(() => {}); // el logo ya dibujado, para que no frene la primera bajada
  void el.offsetWidth; // que la primera vez también baje deslizándose
  return el;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** El próximo cuadro dibujado (con un tope, por si la pestaña está escondida y el navegador no dibuja). */
const frame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 120);
});

/** Espera a que la cortina termine de moverse de verdad (el aviso del navegador), con un tope por si no llega:
 *  con un reloj fijo, si el celular se atrasa al partir, el cambio de pantalla se alcanzaba a ver. */
function moved(c, ms) {
  return new Promise((done) => {
    const body = c.querySelector(".cc-body");
    let ok = false;
    const end = (e) => {
      if (ok || (e && (e.target !== body || e.propertyName !== "transform"))) return;
      ok = true;
      body.removeEventListener("transitionend", end);
      done();
    };
    body.addEventListener("transitionend", end);
    // el tope corre desde que la cortina de verdad empezó a moverse (dos cuadros después de pedirlo): si el celular
    // se atrasa al partir, un tope contado desde antes se cumplía con la cortina a medio camino
    frame().then(frame).then(() => setTimeout(() => end(null), ms + 200));
  });
}

/** Deja la cortina armada de antemano (sin mostrarla), para que la primera vez no tenga que construirse al tocar. */
export function initCurtain() {
  if (skip() || el) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  idle(() => { if (!el) build(); });
}

/** Tapa la pantalla con chocolate, hace el cambio (`swap`) cuando ya no se ve nada, y destapa.
 *  Si `swap` devuelve una promesa (el juego terminando de armarse), la espera tapada, pero nunca más de MAX_HOLD.
 *  Si ya hay una cortina en curso, o no corresponde mostrarla, el cambio se hace al tiro. */
export function chocoCurtain(swap) {
  if (busy || skip()) { swap(); return; }
  busy = true;
  const c = el || build();
  c.className = "on"; // visible y todavía arriba, fuera de la pantalla: el navegador le prepara su capa
  audio.playCurtain();
  (async () => {
    await frame();
    c.className = "on in";
    await moved(c, IN_MS); // ya tapó
    await frame(); // y ya se dibujó tapando: recién ahora puede venir el trabajo pesado de armar el juego
    let ready = null;
    try { ready = swap(); } catch (e) { console.error(e); }
    c.classList.add("full");
    const t0 = Date.now();
    if (ready && typeof ready.then === "function") await Promise.race([Promise.resolve(ready).catch(() => {}), wait(MAX_HOLD)]);
    const left = MIN_HOLD - (Date.now() - t0);
    if (left > 0) await wait(left);
    c.className = "on out full";
    await moved(c, OUT_MS); // ya destapó
    c.className = "";
    busy = false;
  })();
}
