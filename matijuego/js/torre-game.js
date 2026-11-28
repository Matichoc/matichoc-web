// Torre de alfajores (verano): un alfajor va y viene sobre la torre; con un toque se suelta y cae. Si queda bien
// encima, la torre sube; si queda justo al centro es "¡Perfecto!" (combo). Si queda muy corrido se cae (pierdes un ❤),
// y si la torre entera queda muy cargada hacia un lado, se derrumba (fin de la partida).
// Cada 15 pisos cae un alfajor dorado (Mati Dubai) que da Matipuntos extra. Liviano para celulares: una geometría
// compartida para todos los alfajores, sombra chica y la cámara solo sube.
//
// Modo «corte» (23-nov-2026, se elige en la tarjeta de inicio): lo que sobresale del alfajor se corta y se cae, y el
// siguiente viene de ese tamaño, cada vez más chico. Con tres ¡Perfectos! seguidos vuelve a crecer. Ahí la torre no
// se derrumba por quedar chueca: se acaba cuando ya no queda alfajor que apilar o se caen tres enteros.

import { THREE, Game3D, clamp, lerp, rand } from "./three-kit.js?v=bfcb83ff05";
import { createMatichico } from "./matichico3d.js?v=bfcb83ff05";
import { earnCoins, saveProgress } from "./storage.js?v=bfcb83ff05";
import * as audio from "./audio.js?v=bfcb83ff05";
import { beachLights, makePalm, makeUmbrella, alfajorMaterials, HIDDEN, sandMaterial, beachSea, beachClouds } from "./verano-kit.js?v=bfcb83ff05";

const R = 1.0; // radio del alfajor
const H = 0.34; // alto del alfajor
const PERFECT = 0.14; // corrimiento máximo para un ¡Perfecto!
const SLIDE_OFF = R * 0.92; // más corrido que esto, el alfajor se cae
const TOPPLE = R * 0.95; // si el centro de la torre se corre más que esto, se derrumba
const GOLD_EVERY = 15;
const BASE_Y = 1.0; // altura del plato
// ---- modo «corte» ----
const MODE_KEY = "matichoc_torre_modo"; // "clasico" (por defecto) o "corte": se guarda en el celular
const MIN_R = 0.24; // un alfajor más chico que esto ya no se puede apilar: se acaba la torre
const MISS_W = 0.12; // si se pisan menos que esto, no quedó apoyado: se cae entero
const REGROW = 0.14; // cuánto crece el alfajor con tres ¡Perfectos! seguidos
const REGROW_EVERY = 3;
function loadMode() {
  try { return localStorage.getItem(MODE_KEY) === "corte" ? "corte" : "clasico"; } catch (e) { return "clasico"; }
}

export class TorreGame extends Game3D {
  constructor(character, progress, els) {
    super("torre", character, progress, els, { fov: 42, bloom: false });
    this.kawaii = true;
    this.ambientOpts = { petals: 10, hearts: 4, stars: 8, radius: 8, height: 10 };
    this.musicTheme = "cozy";
    this.mode = loadMode();
  }

  /** El fantasma: tu mejor partida de este modo. */
  get ghostKey() { return `torre-${this.mode}`; }

  get corte() { return this.mode === "corte"; }

  /** Cambia el modo (lo elige quien juega en la tarjeta de inicio), lo guarda y deja la torre lista para ese modo. */
  setMode(m) {
    this.mode = m === "corte" ? "corte" : "clasico";
    try { localStorage.setItem(MODE_KEY, this.mode); } catch (e) { /* sin almacenamiento: vale por esta vez */ }
    this._syncMode();
    if (this.state !== "playing") this.reset();
  }

  _syncMode() {
    const b = this.els.q && this.els.q("btn-modo");
    if (b) b.textContent = this.corte ? "✂️ Modo: corte · cambiar" : "🥞 Modo: clásico · cambiar";
    const sub = this.els.q && this.els.q("hud-sub");
    if (sub) sub.textContent = this.corte ? "Lo que sobresale se corta: ¡apunta al centro!" : "Suelta los alfajores y apílalos bien alto";
  }

  onIntro() { this._syncMode(); }

  // ---------- escena ----------

  async build() {
    const s = this.scene;
    const { sun } = beachLights(this, { shadow: 6 });
    this.sun = sun;
    // arena, mar al fondo y un par de palmeras y quitasoles
    const sand = new THREE.Mesh(new THREE.CircleGeometry(40, 32), sandMaterial(80));
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    s.add(sand);
    const sea = beachSea(200, 60);
    sea.position.set(0, 0.02, -40);
    s.add(sea);
    // la espuma de la orilla y nubes al fondo
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(200, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.03, -10.4);
    s.add(foam);
    s.add(beachClouds([[-16, 13, -62, 7], [9, 17, -66, 9], [24, 11, -58, 6], [-30, 19, -70, 8], [2, 24, -74, 7]]));
    for (const [x, z, k] of [[-7, -6, 1.3], [8, -8, 1.5], [-12, -14, 1.7], [13, -15, 1.4]]) {
      const p = makePalm(k);
      p.position.set(x, 0, z);
      s.add(p);
    }
    const um = makeUmbrella(1.1);
    um.position.set(4.5, 0, -2.5);
    s.add(um);
    // mesa con plato dorado: la base de la torre
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.8 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.16, 28), wood);
    table.position.y = BASE_Y - 0.16;
    table.castShadow = table.receiveShadow = true;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, BASE_Y - 0.24, 10), wood);
    leg.position.y = (BASE_Y - 0.24) / 2;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0xffc800, roughness: 0.3, metalness: 0.6 }));
    plate.position.y = BASE_Y - 0.04; // su tapa queda a la altura donde se apoya el primer alfajor
    plate.receiveShadow = true;
    s.add(table, leg, plate);

    this.geo = new THREE.CylinderGeometry(R, R, H, 32);
    this.mats = alfajorMaterials();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc800, roughness: 0.25, metalness: 0.7, emissive: 0x5a3a00, emissiveIntensity: 0.4 });
    this.goldMats = [gold, gold, HIDDEN];
    this.tower = new THREE.Group(); // se mece un poquito según lo cargada que esté
    s.add(this.tower);
    this.falling = []; // alfajores que se caen (solo animación)
    this.hero = null;
    this._ensureHero();
    this._bindInput();
  }

  _ensureHero() {
    if (this.hero && this.heroId === this.character.id) { this.hero.setLook(this.look); return; }
    if (this.hero) this.scene.remove(this.hero.group);
    this.hero = createMatichico(this.character, this.outfit, this.look);
    this.heroId = this.character.id;
    this.hero.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.hero.group.position.set(-2.6, 0, 0.8);
    this.hero.group.rotation.y = 0.5;
    this.scene.add(this.hero.group);
  }

  _bindInput() {
    const drop = (e) => {
      if (e && e.target && e.target.closest && e.target.closest("button, .overlay:not(.hidden)")) return;
      if (this.state === "playing") this._drop();
    };
    this.els.wrap.addEventListener("pointerdown", drop);
    window.addEventListener("keydown", (e) => {
      if (!this.running || this.state !== "playing") return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowDown") { e.preventDefault(); this._drop(); }
    });
    const modo = this.els.q && this.els.q("btn-modo");
    if (modo) modo.addEventListener("click", () => this.setMode(this.corte ? "clasico" : "corte"));
    this._syncMode();
  }

  setupMission() { this.mission = null; this._missionWon = false; }

  // ---------- partida ----------

  reset() {
    for (const p of [...(this.pieces || []), ...this.falling]) this.tower.remove(p.mesh), this.scene.remove(p.mesh);
    if (this.cur) { this.scene.remove(this.cur.mesh); this.cur = null; } // el alfajor que iba y venía en la partida anterior (antes quedaba colgando en el aire)
    this.pieces = []; // { mesh, x, r }
    this.falling = [];
    this.curR = R; // (modo corte) el tamaño del alfajor que viene
    this.cuts = 0;
    this.lean = 0;
    this.score = 0;
    this.floors = 0;
    this.hearts = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.perfects = 0;
    this.golds = 0;
    this.coinsEarned = 0;
    this.camY = BASE_Y + 2;
    this.sway = 0;
    this.cheer = 0;
    this.tower.rotation.z = 0;
    this._ensureHero();
    this._newPiece();
    this._updateHud();
    this._placeCamera(0);
  }

  get topY() { return BASE_Y + this.pieces.length * H; }
  get topX() { return this.pieces.length ? this.pieces[this.pieces.length - 1].x : 0; }
  get topR() { return this.pieces.length ? this.pieces[this.pieces.length - 1].r : R; }

  _newPiece() {
    const n = this.pieces.length;
    const gold = (this.floors + 1) % GOLD_EVERY === 0;
    const mesh = new THREE.Mesh(this.geo, gold ? this.goldMats : this.mats[Math.floor(Math.random() * this.mats.length)]);
    mesh.castShadow = true;
    mesh.rotation.y = rand(0, Math.PI * 2);
    const r = this.corte ? this.curR : R;
    mesh.scale.set(r / R, 1, r / R);
    this.scene.add(mesh);
    const speed = Math.min(5.4, 2.0 + n * 0.09); // va más rápido a medida que sube
    this.cur = { mesh, x: Math.random() < 0.5 ? -3.2 : 3.2, dir: Math.random() < 0.5 ? 1 : -1, speed, y: this.topY + 1.3, vy: 0, dropping: false, gold, r };
    mesh.position.set(this.cur.x, this.cur.y, 0);
  }

  /** Deja caer un alfajor (solo animación): se ve entero, con sus dos tapas, y termina apoyado en la arena. */
  _fall(mesh, vx, vy, spin, slot = null) {
    const m = mesh.material;
    const full = (mesh.userData.full || m); // (apilado se le esconden las tapas que quedan tapadas)
    mesh.material = [full[0], full[1], full[1]];
    // `slot` = dónde queda apoyado (en un derrumbe: su lugar en la fila); sin él, cae donde le toque
    const f = { mesh, vx, vy, spin, slot, rest: false, r: R * mesh.scale.x };
    this.falling.push(f);
    return f;
  }

  /**
   * Modo corte: el alfajor queda del tamaño de lo que alcanzó a pisar del de abajo (y centrado ahí); lo que sobresale
   * se cae como un pedacito. Devuelve dónde y de qué tamaño queda, o null si no alcanzó a apoyarse.
   */
  _cut(c) {
    const xt = this.topX, rt = this.topR;
    const lo = Math.max(xt - rt, c.x - c.r), hi = Math.min(xt + rt, c.x + c.r);
    const w = hi - lo;
    if (w < MISS_W) return null;
    const d = c.x - xt;
    if (Math.abs(d) <= PERFECT * Math.max(0.5, c.r / R)) return { x: xt, r: c.r, perfect: true };
    const r = w / 2;
    // el pedacito que se corta: del lado hacia donde quedó corrido
    const sobra = c.r - r;
    if (sobra > 0.04) {
      const bit = new THREE.Mesh(this.geo, c.mesh.material);
      bit.scale.set(sobra / R, 1, sobra / R);
      bit.position.set(Math.sign(d) > 0 ? hi + sobra : lo - sobra, this.topY + H / 2, 0);
      this.scene.add(bit);
      this._fall(bit, Math.sign(d) * rand(1.6, 2.4), 1.6, Math.sign(d) * 6).crumb = true;
    }
    return { x: (lo + hi) / 2, r, perfect: false };
  }

  _drop() {
    if (!this.cur || this.cur.dropping) return;
    this.cur.dropping = true;
    this.cur.vy = -2;
    audio.playWhoosh();
  }

  _land() {
    const c = this.cur;
    const d = c.x - this.topX;
    const cut = this.corte ? this._cut(c) : null;
    if (this.corte ? !cut : Math.abs(d) > SLIDE_OFF) {
      // quedó muy corrido: se cae de la torre
      this._fall(c.mesh, Math.sign(d) * 2.5, 1.5, Math.sign(d) * 4);
      this.cur = null;
      this.combo = 0;
      this.hearts--;
      this.face("ay", 0.9);
      audio.playBump();
      this.haptic(60);
      this.banner(this.hearts > 0 ? "¡Uy! Se cayó 💔" : "¡Se acabaron los ❤!");
      this._updateHud();
      if (this.hearts <= 0) return this._gameOver(`Se cayeron tres alfajores.`);
      setTimeout(() => { if (this.state === "playing") this._newPiece(); }, 450);
      return;
    }
    let x = c.x;
    const perfect = cut ? cut.perfect : Math.abs(d) <= PERFECT;
    if (cut) {
      // modo corte: queda lo que pisó, y el que viene es de ese tamaño (con tres ¡Perfectos! seguidos, crece)
      x = cut.x;
      c.r = cut.r;
      c.mesh.scale.set(c.r / R, 1, c.r / R);
      if (!perfect) this.cuts++;
      this.curR = c.r;
    }
    if (perfect) {
      x = this.topX; // al centro exacto
      this.combo++;
      this.perfects++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += 25 * this.combo;
      this.banner(this.combo > 1 ? `¡Perfecto x${this.combo}!` : "¡Perfecto!");
      audio.playCombo(Math.min(8, this.combo));
      this.particles.burst(new THREE.Vector3(x, this.topY + H, 0), [0xffc800, 0xfff6e6, 0xd4216c], 18, 3.5, 0.6, 4);
      this.cheer = 1.2;
      if (cut && this.combo % REGROW_EVERY === 0 && this.curR < R - 0.01) {
        this.curR = Math.min(R, this.curR + REGROW);
        this.banner(`¡Perfecto x${this.combo}! El alfajor crece 🥞`);
      }
    } else {
      this.combo = 0;
      this.score += 10;
      audio.playCollect();
    }
    // el alfajor de abajo queda tapado: ya no se dibuja su tapa (en celulares cuenta cada pieza dibujada).
    // En el modo corte, si el de arriba es más chico o quedó corrido, la tapa de abajo se sigue viendo alrededor.
    const under = this.pieces[this.pieces.length - 1];
    if (under && !(cut && (c.r < under.r - 0.005 || Math.abs(x - under.x) > 0.005))) {
      under.mesh.userData.full = under.mesh.userData.full || under.mesh.material;
      under.mesh.material = [under.mesh.material[0], HIDDEN, HIDDEN];
    }
    // queda pegado a la torre
    this.scene.remove(c.mesh);
    this.tower.add(c.mesh);
    c.mesh.position.set(x, this.topY + H / 2, 0);
    this.pieces.push({ mesh: c.mesh, x, r: c.r });
    this.floors++;
    if (c.gold) {
      this.golds++;
      earnCoins(this.progress, 10);
      this.coinsEarned += 10;
      saveProgress(this.progress);
      this.banner("✨ ¡Alfajor Mati Dubai! +10 Matipuntos");
      audio.playBonusCollect();
    }
    if (this.floors % 10 === 0) { this.banner(`🏆 ¡${this.floors} pisos!`); audio.playStar(); this.cheer = 1.5; this.glory(new THREE.Vector3(0, this.topY, 0), { slow: 1, hold: 0.7, zoom: 0.16 }); }
    this.cur = null;
    this.haptic(perfect ? 25 : 12);
    this.countEnergy("pisos", 8); // 1 de energía cada 8 pisos
    if (cut) {
      // modo corte: la torre no se derrumba por chueca; se acaba cuando ya no queda alfajor que apilar
      this._updateHud();
      if (this.curR < MIN_R) return this._gameOver("¡Ya no queda alfajor que apilar!");
      if (this.state === "playing") this._newPiece();
      return;
    }
    // ¿la torre quedó muy cargada hacia un lado? (centro de todo lo que está encima del plato)
    const com = this.pieces.reduce((a, p) => a + p.x, 0) / this.pieces.length;
    this.lean = com;
    this._updateHud();
    if (Math.abs(com) > TOPPLE) return this._collapse(com);
    if (this.state === "playing") this._newPiece();
  }

  _collapse(com) {
    audio.playCrash();
    this.haptic(120);
    this.face("wow", 1);
    this.banner("¡Se derrumbó la torre!");
    const dir = Math.sign(com) || 1;
    // los que ya se habían caído antes se quitan de la arena: ahí va a quedar la fila
    for (const f of this.falling) this.scene.remove(f.mesh);
    this.falling = [];
    // todos caen: los de la torre y, si había uno yendo y viniendo arriba, ese también (no queda colgando)
    const all = this.pieces.map((p) => p.mesh);
    if (this.cur) { all.push(this.cur.mesh); this.cur = null; }
    this.pieces = [];
    // Quedan en filas de 10, recostados uno contra otro como fichas de dominó: así ninguno se monta sobre otro ni
    // atraviesa la arena. Cada uno vuela justo hasta su lugar.
    const LEAN = 1.15; // inclinación al quedar apoyado (radianes)
    const yRest = R * Math.sin(LEAN) + (H / 2) * Math.cos(LEAN);
    const wp = new THREE.Vector3();
    all.forEach((mesh, i) => {
      mesh.getWorldPosition(wp);
      if (mesh.parent !== this.scene) { this.tower.remove(mesh); this.scene.add(mesh); }
      mesh.position.copy(wp);
      mesh.rotation.set(0, 0, 0); // (cada alfajor venía girado distinto sobre sí mismo: derechos, todos se recuestan hacia el mismo lado)
      const slot = { x: dir * (2.9 + (i % 10) * 0.42), y: yRest, z: -Math.floor(i / 10) * 1.5, lean: -dir * LEAN };
      const vy = rand(2.5, 4.5);
      const t = (vy + Math.sqrt(vy * vy + 2 * 22 * Math.max(0.05, wp.y - yRest))) / 22; // cuánto tarda en llegar al suelo
      slot.vz = (slot.z - wp.z) / t;
      this._fall(mesh, (slot.x - wp.x) / t, vy, dir * rand(2, 5), slot);
    });
    this._gameOver("¡La torre quedó muy chueca y se derrumbó!");
  }

  _gameOver(why) {
    if (this.state !== "playing") return;
    audio.playLose();
    setTimeout(() => {
      this.finish(`${why} Llegaste a ${this.floors} pisos, con ${this.perfects} ¡Perfectos! (mejor combo x${this.bestCombo}) y ${this.score} puntos` +
        (this.coinsEarned > 0 ? `, y ganaste ${this.coinsEarned} Matipuntos con los alfajores dorados.` : "."));
    }, 900);
    this.state = "ending";
  }

  _updateHud() {
    const e = this.els;
    if (e.hudScore) e.hudScore.textContent = String(this.score);
    if (e.hudFloors) e.hudFloors.textContent = String(this.floors);
    if (e.hudHearts) e.hudHearts.textContent = "❤".repeat(Math.max(0, this.hearts)) + "♡".repeat(Math.max(0, 3 - this.hearts));
    if (e.hudCombo) e.hudCombo.textContent = `x${Math.max(1, this.combo)}`;
    if (e.hudCoins) e.hudCoins.textContent = String(this.progress.coins);
  }

  // ---------- bucle ----------

  update(dt) {
    const playing = this.state === "playing";
    const c = this.cur;
    if (c) {
      if (!c.dropping) {
        if (playing) {
          c.x += c.dir * c.speed * dt;
          if (c.x > 3.4) { c.x = 3.4; c.dir = -1; }
          if (c.x < -3.4) { c.x = -3.4; c.dir = 1; }
        }
        c.y = this.topY + 1.3 + Math.sin(this.time * 4) * 0.05;
      } else {
        c.vy -= 30 * dt;
        c.y += c.vy * dt;
        const floor = this.topY + H / 2;
        if (c.y <= floor) { c.y = floor; c.mesh.position.set(c.x, c.y, 0); this._land(); }
      }
      if (this.cur) this.cur.mesh.position.set(c.x, c.y, 0);
    }
    if (this.falling.length > 40) this.falling = this.falling.filter((f) => !f.gone); // (pedacitos que ya se perdieron en la arena)
    for (const f of this.falling) {
      if (f.rest) continue;
      const m = f.mesh;
      if (f.settle > 0) {
        // ya tocó la arena: se termina de recostar en su lugar de la fila
        f.settle -= dt;
        const k = 1 - Math.exp(-22 * dt);
        m.rotation.z += (f.leanTo - m.rotation.z) * k;
        if (f.settle <= 0) { m.rotation.z = f.leanTo; f.rest = true; }
        continue;
      }
      f.vy -= 22 * dt;
      m.position.x += f.vx * dt;
      m.position.y += f.vy * dt;
      m.rotation.z += f.spin * dt;
      if (f.slot) {
        m.position.z += f.slot.vz * dt;
        if (m.position.y <= f.slot.y && f.vy < 0) {
          m.position.set(f.slot.x, f.slot.y, f.slot.z);
          f.leanTo = f.slot.lean + Math.PI * Math.round((m.rotation.z - f.slot.lean) / Math.PI); // (el alfajor es igual por los dos lados)
          f.settle = 0.2;
        }
        continue;
      }
      // un alfajor suelto (se corrió de la torre): cae a la arena, da un rebote corto y queda apoyado, un poco ladeado
      const piso = H / 2 + 0.12;
      if (f.crumb && !f.hop && f.vy < 0 && m.position.y < BASE_Y + 0.12 && Math.abs(m.position.x) < 1.7) {
        // un pedacito que cae sobre la mesa: da un saltito hacia afuera (no la atraviesa)
        f.hop = true;
        f.vy = 2.6;
        f.vx = Math.sign(f.vx || 1) * 3.4;
      }
      if (m.position.y < piso && f.vy < 0 && (f.crumb || Math.abs(m.position.x) > 1.7)) {
        m.position.y = piso;
        if (f.crumb) { f.rest = f.gone = true; this.scene.remove(m); continue; } // (un pedacito cortado: se pierde en la arena)
        if (f.vy < -3) { f.vy *= -0.28; f.vx *= 0.55; f.spin *= 0.4; }
        else {
          f.rest = true;
          const n = this.falling.indexOf(f);
          const tilt = ((n * 0.61) % 1) * 0.5 - 0.25;
          m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI + tilt;
          m.position.y = H / 2 + Math.abs(Math.sin(tilt)) * (f.r || R);
          m.position.z = -0.9 - n * 0.9; // cada uno un poco más atrás: no se montan entre ellos
        }
      }
    }
    // la torre se mece según qué tan cargada está hacia un lado
    const target = clamp((this.lean || 0) * -0.05, -0.08, 0.08);
    this.sway = lerp(this.sway, target, 1 - Math.exp(-3 * dt));
    this.tower.rotation.z = this.sway + Math.sin(this.time * 2.2) * Math.abs(this.lean || 0) * 0.012;
    this.cheer = Math.max(0, this.cheer - dt);
    this.hero.animate(this.time, this.cheer > 0 ? "cheer" : this.state === "gameover" ? "sad" : "idle", 1);
    this._placeCamera(dt);
  }

  _placeCamera(dt) {
    const target = Math.max(BASE_Y + 2, this.topY + 0.8);
    this.camY = dt ? lerp(this.camY, target, 1 - Math.exp(-3 * dt)) : target;
    const back = 9.5 + Math.min(4, this.pieces.length * 0.04);
    this.camera.position.set(0, this.camY + 2.2, back);
    this.camera.lookAt(0, this.camY - 0.6, 0);
    if (this.sun) { this.sun.position.set(5, this.camY + 10, 8); this.sun.target.position.set(0, this.camY - 2, 0); }
  }
}
