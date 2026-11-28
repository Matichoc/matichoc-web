// Base 3D compartida de los juegos de Matijuego: renderizador, bucle,
// calidad adaptativa, partículas, popups y utilidades de texturas.
// Los juegos 3D (Salto Choco, Autos de Chocolate, Memoria Matichoc) extienden
// Game3D y solo implementan build / reset / update.

import * as THREE from "../vendor/three.module.min.js";
import { getOutfit } from "./characters.js?v=bfcb83ff05";
import { IS_DEMO, demoAllows } from "./demo.js?v=bfcb83ff05";
import { addToLeaderboard, earnCoins, equippedOutfitId, getLook, reportScore, saveProgress } from "./storage.js?v=bfcb83ff05";
import * as audio from "./audio.js?v=bfcb83ff05";
import { recordRun, runBonus } from "./progression.js?v=bfcb83ff05";
import { campaignWin, campaignMode, campaignLevel, campaign, campaignComplete, campaignStartOver, lapReward, LEVELS_PER_GAME } from "./campaign.js?v=bfcb83ff05";
import { missionFor } from "./missions.js?v=bfcb83ff05";
import { costOf, spendEnergy, energyOf } from "./energy.js?v=bfcb83ff05";
import { vibrate } from "./native.js?v=bfcb83ff05";
import { celebrate } from "./celebrate.js?v=bfcb83ff05";

export { THREE };


// ---------- contextos WebGL ----------
// Cada pantalla 3D (menú, tienda, casa, pueblo y cada juego) tiene su propio contexto WebGL, y los celulares
// (sobre todo el WebView de la app) solo aguantan unos pocos a la vez: al pasar el límite, las pantallas
// quedan en blanco o "no se pudo mostrar el 3D". Aquí se mantienen vivos pocos contextos; el que hace
// más tiempo que no se usa se suelta (forceContextLoss) y se recupera solo al volver a esa pantalla.

const GL_MAX_LIVE = 3;
const glRenderers = new Set();
const glLost = (r) => { try { return r.getContext().isContextLost(); } catch (e) { return true; } };

function glEvict(keep) {
  const live = [...glRenderers].filter((r) => r === keep || !glLost(r));
  if (live.length <= GL_MAX_LIVE) return;
  live.sort((a, b) => (b.__glUse || 0) - (a.__glUse || 0));
  for (const r of live) {
    if (r === keep || live.indexOf(r) < GL_MAX_LIVE) continue;
    try { r.forceContextLoss(); } catch (e) { /* ya estaba suelto */ }
  }
}

/** Crea un renderer y lo anota; si el equipo ya no da más contextos, suelta los otros y reintenta. */
export function createRenderer(opts) {
  let r;
  try {
    r = new THREE.WebGLRenderer(opts);
  } catch (e) {
    for (const o of glRenderers) { try { o.forceContextLoss(); } catch (e2) { /* nada */ } }
    r = new THREE.WebGLRenderer(opts);
  }
  r.__glUse = performance.now();
  r.__glExt = r.getContext().getExtension("WEBGL_lose_context"); // en un contexto suelto ya no se puede pedir
  glRenderers.add(r);
  glEvict(r);
  return r;
}

/** Llamar al mostrar una pantalla 3D: recupera su contexto si se había soltado y suelta los más viejos. */
export function glAcquire(renderer) {
  if (!renderer) return;
  renderer.__glUse = performance.now();
  glRenderers.add(renderer);
  if (glLost(renderer)) {
    try { (renderer.__glExt || renderer.getContext().getExtension("WEBGL_lose_context"))?.restoreContext(); } catch (e) { /* se reintenta en el próximo cuadro */ }
  }
  glEvict(renderer);
}
export const glLiveCount = () => [...glRenderers].filter((r) => !glLost(r)).length;
if (typeof location !== "undefined" && location.search.includes("debug3d")) window.__glLive = glLiveCount; // solo para pruebas

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);

// "Look" compartido (brillo suave estilo juego moderno); cada juego puede ajustarlo.
export const LOOK = {
  bloom: { strength: 0.32, radius: 0.55, threshold: 0.92 },
  grade: { sat: 1.16, contrast: 1.06, vig: 0.22, lift: 0, tint: [1, 1, 1] },
  // ambiente "kawaii": colores pastel, negros levantados con un velo rosado y brillo suave tipo ensueño
  kawaii: { bloom: { strength: 0.2, radius: 0.5, threshold: 0.96 }, grade: { sat: 1.14, contrast: 1.0, vig: 0.16, lift: 0.025, tint: [1.0, 0.88, 0.94] } },
};

// ---------- nitidez y calidad en celulares ----------
// Antes, en los celulares el 3D se dibujaba a 1,25 píxeles por punto y sin suavizado de bordes: en una pantalla de 2,6 o
// 3 píxeles por punto eso se ve borroso y con los bordes en escalera («pixelado»). Y además se gastaba en un brillo de
// pantalla completa (bloom: unas 13 pasadas). Ahora el gasto va a lo que más se nota: más resolución y bordes suaves
// (MSAA, que en los celulares cuesta poco), sin pasadas de pantalla completa; el ajuste de color se hace dentro del
// mismo dibujo (ver gradeChunk). Cuánta resolución aguanta cada teléfono se mide jugando y se recuerda por juego.
//
// Un nivel = cuántos píxeles se dibujan (de ahí sale la resolución, según el tamaño del escenario):
//    2: 1,6 millones (como 1080p angosto) · 1: 1,0 millón (como 720p; es donde se parte) · 0: 0,66 millones
//   -1: 0,44 millones (lo que se dibujaba antes) · -2: lo mismo, sin sombras de verdad y, desde la próxima vez, sin MSAA
const Q_PIXELS = { 2: 1.6e6, 1: 1.0e6, 0: 0.66e6, "-1": 0.44e6, "-2": 0.44e6 };
const Q_MIN = -2, Q_MAX = 2, Q_START = 1;
const Q_KEY = "matichoc_calidad"; // (es de este equipo, no de un perfil; lleva el prefijo de todo lo que guarda el juego)
const Q_SLOW = 0.034; // más lento que esto (29 cuadros por segundo): se baja un nivel
const Q_FAST = 0.0175; // así de rápido (57 o más): se puede probar un nivel más
const Q_KEEP = 0.022; // el nivel de prueba se queda solo si sostiene 45 cuadros por segundo
// para pruebas y videos: ?calidad=2 en la dirección (o "matichoc_calidad_fija" guardado en el equipo) fija el nivel y apaga la medición
const Q_FORCE = (() => {
  try {
    const m = /[?&]calidad=(-?\d)/.exec(location.search);
    const v = m ? m[1] : localStorage.getItem("matichoc_calidad_fija");
    return v != null && v !== "" && Number.isFinite(Number(v)) ? clampQ(Number(v)) : null;
  } catch (e) { return null; }
})();
function clampQ(n) { return Math.max(Q_MIN, Math.min(Q_MAX, Math.round(n))); }
function qRead() {
  try { const q = JSON.parse(localStorage.getItem(Q_KEY) || "{}"); return q && typeof q === "object" ? q : {}; } catch (e) { return {}; }
}
function qWrite(id, rec) {
  try { const q = qRead(); q[id] = rec; localStorage.setItem(Q_KEY, JSON.stringify(q)); } catch (e) { /* sin almacenamiento: se mide de nuevo la próxima vez */ }
}
/** La calidad con que parte un juego en este celular: la que aprendió la última vez; si es nuevo, la de los otros juegos. */
function qualityFor(id) {
  if (Q_FORCE !== null) return { level: Q_FORCE, cap: Q_MAX, aa: Q_FORCE > Q_MIN, fixed: true };
  const all = qRead(), mine = all[id];
  if (mine && Number.isFinite(mine.l)) return { level: clampQ(mine.l), cap: Number.isFinite(mine.c) ? clampQ(mine.c) : Q_MAX, aa: mine.l > Q_MIN };
  const others = Object.values(all).filter((r) => r && Number.isFinite(r.l)).map((r) => r.l);
  const hint = others.length ? Math.round(others.reduce((a, b) => a + b, 0) / others.length) : Q_START;
  return { level: clampQ(Math.min(Q_START, hint)), cap: Q_MAX, aa: true };
}

// Ajuste de color sin pasada de pantalla completa: three.js deja poner una función propia al final del sombreado de cada
// material (CustomToneMapping). Hace lo mismo que GRADE_SHADER (saturación, contraste y el velo kawaii), menos la viñeta.
const TONE_CHUNK = THREE.ShaderChunk.tonemapping_pars_fragment;
function gradeChunk(gr) {
  const f = (n) => Number(n).toFixed(4);
  const t = gr.tint || [1, 1, 1];
  const body = `vec3 CustomToneMapping( vec3 color ) {
	vec3 c = pow( max( color, vec3( 0.0 ) ), vec3( 0.4545 ) );
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, ${f(gr.sat)} );
	c = ( c - 0.5 ) * ${f(gr.contrast)} + 0.5;
	c = mix( c, vec3( ${f(t[0])}, ${f(t[1])}, ${f(t[2])} ), ${f(gr.lift || 0)} * ( 1.0 - l * 0.6 ) );
	return pow( max( c, vec3( 0.0 ) ), vec3( 2.2 ) );
}`;
  const out = TONE_CHUNK.replace(/vec3 CustomToneMapping\( vec3 color \) \{ return color; \}/, body);
  return out === TONE_CHUNK ? null : out; // (si three.js cambiara ese texto, se queda sin ajuste en vez de romperse)
}

// Ajuste final de color (saturación, contraste y viñeta) sobre la imagen ya en sRGB.
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.16 }, contrast: { value: 1.06 }, vig: { value: 0.22 }, lift: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; uniform float contrast; uniform float vig; uniform float lift; uniform vec3 tint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, sat);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb *= 1.0 - vig * smoothstep(0.45, 0.98, distance(vUv, vec2(0.5)));
      c.rgb = mix(c.rgb, tint, lift * (1.0 - l * 0.6));
      gl_FragColor = c;
    }`,
};

export function loadTexture(url, { repeat = 0, anisotropy = 4 } = {}) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  return tex;
}

let logoTex = null;
/** Textura del logo de Matichoc (medallón redondo). Se comparte entre todos los juegos. */
export function logoTexture() {
  if (!logoTex) logoTex = loadTexture("assets/brand/logo-badge.png", { anisotropy: 8 });
  return logoTex;
}

/**
 * Logo de Matichoc como una lámina (para carteles, paredes, pisos y banderas). `size` es el diámetro.
 * Con `lit` se ve igual de claro en la oscuridad (no recibe luces); si no, se mezcla con la escena.
 */
export function makeLogo(size = 2, { lit = true } = {}) {
  const mat = lit
    ? new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true })
    : new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, roughness: 0.6 });
  // dos caras de un solo lado (no una con DoubleSide): por detrás el logo se leería al revés, como en un espejo
  const geo = new THREE.PlaneGeometry(size, size);
  const g = new THREE.Group();
  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  g.add(new THREE.Mesh(geo, mat), back);
  return g;
}

let coinTex = null;
/** Moneda dorada con el logo de Matichoc (se dibuja a mano; el logo se agrega cuando carga). */
export function goldCoinTexture() {
  if (coinTex) return coinTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  coinTex = new THREE.CanvasTexture(cv);
  coinTex.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    const g = cv.getContext("2d");
    g.clearRect(0, 0, 128, 128);
    const gr = g.createRadialGradient(50, 46, 8, 64, 64, 64);
    gr.addColorStop(0, "#fff0a0"); gr.addColorStop(0.6, "#ffc800"); gr.addColorStop(1, "#c98a00");
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, 6.3); g.fill();
    g.strokeStyle = "#fff6c8"; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 55, 0, 6.3); g.stroke();
    g.strokeStyle = "#b07a00"; g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 49, 0, 6.3); g.stroke();
    if (img) { g.save(); g.beginPath(); g.arc(64, 64, 45, 0, 6.3); g.clip(); g.drawImage(img, 19, 19, 90, 90); g.restore(); }
    coinTex.needsUpdate = true;
  };
  draw(null);
  const img = new Image();
  img.onload = () => draw(img);
  img.src = "assets/brand/logo-badge.png";
  return coinTex;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Un emoji dibujado en un sprite (globitos, cosas para recoger, corazones). */
export function emojiSprite(emoji, size = 0.8) {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = "96px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(emoji, w / 2, h / 2 + 6);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(size, size, 1);
  return s;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Caja con esquinas y bordes redondeados (centrada en el origen). */
export function roundedBox(w, h, d, r = 0.08, bevel = 0.03) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel)), {
    depth: Math.max(0.001, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  return geo;
}

// ---------- sombras suaves pintadas ----------
let softShadowTex = null;
/** La textura de una sombra pintada: una mancha oscura que se desvanece hacia el borde (64 px, una sola para todo). */
export function softShadowTexture() {
  if (!softShadowTex) {
    softShadowTex = canvasTexture(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, "rgba(0,0,0,0.5)");
      r.addColorStop(0.5, "rgba(0,0,0,0.3)");
      r.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, w, h);
    });
  }
  return softShadowTex;
}

/** Material de una sombra pintada suelta (por ejemplo, la de una pelota). */
// (polygonOffset: aunque quede a la misma altura que el piso o que un logo pintado en la cancha, la sombra se dibuja encima sin pelearse)
export const softShadowMaterial = () => new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });

/** Sombras pintadas para `n` personajes con un solo dibujo por cuadro: manchas suaves pegadas al suelo, para cuando el
 *  celular no usa (o apaga) las sombras de verdad. `place(i, x, y, z, ancho)` ubica cada una; después de mover,
 *  `instanceMatrix.needsUpdate = true`. */
export function makeSoftShadows(n) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, softShadowMaterial(), n);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.userData.noToon = true;
  mesh.userData.noOutline = true;
  const o = new THREE.Object3D();
  mesh.place = (i, x, y, z, size) => {
    o.position.set(x, y, z);
    o.scale.set(size, 1, size);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  };
  return mesh;
}

// ---------- detalle según la distancia ----------
const _lodS = new THREE.Vector3();
/**
 * Un personaje tiene 60 a 100 piezas, y la mitad son detalles de 1 o 2 centímetros (surcos de la barra, cordones,
 * brillo de los ojos) que de lejos no alcanzan a ocupar un píxel pero se dibujan igual, una por una. Esto las clasifica
 * por tamaño y devuelve una función: llamarla con la distancia a la cámara deja de dibujar las más chicas pasados
 * `near` metros y las medianas pasados `far`. Además las piezas chicas no tiran sombra de verdad.
 * (Se usan capas y no `visible`, para no pelear con las piezas que el personaje prende y apaga solo, como las bocas.)
 */
export function detailByDistance(root, near = 14, far = 30) {
  const tiny = [], small = [];
  root.updateWorldMatrix(true, true);
  const k = root.getWorldScale(_lodS).x || 1;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const sc = o.getWorldScale(_lodS);
    const r = (o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z)) / k; // tamaño con el personaje a escala 1
    if (r < 0.075) { tiny.push(o); o.castShadow = false; } else if (r < 0.13) small.push(o);
  });
  let level = 0;
  return (dist) => {
    const l = dist > far ? 2 : dist > near ? 1 : 0;
    if (l === level) return;
    level = l;
    for (const o of tiny) o.layers.set(l >= 1 ? 1 : 0);
    for (const o of small) o.layers.set(l >= 2 ? 1 : 0);
  };
}

// ---------- cielo en degradado ----------
// Cada mundo tiene su cielo: en vez de un fondo de un solo color, una cúpula liviana (192 triángulos, 1 dibujo por
// cuadro, sin texturas ni luces) pintada por anillos: del color del horizonte al de arriba. Se dibuja primero y sin
// revisar profundidad, así que cuesta casi lo mismo que limpiar la pantalla, también en celulares de gama baja.
/** Altura sobre el horizonte (en grados) de cada anillo de la cúpula. */
export const SKY_RINGS = [-90, -8, 0, 1.5, 4, 14, 40, 90];
const SKY_SEG = 16;
const skyA = new THREE.Color();
const skyB = new THREE.Color();
const skyM = new THREE.Color();

/** Llena los colores de los anillos, de abajo hacia arriba: el horizonte (`hz`, normalmente la niebla del juego, para
 *  que lo lejano se funda con el cielo), el cielo a media altura (`mid`; si no viene, sale de mezclar los otros dos) y
 *  el cielo de arriba (`top`), con un resplandor (`glow`, cuánto: `g` de 0 a 1) pegado al horizonte, como el del
 *  atardecer o la bruma del mar. `out` = un THREE.Color por anillo (ver SKY_RINGS). */
export function skyRamp(out, hz, mid, top, glow = null, g = 0) {
  const m = mid ? skyM.copy(mid) : skyM.copy(hz).lerp(top, 0.3);
  // La bruma del horizonte es una franja muy fina (4° de altura): en muchos juegos la cámara mira un poco hacia abajo
  // y del cielo se ve solo una franja baja; más arriba el cielo ya tiene su color de siempre y de ahí se va poniendo
  // más profundo. Así ningún mundo queda más pálido que con el fondo de un solo color.
  const toMid = [0, 0, 0, 0.5, 1, 1, 1, 1]; // del horizonte al cielo de media altura
  const toTop = [0, 0, 0, 0, 0, 0.3, 0.7, 1]; // y de ahí al de arriba
  const low = [0, 0, 1, 0.4, 0, 0, 0, 0]; // cuánto resplandor lleva cada anillo
  for (let i = 0; i < out.length; i++) {
    out[i].copy(hz).lerp(m, toMid[i]).lerp(top, toTop[i]);
    if (glow && g > 0 && low[i] > 0) out[i].lerp(glow, g * low[i]);
  }
  // bajo el horizonte (se ve cuando la cámara mira hacia abajo, como en los juegos de costado): el cielo de siempre,
  // no la bruma, para que tampoco ahí quede más pálido
  if (mid) { out[0].copy(mid); out[1].copy(mid); }
}

function makeSkyDome() {
  const n = SKY_RINGS.length, row = SKY_SEG + 1;
  const pos = new Float32Array(n * row * 3);
  const idx = [];
  for (let r = 0; r < n; r++) {
    const e = (SKY_RINGS[r] * Math.PI) / 180, y = Math.sin(e), k = Math.cos(e);
    for (let i = 0; i <= SKY_SEG; i++) {
      const a = (i / SKY_SEG) * Math.PI * 2, o = (r * row + i) * 3;
      pos[o] = Math.cos(a) * k * 40; pos[o + 1] = y * 40; pos[o + 2] = Math.sin(a) * k * 40;
    }
  }
  for (let r = 0; r < n - 1; r++) for (let i = 0; i < SKY_SEG; i++) {
    const a = r * row + i, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * row * 3), 3));
  geo.setIndex(idx);
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false, toneMapped: false }));
  dome.renderOrder = -1000; // antes que todo: lo demás se dibuja encima
  dome.frustumCulled = false;
  dome.matrixAutoUpdate = false;
  dome.userData.noToon = true;
  dome.userData.noOutline = true;
  // siempre centrada en la cámara (así nunca se llega al borde del cielo)
  dome.onBeforeRender = (renderer, scene, camera) => { dome.matrixWorld.makeTranslation(camera.matrixWorld.elements[12], camera.matrixWorld.elements[13], camera.matrixWorld.elements[14]); };
  dome.userData.colors = SKY_RINGS.map(() => new THREE.Color());
  return dome;
}

export function makeStars(count = 400, radius = 120) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const u = Math.random() * 0.9 + 0.05;
    const r = radius * (0.7 + Math.random() * 0.3);
    pos[i * 3] = Math.cos(a) * r * Math.sqrt(1 - u * u);
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = Math.sin(a) * r * Math.sqrt(1 - u * u) - radius * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  return new THREE.Points(geo, mat);
}

/** Banderines de colores de marca sobre una línea (como en la web y la feria 3D). */
export function makeBunting(from, to, { count = 14, sag = 0.7, size = 0.28, colors = [0xd4216c, 0xffc800, 0xcfd767, 0xfff6e6, 0xf08a3c] } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.ConeGeometry(size, size * 2, 3);
  geo.rotateX(Math.PI);
  const flags = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), count);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
    if (i < count) {
      o.position.set(p.x, p.y - size, p.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 0.25);
      o.updateMatrix();
      flags.setMatrixAt(i, o.matrix);
      c.setHex(colors[i % colors.length]);
      flags.setColorAt(i, c);
    }
  }
  group.add(flags);
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4b2e2e })));
  return group;
}

/** Pool de partículas (confeti, chispas) reutilizable. */
export class Particles {
  constructor(scene, count = 220) {
    this.geo = new THREE.SphereGeometry(0.07, 6, 5);
    this.mats = new Map();
    this.pool = [];
    this.active = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, this._mat(0xffffff));
      m.visible = false;
      scene.add(m);
      this.pool.push(m);
    }
  }

  _mat(hex) {
    if (!this.mats.has(hex)) this.mats.set(hex, new THREE.MeshBasicMaterial({ color: hex }));
    return this.mats.get(hex);
  }

  burst(p, colors, count = 20, speed = 4, life = 0.8, gravity = 8, size = 1) {
    for (let i = 0; i < count; i++) {
      const m = this.pool.find((q) => !q.visible);
      if (!m) return;
      m.material = this._mat(colors[Math.floor(Math.random() * colors.length)]);
      m.position.copy(p);
      m.visible = true;
      m.scale.setScalar((0.6 + Math.random() * 0.9) * size);
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.4 - 0.2;
      m.userData = {
        vx: Math.cos(a) * speed * (0.3 + Math.random()),
        vy: Math.sin(e) * speed + speed * 0.3,
        vz: Math.sin(a) * speed * (0.3 + Math.random()),
        life,
        max: life,
        gravity,
        size,
      };
      this.active.push(m);
    }
  }

  update(dt) {
    for (const m of this.active) {
      const u = m.userData;
      u.life -= dt;
      u.vy -= u.gravity * dt;
      m.position.x += u.vx * dt;
      m.position.y += u.vy * dt;
      m.position.z += u.vz * dt;
      if (u.life <= 0) m.visible = false;
      else m.scale.setScalar(Math.max(0.05, (u.life / u.max) * 1.2 * u.size));
    }
    this.active = this.active.filter((m) => m.visible);
  }

  clear() {
    for (const m of this.active) m.visible = false;
    this.active = [];
  }
}

/** Textos flotantes (DOM) anclados a posiciones 3D. */
export class Popups {
  constructor(container, wrap, camera) {
    this.container = container;
    this.wrap = wrap;
    this.camera = camera;
    this.items = [];
  }

  add(worldPos, text, kind = "kill") {
    const el = document.createElement("span");
    el.className = `fps-popup ${kind}`;
    el.textContent = text;
    this.container.appendChild(el);
    this.items.push({ el, pos: worldPos.clone(), life: 1 });
  }

  update(dt) {
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    for (const p of this.items) {
      p.life -= dt;
      p.pos.y += dt * 0.9;
      const v = p.pos.clone().project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      p.el.style.display = visible ? "block" : "none";
      p.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      p.el.style.opacity = String(clamp(p.life / 0.5, 0, 1));
    }
    this.items = this.items.filter((p) => {
      if (p.life > 0) return true;
      p.el.remove();
      return false;
    });
  }

  clear() {
    for (const p of this.items) p.el.remove();
    this.items = [];
  }
}

/**
 * Botones de juego que actúan al apoyar el dedo (pointerdown): si abren algo (un cuadro, la tienda, otro juego), el clic
 * que el celular envía al levantar el dedo cae sobre lo recién abierto y lo toca sin querer. Esto descarta ese clic.
 * Se sigue a ese mismo dedo (y no un plazo fijo: abrir la tienda puede tardar más de un segundo en un celular modesto).
 */
let ghost = 0; // 0: nada · 1: esperando que se levante ese dedo · 2: el próximo clic es el fantasma
let ghostPointer = null;
let ghostArmed = false;
export function eatGhostClick(e) {
  ghost = 1;
  ghostPointer = e ? e.pointerId : null;
  if (ghostArmed) return;
  ghostArmed = true;
  const same = (ev) => ghostPointer === null || ev.pointerId === ghostPointer;
  document.addEventListener("pointerup", (ev) => { if (ghost === 1 && same(ev)) ghost = 2; }, true);
  document.addEventListener("pointercancel", (ev) => { if (same(ev)) ghost = 0; }, true);
  document.addEventListener("pointerdown", () => { if (ghost === 2) ghost = 0; }, true); // un toque nuevo: ya no viene el fantasma
  document.addEventListener("click", (ev) => {
    if (ghost !== 2 || !ev.isTrusted) return; // los clics que genera el propio juego (el.click()) pasan
    ghost = 0;
    ev.stopPropagation();
    ev.preventDefault();
  }, true);
}

/**
 * Base de los juegos 3D. Ciclo de vida igual al de los demás juegos
 * (startRun / beginPlaying / retry / pauseForMenu) para que main.js los trate igual.
 * Subclases: build() crea la escena, reset() prepara una partida, update(dt) la avanza.
 */
const _actV1 = new THREE.Vector3();
const _actV2 = new THREE.Vector3();
const _actV3 = new THREE.Vector3();
const _actQ = new THREE.Quaternion();

// el fantasma (ver Game3D._ghostStart): se anota el puntaje cada 2 segundos, hasta 10 minutos de partida
const GHOST_EVERY = 2;
const GHOST_MAX = 300;

export class Game3D {
  constructor(gameId, character, progress, els, { fov = 50, bloom = true, near = 0.1 } = {}) {
    this.gameId = gameId;
    this.bloom = bloom === true ? LOOK.bloom : bloom;
    this.kawaii = false; // los mundos con estilo kawaii lo encienden en su constructor (ver kawaiiStyle)
    this.ambients = [];
    this.character = character;
    this.progress = progress;
    this.els = els;
    this.fov = fov;
    this.near = near; // mundos abiertos: más alto = el celular distingue mejor los pisos casi a la misma altura
    this.ready = false;
    this.running = false;
    this.state = "intro"; // intro | playing | gameover | paused
    this.time = 0;
    this.lastTs = null;
    this.frameTimes = [];
    this.qualityStep = 0;
    this.qualityDone = false;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
  }

  get outfit() {
    return getOutfit(equippedOutfitId(this.progress, this.character.id));
  }

  /** Todo lo que lleva puesto el Matichico (peinado, sombrero, ropa...; ver js/wardrobe-data.js). */
  get look() {
    return getLook(this.progress, this.character.id);
  }

  async init() {
    if (this.ready) return;
    const { canvas, wrap } = this.els;
    // celulares: la calidad que este teléfono aprendió para este juego (ver «nitidez y calidad en celulares», arriba)
    this.quality = this.coarse ? qualityFor(this.gameId) : null;
    this.renderer = createRenderer({ canvas, antialias: this.quality ? this.quality.aa : true, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.coarse ? 1.25 : 1.75); // (en celulares se recalcula con el tamaño del escenario: _fitPixels)
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._gradeOn();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, 1.6, this.near, 600);
    this.scene.add(this.camera);
    this.particles = new Particles(this.scene);
    this.popups = new Popups(this.els.popups, wrap, this.camera);

    await this.build();
    this._setupSky();
    await this._setupPost();
    if (this.quality && this.quality.level <= Q_MIN) this.onLowQuality?.(); // este teléfono ya mostró que aquí no puede con las sombras de verdad

    this._onResize = () => {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      this._fitPixels(w, h);
      this.renderer.setSize(w, h, false);
      if (this.composer) {
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.composer.setSize(w, h);
      }
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.onResize?.(w, h);
    };
    new ResizeObserver(this._onResize).observe(wrap);
    this._onResize();
    this._loop = this._loop.bind(this);
    // App en segundo plano (llamada, cambio de app): se guarda lo jugado y, al volver, hay una pausa corta
    // para que el niño no pierda la partida de golpe.
    this._onVis = () => {
      if (document.visibilityState === "hidden") {
        if (this.running && this.state === "playing") {
          audio.stopMusic();
          if (this.progress) saveProgress(this.progress);
          this._wasHidden = true;
        }
      } else if (this._wasHidden) {
        this._wasHidden = false;
        if (this.running && this.state === "playing") {
          this._freeze = 1.6;
          this.lastTs = null;
          this.banner("⏸ ¡Seguimos en un momento!");
          if (this.musicTheme) audio.startMusic(this.musicTheme);
        }
      }
    };
    document.addEventListener("visibilitychange", this._onVis);
    this.ready = true;
  }

  // ---------- cielo en degradado (ver makeSkyDome) ----------

  /** Pone la cúpula del cielo si el juego tiene un fondo de color (`this.sky = false` en el juego la apaga). */
  _setupSky() {
    const bg = this.scene.background;
    if (this.sky === false || !bg || !bg.isColor) return;
    this.skyDome = makeSkyDome();
    this.scene.add(this.skyDome);
    this._skyKey = null;
    this._paintSky();
  }

  /** Cuándo hay que repintar el cielo: un número que cambia cuando cambia la paleta. Por defecto, el fondo y la niebla
   *  del juego (los que cambian de hora o de mundo se repintan solos). */
  skyKey() {
    const s = this.scene;
    return s.background.getHex() * 16777216 + (s.fog ? s.fog.color.getHex() : 0);
  }

  /** Paleta del cielo: llena un color por anillo (ver SKY_RINGS). Por defecto sale sola del juego: el horizonte es su
   *  niebla (para que lo lejano se funda con el cielo), a media altura queda el fondo de siempre y arriba va ese mismo
   *  color, más profundo. Cada mundo puede poner la suya (el Pueblo según la hora, la playa de mediodía). */
  skyFill(out) {
    const s = this.scene, hsl = {};
    s.background.getHSL(hsl);
    skyA.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + 0.05), hsl.l * 0.5);
    const claro = hsl.l > 0.5;
    skyRamp(out, s.fog ? s.fog.color : s.background, s.background, skyA, claro ? skyB.setHex(0xffffff) : null, claro ? 0.12 : 0);
  }

  _paintSky() {
    const dome = this.skyDome;
    if (!dome) return;
    if (dome.parent !== this.scene) this.scene.add(dome);
    const key = this.skyKey();
    if (key === this._skyKey) return;
    this._skyKey = key;
    const cols = dome.userData.colors;
    this.skyFill(cols);
    const attr = dome.geometry.attributes.color, row = SKY_SEG + 1;
    for (let r = 0; r < cols.length; r++) for (let i = 0; i < row; i++) attr.setXYZ(r * row + i, cols[r].r, cols[r].g, cols[r].b);
    attr.needsUpdate = true;
  }

  /** Celulares: la resolución sale del nivel de calidad y del tamaño del escenario (un escenario chico se dibuja más fino). */
  _fitPixels(w, h) {
    const q = this.quality;
    if (!q) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.pixelRatio = Math.min(dpr, Math.max(0.75, Math.sqrt(Q_PIXELS[q.level] / (w * h))));
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  /** El ajuste de color va dentro del sombreado de cada material (ver gradeChunk): se deja puesto antes de preparar la escena. */
  _gradeOn() {
    const chunk = gradeChunk(this.kawaii ? LOOK.kawaii.grade : LOOK.grade);
    if (!chunk) return;
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk; // (lo leen los materiales de ESTE juego al prepararse; las otras pantallas 3D no usan esta función)
    this.renderer.toneMapping = THREE.CustomToneMapping; // con brillo de pantalla completa (computador) no actúa: ahí lo hace GRADE_SHADER
  }

  /** Brillo suave (bloom) con degradación automática si el equipo va lento. Solo en computador: ver «nitidez y calidad en celulares». */
  async _setupPost() {
    if (!this.bloom || this.coarse) return;
    try {
      const base = "../vendor/three-examples/";
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
        import(`${base}postprocessing/EffectComposer.js`),
        import(`${base}postprocessing/RenderPass.js`),
        import(`${base}postprocessing/UnrealBloomPass.js`),
        import(`${base}postprocessing/OutputPass.js`),
        import(`${base}postprocessing/ShaderPass.js`),
      ]);
      const w = Math.max(1, this.els.wrap.clientWidth);
      const h = Math.max(1, this.els.wrap.clientHeight);
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.coarse ? 0 : 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bl = this.kawaii ? LOOK.kawaii.bloom : this.bloom;
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bl.strength, bl.radius, bl.threshold);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      const grade = new ShaderPass(GRADE_SHADER);
      const gr = this.kawaii ? LOOK.kawaii.grade : LOOK.grade;
      grade.uniforms.sat.value = gr.sat;
      grade.uniforms.contrast.value = gr.contrast;
      grade.uniforms.vig.value = gr.vig;
      grade.uniforms.lift.value = gr.lift || 0;
      grade.uniforms.tint.value.set(...(gr.tint || [1, 1, 1]));
      this.composer.addPass(grade);
    } catch (e) {
      console.warn("Postprocesado no disponible:", e);
      this.composer = null;
    }
  }

  async startRun(character, progress) {
    this.character = character;
    if (progress) this.progress = progress;
    await this.init();
    glAcquire(this.renderer);
    this._gradeOn();
    // la música del juego suena desde que se abre (la tarjeta de inicio, la entrada del mundo), no recién al empezar a
    // jugar; los juegos que hacen su propia música (porristas) quedan en silencio hasta que la marcan
    if (this.musicTheme) audio.startMusic(this.musicTheme); else audio.stopMusic();
    this.particles.clear();
    this.popups.clear();
    this._actEnd();
    this._arrive = true; // la primera partida después de abrir el juego empieza con la llegada del Matichico (ver beginPlaying)
    this.arriving = 0;
    this.state = "intro";
    this.reset();
    if (this.kawaii) this._kawaiiScene();
    this.showOverlay("intro");
    this.onIntro?.();
    this.warmUp();
    this._held = false;
    this.running = true;
    this.lastTs = null;
    requestAnimationFrame(this._loop);
  }

  /** Prepara de una vez, con la tarjeta de inicio en pantalla, todos los sombreadores y texturas de la escena, también lo
   * que todavía no se ve (barrios lejanos, el castillo de la meta, premios escondidos). Si no, el celular los prepara la
   * primera vez que aparecen y el juego se congela un momento justo ahí (medido: +2 programas y +2 texturas al llegar a la
   * bandera de Aventura; lo mismo al cruzar a la playa de la Ciudad). Se dibuja un cuadro con todo y luego el normal. */
  warmUp() {
    if (!this.renderer || !this.scene || !this.camera) return;
    const shown = [];
    const culled = [];
    this.scene.traverse((o) => {
      if (!o.visible) { o.visible = true; shown.push(o); }
      if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
    });
    try {
      this.renderer.compile(this.scene, this.camera);
      if (this.composer) this.composer.render(0);
      else this.renderer.render(this.scene, this.camera);
    } catch (e) { /* si algo falla, se prepara solo la primera vez que aparezca, como antes */ }
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    try {
      if (this.composer) this.composer.render(0);
      else this.renderer.render(this.scene, this.camera);
    } catch (e) { /* el próximo cuadro dibuja igual */ }
  }

  /** Estilo kawaii del escenario: sombreado por tonos (no a los personajes) y pétalos/estrellitas flotando. */
  _kawaiiScene() {
    toonify(this.scene);
    if (!this.ambient) this.ambient = makeAmbient(this.scene, this.ambientOpts || {});
  }

  beginPlaying() {
    if (this.state === "playing") return;
    this._actEnd();
    if (!this._payEnergy()) return;
    this._em = {}; // contadores del gasto por acción (ver meterEnergy / countEnergy)
    this._ec = {};
    this._eT = 0;
    this._lowWarned = false;
    this.state = "playing";
    this.showOverlay(null);
    if (this.musicTheme) audio.startMusic(this.musicTheme);
    this.onBegin?.();
    if (this.mission) this.banner(`🎯 Misión ${this.mission.n}: ${this.mission.text}`);
    if (this._arrive) { this._arrive = false; this._hello(); }
    this._ghostStart();
  }

  // ---------- el fantasma: tu mejor partida, a esta misma altura (sin servidor: se guarda en el perfil) ----------

  /**
   * Los juegos sin fin que quieren fantasma dicen con qué nombre se guarda su mejor partida (uno por modo de juego);
   * null = sin fantasma (niveles y misiones cambian de una partida a otra: ahí no hay con qué comparar).
   */
  get ghostKey() { return null; }

  /** Al empezar: si hay una mejor partida guardada de este modo, se juega contra ella. */
  _ghostStart() {
    const key = this.ghostKey;
    this._gh = null;
    if (key && this.progress) {
      const saved = (this.progress.ghosts || {})[key];
      this._gh = { key, t: 0, next: GHOST_EVERY, trace: [], ref: saved && Array.isArray(saved.s) && saved.s.length ? saved : null };
    }
    this._ghostPaint();
  }

  /** Cada cuadro: anota el puntaje cada 2 segundos y actualiza el marcador. */
  _ghostStep(dt) {
    const g = this._gh;
    if (!g || this.state !== "playing") return;
    g.t += dt;
    if (g.t < g.next) return;
    g.next += GHOST_EVERY;
    if (g.trace.length < GHOST_MAX) g.trace.push(Math.round(this.score || 0));
    this._ghostPaint();
  }

  /** El marcador «👻 Vas 120 puntos adelante de tu récord»: la diferencia con la mejor partida en este mismo momento. */
  _ghostPaint() {
    const g = this._gh;
    if (!this.ghostEl) {
      if (!g || !g.ref || !this.els.wrap) return;
      this.ghostEl = document.createElement("div");
      this.ghostEl.title = "Tu mejor partida, a esta misma altura";
      this.els.wrap.appendChild(this.ghostEl);
    }
    if (!g || !g.ref) { this.ghostEl.className = "g3d-ghost off"; return; }
    const i = g.trace.length - 1;
    const ref = i < 0 ? 0 : i < g.ref.s.length ? g.ref.s[i] : g.ref.best; // (si ya duraste más que esa vez, se compara con su puntaje final)
    const diff = Math.round(this.score || 0) - ref;
    this.ghostEl.className = `g3d-ghost ${diff >= 0 ? "up" : "down"}`;
    const n = Math.abs(diff), pts = n === 1 ? "punto" : "puntos";
    this.ghostEl.textContent = diff === 0 ? "👻 Vas igual que tu récord" : diff > 0 ? `👻 Vas ${n} ${pts} adelante de tu récord` : `👻 Vas ${n} ${pts} atrás de tu récord`;
  }

  /** Al terminar: si esta partida fue la mejor de su modo, pasa a ser el nuevo fantasma. */
  _ghostEnd() {
    const g = this._gh;
    this._gh = null;
    if (this.ghostEl) this.ghostEl.className = "g3d-ghost off";
    const score = Math.round(this.score || 0);
    if (!g || !this.progress || g.trace.length < 3 || score <= ((g.ref && g.ref.best) || 0)) return;
    this.progress.ghosts = this.progress.ghosts && typeof this.progress.ghosts === "object" ? this.progress.ghosts : {};
    this.progress.ghosts[g.key] = { s: g.trace, best: score };
    saveProgress(this.progress);
  }

  /** Cada partida gasta energía (ver js/energy.js). Sin energía no empieza: se avisa y se queda en la tarjeta de inicio. */
  _payEnergy() {
    const cost = costOf(this.gameId);
    if (!(cost > 0) || !this.progress) return true;
    if (spendEnergy(this.progress, cost)) return true;
    try { window.dispatchEvent(new CustomEvent("no-energy", { detail: { need: cost, game: this.gameId } })); } catch (e) { /* sin ventana */ }
    return false;
  }

  /**
   * Gasto de energía DURANTE la partida (además de la entrada): cada tiro, cada pieza, cada movimiento, cada tanto
   * de camino... Devuelve false si no alcanzó (la partida termina con un aviso amable y se conserva el puntaje).
   */
  spendAction(n = 1) {
    if (!(n > 0) || !this.progress || this.state !== "playing") return true;
    if (spendEnergy(this.progress, n)) {
      this._showSpend(n);
      return true;
    }
    this._outOfEnergy();
    return false;
  }

  /** Gasta `cost` cada vez que `value` cruza un múltiplo de `every` (distancia, altura, piezas, rebotes...). */
  meterEnergy(key, value, every, cost = 1) {
    if (this.state !== "playing") return true;
    if (!this._em) this._em = {};
    const k = Math.floor(value / every);
    while ((this._em[key] || 0) < k && this.state === "playing") {
      this._em[key] = (this._em[key] || 0) + 1;
      if (!this.spendAction(cost)) return false;
    }
    return true;
  }

  /** Cuenta una acción (un tiro, una pieza...) y gasta `cost` cada `every` veces. */
  countEnergy(key, every = 1, cost = 1) {
    if (this.state !== "playing") return true;
    if (!this._ec) this._ec = {};
    this._ec[key] = (this._ec[key] || 0) + 1;
    return this._ec[key] % every === 0 ? this.spendAction(cost) : true;
  }

  _outOfEnergy() {
    try { window.dispatchEvent(new CustomEvent("no-energy", { detail: { need: 1, game: this.gameId, mid: true } })); } catch (e) { /* sin ventana */ }
    this.haptic(60);
    if (this.onNoEnergy) this.onNoEnergy();
    else this.finish("😴 ¡Matichico se quedó sin energía! Descansa un ratito (o duerme en tu casa) y sigue jugando.", "animo");
  }

  /** Cartelito "-1 ⚡ 73" arriba al centro cada vez que se gasta, y aviso cuando queda poca. */
  _showSpend(n) {
    const left = Math.floor(energyOf(this.progress).v);
    let el = document.getElementById("game-energy");
    if (!el) {
      el = document.createElement("div");
      el.id = "game-energy";
      el.className = "game-energy hidden";
      document.body.appendChild(el);
    }
    el.innerHTML = `<b>-${n}</b> ⚡ <span>${left}</span>`;
    el.classList.toggle("low", left <= 10);
    el.classList.remove("hidden", "pop");
    void el.offsetWidth;
    el.classList.add("pop");
    clearTimeout(this._enHide);
    this._enHide = setTimeout(() => el.classList.add("hidden"), 2600);
    if (left <= 10 && !this._lowWarned) {
      this._lowWarned = true;
      this.banner(`🔋 ¡Poca energía! Te quedan ${left} ⚡`);
    }
  }

  // ---------- modo misiones (juegos sin fin) ----------
  // Cada juego trae `missionId` (clave en js/missions.js) y `getMetric(nombre)`; aquí se revisa la meta.

  /** Llamar desde reset(): deja lista la misión elegida (o ninguna, en modo infinito). */
  setupMission() {
    const id = this.missionId || this.gameId;
    this.mission = campaignMode(this.progress, id, "missions") === "missions" ? missionFor(id, campaignLevel(this.progress, id)) : null;
    this._missionWon = false;
    this._mt = 0;
    const chip = this.els.q && this.els.q("hud-goal");
    if (chip) {
      chip.classList.toggle("hidden", !this.mission);
      this._goalText = chip.querySelector("span");
      if (this.mission && this._goalText) this._goalText.textContent = `${this.mission.text} · 0/${this.mission.target}`;
    }
  }

  _missionTick(dt) {
    if (!this.mission || this.state !== "playing" || !this.getMetric) return;
    this._mt -= dt;
    if (this._mt > 0) return;
    this._mt = 0.2;
    const v = Math.floor(this.getMetric(this.mission.metric) || 0);
    if (this._goalText) this._goalText.textContent = `${this.mission.text} · ${Math.min(v, this.mission.target)}/${this.mission.target}`;
    if (v >= this.mission.target) {
      this._missionWon = true;
      const n = this.mission.n;
      if (n >= LEVELS_PER_GAME) {
        campaignWin(this.progress, this.missionId || this.gameId, n, 3);
        const t = this.els.q("gameover-title");
        if (t) t.textContent = `¡Completaste las ${LEVELS_PER_GAME} misiones! 🏆`;
        audio.playVictory();
        this.finish(`Cumpliste la misión final: ${this.mission.text.toLowerCase()}.`, "gran");
      } else this.levelWin({ level: n, stars: 3, text: `¡Misión cumplida: ${this.mission.text.toLowerCase()}!`, title: `¡Misión ${n} cumplida!` });
    }
  }

  /** Pasa a la siguiente misión (botón "Siguiente" de la tarjeta de misión cumplida). */
  nextMission() {
    const id = this.missionId || this.gameId;
    campaign(this.progress, id).selected = Math.min(LEVELS_PER_GAME, (this.mission ? this.mission.n : 1) + 1);
    this.particles.clear();
    this.popups.clear();
    this.state = "intro";
    this.reset();
    this.beginPlaying();
  }

  /** Cartel grande en el centro del escenario ("¡Zona 2!", "¡Combo x5!"...). */
  banner(text) {
    const el = this.els.banner;
    if (!el) return;
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  /**
   * Momento de gloria (gol, canasta, hoyo en uno...): por un instante el juego va en cámara lenta, la cámara se acerca
   * y gira hacia `focus`, aparecen las franjas de cine y suena un golpe. No usa efectos de pantalla completa: solo
   * cambia el tiempo, el ángulo de la cámara y dos franjas de HTML, así que corre igual en celulares baratos.
   * `slow` = velocidad del juego (1 = sin cámara lenta), `hold` = cuánto dura, `zoom` = cuánto se acerca (0 a 0,4).
   */
  glory(focus, { slow = 0.3, hold = 0.55, zoom = 0.22, bars = true, sound = true } = {}) {
    if (this._gl) return; // ya hay uno en curso
    let calm = false;
    try { calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* sin matchMedia */ }
    if (sound) {
      audio.duck(0.22, hold + 0.3, 0.7); // la música se agacha un instante...
      audio.playGlory(0.09); // ...y en ese silencio corto cae el golpe
    }
    if (calm) return; // con "reducir movimiento": solo el sonido
    this._gl = { focus: focus ? focus.clone() : null, slow, zoom, hold, t: 0, w: 0, fov: this.camera.fov };
    if (bars) this._cineBars(true);
    this.face("wow", hold + 0.5);
  }

  /** Avanza el momento de gloria con el tiempo REAL y devuelve a qué velocidad corre el juego (1 = normal). */
  _gloryStep(real) {
    const g = this._gl;
    if (!g) return 1;
    const IN = 0.12, OUT = 0.45;
    g.t += real;
    const ease = (x) => x * x * (3 - 2 * x);
    if (g.t < IN) g.w = ease(g.t / IN);
    else if (g.t < IN + g.hold) g.w = 1;
    else if (g.t < IN + g.hold + OUT) g.w = 1 - ease((g.t - IN - g.hold) / OUT);
    else {
      this._gloryEnd();
      return 1;
    }
    return 1 + (g.slow - 1) * g.w;
  }

  /** Termina el momento de gloria y deja la cámara como la tenía el juego. */
  _gloryEnd() {
    const g = this._gl;
    if (!g) return;
    this.camera.fov = g.fov;
    this.camera.updateProjectionMatrix();
    if (g.lastQ && this.camera.quaternion.equals(g.lastQ)) this.camera.quaternion.copy(g.baseQ);
    this._gl = null;
    this._cineBars(false);
  }

  /** Después de que el juego puso su cámara: acercamiento y giro hacia el punto del momento de gloria. */
  _gloryCamera() {
    const g = this._gl;
    if (!g || g.w <= 0) return;
    this.camera.fov = g.fov * (1 - g.zoom * g.w);
    this.camera.updateProjectionMatrix();
    if (g.focus) {
      // Si el juego no movió su cámara en este cuadro (cámara fija, como la del billar), se parte de su ángulo
      // original y no del que dejó el cuadro anterior: si no, el giro se iría sumando.
      if (g.lastQ && this.camera.quaternion.equals(g.lastQ)) this.camera.quaternion.copy(g.baseQ);
      g.baseQ = this.camera.quaternion.clone();
      this.camera.lookAt(g.focus);
      const q1 = this.camera.quaternion.clone();
      this.camera.quaternion.copy(g.baseQ).slerp(q1, 0.7 * g.w);
      g.lastQ = this.camera.quaternion.clone();
    }
  }

  /** Franjas negras de cine arriba y abajo del escenario (dos tiras de HTML que entran y salen). */
  _cineBars(on) {
    const wrap = this.els.wrap;
    if (!wrap) return;
    if (!this._bars) {
      this._bars = ["top", "bottom"].map((k) => { const d = document.createElement("div"); d.className = `cine-bar cine-${k}`; d.setAttribute("aria-hidden", "true"); wrap.appendChild(d); return d; });
      void wrap.offsetWidth; // para que la primera vez también entren deslizándose
    }
    for (const b of this._bars) b.classList.toggle("on", on);
  }

  /** Vibración corta en el celular (golpes, premios). */
  haptic(ms = 30) {
    vibrate(ms); // en la app: vibración nativa (también en iPhone); en la web: navigator.vibrate si existe
  }

  /** Pausa del cuadro ⏸: el juego queda quieto (no avanza el tiempo ni la física) hasta que se suelte. */
  setPaused(on) {
    this._held = !!on;
  }

  retry() {
    this._actEnd();
    this.particles.clear();
    this.popups.clear();
    this.state = "intro";
    this.reset();
    this.beginPlaying();
  }

  pauseForMenu() {
    audio.stopMusic();
    this._gloryEnd();
    this._actEnd();
    if (this.running) reportScore(this.progress, this.gameId, this.score || 0);
    this._held = false;
    this.running = false;
    this.state = "paused";
  }

  showOverlay(name) {
    Object.entries(this.els.overlays).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
    if (!name) Object.values(this.els.overlays).forEach((el) => el.classList.add("hidden"));
  }

  /**
   * Nivel de la campaña ganado (no es el final de la partida): desbloquea el siguiente, guarda
   * estrellas, da puntos/XP y muestra la tarjeta "¡Nivel completado!" (overlay "win").
   */
  levelWin({ level, stars, text, title }) {
    if (this.state === "gameover") return;
    audio.stopMusic();
    audio.playMissionComplete();
    this.state = "win";
    campaignWin(this.progress, this.missionId || this.gameId, level, stars);
    reportScore(this.progress, this.gameId, this.score || 0);
    const bonus = runBonus(this.gameId, this.score || 0) + stars;
    earnCoins(this.progress, bonus);
    const run = recordRun(this.progress, this.gameId, this.score || 0, this.runInfo || {});
    this.runInfo = null;
    saveProgress(this.progress);
    const e = this.els;
    if (e.stars) e.stars.innerHTML = [1, 2, 3].map((n) => `<span class="${n <= stars ? "on" : "off"}">★</span>`).join("");
    if (e.winTitle) e.winTitle.textContent = title || `¡Nivel ${level} completado!`;
    if (e.winText) e.winText.textContent = `${text} +${bonus} Matipuntos 🍫✨ +${run.xp} XP${run.stars ? ` +${run.stars} ⭐` : ""}`;
    // al terminar el último nivel el botón pasa a ser "Nueva vuelta" (con premio) en vez de repetir el nivel 20
    const campId = this.missionId || this.gameId;
    const nb = e.q && e.q("btn-next");
    this._lapNext = level >= LEVELS_PER_GAME && campaignComplete(this.progress, campId);
    if (nb) {
      if (!nb.dataset.orig) nb.dataset.orig = nb.textContent;
      if (this._lapNext) {
        const r = lapReward(this.progress, campId);
        nb.textContent = `🔄 Nueva vuelta (🍫✨ ${r.coins} y ${r.packs} 🎴)`;
        if (e.winTitle) e.winTitle.textContent = "🏆 ¡Completaste todos los niveles!";
      } else if (IS_DEMO && !demoAllows(campId, level + 1)) nb.textContent = "📲 Sigue en la app";
      else nb.textContent = nb.dataset.orig;
    }
    this.haptic(60);
    // primero actúa el Matichico (3 estrellas: salto con vuelta · 2: festejo y saludo · 1: aplauso corto) y después sale la tarjeta
    this._finalAct(stars >= 3 ? "gran" : stars === 2 ? "bien" : "justo", () => {
      this.showOverlay("win");
      // celebración: confeti y un "ding" por cada estrella, al ritmo en que aparecen (ver .g3d-stars en el CSS)
      celebrate({ big: stars >= 3 });
      [0.15, 0.4, 0.65].slice(0, stars).forEach((t) => setTimeout(() => { if (this.state === "win") audio.playStar(); }, t * 1000 + 250));
    });
  }

  /** Después del último nivel: empieza una vuelta nueva (premio + niveles desde el 1). */
  startNewLap() {
    const got = campaignStartOver(this.progress, this.missionId || this.gameId);
    this._lapNext = false;
    if (got) { try { window.dispatchEvent(new CustomEvent("lap-start", { detail: got })); } catch (e) { /* sin ventana */ } }
    this.retry(); // arranca otra vez, ahora desde el nivel 1
  }

  /**
   * Cierra la partida: guarda puntaje/ranking y muestra el resumen. Antes de la tarjeta el Matichico actúa según cómo le fue
   * (`mood`: "gran" | "bien" | "justo" | "animo"; `false` = sin acto). Si el juego no lo dice, se deduce: récord o recién sonó
   * la victoria = "gran"; recién sonó "perdiste" = "animo"; si no, "bien" cuando hubo puntos.
   */
  finish(text, mood) {
    if (this.state === "gameover") return; // ya terminó (p. ej. se acabó la energía justo antes)
    audio.stopMusic();
    this.state = "gameover";
    this._ghostEnd();
    if (this.mission && !this._missionWon) text = `🎯 Misión ${this.mission.n} (${this.mission.text.toLowerCase()}): ¡todavía no! ${text}`;
    const record = (this.score || 0) > 0 && reportScore(this.progress, this.gameId, this.score);
    if (record) text = `🏆 ¡Nuevo récord: ${this.score}! ${text}`;
    addToLeaderboard(this.progress, this.gameId, this.progress.playerName, this.score);
    // Matipuntos por terminar la partida, según el puntaje (cada juego puntúa distinto)
    const bonus = Math.round(runBonus(this.gameId, this.score) * (this.bonusMult || 1)); // algunos juegos dan más con mejoras (p. ej. autos del garaje)
    if (bonus > 0) {
      earnCoins(this.progress, bonus);
      saveProgress(this.progress);
      text += ` Por jugar ganas +${bonus} Matipuntos 🍫✨.`;
    }
    const run = recordRun(this.progress, this.gameId, this.score, this.runInfo || {});
    this.runInfo = null;
    text += ` +${run.xp} XP${run.stars ? ` +${run.stars} ⭐` : ""}`;
    if (run.tokens) text += ` +${run.tokens} ${run.eventToken}`;
    if (this.els.gameoverText) this.els.gameoverText.textContent = text;
    if (mood === undefined) {
      const cue = audio.recentCue();
      mood = record || cue === "victory" ? "gran" : cue === "lose" ? "animo" : (this.score || 0) > 0 ? "bien" : "animo";
    }
    this._finalAct(mood, () => {
      this.showOverlay("gameover");
      if (record) { celebrate({ big: true }); audio.playVictory(); }
    });
  }

  // ---------- el Matichico como actor (gestos y mirada: ver hero.act y hero.lookAt en matichico3d.js) ----------

  /** El Matichico de quien juega (los juegos de equipos indican cuál es el suyo). */
  get actor() {
    return this.hero || this.mascot || this.driver || null;
  }

  /** El actor, si está a la vista en la escena (hay juegos que lo guardan o lo esconden). */
  _actorReady() {
    const a = this.actor;
    if (!a || !a.act || !a.group) return null;
    for (let o = a.group; o; o = o.parent) {
      if (!o.visible) return null;
      if (o === this.scene) return a;
    }
    return null;
  }

  /** Cara del Matichico por un rato: "wow" (sorpresa), "ay" (golpe), "feliz", "pena". */
  face(name, secs = 1) {
    const a = this.actor;
    if (a && a.face) a.face(name, secs);
  }

  _calm() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  /** Llegada: al empezar la primera partida el Matichico mira a quien juega y saluda (un segundo; no detiene el juego). */
  _hello() {
    if (this._calm()) return; // con "reducir movimiento" no hay llegada ni saludo
    this.arriving = 1; // de 1 a 0 en poco más de un segundo: los juegos con vehículo lo usan para entrar en escena
    const a = this.hello === false ? null : this._actorReady();
    if (!a) return;
    a.act("hola");
    a.lookAt(this.camera.position, 1);
    this._helloHero = a;
  }

  /**
   * Acto final: antes de la tarjeta de resultado la cámara se acerca al Matichico, que se da vuelta a mirar a quien juega
   * y actúa según cómo le fue ("gran": salto con vuelta · "bien": festejo y saludo · "justo": aplauso corto · "animo": se
   * encoge de hombros y se anima de nuevo). Dura poco más de un segundo y recién ahí sale la tarjeta (`show`).
   * La partida ya terminó: solo cambian la cámara, el gesto y el momento en que aparece la tarjeta. No usa efectos de
   * pantalla completa. Con "reducir movimiento", o si el juego no tiene al Matichico a la vista, la tarjeta sale al tiro.
   */
  _finalAct(mood, show) {
    const a = mood && this.finalAct !== false && this.running && !this._calm() ? this._actorReady() : null;
    if (!a) { show(); return; }
    this._gloryEnd();
    this._helloHero = null;
    if (this.els.banner) this.els.banner.classList.remove("show"); // el cartel del centro taparía la cara (la tarjeta repite el motivo)
    a.act(mood);
    audio.playAct(mood); // la barra, las palmas o las notas de ánimo que acompañan el gesto
    this._act = {
      hero: a, show, state: this.state, t: 0, secs: { gran: 1.75, bien: 1.35, justo: 1.2, animo: 1.45 }[mood] || 1.3, frames: a.frames, side: 0,
      baseP: new THREE.Vector3(), baseQ: new THREE.Quaternion(), lastP: null, lastQ: new THREE.Quaternion(),
    };
    this._cineBars(true);
  }

  /** Avanza el saludo de llegada y el acto final (con el tiempo real, después de que el juego puso su cámara). */
  _actStep(real) {
    if (this.arriving > 0) this.arriving = Math.max(0, this.arriving - real / 1.15);
    if (this._helloHero && !this._helloHero.acting) { this._helloHero.lookAt(null); this._helloHero = null; }
    const A = this._act;
    if (!A) return;
    A.t += real;
    if (A.hero.frames === A.frames) A.hero.animate(this.time, "idle", 1); // el juego no lo animó en este cuadro
    A.frames = A.hero.frames;
    this._actCamera(A);
    if (!A.shown && A.t >= A.secs) {
      A.shown = true;
      this._cineBars(false);
      if (this.state === A.state) A.show();
    }
  }

  /** Cámara del acto final: se acerca al Matichico por la misma línea por la que ya lo miraba el juego. */
  _actCamera(A) {
    const cam = this.camera, h = A.hero;
    // la pose que puso el juego en este cuadro (si no la movió, la suya de antes y no la que dejó el acto)
    if (A.lastP && cam.position.equals(A.lastP) && cam.quaternion.equals(A.lastQ)) { cam.position.copy(A.baseP); cam.quaternion.copy(A.baseQ); }
    A.baseP.copy(cam.position);
    A.baseQ.copy(cam.quaternion);
    const head = h.head.getWorldPosition(_actV1);
    const tall = 1.75 * h.group.getWorldScale(_actV2).y; // alto del personaje
    const dir = _actV2.copy(A.baseP).sub(head);
    const d0 = dir.length() || 1;
    let yaw = Math.atan2(dir.x, dir.z);
    const el = clamp(Math.asin(clamp(dir.y / d0, -1, 1)), 0.06, 0.4); // ni desde el suelo ni desde muy arriba
    const front = h.group.getWorldDirection(_actV3); // hacia dónde mira el personaje
    const rel = Math.atan2(Math.sin(yaw - Math.atan2(front.x, front.z)), Math.cos(yaw - Math.atan2(front.x, front.z)));
    if (!A.side) A.side = rel < 0 ? -1 : 1;
    if (h.seated && Math.abs(rel) > 2.15) {
      // va sentado (lancha, auto, avioneta) y la cámara lo mira de atrás: la cámara se corre a un costado, hasta donde él alcanza a darse vuelta
      yaw += A.side * 2.15 - rel;
      h.lookAt(cam.position, A.side);
    } else h.lookAt(cam.position);
    // tan cerca que el Matichico ocupe cerca de la mitad del alto (y quepa a lo ancho con los brazos arriba), sin alejarse nunca
    const tan = Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.min(d0, Math.max(tall / (0.5 * 2 * tan), (1.1 * tall) / (0.8 * 2 * tan * cam.aspect)));
    const to = _actV3.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(dist).add(head);
    const w = Math.min(1, A.t / 0.55);
    const k = w * w * (3 - 2 * w);
    cam.position.copy(A.baseP).lerp(to, k);
    head.y -= tall * 0.2; // encuadre: de la cabeza un poco hacia el cuerpo
    cam.lookAt(head);
    _actQ.copy(cam.quaternion);
    cam.quaternion.copy(A.baseQ).slerp(_actQ, k);
    (A.lastP || (A.lastP = new THREE.Vector3())).copy(cam.position);
    A.lastQ.copy(cam.quaternion);
  }

  /** Termina el acto final (o el saludo) y deja la cámara y al Matichico como los tenía el juego. */
  _actEnd() {
    if (this._helloHero) { this._helloHero.act(null); this._helloHero.lookAt(null); this._helloHero = null; }
    const A = this._act;
    if (!A) return;
    this._act = null;
    if (A.lastP && this.camera.position.equals(A.lastP) && this.camera.quaternion.equals(A.lastQ)) { this.camera.position.copy(A.baseP); this.camera.quaternion.copy(A.baseQ); }
    A.hero.act(null);
    A.hero.lookAt(null);
    this._cineBars(false);
  }

  _loop(ts) {
    if (!this.running) return;
    this.renderer.__glUse = ts; // es el juego en uso: si hace falta soltar un contexto, que sea otro (ver glEvict)
    if (this._held) { this.lastTs = null; requestAnimationFrame(this._loop); return; } // en pausa: quieto, sin gastar
    if (this.lastTs == null) this.lastTs = ts;
    let dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this._freeze > 0) {
      this._freeze -= dt;
      if (this.composer) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this._loop);
      return;
    }
    const real = dt;
    dt *= this._gloryStep(real); // momento de gloria: el juego corre más lento un instante (ver glory)
    this.time += dt;
    this._adaptQuality(real);
    this.update(dt);
    this._ghostStep(dt);
    // Sonido de fondo de este cuadro: el ambiente del mundo (`soundscape`), el motor (`motor` y `motorSpeed`) y el apuro
    // de los últimos segundos (`hurry`). Los pone cada juego; si el juego se detiene, se apagan solos (ver audio.scene).
    const st = this.state;
    audio.scene(st === "intro" || st === "paused" ? null : this.soundscape || null, st === "playing" ? this.motor || null : null, this.motorSpeed || 0, st === "playing" && !!this.hurry);
    this._paintSky();
    this._gloryCamera();
    this._actStep(real);
    this._missionTick(dt);
    if (this.state === "playing" && this.energyEvery) {
      // juegos de correr/avanzar sin acciones claras: gastan 1 cada cierto tiempo
      this._eT = (this._eT || 0) + dt;
      if (this._eT >= this.energyEvery) { this._eT -= this.energyEvery; this.spendAction(1); }
    }
    if (this.state === "playing" && this.progress) {
      // tiempo jugado (para los logros de constancia); se guarda cada ~10 s
      this._playAcc = (this._playAcc || 0) + dt;
      if (this._playAcc >= 10) {
        this.progress.stats.playSecs = (this.progress.stats.playSecs || 0) + this._playAcc;
        this._playAcc = 0;
        saveProgress(this.progress);
      }
    }
    if (this.ambient) this.ambient.update(this.time, dt, this.camera.position);
    this.particles.update(dt);
    this.popups.update(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  /**
   * Celulares: cada 90 cuadros se mira a cuántos cuadros por segundo va el juego. Si va lento, baja un nivel (dos si va
   * muy lento); si va sobrado jugando, prueba un nivel más y se lo queda solo si sigue fluido. Lo aprendido se guarda
   * por juego en el teléfono, así la próxima vez parte donde corresponde y no se nota el ajuste.
   */
  _adaptPhone(dt) {
    const q = this.quality;
    if (q.fixed) return;
    if (this.qualityDone && this.state !== "playing") return; // después de calibrar, solo se mide jugando
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (q.trial) {
      // venía probando un nivel más: se queda solo si sigue fluido; si no, vuelve y no lo intenta más en este juego
      q.trial = false;
      if (avg > Q_KEEP) { q.cap = q.level - 1; this._setLevel(q.level - 1); }
      else qWrite(this.gameId, { l: q.level, c: q.cap });
      return;
    }
    if (avg > Q_SLOW) {
      q.fast = 0;
      // al empezar se baja al tiro; más adelante hacen falta dos tramos lentos seguidos (un tirón suelto no cuenta)
      if (this.qualityDone && ++q.slow < 2) return;
      q.slow = 0;
      q.down = true;
      if (q.level > Q_MIN) this._setLevel(q.level - (avg > 0.047 && q.level - 2 >= Q_MIN ? 2 : 1));
      else this.qualityDone = true;
      return;
    }
    this.qualityDone = true;
    q.slow = 0;
    if (avg > Q_FAST || this.state !== "playing" || q.down) { q.fast = 0; return; }
    if (++q.fast < 2) return;
    q.fast = 0;
    if (q.level <= Q_MIN) { qWrite(this.gameId, { l: Q_MIN + 1, c: q.cap }); return; } // en lo mínimo y sobrado: la próxima vez parte un nivel más arriba
    if (q.level < q.cap) { q.trial = true; this._setLevel(q.level + 1, false); }
  }

  /** Cambia el nivel de calidad del celular (resolución y, en el más bajo, las sombras) y lo deja guardado. */
  _setLevel(level, save = true) {
    const q = this.quality;
    q.level = clampQ(level);
    if (q.level <= Q_MIN) this.onLowQuality?.();
    if (save) qWrite(this.gameId, { l: q.level, c: q.cap });
    this._onResize();
  }

  _adaptQuality(dt) {
    if (this.quality) return this._adaptPhone(dt);
    if (this.qualityStep >= 3) return; // ya está en lo mínimo (sin brillo, menos resolución y sin sombras)
    if (this.qualityDone && this.state !== "playing") return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (!this.qualityDone) {
      // calibración al empezar: baja un escalón cada ~3 s mientras vaya lento
      if (avg <= 0.034) this.qualityDone = true;
      else this._qualityDown();
      return;
    }
    // y después sigue mirando: si el juego se pone pesado más adelante (otra zona del mapa, el final de un nivel),
    // con dos tramos lentos seguidos (~6 s bajo 24 cuadros por segundo) baja otro escalón
    if (avg > 0.042) {
      this._slowSpans = (this._slowSpans || 0) + 1;
      if (this._slowSpans >= 2) { this._slowSpans = 0; this._qualityDown(); }
    } else this._slowSpans = 0;
  }

  _qualityDown() {
    this.qualityStep++;
    if (this.qualityStep === 1 && this.composer) {
      this.composer = null; // 1) sin brillo
    } else if (this.qualityStep <= 2) {
      this.composer = null;
      this.pixelRatio = Math.max(0.6, this.pixelRatio * 0.75); // 2) menos resolución
      this.renderer.setPixelRatio(this.pixelRatio);
      this._onResize();
    } else {
      this.onLowQuality?.(); // 3) sin sombras
      this.qualityStep = 3;
      this.qualityDone = true;
    }
  }

  playSound(name) {
    audio[name]?.();
  }
}

/** Libera de la GPU todo lo que cuelga de un objeto (geometrías, materiales y sus texturas). Si algo
 * compartido se vuelve a usar, three.js lo sube de nuevo solo; lo importante es no acumular al reiniciar. */
export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of ["map", "emissiveMap", "alphaMap", "normalMap", "roughnessMap"]) if (m[k]) m[k].dispose();
      m.dispose();
    }
  });
}

/** Libera solo las geometrías de un objeto (para lo que se crea y se quita todo el rato, con materiales compartidos). */
export function disposeGeometries(obj) {
  obj.traverse((o) => { if (o.geometry && !o.isSprite) o.geometry.dispose(); }); // los sprites comparten una sola geometría
}

// ---------- estilo "anime": sombreado por tonos (cel-shading) y contorno ----------
let toonGradTex = null;
function toonGradient() {
  if (!toonGradTex) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 1;
    const x = c.getContext("2d");
    ["#7a6c94", "#b3a6c8", "#dcd2e8", "#f4eef9"].forEach((col, i) => { x.fillStyle = col; x.fillRect(i, 0, 1, 1); });
    toonGradTex = new THREE.CanvasTexture(c);
    toonGradTex.minFilter = THREE.LinearFilter;
    toonGradTex.magFilter = THREE.LinearFilter;
    toonGradTex.generateMipmaps = false;
  }
  return toonGradTex;
}

const toonOf = new WeakMap();
function toToon(m) {
  if (!m || m.isMeshToonMaterial || !m.isMeshStandardMaterial) return m;
  if (toonOf.has(m)) return toonOf.get(m);
  const t = new THREE.MeshToonMaterial({
    color: m.color, map: m.map, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
    transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, vertexColors: m.vertexColors,
    flatShading: false, gradientMap: toonGradient(),
  });
  t.color = m.color; // se comparten los colores: si el original cambia (ropa, pelo), el nuevo también
  t.emissive = m.emissive;
  toonOf.set(m, t);
  return t;
}

/** Convierte los materiales estándar de una escena u objeto en materiales "anime" (sombras por tonos, colores planos). */
export function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let a = o; a; a = a.parent) if (a.userData && a.userData.noToon) return; // los personajes se quedan como son
    if (Array.isArray(o.material)) o.material = o.material.map(toToon);
    else o.material = toToon(o.material);
  });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a1410, side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.uniforms.thick = { value: 0.018 };
  sh.vertexShader = sh.vertexShader.replace("void main() {", "uniform float thick;\nvoid main() {").replace("#include <begin_vertex>", "vec3 transformed = position + normalize(normal) * thick;");
};

/** Contorno fino oscuro alrededor de las mallas de un objeto (casco invertido). Solo para personajes y objetos clave. */
export function addOutline(root, thick = 0.018) {
  const add = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline && !o.isInstancedMesh && !o.isSkinnedMesh) add.push(o); });
  for (const m of add) {
    const mat = outlineMat.clone();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.thick = { value: thick };
      sh.vertexShader = sh.vertexShader.replace("void main() {", "uniform float thick;\nvoid main() {").replace("#include <begin_vertex>", "vec3 transformed = position + normalize(normal) * thick;");
    };
    const ol = new THREE.Mesh(m.geometry, mat);
    ol.userData.isOutline = true;
    ol.castShadow = false;
    ol.receiveShadow = false;
    m.add(ol);
  }
}

// ---------- ambiente flotante: pétalos, corazoncitos y estrellitas ----------
function sparkleTexture(kind) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.translate(32, 32);
  if (kind === "petal") {
    x.fillStyle = "#ffc2dc";
    x.beginPath();
    x.ellipse(0, 0, 11, 19, 0.5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "rgba(255,255,255,0.55)";
    x.beginPath();
    x.ellipse(-3, -5, 3, 8, 0.5, 0, Math.PI * 2);
    x.fill();
  } else if (kind === "heart") {
    x.fillStyle = "#ff8fb8";
    x.beginPath();
    x.moveTo(0, 14);
    x.bezierCurveTo(-26, -4, -12, -22, 0, -8);
    x.bezierCurveTo(12, -22, 26, -4, 0, 14);
    x.fill();
  } else {
    x.fillStyle = "#fff6c8";
    x.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 22; const a = (i / 8) * Math.PI * 2 - Math.PI / 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.closePath();
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pétalos que caen despacito, corazoncitos y estrellitas que titilan alrededor de la cámara. `update(t, dt, centro)` cada cuadro. */
export function makeAmbient(parent, { petals = 36, hearts = 10, stars = 26, radius = 16, height = 11, floor = 0 } = {}) {
  const layers = [];
  const mk = (kind, n, size, fall, twinkle) => {
    if (n <= 0) return;
    const pos = new Float32Array(n * 3);
    const off = [];
    for (let i = 0; i < n; i++) off.push({ x: (Math.random() * 2 - 1) * radius, y: Math.random() * height, z: (Math.random() * 2 - 1) * radius, ph: Math.random() * 6.28, v: fall * (0.6 + Math.random() * 0.8) });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: sparkleTexture(kind), size, transparent: true, depthWrite: false, opacity: 0.95, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    pts.userData.noToon = true;
    parent.add(pts);
    layers.push({ pts, geo, mat, off, fall, twinkle, base: size });
  };
  mk("petal", petals, 0.8, 0.5, false);
  mk("heart", hearts, 0.7, 0.28, false);
  mk("star", stars, 0.5, 0.0, true);
  return {
    update(t, dt, c) {
      for (const L of layers) {
        const a = L.geo.attributes.position.array;
        L.off.forEach((o, i) => {
          if (L.fall) {
            o.y -= o.v * dt;
            if (o.y < 0) { o.y = height; o.x = (Math.random() * 2 - 1) * radius; o.z = (Math.random() * 2 - 1) * radius; }
          }
          const sway = Math.sin(t * 0.8 + o.ph) * (L.fall ? 0.8 : 0.15);
          a[i * 3] = c.x + o.x + sway;
          a[i * 3 + 1] = floor + o.y * (L.fall ? 1 : 0.5) + (L.fall ? 0 : 0.6);
          a[i * 3 + 2] = c.z + o.z + Math.cos(t * 0.6 + o.ph) * (L.fall ? 0.6 : 0.1);
        });
        L.geo.attributes.position.needsUpdate = true;
        if (L.twinkle) L.mat.opacity = 0.35 + 0.3 * Math.sin(t * 2.2);
      }
    },
  };
}
