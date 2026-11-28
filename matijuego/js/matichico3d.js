// Matichico y Chocolatina en 3D, como los personajes de matichoc.cl: cabeza de barra de chocolate (bloque
// con surcos), ojos azules grandes, sonrisa con dientes, polera negra de Matichoc con cuello rosado y su
// logo, jeans y zapatillas. Matichico trae un rulo de pelo; Chocolatina, un moño con flores.

import { THREE, roundedBox, loadTexture } from "./three-kit.js?v=bfcb83ff05";
import { applyLook, HEAD_W, HEAD_H, HEAD_D } from "./wardrobe3d.js?v=bfcb83ff05";

const LIFT = 0.26; // largo extra de las piernas: da las proporciones de los personajes de la web

// ---------- el Matichico como actor ----------
// Caras: brow = cuánto suben las cejas · tilt = su giro (positivo: puntas de adentro arriba, carita de pena; negativo: ceño de
// esfuerzo) · eye = alto del ojo · big = tamaño del ojo · mouth = qué boca se ve ("smile", "frown" u "oh") y su ancho y alto.
const FACES = {
  normal: { brow: 0, tilt: 0, eye: 1, big: 1, mouth: "smile", mw: 1, mh: 1 },
  feliz: { brow: 0.04, tilt: 0.04, eye: 0.9, big: 1.05, mouth: "smile", mw: 1.2, mh: 1.4 },
  wow: { brow: 0.065, tilt: 0, eye: 1.12, big: 1.12, mouth: "oh", mw: 1, mh: 1 },
  pena: { brow: -0.012, tilt: 0.4, eye: 0.84, big: 1, mouth: "frown", mw: 1, mh: 1 },
  ay: { brow: 0.015, tilt: 0.32, eye: 0.5, big: 1.02, mouth: "oh", mw: 1.35, mh: 0.7 },
  esfuerzo: { brow: -0.03, tilt: -0.24, eye: 0.88, big: 1, mouth: "smile", mw: 0.85, mh: 0.55 },
  sueno: { brow: -0.01, tilt: 0.1, eye: 1, big: 1, mouth: "oh", mw: 0.55, mh: 0.55 },
};
// la cara que va con cada modo del cuerpo (los que no aparecen llevan la de siempre)
const FACE_OF = { cheer: "feliz", dance: "feliz", jump: "feliz", wave: "feliz", clap: "feliz", pump: "feliz", sad: "pena", shrug: "pena", climb: "esfuerzo", kick: "esfuerzo", crouch: "esfuerzo", sleep: "sueno" };
const ACTS = { gran: 1, bien: 1, justo: 1, animo: 1, hola: 1 };
const SEATED = { drive: 1, sit: 1, type: 1, piano: 1, arcade: 1 }; // sentado o con las manos ocupadas: solo actúan brazos y cabeza
const MOVING = { run: 1, jump: 1, climb: 1, kick: 1, walk: 1 }; // el juego ya lo tiene en movimiento: el saludo de llegada se corta
const JOINT_SPEED = 26; // rad/s: lo más rápido que cambia un brazo o una pierna (así no hay saltos de una pose a otra)
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _look = new THREE.Vector3();

export function createMatichico(character, outfit, look = null) {
  const outer = new THREE.Group();
  const root = new THREE.Group(); // todo el cuerpo; se achica un poco para mantener la altura de siempre
  root.scale.setScalar(0.88);
  outer.add(root);
  const girl = character.gender === "girl";
  const std = (color, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness });
  const mats = {
    choco: std(character.choco),
    chocoDark: std(character.chocoDark, 0.6),
    jersey: std(outfit.jersey, 0.6),
    trim: std(outfit.trim, 0.55),
    white: std(0xffffff, 0.4),
    hair: std(girl ? 0x6e3216 : 0x7a3a14, 0.7),
    shoe: std(girl ? 0xf4f0ea : 0xe9e1d3, 0.6),
    jeans: std(0x2e4a7c, 0.8),
    dark: new THREE.MeshBasicMaterial({ color: 0x2b1a10 }),
    iris: new THREE.MeshBasicMaterial({ color: 0x2f78dc }),
    cheek: new THREE.MeshBasicMaterial({ color: 0xd4216c, transparent: true, opacity: 0.4 }),
  };
  const shadowed = (m) => {
    m.castShadow = true;
    return m;
  };
  const soleMat = std(girl ? 0xf0508a : 0xb98a4c, 0.6);

  // ---------- piernas (jeans) y zapatillas ----------
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.15, 0.32 + LIFT, 0);
    const leg = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.34, 4, 10), mats.jeans));
    leg.position.y = -0.27;
    pivot.add(leg);
    const shoe = shadowed(new THREE.Mesh(roundedBox(0.18, 0.1, 0.3, 0.05, 0.02), mats.shoe));
    shoe.position.set(0, -0.53, 0.05);
    pivot.add(shoe);
    const sole = new THREE.Mesh(roundedBox(0.19, 0.03, 0.31, 0.015, 0.01), soleMat);
    sole.position.set(0, -0.585, 0.05);
    pivot.add(sole);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.08), soleMat);
    lace.position.set(0, -0.475, 0.06);
    pivot.add(lace);
    rootAdd(pivot);
    legs.push(pivot);
  }
  function rootAdd(o) { root.add(o); }

  // ---------- torso: polera con cuello y logo ----------
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = LIFT;
  root.add(bodyGroup);
  const torso = shadowed(new THREE.Mesh(roundedBox(girl ? 0.5 : 0.54, 0.44, 0.34, 0.1, 0.04), mats.jersey));
  torso.position.y = 0.52;
  bodyGroup.add(torso);
  const hem = shadowed(new THREE.Mesh(roundedBox(girl ? 0.51 : 0.55, 0.05, 0.35, 0.02, 0.01), mats.jersey));
  hem.position.y = 0.325;
  bodyGroup.add(hem);
  for (const sx of [-1, 1]) {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.07), mats.trim);
    collar.position.set(sx * 0.1, 0.735, 0.165);
    collar.rotation.set(0.25, 0, -sx * 0.5);
    bodyGroup.add(collar);
  }
  const neckBack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.08), mats.trim);
  neckBack.position.set(0, 0.75, -0.1);
  bodyGroup.add(neckBack);
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 20),
    new THREE.MeshBasicMaterial({ map: loadTexture("assets/brand/icon-512.png"), transparent: true }),
  );
  logo.position.set(0.12, 0.62, 0.174);
  bodyGroup.add(logo);

  // ---------- brazos (pivote en el hombro): manga corta y mano ----------
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (girl ? 0.32 : 0.34), 0.66, 0);
    const arm = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.22, 4, 8), mats.choco));
    arm.position.y = -0.18;
    pivot.add(arm);
    const sleeve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.092, 0.15, 12), mats.jersey));
    sleeve.position.y = -0.06;
    pivot.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.025, 12), mats.trim);
    cuff.position.y = -0.125;
    pivot.add(cuff);
    const hand = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), mats.choco));
    hand.position.y = -0.38;
    pivot.add(hand);
    bodyGroup.add(pivot);
    arms.push(pivot);
  }

  // ---------- cabeza: barra de chocolate ----------
  const head = new THREE.Group();
  head.position.y = LIFT + 0.72 + HEAD_H / 2;
  root.add(head);
  const skull = shadowed(new THREE.Mesh(roundedBox(HEAD_W, HEAD_H, HEAD_D, 0.14, 0.05), mats.choco));
  head.add(skull);
  // surcos de la barra: arriba y en los costados
  for (let i = -2; i <= 2; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, HEAD_D * 0.82), mats.chocoDark);
    g.position.set(i * 0.12, HEAD_H / 2 + 0.006, 0);
    head.add(g);
  }
  for (const sx of [-1, 1]) {
    for (let i = -2; i <= 2; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.012, HEAD_H * 0.62, 0.012), mats.chocoDark);
      g.position.set(sx * (HEAD_W / 2 + 0.004), 0.02, i * 0.1);
      head.add(g);
    }
  }

  const eyes = [];
  const brows = [];
  const fz = HEAD_D / 2;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.17, 0.05, fz - 0.015);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), mats.white);
    white.scale.set(1, 1.12, 0.5);
    eye.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 10), mats.iris);
    iris.position.set(sx * -0.012, -0.004, 0.047);
    iris.scale.z = 0.5;
    eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mats.dark);
    pupil.position.set(sx * -0.012, -0.004, 0.066);
    pupil.scale.z = 0.5;
    eye.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(0.035, 0.04, 0.085);
    eye.add(shine);
    head.add(eye);
    eyes.push(eye);

    const brow = new THREE.Mesh(roundedBox(0.15, 0.04, 0.03, 0.015, 0.006), mats.hair);
    brow.position.set(sx * 0.17, 0.225, fz + 0.005);
    brow.rotation.z = -sx * 0.18;
    head.add(brow);
    brows.push(brow);

    if (girl) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), mats.cheek);
      cheek.position.set(sx * 0.3, -0.07, fz + 0.004);
      head.add(cheek);
      for (const k of [0, 1]) {
        const lash = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.014), mats.dark);
        lash.position.set(sx * (0.27 + k * 0.02), 0.155 + k * 0.03, fz + 0.02);
        lash.rotation.z = sx * (0.5 + k * 0.4);
        head.add(lash);
      }
    }
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mats.choco);
  nose.position.set(0, -0.025, fz + 0.035);
  nose.scale.set(1, 0.85, 0.8);
  nose.castShadow = true;
  head.add(nose);

  // sonrisa abierta con dientes y lengua
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.16, fz + 0.004);
  const smile = new THREE.Group();
  const mouthShape = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20, Math.PI, Math.PI), mats.dark);
  mouthShape.scale.set(1, 0.95, 1);
  smile.add(mouthShape);
  const teeth = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.035), mats.white);
  teeth.position.set(0, -0.022, 0.002);
  smile.add(teeth);
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0xe8527a }));
  tongue.position.set(0, -0.1, 0.002);
  smile.add(tongue);
  mouth.add(smile);
  // las otras dos bocas del actor (solo se dibuja una a la vez): la de pena, un arco hacia abajo, y la de sorpresa, una "o"
  const frown = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.019, 6, 14, Math.PI), mats.dark);
  frown.position.set(0, -0.115, 0.001);
  frown.visible = false;
  mouth.add(frown);
  const oh = new THREE.Mesh(new THREE.CircleGeometry(0.058, 18), mats.dark);
  oh.position.set(0, -0.07, 0.001);
  oh.scale.set(1, 1.18, 1);
  oh.visible = false;
  mouth.add(oh);
  head.add(mouth);

  // ---------- pelo y adornos propios del personaje ----------
  const accStart = head.children.length;
  const top = HEAD_H / 2;
  const hairBand = () => {
    const c = shadowed(new THREE.Mesh(roundedBox(HEAD_W + 0.02, 0.07, HEAD_D + 0.02, 0.03, 0.01), mats.hair));
    c.position.y = top - 0.03;
    head.add(c);
  };
  const bow = (x, y, z, scale = 1) => {
    for (const s of [-1, 1]) {
      const wing = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.075 * scale, 0.17 * scale, 4), mats.jersey));
      wing.position.set(x + s * 0.085 * scale, y, z);
      wing.rotation.z = -s * Math.PI / 2;
      head.add(wing);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04 * scale, 8, 6), mats.trim);
    knot.position.set(x, y, z);
    head.add(knot);
  };
  const flower = (x, y, z, color, size = 1) => {
    const f = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.036 * size, 8, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      petal.position.set(Math.cos(a) * 0.04 * size, Math.sin(a) * 0.04 * size, 0);
      f.add(petal);
    }
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.03 * size, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    mid.position.z = 0.02;
    f.add(mid);
    f.position.set(x, y, z);
    f.lookAt(x * 3, y * 0.5, z * 3 + 1);
    head.add(f);
  };
  if (!girl) {
    // Matichico: rulo de pelo arriba (y flequillo corto)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, top, 0.02), new THREE.Vector3(-0.02, top + 0.12, 0.03), new THREE.Vector3(0.1, top + 0.17, 0.02),
      new THREE.Vector3(0.18, top + 0.09, 0.0), new THREE.Vector3(0.1, top + 0.03, -0.02), new THREE.Vector3(0.04, top + 0.1, 0.0),
    ]);
    const curl = shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.055, 8, false), mats.hair));
    head.add(curl);
    const tip = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.hair));
    tip.position.copy(curve.getPoint(1));
    head.add(tip);
    const fringe = shadowed(new THREE.Mesh(roundedBox(0.34, 0.06, 0.05, 0.02, 0.01), mats.hair));
    fringe.position.set(-0.12, top - 0.03, fz - 0.03);
    head.add(fringe);
    if (character.type === "basket") {
      const band = shadowed(new THREE.Mesh(roundedBox(HEAD_W + 0.03, 0.07, HEAD_D + 0.03, 0.03, 0.01), std(0xe83a3a, 0.6)));
      band.position.y = top - 0.2;
      head.add(band);
    }
  } else {
    // Chocolatina: moño alto con rulitos y flores
    const bun = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mats.hair));
    bun.position.set(0.06, top + 0.14, -0.06);
    head.add(bun);
    for (const [x, y] of [[-0.26, 0.2], [0.26, 0.2], [-0.33, 0.04], [0.33, 0.04]]) {
      const curl = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mats.hair));
      curl.position.set(x, y + 0.1, fz - 0.06);
      head.add(curl);
    }
    hairBand();
    if (character.type === "cheer") {
      bow(0.06, top + 0.2, 0.08, 1.1);
    } else {
      flower(0.3, top + 0.03, 0.12, 0xff5a7a, 1.5);
      flower(0.2, top + 0.16, 0.12, 0xffffff, 1.2);
      flower(0.36, top + 0.18, 0.04, 0xff8aa8, 1.1);
    }
  }
  // peinado y accesorios originales del personaje (se ocultan si se elige otro peinado)
  const defaultStyle = head.children.slice(accStart);

  // ---------- animación ----------
  // Pose del cuerpo que pide cada modo: giros de brazos y piernas (radianes), inclinación, ladeo de la cabeza y rebote.
  function pose(out, t, mode, speed) {
    const s = Math.sin(t * 11 * speed);
    let bob = Math.sin(t * 3) * 0.012;
    let armL = [0, 0, -0.14];
    let armR = [0, 0, 0.14];
    let legL = 0;
    let legR = 0;
    let headTilt = 0;
    let lean = 0;
    if (mode === "run") {
      bob = Math.abs(s) * 0.05;
      legL = s * 0.9;
      legR = -s * 0.9;
      armL = [-s * 0.8, 0, -0.1];
      armR = [s * 0.8, 0, 0.1];
      lean = 0.12;
    } else if (mode === "jump") {
      armL = [0, 0, -2.5];
      armR = [0, 0, 2.5];
      legL = 0.35;
      legR = -0.2;
    } else if (mode === "cheer") {
      bob = Math.abs(Math.sin(t * 7)) * 0.14;
      armL = [0, 0, -2.6 + Math.sin(t * 13) * 0.3];
      armR = [0, 0, 2.6 - Math.sin(t * 13) * 0.3];
      headTilt = Math.sin(t * 7) * 0.12;
    } else if (mode === "sad") {
      armL = [0, 0, -0.04];
      armR = [0, 0, 0.04];
      headTilt = 0.1;
      lean = 0.18;
    } else if (mode === "kick") {
      // patada: `speed` es el avance de la patada (0 a 1); la pierna derecha se balancea hacia adelante
      const k = Math.sin(Math.min(1, Math.max(0, speed)) * Math.PI);
      legR = -1.6 * k;
      legL = 0.35 * k;
      armL = [0.6 * k, 0, -0.5];
      armR = [-0.6 * k, 0, 0.5];
      lean = -0.12 * k;
    } else if (mode === "climb") {
      // escalar un muro: brazos arriba que se turnan para agarrarse y piernas que empujan
      const c = Math.sin(t * 9 * speed);
      armL = [-2.7 + c * 0.45, 0, -0.25];
      armR = [-2.7 - c * 0.45, 0, 0.25];
      legL = -0.5 + c * 0.6;
      legR = -0.5 - c * 0.6;
      bob = Math.abs(c) * 0.04;
      lean = -0.08;
    } else if (mode === "drive") {
      armL = [-1.25, 0, -0.35];
      armR = [-1.25, 0, 0.35];
    } else if (mode === "walk") {
      // caminar tranquilo por la casa
      const w = Math.sin(t * 7.5 * speed);
      bob = Math.abs(w) * 0.03;
      legL = w * 0.6;
      legR = -w * 0.6;
      armL = [-w * 0.5, 0, -0.1];
      armR = [w * 0.5, 0, 0.1];
    } else if (mode === "sit" || mode === "type" || mode === "piano") {
      // sentado: piernas hacia adelante; escribiendo / tocando mueve las manos
      legL = -1.5;
      legR = -1.5;
      bob = Math.sin(t * 2.4) * 0.008;
      armL = [-0.35, 0, -0.18];
      armR = [-0.35, 0, 0.18];
      if (mode === "type") {
        armL = [-1.3 + Math.sin(t * 17) * 0.14, 0, -0.22];
        armR = [-1.3 + Math.sin(t * 17 + 1.7) * 0.14, 0, 0.22];
        headTilt = Math.sin(t * 1.3) * 0.04;
      } else if (mode === "piano") {
        armL = [-1.2 + Math.sin(t * 9) * 0.22, 0, -0.3];
        armR = [-1.2 + Math.sin(t * 9 + 2.2) * 0.22, 0, 0.3];
        headTilt = Math.sin(t * 2.2) * 0.1;
      }
    } else if (mode === "sleep") {
      // acostado: respira despacio
      bob = Math.sin(t * 1.6) * 0.012;
      armL = [0, 0, -0.18];
      armR = [0, 0, 0.18];
    } else if (mode === "arcade") {
      // de pie, manos en la palanca y los botones
      armL = [-1.15 + Math.sin(t * 12) * 0.12, 0, -0.28];
      armR = [-1.2 + Math.sin(t * 15 + 1) * 0.16, 0, 0.28];
      lean = 0.1;
      headTilt = Math.sin(t * 3) * 0.05;
    } else if (mode === "dance") {
      // ¡a bailar! brazos arriba alternados, pasitos y cadera
      const b = Math.sin(t * 8);
      bob = Math.abs(b) * 0.12;
      armL = [Math.sin(t * 4) * 0.5, 0, -2.0 + b * 0.8];
      armR = [Math.sin(t * 4 + 3) * 0.5, 0, 2.0 - b * 0.8];
      legL = b * 0.55;
      legR = -b * 0.55;
      headTilt = Math.sin(t * 4) * 0.2;
      lean = Math.sin(t * 4) * 0.08;
    } else if (mode === "admire") {
      // mira y señala con una mano
      armR = [-0.9 + Math.sin(t * 2.5) * 0.12, 0, 0.5];
      headTilt = Math.sin(t * 1.8) * 0.1;
    } else if (mode === "wave") {
      // saluda con una mano en alto
      armR = [0, 0, 2.5 + Math.sin(t * 11) * 0.38];
      armL = [0, 0, -0.22];
      bob = Math.abs(Math.sin(t * 5.5)) * 0.03;
      headTilt = Math.sin(t * 5.5) * 0.07;
    } else if (mode === "clap") {
      // aplaude: las manos se juntan adelante
      const c = Math.abs(Math.sin(t * 12));
      armL = [-1.2, 0, 0.3 + c * 0.32];
      armR = [-1.2, 0, -0.3 - c * 0.32];
      bob = (1 - c) * 0.02;
      headTilt = Math.sin(t * 6) * 0.05;
    } else if (mode === "shrug") {
      // se encoge de hombros: brazos abiertos y cabeza ladeada
      armL = [-0.3, 0, -1.05];
      armR = [-0.3, 0, 1.05];
      bob = 0.035;
      headTilt = 0.17;
    } else if (mode === "pump") {
      // "¡vamos otra vez!": un puño arriba
      armR = [0, 0, 2.75];
      armL = [-0.8, 0, -0.25];
      bob = Math.abs(Math.sin(t * 8)) * 0.07;
      headTilt = -0.06;
    } else if (mode === "crouch") {
      // toma impulso antes del salto (y amortigua al caer)
      bob = -0.07;
      armL = [0.5, 0, -0.35];
      armR = [0.5, 0, 0.35];
      lean = 0.1;
    } else if (mode === "fest_giro") {
      // cae del salto y se queda plantado, con los brazos abiertos hacia abajo
      bob = 0;
      armL = [0.4, 0, -0.9];
      armR = [0.4, 0, 0.9];
      legL = 0.14;
      legR = -0.14;
      lean = -0.07;
    } else if (mode === "fest_cielo") {
      // los dos brazos arriba, apuntando al cielo
      armL = [-0.25, 0, -2.3]; // (en V: con la cabezota, derechos hacia arriba quedarían tapados)
      armR = [-0.25, 0, 2.3];
      bob = Math.sin(t * 3) * 0.01;
    } else if (mode === "fest_zen") {
      // sentado con las piernas hacia adelante y las manos sobre las rodillas, bien tranquilo
      legL = -1.5;
      legR = -1.5;
      armL = [-0.6, 0, -0.7];
      armR = [-0.6, 0, 0.7];
      bob = Math.sin(t * 2) * 0.01;
    } else if (mode === "fest_brazos") {
      // brazos cruzados y el mentón arriba
      armL = [-1.15, 0, 0.85];
      armR = [-1.15, 0, -0.85];
      lean = -0.07;
      headTilt = 0.06;
      bob = 0;
    } else if (mode === "fest_avion") {
      // el avioncito: brazos abiertos y a correr
      const w = Math.sin(t * 9);
      armL = [0, 0, -1.5];
      armR = [0, 0, 1.5];
      legL = w * 0.8;
      legR = -w * 0.8;
      bob = Math.abs(w) * 0.05;
      lean = 0.14;
      headTilt = Math.sin(t * 3) * 0.14;
    }
    out.bob = bob;
    out.armL = armL;
    out.armR = armR;
    out.legL = legL;
    out.legR = legR;
    out.tilt = headTilt;
    out.lean = lean;
    return out;
  }

  // Lo que cambia de a poco de un cuadro al siguiente (`cur`), partiendo de como quedó el cuadro anterior (`prev`):
  // 0-2 brazo izquierdo · 3-5 brazo derecho · 6-7 piernas · 8 inclinación del cuerpo · 9 ladeo de la cabeza · 10 cabeza gacha
  // 11 cejas (alto) · 12 cejas (giro) · 13 ojo (alto) · 14 ojo (tamaño) · 15-17 bocas (sonrisa, pena, "oh") · 18-19 boca (ancho, alto)
  // 20-21 cabeza que mira (giro, alto) · 22-23 pupilas · 24 giro del cuerpo hacia donde mira
  const cur = new Float32Array(25);
  const prev = new Float32Array(25);
  const tgt = new Float32Array(25);
  const P = {}, Q = {};
  const HEAD_Y = (LIFT + 0.72 + HEAD_H / 2) * 0.88; // alto de la cabeza (ya con la escala del cuerpo)
  const pupils = eyes.map((e) => [e.children[1], e.children[2]].map((o) => ({ o, x: o.position.x, y: o.position.y })));
  head.rotation.order = "YXZ"; // primero gira hacia donde mira y después sube o baja la cara
  let nextBlink = 2 + Math.random() * 2;
  const seed = nextBlink * 3.1; // (distinto en cada personaje, sin pedir otro número al azar)
  let lastT = null; // el `t` del último cuadro animado
  let dtF = 0; // cuánto duró este cuadro
  let snap = true; // sin transición (primera vez, o estuvo un rato sin animarse)
  let faceName = null, faceT = 0; // cara pedida por un rato (hero.face)
  let gaze = null; // punto del mundo que mira (hero.lookAt)
  let side = 1; // por qué lado se da vuelta si lo que mira quedó justo atrás
  let act = null; // actuación de cuerpo entero en curso (hero.act)

  // ---- festejos de gol (los trae la camiseta: `fest` en OUTFITS, js/wardrobe-data.js) ----
  const F = { m: "cheer", jumpY: 0, spin: 0, face: "feliz", pitch: 0, shut: false };
  let inFest = false, festT = 0; // el juego pidió el modo "fest" (un gol) y cuánto lleva
  /** El festejo `name` a los `a` segundos de empezar: qué pose, salto, giro y cara lleva. */
  function festStep(name, a) {
    F.m = "cheer"; F.jumpY = 0; F.spin = 0; F.face = "feliz"; F.pitch = 0; F.shut = false;
    if (name === "giro") {
      // toma impulso, salta con media vuelta y cae de espaldas con los brazos abiertos
      if (a < 0.16) F.m = "crouch";
      else if (a < 0.8) { const u = (a - 0.16) / 0.64; F.m = "jump"; F.jumpY = 2.4 * u * (1 - u); F.spin = Math.PI * u * u * (3 - 2 * u); F.face = "wow"; }
      else { F.m = "fest_giro"; F.spin = Math.PI; }
    } else if (name === "cielo") {
      F.m = a < 0.14 ? "crouch" : "fest_cielo";
      F.pitch = a < 0.14 ? 0 : -0.34; // mira hacia arriba
    } else if (name === "zen") {
      const k = Math.min(1, Math.max(0, (a - 0.18) / 0.25));
      F.m = a < 0.18 ? "crouch" : "fest_zen";
      F.jumpY = -0.42 * k; // se sienta en el pasto
      F.shut = a > 0.45; // ojitos cerrados
    } else if (name === "brazos") {
      F.m = a < 0.12 ? "crouch" : "fest_brazos";
      F.pitch = a < 0.12 ? 0 : -0.1;
    } else if (name === "samba") F.m = "dance";
    else if (name === "avion") F.m = "fest_avion";
    return F;
  }

  function animate(t, mode = "idle", speed = 1) {
    // Un cuadro nuevo (otro `t`) parte de como quedó el anterior. Si el juego llama dos veces en el mismo cuadro, vale la última.
    const fresh = t !== lastT;
    if (t !== lastT) {
      const dt = lastT == null ? -1 : t - lastT;
      snap = !(dt > 0) || dt > 0.3;
      dtF = snap ? 0 : Math.min(dt, 0.05);
      prev.set(cur);
      lastT = t;
      hero.frames++;
      if (act) act.t += dtF;
      if (faceT > 0 && (faceT -= dtF) <= 0) faceName = null;
    }
    const seated = !!SEATED[mode];
    hero.seated = seated;

    // ---- actuación: manda sobre el modo que pide el juego ----
    if (act && act.name === "hola" && (act.t > 1.1 || MOVING[mode])) act = null; // el saludo de llegada se termina solo
    let m = mode; // el modo que se ve
    let face = null; // la cara que pide la actuación
    let jumpY = 0, spin = 0, pitch = 0, shut = false;
    const turning = !!act && mode !== "sleep"; // se da vuelta entero hacia lo que mira
    // el juego pide festejar (un gol): el festejo de la camiseta; sin camiseta de festejo, el de siempre
    if (mode === "fest") {
      if (!inFest) { inFest = true; festT = 0; } else if (fresh) festT += dtF;
      if (!act) {
        if (hero.fest && !seated) { festStep(hero.fest, festT); m = F.m; jumpY = F.jumpY; spin = F.spin; face = F.face; pitch = F.pitch; shut = F.shut; }
        else m = "cheer";
      }
    } else inFest = false;
    if (turning) {
      const a = act.t;
      if (act.name === "gran" && hero.fest && !seated) {
        // con una camiseta de fútbol, el gran festejo es el de esa camiseta
        festStep(hero.fest, a);
        m = F.m; jumpY = F.jumpY; spin = F.spin; face = F.face; pitch = F.pitch; shut = F.shut;
      } else if (act.name === "gran") {
        // salto con vuelta entera y festejo (sentado: festejo con los brazos arriba)
        if (seated || a >= 0.98) m = "cheer";
        else if (a < 0.16 || a >= 0.86) m = "crouch";
        else {
          const u = (a - 0.16) / 0.7;
          m = "jump";
          jumpY = 2.6 * u * (1 - u);
          spin = Math.PI * 2 * u * u * (3 - 2 * u);
          face = "wow";
        }
        if (!face) face = "feliz";
      } else if (act.name === "bien") m = a < 0.55 ? "cheer" : "wave"; // festeja y saluda
      else if (act.name === "justo") m = a < 1.05 ? "clap" : mode === "sad" ? "idle" : mode; // un aplauso corto
      else if (act.name === "animo") m = a < 0.7 ? "shrug" : a < 1.45 ? "pump" : mode === "sad" ? "idle" : mode; // se encoge de hombros y se anima
      else if (act.name === "hola") m = "wave";
    }

    pose(P, t, mode, speed);
    if (m !== mode) {
      pose(Q, t, m, 1);
      if (seated) {
        // sentado (lancha, auto, avioneta): las piernas siguen en su lugar y una mano en el volante si alcanza con la otra
        P.armR = Q.armR;
        if (m !== "wave" && m !== "pump") P.armL = Q.armL;
        P.tilt = Q.tilt;
      } else Object.assign(P, Q);
    }

    // ---- cuerpo: brazos y piernas van hacia su pose sin saltos ----
    tgt[0] = P.armL[0]; tgt[1] = P.armL[1]; tgt[2] = P.armL[2];
    tgt[3] = P.armR[0]; tgt[4] = P.armR[1]; tgt[5] = P.armR[2];
    tgt[6] = P.legL; tgt[7] = P.legR; tgt[8] = P.lean; tgt[9] = P.tilt;
    tgt[10] = m === "sad" ? 0.25 : pitch;
    const step = JOINT_SPEED * dtF;
    for (let i = 0; i < 11; i++) {
      const d = tgt[i] - prev[i];
      cur[i] = snap ? tgt[i] : prev[i] + (d > step ? step : d < -step ? -step : d);
    }

    // ---- cara ----
    const f = FACES[faceName || face || FACE_OF[m]] || FACES.normal;
    tgt[11] = f.brow; tgt[12] = f.tilt; tgt[13] = f.eye; tgt[14] = f.big;
    tgt[15] = f.mouth === "smile" ? 1 : 0; tgt[16] = f.mouth === "frown" ? 1 : 0; tgt[17] = f.mouth === "oh" ? 1 : 0;
    tgt[18] = f.mw; tgt[19] = f.mh;

    // ---- mirada: cabeza, ojos y (si actúa) el cuerpo entero hacia el punto ----
    let turn = 0, hy = 0, hp = 0, px = 0, py = 0;
    if (gaze) {
      _look.copy(gaze);
      outer.worldToLocal(_look); // en el espacio del personaje, que mira hacia +z
      const yaw = Math.atan2(_look.x, _look.z);
      const pitch = Math.atan2(_look.y - HEAD_Y, Math.hypot(_look.x, _look.z));
      if (turning) {
        if (!seated) turn = yaw;
        else {
          if (Math.abs(yaw) < 2.7) side = yaw < 0 ? -1 : 1; // justo atrás: se queda con el lado que ya eligió
          turn = Math.abs(yaw) > 1.3 ? side * 1.3 : yaw;
        }
      }
      const rest = wrapPi(yaw - turn);
      hy = rest > 0.95 ? 0.95 : rest < -0.95 ? -0.95 : rest;
      hp = pitch > 0.5 ? 0.5 : pitch < -0.45 ? -0.45 : pitch;
      const eye = (rest - hy) / 0.5;
      px = eye > 1 ? 1 : eye < -1 ? -1 : eye;
      py = (pitch - hp) / 0.4;
      py = py > 1 ? 1 : py < -1 ? -1 : py;
    } else {
      // sin nada que mirar: de vez en cuando echa un vistazo a los lados
      const g = Math.sin(t * 0.55 + seed);
      px = g > 0.84 ? 0.7 : g < -0.84 ? -0.7 : 0;
    }
    tgt[20] = hy; tgt[21] = hp; tgt[22] = px; tgt[23] = py;
    const kf = snap ? 1 : 1 - Math.exp(-14 * dtF);
    for (let i = 11; i < 24; i++) cur[i] = prev[i] + (tgt[i] - prev[i]) * kf;
    cur[24] = prev[24] + wrapPi(turn - prev[24]) * (snap ? 1 : 1 - Math.exp(-9 * dtF));

    // ---- se aplica al modelo ----
    root.rotation.y = cur[24] + spin;
    root.position.y = jumpY;
    bodyGroup.position.y = LIFT + P.bob;
    bodyGroup.rotation.x = cur[8];
    head.position.y = LIFT + 0.72 + HEAD_H / 2 + P.bob;
    head.rotation.z = cur[9];
    head.rotation.x = cur[10] - cur[21];
    if (gaze || Math.abs(cur[20]) > 0.002) head.rotation.y = cur[20]; // (si no mira nada, no se toca: hay juegos que la giran ellos)
    arms[0].rotation.set(cur[0], cur[1], cur[2]);
    arms[1].rotation.set(cur[3], cur[4], cur[5]);
    legs[0].rotation.x = cur[6];
    legs[1].rotation.x = cur[7];

    let blink = 1;
    if (t > nextBlink) {
      const k = (t - nextBlink) / 0.14;
      blink = k < 1 ? Math.max(0.1, Math.abs(1 - k * 2)) : 1;
      if (k >= 1) nextBlink = t + 2 + Math.random() * 2.5;
    }
    if (mode === "sleep" || shut) blink = 0.08; // ojitos cerrados
    for (let i = 0; i < 2; i++) {
      eyes[i].scale.set(cur[14], cur[14] * cur[13] * blink, 1);
      for (const q of pupils[i]) q.o.position.set(q.x + cur[22] * 0.03, q.y + cur[23] * 0.022, q.o.position.z);
      const sx = i ? 1 : -1;
      brows[i].position.y = 0.225 + cur[11];
      brows[i].rotation.z = -sx * (0.18 + cur[12]);
    }
    const ws = cur[15], wf = cur[16], wo = cur[17];
    smile.visible = ws > 0.04;
    if (smile.visible) smile.scale.set(cur[18] * (0.35 + 0.65 * ws), cur[19] * (0.35 + 0.65 * ws), 1);
    frown.visible = wf > 0.04;
    if (frown.visible) frown.scale.setScalar(0.35 + 0.65 * wf);
    oh.visible = wo > 0.04;
    if (oh.visible) oh.scale.set(cur[18] * (0.35 + 0.65 * wo), 1.18 * cur[19] * (0.35 + 0.65 * wo), 1);
    if (hero.tick) hero.tick(t, m === "wave" || m === "clap" || m === "pump" || m === "fest" || m.startsWith("fest_") ? "cheer" : m === "shrug" || m === "crouch" ? "idle" : m, speed);
  }

  function setOutfit(next) {
    mats.jersey.color.set(next.jersey);
    mats.trim.color.set(next.trim);
  }

  const hero = {
    group: outer, head, bodyGroup, arms, legs, animate, setOutfit, logo,
    mats, eyes, brows, mouth, defaultStyle,
    defaults: { jeans: mats.jeans.color.getHex(), choco: mats.choco.color.getHex(), chocoDark: mats.chocoDark.color.getHex(), hair: mats.hair.color.getHex(), shoe: mats.shoe.color.getHex() },
    worn: [], tick: null, look: null,
    fest: null, // el festejo de gol que trae la camiseta puesta (lo anota applyLook)
    // --- actor ---
    seated: false, // (lo anota animate) va sentado: en lancha, auto o avioneta
    frames: 0, // cuadros animados (para saber si el juego lo animó en este cuadro)
    /** Cara por un rato: "feliz" | "wow" | "pena" | "ay" | "esfuerzo" | "normal". Después vuelve la que pide el gesto. */
    face(name, secs = 1) { faceName = FACES[name] ? name : null; faceT = secs; },
    /** Mira (cabeza y ojos) a un punto del mundo; `null` deja de mirar. `s` = lado preferido si el punto queda justo atrás. */
    lookAt(target, s = 0) { gaze = target || null; if (s) side = s < 0 ? -1 : 1; },
    /** Actuación de cuerpo entero, que manda sobre el modo que pide el juego: "gran" | "bien" | "justo" | "animo" | "hola"; `null` la termina. */
    act(name) { act = name && ACTS[name] ? { name, t: 0 } : null; },
    get acting() { return act ? act.name : null; },
    /** Viste al Matichico con un "look" completo (peinado, sombrero, ropa, etc.; ver wardrobe-data.js). */
    setLook(next) { applyLook(hero, next || {}); },
  };
  hero.setLook(look || { outfit: outfit && outfit.id });
  outer.userData.noToon = true; // los personajes no llevan el estilo de ambiente (sombreado por tonos)
  return hero;
}

