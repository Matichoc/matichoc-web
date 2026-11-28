// Modelos de «Lanchas en el Lago» (refresco visual del 28-nov-2026, pedido de la persona dueña: «el juego de las
// lanchas… se ve medio tosco»). Antes la lancha era una caja rosada con una punta; ahora es una lancha deportiva con
// casco en V, cubierta, cabina con piso de madera, parabrisas envolvente, asientos, baranda y motor fuera de borda.
// También las boyas, las rocas, la ola-rampa, el agua, la orilla y el fondo (cerros y un volcán nevado, como en los
// lagos del sur). Todo liviano: la lancha entera son 2 dibujos (el casco pintado y el vidrio).

import { THREE, canvasTexture, roundedBox } from "./three-kit.js?v=bfcb83ff05";
import { lin, mixRgb, loft, cap, at, paint, mergeColored } from "./formas.js?v=bfcb83ff05";

const PINK = lin(0xd4216c), WHITE = lin(0xfffaf2), CREAM = lin(0xfff0d8), TEAK = lin(0xc9975a), DARK = lin(0x2b2b33), CHROME = lin(0xdfe3ea), CHOCO = lin(0x64321b);

export const BOAT = { length: 3.9, beam: 0.88, cockpit: 0.5 };
const TIP = 0.975; // el casco se cierra un poco antes de la punta teórica, con una roda redondeada // (beam = media manga; cockpit = hasta qué fracción del largo llega la cabina)

/** Las medidas de la lancha en la cuaderna t (0 = popa, 1 = punta de la proa). */
function station(t) {
  const { length: L, beam: B } = BOAT;
  const b = B * (t < 0.42 ? 0.95 + 0.05 * (t / 0.42) : Math.pow(Math.max(0, Math.cos(((t - 0.42) / 0.58) * Math.PI * 0.5)), 0.7));
  return {
    z: L / 2 - t * L,
    b,
    ys: 0.6 + 0.26 * t * t, // borda
    bc: b * 0.8, yc: 0.16 + 0.26 * Math.pow(t, 1.6), // pantoque (donde el fondo se junta con el costado)
    yk: -0.14 + 0.5 * Math.pow(t, 3.2), // quilla
  };
}

/** La lancha: { hull, glass } (el casco con todo lo pintado, y el parabrisas). La proa mira hacia -z; el agua está en y = 0. */
export function boatGeometries() {
  const parts = [];
  const N = 15;
  const st = [];
  for (let i = 0; i < N; i++) st.push(station((i / (N - 1)) * TIP)); // (hasta casi la punta: ahí se cierra con la roda)
  // --- casco: fondo blanco en V y costados rosados
  const girth = (s) => {
    const right = [
      { p: [0, s.yk, s.z], c: WHITE },
      { p: [s.bc * 0.6, s.yk + (s.yc - s.yk) * 0.55, s.z], c: WHITE },
      { p: [s.bc, s.yc, s.z], c: WHITE },
      { p: [s.bc + (s.b - s.bc) * 0.25, s.yc + 0.035, s.z], c: PINK },
      { p: [s.b * 0.97, s.yc + (s.ys - s.yc) * 0.5, s.z], c: PINK },
      { p: [s.b, s.ys, s.z], c: PINK },
    ];
    const left = right.slice(1).reverse().map((q) => ({ p: [-q.p[0], q.p[1], q.p[2]], c: q.c }));
    return [...left, ...right];
  };
  const hullSecs = st.map(girth);
  parts.push(loft(hullSecs, { flip: true }));
  parts.push(cap([...hullSecs[0]], { flip: false })); // espejo de popa
  parts.push(cap([...hullSecs[N - 1]], { flip: true })); // roda (la punta de la proa)
  // --- cubierta de proa (crema, con un poco de curva) y borda con la cabina abierta
  const tc = BOAT.cockpit, FLOOR = 0.3;
  const deck = (s, crown) => [-1, -0.55, 0, 0.55, 1].map((k) => ({ p: [s.b * k, s.ys + crown * (1 - k * k), s.z], c: CREAM }));
  const fore = [], cock = [];
  for (let i = 0; i <= 10; i++) { const s = station(tc + ((TIP - tc) * i) / 10); fore.push(deck(s, 0.07 * (1 - i / 10) + 0.02)); }
  parts.push(loft(fore, { smooth: true, flip: false }));
  const T0 = 0.045;
  for (let i = 0; i <= 6; i++) {
    const s = station(T0 + ((tc - T0) * i) / 6), bi = s.b - 0.17, WALL = mixRgb(CREAM, [0.6, 0.5, 0.45], 0.25);
    cock.push([
      { p: [-s.b, s.ys, s.z], c: CREAM }, { p: [-bi, s.ys + 0.03, s.z], c: CREAM }, { p: [-bi + 0.03, FLOOR, s.z], c: WALL },
      { p: [0, FLOOR, s.z], c: TEAK },
      { p: [bi - 0.03, FLOOR, s.z], c: WALL }, { p: [bi, s.ys + 0.03, s.z], c: CREAM }, { p: [s.b, s.ys, s.z], c: CREAM },
    ]);
  }
  parts.push(loft(cock, { smooth: false, flip: false }));
  parts.push(loft([deck(station(0), 0.02), deck(station(T0), 0.02)], { smooth: false, flip: false })); // tapa de popa
  // mamparos de la cabina: el tablero (adelante) y el respaldo de popa
  const wall = (t, color, flip) => {
    const s = station(t), bi = s.b - 0.17;
    parts.push(cap([{ p: [-bi, FLOOR, s.z], c: color }, { p: [bi, FLOOR, s.z], c: color }, { p: [bi, s.ys + 0.03, s.z], c: color }, { p: [0, s.ys + 0.06, s.z], c: color }, { p: [-bi, s.ys + 0.03, s.z], c: color }], { flip }));
  };
  wall(tc, CHOCO, true);
  wall(T0, CREAM, false);
  // --- franja blanca a lo largo del casco (un listón apenas afuera del costado)
  for (const sx of [-1, 1]) {
    parts.push(loft(st.map((s) => [
      { p: [sx * (s.b * 0.985 + 0.012), s.ys - 0.2, s.z], c: WHITE },
      { p: [sx * (s.b + 0.012), s.ys - 0.09, s.z], c: WHITE },
    ]), { smooth: true, flip: sx > 0 }));
  }
  // --- asientos, volante, motor fuera de borda, baranda de proa
  const sd = station(tc);
  parts.push(paint(roundedBox(0.62, 0.18, 0.5, 0.07, 0.03), WHITE, at(0, FLOOR + 0.12, 0.66)));
  parts.push(paint(roundedBox(0.62, 0.5, 0.14, 0.07, 0.03), WHITE, at(0, FLOOR + 0.4, 0.93, -0.16)));
  parts.push(paint(roundedBox(1.22, 0.18, 0.4, 0.07, 0.03), WHITE, at(0, FLOOR + 0.12, 1.5)));
  parts.push(paint(roundedBox(1.22, 0.1, 0.4, 0.04, 0.02), PINK, at(0, FLOOR + 0.02, 1.5)));
  parts.push(paint(new THREE.TorusGeometry(0.15, 0.028, 6, 14), DARK, at(0, sd.ys - 0.02, sd.z + 0.2, -0.9)));
  parts.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), DARK, at(0, sd.ys - 0.08, sd.z + 0.1, -0.9 + Math.PI / 2)));
  const zt = BOAT.length / 2;
  parts.push(paint(roundedBox(0.42, 0.46, 0.6, 0.12, 0.04), DARK, at(0, 0.86, zt + 0.22)));
  parts.push(paint(roundedBox(0.44, 0.07, 0.62, 0.03, 0.01), WHITE, at(0, 0.84, zt + 0.22)));
  parts.push(paint(new THREE.BoxGeometry(0.14, 0.86, 0.2), DARK, at(0, 0.24, zt + 0.24)));
  parts.push(paint(new THREE.BoxGeometry(0.3, 0.16, 0.2), CHROME, at(0, 0.56, zt + 0.06)));
  parts.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), CHROME, at(-0.66, 1.05, zt - 0.2))); // asta de la bandera
  // baranda: un tubo que rodea la cubierta de proa
  const rail = [];
  for (let i = 0; i <= 12; i++) { const s = station(0.58 + 0.4 * (i / 12)); rail.push(new THREE.Vector3(-(s.b - 0.06), s.ys + 0.17, s.z)); }
  for (let i = 12; i >= 0; i--) { const s = station(0.58 + 0.4 * (i / 12)); rail.push(new THREE.Vector3(s.b - 0.06, s.ys + 0.17, s.z)); }
  parts.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 36, 0.02, 5, false), CHROME));
  for (const t of [0.6, 0.78]) for (const sx of [-1, 1]) { const s = station(t); parts.push(paint(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 5), CHROME, at(sx * (s.b - 0.06), s.ys + 0.085, s.z))); }
  // marco de arriba del parabrisas (el vidrio va aparte)
  const ws = windshieldRows();
  parts.push(loft([ws.top.map((p) => ({ p, c: CHROME })), ws.top.map((p) => ({ p: [p[0], p[1] + 0.04, p[2] + 0.012], c: CHROME }))], { smooth: false }));
  const glass = loft([ws.bottom.map((p) => ({ p, c: [1, 1, 1] })), ws.top.map((p) => ({ p, c: [1, 1, 1] }))], { smooth: true });
  return { hull: mergeColored(parts), glass };
}

/** El parabrisas envolvente: su fila de abajo (sobre el tablero) y la de arriba (echada hacia atrás). */
function windshieldRows() {
  const s = station(BOAT.cockpit), bottom = [], top = [];
  for (let i = 0; i <= 10; i++) {
    const a = -1 + (2 * i) / 10, x = a * (s.b - 0.1), z = s.z - 0.3 * (1 - a * a) + 0.05;
    bottom.push([x, s.ys + 0.05, z]);
    top.push([x * 0.93, s.ys + 0.46 - 0.08 * a * a, z + 0.2]);
  }
  return { bottom, top };
}

/** Boya de señal: cuerpo rojo con franja blanca y su farolito arriba. Radio ~0,5; flota con el centro en y = 0. */
export function buoyGeometry() {
  const RED = lin(0xe8352e);
  const pts = [[0.02, -0.5], [0.34, -0.42], [0.5, -0.12], [0.5, 0.08], [0.36, 0.34], [0.2, 0.5], [0.13, 0.62], [0.13, 0.86], [0.02, 0.9]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  return mergeColored([
    paint(g, (x, y) => (y > 0.62 ? lin(0xffe14a) : y > -0.14 && y < 0.1 ? WHITE : RED)),
    paint(new THREE.TorusGeometry(0.52, 0.045, 5, 14), WHITE, at(0, -0.2, 0, Math.PI / 2)),
  ]);
}

/**
 * Ola-rampa: una loma de agua que sube hacia adelante (hacia -z) y rompe en espuma arriba. Ocupa ±1,3 de ancho y de
 * z = +1,2 (donde se entra) a z = -1,2 (la cresta).
 */
export function waveGeometry() {
  const AQUA = lin(0xb4f1fa), DEEP = lin(0x58cdee), FOAM = lin(0xffffff); // (va sin luz: son los colores tal cual, bien claros para que no parezca roca)
  const secs = [];
  for (let i = 0; i <= 9; i++) {
    const u = i / 9, z = 1.2 - u * 2.4, h = 0.02 + 0.85 * Math.pow(u, 1.7), row = [];
    for (let j = 0; j <= 8; j++) {
      const a = -1 + (2 * j) / 8, edge = 1 - Math.pow(Math.abs(a), 3);
      const y = h * (0.35 + 0.65 * edge) + (u > 0.85 ? 0.05 * Math.sin(j * 2.1) : 0);
      row.push({ p: [a * 1.3, y, z], c: u > 0.8 || Math.abs(a) > 0.92 ? FOAM : mixRgb(DEEP, AQUA, Math.min(1, u * 1.3)) });
    }
    secs.push(row);
  }
  const face = secs[9].map((q) => ({ p: [q.p[0], 0, q.p[2] - 0.25], c: mixRgb(DEEP, AQUA, 0.4) })); // la cara de adelante, que cae al agua
  return mergeColored([loft(secs, { smooth: true, flip: true }), loft([secs[9], face], { smooth: true, flip: true })]);
}

const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

/** Agua: reflejos y olitas suaves en tonos claros (el color lo pone la malla, más profundo al centro del lago). */
export function waterTexture() {
  const r = seeded(11);
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#dcdcdc"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rx = 16 + r() * 34, ry = 5 + r() * 9;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const light = r() < 0.6;
      gr.addColorStop(0, light ? "rgba(255,255,255,0.5)" : "rgba(150,170,190,0.4)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(x + ox, y + oy); g.scale(rx, ry); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.3); g.fill(); g.restore(); }
    }
    g.lineCap = "round";
    for (let i = 0; i < 30; i++) {
      const x = r() * w, y = r() * h, l = 8 + r() * 16;
      g.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`; g.lineWidth = 1.6 + r() * 1.4;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3 - r() * 3, x + l, y); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** La estela: una V de espuma que se abre hacia atrás y se va deshaciendo (para una lámina detrás de la lancha). */
export function wakeTexture() {
  const r = seeded(5);
  const t = canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const k = y / h, half = 7 + k * 50, a = (1 - k) * (1 - k);
      for (const sx of [-1, 1]) {
        const x = w / 2 + sx * half;
        const gr = g.createLinearGradient(x - 9, 0, x + 9, 0);
        gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${0.85 * a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.fillRect(x - 9, y, 18, 2);
      }
      g.fillStyle = `rgba(255,255,255,${0.32 * a})`; g.fillRect(w / 2 - half * 0.55, y, half * 1.1, 2); // el agua revuelta del medio
    }
    for (let i = 0; i < 140; i++) {
      const y = r() * h, k = y / h, half = 7 + k * 50;
      g.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
      g.beginPath(); g.arc(w / 2 + (r() * 2 - 1) * half, y, 1 + r() * 2.2, 0, 6.3); g.fill();
    }
  });
  return t;
}

/**
 * La orilla de un lado del lago (side = -1 izquierda, 1 derecha): la arena mojada sube desde el agua, sigue la playa y
 * atrás una loma de pasto. Una sola pieza de `length` metros a lo largo de z, con el color pintado.
 */
export function shoreGeometry(side, half, length) {
  const WET = lin(0xd6b67c), SAND = lin(0xf3d9a4), DUNE = lin(0xf7e3b6), GRASS = lin(0x8fcf6a), GRASS2 = lin(0x6fb85a);
  const profile = [[-1.4, -0.3, WET], [0, 0.03, WET], [0.9, 0.16, WET], [1.6, 0.26, SAND], [4.5, 0.52, SAND], [7.5, 0.86, DUNE], [9.5, 1.15, GRASS], [16, 1.9, GRASS], [30, 3.2, GRASS2]];
  const secs = [];
  for (let i = 0; i <= 10; i++) {
    const z = length / 2 - (i / 10) * length;
    secs.push(profile.map(([d, y, c], j) => ({ p: [side * (half + d + (j > 1 ? Math.sin(i * 1.7 + j) * 0.18 : 0)), y, z], c })));
  }
  return loft(secs, { smooth: true, flip: side < 0 });
}

/** Volcán nevado para el fondo (base de radio 1 y alto 1; se agranda al ponerlo). Colores ya con la bruma de la distancia. */
export function volcanoGeometry() {
  const ROCK = lin(0x8f9cc0), LOW = lin(0xa9c4b4), SNOW = lin(0xffffff);
  const pts = [[1.0, 0], [0.74, 0.16], [0.5, 0.38], [0.3, 0.62], [0.16, 0.84], [0.1, 0.97], [0.06, 1.0]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  return paint(g, (x, y, z) => {
    const wob = 0.05 * Math.sin(Math.atan2(z, x) * 5);
    return y > 0.6 + wob ? SNOW : y > 0.2 ? mixRgb(LOW, ROCK, Math.min(1, (y - 0.2) / 0.3)) : LOW;
  });
}
