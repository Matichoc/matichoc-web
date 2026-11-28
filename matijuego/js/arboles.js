// Árboles frondosos, palmeras y arbustos para los mundos de Matijuego (refresco visual del 28-nov-2026, pedido de la
// persona dueña: «los árboles se ven como de una ciudad arcaica de juegos antiguos»).
//
// Antes cada árbol era una pelota de 20 caras planas sobre un palo. Ahora la copa es un racimo de bolas suaves, un poco
// irregulares, más oscuras por debajo y más claras arriba (el color va pintado en la malla: no cuesta nada al dibujar),
// y el tronco se abre en la base y en dos ramas. Todos los árboles de un mundo se dibujan juntos (InstancedMesh):
// un bosque entero son 3 dibujos por cuadro. Hay dos tamaños de malla: «cerca» (560 triángulos la copa) y «lejos»
// (240), para que los del fondo no le pesen a un celular modesto.

import { THREE } from "./three-kit.js?v=bfcb83ff05";

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Junta piezas ya ubicadas (posición, normal y color por vértice) en una sola geometría sin índices. */
function weld(parts) {
  const pos = [], nor = [], col = [];
  for (const g of parts) { pos.push(...g.pos); nor.push(...g.nor); col.push(...g.col); }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Una bola de follaje: esfera suave con la superficie apenas ondulada (para que el borde no sea un círculo perfecto). */
function leafBall(detail, r, cx, cy, cz, sy, seed, y0, y1, tint) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position.array;
  const pos = [], nor = [], col = [];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    // ondas suaves según la dirección (igual para los vértices repetidos de cada cara: no se abre la malla)
    const k = 1 + 0.1 * Math.sin(x * 5.1 + seed) * Math.cos(z * 4.3 - seed * 1.7) + 0.07 * Math.sin(y * 6.7 + seed * 2.3);
    const px = cx + x * r * k, py = cy + y * r * k * sy, pz = cz + z * r * k;
    pos.push(px, py, pz);
    const n = Math.hypot(x, y / sy, z) || 1;
    nor.push(x / n, y / sy / n, z / n);
    // por debajo más oscuro (sombra propia de la copa), arriba más claro
    const h = Math.min(1, Math.max(0, (py - y0) / (y1 - y0)));
    const c = (0.62 + 0.46 * h * h + 0.06 * (hash(seed + i) - 0.5)) * tint;
    col.push(c, c * (1 + 0.04 * h), c * (1 - 0.06 * h));
  }
  g.dispose();
  return { pos, nor, col };
}

const crownCache = {};
/**
 * Copa frondosa que cabe en una esfera de radio ~1 centrada en el origen (un poco más ancha que alta).
 * `variant` cambia la forma; `far` = versión liviana para los árboles del fondo.
 */
export function crownGeometry(variant = 0, far = false) {
  const key = `${variant}-${far ? 1 : 0}`;
  if (crownCache[key]) return crownCache[key];
  const s = variant * 17.3 + 1;
  const parts = [];
  const y0 = -0.75, y1 = 0.95;
  if (far) {
    parts.push(leafBall(1, 0.78, 0, 0, 0, 0.9, s, y0, y1, 1));
    parts.push(leafBall(1, 0.55, 0.42, 0.3, 0.12, 0.9, s + 3, y0, y1, 1.04));
    parts.push(leafBall(1, 0.5, -0.4, 0.18, -0.2, 0.9, s + 7, y0, y1, 0.97));
  } else {
    parts.push(leafBall(2, 0.74, 0, -0.05, 0, 0.88, s, y0, y1, 1));
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(s + i) * 1.2;
      const d = 0.4 + hash(s + i * 3.1) * 0.12;
      parts.push(leafBall(1, 0.46 + hash(s + i * 5.3) * 0.1, Math.cos(a) * d, 0.12 + hash(s + i * 7.7) * 0.36, Math.sin(a) * d, 0.9, s + i * 11, y0, y1, 0.96 + hash(s + i) * 0.1));
    }
  }
  return (crownCache[key] = weld(parts));
}

let trunkGeo = null;
/** Tronco de alto 1 (de y = 0 a y = 1): ancho en la base, con una curva suave y dos ramas que entran a la copa. */
export function trunkGeometry() {
  if (trunkGeo) return trunkGeo;
  const parts = [];
  const add = (geo, m) => {
    geo.applyMatrix4(m);
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array, n = g.attributes.normal.array, col = [];
    for (let i = 0; i < p.length; i += 3) { const c = 0.78 + 0.3 * Math.min(1, Math.max(0, p[i + 1])); col.push(c, c, c); }
    parts.push({ pos: [...p], nor: [...n], col });
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  // el fuste: 4 anillos, se abre abajo (raíces) y se angosta arriba
  const pts = [[0.34, 0], [0.2, 0.12], [0.15, 0.5], [0.13, 0.85], [0.1, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(pts, 7), m.identity());
  for (const [rz, ry] of [[0.7, 0.4], [-0.6, 2.6]]) {
    const b = new THREE.CylinderGeometry(0.05, 0.09, 0.5, 5);
    b.translate(0, 0.25, 0);
    add(b, m.compose(new THREE.Vector3(0, 0.72, 0), q.setFromEuler(e.set(0, ry, rz)), new THREE.Vector3(1, 1, 1)));
  }
  return (trunkGeo = weld(parts));
}

let bushGeo = null;
/** Arbusto bajo y redondo (radio ~1, apoyado en el suelo): para setos y jardineras. */
export function bushGeometry() {
  if (bushGeo) return bushGeo;
  const parts = [leafBall(1, 0.7, 0, 0.42, 0, 0.75, 5, -0.1, 0.95, 1), leafBall(1, 0.5, 0.5, 0.36, 0.1, 0.75, 9, -0.1, 0.95, 1.05), leafBall(1, 0.46, -0.46, 0.32, -0.16, 0.75, 13, -0.1, 0.95, 0.96)];
  return (bushGeo = weld(parts));
}

const palmCache = {};
/**
 * Palmera (alto ~1 hasta el penacho, en y = 0…1): tronco grueso con anillos y un penacho de hojas arqueadas con sus
 * foliolos. Dos geometrías: [tronco, hojas]. `chilean` = tronco más gordo y penacho más tupido (como las de la plaza).
 */
export function palmGeometries(chilean = false) {
  const key = chilean ? "c" : "p";
  if (palmCache[key]) return palmCache[key];
  // tronco: se hace con anillos que alternan un poquito de radio (las marcas de las hojas viejas)
  const rings = 9, pts = [];
  const r0 = chilean ? 0.044 : 0.05; // (la de plaza es más gruesa por la panza del tronco, no por la base)
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const belly = chilean ? 1 + 0.28 * Math.sin(t * Math.PI) : 1 - 0.25 * t;
    pts.push(new THREE.Vector2(r0 * belly * (i % 2 ? 1.08 : 0.96) * (i === 0 ? 1.5 : 1), t));
  }
  const tg = new THREE.LatheGeometry(pts, 7).toNonIndexed();
  const tp = tg.attributes.position.array, tn = tg.attributes.normal.array, tcol = [];
  for (let i = 0; i < tp.length; i += 3) { const c = 0.8 + 0.25 * tp[i + 1]; tcol.push(c, c, c); }
  const trunk = weld([{ pos: [...tp], nor: [...tn], col: tcol }]);
  // hojas: cada una es una cinta arqueada (nervio) con foliolos a los dos lados, que caen hacia la punta
  const pos = [], nor = [], col = [];
  const fronds = chilean ? 11 : 8, segs = 5, len = chilean ? 0.42 : 0.5;
  const tri = (a, b, c, shade) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // las hojas se ven de los dos lados: la cara de adelante es siempre la de arriba (así la luz del sol les llega bien)
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; [b, c] = [c, b]; }
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { nor.push(nx, ny, nz); col.push(shade * 0.92, shade, shade * 0.9); }
  };
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2, up = f % 3 === 0 ? 0.55 : f % 3 === 1 ? 0.25 : -0.05;
    const dx = Math.cos(a), dz = Math.sin(a);
    const sx = -dz, sz = dx; // hacia el lado de la hoja
    let prev = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const out = len * t;
      const y = 1 + up * len * t - 0.75 * len * t * t; // sube y después cae
      const w = 0.085 * Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)) + 0.012;
      const droop = 0.045 * t;
      const c = [dx * out, y, dz * out];
      const L = [c[0] + sx * w, y - droop, c[2] + sz * w], R = [c[0] - sx * w, y - droop, c[2] - sz * w];
      if (prev) {
        const shade = 0.78 + 0.3 * (1 - t);
        tri(prev.c, c, L, shade); tri(prev.c, L, prev.L, shade);
        tri(prev.c, R, c, shade * 0.93); tri(prev.c, prev.R, R, shade * 0.93);
      }
      prev = { c, L, R };
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  leaves.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  leaves.computeBoundingSphere();
  return (palmCache[key] = [trunk, leaves]);
}

const mats = {};
/** Materiales compartidos (el color final = color pintado en la malla × color de cada árbol). */
export function treeMaterials() {
  if (!mats.leaf) {
    mats.leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    mats.trunk = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x8a5a36, roughness: 0.95 });
    mats.palmLeaf = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x4fae4a, roughness: 0.85, side: THREE.DoubleSide });
    mats.palmTrunk = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xa98a62, roughness: 0.95 });
  }
  return mats;
}

/** Verdes de árbol de plaza (y dos de árbol en flor, que salen uno de cada siete). */
export const GREENS = [0x6cc266, 0x86cf6e, 0x58b56a, 0x9ad77c];
export const BLOOMS = [0xffb3d1, 0xd7b0ff];

/**
 * Un bosque: todos los árboles de la lista en 3 dibujos (2 formas de copa + los troncos).
 * `spots` = [x, z, tamaño, color (opcional)]. Opciones: `far` (malla liviana, sin sombra), `y` (altura del suelo),
 * `height` (alto del tronco para tamaño 1), `radius` (radio de la copa para tamaño 1), `colors` (paleta si el árbol no trae color).
 */
export function makeForest(spots, { far = false, y = 0, height = 2.3, radius = 1.75, colors = GREENS, blooms = BLOOMS, bloomEvery = 7, shadow = !far } = {}) {
  const g = new THREE.Group();
  const M = treeMaterials();
  const byVar = [[], []];
  spots.forEach((s, i) => byVar[far ? 0 : hash(i + 3) < 0.5 ? 0 : 1].push([s, i]));
  const o = new THREE.Object3D(), c = new THREE.Color();
  const trunks = new THREE.InstancedMesh(trunkGeometry(), M.trunk, spots.length);
  spots.forEach(([x, z, sc], i) => {
    o.position.set(x, y, z);
    o.rotation.set(0, hash(i) * 6.28, 0);
    o.scale.set(sc * 1.15, sc * height, sc * 1.15);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
  });
  trunks.castShadow = shadow;
  g.add(trunks);
  byVar.forEach((list, v) => {
    if (!list.length) return;
    const crowns = new THREE.InstancedMesh(crownGeometry(v, far), M.leaf, list.length);
    list.forEach(([[x, z, sc, color], i], k) => {
      const r = sc * radius, wide = 0.94 + hash(i + 11) * 0.16, tall = 0.9 + hash(i + 17) * 0.22;
      o.position.set(x, y + sc * height + r * tall * 0.55, z);
      o.rotation.set(0, hash(i + 5) * 6.28, 0);
      o.scale.set(r * wide, r * tall, r * wide);
      o.updateMatrix();
      crowns.setMatrixAt(k, o.matrix);
      const bloom = color == null && blooms.length && hash(i + 9) < 1 / bloomEvery;
      c.setHex(color != null ? color : bloom ? blooms[Math.floor(hash(i + 21) * blooms.length)] : colors[Math.floor(hash(i + 13) * colors.length)]);
      crowns.setColorAt(k, c);
    });
    crowns.castShadow = shadow;
    crowns.receiveShadow = false;
    g.add(crowns);
  });
  return g;
}

/** Un grupo de palmeras en 2 dibujos. `spots` = [x, z, alto]. */
export function makePalms(spots, { chilean = false, y = 0, shadow = true } = {}) {
  const g = new THREE.Group();
  const M = treeMaterials();
  const [tg, lg] = palmGeometries(chilean);
  const trunks = new THREE.InstancedMesh(tg, M.palmTrunk, spots.length);
  const leaves = new THREE.InstancedMesh(lg, M.palmLeaf, spots.length);
  const o = new THREE.Object3D();
  spots.forEach(([x, z, h], i) => {
    o.position.set(x, y, z);
    o.rotation.set((hash(i + 2) - 0.5) * 0.12, hash(i) * 6.28, (hash(i + 4) - 0.5) * 0.12);
    o.scale.set(h * 1.0, h, h * 1.0);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
    leaves.setMatrixAt(i, o.matrix);
  });
  trunks.castShadow = shadow;
  leaves.castShadow = shadow;
  g.add(trunks, leaves);
  return g;
}

/** Arbustos en 1 dibujo. `spots` = [x, z, tamaño, color (opcional)]. */
export function makeBushes(spots, { y = 0, colors = [0x4fae5a, 0x63bd62, 0x77c96a], shadow = false } = {}) {
  const M = treeMaterials();
  const m = new THREE.InstancedMesh(bushGeometry(), M.leaf, spots.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  spots.forEach(([x, z, sc, color], i) => {
    o.position.set(x, y, z);
    o.rotation.set(0, hash(i + 31) * 6.28, 0);
    o.scale.set(sc, sc * (0.85 + hash(i + 7) * 0.3), sc);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    c.setHex(color != null ? color : colors[Math.floor(hash(i + 19) * colors.length)]);
    m.setColorAt(i, c);
  });
  m.castShadow = shadow;
  return m;
}
