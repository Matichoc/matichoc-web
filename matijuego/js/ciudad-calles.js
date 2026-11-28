// Calles, veredas y pasto de la Ciudad Choco (refresco visual del 28-nov-2026, pedido de la persona dueña: «las líneas
// siguen derecho, no termina bien como la carretera», «pisan los pasos de cebra»).
//
// Antes las calles eran rectángulos encimados: esquinas en punta, la raya amarilla del centro pasaba derecho por encima
// de los cruces y de los pasos de cebra, y la vereda era una losa lisa sin solera. Ahora todo sale de un mismo trazado:
//   - el borde de la calzada es UNA línea cerrada por fuera (anillo + las tres calles que salen a los barrios, con su
//     fondo redondeado) y una por cada manzana, con las esquinas redondeadas;
//   - de esas líneas salen el asfalto (una sola pieza), la solera, la vereda de baldosas y el pasto de cada manzana;
//   - la pintura (raya del centro, pasos de cebra, líneas de detención) se corta sola en los cruces: la raya es
//     continua al llegar a un cruce, se detiene en la línea de detención y nunca pisa un paso de cebra.
// Costo: 5 dibujos por cuadro en total (asfalto, solera, baldosas, pasto y pintura) en vez de ~25, y ~9.000 triángulos.
// Las alturas no cambian (la calzada a 0,03 y la vereda a 0,05, como antes): nada del juego se mueve de lugar.

import { THREE, canvasTexture } from "./three-kit.js?v=bfcb83ff05";

const HALF = 60; // el anillo de calles va de -60 a 60 (igual que en ciudad-game.js)
const RW = 11; // ancho de las calles
const H = RW / 2;
const EDGE = HALF + H; // 65,5: borde exterior del anillo
const STUB_N = 92; // hasta dónde llega la calle del norte (EXTRA_ROADS en ciudad-barrios.js)
const STUB_EW = 84; // y las del este y el oeste
const R_BLOCK = 4; // radio de las esquinas de las manzanas
const R_RING = 12; // radio de las cuatro esquinas de afuera del anillo
const R_JOIN = 3; // radio donde una calle de barrio se junta con el anillo
const CURB = 0.3; // ancho de la solera
const WALK_IN = 2.0; // ancho de la vereda de las manzanas (solera incluida)
const WALK_OUT = 2.2; // y de la de afuera
export const ROAD_Y = 0.03;
export const WALK_Y = 0.05;
const PAINT_Y = 0.045;

const WHITE = [1, 1, 1];
const YELLOW = [1, 0.82, 0.2];
const SHADE = [0.2, 0.2, 0.24]; // la sombrita al pie de la solera

// ---------------------------------------------------------------- trazado

/** Recorre los vértices [x, z, radio] de un polígono y cambia cada esquina por un arco de ese radio. */
function roundLoop(verts, per = 7) {
  const out = [];
  const n = verts.length;
  const push = (x, z) => { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - x, l[1] - z) > 1e-4) out.push([x, z]); };
  for (let i = 0; i < n; i++) {
    const [px, pz] = verts[(i + n - 1) % n], [vx, vz, r = 0] = verts[i], [nx, nz] = verts[(i + 1) % n];
    let ax = vx - px, az = vz - pz, bx = nx - vx, bz = nz - vz;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
    if (!(r > 0) || Math.abs(turn) < 1e-3) { push(vx, vz); continue; }
    const t = r * Math.tan(Math.abs(turn) / 2), sg = Math.sign(turn);
    const sx = vx - ax * t, sz = vz - az * t; // donde empieza el arco
    const cx = sx - az * sg * r, cz = sz + ax * sg * r; // su centro
    const a0 = Math.atan2(sz - cz, sx - cx);
    const k = Math.max(2, Math.ceil((per * Math.abs(turn)) / (Math.PI / 2)));
    for (let j = 0; j <= k; j++) { const a = a0 + turn * (j / k); push(cx + Math.cos(a) * r, cz + Math.sin(a) * r); }
  }
  const f = out[0], l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-4) out.pop();
  return out;
}

/** La misma línea cerrada, corrida `d` metros hacia adentro (negativo = hacia afuera). */
function offsetLoop(loop, d) {
  const n = loop.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = loop[i], b = loop[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const side = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = loop[(i + n - 1) % n], v = loop[i], q = loop[(i + 1) % n];
    let ax = v[0] - p[0], az = v[1] - p[1], bx = q[0] - v[0], bz = q[1] - v[1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    let mx = -az - bz, mz = ax + bx; // suma de las dos normales (a la izquierda del avance)
    const lm = Math.hypot(mx, mz) || 1;
    mx /= lm; mz /= lm;
    const k = (d * side) / Math.max(0.35, mx * -az + mz * ax);
    out.push([v[0] + mx * k, v[1] + mz * k]);
  }
  return out;
}

/** El borde de la calzada: por fuera (anillo y calles de los barrios) y el de cada manzana. */
export function streetLoops() {
  const E = EDGE, N = STUB_N, W = STUB_EW;
  const outer = roundLoop([
    [H, -E, R_JOIN], [E, -E, R_RING], [E, -H, R_JOIN], [W, -H, H], [W, H, H], [E, H, R_JOIN],
    [E, E, R_RING], [-E, E, R_RING],
    [-E, H, R_JOIN], [-W, H, H], [-W, -H, H], [-E, -H, R_JOIN], [-E, -E, R_RING],
    [-H, -E, R_JOIN], [-H, -N, H], [H, -N, H],
  ], 8);
  const blocks = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx * H, x1 = sx * (HALF - H), z0 = sz * H, z1 = sz * (HALF - H);
    blocks.push(roundLoop([[x0, z0, R_BLOCK], [x1, z0, R_BLOCK], [x1, z1, R_BLOCK], [x0, z1, R_BLOCK]], 6));
  }
  return { outer, blocks };
}

// ---------------------------------------------------------------- piezas

class Soup {
  constructor(colors = false) { this.pos = []; this.uv = []; this.col = colors ? [] : null; }

  /** Un triángulo plano mirando hacia arriba. */
  tri(a, b, c, y, color, ua, ub, uc) {
    const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0; // (y de (b-a)×(c-a))
    const [p, q, r] = up ? [a, b, c] : [a, c, b];
    const [up0, uq, ur] = up ? [ua, ub, uc] : [ua, uc, ub];
    this.pos.push(p[0], y, p[1], q[0], y, q[1], r[0], y, r[1]);
    this.uv.push(...(up0 || p), ...(uq || q), ...(ur || r));
    if (this.col) for (let i = 0; i < 3; i++) this.col.push(...color);
  }

  quad(a, b, c, d, y, color, uv) {
    this.tri(a, b, c, y, color, uv && uv[0], uv && uv[1], uv && uv[2]);
    this.tri(a, c, d, y, color, uv && uv[0], uv && uv[2], uv && uv[3]);
  }

  /** Cinta plana entre dos líneas cerradas (o abiertas) del mismo largo: u = metros a lo largo, v = metros a lo ancho. */
  ribbon(inner, outer, y, color, { closed = true, width = 1 } = {}) {
    const n = inner.length, m = closed ? n : n - 1;
    let u = 0;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n;
      const len = Math.hypot(inner[j][0] - inner[i][0], inner[j][1] - inner[i][1]);
      this.quad(inner[i], inner[j], outer[j], outer[i], y, color, [[u, 0], [u + len, 0], [u + len, width], [u, width]]);
      u += len;
    }
  }

  /** Rectángulo de pintura centrado en (x, z): `along` metros en la dirección (dx, dz) y `across` de ancho. */
  rect(x, z, dx, dz, along, across, y, color) {
    const ax = (dx * along) / 2, az = (dz * along) / 2, bx = (-dz * across) / 2, bz = (dx * across) / 2;
    this.quad([x - ax - bx, z - az - bz], [x + ax - bx, z + az - bz], [x + ax + bx, z + az + bz], [x - ax + bx, z - az + bz], y, color);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    const nor = new Float32Array(this.pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    if (this.col) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Relleno de una línea cerrada (con hoyos), acostado en el suelo a la altura `y`. Las UV quedan en metros. */
function fill(loop, holes, y) {
  const toShape = (pts, S) => { const s = new S(); pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z))); s.closePath(); return s; };
  const shape = toShape(loop, THREE.Shape);
  for (const h of holes) shape.holes.push(toShape(h, THREE.Path));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function mergeFlat(geos) {
  const pos = [], uv = [], nor = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- texturas (dibujadas a mano: no pesan en la descarga)

const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

function tiled(tex, every) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / every, 1 / every);
  tex.anisotropy = 4;
  return tex;
}

/** Asfalto: gris con granito fino y manchas suaves (se repite cada 7 metros). */
function asphaltTexture() {
  const r = seeded(31);
  return tiled(canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#5b5c66"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rad = 18 + r() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? "70,71,80" : "104,105,116";
      gr.addColorStop(0, `rgba(${c},0.16)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(140,141,152,${0.12 + r() * 0.2})` : `rgba(52,53,60,${0.12 + r() * 0.22})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 1.4, 1 + r() * 1.4);
    }
  }), 7);
}

/** Baldosas de la vereda: cuatro por metro, cada una de un tono apenas distinto, con su junta. */
function tileTexture() {
  const r = seeded(7);
  return tiled(canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = "#c9bca6"; g.fillRect(0, 0, w, h);
    const n = 2, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = 226 + Math.floor(r() * 16);
      g.fillStyle = `rgb(${k + 6},${k - 4},${k - 22})`;
      g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(i * s + 2, j * s + 2, s - 4, 3);
      g.fillStyle = "rgba(120,100,70,0.10)"; g.fillRect(i * s + 2, j * s + s - 6, s - 4, 3);
    }
  }), 1);
}

/** Pasto: manchas claras y oscuras y hojitas (en tonos de gris: el color lo pone el material; se repite cada 9 metros). */
export function grassTexture() {
  const r = seeded(53);
  return tiled(canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#eeeeee"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, rad = 14 + r() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.55 ? "196,206,190" : "255,255,255";
      gr.addColorStop(0, `rgba(${c},0.5)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
    }
    g.lineCap = "round";
    for (let i = 0; i < 520; i++) {
      const x = r() * w, y = r() * h, a = -Math.PI / 2 + (r() - 0.5) * 1.1, l = 3 + r() * 5;
      g.strokeStyle = r() < 0.6 ? `rgba(170,186,160,${0.35 + r() * 0.3})` : `rgba(255,255,255,${0.4 + r() * 0.3})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }), 9);
}

// ---------------------------------------------------------------- cruces y pintura

// Cada cruce con sus brazos: hacia dónde sale la calle y si lleva paso de cebra pegado al cruce. Los brazos que ya
// tienen un paso de cebra a mitad de cuadra (el de la abuelita Tita y sus tres parecidos) no llevan otro a 10 metros.
const A = (dx, dz, zebra = true) => ({ dx, dz, zebra });
const JUNCTIONS = [
  { x: 0, z: 0, arms: [A(1, 0), A(-1, 0), A(0, 1), A(0, -1)] },
  { x: 0, z: HALF, arms: [A(1, 0), A(-1, 0, false), A(0, -1)] },
  { x: 0, z: -HALF, arms: [A(1, 0, false), A(-1, 0), A(0, 1), A(0, -1)] },
  { x: HALF, z: 0, arms: [A(0, 1), A(0, -1, false), A(-1, 0), A(1, 0)] },
  { x: -HALF, z: 0, arms: [A(0, 1, false), A(0, -1), A(1, 0), A(-1, 0)] },
];
/** Pasos de cebra a mitad de cuadra: [x, z, dx, dz] (la dirección de la calle que cruzan). */
const MID_ZEBRAS = [[-22, HALF, 1, 0], [22, -HALF, 1, 0], [HALF, -22, 0, 1], [-HALF, 22, 0, 1]];
const ZEBRA_AT = 12; // del centro del cruce al centro del paso de cebra (donde ya estaban los del cruce del medio)
const ZEBRA_LEN = 2.6;
const STOP_GAP = 0.6; // del paso de cebra a la línea de detención
const STOP_W = 0.45;
const NEAR = H + R_BLOCK + 0.7; // sin paso de cebra, la línea de detención va justo después de la esquina redondeada
const SOLID = 7; // metros de raya continua antes de la línea de detención

/** Dónde queda el borde de afuera de la línea de detención de un brazo (desde el centro del cruce). */
const stopEnd = (arm) => (arm.zebra ? ZEBRA_AT + ZEBRA_LEN / 2 + STOP_GAP : NEAR) + STOP_W;

/** Qué raya del centro va en (x, z): 0 = discontinua, 1 = continua (llegando a un cruce), 2 = ninguna. */
function centerKind(x, z) {
  let kind = 0;
  for (const j of JUNCTIONS) {
    if (Math.abs(x - j.x) < H && Math.abs(z - j.z) < H) return 2; // adentro del cruce
    for (const a of j.arms) {
      const t = (x - j.x) * a.dx + (z - j.z) * a.dz;
      if (t < 0 || Math.abs((x - j.x) * a.dz - (z - j.z) * a.dx) > 1) continue;
      const end = stopEnd(a);
      if (t <= end) return 2;
      if (t <= end + SOLID) kind = 1;
    }
  }
  for (const [mx, mz, dx, dz] of MID_ZEBRAS) {
    const t = Math.abs((x - mx) * dx + (z - mz) * dz);
    if (Math.abs((x - mx) * dz - (z - mz) * dx) > 1) continue;
    const end = ZEBRA_LEN / 2 + STOP_GAP + STOP_W;
    if (t <= end) return 2;
    if (t <= end + SOLID) kind = 1;
  }
  return kind;
}

/** Pinta la raya del centro a lo largo de un camino de puntos: discontinua, continua cerca de los cruces, cortada en ellos. */
function centerLine(P, path, closed) {
  const pts = closed ? [...path, path[0]] : path;
  const STEP = 0.25, W = 0.24, ON = 2, PERIOD = 4;
  let s = 0, run = null; // run = { a: [x, z], b: [x, z], dx, dz }
  const flush = () => {
    if (run && Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) > 0.3) {
      const len = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]);
      P.rect((run.a[0] + run.b[0]) / 2, (run.a[1] + run.b[1]) / 2, run.dx, run.dz, len, W, PAINT_Y, YELLOW);
    }
    run = null;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    if (run && run.dx * dx + run.dz * dz < 0.9999) flush(); // el camino dobla: se cierra el tramo
    const n = Math.max(1, Math.round(len / STEP));
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * len, t1 = ((k + 1) / n) * len, tm = (t0 + t1) / 2;
      const kind = centerKind(a[0] + dx * tm, a[1] + dz * tm);
      const on = kind === 1 || (kind === 0 && (s + tm) % PERIOD < ON);
      if (on) {
        const p1 = [a[0] + dx * t1, a[1] + dz * t1];
        if (run) run.b = p1; else run = { a: [a[0] + dx * t0, a[1] + dz * t0], b: p1, dx, dz };
      } else flush();
    }
    s += len;
  }
  flush();
}

function zebra(P, x, z, dx, dz) {
  // (dx, dz) = la dirección de la calle: las franjas van a lo largo de la calle y se reparten a lo ancho
  for (let i = 0; i < 9; i++) { const off = (i - 4) * 1.15; P.rect(x - dz * off, z + dx * off, dx, dz, ZEBRA_LEN, 0.7, PAINT_Y, WHITE); }
}

/** Línea de detención: cruza solo la pista de quien llega (se maneja por la derecha), a `t` metros del punto (x, z). */
function stopLine(P, x, z, dx, dz, t) {
  // quien llega avanza hacia (-dx, -dz); su derecha es (dz, -dx)
  const cx = x + dx * t + dz * (RW / 4), cz = z + dz * t - dx * (RW / 4);
  P.rect(cx, cz, dx, dz, STOP_W, RW / 2 - 0.5, PAINT_Y, WHITE);
}

// ---------------------------------------------------------------- todo junto

/**
 * Arma las calles de la ciudad dentro de `scene`. `mats` = { lawn } (el material del pasto de las manzanas, que es del juego).
 * Devuelve las piezas por si el juego quiere tocarlas.
 */
export function buildStreets(scene, mats) {
  const { outer, blocks } = streetLoops();
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow; scene.add(m); return m; };

  // asfalto: una sola pieza con la forma exacta de la calzada
  const road = add(fill(outer, blocks, ROAD_Y), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }));

  // solera y vereda: por dentro de cada manzana y por fuera de todo el borde exterior
  const curb = new Soup(), walk = new Soup(), lawns = [];
  for (const b of blocks) {
    const c = offsetLoop(b, CURB), w = offsetLoop(b, WALK_IN);
    curb.ribbon(b, c, WALK_Y, null, { width: CURB });
    walk.ribbon(c, w, WALK_Y, null, { width: WALK_IN - CURB });
    lawns.push(fill(w, [], WALK_Y));
  }
  const oc = offsetLoop(outer, -CURB), ow = offsetLoop(outer, -WALK_OUT);
  curb.ribbon(outer, oc, WALK_Y, null, { width: CURB });
  walk.ribbon(oc, ow, WALK_Y, null, { width: WALK_OUT - CURB });
  const curbMesh = add(curb.geometry(), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.85 }));
  const walkMesh = add(walk.geometry(), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 }));
  const lawn = add(mergeFlat(lawns), mats.lawn);

  // pintura: todo en una sola pieza con colores por vértice (no recibe luz ni sombra, como la pintura de antes)
  const P = new Soup(true);
  // la sombrita al pie de la solera (le da altura a la vereda sin levantarla)
  for (const b of blocks) P.ribbon(b, offsetLoop(b, -0.14), PAINT_Y - 0.005, SHADE);
  P.ribbon(outer, offsetLoop(outer, 0.14), PAINT_Y - 0.005, SHADE);
  // raya del centro: el anillo (dobla en las cuatro esquinas) y las dos calles del medio con sus salidas a los barrios
  centerLine(P, roundLoop([[-HALF, -HALF, R_RING - H], [HALF, -HALF, R_RING - H], [HALF, HALF, R_RING - H], [-HALF, HALF, R_RING - H]], 8), true);
  centerLine(P, [[0, -(STUB_N - H - 2)], [0, HALF]], false);
  centerLine(P, [[-(STUB_EW - H - 2), 0], [STUB_EW - H - 2, 0]], false);
  for (const j of JUNCTIONS) for (const a of j.arms) {
    if (a.zebra) zebra(P, j.x + a.dx * ZEBRA_AT, j.z + a.dz * ZEBRA_AT, a.dx, a.dz);
    stopLine(P, j.x, j.z, a.dx, a.dz, stopEnd(a) - STOP_W / 2);
  }
  for (const [x, z, dx, dz] of MID_ZEBRAS) {
    zebra(P, x, z, dx, dz);
    const t = ZEBRA_LEN / 2 + STOP_GAP + STOP_W / 2;
    stopLine(P, x, z, dx, dz, t);
    stopLine(P, x, z, -dx, -dz, t);
  }
  const paint = add(P.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false);
  return { road, curb: curbMesh, walk: walkMesh, lawn, paint };
}
