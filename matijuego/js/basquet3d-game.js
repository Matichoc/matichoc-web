// Lanzamientos de Básquet 3D: tiro libre contra el reloj, con la cámara detrás de tu
// Matichico en un gimnasio con hinchada. Se tira DESLIZANDO el dedo hacia el aro: la dirección del deslizamiento es
// la puntería y su largo, la potencia (mientras deslizas, la línea se pone verde cuando el tiro va adentro).
// Queda como opción el control clásico: dos barras (puntería y potencia) que se fijan con ESPACIO / toque; con el
// teclado siempre se juega así. El balón vuela con física real (aro, tablero y piso rebotan) y la red
// se mueve cuando es un "swish". Cada 5° tiro el aro es dorado (Chocolate Dubai).
//
// Torneo: tiras desde 8 lugares distintos (alas, esquinas, cerca del aro y de lejos); el Matichico corre
// de uno a otro y la cámara lo sigue, y en los niveles difíciles se mueve de lado mientras apuntas. Antes: 5 lugares de la cancha (más lejos = más puntos), la zona de
// puntería cambia en cada tiro, las rachas te ponen "en llamas" (zonas más grandes y puntos
// multiplicados), los swish y los aros dorados regalan segundos extra, y suena la hinchada.

import { THREE, Game3D, clamp, lerp, rand, canvasTexture, roundedBox, makeBunting, makeLogo, softShadowMaterial } from "./three-kit.js?v=bfcb83ff05";
import { createMatichico } from "./matichico3d.js?v=bfcb83ff05";
import { saveProgress, earnCoins } from "./storage.js?v=bfcb83ff05";
import * as audio from "./audio.js?v=bfcb83ff05";
import { campaignWin, campaign, campaignMode, campaignLevel, renderModePicker, LEVELS_PER_GAME } from "./campaign.js?v=bfcb83ff05";

const GAME_ID = "basquet_tiros";
const TIME_LIMIT = 60;
const AIM_TARGET = 0.5;
const POWER_TARGET = 0.7;
const GOLDEN_EVERY = 5;

// ---- tiro deslizando el dedo ----
// El deslizamiento se traduce a los mismos dos errores que medían las barras, así el resto del juego no cambia:
// la dirección (respecto de la línea que va del dedo al aro en la pantalla) es la puntería, y el largo, la potencia.
const CONTROL_KEY = "matichoc_basquet_tiro"; // "deslizar" (por defecto) o "barras": se guarda en el celular
// (23-nov, después de la primera prueba de la dueña en su celular: «quedó súper difícil… no se nota por dónde va a lanzar».
// Se soltaron las tolerancias, el largo justo pasó a ser siempre el mismo y se muestra la curva del tiro: ver _arcShow.)
const AIM_PER_RAD = 0.55; // con la tolerancia inicial (0,16) se perdonan unos 17° de desvío; con la mínima (0,05), unos 5°
const POWER_PER_LEN = 0.36; // con la tolerancia inicial (0,14) se perdona un 39 % de largo de más o de menos; con la mínima, un 12 %
const SWIPE_LEN = 0.34; // el largo justo: un tercio del alto de la pantalla, desde donde sea que se apoye el dedo (así el gesto se aprende)
const LONG_EASE = 0.5; // pasarse de largo cuenta la mitad que quedarse corto: con el dedo lo natural es deslizar de más
const SWIPE_MIN = 26; // píxeles: menos que esto es un toque, no un tiro
const MIRA_R = 13; // píxeles: radio del aro de la mira (la pelota dentro del aro = el tiro entra)
const ARC_DOTS = 14; // puntos de la curva que muestra por dónde va a ir la pelota
const ARC_COLOR = { justo: 0x4fe07a, corto: 0xffd34d, largo: 0xff6b6b, chueco: 0xff9f43 };
function loadControl() {
  try { return localStorage.getItem(CONTROL_KEY) === "barras" ? "barras" : "deslizar"; } catch (e) { return "deslizar"; }
}
const _proj = new THREE.Vector3();
const _planStart = new THREE.Vector3(), _planTarget = new THREE.Vector3(), _planF = new THREE.Vector3(), _planL = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

// lugares de tiro, repartidos por toda la cancha: [nombre, x, z, multiplicador de puntos]
// El Matichico corre de uno a otro y la cámara lo sigue, así que cada tiro se ve desde un lado distinto.
const SPOTS = [
  ["Tiro libre", 0, 0, 1],
  ["Ala izquierda", -4.3, -1.0, 1.3],
  ["Ala derecha", 4.3, -1.0, 1.3],
  ["Esquina izquierda", -5.2, -4.4, 1.5],
  ["Esquina derecha", 5.2, -4.4, 1.5],
  ["Cerca del aro", 0.9, -3.3, 0.8],
  ["Triple", 0, 2.1, 1.7],
  ["Desde lejos", -1.3, 3.1, 2],
];

const HOOP = { x: 0, y: 2.75, z: -6.4, r: 0.46 };
const BOARD_Z = HOOP.z - 0.62;
const BALL_R = 0.24;
const GRAV = -9.8;

const oscillate = (t, speed) => (Math.sin(t * speed) + 1) / 2;

function courtTexture() {
  const k = 2;
  return canvasTexture(1024, 1024, (g, w, h) => {
    // tablones de madera
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? "#d99a55" : "#cf8f4a";
      g.fillRect(0, (i * h) / 24, w, h / 24 + 1);
      g.fillStyle = "rgba(60,30,10,0.12)";
      g.fillRect(0, (i * h) / 24, w, 2);
    }
    g.strokeStyle = "#fff6e6";
    g.lineWidth = 8 * k;
    // zona (la pintura) en fucsia
    g.fillStyle = "rgba(212,33,108,0.78)";
    g.fillRect(w * 0.31, 0, w * 0.38, h * 0.52);
    g.strokeRect(w * 0.31, 0, w * 0.38, h * 0.52);
    // tiro libre
    g.beginPath();
    g.arc(w / 2, h * 0.52, w * 0.19, 0, Math.PI);
    g.stroke();
    g.beginPath();
    g.setLineDash([26, 22]);
    g.arc(w / 2, h * 0.52, w * 0.19, Math.PI, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // línea de 3
    g.beginPath();
    g.arc(w / 2, h * 0.1, w * 0.46, 0.1 * Math.PI, 0.9 * Math.PI);
    g.stroke();
    // logo al centro del arco
    g.fillStyle = "rgba(255,246,230,0.92)";
    g.font = '90px "Baby Chipmunk", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("MATICHOC", w / 2, h * 0.84);
  });
}

function ballTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = "#e26a1b";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#3a1a08";
    g.lineWidth = 7;
    for (const x of [0, w / 2, w]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const cx of [w * 0.25, w * 0.75]) {
      g.beginPath(); g.ellipse(cx, h / 2, w * 0.17, h * 0.46, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = "#FFC800";
    g.font = '60px "Baby Chipmunk", sans-serif';
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("M", w * 0.5, h * 0.3);
  });
}

export class Basquet3DGame extends Game3D {
  constructor(character, progress, els) {
    super(GAME_ID, character, progress, els, { fov: 50 });
    this.kawaii = true; // ambiente kawaii: pastel, sombreado por tonos, pétalos y estrellitas
    this.ambientOpts = { petals: 18, hearts: 5, stars: 13, radius: 10, height: 9 };
    this.musicTheme = "sport";
    this.soundscape = "estadio"; // de fondo, el murmullo del público (ver audio.scene)
    this.q = els.q;
    this.cheer = 0;
    this.swish = 0;
    this.shake = 0;
    this.sbLast = "";
    this.control = loadControl(); // cómo se tira: "deslizar" o "barras"
    this._kb = false; // se está jugando con el teclado (ahí siempre son las barras)
    this.sw = null; // el deslizamiento en curso: { id, x0, y0, x, y }
  }

  /** El fantasma (tu mejor partida) solo en el modo infinito. */
  get ghostKey() { return this.target ? null : "basquet_tiros"; }

  /** ¿Se juega con las barras? (por opción, o porque se está usando el teclado) */
  get bars() {
    return this.control === "barras" || this._kb;
  }

  /** Cambia el control (lo elige quien juega en la tarjeta de inicio) y lo deja guardado en el celular. */
  setControl(c) {
    this.control = c === "barras" ? "barras" : "deslizar";
    this._kb = false;
    try { localStorage.setItem(CONTROL_KEY, this.control); } catch (e) { /* sin almacenamiento: vale por esta vez */ }
    this._syncControl();
  }

  /** Deja la pantalla según el control: con el dedo no hay barras ni botón "¡Lanzar!". */
  _syncControl() {
    const screen = document.getElementById("screen-basquet");
    if (screen) screen.classList.toggle("bq-deslizar", !this.bars);
    const b = this.q("btn-control");
    if (b) b.textContent = this.control === "barras" ? "🎚️ Tiro: con las barras (clásico) · cambiar" : "👆 Tiro: deslizando el dedo · cambiar";
    const m = document.querySelector("#basquet-hud .hud-mission");
    if (m) m.textContent = this.bars ? "Fija puntería y potencia en el momento justo" : "Desliza el dedo hacia el aro";
  }

  // ---------- escena ----------

  async build() {
    const s = this.scene;
    s.background = new THREE.Color(0x24120a);
    s.fog = new THREE.Fog(0x24120a, 22, 52);
    s.add(new THREE.HemisphereLight(0xffeedd, 0x6a4020, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
    this.sun.position.set(-4, 14, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -10; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target);
    this.sun.target.position.set(0, 0, -3);
    this.onLowQuality = () => { this.sun.castShadow = false; };
    const spot = new THREE.SpotLight(0xffffff, 140, 30, 0.5, 0.6, 1.3);
    spot.position.set(0, 9, -3);
    spot.target.position.set(0, 2.5, -6);
    s.add(spot, spot.target);

    this.m = {
      pink: new THREE.MeshStandardMaterial({ color: 0xd4216c, roughness: 0.4 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc800, roughness: 0.25, metalness: 0.6, emissive: 0x6a4a00, emissiveIntensity: 0.4 }),
      cream: new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 0.5 }),
      brown: new THREE.MeshStandardMaterial({ color: 0x64321b, roughness: 0.6 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.3, metalness: 0.4, emissive: 0x802000, emissiveIntensity: 0.4 }),
    };

    this._buildGym();
    this._buildHoop();
    this._buildCrowd();

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 28, 20),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55, metalness: 0.05 }),
    );
    this.ball.castShadow = true;
    s.add(this.ball);
    this.ballV = new THREE.Vector3();
    // La curva del tiro (control deslizando): mientras el dedo desliza se ve por dónde va a ir la pelota y dónde va a caer
    // respecto del aro. Es una sola pieza con 14 puntos (un dibujo) más un aro chico en el punto de caída.
    this.arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
    this.arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 8, 6), this.arcMat, ARC_DOTS);
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arcRing = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 1.2, 0.045, 6, 24), this.arcMat);
    this.arcRing.rotation.x = Math.PI / 2;
    this.arcRing.visible = false;
    s.add(this.arc, this.arcRing);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 20), softShadowMaterial()); // sombra pintada suave
    this.ballShadow.rotation.x = -Math.PI / 2;
    s.add(this.ballShadow);

    this._ensureHero();
  }

  _buildGym() {
    const s = this.scene;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.32, metalness: 0.08 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -3.2);
    floor.receiveShadow = true;
    s.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: 0x4a2514, roughness: 0.5 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(0, -0.01, -8);
    outer.receiveShadow = true;
    s.add(outer);

    // pared del fondo con banners de marca
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), new THREE.MeshStandardMaterial({ color: 0x5a3320, roughness: 0.85 }));
    wall.position.set(0, 9, -13);
    s.add(wall);
    const mkBanner = (x, text, color) => {
      const b = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 1.4),
        new THREE.MeshStandardMaterial({
          map: canvasTexture(512, 164, (g, w, h) => {
            g.fillStyle = color; g.fillRect(0, 0, w, h);
            g.strokeStyle = "#FFC800"; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
            g.fillStyle = "#FFF6E6"; g.font = '86px "Baby Chipmunk", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
            g.fillText(text, w / 2, h / 2 + 4);
          }),
          roughness: 0.6,
        }),
      );
      b.position.set(x, x === 0 ? 4.6 : 6.4, -12.9);
      s.add(b);
    };
    mkBanner(-8, "MATICHOC", "#D4216C");
    mkBanner(0, "LA LIGA", "#3d1f10");
    mkBanner(8, "MATICHOC", "#D4216C");
    // el logo de Matichoc: dos medallones en la pared y uno grande en el piso de la cancha
    for (const lx of [-4, 4]) {
      const lg = makeLogo(2.4);
      lg.position.set(lx, 6.2, -12.88);
      s.add(lg);
    }
    const floorLogo = makeLogo(3.6, { lit: false });
    floorLogo.rotation.x = -Math.PI / 2;
    floorLogo.position.set(0, 0.03, 1.8);
    s.add(floorLogo);
    s.add(makeBunting(new THREE.Vector3(-13, 9.5, -12.5), new THREE.Vector3(13, 9.5, -12.5), { count: 30, sag: 1.4, size: 0.6 }));

    // luces del techo (emisivas: el bloom las hace brillar)
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
    for (const x of [-6, 0, 6]) for (const z of [-2, -9]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.5), lampMat);
      l.position.set(x, 10, z);
      s.add(l);
    }
    // marcador colgante
    this.sbCanvas = document.createElement("canvas");
    this.sbCanvas.width = 512; this.sbCanvas.height = 192;
    this.sbTex = new THREE.CanvasTexture(this.sbCanvas);
    this.sbTex.colorSpace = THREE.SRGBColorSpace;
    const sb = new THREE.Mesh(roundedBox(4.2, 1.5, 0.3, 0.12, 0.04), [this.m.brown]);
    sb.position.set(0, 6.5, -9);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.3), new THREE.MeshBasicMaterial({ map: this.sbTex }));
    face.position.set(0, 6.5, -8.83);
    s.add(sb, face);
    this._drawScoreboard();
  }

  _drawScoreboard() {
    const key = `${this.score}|${Math.ceil(Math.max(0, this.timeLeft || 0))}|${this.made}`;
    if (key === this.sbLast || !this.sbCanvas) return;
    this.sbLast = key;
    const g = this.sbCanvas.getContext("2d");
    g.fillStyle = "#1c0f07"; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = "#FFC800"; g.lineWidth = 6; g.strokeRect(6, 6, 500, 180);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#D4216C"; g.font = '30px "Baby Chipmunk", sans-serif';
    g.fillText("PUNTOS", 140, 38); g.fillText("TIEMPO", 372, 38);
    g.fillStyle = "#FFC800"; g.font = '96px "Baby Chipmunk", sans-serif';
    g.fillText(String(this.score ?? 0), 140, 112);
    g.fillStyle = (this.timeLeft ?? 60) <= 10 ? "#ff5a4a" : "#CFD767";
    g.fillText(String(Math.max(0, Math.ceil(this.timeLeft ?? TIME_LIMIT))).padStart(2, "0"), 372, 112);
    this.sbTex.needsUpdate = true;
  }

  _buildHoop() {
    const s = this.scene;
    const hoop = new THREE.Group();
    // soporte
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.2, 14), this.m.brown);
    pole.position.set(0, 2.1, BOARD_Z - 1.4);
    pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.5), this.m.brown);
    arm.position.set(0, HOOP.y + 0.5, BOARD_Z - 0.7);
    // tablero
    const board = new THREE.Mesh(roundedBox(2.0, 1.25, 0.1, 0.08, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, transmission: 0, clearcoat: 1 }));
    board.position.set(0, HOOP.y + 0.42, BOARD_Z - 0.05);
    board.castShadow = true;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.08, 1.33, 0.06), this.m.pink);
    frame.position.set(0, HOOP.y + 0.42, BOARD_Z - 0.12);
    const square = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xd4216c, wireframe: true }));
    square.position.set(0, HOOP.y + 0.2, BOARD_Z + 0.002);
    // aro
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(HOOP.r, 0.035, 10, 36), this.m.rim);
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.set(HOOP.x, HOOP.y, HOOP.z);
    this.rim.castShadow = true;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), this.m.rim);
    bracket.position.set(0, HOOP.y, BOARD_Z + 0.25);
    this.rimGlow = new THREE.PointLight(0xffc800, 0, 6);
    this.rimGlow.position.set(0, HOOP.y, HOOP.z);
    hoop.add(pole, arm, board, frame, square, this.rim, bracket, this.rimGlow);
    s.add(hoop);

    // red: tiras desde el aro hasta un anillo inferior
    const N = 14;
    const pos = [];
    this.netBase = [];
    const ringAt = (a, rad, y) => [HOOP.x + Math.cos(a) * rad, y, HOOP.z + Math.sin(a) * rad];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 0.5) / N) * Math.PI * 2;
      const aN = ((i + 1) / N) * Math.PI * 2;
      const top = ringAt(a0, HOOP.r, HOOP.y);
      const mid = ringAt(a1, HOOP.r * 0.82, HOOP.y - 0.22);
      const low = ringAt(aN, HOOP.r * 0.6, HOOP.y - 0.5);
      pos.push(...top, ...mid, ...mid, ...low);
      // cruces
      const midB = ringAt(a1 + (0.5 / N) * Math.PI * 2, HOOP.r * 0.82, HOOP.y - 0.22);
      pos.push(...mid, ...midB);
    }
    this.netBase = Float32Array.from(pos);
    this.netGeo = new THREE.BufferGeometry();
    this.netGeo.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(pos), 3));
    this.net = new THREE.LineSegments(this.netGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    s.add(this.net);
  }

  _buildCrowd() {
    const s = this.scene;
    const palette = [0xd4216c, 0xffc800, 0xcfd767, 0xfff6e6, 0x2fa8d6, 0xe8742a];
    const skin = [0x64321b, 0x8a5a36, 0xc98a4b, 0xe0ab72];
    this.crowd = [];
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.65, 0.4);
    const headGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const seats = [];
    const addBleacher = (cx, dir) => {
      for (let row = 0; row < 5; row++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5 + row * 0.5, 15), this.m.brown);
        step.position.set(cx + dir * row * 1.0, (0.5 + row * 0.5) / 2, -4);
        step.receiveShadow = true;
        s.add(step);
        for (let i = 0; i < 12; i++) {
          if (Math.random() < 0.12) continue;
          seats.push({ x: cx + dir * (row * 1.0 - 0.2), y: 0.5 + row * 0.5 + 0.32, z: -10.8 + i * 1.18 + rand(-0.15, 0.15), face: -dir });
        }
      }
    };
    addBleacher(-8, -1);
    addBleacher(8, 1);
    // hinchada del fondo
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 22; i++) {
        seats.push({ x: -10.5 + i * 1.0 + rand(-0.1, 0.1), y: 0.6 + row * 0.5, z: -11.2 - row * 0.6, face: 0, back: true });
      }
    }
    this.crowdBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), seats.length);
    this.crowdHead = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), seats.length);
    const col = new THREE.Color();
    seats.forEach((p, i) => {
      this.crowd.push({ ...p, phase: rand(0, 6.28), amp: rand(0.6, 1.2) });
      this.crowdBody.setColorAt(i, col.setHex(palette[Math.floor(Math.random() * palette.length)]));
      this.crowdHead.setColorAt(i, col.setHex(skin[Math.floor(Math.random() * skin.length)]));
    });
    this.crowdBody.instanceColor.needsUpdate = true;
    this.crowdHead.instanceColor.needsUpdate = true;
    this.crowdBody.castShadow = false;
    s.add(this.crowdBody, this.crowdHead);
    this._dummy = new THREE.Object3D();
    this._animateCrowd(0);
  }

  _animateCrowd() {
    const d = this._dummy;
    const t = this.time;
    this.crowd.forEach((p, i) => {
      const bob = Math.max(0, Math.sin(t * 6 + p.phase)) * (0.05 + this.cheer * 0.35) * p.amp;
      const arms = this.cheer > 0.1 ? 0.12 : 0;
      d.position.set(p.x, p.y + bob, p.z);
      d.rotation.set(0, p.face === 0 ? 0 : p.face * Math.PI / 2, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.crowdBody.setMatrixAt(i, d.matrix);
      d.position.y = p.y + 0.55 + bob + arms;
      d.updateMatrix();
      this.crowdHead.setMatrixAt(i, d.matrix);
    });
    this.crowdBody.instanceMatrix.needsUpdate = true;
    this.crowdHead.instanceMatrix.needsUpdate = true;
  }

  _ensureHero() {
    if (this.hero && this.heroId === this.character.id) {
      this.hero.setLook(this.look);
      return;
    }
    if (this.hero) this.scene.remove(this.hero.group);
    this.hero = createMatichico(this.character, this.outfit, this.look);
    this.heroId = this.character.id;
    this.hero.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.hero.group.scale.setScalar(1.35);
    this.hero.group.position.set(0, 0, 0);
    this.scene.add(this.hero.group);
    this.spotPos = new THREE.Vector3();
    this.moveFrom = new THREE.Vector3();
    this.strafeOff = 0;
    this.faceAngle = Math.PI;
  }

  /** Dirección del tiro (hacia el aro) y su lado izquierda-derecha, vistos desde un punto. */
  _shotDir(from, f = new THREE.Vector3(), l = new THREE.Vector3()) {
    f.set(HOOP.x - from.x, 0, HOOP.z - from.z).normalize();
    l.set(-f.z, 0, f.x);
    return { f, l };
  }

  onResize(w, h) {
    this.portrait = w / h < 0.9;
    this.camera.fov = this.portrait ? 66 : this.fov;
    this.camera.updateProjectionMatrix();
  }

  // ---------- partida ----------

  reset() {
    this.mode = campaignMode(this.progress, "basquet_tiros");
    this.level = this.mode === "levels" ? campaignLevel(this.progress, "basquet_tiros") : 0;
    this.target = this.level ? 250 + (this.level - 1) * 110 : 0; // puntos que hay que juntar en el nivel
    this.timeLeft = TIME_LIMIT;
    this.camPos = null;
    this.strafeT = 0;
    this.score = 0;
    this.made = 0;
    this.attempts = 0;
    this.coinsEarned = 0;
    this.cheer = 0;
    this.swish = 0;
    this.sbLast = "";
    this.streak = 0;
    this.bestStreak = 0;
    this.spotIdx = 0;
    this.aimTarget = AIM_TARGET;
    this.powerTarget = POWER_TARGET;
    this._ensureHero();
    this._startShot();
    this._updateHud();
    this._drawScoreboard();
    this._setZones();
  }

  _difficulty() { return this.attempts + (this.level ? (this.level - 1) * 0.9 : 0); }
  _fire() { return this.streak >= 3; }
  _accTol() { return Math.max(0.05, 0.16 - this._difficulty() * 0.006) * (this._fire() ? 1.3 : 1); }
  _powTol() { return Math.max(0.045, 0.14 - this._difficulty() * 0.006) * (this._fire() ? 1.3 : 1); }
  _mult() { return 1 + Math.min(3, Math.floor(this.streak / 2)) * 0.5; }
  _isGolden() { return this.attempts % GOLDEN_EVERY === GOLDEN_EVERY - 1; }

  _setZones() {
    const q = this.q;
    const aim = q("aim-zone");
    const pow = q("power-zone");
    if (aim) { aim.style.left = `${(this.aimTarget - this._accTol()) * 100}%`; aim.style.width = `${this._accTol() * 200}%`; }
    if (pow) { pow.style.bottom = `${(this.powerTarget - this._powTol()) * 100}%`; pow.style.height = `${this._powTol() * 200}%`; }
    const meters = q("meters");
    if (meters) meters.classList.toggle("golden", this._isGolden());
    this.rim.material = this._isGolden() ? this.m.gold : this.m.rim;
    this.rimGlow.intensity = this._isGolden() ? 12 : 0;
  }

  _startShot() {
    // lugar de tiro de este lanzamiento: el primero es el tiro libre, los demás varían
    if (this.attempts > 0) {
      let next = Math.floor(Math.random() * SPOTS.length);
      if (next === this.spotIdx) next = (next + 1) % SPOTS.length;
      this.spotIdx = next;
    }
    const [name, sx, sz] = SPOTS[this.spotIdx];
    // el Matichico corre al nuevo lugar (el primer tiro empieza ya ahí)
    this.moveFrom.copy(this.hero.group.position);
    this.spotPos.set(sx, 0, sz);
    const run = this.attempts > 0 ? this.moveFrom.distanceTo(this.spotPos) : 0;
    this.moveDur = run > 0.2 ? clamp(run / 9, 0.35, 0.85) : 0;
    this.moveT = 0;
    if (!this.moveDur) this.hero.group.position.copy(this.spotPos);
    this.strafeOff = 0;
    const dist = Math.hypot(sx - HOOP.x, sz - HOOP.z);
    this.aimTarget = clamp(AIM_TARGET + (this.attempts > 0 ? rand(-0.16, 0.16) : 0), 0.3, 0.7);
    this.powerTarget = clamp(POWER_TARGET + (6.4 - dist) * -0.045 + (this.attempts > 0 ? rand(-0.05, 0.05) : 0), 0.45, 0.88);
    if (this.attempts > 0) this.banner(name);
    this.stage = this.moveDur ? "move" : "aim";
    this.aimTime = 0;
    this.powerTime = 0;
    this.aimValue = 0;
    this.powerValue = 0;
    this.aimLocked = null;
    this.powerLocked = null;
    this.aimSpeed = 2.2 + this._difficulty() * 0.08;
    this.powerSpeed = 2.6 + this._difficulty() * 0.08;
    this.resultTimer = 0;
    this.sw = null;
    this._swipeLine(null);
    this.shotMade = false;
    this.scored = false;
    this.flightClock = 0;
    this.bounceSfx = 0;
    this._setZones();
    this._placeBallInHands();
  }

  _handPos(out) {
    const hp = this.hero.group.position;
    const { f } = this._shotDir(hp);
    return out.set(hp.x + f.x * 0.4, 1.55, hp.z + f.z * 0.4);
  }

  _placeBallInHands() {
    this._handPos(this.ball.position);
    this.ballV.set(0, 0, 0);
    this.ball.visible = true;
  }

  onBegin() {
    this.stage = "aim";
  }

  // ---------- tiro deslizando el dedo ----------

  /**
   * Hacia dónde y cuánto hay que deslizar, partiendo del punto (x0, y0) del escenario donde se apoyó el dedo: la
   * dirección es la del aro tal como se ve en la pantalla, y el largo justo es siempre un tercio del alto de la pantalla
   * (no depende de dónde se apoye el dedo ni del lugar de tiro: el mismo gesto sirve siempre).
   */
  _swipeIdeal(x0, y0) {
    const w = this.els.wrap.clientWidth || 1, h = this.els.wrap.clientHeight || 1;
    _proj.set(HOOP.x, HOOP.y, HOOP.z).project(this.camera);
    const hx = (_proj.x * 0.5 + 0.5) * w, hy = (-_proj.y * 0.5 + 0.5) * h;
    const dx = hx - x0, dy = hy - y0;
    const d = Math.hypot(dx, dy) || 1;
    return { hx, hy, dx: dx / d, dy: dy / d, len: h * SWIPE_LEN };
  }

  /** Lee un deslizamiento: su largo, cuánto apunta hacia el aro y los dos errores (puntería y potencia). */
  _swipeRead(sw) {
    const I = this._swipeIdeal(sw.x0, sw.y0);
    const sx = sw.x - sw.x0, sy = sw.y - sw.y0;
    const L = Math.hypot(sx, sy);
    const hacia = L > 0 ? (sx * I.dx + sy * I.dy) / L : 0; // 1 = directo al aro, 0 = de lado, negativo = hacia atrás
    const ang = Math.atan2(I.dx * sy - I.dy * sx, I.dx * sx + I.dy * sy); // positivo = desviado a la derecha
    const r = L / I.len - 1; // cuánto más largo (o más corto) que el largo justo
    return { L, hacia, accErr: ang * AIM_PER_RAD, powErr: (r > 0 ? r * LONG_EASE : r) * POWER_PER_LEN };
  }

  /**
   * Lo que se ve mientras el dedo desliza: la línea que lo sigue, la curva de la pelota en la cancha y, arriba (donde la
   * mano no tapa), la guía: una mira con el aro visto desde arriba y la pelota donde va a caer, más una frase que dice
   * qué falta. La pelota dentro del aro = el tiro entra.
   */
  _swipeLine(sw) {
    const el = this.swEl;
    if (!el) return;
    if (!sw) { el.className = "bq-swipe"; this.swMsg = ""; this._swOk = false; this._arcHide(); this._guia(null); return; }
    const m = this._swipeRead(sw);
    const valid = m.L >= SWIPE_MIN && m.hacia > 0.2;
    const aTol = this._accTol(), pTol = this._powTol();
    const ok = valid && Math.abs(m.accErr) <= aTol && Math.abs(m.powErr) <= pTol;
    // justo = va adentro · chueco = mal apuntado · corto = falta largo · largo = sobra
    const estado = !valid ? "" : ok ? "justo" : Math.abs(m.accErr) > aTol ? "chueco" : m.powErr < 0 ? "corto" : "largo";
    el.className = `bq-swipe on ${estado}`;
    el.style.width = `${Math.max(8, m.L)}px`;
    el.style.transform = `translate(${sw.x0}px, ${sw.y0}px) rotate(${Math.atan2(sw.y - sw.y0, sw.x - sw.x0)}rad)`;
    // el Matichico gira un poco hacia donde va el dedo
    this.aimValue = clamp(0.5 + m.accErr * 0.9, 0, 1);
    this.swMsg = !valid ? "Desliza hacia el aro 👆"
      : ok ? "¡Ahí! Suelta 👌"
        : estado === "chueco" ? (m.accErr > 0 ? "⬅ Más a la izquierda" : "Más a la derecha ➡")
          : estado === "corto" ? "Más largo ⬆" : "Más corto ⬇";
    if (ok && !this._swOk) this.haptic(12); // un toquecito al entrar en la zona buena
    this._swOk = ok;
    // dónde cae la pelota respecto del aro, en "aros": 0 = al centro, 1 = justo en el borde de lo que entra
    const nx = m.accErr / aTol, ny = m.powErr / pTol; // a la derecha = desviado a la derecha; hacia arriba = más lejos (se pasó)
    this._guia(estado, this.swMsg, valid ? nx : 0, valid ? ny : -1.6);
    if (valid) this._arcShow(m, estado); else this._arcHide();
  }

  /** La guía de arriba: la mira (aro y pelota) y la frase. Solo toca la pantalla cuando algo cambia. */
  _guia(estado, msg, nx = 0, ny = 0) {
    const g = this.guiaEl;
    if (!g) return;
    if (estado === null) { if (this._guiaKey !== "") { this._guiaKey = ""; g.className = "bq-guia"; } return; }
    // la pelota se dibuja a esa distancia del centro (el borde del aro es 1); lo que está muy lejos se queda en la orilla de la mira
    const far = Math.max(Math.abs(nx), Math.abs(ny)), len = Math.hypot(nx, ny) || 1;
    const r = Math.min(far, 2.05) * MIRA_R;
    const x = Math.round((nx / len) * r), y = Math.round((-ny / len) * r);
    const key = `${estado}|${msg}|${x}|${y}`;
    if (key === this._guiaKey) return;
    this._guiaKey = key;
    g.className = `bq-guia on ${estado}`;
    this.guiaBall.style.transform = `translate(${x}px, ${y}px)`;
    this.guiaText.textContent = msg;
  }

  /** Dibuja la curva que haría la pelota con ese deslizamiento y marca dónde caería (el mismo cálculo del tiro de verdad). */
  _arcShow(m, estado) {
    const { start, target, T } = this._shotPlan(m.accErr, m.powErr);
    const vx = (target.x - start.x) / T, vy = (target.y - start.y - 0.5 * GRAV * T * T) / T, vz = (target.z - start.z) / T;
    const cam = this.camera.position;
    for (let k = 0; k < ARC_DOTS; k++) {
      const t = (T * (k + 1)) / ARC_DOTS;
      const x = start.x + vx * t, y = start.y + vy * t + 0.5 * GRAV * t * t, z = start.z + vz * t;
      // cada punto se agranda con la distancia a la cámara: así se ven todos más o menos del mismo porte en la pantalla
      const sc = clamp(Math.hypot(x - cam.x, y - cam.y, z - cam.z) * 0.22, 0.6, 2.6);
      _m4.makeScale(sc, sc, sc).setPosition(x, y, z);
      this.arc.setMatrixAt(k, _m4);
    }
    this.arc.instanceMatrix.needsUpdate = true;
    this.arcMat.color.setHex(ARC_COLOR[estado] || 0xffffff);
    this.arcRing.position.copy(target);
    this.arc.visible = this.arcRing.visible = true;
  }

  _arcHide() {
    if (this.arc) this.arc.visible = this.arcRing.visible = false;
  }

  /** Suelta el dedo: si fue un deslizamiento hacia el aro, sale el tiro. */
  _swipeShot(sw) {
    if (this.state !== "playing" || !this.running || this.stage !== "aim") return;
    const m = this._swipeRead(sw);
    if (m.L < SWIPE_MIN || m.hacia <= 0.2) return; // un toque, o un deslizamiento que no va hacia el aro
    this.aimLocked = this.aimTarget + m.accErr;
    this.powerLocked = this.powerTarget + m.powErr;
    audio.playJump();
    this._launchBall();
  }

  _tryAction() {
    if (this.state !== "playing" || !this.running) return;
    if (!this.bars) return; // (con el dedo se tira deslizando: ver _swipeShot)
    if (this.stage === "aim") {
      this.aimLocked = this.aimValue;
      this.stage = "power";
      this.powerTime = 0;
      audio.playJump();
    } else if (this.stage === "power") {
      this.powerLocked = this.powerValue;
      this._launchBall();
      audio.playJump();
    }
  }

  /**
   * El plan de un tiro con esos dos errores (puntería y potencia): si entra, de dónde sale, dónde va a caer y cuánto
   * tarda en llegar. Lo usan el lanzamiento de verdad y la curva que se muestra mientras se desliza: así coinciden.
   */
  _shotPlan(accErr, powErr) {
    const aErr = Math.abs(accErr);
    const pErr = Math.abs(powErr);
    const made = aErr <= this._accTol() && pErr <= this._powTol();
    const clean = made && aErr <= this._accTol() / 2 && pErr <= this._powTol() / 2;
    let ox;
    let oz;
    if (made) {
      // el balón baja en picada: se apunta un poquito más allá del centro para que no roce el aro de adelante
      ox = clean ? 0 : (accErr / this._accTol()) * 0.12;
      oz = -0.17 + (clean ? 0 : (powErr / this._powTol()) * 0.09);
    } else {
      ox = accErr * 3.4;
      oz = -powErr * 3.6; // potencia de más → más lejos (z más negativo)
      const len = Math.hypot(ox, oz);
      const min = 0.62;
      if (len < min) {
        const a = len < 0.001 ? rand(0, 6.28) : Math.atan2(oz, ox);
        ox = Math.cos(a) * min;
        oz = Math.sin(a) * min;
      }
    }
    const start = this._handPos(_planStart);
    // el error de puntería es de lado a lado de la línea del tiro y la potencia, a lo largo de ella
    const { f, l } = this._shotDir(this.hero.group.position, _planF, _planL);
    const target = _planTarget.set(HOOP.x + l.x * ox - f.x * oz, HOOP.y + (made ? 0.0 : 0.05), HOOP.z + l.z * ox - f.z * oz);
    // el tiempo de vuelo crece con la distancia para que el balón siempre baje con la misma pendiente
    const D = Math.hypot(target.x - start.x, target.z - start.z);
    const T = Math.sqrt((2 * (0.72 * D + (HOOP.y - start.y))) / -GRAV);
    return { made, clean, start, target, T };
  }

  _launchBall() {
    if (!this.spendAction(1)) return; // cada lanzamiento gasta 1 ⚡
    const { made, clean, start, target, T } = this._shotPlan(this.aimLocked - this.aimTarget, this.powerLocked - this.powerTarget);
    this.shotMade = made;
    this.shotClean = clean;
    this.stage = "flying";
    this._arcHide();
    this.ballV.set(
      (target.x - start.x) / T,
      (target.y - start.y - 0.5 * GRAV * T * T) / T,
      (target.z - start.z) / T,
    );
    this.ball.position.copy(start);
    this.flightClock = 0;
    this.hero.animate(this.time, "jump", 1);
    this.heroJump = 0.5;
    this.attempts++; // se cuenta al lanzar
    this.shotGolden = (this.attempts - 1) % GOLDEN_EVERY === GOLDEN_EVERY - 1;
    this._updateHud();
  }

  _settleShot(made) {
    if (this.stage === "result") return;
    this.stage = "result";
    this.resultTimer = 1.0;
    if (made) {
      this.made++;
      const wasFire = this._fire();
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      const spotMult = SPOTS[this.spotIdx][3];
      let gained = 20 + (this.shotClean ? 10 : 0);
      if (this.shotGolden) {
        gained += 10;
        earnCoins(this.progress, 15);
        this.coinsEarned += 15;
        saveProgress(this.progress);
      }
      gained = Math.round(gained * spotMult * this._mult());
      // segundos de regalo: swish +2, aro dorado +4
      const extra = (this.shotClean ? 2 : 0) + (this.shotGolden ? 4 : 0);
      if (extra) { this.timeLeft += extra; this.popups.add(new THREE.Vector3(HOOP.x + 1, HOOP.y + 0.3, HOOP.z + 0.6), `+${extra} s ⏱`, "combo"); }
      if (!wasFire && this._fire()) { this.banner("¡EN LLAMAS! 🔥"); audio.playPowerup(); this.haptic(50); }
      else if (this.streak >= 2) audio.playCombo(this.streak);
      this.score += gained;
      this.cheer = 1;
      this.swish = this.shotClean ? 1 : 0.6;
      audio.playBonusCollect();
      const at = new THREE.Vector3(HOOP.x, HOOP.y + 0.9, HOOP.z + 0.4);
      this.particles.burst(new THREE.Vector3(HOOP.x, HOOP.y - 0.2, HOOP.z), [0xffc800, 0xd4216c, 0xcfd767, 0xffffff], 36, 5.5, 1.3, 7, 1.3);
      this.popups.add(at, this.shotClean ? `¡SWISH! +${gained}` : `+${gained}`, this.shotClean ? "combo" : "kill");
      if (this.shotGolden) this.popups.add(new THREE.Vector3(at.x, at.y + 0.9, at.z), "+15 🍫✨", "coin");
      this.heroMode = "cheer";
      this.heroModeTimer = 1.1;
      audio.playCheer(this.shotClean ? 0.8 : 0.55);
    } else {
      audio.playBump();
      this.streak = 0;
      this.heroMode = "sad";
      this.heroModeTimer = 0.9;
    }
    this._updateHud();
    this._drawScoreboard();
  }

  _updateHud() {
    const q = this.q;
    q("hud-score").textContent = this.target ? `${this.score}/${this.target}` : String(this.score);
    q("hud-made").textContent = String(this.made);
    q("hud-attempts").textContent = String(this.attempts);
    q("hud-coins").textContent = String(this.progress.coins);
    const st = q("hud-streak");
    if (st) st.textContent = this._fire() ? `🔥 x${this.streak}` : `x${this.streak}`;
  }

  // ---------- física del balón ----------

  _stepBall(dt) {
    const b = this.ball.position;
    const v = this.ballV;
    const sub = 3;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      v.y += GRAV * h;
      b.addScaledVector(v, h);
      // tablero
      if (b.z - BALL_R < BOARD_Z && b.z > BOARD_Z - 0.2 && Math.abs(b.x - HOOP.x) < 1.0 && b.y > HOOP.y - 0.2 && b.y < HOOP.y + 1.05 && v.z < 0) {
        b.z = BOARD_Z + BALL_R;
        v.z = Math.abs(v.z) * 0.45;
        v.x *= 0.85;
        this._sfx();
      }
      // aro
      const dx = b.x - HOOP.x;
      const dz = b.z - HOOP.z;
      const L = Math.hypot(dx, dz) || 0.0001;
      const px = HOOP.x + (dx / L) * HOOP.r;
      const pz = HOOP.z + (dz / L) * HOOP.r;
      const nx = b.x - px;
      const ny = b.y - HOOP.y;
      const nz = b.z - pz;
      const D = Math.hypot(nx, ny, nz);
      const touch = BALL_R + 0.035;
      if (D < touch && D > 0.0001) {
        const ux = nx / D;
        const uy = ny / D;
        const uz = nz / D;
        b.x += ux * (touch - D);
        b.y += uy * (touch - D);
        b.z += uz * (touch - D);
        const vn = v.x * ux + v.y * uy + v.z * uz;
        if (vn < 0) {
          v.x -= 1.55 * vn * ux;
          v.y -= 1.55 * vn * uy;
          v.z -= 1.55 * vn * uz;
          this.rimShake = 1;
          this._sfx();
        }
      }
      // dentro de la red: frena un poco (efecto red)
      if (this.shotMade && b.y < HOOP.y && b.y > HOOP.y - 0.55 && Math.hypot(dx, dz) < HOOP.r) {
        v.x *= 1 - 3 * h;
        v.z *= 1 - 3 * h;
        v.y *= 1 - 0.8 * h;
      }
      // piso
      if (b.y - BALL_R < 0) {
        b.y = BALL_R;
        if (v.y < -0.8) this._sfx();
        v.y = -v.y * 0.62;
        v.x *= 0.88;
        v.z *= 0.88;
        if (Math.abs(v.y) < 0.4) v.y = 0;
      }
      // paredes invisibles
      if (b.z < -12) { b.z = -12; v.z = Math.abs(v.z) * 0.4; }
      if (Math.abs(b.x) > 6) { b.x = Math.sign(b.x) * 6; v.x *= -0.4; }
    }
    this.ball.rotation.x += v.z * dt * 2.2;
    this.ball.rotation.z -= v.x * dt * 2.2;
    this.ballShadow.position.set(b.x, 0.02, b.z);
    const sh = clamp(1 - b.y / 7, 0.2, 1);
    this.ballShadow.scale.setScalar(sh);
    this.ballShadow.material.opacity = 0.32 * sh;
  }

  _sfx() {
    if (this.time - this.bounceSfx < 0.12) return;
    this.bounceSfx = this.time;
    audio.playBump();
  }

  // ---------- bucle ----------

  update(dt) {
    this.shake = Math.max(0, this.shake - dt);
    this.cheer = Math.max(0, this.cheer - dt * 0.7);
    this.swish = Math.max(0, this.swish - dt * 1.4);
    this.rimShake = Math.max(0, (this.rimShake || 0) - dt * 4);
    this._animateCrowd();
    this._animateNet();
    this._fireFx();
    this.rim.position.y = HOOP.y + Math.sin(this.time * 60) * 0.012 * this.rimShake;

    if (this.state === "playing") {
      this.timeLeft -= dt;
      const chip = this.q("hud-timer-chip");
      chip.classList.toggle("low", this.timeLeft <= 10);
      this.hurry = this.timeLeft <= 10 && this.timeLeft > 0; // la música sube y suena un tic-tac
      this.q("hud-timer").textContent = String(Math.max(0, Math.ceil(this.timeLeft))).padStart(2, "0");
      this._drawScoreboard();
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._onGameOver();
        return;
      }

      if (this.stage === "move") {
        // corre hasta el nuevo lugar de tiro
        this.moveT += dt / this.moveDur;
        const k = clamp(this.moveT, 0, 1);
        const e = k * k * (3 - 2 * k);
        this.hero.group.position.lerpVectors(this.moveFrom, this.spotPos, e);
        if (k >= 1) { this.stage = "aim"; this.aimTime = 0; }
      } else if (this.stage === "aim") {
        this.aimTime += dt;
        if (this.bars) this.aimValue = oscillate(this.aimTime, this.aimSpeed);
        else if (this.sw) this._swipeLine(this.sw); // (el Matichico se mueve de lado en los niveles difíciles: el color sigue al día)
        else this.aimValue = 0.5;
        this._strafe(dt);
      } else if (this.stage === "power") {
        this.powerTime += dt;
        this.powerValue = oscillate(this.powerTime, this.powerSpeed);
        this._strafe(dt);
      } else if (this.stage === "flying" || this.stage === "result") {
        const prevY = this.ball.position.y;
        this._stepBall(dt);
        this.flightClock += dt;
        if (this.stage === "flying") {
          const b = this.ball.position;
          const crossed = prevY >= HOOP.y && b.y < HOOP.y && Math.hypot(b.x - HOOP.x, b.z - HOOP.z) < HOOP.r + 0.05 && this.ballV.y < 0;
          if (crossed && this.shotMade) this._settleShot(true);
          else if (this.flightClock > 0.5 && (b.y < 0.6 && this.ballV.y <= 0 || this.flightClock > 3.2)) this._settleShot(false);
        } else {
          this.resultTimer -= dt;
          if (this.resultTimer <= 0) this._startShot();
        }
      }
    }
    this._updateMeters();
    this._updateHero(dt);
    this._placeCamera(dt);
  }

  /** En los niveles difíciles el Matichico se mueve de lado mientras apuntas: tira desde donde esté. */
  _strafe(dt) {
    const amp = clamp((this._difficulty() - 5) * 0.12, 0, 1.5);
    if (amp <= 0) return;
    this.strafeT = (this.strafeT || 0) + dt;
    const off = Math.sin(this.strafeT * 1.5) * amp;
    const { l } = this._shotDir(this.spotPos);
    this.hero.group.position.set(this.spotPos.x + l.x * off, 0, this.spotPos.z + l.z * off);
  }

  _updateMeters() {
    const q = this.q;
    const am = q("aim-marker");
    const pm = q("power-marker");
    if (am) {
      const v = this.stage === "aim" ? this.aimValue : this.aimLocked ?? 0;
      am.style.left = `${v * 100}%`;
      am.classList.toggle("locked", this.stage !== "aim");
    }
    if (pm) {
      const v = this.stage === "power" ? this.powerValue : this.powerLocked ?? 0;
      pm.style.bottom = `${v * 100}%`;
      pm.classList.toggle("locked", this.stage !== "power");
    }
    const meters = q("meters");
    if (meters) meters.classList.toggle("off", this.stage === "flying" || this.stage === "result" || this.stage === "move");
    const hint = q("hint");
    if (hint) {
      if (this.bars) hint.textContent = this.stage === "aim" ? "¡Fija la PUNTERÍA!" : this.stage === "power" ? "¡Ahora la POTENCIA!" : "";
      else hint.textContent = this.stage === "aim" && !this.sw && this.attempts < 3 ? "Desliza el dedo hacia el aro 👆" : ""; // (sin tocar, la ayuda sale solo los primeros tiros; deslizando, habla la guía: ver _guia)
    }
  }

  _fireFx() {
    // la pelota echa fuego cuando estás en racha
    if (this._fire() && (this.stage === "flying" || this.stage === "aim" || this.stage === "power") && Math.random() < 0.7) {
      this.particles.burst(this.ball.position.clone(), [0xff8a2a, 0xffe14a, 0xff3b3b], 1, 1.2, 0.5, 3, -0.6);
    }
  }

  _animateNet() {
    const pos = this.netGeo.attributes.position;
    const base = this.netBase;
    const sw = this.swish;
    const t = this.time;
    for (let i = 0; i < pos.count; i++) {
      const y0 = base[i * 3 + 1];
      const depth = clamp((HOOP.y - y0) / 0.5, 0, 1);
      const wob = Math.sin(t * 24 + i) * 0.03 * sw * depth;
      pos.setX(i, HOOP.x + (base[i * 3] - HOOP.x) * (1 + sw * 0.18 * depth) + wob);
      pos.setY(i, y0 - sw * 0.22 * depth * (0.6 + 0.4 * Math.sin(t * 18)));
      pos.setZ(i, HOOP.z + (base[i * 3 + 2] - HOOP.z) * (1 + sw * 0.18 * depth) + wob);
    }
    pos.needsUpdate = true;
  }

  _updateHero(dt) {
    const g = this.hero.group;
    if (this.heroModeTimer > 0) {
      this.heroModeTimer -= dt;
      if (this.heroModeTimer <= 0) this.heroMode = "idle";
    }
    // el Matichico mira hacia el aro y se inclina según la puntería
    const aim = this.stage === "aim" ? this.aimValue : this.aimLocked ?? 0.5;
    let face = Math.atan2(HOOP.x - g.position.x, HOOP.z - g.position.z); // mira hacia el aro
    if (this.stage === "move") face = Math.atan2(this.spotPos.x - this.moveFrom.x, this.spotPos.z - this.moveFrom.z); // o hacia donde corre
    const target = face + (this.stage === "move" ? 0 : (aim - 0.5) * 0.7);
    // gira por el camino corto
    let dA = target - (g.rotation.y || 0);
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    g.rotation.y = (g.rotation.y || 0) + dA * (1 - Math.exp(-12 * dt));
    if (this.state === "gameover") g.rotation.y = 0;
    let mode = this.heroMode || "idle";
    if (this.stage === "move") mode = "run";
    if (this.heroJump > 0) { this.heroJump -= dt; mode = "jump"; }
    if (this.state === "gameover") mode = this.score > 0 ? "cheer" : "sad";
    this.hero.animate(this.time, mode, 1);
    if (this.stage === "aim" || this.stage === "power" || this.stage === "move") this._placeBallInHands();
    else if (this.stage === "flying" && this.flightClock < 0.04) this.ball.visible = true;
  }

  _placeCamera(dt) {
    const sway = Math.sin(this.time * 0.4) * 0.12;
    const follow = this.stage === "flying" || this.stage === "result" ? clamp((this.ball.position.y - 1.5) * 0.18, -0.3, 0.7) : 0;
    this.camFollow = lerp(this.camFollow || 0, follow, 1 - Math.exp(-4 * (dt || 0.016)));
    const sk = this.shake * 0.05;
    const portrait = this.portrait;
    // la cámara va detrás del Matichico, mirando al aro: cada lugar de tiro se ve desde un ángulo distinto
    const hp = this.hero.group.position;
    const { f, l } = this._shotDir(hp);
    const dir = new THREE.Vector3(f.x * 0.6, 0, f.z * 0.6 - 0.4).normalize(); // mezcla con "de frente a la cancha" para no salirse del gimnasio
    const back = portrait ? 6.4 : 5.6;
    const want = new THREE.Vector3(hp.x - dir.x * back + l.x * 0.9, (portrait ? 3.5 : 3.25) + this.camFollow * 0.2, hp.z - dir.z * back + l.z * 0.9);
    want.x = clamp(want.x, -8.5, 8.5);
    want.z = clamp(want.z, -4.5, 9);
    const look = new THREE.Vector3(hp.x + (HOOP.x - hp.x) * 0.62, (portrait ? 2.3 : 2.1) + this.camFollow, hp.z + (HOOP.z - hp.z) * 0.62);
    if (!this.camPos) { this.camPos = want.clone(); this.camLook = look.clone(); }
    const k = 1 - Math.exp(-5 * (dt || 0.016));
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    this.camera.position.set(this.camPos.x + sway + rand(-sk, sk), this.camPos.y, this.camPos.z);
    this.camera.lookAt(this.camLook);
  }

  /** En la tarjeta de inicio se elige entre "Infinito" y los 20 niveles. */
  onIntro() {
    renderModePicker(this.els.q("lvlpick"), { id: "basquet_tiros", progress: this.progress, onChange: () => this.reset() });
    this._kb = false;
    this._syncControl();
  }

  nextLevel() {
    campaign(this.progress, "basquet_tiros").selected = Math.min(LEVELS_PER_GAME, this.level + 1);
    this.particles.clear();
    this.popups.clear();
    this.state = "intro";
    this.reset();
    this.beginPlaying();
  }

  _onGameOver() {
    if (this.level) {
      // modo niveles: se gana si se juntó la meta de puntos
      const ratio = this.score / this.target;
      if (ratio >= 1) {
        const stars = ratio >= 1.7 ? 3 : ratio >= 1.3 ? 2 : 1;
        if (this.level >= LEVELS_PER_GAME) {
          campaignWin(this.progress, "basquet_tiros", this.level, stars);
          const t = this.els.q("gameover-title");
          if (t) t.textContent = `¡Completaste los ${LEVELS_PER_GAME} niveles! 🏆`;
          audio.playVictory();
          this.finish(`Cerraste con ${this.score} puntos y ${this.made} tiros encestados.`);
        } else this.levelWin({ level: this.level, stars, text: `${this.score} puntos (la meta era ${this.target}) con ${this.made} de ${this.attempts} tiros.` });
        return;
      }
      audio.playLose();
      const t = this.els.q("gameover-title");
      if (t) t.textContent = "¡Casi! Se acabó el tiempo";
      this.finish(`Nivel ${this.level}: sumaste ${this.score} de ${this.target} puntos (${this.made} de ${this.attempts} tiros). ¡Inténtalo otra vez!`);
      return;
    }
    const t = this.els.q("gameover-title");
    if (t) t.textContent = "¡Se acabó el tiempo!";
    audio.playLose();
    this.finish(
      `Encestaste ${this.made} de ${this.attempts} tiros (mejor racha: ${this.bestStreak}) y sumaste ${this.score} puntos` + (this.coinsEarned > 0 ? `, ganando ${this.coinsEarned} Matipuntos.` : "."),
    );
  }

  // ---------- entrada ----------

  async init() {
    const first = !this.ready;
    await super.init();
    if (first) this._bindInput();
  }

  _bindInput() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.key === " ") {
        if (this.running && this.state === "playing") {
          e.preventDefault();
          if (!this._kb && this.control !== "barras") { this._kb = true; this._syncControl(); } // con el teclado se juega con las barras
        }
        this._tryAction();
      }
    });
    // la línea que sigue al dedo (una sola pieza de HTML que cambia de largo, giro y color)
    this.swEl = document.createElement("div");
    this.swEl.className = "bq-swipe";
    this.swEl.setAttribute("aria-hidden", "true");
    this.els.wrap.appendChild(this.swEl);
    // la guía de arriba: la mira (el aro visto desde arriba y la pelota donde va a caer) y la frase que dice qué falta
    this.guiaEl = document.createElement("div");
    this.guiaEl.className = "bq-guia";
    this.guiaEl.setAttribute("aria-hidden", "true");
    this.guiaEl.innerHTML = '<span class="bq-mira"><i class="aro"></i><i class="pelota">🏀</i></span><span class="bq-guia-txt"></span>';
    this.guiaBall = this.guiaEl.querySelector(".pelota");
    this.guiaText = this.guiaEl.querySelector(".bq-guia-txt");
    this._guiaKey = "";
    this.els.wrap.appendChild(this.guiaEl);
    const c = this.els.canvas;
    const at = (e) => { const r = this.els.wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.state !== "playing" || !this.running) return;
      if (this.control === "barras") { this._tryAction(); return; }
      if (this._kb) { this._kb = false; this._syncControl(); } // volvió a usar el dedo o el mouse
      if (this.stage !== "aim") return;
      const [x, y] = at(e);
      this.sw = { id: e.pointerId, x0: x, y0: y, x, y };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* sin captura: igual llegan los movimientos sobre el lienzo */ }
      this._swipeLine(this.sw);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.sw || e.pointerId !== this.sw.id) return;
      [this.sw.x, this.sw.y] = at(e);
      this._swipeLine(this.sw);
    });
    const soltar = (e, tirar) => {
      if (!this.sw || e.pointerId !== this.sw.id) return;
      const sw = this.sw;
      [sw.x, sw.y] = at(e);
      this.sw = null;
      this._swipeLine(null);
      if (tirar) this._swipeShot(sw);
    };
    c.addEventListener("pointerup", (e) => soltar(e, true));
    c.addEventListener("pointercancel", (e) => soltar(e, false));
    const shootBtn = document.getElementById("basquet-btn-shoot");
    if (shootBtn) shootBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); this._tryAction(); });
    const ctl = this.q("btn-control");
    if (ctl) ctl.addEventListener("click", () => this.setControl(this.control === "barras" ? "deslizar" : "barras"));
    this._syncControl();
  }
}
