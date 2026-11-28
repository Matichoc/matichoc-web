// Formas curvas hechas a mano para los vehículos y adornos (refresco visual del 28-nov-2026): en vez de armar una
// lancha o una avioneta con cajas y conos, se describe su silueta por cortes (como las cuadernas de un bote) y aquí se
// une en una superficie suave. Todo sale con el color pintado en los vértices, así un vehículo entero es UNA malla con
// un solo material (1 dibujo por cuadro), que es lo que más cuida a un celular modesto.

import { THREE } from "./three-kit.js?v=bfcb83ff05";

/** Color de la paleta (0xRRGGBB) como lo espera una malla con colores por vértice. */
export const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mixRgb = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/**
 * Une cortes en una superficie. `sections` = lista de cortes; cada corte = lista de puntos { p: [x, y, z], c: [r, g, b] }
 * (todos los cortes con la misma cantidad de puntos). `closed` = cada corte se cierra sobre sí mismo (un tubo);
 * `smooth` = sombreado suave (si no, cada cara plana); `flip` = da vuelta las caras.
 */
export function loft(sections, { closed = false, smooth = true, flip = false } = {}) {
  const m = sections.length, n = sections[0].length;
  const pos = new Float32Array(m * n * 3), col = new Float32Array(m * n * 3);
  sections.forEach((sec, i) => sec.forEach((pt, j) => { pos.set(pt.p, (i * n + j) * 3); col.set(pt.c, (i * n + j) * 3); }));
  const idx = [];
  const cols = closed ? n : n - 1;
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + ((j + 1) % n), d = (i + 1) * n + j;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  if (!smooth) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** Tapa plana: un abanico desde el centro de una lista de puntos { p, c } (en orden). */
export function cap(points, { flip = false, color = null } = {}) {
  const n = points.length;
  const ctr = [0, 0, 0], cc = [0, 0, 0];
  for (const pt of points) for (let k = 0; k < 3; k++) { ctr[k] += pt.p[k] / n; cc[k] += (color || pt.c)[k] / n; }
  const pos = [], col = [];
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const tri = flip ? [ctr, b.p, a.p] : [ctr, a.p, b.p];
    const tc = flip ? [cc, color || b.c, color || a.c] : [cc, color || a.c, color || b.c];
    for (let k = 0; k < 3; k++) { pos.push(...tri[k]); col.push(...tc[k]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Suaviza el sombreado entre vértices que están en el mismo lugar aunque tengan distinto color: así una franja de color
 * puede tener el borde nítido (dos vértices, uno de cada color) sin que se note un pliegue en la superficie.
 */
export function weldNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, sum = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), v = sum.get(k) || [0, 0, 0];
    v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i);
    sum.set(k, v);
  }
  for (let i = 0; i < p.count; i++) {
    const v = sum.get(key(i)), l = Math.hypot(v[0], v[1], v[2]) || 1;
    n.setXYZ(i, v[0] / l, v[1] / l, v[2] / l);
  }
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** Matriz de «poner aquí»: posición, giro (radianes, orden XYZ) y escala. */
export function at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** Una geometría cualquiera de three.js, ya ubicada y pintada de un color (o con un color por vértice: `fn(x, y, z)`). */
export function paint(geo, color, matrix = null) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3);
  const fixed = typeof color === "function" ? null : Array.isArray(color) ? color : lin(color);
  for (let i = 0; i < n; i++) col.set(fixed || color(p.getX(i), p.getY(i), p.getZ(i)), i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  void _m;
  return g;
}

/** Junta geometrías pintadas (posición, normal y color) en una sola. */
export function mergeColored(geos) {
  let total = 0;
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

let paintMat = null;
/** El material de las mallas pintadas (uno para todos los vehículos). */
export function paintedMaterial() {
  return paintMat || (paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }));
}

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** Roca redondeada e irregular de radio ~1 (más clara arriba), del color que se pida. */
export function rockGeometry(color = 0x6a4126, seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position.array;
  const base = lin(color), top = mixRgb(base, [1, 1, 1], 0.28), low = mixRgb(base, [0, 0, 0], 0.3);
  const col = new Float32Array(p.length), nor = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const k = 0.82 + 0.3 * hash(Math.round(x * 31) + Math.round(y * 57) * 3 + Math.round(z * 91) * 7 + seed);
    p[i] = x * k * 1.1; p[i + 1] = y * k * 0.8; p[i + 2] = z * k;
    const n = Math.hypot(x, y * 1.2, z);
    nor[i] = x / n; nor[i + 1] = (y * 1.2) / n; nor[i + 2] = z / n;
    col.set(y > 0.25 ? mixRgb(base, top, Math.min(1, (y - 0.25) * 1.6)) : mixRgb(base, low, Math.min(1, (0.25 - y) * 0.9)), i);
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Nube esponjosa (varias bolas blancas, más grises por debajo) de ancho ~2. Va con un material sin luz (MeshBasic). */
export function cloudGeometry(seed = 1) {
  const parts = [];
  const blobs = [[0, 0, 0, 0.62], [0.62, -0.06, 0.05, 0.46], [-0.6, -0.08, -0.04, 0.42], [0.22, 0.26, -0.05, 0.44], [-0.24, 0.2, 0.08, 0.38]];
  blobs.forEach(([x, y, z, r], i) => {
    const s = r * (0.9 + hash(seed + i) * 0.25);
    parts.push(paint(new THREE.IcosahedronGeometry(1, 1), (px, py) => { const k = 0.8 + 0.2 * Math.min(1, Math.max(0, (py - (y - s)) / (2 * s) + 0.25)); return [k, k * 1.0, Math.min(1, k * 1.04)]; }, at(x, y, z, 0, 0, 0, s, s * 0.78, s * 0.9)));
  });
  return mergeColored(parts);
}
