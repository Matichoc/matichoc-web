// El auto de Matijuego (refresco visual del 28-nov-2026, pedido de la persona dueña: «el auto también hay que
// corregirlo»). Antes era una caja redondeada con otra caja encima; ahora tiene carrocería de verdad: trompa baja, capó,
// cabina abierta (el Matichico va sentado adentro), cola con alerón, tapabarros sobre cada rueda, parabrisas curvo,
// parachoques, arco de seguridad y ruedas con llanta. Lo usan Autos de Chocolate (el tuyo y los rivales) y la Ciudad.
//
// Para que el garaje pueda seguir cambiándole los colores, el auto va en pocas piezas grandes, una por color:
// carrocería, molduras y detalles (cada una con su material), más lo que no cambia de color (asientos, parrilla, llantas),
// el vidrio y las luces. Un auto completo son unos 10 dibujos por cuadro (antes ~27).
// El auto mira hacia -z; el suelo está en y = 0; las ruedas van en (±0,96, 0,4, ±1,06).

import { THREE, roundedBox } from "./three-kit.js?v=bfcb83ff05";
import { lin, loft, cap, at, paint, mergeColored, weldNormals } from "./formas.js?v=bfcb83ff05";

const LEN = 3.44; // largo de la carrocería
const Y0 = 0.28; // alto del piso del auto
const TUB = 0.54; // piso de la cabina
const COCKPIT = [0.43, 0.78]; // la cabina, de dónde a dónde (fracción del largo, desde la trompa)
// la carrocería de la trompa (t = 0) a la cola (t = 1): [t, medio ancho, alto del hombro, alto del centro]
const SHAPE = [[0, 0.5, 0.48, 0.54], [0.06, 0.74, 0.58, 0.66], [0.2, 0.84, 0.66, 0.77], [0.38, 0.85, 0.72, 0.88], [0.8, 0.86, 0.76, 0.92], [0.93, 0.83, 0.74, 0.86], [1, 0.68, 0.6, 0.7]];
export const WHEEL = { x: 0.96, y: 0.4, z: 1.06, r: 0.4 };
const WHITE = [1, 1, 1], LOW = [0.8, 0.8, 0.8], INSIDE = [0.17, 0.17, 0.18];
const DARK = lin(0x2a2a30), LEATHER = lin(0x4a2a1c), CHROME = lin(0xdfe3ea), TIRE = lin(0x1f1f24), GOLD = lin(0xffc800);

const smooth = (k) => k * k * (3 - 2 * k);
function shape(t) {
  for (let i = 1; i < SHAPE.length; i++) {
    if (t <= SHAPE[i][0]) {
      const a = SHAPE[i - 1], b = SHAPE[i], k = smooth((t - a[0]) / (b[0] - a[0]));
      return { z: -LEN / 2 + t * LEN, w: a[1] + (b[1] - a[1]) * k, ys: a[2] + (b[2] - a[2]) * k, yt: a[3] + (b[3] - a[3]) * k };
    }
  }
  const l = SHAPE[SHAPE.length - 1];
  return { z: LEN / 2, w: l[1], ys: l[2], yt: l[3] };
}

/** Un corte de la carrocería: 12 puntos alrededor (piso, costado, hombro, techo o cabina abierta). */
function ring(t, tub) {
  const { z, w, ys, yt } = shape(t);
  const right = tub
    ? [[w * 0.88, Y0, LOW], [w, Y0 + 0.12, LOW], [w, ys, WHITE], [w - 0.13, ys + 0.03, WHITE], [w - 0.16, TUB, INSIDE]]
    : [[w * 0.88, Y0, LOW], [w, Y0 + 0.12, LOW], [w, ys, WHITE], [w * 0.7, yt - 0.015, WHITE], [w * 0.35, yt - 0.004, WHITE]];
  const pt = ([x, y, c]) => ({ p: [x, y, z], c });
  return [pt([0, Y0, LOW]), ...right.map(pt), pt([0, tub ? TUB : yt, tub ? INSIDE : WHITE]), ...right.slice().reverse().map(([x, y, c]) => pt([-x, y, c]))];
}

/** Rueda con llanta de cinco rayos (gira sobre el eje x; centrada en el origen). */
function wheelGeometry() {
  const tire = new THREE.LatheGeometry([[0.24, -0.17], [0.36, -0.17], [0.4, -0.11], [0.41, 0], [0.4, 0.11], [0.36, 0.17], [0.24, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const parts = [paint(tire, TIRE, at(0, 0, 0, 0, 0, Math.PI / 2)), paint(new THREE.CylinderGeometry(0.25, 0.25, 0.26, 14), CHROME, at(0, 0, 0, 0, 0, Math.PI / 2)), paint(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 8), GOLD, at(0, 0, 0, 0, 0, Math.PI / 2))];
  for (let i = 0; i < 5; i++) parts.push(paint(new THREE.BoxGeometry(0.37, 0.4, 0.07), DARK, at(0, 0, 0, (i / 5) * Math.PI * 2)));
  return mergeColored(parts);
}

let cache = null;
/**
 * Las piezas del auto, compartidas por todos los autos: { body, trim, accent, fixed, glass, lights, wheel, wheels4, cabin }.
 * `body`, `trim` y `accent` vienen en blanco (con las partes de abajo y de adentro más oscuras): el color lo pone el
 * material de cada auto. `cabin` es el techo con ventanas de los autos cerrados (los rivales y los autos de la ciudad).
 */
export function carGeometries() {
  if (cache) return cache;
  // --- carrocería
  const [c0, c1] = COCKPIT;
  const secs = [];
  for (const t of [0, 0.03, 0.06, 0.13, 0.2, 0.29, 0.38, c0]) secs.push(ring(t, false));
  for (const t of [c0, 0.52, 0.61, 0.7, c1]) secs.push(ring(t, true));
  for (const t of [c1, 0.8, 0.87, 0.93, 0.97, 1]) secs.push(ring(t, false));
  const body = mergeColored([weldNormals(loft(secs, { closed: true, smooth: true })), cap(secs[0], { flip: true }), cap(secs[secs.length - 1], { flip: false })]);

  // --- molduras: parachoques, tapabarros, zócalos, alerón y marco del parabrisas
  const trim = [];
  const nose = shape(0), tail = shape(1);
  trim.push(paint(roundedBox(1.56, 0.16, 0.34, 0.07, 0.03), WHITE, at(0, 0.34, nose.z - 0.02)));
  trim.push(paint(roundedBox(1.6, 0.16, 0.3, 0.07, 0.03), WHITE, at(0, 0.36, tail.z + 0.02)));
  for (const sx of [-1, 1]) {
    trim.push(paint(roundedBox(0.12, 0.13, 1.24, 0.05, 0.02), LOW, at(sx * 0.87, 0.33, 0)));
    for (const sz of [-1, 1]) {
      const arch = new THREE.TorusGeometry(0.5, 0.085, 6, 12, Math.PI);
      trim.push(paint(arch, WHITE, at(sx * WHEEL.x, WHEEL.y - 0.02, sz * WHEEL.z, 0, Math.PI / 2, 0, 1, 1, 2.3)));
    }
  }
  trim.push(paint(roundedBox(1.66, 0.07, 0.42, 0.03, 0.015), WHITE, at(0, 1.22, tail.z - 0.2, -0.08)));
  const ws = windshieldRows();
  trim.push(loft([ws.top.map((p) => ({ p, c: WHITE })), ws.top.map((p) => ({ p: [p[0], p[1] + 0.045, p[2] + 0.015], c: WHITE }))], { smooth: false }));

  // --- detalles: franja del capó y de la cola, soportes del alerón, espejos y arco de seguridad
  const accent = [];
  const stripe = (t0, t1) => {
    const rows = [];
    for (let i = 0; i <= 8; i++) { const s = shape(t0 + ((t1 - t0) * i) / 8); rows.push([{ p: [-0.16, s.yt + 0.006, s.z], c: WHITE }, { p: [0.16, s.yt + 0.006, s.z], c: WHITE }]); }
    return loft(rows, { smooth: true, flip: true });
  };
  accent.push(stripe(0.03, c0 - 0.01), stripe(c1 + 0.02, 0.985));
  for (const sx of [-1, 1]) {
    accent.push(paint(new THREE.BoxGeometry(0.07, 0.34, 0.07), WHITE, at(sx * 0.56, 1.04, tail.z - 0.22)));
    accent.push(paint(roundedBox(0.2, 0.11, 0.09, 0.04, 0.015), WHITE, at(sx * 0.94, 0.95, shape(c0).z + 0.12)));
  }
  accent.push(paint(new THREE.TorusGeometry(0.44, 0.045, 6, 14, Math.PI), WHITE, at(0, 0.88, shape(c1).z + 0.1)));

  // --- lo que no cambia de color: parrilla, asiento, tablero, volante, escapes y el piso de abajo
  const fixed = [];
  fixed.push(paint(roundedBox(0.86, 0.15, 0.07, 0.06, 0.02), DARK, at(0, 0.5, nose.z - 0.02)));
  fixed.push(paint(roundedBox(0.58, 0.16, 0.5, 0.06, 0.02), LEATHER, at(0, TUB + 0.09, 0.5)));
  fixed.push(paint(roundedBox(0.58, 0.56, 0.14, 0.07, 0.03), LEATHER, at(0, 0.94, shape(c1).z - 0.14, -0.12)));
  fixed.push(paint(roundedBox(1.3, 0.2, 0.12, 0.05, 0.02), DARK, at(0, 0.78, shape(c0).z + 0.08)));
  fixed.push(paint(new THREE.TorusGeometry(0.15, 0.028, 6, 14), DARK, at(0, 0.9, shape(c0).z + 0.26, -0.5)));
  for (const sx of [-1, 1]) fixed.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), CHROME, at(sx * 0.34, 0.36, tail.z + 0.1, Math.PI / 2)));
  fixed.push(paint(new THREE.BoxGeometry(1.5, 0.06, 3.0), DARK, at(0, Y0 - 0.02, 0)));

  // --- parabrisas y luces
  const glass = loft([ws.bottom.map((p) => ({ p, c: WHITE })), ws.top.map((p) => ({ p, c: WHITE }))], { smooth: true });
  const lights = [];
  for (const sx of [-1, 1]) {
    lights.push(paint(new THREE.SphereGeometry(0.15, 10, 8), lin(0xfff6c0), at(sx * 0.5, 0.58, nose.z + 0.1, 0, 0, 0, 1, 0.8, 0.6)));
    lights.push(paint(roundedBox(0.34, 0.11, 0.06, 0.04, 0.015), lin(0xff3b3b), at(sx * 0.48, 0.6, tail.z + 0.02)));
  }

  // --- ruedas: una sola (para las que giran) y las cuatro juntas (para los autos que no necesitan girarlas)
  const wheel = wheelGeometry();
  const four = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) four.push(wheel.clone().applyMatrix4(at(sx * WHEEL.x, WHEEL.y, sz * WHEEL.z)));

  // --- techo con ventanas (autos cerrados): una cúpula sobre la cabina
  const GLASS = lin(0x35506e), ROOF = lin(0xfff6e6);
  const dome = [];
  const U = 12, V = 12;
  for (let i = 0; i <= U; i++) {
    const u = i / U, s = shape(c0 - 0.07 + (c1 - c0 + 0.13) * u), top = s.ys + (1.36 - s.ys) * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * u)), 0.55);
    const wide = (s.w - 0.06) * (0.9 + 0.1 * Math.sin(Math.PI * u)), row = [];
    for (let j = 0; j <= V; j++) {
      const a = (j / V) * Math.PI, sn = Math.sin(a);
      const roof = sn > 0.86 && u > 0.26 && u < 0.8;
      const pillar = Math.abs(u - 0.26) < 0.035 || Math.abs(u - 0.8) < 0.035 || (Math.abs(u - 0.53) < 0.03 && sn < 0.86);
      row.push({ p: [Math.cos(a) * wide * (0.82 + 0.18 * (1 - sn)), s.ys - 0.02 + (top - s.ys + 0.02) * Math.pow(sn, 0.75), s.z], c: roof || pillar ? ROOF : GLASS });
    }
    dome.push(row);
  }
  const cabin = loft(dome, { smooth: true, flip: true });

  cache = { body, trim: mergeColored(trim), accent: mergeColored(accent), fixed: mergeColored(fixed), glass, lights: mergeColored(lights), wheel, wheels4: mergeColored(four), cabin };
  return cache;
}

/** El parabrisas: su fila de abajo (sobre el capó) y la de arriba (echada hacia atrás). */
function windshieldRows() {
  const s = shape(COCKPIT[0] - 0.03), bottom = [], top = [];
  for (let i = 0; i <= 10; i++) {
    const a = -1 + (2 * i) / 10, x = a * (s.w - 0.1);
    const z = s.z - 0.12 * (1 - a * a);
    bottom.push([x, s.ys + (s.yt - s.ys) * (1 - a * a) + 0.01, z]);
    top.push([x * 0.9, 1.24 - 0.07 * a * a, z + 0.3]);
  }
  return { bottom, top };
}

let glassMat = null, lightMat = null, fixedMat = null;
/** Materiales que comparten todos los autos (vidrio, luces y lo que no cambia de color). */
export function carSharedMaterials() {
  if (!glassMat) {
    glassMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.45, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    fixedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  }
  return { glass: glassMat, lights: lightMat, fixed: fixedMat };
}

/** Material de una de las piezas de color de un auto (carrocería, molduras o detalles). */
export function carPaint(color, { roughness = 0.4, metalness = 0.12 } = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness, metalness });
}

/**
 * Arma un auto. `mats` = { body, trim, accent } (materiales de carPaint). Opciones: `open` (cabina abierta, con
 * parabrisas; si no, lleva techo con ventanas), `spin` (ruedas sueltas que giran: quedan en `wheels`), `shadow`.
 * Devuelve { group, wheels }. El auto mira hacia -z.
 */
export function buildCarModel(mats, { open = true, spin = true, shadow = true, faceZ = false, scale = 1 } = {}) {
  const G = carGeometries(), S = carSharedMaterials();
  const group = new THREE.Group();
  group.scale.setScalar(scale);
  // `faceZ`: el frente hacia +z (las piezas se dan vuelta; las ruedas no, para que sigan girando hacia adelante)
  const add = (geo, mat, cast = shadow, turn = faceZ) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; if (turn) m.rotation.y = Math.PI; group.add(m); return m; };
  add(G.body, mats.body);
  add(G.trim, mats.trim);
  add(G.accent, mats.accent, false);
  add(G.fixed, S.fixed, false);
  add(G.lights, S.lights, false);
  if (open) add(G.glass, S.glass, false);
  else add(G.cabin, S.fixed);
  const wheels = [];
  if (spin) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = add(G.wheel, S.fixed, shadow, false);
      w.position.set(sx * WHEEL.x, WHEEL.y, sz * WHEEL.z);
      w.userData.front = faceZ ? sz > 0 : sz < 0;
      w.rotation.order = "YXZ"; // primero gira sobre su eje y después dobla (si no, al doblar la rueda bailaría)
      wheels.push(w);
    }
  } else add(G.wheels4, S.fixed);
  return { group, wheels };
}
