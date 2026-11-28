// Bloques de Productos 3D: el mismo juego de siempre (js/tetris-pieces.js) pero las
// golosinas son cubos de chocolate brillantes dentro de una vitrina de cristal con
// marco dorado. Las líneas explotan en confeti, la pieza cae con sombra "fantasma" (que cada jugador puede apagar:
// a algunos niños les ayuda y a otros les molesta; parte encendida) y tu Matichico celebra cada línea desde un costado.
//
// Versión "Gran Vitrina": guardar una pieza (C / Shift), combos y back-to-back, cubos de poder
// (bomba que limpia 3x3 y rayo que limpia la fila), subida de nivel con cambio de ambiente y música.
//
// Juego «tablero» (23-nov-2026, se elige en la tarjeta de inicio): sin apuro. Las 8 filas de arriba de la vitrina son
// un tablero de 8 × 8 y abajo hay una bandeja con 3 piezas: se arrastran al tablero con el dedo, y cada fila o
// columna completa se limpia. Nada cae ni corre el tiempo; se acaba cuando ya no cabe ninguna de las piezas.

import { THREE, Game3D, lerp, rand, canvasTexture, loadTexture, roundedBox, makeBunting, makeStars, makeLogo } from "./three-kit.js?v=bfcb83ff05";
import { createMatichico } from "./matichico3d.js?v=bfcb83ff05";
import { SHAPES, PIECE_STYLE, PIECE_TYPES, createBag, spawnPiece, pieceCells } from "./tetris-pieces.js?v=bfcb83ff05";
import { saveProgress, earnCoins } from "./storage.js?v=bfcb83ff05";
import * as audio from "./audio.js?v=bfcb83ff05";
import { campaignWin, campaign, campaignMode, campaignLevel, renderModePicker, LEVELS_PER_GAME } from "./campaign.js?v=bfcb83ff05";

const COLS = 8;
const ROWS = 14;
const LINE_SCORE = [0, 100, 300, 500, 800];
const SPECIAL_COIN_REWARD = 5;
const CUBE = 0.94;
// Modo niveles (20): cada nivel pide cierta cantidad de líneas, cae más rápido y empieza con filas de "basura".
const lineGoal = (level) => 5 + level;
const levelGarbage = (level) => Math.min(6, Math.floor((level - 1) / 3));

const cx = (col) => col - COLS / 2 + 0.5;
const cy = (row) => ROWS - 1 - row + 0.5;

// ---- juego «tablero» (sin apuro) ----
const GAME_KEY = "matichoc_bloques_juego"; // "clasico" (por defecto) o "tablero": se guarda en el celular
const B = 8; // el tablero: las 8 filas de arriba de la vitrina (8 × 8); abajo queda la bandeja con las 3 piezas
const TRAY_X = [-2.7, 0, 2.7]; // celular parado: la bandeja va abajo del tablero, dentro de la vitrina
const TRAY_Y = 2.9;
const SIDE_X = COLS / 2 + 3.1; // celular acostado: la bandeja va al costado derecho (así el tablero se ve grande)
const SIDE_Y = [ROWS - 1.4, ROWS - 4, ROWS - 6.6];
const TRAY_SCALE = 0.6;
// piezas chicas, además de las 7 de siempre: así casi siempre hay algo que cabe
const SMALL = [
  [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1]],
];
function loadGame() {
  try { return localStorage.getItem(GAME_KEY) === "tablero" ? "tablero" : "clasico"; } catch (e) { return "clasico"; }
}

export class Tetris3DGame extends Game3D {
  constructor(character, progress, els) {
    super("tetris", character, progress, els, { fov: 38 });
    this.kawaii = true; // ambiente kawaii: pastel, sombreado por tonos, pétalos y estrellitas
    this.ambientOpts = { petals: 18, hearts: 5, stars: 13, radius: 9, height: 9 };
    this.musicTheme = "puzzle";
    this.grid = [];
    this.pieceMeshes = [];
    this.ghostMeshes = [];
    this.nextMeshes = [];
    this.flashes = [];
    this.shake = 0;
    this.heroMode = "idle";
    this.heroTimer = 0;
    this.juego = loadGame(); // "clasico" o "tablero"
    this.tray = [];
    this.drag = null;
    this.streak = 0;
    this.bestStreak = 0;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
  }

  // ---------- escena ----------

  // ---------- juego «tablero»: arrastrar piezas a un tablero de 8 × 8, sin apuro ----------

  /** El fantasma: tu mejor partida del tablero o del clásico sin fin (los niveles cambian de uno a otro). */
  get ghostKey() { return this.tablero ? "tetris-tablero" : this.mode === "levels" ? null : "tetris"; }

  get tablero() { return this.juego === "tablero"; }

  /** Cambia entre el juego clásico y el tablero (lo elige quien juega en la tarjeta de inicio) y lo deja guardado. */
  setJuego(j) {
    this.juego = j === "tablero" ? "tablero" : "clasico";
    try { localStorage.setItem(GAME_KEY, this.juego); } catch (e) { /* sin almacenamiento: vale por esta vez */ }
    if (this.state !== "playing") this.reset();
    this._syncJuego();
  }

  /** Deja la pantalla según el juego: en el tablero no hay botones de mover ni cuadros SIGUE / GUARDA. */
  _syncJuego() {
    const scr = document.getElementById("screen-tetris");
    if (scr) scr.classList.toggle("bl-tablero", this.tablero);
    const b = this.els.q("btn-juego");
    if (b) b.textContent = this.tablero ? "🧩 Juego: tablero sin apuro · cambiar" : "🧱 Juego: clásico (las piezas caen) · cambiar";
    if (this.tabRoot) this.tabRoot.visible = this.tablero;
    if (this.nextHolder) this.nextHolder.visible = !this.tablero;
    if (this.holdHolder) this.holdHolder.visible = !this.tablero;
  }

  onBegin() {
    if (this.tablero) this.banner("🧩 Arrastra las piezas al tablero");
  }

  /** Dónde descansa cada pieza de la bandeja: abajo (celular parado) o al costado (acostado). */
  _tabSlot(i) {
    return this.portrait ? [TRAY_X[i], TRAY_Y] : [SIDE_X, SIDE_Y[i]];
  }

  /** Una pieza al azar: una de las 7 de siempre (girada como caiga) o una chica. */
  _tabNewPiece() {
    const type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    let cells = Math.random() < 0.6 ? SHAPES[type][Math.floor(Math.random() * 4)] : SMALL[Math.floor(Math.random() * SMALL.length)];
    const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
    cells = cells.map(([x, y]) => [x - mx, y - my]);
    return { type, cells, w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 };
  }

  _tabFitsAt(p, col, row) {
    for (const [ox, oy] of p.cells) {
      const x = col + ox, y = row + oy;
      if (x < 0 || x >= COLS || y < 0 || y >= B || this.grid[y][x]) return false;
    }
    return true;
  }

  _tabFitsAnywhere(p) {
    for (let y = 0; y <= B - p.h; y++) for (let x = 0; x <= COLS - p.w; x++) if (this._tabFitsAt(p, x, y)) return true;
    return false;
  }

  _tabClearTray() {
    for (const p of this.tray || []) if (p.holder.parent) p.holder.parent.remove(p.holder);
    this.tray = [];
    this.drag = null;
    this._tabGhosts(null);
  }

  /** Tres piezas nuevas en la bandeja (se busca que al menos una quepa: no se reparte una mano imposible). */
  _tabDeal() {
    let set = null;
    for (let k = 0; k < 30; k++) {
      set = [0, 1, 2].map(() => this._tabNewPiece());
      if (set.some((p) => this._tabFitsAnywhere(p))) break;
    }
    this.tray = set.map((p, i) => {
      const holder = new THREE.Group();
      for (const [ox, oy] of p.cells) {
        const m = this._makeCube(p.type, false, null);
        m.position.set(ox - (p.w - 1) / 2, -(oy - (p.h - 1) / 2), 0);
        holder.add(m);
      }
      const [sx, sy] = this._tabSlot(i);
      holder.position.set(this.portrait ? sx : sx + 3.5, this.portrait ? sy - 3.2 : sy, 0.3); // entran desde afuera
      holder.scale.setScalar(TRAY_SCALE);
      this.scene.add(holder);
      return { ...p, holder, slot: i, placed: false, fits: true };
    });
    this._tabMarkFits();
  }

  _tabMarkFits() {
    for (const p of this.tray) p.fits = !p.placed && this._tabFitsAnywhere(p);
  }

  /** Dónde toca el dedo dentro de la vitrina (en el plano del frente de los cubos). */
  _tabWorld(clientX, clientY) {
    const r = this.els.canvas.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    this._ray.setFromCamera(this._ndc, this.camera);
    return this._ray.ray.intersectPlane(this._plane, this._hit);
  }

  /** (para las pruebas) Dónde cae en la pantalla un punto de la vitrina. */
  _tabScreen(wx, wy) {
    const r = this.els.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(wx, wy, 0.5).project(this.camera);
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }

  _tabDown(e) {
    if (this.state !== "playing" || this.drag) return;
    const w = this._tabWorld(e.clientX, e.clientY);
    // las piezas se toman de la bandeja (cada una tiene un tercio de la bandeja para tocarla: no hay que apuntarle justo)
    let slot;
    if (this.portrait) {
      if (!w || w.y > ROWS - B - 0.2) return;
      slot = w.x < -1.35 ? 0 : w.x < 1.35 ? 1 : 2;
    } else {
      if (!w || w.x < COLS / 2 + 0.7) return;
      slot = w.y > (SIDE_Y[0] + SIDE_Y[1]) / 2 ? 0 : w.y > (SIDE_Y[1] + SIDE_Y[2]) / 2 ? 1 : 2;
    }
    const p = this.tray.find((t) => t.slot === slot && !t.placed);
    if (!p) return;
    // con el dedo, la pieza va más arriba del punto que se toca (así no queda tapada por la mano)
    this.drag = { p, id: e.pointerId, x: e.clientX, y: e.clientY, lift: e.pointerType === "mouse" ? 1.1 : 2.6, cx: w.x, cy: w.y, col: -1, row: -1, ok: false };
    try { this.els.canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura: igual llegan los movimientos sobre el lienzo */ }
    this._tabDragStep();
  }

  _tabMove(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this._tabDragStep();
  }

  /** Lleva la pieza al dedo y busca el casillero donde quedaría (con un poco de imán: el más cercano en que quepa). */
  _tabDragStep() {
    const d = this.drag;
    const w = d && this._tabWorld(d.x, d.y);
    if (!w) return;
    const p = d.p;
    d.cx = w.x;
    d.cy = w.y + d.lift;
    const fx = d.cx - (p.w - 1) / 2 + COLS / 2 - 0.5, fy = ROWS - 0.5 - (d.cy + (p.h - 1) / 2);
    let best = null, bd = 0.85 * 0.85;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const col = Math.round(fx) + dx, row = Math.round(fy) + dy;
      const dist = (col - fx) ** 2 + (row - fy) ** 2;
      if (dist <= bd && this._tabFitsAt(p, col, row)) { bd = dist; best = [col, row]; }
    }
    d.ok = !!best;
    if (best) [d.col, d.row] = best;
    this._tabGhosts(d.ok ? d : null);
  }

  /** La marca verde de dónde va a quedar la pieza si se suelta ahí. */
  _tabGhosts(d) {
    if (!this.tabGhost) {
      if (!d || !this.cellRoot) return;
      const mat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.45, depthWrite: false });
      this.tabGhost = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(this.cubeGeo, mat); m.scale.setScalar(0.96); m.visible = false; this.cellRoot.add(m); return m; });
    }
    this.tabGhost.forEach((m, i) => {
      const c = d && d.p.cells[i];
      m.visible = !!c;
      if (c) m.position.set(cx(d.col + c[0]), cy(d.row + c[1]), 0);
    });
  }

  _tabUp(e, cancel) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!cancel) { d.x = e.clientX; d.y = e.clientY; this._tabDragStep(); }
    this.drag = null;
    this._tabGhosts(null);
    if (!cancel && d.ok && this.state === "playing") this._tabPlace(d.p, d.col, d.row);
  }

  /** La pieza queda en el tablero: suma puntos, limpia filas y columnas completas y, si hace falta, reparte de nuevo. */
  _tabPlace(p, col, row) {
    this.countEnergy("piezas", 4); // cada 4 piezas gasta 1 ⚡ (igual que en el juego clásico)
    const style = PIECE_STYLE[p.type];
    for (const [ox, oy] of p.cells) {
      const x = col + ox, y = row + oy;
      const mesh = this._makeCube(p.type, false, null);
      mesh.position.set(cx(x), cy(y), 0);
      mesh.userData.row = y;
      this.cellRoot.add(mesh);
      this.grid[y][x] = { style, special: false, mesh, type: p.type, power: null };
      this.particles.burst(new THREE.Vector3(cx(x), cy(y), 0.6), [0xfff6e6, style.fill], 3, 1.6, 0.35, 5, 0.7);
    }
    p.placed = true;
    this.scene.remove(p.holder);
    this.pieces++;
    this.score += p.cells.length * 10;
    audio.playBounce();
    this.haptic(12);
    const n = this._tabClear();
    this.streak = n > 0 ? this.streak + 1 : 0; // racha: limpiar en jugadas seguidas
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.combo = this.streak;
    if (this.tray.every((t) => t.placed)) this._tabDeal(); else this._tabMarkFits();
    this._updateHud();
    if (!this.tray.some((t) => !t.placed && t.fits)) this._tabOver();
  }

  /** Limpia las filas y columnas completas del tablero (aquí nada cae: los demás cubos se quedan donde están). */
  _tabClear() {
    const rows = [], cols = [];
    for (let y = 0; y < B; y++) if (this.grid[y].every((c) => c)) rows.push(y);
    for (let x = 0; x < COLS; x++) {
      let full = true;
      for (let y = 0; y < B; y++) if (!this.grid[y][x]) { full = false; break; }
      if (full) cols.push(x);
    }
    const n = rows.length + cols.length;
    if (!n) return 0;
    const kill = new Set();
    for (const y of rows) for (let x = 0; x < COLS; x++) kill.add(y * COLS + x);
    for (const x of cols) for (let y = 0; y < B; y++) kill.add(y * COLS + x);
    for (const k of kill) {
      const y = Math.floor(k / COLS), x = k % COLS, c = this.grid[y][x];
      this.particles.burst(new THREE.Vector3(cx(x), cy(y), 0.6), [0xffc800, 0xd4216c, 0xffffff, c.style.fill], 5, 6, 0.9, 9, 1.2);
      this.cellRoot.remove(c.mesh);
      this.grid[y][x] = null;
    }
    const flash = (w, h, x, y, vertical) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      m.position.set(x, y, 0.7);
      this.scene.add(m);
      this.flashes.push({ mesh: m, t: 0, vertical });
    };
    for (const y of rows) flash(COLS + 0.6, 1, 0, cy(y), false);
    for (const x of cols) flash(1, B + 0.6, cx(x), ROWS - B / 2, true);
    this.lines += n;
    // una línea vale 100, dos 300, tres 600…; y si la jugada anterior también limpió, la racha lo aumenta
    const pts = Math.round(50 * n * (n + 1) * (1 + 0.5 * this.streak));
    this.score += pts;
    this.shake = 0.1 + n * 0.07;
    const label = n >= 3 ? `¡${n} LÍNEAS! 🍫` : n === 2 ? "¡2 líneas!" : "¡Línea!";
    this.popups.add(new THREE.Vector3(0, ROWS - B / 2, 1), `${label} +${pts}${this.streak >= 1 ? ` · racha x${this.streak + 1}` : ""}`, n > 1 ? "combo" : "kill");
    this._setHero("cheer", 1.4);
    audio.playMissionComplete();
    this.haptic(30);
    return n;
  }

  /** Ya no cabe ninguna pieza: se acaba (después de un momento, para que se alcance a ver por qué). */
  _tabOver() {
    if (this.state !== "playing") return;
    this.state = "ending";
    this._setHero("sad", 99);
    this.banner("¡Ya no cabe ninguna pieza!");
    audio.playLose();
    const t = this.els.q("gameover-title");
    if (t) t.textContent = "¡Tablero lleno!";
    setTimeout(() => {
      if (!this.running || this.state !== "ending") return;
      this.finish(`Ya no cabía ninguna de las piezas. Hiciste ${this.score} puntos y limpiaste ${this.lines} ${this.lines === 1 ? "línea" : "líneas"} (mejor racha x${Math.max(1, this.bestStreak)}).`);
    }, 1100);
  }

  /** Cada cuadro: las piezas de la bandeja flotan en su lugar y la que se arrastra sigue al dedo. */
  _tabUpdate(dt) {
    if (this.drag) this._tabDragStep(); // (la cámara se mece un poco: la pieza sigue pegada al dedo)
    for (const p of this.tray || []) {
      if (p.placed) continue;
      const h = p.holder, d = this.drag && this.drag.p === p ? this.drag : null;
      const k = 1 - Math.exp(-(d ? 40 : 14) * dt);
      const [sx, sy] = this._tabSlot(p.slot);
      h.position.x = lerp(h.position.x, d ? d.cx : sx, k);
      h.position.y = lerp(h.position.y, d ? d.cy : sy, k);
      h.position.z = lerp(h.position.z, d ? 0.9 : 0.3, k);
      h.scale.setScalar(lerp(h.scale.x, d ? 1 : p.fits ? TRAY_SCALE : TRAY_SCALE * 0.75, k)); // la que no cabe en ninguna parte se ve más chica
      h.rotation.y = d ? 0 : Math.sin(this.time * 1.4 + p.slot) * (p.fits ? 0.3 : 0.04);
    }
  }

  async build() {
    const s = this.scene;
    s.background = new THREE.Color(0x2a140b);
    s.fog = new THREE.Fog(0x2a140b, 30, 70);
    s.add(new THREE.HemisphereLight(0xffe9d2, 0x4a2514, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d2, 2.2);
    key.position.set(-6, 16, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
    const sc = key.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 14; sc.bottom = -4; sc.near = 2; sc.far = 50;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.04;
    s.add(key, key.target);
    key.target.position.set(0, 6, 0);
    this.key = key;
    this.onLowQuality = () => { key.castShadow = false; };
    const rim = new THREE.PointLight(0xd4216c, 40, 30);
    rim.position.set(6, 9, 4);
    s.add(rim);
    const rim2 = new THREE.PointLight(0xffc800, 30, 30);
    rim2.position.set(-6, 4, 5);
    s.add(rim2);

    // geometría y materiales compartidos
    this.cubeGeo = roundedBox(CUBE, CUBE, CUBE, 0.2, 0.08);
    this.plateGeo = new THREE.PlaneGeometry(CUBE * 0.62, CUBE * 0.62);
    this.plateMat = new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "rgba(255,255,255,0.55)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
        grad.addColorStop(1, "rgba(0,0,0,0.25)");
        g.fillStyle = grad;
        g.beginPath();
        g.roundRect(6, 6, w - 12, h - 12, 22);
        g.fill();
      }),
      transparent: true,
      depthWrite: false,
    });
    this.starMat = new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (g, w, h) => {
        g.fillStyle = "#fff6e6";
        g.font = '84px "Baby Chipmunk", sans-serif';
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("D", w / 2, h / 2 + 4);
      }),
      transparent: true,
      depthWrite: false,
    });
    this.cubeMats = {};
    for (const [type, st] of Object.entries(PIECE_STYLE)) {
      this.cubeMats[type] = new THREE.MeshPhysicalMaterial({
        color: st.fill, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15, emissive: st.dark, emissiveIntensity: 0.12,
      });
    }
    this.specialMat = new THREE.MeshPhysicalMaterial({
      color: 0xffc800, roughness: 0.2, metalness: 0.6, clearcoat: 1, emissive: 0xffa800, emissiveIntensity: 0.55,
    });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    const emojiPlate = (e) => new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (g, w, h) => { g.font = "92px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(e, w / 2, h / 2 + 6); }),
      transparent: true,
      depthWrite: false,
    });
    this.powerPlates = { bomb: emojiPlate("💣"), rayo: emojiPlate("⚡") };
    this.powerMats = {
      bomb: new THREE.MeshPhysicalMaterial({ color: 0x2a2a34, roughness: 0.3, metalness: 0.4, clearcoat: 1, emissive: 0x551010, emissiveIntensity: 0.5 }),
      rayo: new THREE.MeshPhysicalMaterial({ color: 0xffe14a, roughness: 0.2, metalness: 0.3, clearcoat: 1, emissive: 0xffa800, emissiveIntensity: 0.7 }),
    };

    this._buildRoom();
    this._buildTank();
    this._ensureHero();
  }

  _buildRoom() {
    const s = this.scene;
    // pared del fondo con el patrón de cacao de la marca
    const wallTex = loadTexture("assets/brand/pattern-cacao-subtle.png", { repeat: 1, anisotropy: 4 });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(6, 5);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 44), new THREE.MeshStandardMaterial({ map: wallTex, color: 0x5a3320, roughness: 0.9 }));
    wall.position.set(0, 10, -3.2);
    wall.receiveShadow = true;
    s.add(wall);
    // piso brillante
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x3d1f10, roughness: 0.35, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.62, 6);
    floor.receiveShadow = true;
    s.add(floor);
    s.add(makeStars(150, 40));
    const bunting = makeBunting(new THREE.Vector3(-11, 16, -2.6), new THREE.Vector3(11, 16, -2.6), { count: 22, sag: 1.4, size: 0.5 });
    s.add(bunting);
    // letrero luminoso
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 1.5),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTexture(1024, 170, (g, w, h) => {
          g.font = '120px "Baby Chipmunk", sans-serif';
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.shadowColor = "#FFC800";
          g.shadowBlur = 24;
          g.fillStyle = "#FFC800";
          g.fillText("MATICHOC", w / 2, h / 2 + 6);
        }),
      }),
    );
    for (const sx of [-1, 1]) {
      const lg = makeLogo(1.9);
      lg.position.set(sx * 5.4, 0, 0.02);
      sign.add(lg);
    }
    sign.position.set(0, 17.3, -2.9);
    s.add(sign);
    this.sign = sign;
  }

  _buildTank() {
    const s = this.scene;
    const tank = new THREE.Group();
    // fondo de la vitrina con rejilla
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6,
        map: canvasTexture(COLS * 64, ROWS * 64, (g, w, h) => {
          g.fillStyle = "#1c0f07"; g.fillRect(0, 0, w, h);
          g.strokeStyle = "rgba(255,200,0,0.10)"; g.lineWidth = 2;
          for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * 64, 0); g.lineTo(x * 64, h); g.stroke(); }
          for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * 64); g.lineTo(w, y * 64); g.stroke(); }
        }),
      }),
    );
    back.position.set(0, ROWS / 2, -0.55);
    back.receiveShadow = true;
    tank.add(back);
    // marco dorado + base fucsia
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc800, roughness: 0.25, metalness: 0.7, emissive: 0x6a4a00, emissiveIntensity: 0.5 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xd4216c, roughness: 0.35 });
    const post = (x, h) => {
      const m = new THREE.Mesh(roundedBox(0.4, h, 1.4, 0.15, 0.05), gold);
      m.position.set(x, h / 2 - 0.3, 0);
      m.castShadow = true;
      tank.add(m);
    };
    post(-COLS / 2 - 0.2, ROWS + 0.6);
    post(COLS / 2 + 0.2, ROWS + 0.6);
    const base = new THREE.Mesh(roundedBox(COLS + 1.6, 0.8, 1.8, 0.25, 0.08), pink);
    base.position.set(0, -0.4, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    const top = new THREE.Mesh(roundedBox(COLS + 1.2, 0.5, 1.4, 0.2, 0.06), gold);
    top.position.set(0, ROWS + 0.3, 0);
    tank.add(base, top);
    // cristal frontal muy suave (reflejo)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0, clearcoat: 1, depthWrite: false }));
    glass.position.set(0, ROWS / 2, 0.55);
    tank.add(glass);
    s.add(tank);

    // pedestal para la siguiente pieza
    this.nextHolder = new THREE.Group();
    const ped = new THREE.Mesh(roundedBox(3.6, 3.6, 0.4, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a140b, roughness: 0.5 }));
    ped.position.z = -0.3;
    // marco dorado cuadrado (en vez de un círculo que no combinaba con el cuadro)
    const ring = new THREE.Mesh(roundedBox(4.0, 4.0, 0.3, 0.34, 0.08), gold);
    ring.position.z = -0.5;
    this.nextLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.95),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTexture(512, 140, (g, w, h) => {
          g.font = '78px "Baby Chipmunk", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#FFC800";
          g.fillText("SIGUE", w / 2, h / 2 + 4);
        }),
      }),
    );
    this.nextLabel.position.set(0, 2.7, 0);
    this.nextHolder.add(ped, ring, this.nextLabel);
    s.add(this.nextHolder);

    // pedestal para la pieza guardada
    this.holdHolder = new THREE.Group();
    const ped2 = new THREE.Mesh(roundedBox(3.6, 3.6, 0.4, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a140b, roughness: 0.5 }));
    ped2.position.z = -0.3;
    const ring2 = new THREE.Mesh(roundedBox(4.0, 4.0, 0.3, 0.34, 0.08), new THREE.MeshStandardMaterial({ color: 0x35f0ff, roughness: 0.25, metalness: 0.6, emissive: 0x1a8a9a, emissiveIntensity: 0.5 }));
    ring2.position.z = -0.5;
    const holdLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.95),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTexture(512, 140, (g, w, h) => {
          g.font = '78px "Baby Chipmunk", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#7ee0ff";
          g.fillText("GUARDA", w / 2, h / 2 + 4);
        }),
      }),
    );
    holdLabel.position.set(0, 2.7, 0);
    // ayuda mientras no hay nada guardado
    this.holdHint = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.3),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTexture(512, 240, (g, w, h) => {
          g.font = '70px "Baby Chipmunk", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(126,224,255,0.75)";
          g.fillText("📥 C", w / 2, h / 2 - 28);
          g.font = '44px "Baby Chipmunk", sans-serif';
          g.fillText("guarda una pieza", w / 2, h / 2 + 50);
        }),
      }),
    );
    this.holdHint.position.set(0, -0.1, 0.05);
    this.holdHolder.add(ped2, ring2, holdLabel, this.holdHint);
    s.add(this.holdHolder);
    this.holdMeshes = [];

    this.cellRoot = new THREE.Group();
    s.add(this.cellRoot);

    // juego «tablero»: una repisa separa el tablero (arriba) de la bandeja de piezas (abajo), y el tablero lleva un fondo más claro
    this.tabRoot = new THREE.Group();
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(COLS + 0.3, 0.14, 0.9), new THREE.MeshStandardMaterial({ color: 0xffc800, roughness: 0.3, metalness: 0.6 }));
    shelf.position.set(0, ROWS - B - 0.08, 0);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(B, B), new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      map: canvasTexture(B * 64, B * 64, (g) => {
        for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
          g.fillStyle = (x + y) % 2 ? "rgba(255,246,230,0.10)" : "rgba(255,246,230,0.16)";
          g.beginPath(); g.roundRect(x * 64 + 4, y * 64 + 4, 56, 56, 12); g.fill();
        }
      }),
    }));
    mat.position.set(0, ROWS - B / 2, -0.5);
    // (celular acostado) el panel donde esperan las tres piezas, al costado de la vitrina
    this.tabSide = new THREE.Mesh(roundedBox(4.6, B + 0.2, 0.3, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a140b, roughness: 0.5 }));
    this.tabSide.position.set(SIDE_X, ROWS - B / 2, -0.75);
    this.tabRoot.add(shelf, mat, this.tabSide);
    this.tabRoot.visible = false;
    s.add(this.tabRoot);
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
    this.hero.group.scale.setScalar(2.1);
    this.scene.add(this.hero.group);
    if (!this.heroPlatform) {
      this.heroPlatform = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 28), new THREE.MeshStandardMaterial({ color: 0xd4216c, roughness: 0.3 }));
      this.heroPlatform.receiveShadow = true;
      this.scene.add(this.heroPlatform);
    }
  }

  // ---------- cubos ----------

  _makeCube(type, special, power = null) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.cubeGeo, power ? this.powerMats[power] : special ? this.specialMat : this.cubeMats[type]);
    body.castShadow = true;
    const plate = new THREE.Mesh(this.plateGeo, power ? this.powerPlates[power] : special ? this.starMat : this.plateMat);
    if (power) plate.scale.setScalar(1.35);
    plate.position.z = CUBE / 2 + 0.012;
    g.add(body, plate);
    if (special) {
      const shine = new THREE.Mesh(this.plateGeo, this.plateMat);
      shine.position.z = CUBE / 2 + 0.008;
      g.add(shine);
    }
    return g;
  }

  _clearGroup(list) {
    // cada malla sale de donde esté (el tablero, el cuadro SIGUE o el cuadro GUARDA); antes solo salían del tablero y
    // las piezas de los cuadros se acumulaban unas sobre otras al reiniciar o cambiar de nivel
    for (const m of list) if (m.parent) m.parent.remove(m);
    list.length = 0;
  }

  // ---------- partida ----------

  onResize(w, h) {
    this.portrait = w / h < 0.9;
    const vfov = THREE.MathUtils.degToRad(this.fov / 2);
    const aspect = w / h;
    // encuadre: alto del tablero (+ marco) o ancho del tablero, el que mande
    const needH = (this.portrait ? ROWS + 8.4 : ROWS + 5.2) / 2;
    const needW = (this.portrait ? COLS + 2.2 : COLS + 13.4) / 2;
    const dist = Math.max(needH / Math.tan(vfov), needW / (Math.tan(vfov) * aspect));
    this.camDist = dist;
    this.camCenterY = this.portrait ? ROWS / 2 + 2.1 : ROWS / 2 + 0.9;
    // lugar del preview y del héroe
    if (this.portrait) {
      this.nextHolder.position.set(3.2, ROWS + 2.7, 0);
      this.nextHolder.scale.setScalar(0.72);
      this.nextHolder.rotation.y = 0;
      this.holdHolder.position.set(-0.2, ROWS + 2.7, 0);
      this.holdHolder.scale.setScalar(0.72);
      this.holdHolder.rotation.y = 0;
      this.hero.group.position.set(-3.4, ROWS + 1.3, 0.6);
      this.hero.group.scale.setScalar(1.15);
      this.heroPlatform.position.set(-3.4, ROWS + 1.05, 0.6);
      this.heroPlatform.scale.setScalar(0.6);
      this.sign.position.set(0, ROWS + 5.6, -2.9);
      this.sign.visible = false;
    } else {
      this.nextHolder.position.set(COLS / 2 + 4.1, ROWS - 3.0, 0);
      this.nextHolder.scale.setScalar(1.0);
      this.nextHolder.rotation.y = -0.22; // de cara a la cámara, sin torcerse en el borde
      this.holdHolder.position.set(COLS / 2 + 4.1, ROWS - 10.4, 0);
      this.holdHolder.scale.setScalar(1.0);
      this.holdHolder.rotation.y = -0.22;
      this.hero.group.position.set(-COLS / 2 - 3.6, 2.2, 1);
      this.hero.group.scale.setScalar(2.1);
      this.heroPlatform.position.set(-COLS / 2 - 3.6, 1.95, 1);
      this.heroPlatform.scale.setScalar(1);
      this.sign.position.set(0, ROWS + 2.4, -2.9);
      this.sign.visible = true;
    }
    if (this.tabSide) this.tabSide.visible = !this.portrait;
    if (this.tablero && !this.portrait) {
      // tablero con el celular acostado: se encuadra solo el tablero (las 8 filas de arriba) con la bandeja al costado,
      // para que los casilleros queden grandes y se pueda arrastrar con el dedo
      const needH2 = (B + 2.6) / 2, needW2 = SIDE_X + 2.9;
      this.camDist = Math.max(needH2 / Math.tan(vfov), needW2 / (Math.tan(vfov) * aspect));
      this.camCenterY = ROWS - B / 2 - 0.5;
      this.hero.group.position.set(-COLS / 2 - 3.3, ROWS - B + 0.2, 1);
      this.hero.group.scale.setScalar(1.7);
      this.heroPlatform.position.set(-COLS / 2 - 3.3, ROWS - B - 0.05, 1);
      this.heroPlatform.scale.setScalar(0.85);
      this.sign.visible = false;
    }
    this._placeCamera();
  }

  _placeCamera() {
    const sx = this.shake ? rand(-1, 1) * this.shake : 0;
    const sy = this.shake ? rand(-1, 1) * this.shake : 0;
    const sway = Math.sin(this.time * 0.5) * 0.5;
    this.camera.position.set(sway + sx, this.camCenterY + 2.6 + sy, this.camDist);
    this.camera.lookAt(0, this.camCenterY, 0);
  }

  reset() {
    this._clearGroup(this.pieceMeshes);
    this._clearGroup(this.ghostMeshes);
    this._clearGroup(this.nextMeshes);
    if (this.grid.length) for (const row of this.grid) for (const c of row) if (c) this.cellRoot.remove(c.mesh);
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = createBag();
    this.score = 0;
    this.lines = 0;
    this.mode = campaignMode(this.progress, "tetris");
    this.level = this.mode === "levels" ? campaignLevel(this.progress, "tetris") : 1;
    this.goal = this.mode === "levels" ? lineGoal(this.level) : 0;
    this.pieces = 0;
    this.pendingWin = false;
    this.coinsEarned = 0;
    this.dropTimer = 0;
    this.shake = 0;
    this.combo = 0;
    this.lastWasTetris = false;
    this.hold = null;
    this.holdUsed = false;
    this.bombs = 0;
    if (this.holdHint) this.holdHint.visible = true;
    for (const m of this.holdMeshes || []) this.holdHolder.remove(m);
    this.holdMeshes = [];
    this._tabClearTray();
    this.streak = 0;
    this.bestStreak = 0;
    if (this.tablero) {
      // tablero: sin niveles, sin piezas que caen
      this.mode = "tablero";
      this.level = 1;
      this.goal = 0;
      this.current = this.next = null;
    } else {
      if (this.mode === "levels") this._addGarbage(levelGarbage(this.level));
      this.current = this._newPiece(this._nextFromBag());
      this.next = this._newPiece(this._nextFromBag());
    }
    this.scene.background.setHex(0x2a140b);
    this._ensureHero();
    this.onResize(Math.max(1, this.els.wrap.clientWidth), Math.max(1, this.els.wrap.clientHeight));
    if (this.tablero) this._tabDeal();
    else { this._rebuildCurrent(true); this._rebuildNext(); }
    const t = this.els.q("gameover-title");
    if (t) t.textContent = "¡Se apilaron las golosinas!";
    this._syncJuego();
    this._setHero("idle", 0);
    this._updateHud();
  }

  /** Pieza nueva; a veces trae un cubo de poder (bomba o rayo) en una de sus 4 celdas. */
  _newPiece(type) {
    const piece = spawnPiece(type);
    if (!piece.special && Math.random() < 0.1) {
      piece.power = Math.random() < 0.55 ? "bomb" : "rayo";
      piece.powerCell = Math.floor(Math.random() * 4);
    }
    return piece;
  }

  _holdPiece() {
    if (this.state !== "playing" || this.holdUsed) return;
    const type = this.current.type;
    if (this.hold) {
      this.current = this._newPiece(this.hold);
    } else {
      this.current = this.next;
      this.next = this._newPiece(this._nextFromBag());
      this._rebuildNext();
    }
    this.hold = type;
    this.holdUsed = true;
    this._rebuildCurrent(true);
    this._rebuildHold();
    audio.playWhoosh();
    if (!this._fits(this.current, 0, 0, this.current.rotation)) this._onGameOver();
  }

  _rebuildHold() {
    for (const m of this.holdMeshes) this.holdHolder.remove(m);
    this.holdMeshes = [];
    if (this.holdHint) this.holdHint.visible = !this.hold;
    if (!this.hold) return;
    const piece = { type: this.hold, rotation: 0, x: 0, y: 0 };
    const cells = pieceCells(piece);
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5;
    const holder = new THREE.Group();
    for (const [ox, oy] of cells) {
      const m = this._makeCube(this.hold, false);
      m.position.set(ox + 0.5 - mx, -(oy + 0.5 - my), 0);
      holder.add(m);
    }
    holder.scale.setScalar(0.8);
    holder.position.set(0, -0.1, 0.2);
    this.holdHolder.add(holder);
    this.holdMeshes.push(holder);
  }

  _nextFromBag() {
    if (this.bag.length === 0) this.bag = createBag();
    return this.bag.shift();
  }

  _dropIntervalMs() {
    if (this.mode === "levels") return Math.max(110, 780 - (this.level - 1) * 34);
    return Math.max(120, 800 - (this.level - 1) * 60);
  }

  /** Filas ya llenas (con un par de huecos) abajo de la vitrina: el reto de los niveles altos. */
  _addGarbage(rows) {
    const types = Object.keys(SHAPES);
    for (let r = 0; r < rows; r++) {
      const y = ROWS - 1 - r;
      const holes = new Set([Math.floor(Math.random() * COLS), Math.floor(Math.random() * COLS)]);
      for (let x = 0; x < COLS; x++) {
        if (holes.has(x)) continue;
        const type = types[Math.floor(Math.random() * types.length)];
        const mesh = this._makeCube(type, false, null);
        mesh.position.set(cx(x), cy(y), 0);
        mesh.userData.row = y;
        this.cellRoot.add(mesh);
        this.grid[y][x] = { style: PIECE_STYLE[type], special: false, mesh, type, power: null };
      }
    }
  }

  /** En la tarjeta de inicio se elige entre "Infinito" y los 20 niveles. */
  onIntro() {
    renderModePicker(this.els.q("lvlpick"), { id: "tetris", progress: this.progress, onChange: () => this.reset() });
    this._bindGhost();
    const b = this.els.q("btn-juego");
    if (b && !this._juegoBound) {
      this._juegoBound = true;
      b.addEventListener("click", () => this.setJuego(this.tablero ? "clasico" : "tablero"));
    }
    this._syncJuego();
  }

  /** ¿Se ve la sombra de la pieza? Es un gusto de cada jugador (se guarda en su perfil); parte encendida. */
  get showGhost() {
    return !(this.progress.prefs && this.progress.prefs.tetrisGhost === false);
  }

  /** Los dos botones de la sombra (en la tarjeta de inicio y arriba mientras se juega). */
  _bindGhost() {
    const btns = [this.els.q("btn-ghost-intro"), this.els.q("btn-ghost")].filter(Boolean);
    const paint = () => {
      const on = this.showGhost;
      for (const b of btns) {
        b.setAttribute("aria-pressed", String(on));
        if (b.id.endsWith("intro")) b.textContent = on ? "👁️ Sombra de la pieza: sí" : "🙈 Sombra de la pieza: no";
        else { b.textContent = on ? "👁️" : "🙈"; b.title = on ? "Apagar la sombra de la pieza" : "Encender la sombra de la pieza"; }
      }
    };
    if (!this._ghostBound) {
      this._ghostBound = true;
      for (const b of btns) b.addEventListener("click", () => {
        this.progress.prefs = this.progress.prefs && typeof this.progress.prefs === "object" ? this.progress.prefs : {};
        this.progress.prefs.tetrisGhost = !this.showGhost;
        saveProgress(this.progress);
        paint();
        if (this.state === "playing") this.banner(this.showGhost ? "👁️ Sombra encendida" : "🙈 Sombra apagada");
      });
    }
    paint();
  }

  nextLevel() {
    const c = campaign(this.progress, "tetris");
    c.selected = Math.min(LEVELS_PER_GAME, this.level + 1);
    this.particles.clear();
    this.popups.clear();
    this.state = "intro";
    this.reset();
    this.beginPlaying();
  }

  _levelDone() {
    const needed = this.goal * 2; // lo mínimo de piezas: 2 por línea
    const stars = this.pieces <= needed * 1.35 ? 3 : this.pieces <= needed * 1.8 ? 2 : 1;
    this._setHero("cheer", 99);
    if (this.level >= LEVELS_PER_GAME) {
      campaignWin(this.progress, "tetris", this.level, stars);
      const t = this.els.q("gameover-title");
      if (t) t.textContent = `¡Completaste los ${LEVELS_PER_GAME} niveles! 🏆`;
      audio.playVictory();
      this.finish(`Llegaste a ${this.score} puntos en el último nivel.`);
      return;
    }
    this.levelWin({ level: this.level, stars, text: `${this.lines} líneas con ${this.pieces} piezas y ${this.score} puntos.` });
  }

  _setHero(mode, seconds) {
    this.heroMode = mode;
    this.heroTimer = seconds;
  }

  // ---------- reglas (idénticas al motor 2D) ----------

  _fits(piece, dx, dy, rotation) {
    const cells = SHAPES[piece.type][rotation];
    for (const [ox, oy] of cells) {
      const x = piece.x + ox + dx;
      const y = piece.y + oy + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.grid[y][x]) return false;
    }
    return true;
  }

  _move(dir) {
    if (this.state !== "playing") return;
    if (this._fits(this.current, dir, 0, this.current.rotation)) this.current.x += dir;
  }

  _rotate() {
    if (this.state !== "playing") return;
    const nextRotation = (this.current.rotation + 1) % 4;
    for (const k of [0, -1, 1, -2, 2]) {
      if (this._fits(this.current, k, 0, nextRotation)) {
        this.current.x += k;
        this.current.rotation = nextRotation;
        audio.playJump();
        return;
      }
    }
  }

  _softDrop() {
    if (this.state !== "playing") return;
    if (this._fits(this.current, 0, 1, this.current.rotation)) {
      this.current.y += 1;
      this.score += 1;
      this._updateHud();
    } else {
      this._step();
    }
  }

  _hardDrop() {
    if (this.state !== "playing") return;
    let dropped = 0;
    const startY = this.current.y;
    while (this._fits(this.current, 0, 1, this.current.rotation)) {
      this.current.y += 1;
      dropped++;
    }
    this.score += dropped * 2;
    if (dropped > 2) {
      this.shake = 0.18;
      for (const [ox] of pieceCells(this.current)) {
        this.particles.burst(new THREE.Vector3(cx(this.current.x + ox), cy(startY + 2), 0.5), [0xffc800, 0xfff6e6], 2, 1.5, 0.4, 2, 0.8);
      }
    }
    this._step();
  }

  _step() {
    if (this._fits(this.current, 0, 1, this.current.rotation)) {
      this.current.y += 1;
      return;
    }
    this._lockPiece();
  }

  _lockPiece() {
    this.countEnergy("piezas", 4); // cada 4 piezas gasta 1 ⚡
    const style = PIECE_STYLE[this.current.type];
    let toppedOut = false;
    const powers = [];
    this.holdUsed = false;
    for (const [ox, oy] of pieceCells(this.current)) {
      const x = this.current.x + ox;
      const y = this.current.y + oy;
      if (y < 0) { toppedOut = true; continue; }
      const idx = pieceCells(this.current).findIndex(([qx, qy]) => qx === ox && qy === oy);
      const power = this.current.power && idx === this.current.powerCell ? this.current.power : null;
      const mesh = this._makeCube(this.current.type, this.current.special, power);
      mesh.position.set(cx(x), cy(y), 0);
      mesh.userData.row = y;
      this.cellRoot.add(mesh);
      this.grid[y][x] = { style, special: this.current.special, mesh, type: this.current.type, power };
      if (power) powers.push({ x, y, power });
      this.particles.burst(new THREE.Vector3(cx(x), cy(y), 0.6), [0xfff6e6, style.fill], 3, 1.6, 0.35, 5, 0.7);
    }
    audio.playBounce();
    this._clearGroup(this.pieceMeshes);
    this._clearGroup(this.ghostMeshes);

    if (toppedOut) { this._onGameOver(); return; }

    for (const pw of powers) this._firePower(pw.x, pw.y, pw.power);
    this.pieces++;
    const cleared = this._clearLines();
    if (cleared > 0) this._comboHit(cleared);
    else if (!powers.length) this.combo = 0;
    if (this.pendingWin) { this._levelDone(); return; }
    this.current = this.next;
    this.next = this._newPiece(this._nextFromBag());
    this._rebuildCurrent(true);
    this._rebuildNext();
    if (!this._fits(this.current, 0, 0, this.current.rotation)) this._onGameOver();
  }

  /** Cubo de poder: la bomba limpia un cuadro de 3x3 y el rayo limpia toda su fila. */
  _firePower(x, y, power) {
    const at = new THREE.Vector3(cx(x), cy(y), 1);
    if (power === "bomb") {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = this.grid[y + dy] && this.grid[y + dy][x + dx];
        if (!c) continue;
        this.particles.burst(new THREE.Vector3(cx(x + dx), cy(y + dy), 0.6), [0xff8a2a, 0xffe14a, 0xd4216c, 0xffffff], 8, 7, 0.9, 8, 1.2);
        this.cellRoot.remove(c.mesh);
        this.grid[y + dy][x + dx] = null;
        n++;
      }
      this.score += n * 15;
      this.shake = 0.4;
      this.popups.add(at, `¡Bum! +${n * 15}`, "combo");
      audio.playCrash();
      this.haptic(60);
    } else {
      let n = 0;
      for (let xx = 0; xx < COLS; xx++) {
        const c = this.grid[y][xx];
        if (!c) continue;
        this.particles.burst(new THREE.Vector3(cx(xx), cy(y), 0.6), [0xffe14a, 0xffffff, 0x7ee0ff], 7, 6, 0.8, 7, 1);
        this.cellRoot.remove(c.mesh);
        n++;
      }
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(COLS + 0.6, 1), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.9, depthWrite: false }));
      flash.position.set(0, cy(y), 0.7);
      this.scene.add(flash);
      this.flashes.push({ mesh: flash, t: 0 });
      this.grid.splice(y, 1);
      this.grid.unshift(Array(COLS).fill(null));
      this.score += 150;
      this.lines += 1;
      this.shake = 0.25;
      this.popups.add(at, "¡Rayo! +150", "combo");
      audio.playPowerup();
      this.haptic(40);
    }
    this.bombs++;
    this._updateHud();
  }

  _comboHit(cleared) {
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo || 0, this.combo);
    let bonus = 0;
    if (this.combo >= 2) {
      bonus += 50 * this.combo * this.level;
      this.banner(`¡Combo x${this.combo}!`);
      audio.playCombo(this.combo);
    }
    if (cleared >= 4) {
      if (this.lastWasTetris) {
        bonus += Math.round(LINE_SCORE[4] * this.level * 0.5);
        this.banner("¡Back-to-back! 🍫");
      }
      this.lastWasTetris = true;
    } else this.lastWasTetris = false;
    if (bonus > 0) {
      this.score += bonus;
      this.popups.add(new THREE.Vector3(0, ROWS / 2, 1.2), `+${bonus}`, "combo");
    }
    this._updateHud();
  }

  _clearLines() {
    const fullRows = [];
    let specialCleared = 0;
    for (let y = 0; y < ROWS; y++) {
      if (this.grid[y].every((c) => c)) {
        fullRows.push(y);
        if (this.grid[y].some((c) => c.special)) specialCleared++;
      }
    }
    if (!fullRows.length) return 0;

    for (const y of fullRows) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        this.particles.burst(new THREE.Vector3(cx(x), cy(y), 0.6), [0xffc800, 0xd4216c, 0xffffff, c.style.fill], 6, 6, 0.9, 9, 1.2);
        this.cellRoot.remove(c.mesh);
      }
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(COLS + 0.6, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      flash.position.set(0, cy(y), 0.7);
      this.scene.add(flash);
      this.flashes.push({ mesh: flash, t: 0 });
    }
    // baja el resto de filas
    for (const y of fullRows) {
      this.grid.splice(y, 1);
      this.grid.unshift(Array(COLS).fill(null));
    }
    this.lines += fullRows.length;
    if (this.mode === "levels") {
      if (this.lines >= this.goal) this.pendingWin = true;
    } else {
      const prevLevel = this.level;
      this.level = Math.floor(this.lines / 10) + 1;
      if (this.level > prevLevel) this._levelUp();
    }
    const pts = LINE_SCORE[fullRows.length] * this.level;
    this.score += pts;
    this.shake = 0.1 + fullRows.length * 0.07;

    const mid = new THREE.Vector3(0, cy(fullRows[0]) + 0.5, 1);
    const label = fullRows.length >= 4 ? "¡4 LÍNEAS! 🍫" : fullRows.length > 1 ? `¡${fullRows.length} líneas!` : "¡Línea!";
    this.popups.add(mid, `${label} +${pts}`, fullRows.length > 1 ? "combo" : "kill");
    this._setHero("cheer", 1.4);

    if (specialCleared > 0) {
      const reward = specialCleared * SPECIAL_COIN_REWARD;
      earnCoins(this.progress, reward);
      this.coinsEarned += reward;
      saveProgress(this.progress);
      this.popups.add(new THREE.Vector3(0, mid.y + 1.2, 1), `+${reward} 🍫✨`, "coin");
      audio.playBonusCollect();
    } else {
      audio.playMissionComplete();
    }
    this._updateHud();
    return fullRows.length;
  }

  /** Cada nivel cambia el color del ambiente y suelta confeti. */
  _levelUp() {
    this.banner(`¡Nivel ${this.level}!`);
    const hues = [0x2a140b, 0x1b1440, 0x0f2a3a, 0x3a1030, 0x103a24, 0x3a2a10];
    this.scene.background.setHex(hues[(this.level - 1) % hues.length]);
    this.scene.fog.color.setHex(hues[(this.level - 1) % hues.length]);
    this.particles.burst(new THREE.Vector3(0, ROWS / 2, 1.5), [0xffc800, 0xd4216c, 0x35f0ff, 0xfff6e6], 50, 8, 1.2, 6);
    audio.playVictory();
    this.haptic(50);
  }

  _onGameOver() {
    this._setHero("sad", 99);
    audio.playLose();
    const lvl = this.mode === "levels" ? `Nivel ${this.level}: ` : "";
    this.finish(
      `${lvl}Hiciste ${this.score} puntos y ${this.lines} líneas (mejor combo x${this.bestCombo || 1}, ${this.bombs} poderes usados)` + (this.coinsEarned > 0 ? `, ganando ${this.coinsEarned} Matipuntos.` : "."),
    );
  }

  _updateHud() {
    this.els.hudScore.textContent = String(this.score);
    this.els.hudLines.textContent = this.goal ? `${Math.min(this.lines, this.goal)}/${this.goal}` : String(this.lines);
    this.els.hudLevel.textContent = String(this.level);
    this.els.hudCoins.textContent = String(this.progress.coins);
    if (this.els.hudCombo) this.els.hudCombo.textContent = this.combo > 1 ? `x${this.combo}` : "x1";
  }

  // ---------- render ----------

  _rebuildCurrent(snap) {
    this._clearGroup(this.pieceMeshes);
    this._clearGroup(this.ghostMeshes);
    for (let i = 0; i < 4; i++) {
      const m = this._makeCube(this.current.type, this.current.special, this.current.power && i === this.current.powerCell ? this.current.power : null);
      m.userData.snap = !!snap;
      m.visible = false;
      this.cellRoot.add(m);
      this.pieceMeshes.push(m);
      const gh = new THREE.Mesh(this.cubeGeo, this.ghostMat);
      gh.scale.setScalar(0.96);
      this.cellRoot.add(gh);
      this.ghostMeshes.push(gh);
    }
  }

  _rebuildNext() {
    for (const m of this.nextMeshes) this.nextHolder.remove(m);
    this.nextMeshes = [];
    const cells = pieceCells({ ...this.next, rotation: 0 });
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5;
    const holder = new THREE.Group();
    for (const [i, [ox, oy]] of cells.entries()) {
      const m = this._makeCube(this.next.type, this.next.special, this.next.power && i === this.next.powerCell ? this.next.power : null);
      m.position.set(ox + 0.5 - mx, -(oy + 0.5 - my), 0);
      holder.add(m);
    }
    holder.scale.setScalar(0.8);
    holder.position.set(0, -0.1, 0.2);
    this.nextHolder.add(holder);
    this.nextMeshes.push(holder);
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 0.6);

    if (this.tablero) this._tabUpdate(dt);
    if (this.state === "playing" && !this.tablero) {
      this.dropTimer += dt * 1000;
      if (this.dropTimer >= this._dropIntervalMs()) {
        this.dropTimer = 0;
        this._step();
      }
    }

    // pieza actual (movimiento suave) y su fantasma
    if (this.current && this.pieceMeshes.length === 4) {
      const cells = pieceCells(this.current);
      let gy = 0;
      while (this._fits(this.current, 0, gy + 1, this.current.rotation)) gy++;
      const k = 1 - Math.exp(-32 * dt);
      cells.forEach(([ox, oy], i) => {
        const m = this.pieceMeshes[i];
        const tx = cx(this.current.x + ox);
        const ty = cy(this.current.y + oy);
        if (m.userData.snap || !m.visible) { m.position.set(tx, ty, 0); m.visible = true; m.userData.snap = false; }
        else { m.position.x = lerp(m.position.x, tx, k); m.position.y = lerp(m.position.y, ty, k); }
        const gh = this.ghostMeshes[i];
        gh.position.set(tx, cy(this.current.y + oy + gy), 0);
        gh.visible = this.showGhost && gy > 0 && this.current.y + oy + gy >= 0;
      });
      if (this.current.special) {
        this.specialMat.emissiveIntensity = 0.5 + Math.sin(this.time * 6) * 0.2;
      }
    }

    // filas fijas: bajan suave hacia su fila real
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (!c) continue;
        const ty = cy(y);
        c.mesh.position.y = Math.abs(c.mesh.position.y - ty) < 0.01 ? ty : lerp(c.mesh.position.y, ty, 1 - Math.exp(-14 * dt));
      }
    }

    for (const f of this.flashes) {
      f.t += dt;
      f.mesh.material.opacity = Math.max(0, 0.9 - f.t * 3.4);
      if (f.vertical) f.mesh.scale.x = 1 + f.t * 1.2; else f.mesh.scale.y = 1 + f.t * 1.2;
      if (f.t > 0.3) { this.scene.remove(f.mesh); f.dead = true; }
    }
    this.flashes = this.flashes.filter((f) => !f.dead);

    // Matichico animado
    if (this.heroTimer > 0 && this.heroTimer < 90) {
      this.heroTimer -= dt;
      if (this.heroTimer <= 0) this.heroMode = "idle";
    }
    this.hero.animate(this.time, this.heroMode, 1);
    this.hero.group.rotation.y = Math.sin(this.time * 0.8) * 0.18 + (this.portrait ? 0.25 : 0.55);
    if (this.nextMeshes[0]) this.nextMeshes[0].rotation.y = Math.sin(this.time * 1.4) * 0.35;
    if (this.holdMeshes[0]) this.holdMeshes[0].rotation.y = Math.sin(this.time * 1.4 + 1) * 0.35;
    this.sign.material.opacity = 0.85 + Math.sin(this.time * 2) * 0.15;
    this._placeCamera();
  }

  // ---------- entrada ----------

  async init() {
    const first = !this.ready;
    await super.init();
    if (first) this._bindInput();
  }

  _bindInput() {
    window.addEventListener("keydown", (e) => {
      if (this.state !== "playing" || !this.running || this.tablero) return;
      const k = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(k)) e.preventDefault();
      if (k === "ArrowLeft" || k === "a" || k === "A") this._move(-1);
      else if (k === "ArrowRight" || k === "d" || k === "D") this._move(1);
      else if (k === "ArrowDown" || k === "s" || k === "S") this._softDrop();
      else if (k === "ArrowUp" || k === "w" || k === "W") this._rotate();
      else if (k === " ") this._hardDrop();
      else if (k === "c" || k === "C" || k === "Shift") this._holdPiece();
    });

    document.querySelectorAll("#tetris-touch-controls .tetris-btn").forEach((btn) => {
      const action = btn.dataset.action;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (this.tablero) return;
        if (action === "left") this._move(-1);
        else if (action === "right") this._move(1);
        else if (action === "down") this._softDrop();
        else if (action === "rotate") this._rotate();
        else if (action === "drop") this._hardDrop();
        else if (action === "hold") this._holdPiece();
      });
    });

    // gestos sobre el tablero: arrastrar = mover, toque = girar, deslizar abajo = caer
    const cv = this.els.canvas;
    let g = null;
    cv.addEventListener("pointerdown", (e) => {
      if (this.tablero) { e.preventDefault(); this._tabDown(e); return; }
      g = { x: e.clientX, y: e.clientY, sx: e.clientX, t: performance.now(), moved: false };
    });
    cv.addEventListener("pointermove", (e) => {
      if (this.tablero) { this._tabMove(e); return; }
      if (!g || this.state !== "playing") return;
      const step = Math.max(22, cv.clientWidth / 16);
      while (e.clientX - g.sx > step) { this._move(1); g.sx += step; g.moved = true; }
      while (g.sx - e.clientX > step) { this._move(-1); g.sx -= step; g.moved = true; }
    });
    const end = (e) => {
      if (this.tablero) { this._tabUp(e, false); return; }
      if (!g) return;
      const dy = e.clientY - g.y;
      const dt = performance.now() - g.t;
      if (this.state === "playing") {
        if (dy > 60 && dt < 350 && !g.moved) this._hardDrop();
        else if (Math.abs(dy) < 14 && !g.moved && dt < 350) this._rotate();
      }
      g = null;
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", (e) => { g = null; if (this.tablero) this._tabUp(e, true); });
  }
}
