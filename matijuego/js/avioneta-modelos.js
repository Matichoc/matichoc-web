// Modelos de «Avioneta Choco» (refresco visual del 28-nov-2026, pedido de la persona dueña: «el juego de los aviones…
// se ve medio tosco»). Antes la avioneta era una cápsula rosada con tablas amarillas; ahora tiene fuselaje afinado
// hacia la cola, capó del motor con su cono y hélice, alas y cola con perfil y puntas redondeadas, cabina abierta con
// parabrisas (el Matichico va sentado adentro y se le ve de los hombros hacia arriba) y tren de aterrizaje.
// También los globos aerostáticos (con gajos de colores, cuerdas y canasto), las gaviotas que aletean, las islas y la
// costa del fondo. Todo liviano: la avioneta son 4 dibujos (cuerpo pintado, vidrio, hélice y su disco).

import { THREE, roundedBox } from "./three-kit.js?v=bfcb83ff05";
import { lin, mixRgb, loft, cap, at, paint, mergeColored, weldNormals } from "./formas.js?v=bfcb83ff05";

const PINK = lin(0xd4216c), YELLOW = lin(0xffc800), CREAM = lin(0xfff6e6), DARK = lin(0x3a2018), TIRE = lin(0x26262c), CHROME = lin(0xdfe3ea);

const smooth = (k) => k * k * (3 - 2 * k);
/** Interpola una tabla de [t, ...valores] (t creciente) con curvas suaves. */
function curve(table, t) {
  if (t <= table[0][0]) return table[0].slice(1);
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const a = table[i - 1], b = table[i], k = smooth((t - a[0]) / (b[0] - a[0]));
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
    }
  }
  return table[table.length - 1].slice(1);
}

// el fuselaje, de la cola (t = 0) a la nariz (t = 1): [t, medio alto, medio ancho, altura del centro]
const FUSE = [[0, 0.06, 0.05, 0.2], [0.15, 0.17, 0.13, 0.14], [0.35, 0.3, 0.26, 0.07], [0.55, 0.42, 0.38, 0], [0.72, 0.46, 0.42, 0], [0.88, 0.45, 0.42, 0], [0.96, 0.41, 0.39, 0], [1, 0.32, 0.31, 0]];
const X0 = -1.7, LEN = 3.1;
export const PLANE = { cockpitX: 0.12, cockpitY: 0.44, noseX: X0 + LEN };

/** Un ala (o un plano de cola): cortes con perfil de ala a lo largo de la envergadura, de la raíz a la punta redondeada. */
function wing(stations, colorOf) {
  // perfil: [posición en la cuerda (0 = borde de ataque, 1 = de fuga), alto (-1…1)]
  const foil = [[1, 0], [0.72, 0.5], [0.4, 0.95], [0.12, 0.8], [0, 0], [0.12, -0.55], [0.4, -0.6], [0.72, -0.32]];
  const secs = stations.map(({ le, chord, y, z, thick, k }) => foil.map(([u, h]) => ({ p: [le - chord * u, y + h * thick, z], c: colorOf(k, u) })));
  const out = [loft(secs, { closed: true, smooth: true, flip: stations[0].z < stations[stations.length - 1].z })];
  out.push(cap(secs[secs.length - 1], { flip: stations[0].z > stations[stations.length - 1].z }));
  return out;
}

/** La avioneta: { body, glass, prop, disc }. La nariz mira hacia +x; las alas van a lo largo de z. */
export function planeGeometries() {
  const parts = [];
  // --- fuselaje
  // Cada corte se arma por franjas (ángulos en grados, 0 = el costado, 90 = arriba): panza crema, una franja amarilla a
  // media altura y lo demás rosado. En el borde de cada franja van dos vértices, uno de cada color: así el borde sale nítido.
  const BANDS = [[8, 172, PINK, 8], [172, 202, YELLOW, 2], [202, 230, PINK, 2], [230, 310, CREAM, 4], [310, 338, PINK, 2], [338, 368, YELLOW, 2]];
  const N = 20, CAPO = 0.905, secs = [];
  const ts = [];
  for (let i = 0; i <= N; i++) ts.push(i / N);
  ts.push(CAPO, CAPO); // dos cortes en el mismo lugar: ahí empieza el capó amarillo del motor
  ts.sort((a, b) => a - b);
  ts.forEach((t, i) => {
    const [ry, rz, cy] = curve(FUSE, t), x = X0 + t * LEN, ring = [];
    const capo = t > CAPO || (t === CAPO && ts[i - 1] === CAPO);
    for (const [a0, a1, col, steps] of BANDS) for (let k = 0; k <= steps; k++) {
      const a = ((a0 + ((a1 - a0) * k) / steps) * Math.PI) / 180;
      ring.push({ p: [x, cy + ry * Math.sin(a), rz * Math.cos(a)], c: capo ? YELLOW : t < 0.1 && col === YELLOW ? PINK : col });
    }
    secs.push(ring);
  });
  parts.push(weldNormals(loft(secs, { closed: true, smooth: true, flip: true })));
  parts.push(cap(secs[secs.length - 1], { flip: true, color: DARK })); // la toma de aire del frente
  parts.push(cap(secs[0], { flip: false, color: PINK }));
  // --- alas (amarillas con la punta rosada), un poco levantadas hacia las puntas
  for (const sz of [-1, 1]) {
    const st = [];
    for (let i = 0; i <= 6; i++) {
      const k = i / 6, round = i === 6 ? 0.62 : 1;
      st.push({ k, z: sz * (0.28 + 1.78 * k), y: -0.2 + 0.2 * k, le: 0.6 - 0.16 * k - (i === 6 ? 0.1 : 0), chord: (1.02 - 0.36 * k) * round, thick: (0.075 - 0.03 * k) * round });
    }
    parts.push(...wing(st, (k) => (k > 0.8 ? PINK : k > 0.7 ? CREAM : YELLOW)));
    // plano de cola
    const tail = [];
    for (let i = 0; i <= 4; i++) { const k = i / 4, round = i === 4 ? 0.6 : 1; tail.push({ k, z: sz * (0.06 + 0.82 * k), y: 0.2, le: -1.0 - 0.14 * k - (i === 4 ? 0.06 : 0), chord: (0.6 - 0.22 * k) * round, thick: (0.04 - 0.012 * k) * round }); }
    parts.push(...wing(tail, () => YELLOW));
  }
  // --- timón (vertical): el mismo perfil, parado
  {
    const foil = [[1, 0], [0.7, 0.5], [0.35, 1], [0.1, 0.8], [0, 0], [0.1, -0.8], [0.35, -1], [0.7, -0.5]];
    const fin = [];
    for (let i = 0; i <= 5; i++) {
      const k = i / 5, round = i === 5 ? 0.55 : 1, le = -0.98 - 0.34 * k - (i === 5 ? 0.08 : 0), chord = (0.72 - 0.3 * k) * round;
      fin.push(foil.map(([u, h]) => ({ p: [le - chord * u, 0.22 + 0.86 * k, h * (0.045 - 0.015 * k) * round], c: k > 0.72 ? YELLOW : PINK })));
    }
    parts.push(loft(fin, { closed: true, smooth: true, flip: true }));
    parts.push(cap(fin[5], { flip: true }));
  }
  // --- borde acolchado de la cabina
  parts.push(paint(new THREE.TorusGeometry(0.3, 0.055, 6, 18), DARK, at(PLANE.cockpitX, PLANE.cockpitY, 0, Math.PI / 2, 0, 0, 1.22, 1, 1)));
  // --- tren de aterrizaje: dos ruedas con sus patas, y la ruedita de cola
  for (const sz of [-1, 1]) {
    parts.push(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), CHROME, at(0.42, -0.5, sz * 0.5, 0, 0, 0.12)));
    parts.push(paint(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 14), TIRE, at(0.45, -0.8, sz * 0.56, Math.PI / 2)));
    parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 10), YELLOW, at(0.45, -0.8, sz * 0.56, Math.PI / 2)));
    parts.push(paint(roundedBox(0.5, 0.2, 0.16, 0.08, 0.03), PINK, at(0.45, -0.66, sz * 0.56))); // tapabarro
  }
  parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), TIRE, at(-1.45, -0.02, 0, Math.PI / 2)));
  // --- marco del parabrisas
  const ws = windshieldRows();
  parts.push(loft([ws.top.map((p) => ({ p, c: CHROME })), ws.top.map((p) => ({ p: [p[0] - 0.012, p[1] + 0.035, p[2]], c: CHROME }))], { smooth: false }));
  const glass = loft([ws.bottom.map((p) => ({ p, c: [1, 1, 1] })), ws.top.map((p) => ({ p, c: [1, 1, 1] }))], { smooth: true });
  // --- hélice: cono y dos palas (giran sobre el eje x; va centrada en el origen)
  const prop = mergeColored([
    paint(new THREE.LatheGeometry([[0.21, 0], [0.2, 0.08], [0.14, 0.24], [0.05, 0.36], [0.005, 0.4]].map(([r, y]) => new THREE.Vector2(r, y)), 12), YELLOW, at(0, 0, 0, 0, 0, -Math.PI / 2)),
    paint(roundedBox(0.05, 1.62, 0.2, 0.06, 0.02), (x, y) => (Math.abs(y) > 0.62 ? YELLOW : DARK), at(0.1, 0, 0, 0.3)),
  ]);
  const disc = new THREE.CircleGeometry(0.82, 24);
  disc.rotateY(Math.PI / 2);
  return { body: mergeColored(parts), glass, prop, disc };
}

/** El parabrisas, delante de la cabina: su fila de abajo (sobre el fuselaje) y la de arriba (echada hacia atrás). */
function windshieldRows() {
  const bottom = [], top = [];
  for (let i = 0; i <= 8; i++) {
    const a = -1 + (2 * i) / 8, z = a * 0.33;
    const x = PLANE.cockpitX + 0.44 + 0.1 * (1 - a * a);
    bottom.push([x, PLANE.cockpitY - 0.02 - 0.1 * a * a, z]);
    top.push([x - 0.2, PLANE.cockpitY + 0.36 - 0.06 * a * a, z * 0.86]);
  }
  return { bottom, top };
}

const balloonCache = {};
/** Globo aerostático con gajos de dos colores, cuerdas y canasto. El centro del globo queda en el origen; radio ~1,2. */
export function balloonGeometry(colorA, colorB) {
  const key = `${colorA}-${colorB}`;
  if (balloonCache[key]) return balloonCache[key];
  const A = lin(colorA), B = lin(colorB), WICKER = lin(0x9a6a35);
  // el globo se arma por gajos (8, de dos colores alternados): cada gajo trae sus propios vértices, así el borde entre
  // un color y el otro sale nítido
  const prof = [[0.02, 1.52], [0.5, 1.44], [0.92, 1.14], [1.16, 0.6], [1.18, 0.05], [0.98, -0.5], [0.66, -0.98], [0.42, -1.3], [0.36, -1.42]];
  const GORES = 8, secs = prof.map(([r, y], i) => {
    const ring = [];
    for (let g = 0; g < GORES; g++) for (let k = 0; k <= 2; k++) {
      const a = ((g + k / 2) / GORES) * Math.PI * 2;
      const base = g % 2 ? B : A;
      ring.push({ p: [Math.cos(a) * r, y, Math.sin(a) * r], c: i >= prof.length - 2 ? CREAM : i === 0 ? mixRgb(base, [1, 1, 1], 0.2) : base });
    }
    return ring;
  });
  const parts = [weldNormals(loft(secs, { closed: true, smooth: true, flip: true }))];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(paint(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 4), DARK, at(sx * 0.27, -1.7, sz * 0.27, sz * 0.14, 0, -sx * 0.14)));
  parts.push(paint(roundedBox(0.56, 0.42, 0.56, 0.08, 0.03), WICKER, at(0, -2.16, 0)));
  parts.push(paint(roundedBox(0.62, 0.08, 0.62, 0.03, 0.01), mixRgb(WICKER, [0, 0, 0], 0.3), at(0, -1.96, 0)));
  return (balloonCache[key] = mergeColored(parts));
}

/** Gaviota que vuela hacia -x: { body, wing }. El ala sale del origen hacia +z (la otra es la misma, en espejo). */
export function gullGeometries() {
  const WHITE = lin(0xffffff), GREY = lin(0xb9c0cc), TIP = lin(0x3c4048), ORANGE = lin(0xffa000);
  const body = mergeColored([
    paint(new THREE.SphereGeometry(0.26, 10, 8), (x, y) => (y > 0.08 ? GREY : WHITE), at(0, 0, 0, 0, 0, 0, 1.75, 0.85, 0.85)),
    paint(new THREE.SphereGeometry(0.16, 10, 8), WHITE, at(-0.42, 0.1, 0)),
    paint(new THREE.ConeGeometry(0.055, 0.24, 6), ORANGE, at(-0.66, 0.08, 0, 0, 0, Math.PI / 2)),
    paint(new THREE.SphereGeometry(0.025, 6, 5), TIP, at(-0.5, 0.15, 0.12)),
    paint(new THREE.SphereGeometry(0.025, 6, 5), TIP, at(-0.5, 0.15, -0.12)),
    paint(new THREE.ConeGeometry(0.12, 0.34, 4), WHITE, at(0.52, 0.02, 0, 0, 0, -Math.PI / 2, 1, 1, 0.3)),
  ]);
  // ala: tres tramos que se angostan, con la punta oscura
  const row = (z, x0, x1, y, c) => [{ p: [x0, y, z], c }, { p: [x1, y, z], c }];
  const wing = loft([row(0.08, -0.2, 0.16, 0.03, GREY), row(0.5, -0.2, 0.12, 0.1, GREY), row(0.86, -0.1, 0.1, 0.06, GREY), row(1.12, 0.02, 0.07, -0.02, TIP)], { smooth: true });
  return { body, wing };
}

/** Isla: un montículo de arena con la orilla mojada. Radio ~3, apoyada en el agua (y = 0). */
export function islandGeometry() {
  const WET = lin(0xd6b67c), SAND = lin(0xf3d9a4), TOP = lin(0xf9e7bd), GRASS = lin(0x8fcf6a);
  const prof = [[3.3, -0.3], [3.0, 0.02], [2.5, 0.22], [1.7, 0.5], [0.9, 0.72], [0.02, 0.8]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  return paint(g, (x, y, z) => {
    const r = Math.hypot(x, z) + 0.25 * Math.sin(Math.atan2(z, x) * 3);
    return y < 0.12 ? WET : r < 1.3 ? mixRgb(TOP, GRASS, 0.75) : y > 0.55 ? TOP : SAND;
  });
}

/**
 * La costa del fondo: playa, y detrás lomas verdes que suben y bajan. `length` metros a lo largo de x; la orilla queda
 * en z = z0 y la tierra se aleja hacia -z.
 */
export function coastGeometry(length, z0) {
  const WET = lin(0xd6b67c), SAND = lin(0xf3d9a4), GRASS = lin(0x8fcf6a), HILL = lin(0x6fb85a), FAR = lin(0x8fc6a0);
  const secs = [], n = 30;
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (i / n) * length;
    const h = 0.6 + 0.4 * Math.sin(i * 1.3) + 0.3 * Math.sin(i * 0.47 + 1);
    secs.push([[2, -0.3, WET], [0, 0.04, WET], [-3, 0.3, SAND], [-7, 0.55, SAND], [-10, 1.1, GRASS], [-17, 3.2 + 2.6 * h, HILL], [-30, 5.5 + 5 * h, HILL], [-48, 8 + 7 * h, FAR]].map(([dz, y, c]) => ({ p: [x, y, z0 + dz], c })));
  }
  return loft(secs, { smooth: true, flip: true });
}
