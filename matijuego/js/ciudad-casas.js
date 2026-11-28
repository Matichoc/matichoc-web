// Casas, iglesia y adornos de la Ciudad Choco, inspirados en La Ligua (refresco visual del 28-nov-2026, pedido de la
// persona dueña: «las casas son feísimas… inspirada en una ciudad como La Ligua, como Papudo»).
//
// Antes cada casa era una caja con las ventanas pintadas en la pared y una pirámide de techo (8 dibujos por casa).
// Ahora son casas de pueblo chileno: muro estucado con zócalo, techo de tejas a dos aguas con alero, puerta de madera
// con su marco, ventanas con marco, alféizar y postigos, y algunas con corredor de pilares. Cada casa son 2 dibujos:
// todo lo de color liso va en UNA malla con el color pintado en los vértices (un solo material para toda la ciudad) y
// las tejas en otra (un material por color de techo).

import { THREE, canvasTexture } from "./three-kit.js?v=bfcb83ff05";

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const dim = (rgb, k) => rgb.map((v) => v * k);

/** Cajas y caras de colores lisos, todas en una sola malla (color por vértice). */
export class Solid {
  constructor() { this.pos = []; this.nor = []; this.col = []; }

  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { this.nor.push(nx, ny, nz); this.col.push(...color); }
  }

  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }

  /** Caja centrada en (x, y, z), girada `ry` sobre el eje vertical. `skip` = caras que no se dibujan ("b" = la de abajo). */
  box(w, h, d, x, y, z, color, ry = 0, skip = "b") {
    const hx = w / 2, hy = h / 2, hz = d / 2, co = Math.cos(ry), si = Math.sin(ry);
    const P = (px, py, pz) => [x + px * co + pz * si, y + py, z - px * si + pz * co];
    const F = {
      r: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      l: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
      t: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      b: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
      f: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      k: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
    };
    for (const key of Object.keys(F)) {
      if (skip.includes(key)) continue;
      const [a, b, c, e] = F[key].map((p) => P(...p));
      this.quad(a, b, c, e, color);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Caras con textura (tejas, baldosas): posición, normal y UV en metros. */
class Skin {
  constructor() { this.pos = []; this.nor = []; this.uv = []; }

  quad(a, b, c, d, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const i of [0, 1, 2, 0, 2, 3]) { this.pos.push(...[a, b, c, d][i]); this.nor.push(nx, ny, nz); this.uv.push(...uv[i]); }
  }

  tri(a, b, c, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    [a, b, c].forEach((p, i) => { this.pos.push(...p); this.nor.push(nx, ny, nz); this.uv.push(...uv[i]); });
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- texturas y materiales

const TILE = 1.7; // metros que cubre una repetición de la textura de tejas (4 tejas a lo ancho, 3 hileras)
let tileTex = null;
/** Tejas de arcilla en tonos de gris claro (el color lo pone el material): canales redondeados y la sombra de cada hilera. */
function roofTexture() {
  if (tileTex) return tileTex;
  tileTex = canvasTexture(128, 96, (g, w, h) => {
    const cols = 4, rows = 3, cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw, y = r * rh;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, "#a9a9a9"); gr.addColorStop(0.5, "#ffffff"); gr.addColorStop(1, "#a9a9a9");
      g.fillStyle = gr; g.fillRect(x, y, cw, rh);
      const k = ((c * 7 + r * 13) % 5) * 0.035;
      g.fillStyle = `rgba(90,60,40,${k})`; g.fillRect(x, y, cw, rh);
      const sh = g.createLinearGradient(0, y + rh * 0.55, 0, y + rh);
      sh.addColorStop(0, "rgba(60,40,30,0)"); sh.addColorStop(1, "rgba(60,40,30,0.42)");
      g.fillStyle = sh; g.fillRect(x, y, cw, rh);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x + 4, y + 1, cw - 8, 3);
    }
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(1 / TILE, 1 / TILE);
  return tileTex;
}

const roofMats = {};
/** Material de tejas de un color (uno por color para toda la ciudad). */
export function roofMaterial(color = 0xd9744a) {
  if (!roofMats[color]) roofMats[color] = new THREE.MeshStandardMaterial({ map: roofTexture(), color, roughness: 0.85, side: THREE.DoubleSide });
  return roofMats[color];
}

let solidMat = null;
/** El material de todo lo de color liso (el color viene pintado en cada malla). */
export function solidMaterial() {
  return solidMat || (solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
}

let paverTex = null;
/** Adoquines claros de plaza (se repiten cada 2 metros). */
export function paverTexture() {
  if (paverTex) return paverTex;
  paverTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = "#b9ab93"; g.fillRect(0, 0, w, h);
    const tones = ["#ecdfc8", "#e4d5ba", "#f1e6d2", "#dccdb2"];
    let k = 0;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) {
      const x = c * 32 + (r % 2 ? 16 : 0), y = r * 32;
      g.fillStyle = tones[(k++ * 3 + r) % tones.length];
      g.fillRect(x + 2, y + 2, 28, 28);
      g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x + 2, y + 2, 28, 3);
    }
  });
  paverTex.wrapS = paverTex.wrapT = THREE.RepeatWrapping;
  paverTex.repeat.set(1 / 2, 1 / 2);
  paverTex.anisotropy = 4;
  return paverTex;
}

// ---------------------------------------------------------------- piezas de una casa

const TRIM = lin(0xfff8ec);
const GLASS = lin(0x9fd8f2);
const WOOD = lin(0x7a4a2a);
const STONE = lin(0xd8c8b0);
const GOLD = lin(0xffc800);
const PITCH = 0.58; // pendiente del techo (unos 30°)
const EAVE = 0.5; // cuánto sobresale el alero

/** Ventana con marco, cruz, alféizar y postigos, mirando hacia +z en (x, y, z) (o girada `ry`). */
function windowAt(S, x, y, z, ry, { w = 1.05, h = 1.2, shutter = null } = {}) {
  const co = Math.cos(ry), si = Math.sin(ry);
  const at = (dx, dy, dz) => [x + dx * co + dz * si, y + dy, z - dx * si + dz * co];
  const put = (bw, bh, bd, dx, dy, dz, color) => { const p = at(dx, dy, dz); S.box(bw, bh, bd, p[0], p[1], p[2], color, ry, "bk"); };
  put(w + 0.26, h + 0.26, 0.1, 0, 0, 0.03, TRIM); // marco
  put(w, h, 0.1, 0, 0, 0.055, GLASS); // vidrio
  put(0.07, h, 0.1, 0, 0, 0.075, TRIM); // cruz
  put(w, 0.07, 0.1, 0, 0.12, 0.075, TRIM);
  put(w + 0.46, 0.1, 0.24, 0, -h / 2 - 0.16, 0.1, TRIM); // alféizar
  if (shutter) for (const sx of [-1, 1]) put(0.34, h + 0.16, 0.07, sx * (w / 2 + 0.33), 0, 0.045, shutter);
}

/** Puerta de madera con marco y tableros, mirando hacia +z. */
function doorAt(S, x, z, ry, { w = 1.2, h = 2.15, color = WOOD } = {}) {
  const co = Math.cos(ry), si = Math.sin(ry);
  const put = (bw, bh, bd, dx, dy, dz, c) => S.box(bw, bh, bd, x + dx * co + dz * si, dy, z - dx * si + dz * co, c, ry, "bk");
  put(w + 0.34, h + 0.2, 0.1, 0, (h + 0.2) / 2, 0.03, TRIM);
  put(w, h, 0.1, 0, h / 2, 0.065, color);
  for (const [dx, dy, bh] of [[-w / 4, h * 0.7, h * 0.36], [w / 4, h * 0.7, h * 0.36], [-w / 4, h * 0.26, h * 0.32], [w / 4, h * 0.26, h * 0.32]]) put(w * 0.34, bh, 0.1, dx, dy, 0.08, dim(color, 0.78));
  put(0.09, 0.09, 0.1, w * 0.36, h * 0.48, 0.11, GOLD);
}

/** Techo a dos aguas con el caballete a lo largo de x, sobre un cuerpo de w × d que termina a la altura h. */
function gableRoof(K, S, w, d, h, roofRgb, { x0 = 0, z0 = 0 } = {}) {
  const L = w / 2 + EAVE, R = d / 2 + EAVE, ye = h - EAVE * PITCH, yr = h + (d / 2) * PITCH, len = Math.hypot(R, yr - ye);
  const U = (x) => x, V = (t) => t * len;
  K.quad([x0 - L, ye, z0 + R], [x0 + L, ye, z0 + R], [x0 + L, yr, z0], [x0 - L, yr, z0], [[U(-L), V(0)], [U(L), V(0)], [U(L), V(1)], [U(-L), V(1)]]);
  K.quad([x0 + L, ye, z0 - R], [x0 - L, ye, z0 - R], [x0 - L, yr, z0], [x0 + L, yr, z0], [[U(L), V(0)], [U(-L), V(0)], [U(-L), V(1)], [U(L), V(1)]]);
  // caballete y tapacanes de madera (le dan grosor al techo)
  S.box(2 * L, 0.16, 0.34, x0, yr + 0.03, z0, dim(roofRgb, 0.72), 0, "b");
  for (const sz of [-1, 1]) S.box(2 * L, 0.14, 0.12, x0, ye + 0.02, z0 + sz * (R - 0.04), dim(WOOD, 1.1), 0, "");
  return yr;
}

/**
 * Una casa de pueblo. Coordenadas propias: el centro de la base en el origen y la puerta mirando hacia +z.
 * Devuelve { body, roof }: dos geometrías (colores lisos y tejas).
 */
export function houseGeometry({ w, d, h, wall = 0xffd9a8, roof = 0xd9744a, shutter = null, porch = false, chimney = false, door = true, front = null }) {
  const S = new Solid(), K = new Skin();
  const W = lin(wall), RF = lin(roof), SH = shutter != null ? lin(shutter) : null;
  S.box(w, h, d, 0, h / 2, 0, W, 0, "bt"); // muros
  S.box(w + 0.1, 0.6, d + 0.1, 0, 0.3, 0, dim(W, 0.72), 0, "b"); // zócalo
  S.box(w + 0.14, 0.18, d + 0.14, 0, h - 0.09, 0, TRIM, 0, ""); // cornisa
  const yr = gableRoof(K, S, w, d, h, RF);
  // tímpanos (el triángulo de muro bajo el techo, en los dos extremos)
  S.tri([w / 2, h, d / 2], [w / 2, h, -d / 2], [w / 2, yr, 0], W);
  S.tri([-w / 2, h, -d / 2], [-w / 2, h, d / 2], [-w / 2, yr, 0], W);
  // ventanas: una hilera (dos en los edificios altos), repartidas a lo ancho; en el frente se salta el lugar de la puerta
  const rows = h > 6.5 ? [2.1, h - 2.3] : [Math.min(2.1, h * 0.52)];
  const nx = Math.max(2, Math.round((w - 1.6) / 3.1)), nz = Math.max(1, Math.round((d - 1.6) / 3.1));
  const small = h < 3.4;
  const opt = { shutter: SH, w: small ? 0.8 : 1.05, h: small ? 0.9 : 1.2 };
  for (const y of rows) {
    for (let i = 0; i < nx; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / nx;
      if (!(door && y < 3 && Math.abs(x) < 1.9) && (!front || front(x, y))) windowAt(S, x, y, d / 2, 0, opt); // `front(x, y)`: qué ventanas van en el frente
      windowAt(S, -x, y, -d / 2, Math.PI, opt);
    }
    for (let i = 0; i < nz; i++) {
      const z = -d / 2 + ((i + 0.5) * d) / nz;
      windowAt(S, w / 2, y, -z, Math.PI / 2, opt);
      windowAt(S, -w / 2, y, z, -Math.PI / 2, opt);
    }
  }
  if (door) doorAt(S, 0, d / 2, 0);
  if (porch) {
    // corredor: piso de baldosa, pilares de madera con su viga y un techito de tejas apoyado en el muro
    const pd = 1.8, pz = d / 2 + pd, top = Math.min(2.75, h - 1.1);
    S.box(w, 0.07, pd, 0, 0.035, d / 2 + pd / 2, STONE, 0, "bk"); // (bajito: se camina por encima sin escalón)
    const n = Math.max(3, Math.round(w / 2.6));
    for (let i = 0; i < n; i++) S.box(0.18, top, 0.18, -w / 2 + 0.25 + (i * (w - 0.5)) / (n - 1), top / 2 + 0.14, pz - 0.2, WOOD, 0, "b");
    S.box(w + 0.2, 0.18, 0.2, 0, top + 0.2, pz - 0.2, WOOD, 0, "");
    const y0 = top + 0.28, y1 = Math.min(h - 0.35, top + 0.28 + (pd + 0.3) * 0.42), L = w / 2 + 0.3, len = Math.hypot(pd + 0.3, y1 - y0);
    K.quad([-L, y0, pz + 0.3], [L, y0, pz + 0.3], [L, y1, d / 2], [-L, y1, d / 2], [[-L, 0], [L, 0], [L, len], [-L, len]]);
  } else if (door) S.box(1.9, 0.14, 0.7, 0, 0.07, d / 2 + 0.4, STONE, 0, "bk"); // peldaño
  if (chimney) {
    S.box(0.7, 1.7, 0.7, w * 0.27, yr - 0.35, -d * 0.16, lin(0xb5523a), 0, "b");
    S.box(0.9, 0.16, 0.9, w * 0.27, yr + 0.55, -d * 0.16, TRIM, 0, "");
  }
  return { body: S.geometry(), roof: K.geometry() };
}

/**
 * La iglesia de la plaza: nave con techo de tejas, contrafuertes y ventanas altas, y una torre con campanario al frente.
 * Amarilla con molduras blancas, como la de Papudo. Coordenadas propias: la nave a lo largo de x, el frente hacia +x.
 * Ocupa de x = -6,5 a 9,3 y de z = -4,25 a 4,25.
 */
export function churchGeometry({ wall = 0xf7d98a, roof = 0xd9744a } = {}) {
  const S = new Solid(), K = new Skin();
  const W = lin(wall), RF = lin(roof), DARK = lin(0x4a3a34), w = 13, d = 8.5, h = 6.5;
  S.box(w, h, d, 0, h / 2, 0, W, 0, "bt");
  S.box(w + 0.12, 0.8, d + 0.12, 0, 0.4, 0, dim(W, 0.74), 0, "b");
  S.box(w + 0.16, 0.22, d + 0.16, 0, h - 0.11, 0, TRIM, 0, "");
  const yr = gableRoof(K, S, w, d, h, RF);
  S.tri([w / 2, h, d / 2], [w / 2, h, -d / 2], [w / 2, yr, 0], W);
  S.tri([-w / 2, h, -d / 2], [-w / 2, h, d / 2], [-w / 2, yr, 0], W);
  // contrafuertes y ventanas altas a los costados
  for (const sz of [-1, 1]) {
    for (let i = 0; i <= 4; i++) S.box(0.5, h - 0.2, 0.36, -w / 2 + 0.4 + i * ((w - 0.8) / 4), (h - 0.2) / 2, sz * (d / 2 + 0.16), TRIM, 0, "b");
    for (let i = 0; i < 4; i++) windowAt(S, -w / 2 + 0.4 + (i + 0.5) * ((w - 0.8) / 4), 3.5, sz * (d / 2), sz > 0 ? 0 : Math.PI, { w: 0.9, h: 2.5 });
  }
  // la torre, al centro del frente
  const tw = 3.8, th = 12.4, tx = w / 2 + 0.9;
  S.box(tw, th, tw, tx, th / 2, 0, W, 0, "bt");
  S.box(tw + 0.1, 0.8, tw + 0.1, tx, 0.4, 0, dim(W, 0.74), 0, "b");
  for (const y of [h - 0.05, 9.4, th]) S.box(tw + 0.3, 0.26, tw + 0.3, tx, y, 0, TRIM, 0, "");
  for (const [ry, ox, oz] of [[Math.PI / 2, 1, 0], [-Math.PI / 2, -1, 0], [0, 0, 1], [Math.PI, 0, -1]]) {
    // vanos del campanario (se ve la campana adentro)
    const px = tx + ox * (tw / 2 + 0.01), pz = oz * (tw / 2 + 0.01);
    S.box(1.3, 1.9, 0.06, px, 10.9, pz, DARK, ry, "bk");
    S.box(1.56, 0.16, 0.14, px, 9.9, pz, TRIM, ry, "bk");
    S.box(0.5, 0.6, 0.1, px, 10.75, pz, GOLD, ry, "bk");
  }
  // el portón, con su arco, y la ventana redonda de arriba
  const fx = tx + tw / 2;
  S.box(0.12, 3.5, 2.5, fx + 0.03, 1.75, 0, TRIM, 0, "bl");
  S.box(0.12, 0.5, 1.9, fx + 0.03, 3.72, 0, TRIM, 0, "bl");
  S.box(0.12, 3.2, 2.0, fx + 0.07, 1.6, 0, WOOD, 0, "bl");
  S.box(0.12, 0.42, 1.4, fx + 0.07, 3.38, 0, WOOD, 0, "bl");
  S.box(0.13, 3.2, 0.07, fx + 0.09, 1.6, 0, dim(WOOD, 0.6), 0, "bl");
  for (const sz of [-1, 1]) S.box(0.14, 0.12, 0.12, fx + 0.11, 1.5, sz * 0.25, GOLD, 0, "bl");
  S.box(0.1, 1.3, 1.3, fx + 0.03, 6.2, 0, TRIM, 0, "bl");
  S.box(0.1, 1.0, 1.0, fx + 0.06, 6.2, 0, GLASS, 0, "bl");
  S.box(3.2, 0.2, 3.2, fx + 0.5, 0.1, 0, STONE, 0, "b"); // atrio
  // chapitel de tejas y cruz
  const ty = th + 0.13, apex = ty + 3.4, e = tw / 2 + 0.25, sl = Math.hypot(e, apex - ty);
  const c = [[tx - e, ty, e], [tx + e, ty, e], [tx + e, ty, -e], [tx - e, ty, -e]];
  for (let i = 0; i < 4; i++) K.tri(c[i], c[(i + 1) % 4], [tx, apex, 0], [[-e, 0], [e, 0], [0, sl]]);
  S.box(0.14, 1.5, 0.14, tx, apex + 0.6, 0, TRIM, 0, "b");
  S.box(0.14, 0.14, 0.8, tx, apex + 0.9, 0, TRIM, 0, "");
  void RF;
  return { body: S.geometry(), roof: K.geometry() };
}

/** Puesto de dulces de La Ligua: mesón blanco, toldo a rayas y bandejas de dulces. El frente mira hacia +z. */
export function sweetStandGeometry() {
  const S = new Solid();
  const WHITE = lin(0xfffaf2), PINK = lin(0xd4216c);
  S.box(2.6, 0.95, 1.1, 0, 0.475, 0, WHITE, 0, "b");
  S.box(2.7, 0.08, 1.2, 0, 0.99, 0, lin(0xe9dcc4), 0, "");
  S.box(2.6, 0.22, 0.04, 0, 0.6, 0.57, PINK, 0, "bk");
  for (const sx of [-1.22, 1.22]) S.box(0.09, 2.5, 0.09, sx, 1.25, -0.45, WHITE, 0, "b");
  // toldo: 8 franjas inclinadas, rosado y blanco
  const n = 8, tw = 2.9 / n;
  for (let i = 0; i < n; i++) {
    const x = -1.45 + tw * (i + 0.5), col = i % 2 ? WHITE : PINK;
    S.quad([x - tw / 2, 2.0, 0.85], [x + tw / 2, 2.0, 0.85], [x + tw / 2, 2.55, -0.55], [x - tw / 2, 2.55, -0.55], col);
    S.quad([x + tw / 2, 2.0, 0.85], [x - tw / 2, 2.0, 0.85], [x - tw / 2, 2.55, -0.55], [x + tw / 2, 2.55, -0.55], dim(col, 0.8));
    S.box(tw, 0.2, 0.03, x, 1.9, 0.85, col, 0, "");
  }
  // bandejas con dulces (alfajores, empolvados, cachitos)
  const sweets = [0xf3e3c0, 0x8a4b22, 0xfff6e6, 0xe8a45a, 0xd98a9e];
  for (let t = 0; t < 3; t++) {
    const bx = -0.85 + t * 0.85;
    S.box(0.7, 0.05, 0.8, bx, 1.055, 0, lin(0xc79a5e), 0, "b");
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S.box(0.16, 0.1, 0.16, bx - 0.22 + i * 0.22, 1.13, -0.24 + j * 0.24, lin(sweets[(t * 2 + i + j) % sweets.length]), 0, "b");
  }
  return S.geometry();
}

/** Farol de plaza de fierro, con dos brazos (los globos van aparte, encendidos). Devuelve la geometría del poste. */
export function plazaLampGeometry() {
  const S = new Solid();
  const IRON = lin(0x2f4a3e);
  S.box(0.34, 0.3, 0.34, 0, 0.15, 0, IRON, 0, "b");
  S.box(0.13, 3.4, 0.13, 0, 1.85, 0, IRON, 0, "b");
  S.box(0.22, 0.12, 0.22, 0, 2.4, 0, IRON, 0, "");
  S.box(1.5, 0.08, 0.08, 0, 3.45, 0, IRON, 0, "");
  for (const sx of [-0.7, 0.7]) S.box(0.08, 0.3, 0.08, sx, 3.6, 0, IRON, 0, "b");
  S.box(0.08, 0.5, 0.08, 0, 3.75, 0, IRON, 0, "b");
  return S.geometry();
}
/** Dónde va cada globo del farol (x, y, z respecto del poste). */
export const PLAZA_LAMP_GLOBES = [[-0.7, 3.92, 0], [0.7, 3.92, 0], [0, 4.14, 0]];

/** Farol de calle: poste con un brazo hacia la calzada (hacia +z) y su pantalla. Devuelve la geometría del poste. */
export function streetLampGeometry() {
  const S = new Solid();
  const IRON = lin(0x3a3a44);
  S.box(0.3, 0.3, 0.3, 0, 0.15, 0, IRON, 0, "b");
  S.box(0.12, 4.9, 0.12, 0, 2.6, 0, IRON, 0, "b");
  S.box(0.09, 0.09, 1.5, 0, 5.0, 0.7, IRON, 0, "");
  S.box(0.36, 0.1, 0.6, 0, 4.98, 1.3, IRON, 0, "");
  return S.geometry();
}
/** Dónde va la luz del farol de calle. */
export const STREET_LAMP_LIGHT = [0, 4.88, 1.3];

/**
 * Piso de adoquines de la plaza: un círculo de radio r en (cx, cz) y senderos rectos [x0, z0, x1, z1].
 * Una sola geometría acostada a la altura y, con las UV en metros.
 */
export function plazaFloorGeometry(cx, cz, r, paths, y) {
  const pos = [], uv = [], nor = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) { pos.push(p[0], y, p[1]); uv.push(p[0], p[1]); nor.push(0, 1, 0); } };
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    tri([cx, cz], [cx + Math.sin(a0) * r, cz + Math.cos(a0) * r], [cx + Math.sin(a1) * r, cz + Math.cos(a1) * r]);
  }
  for (const [x0, z0, x1, z1] of paths) { tri([x0, z0], [x0, z1], [x1, z1]); tri([x0, z0], [x1, z1], [x1, z0]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}
