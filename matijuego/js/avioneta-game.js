// Avioneta Choco (verano): tu Matichico vuela una avioneta sobre el mar. Mantén apretado para subir y suelta para
// bajar. Pasa por los aros dorados (+puntos y combo), junta alfajores y esquiva los globos y las gaviotas. Si tocas el
// agua o chocas, pierdes un ❤ (tienes 3). Va cada vez más rápido: ¿hasta cuántos metros llegas?
// Liviano para celulares: pocas piezas que se reciclan, geometrías compartidas y sombra chica. La avioneta entera son
// 4 dibujos (ver js/avioneta-modelos.js).

import { THREE, Game3D, clamp, lerp, rand, makeLogo, detailByDistance } from "./three-kit.js?v=bfcb83ff05";
import { createMatichico } from "./matichico3d.js?v=bfcb83ff05";
import { earnCoins, saveProgress } from "./storage.js?v=bfcb83ff05";
import * as audio from "./audio.js?v=bfcb83ff05";
import { beachLights, alfajorMaterials } from "./verano-kit.js?v=bfcb83ff05";
import { PLANE, planeGeometries, balloonGeometry, gullGeometries, islandGeometry, coastGeometry } from "./avioneta-modelos.js?v=bfcb83ff05";
import { waterTexture } from "./lanchas-modelos.js?v=bfcb83ff05";
import { paintedMaterial, rockGeometry, cloudGeometry, lin } from "./formas.js?v=bfcb83ff05";
import { palmGeometries, treeMaterials, bushGeometry } from "./arboles.js?v=bfcb83ff05";

const CEIL = 10; // techo
const WATER = 0.55; // nivel del agua
const SPAWN_AHEAD = 46;
const GRAV = -17;
const LIFT = 24;
const MAXV = 8;

export class AvionetaGame extends Game3D {
  constructor(character, progress, els) {
    super("avioneta", character, progress, els, { fov: 50, bloom: false });
    this.kawaii = true;
    this.ambientOpts = { petals: 0, hearts: 0, stars: 10, radius: 12, height: 10 };
    this.musicTheme = "adventure";
    this.motor = "avioneta"; // la hélice suena mientras se vuela; se acelera al subir (ver audio.scene)
    this.hold = false;
  }

  // ---------- escena ----------

  async build() {
    const s = this.scene;
    const { sun } = beachLights(this, { shadow: 7 });
    this.sun = sun;
    s.fog = new THREE.Fog(0xc4e8f6, 34, 105);
    // mar (se mueve con la avioneta): azul profundo cerca y turquesa hacia la costa, con reflejos que se deslizan
    this.seaTex = waterTexture();
    this.seaTex.repeat.set(26, 13);
    const sg = new THREE.PlaneGeometry(240, 120, 1, 6);
    sg.rotateX(-Math.PI / 2);
    const sc = [], near = lin(0x2b93cc), mid = lin(0x3fb6d8), coast = lin(0x86dfe8);
    for (let i = 0; i < sg.attributes.position.count; i++) {
      const k = Math.min(1, Math.max(0, (20 - sg.attributes.position.getZ(i)) / 52)); // 0 = cerca de la cámara, 1 = en la orilla del fondo
      sc.push(...(k < 0.6 ? near.map((v, j) => v + (mid[j] - v) * (k / 0.6)) : mid.map((v, j) => v + (coast[j] - v) * ((k - 0.6) / 0.4))));
    }
    sg.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
    this.sea = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: this.seaTex, vertexColors: true, roughness: 0.25, metalness: 0.08 }));
    this.sea.position.y = 0;
    this.sea.receiveShadow = true;
    s.add(this.sea);
    // la costa del fondo: playa y lomas verdes (una pieza que acompaña a la avioneta)
    const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.shore = new THREE.Mesh(coastGeometry(240, -31), landMat);
    s.add(this.shore);
    // islas con palmeras, arbustos y rocas (decoración que se recicla)
    this.isles = [];
    const TM = treeMaterials(), [pt, pl] = palmGeometries(false);
    const isleGeo = islandGeometry(), bushG = bushGeometry(), rockG = rockGeometry(0xb9a58c, 5);
    const bushM = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x5fbd62, roughness: 0.9 });
    const foamG = new THREE.RingGeometry(2.95, 3.5, 22);
    foamG.rotateX(-Math.PI / 2);
    this.isleFoam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const isle = new THREE.Mesh(isleGeo, landMat);
      isle.rotation.y = i * 1.3;
      const foam = new THREE.Mesh(foamG, this.isleFoam);
      foam.position.y = 0.03;
      g.add(isle, foam);
      for (let k = 0; k < (i % 2 ? 1 : 2); k++) {
        const h = rand(3.6, 4.8);
        const tr = new THREE.Mesh(pt, TM.palmTrunk), lv = new THREE.Mesh(pl, TM.palmLeaf);
        const palm = new THREE.Group();
        palm.add(tr, lv);
        palm.scale.setScalar(h);
        palm.position.set(k ? 1.0 : -0.5, 0.6, k ? -0.5 : 0.3);
        palm.rotation.set(rand(-0.12, 0.12), rand(0, 6), rand(-0.12, 0.12));
        g.add(palm);
      }
      const extra = i % 3 === 0 ? new THREE.Mesh(rockG, landMat) : new THREE.Mesh(bushG, bushM);
      extra.scale.setScalar(i % 3 === 0 ? 0.7 : 0.8);
      extra.position.set(1.6, i % 3 === 0 ? 0.45 : 0.4, 0.9);
      g.add(extra);
      g.position.set(i * 22, 0, -rand(13, 25));
      s.add(g);
      this.isles.push(g);
    }
    // nubes esponjosas en dos capas (las de más atrás se ven pasar más lento)
    this.clouds = [];
    const cm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const cgs = [cloudGeometry(1), cloudGeometry(2), cloudGeometry(3)];
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(cgs[i % 3], cm);
      const farC = i % 2 === 0;
      const sc2 = farC ? rand(4.5, 6.5) : rand(2.6, 3.8);
      c.scale.set(sc2, sc2 * 0.9, sc2);
      c.position.set(i * 14, farC ? rand(15, 21) : rand(11, 15), farC ? -rand(42, 56) : -rand(18, 30));
      c.userData.noToon = true;
      c.userData.slow = farC ? 0.55 : 0.2; // cuánto «se viene» con la avioneta (más = más lejos)
      s.add(c);
      this.clouds.push(c);
    }

    // avioneta (rosado Matichoc, alas amarillas) con el Matichico de piloto, sentado en la cabina
    this.plane = new THREE.Group();
    const pg = planeGeometries();
    const body = new THREE.Mesh(pg.body, paintedMaterial());
    body.castShadow = true;
    const glass = new THREE.Mesh(pg.glass, new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.42, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    this.prop = new THREE.Mesh(pg.prop, paintedMaterial());
    this.prop.position.x = PLANE.noseX;
    this.propDisc = new THREE.Mesh(pg.disc, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    this.propDisc.position.x = PLANE.noseX + 0.12;
    this.propDisc.userData.noToon = true;
    this.plane.add(body, glass, this.prop, this.propDisc);
    for (const sz of [-1, 1]) {
      const lg = makeLogo(0.44);
      lg.position.set(-0.62, 0.06, sz * 0.29);
      lg.rotation.y = sz > 0 ? 0 : Math.PI;
      this.plane.add(lg);
    }
    s.add(this.plane);

    // piezas que se reciclan: aros, alfajores, globos y gaviotas
    this.ringGeo = new THREE.TorusGeometry(1.25, 0.14, 8, 24);
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0xffc800, roughness: 0.3, metalness: 0.6, emissive: 0x5a3a00, emissiveIntensity: 0.35 });
    this.coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 20);
    this.coinMats = alfajorMaterials();
    this.balloonGeos = [[0xd4216c, 0xfff6e6], [0x4fb8ff, 0xffc800], [0x4fd09a, 0xfff6e6], [0xff8a3d, 0xffc800], [0x9a5cff, 0xff9ec4]].map(([c1, c2]) => balloonGeometry(c1, c2));
    this.gull = gullGeometries();
    this.things = [];

    this.hero = null;
    this._ensureHero();
    this._bindInput();
  }

  _ensureHero() {
    if (this.hero && this.heroId === this.character.id) { this.hero.setLook(this.look); return; }
    if (this.hero) this.plane.remove(this.hero.group);
    this.hero = createMatichico(this.character, this.outfit, this.look);
    this.heroId = this.character.id;
    this.hero.group.scale.setScalar(0.6);
    this.hero.group.position.set(PLANE.cockpitX - 0.1, PLANE.cockpitY - 0.52, 0); // sentado adentro: se le ve de los hombros hacia arriba
    this.hero.group.rotation.y = Math.PI / 2;
    this.hero.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    detailByDistance(this.hero.group); // (las piezas de 1 o 2 cm no tiran sombra)
    this.plane.add(this.hero.group);
  }

  _bindInput() {
    const wrap = this.els.wrap;
    const down = (e) => { if (e.target.closest && e.target.closest("button, .overlay:not(.hidden)")) return; this.hold = true; };
    const up = () => { this.hold = false; };
    wrap.addEventListener("pointerdown", down);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
    wrap.addEventListener("pointerleave", up);
    window.addEventListener("keydown", (e) => { if (this.running && (e.code === "Space" || e.code === "ArrowUp")) { e.preventDefault(); this.hold = true; } });
    window.addEventListener("keyup", (e) => { if (e.code === "Space" || e.code === "ArrowUp") this.hold = false; });
  }

  setupMission() { this.mission = null; this._missionWon = false; }

  /** El fantasma: tu mejor vuelo (ver Game3D._ghostStart). */
  get ghostKey() { return "avioneta"; }

  // ---------- partida ----------

  reset() {
    for (const t of this.things || []) this.scene.remove(t.mesh);
    this.things = [];
    this.x = 0;
    this.y = 4;
    this.vy = 0;
    this.speed = 8;
    this.dist = 0;
    this.score = 0;
    this.hearts = 3;
    this.invuln = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.rings = 0;
    this.items = 0;
    this.coinsEarned = 0;
    this.nextSpawn = -30; // lo primero aparece apenas parte
    this.hold = false;
    this.flyT = 0;
    this.camX = 0;
    this.camY = 4.5;
    this._ensureHero();
    this.plane.position.set(0, this.y, 0);
    this.plane.rotation.set(0, 0, 0);
    this.plane.visible = true;
    this._cloudX = 0;
    this.clouds.forEach((c, i) => { c.position.x = i * 14; });
    this.isles.forEach((g, i) => { g.position.x = i * 22; });
    this._updateHud();
    this._placeCamera(0);
  }

  _spawn() {
    const x = this.x + SPAWN_AHEAD;
    const lvl = Math.min(1, this.dist / 1500); // dificultad 0..1
    const r = Math.random();
    if (r < 0.42) {
      // aro dorado, con alfajores en fila antes
      const y = rand(2.4, CEIL - 2);
      const m = new THREE.Mesh(this.ringGeo, this.ringMat);
      m.rotation.y = 1.05; // de lado, pero que se vea el círculo desde la cámara
      m.position.set(x, y, 0);
      this.scene.add(m);
      this.things.push({ kind: "ring", mesh: m, x, y });
      for (let i = 1; i <= 3; i++) this._coin(x - i * 2.2, y);
    } else if (r < 0.75) {
      // globo aerostático (sube y baja despacio)
      const y = rand(2.5, CEIL - 1.5);
      const g = new THREE.Mesh(this.balloonGeos[Math.floor(Math.random() * this.balloonGeos.length)], paintedMaterial());
      g.castShadow = true;
      g.rotation.y = rand(0, 6);
      g.position.set(x, y, 0);
      this.scene.add(g);
      this.things.push({ kind: "balloon", mesh: g, x, y, y0: y, ph: rand(0, 6), amp: 0.6 + lvl * 1.4, r: 1.25 });
    } else if (r < 0.9) {
      // gaviota que vuela hacia ti
      const y = rand(2, CEIL - 1);
      const g = new THREE.Group();
      const mat = this.gullMat || (this.gullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
      const wings = [1, -1].map((sz) => { const w = new THREE.Mesh(this.gull.wing, mat); w.scale.z = sz; return w; });
      g.add(new THREE.Mesh(this.gull.body, mat), ...wings);
      g.position.set(x, y, 0);
      this.scene.add(g);
      this.things.push({ kind: "gull", mesh: g, wings, x, y, vx: -(2 + lvl * 3), r: 0.6 });
    } else {
      // fila de alfajores en curva
      const y0 = rand(2.5, CEIL - 2.5);
      for (let i = 0; i < 5; i++) this._coin(x + i * 1.8, y0 + Math.sin(i * 0.9) * 1.4);
    }
    this.nextSpawn = this.x + rand(8, 13) - lvl * 3;
  }

  _coin(x, y) {
    const m = new THREE.Mesh(this.coinGeo, this.coinMats[Math.floor(Math.random() * this.coinMats.length)]);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, 0);
    this.scene.add(m);
    this.things.push({ kind: "coin", mesh: m, x, y });
  }

  _hit(why) {
    if (this.invuln > 0) return;
    this.hearts--;
    this.face("ay", 0.9);
    this.invuln = 1.6;
    this.combo = 0;
    audio.playBump();
    this.haptic(80);
    this.particles.burst(this.plane.position.clone(), [0xffffff, 0xd4216c, 0xffc800], 18, 4, 0.6, 4);
    this.banner(this.hearts > 0 ? `${why} 💔` : "¡Aterrizaje forzoso!");
    this._updateHud();
    if (this.hearts <= 0) this._gameOver();
  }

  _gameOver() {
    if (this.state !== "playing") return;
    audio.playLose();
    this.state = "ending";
    setTimeout(() => this.finish(`Volaste ${Math.floor(this.dist)} metros, pasaste por ${this.rings} aros (mejor combo x${this.bestCombo}) y juntaste ${this.items} alfajores: ${this.score} puntos` +
      (this.coinsEarned > 0 ? `, y ganaste ${this.coinsEarned} Matipuntos.` : ".")), 900);
  }

  _updateHud() {
    const e = this.els;
    if (e.hudScore) e.hudScore.textContent = String(this.score);
    if (e.hudDist) e.hudDist.textContent = `${Math.floor(this.dist)} m`;
    if (e.hudHearts) e.hudHearts.textContent = "❤".repeat(Math.max(0, this.hearts)) + "♡".repeat(Math.max(0, 3 - this.hearts));
    if (e.hudCombo) e.hudCombo.textContent = `x${Math.max(1, this.combo)}`;
    if (e.hudCoins) e.hudCoins.textContent = String(this.progress.coins);
  }

  // ---------- bucle ----------

  update(dt) {
    const playing = this.state === "playing";
    if (playing) this._step(dt);
    else if (this.state === "intro") { this.y = 4 + Math.sin(this.time * 1.5) * 0.3; }
    else if (this.state === "ending" || this.state === "gameover") { this.vy = Math.max(-8, this.vy + GRAV * dt); this.y = Math.max(WATER - 0.2, this.y + this.vy * dt); }
    // llegada: la primera vez la avioneta entra en picada desde arriba y atrás, y se endereza en su lugar
    const arr = this.arriving > 0 ? this.arriving * this.arriving : 0;
    this.plane.position.set(this.x - arr * 9, this.y + arr * 3.2, 0);
    this.plane.rotation.z = lerp(this.plane.rotation.z, clamp(this.vy * 0.07 - arr * 0.9, -0.5, 0.5), 1 - Math.exp(-8 * dt));
    this.plane.visible = this.state !== "playing" || this.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0;
    this.prop.rotation.x += dt * 40;
    this.propDisc.material.opacity = 0.13 + Math.sin(this.time * 31) * 0.04;
    this.hero.animate(this.time, "drive", 1);
    for (const t of this.things) {
      if (t.kind === "balloon") { t.y = t.y0 + Math.sin(this.time * 0.9 + t.ph) * t.amp; t.mesh.position.y = t.y; }
      else if (t.kind === "gull") {
        if (playing) t.x += t.vx * dt;
        t.mesh.position.set(t.x, t.y + Math.sin(this.time * 6) * 0.1, 0);
        const flap = Math.sin(this.time * 11) * 0.7 - 0.1; // las dos alas suben y bajan juntas
        t.wings[0].rotation.x = -flap;
        t.wings[1].rotation.x = flap;
      }
      else if (t.kind === "coin") t.mesh.rotation.y += dt * 3; // gira mostrando la foto del alfajor
      else if (t.kind === "ring") t.mesh.rotation.x = Math.sin(this.time * 2) * 0.12;
    }
    // decoración que acompaña
    for (const isle of this.isles) if (isle.position.x < this.x - 30) isle.position.x += 22 * this.isles.length;
    // las nubes lejanas se vienen con la avioneta (se ven pasar más lento que las cercanas)
    const dx = this.x - (this._cloudX ?? this.x);
    this._cloudX = this.x;
    for (const c of this.clouds) {
      c.position.x += dx * c.userData.slow;
      if (c.position.x < this.x - 46) c.position.x += 14 * this.clouds.length;
    }
    this.sea.position.x = this.x;
    this.shore.position.x = this.x;
    this.seaTex.offset.x = ((this.x / 240) * 26) % 1; // el mar no se «arrastra» con la avioneta: su dibujo queda quieto en el mundo
    this.isleFoam.opacity = 0.42 + Math.sin(this.time * 1.7) * 0.14;
    this._placeCamera(dt);
  }

  _step(dt) {
    this.speed = Math.min(16, 8 + this.dist / 160);
    this.x += this.speed * dt;
    this.dist += this.speed * dt;
    this.flyT = (this.flyT || 0) + dt;
    const grav = this.flyT < 1.0 ? 0 : this.flyT < 2.2 ? GRAV * 0.45 : GRAV; // al partir planea un segundo y después cae despacito
    this.vy = clamp(this.vy + (this.hold ? LIFT : grav) * dt, -MAXV, MAXV);
    this.motorSpeed = this.hold ? 1 : 0.25;
    this.y += this.vy * dt;
    if (this.y > CEIL) { this.y = CEIL; this.vy = Math.min(0, this.vy); }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.y < WATER + 0.3) {
      this.y = WATER + 0.3;
      this.vy = 7; // rebota en el agua
      this.particles.burst(new THREE.Vector3(this.x, WATER, 0), [0xffffff, 0x9fe8ff], 22, 4, 0.6, 6);
      audio.playSplash(1.2);
      this._hit("¡Al agua!");
      if (this.state !== "playing") return;
    }
    if (this.x >= this.nextSpawn) this._spawn();
    // choques y premios
    const px = this.x + 0.3, py = this.y;
    for (const t of this.things) {
      if (t.done) continue;
      const dx = t.x - px, dy = (t.kind === "balloon" ? t.y : t.y) - py;
      if (t.kind === "coin") {
        if (dx * dx + dy * dy < 1.1) {
          t.done = true; t.mesh.visible = false; this.items++; this.score += 10; audio.playCollect();
          if (this.items % 10 === 0) { earnCoins(this.progress, 2); this.coinsEarned += 2; saveProgress(this.progress); }
        }
      } else if (t.kind === "ring") {
        if (Math.abs(dx) < 0.35) {
          t.done = true;
          if (Math.abs(dy) < 1.05) {
            this.rings++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
            this.score += 50 * this.combo;
            audio.playStar(); this.haptic(20);
            this.particles.burst(new THREE.Vector3(t.x, t.y, 0), [0xffc800, 0xfff6e6, 0xd4216c], 20, 4, 0.6, 2);
            if (this.combo > 1) this.banner(`¡Aro x${this.combo}!`);
            if (this.combo >= 3 && this.combo % 3 === 0) this.glory(null, { slow: 0.45, hold: 0.45, zoom: 0.12 });
            t.mesh.material = this.ringMat; t.mesh.scale.setScalar(1.25);
          } else { this.combo = 0; }
        }
      } else if (dx * dx + dy * dy < (t.r + 0.55) ** 2) {
        t.done = true;
        this._hit(t.kind === "gull" ? "¡Una gaviota!" : "¡Chocaste un globo!");
        if (this.state !== "playing") return;
      }
    }
    // reciclar lo que quedó atrás
    for (let i = this.things.length - 1; i >= 0; i--) if (this.things[i].x < this.x - 20) { this.scene.remove(this.things[i].mesh); this.things.splice(i, 1); }
    this.meterEnergy("metros", this.dist, 150); // 1 de energía cada 150 m
    if (Math.floor(this.dist / 250) > Math.floor((this.dist - this.speed * dt) / 250)) { this.banner(`✈️ ¡${Math.floor(this.dist / 250) * 250} m!`); audio.playPowerup(); }
    this._updateHud();
  }

  _placeCamera(dt) {
    const tx = this.x + 4, ty = clamp(this.y * 0.5 + 2.6, 3.2, 7);
    this.camX = dt ? lerp(this.camX, tx, 1 - Math.exp(-6 * dt)) : tx;
    this.camY = dt ? lerp(this.camY, ty, 1 - Math.exp(-3 * dt)) : ty;
    this.camera.position.set(this.camX - 2, this.camY + 1.2, 15);
    this.camera.lookAt(this.camX, this.camY, 0);
    if (this.sun) { this.sun.position.set(this.x + 4, 18, 10); this.sun.target.position.set(this.x + 2, 0, 0); }
  }
}
