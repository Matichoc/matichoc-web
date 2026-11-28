// Lanchas en el lago (verano): tu Matichico maneja una lancha que avanza sola por el lago. Muévela a los lados
// (◀ ▶, flechas o arrastrando el dedo) para esquivar boyas y rocas de chocolate, saltar en las olas (rampas) y juntar
// alfajores. Cada choque quita un ❤ (tienes 3) y la lancha va cada vez más rápido.
// Liviano para celulares: el agua es un plano con una textura que se desliza, la lancha entera son 2 dibujos (ver
// js/lanchas-modelos.js) y todo lo demás se recicla.

import { THREE, Game3D, clamp, lerp, rand, makeLogo, detailByDistance } from "./three-kit.js?v=bfcb83ff05";
import { createMatichico } from "./matichico3d.js?v=bfcb83ff05";
import { earnCoins, saveProgress } from "./storage.js?v=bfcb83ff05";
import * as audio from "./audio.js?v=bfcb83ff05";
import { beachLights, makeUmbrella, alfajorMaterials } from "./verano-kit.js?v=bfcb83ff05";
import { BOAT, boatGeometries, buoyGeometry, waveGeometry, waterTexture, wakeTexture, shoreGeometry, volcanoGeometry } from "./lanchas-modelos.js?v=bfcb83ff05";
import { paintedMaterial, rockGeometry, cloudGeometry, mergeColored, paint, at, lin } from "./formas.js?v=bfcb83ff05";
import { palmGeometries, crownGeometry, treeMaterials } from "./arboles.js?v=bfcb83ff05";

const HALF = 5.2; // ancho del lago navegable (a cada lado)
const AHEAD = 70;

export class LanchasGame extends Game3D {
  constructor(character, progress, els) {
    super("lanchas", character, progress, els, { fov: 60, bloom: false });
    this.kawaii = true;
    this.ambientOpts = { petals: 0, hearts: 0, stars: 8, radius: 12, height: 8 };
    this.musicTheme = "race";
    this.motor = "lancha"; // el motor suena mientras se juega; sube con la velocidad (ver audio.scene)
    this.input = 0;
    this.keys = {};
    this.pointerX = null;
  }

  // ---------- escena ----------

  async build() {
    const s = this.scene;
    const { sun } = beachLights(this, { shadow: 8 });
    this.sun = sun;
    s.fog = new THREE.Fog(0xc4e8f6, 45, 125);
    // agua: más profunda (azul) al centro del lago y turquesa clarita hacia las orillas, con reflejos que se deslizan
    this.waterTex = waterTexture();
    this.waterTex.repeat.set(3, 40);
    const wg = new THREE.PlaneGeometry(2 * HALF + 3.4, 200, 8, 1);
    wg.rotateX(-Math.PI / 2);
    const wc = [], deep = lin(0x2b97cf), mid = lin(0x45bfe0), shallow = lin(0x9be6ec);
    for (let i = 0; i < wg.attributes.position.count; i++) {
      const k = Math.abs(wg.attributes.position.getX(i)) / (HALF + 1.7);
      const c = k < 0.6 ? deep.map((v, j) => v + (mid[j] - v) * (k / 0.6)) : mid.map((v, j) => v + (shallow[j] - v) * ((k - 0.6) / 0.4));
      wc.push(...c);
    }
    wg.setAttribute("color", new THREE.Float32BufferAttribute(wc, 3));
    this.water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: this.waterTex, vertexColors: true, roughness: 0.25, metalness: 0.08 }));
    this.water.receiveShadow = true;
    s.add(this.water);
    // una segunda capa de reflejos, más grande y más lenta: el agua se ve viva sin gastar más que un plano
    this.shineTex = waterTexture();
    this.shineTex.repeat.set(1.5, 14);
    this.shine = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 3.4, 200), new THREE.MeshBasicMaterial({ map: this.shineTex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shine.rotation.x = -Math.PI / 2;
    this.shine.position.y = 0.012;
    this.shine.userData.noToon = true;
    s.add(this.shine);
    // orillas: arena mojada, playa y una loma de pasto atrás (una pieza por lado)
    const EDGE = HALF + 1.5;
    const shoreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.shores = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Mesh(shoreGeometry(side, EDGE, 200), shoreMat);
      sh.receiveShadow = true;
      s.add(sh);
      this.shores.push(sh);
      // la espuma de la orilla
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 200), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(side * (EDGE - 0.25), 0.03, 0);
      s.add(foam);
      this.shores.push(foam);
    }
    this.foamMat = this.shores[1].material;
    // el fondo, que acompaña a la lancha: cerros, un volcán nevado y nubes (sin luz ni niebla: ya vienen con la bruma pintada)
    this.backdrop = new THREE.Group();
    const far = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const hillCol = (x, y) => { const k = Math.min(1, y / 16); return [0.56 + 0.1 * k, 0.74 + 0.06 * k, 0.66 + 0.08 * k]; };
    const hills = [[-58, -96, 34, 0.5], [-30, -128, 30, 0.42], [34, -124, 36, 0.46], [62, -92, 30, 0.52], [86, -60, 26, 0.5], [-84, -58, 28, 0.5]]
      .map(([x, z, r, tall]) => paint(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillCol, at(x, -1, z, 0, 0, 0, 1, tall, 1)));
    hills.push(volcanoGeometry().applyMatrix4(at(-10, -1, -150, 0, 0, 0, 44, 46, 44)));
    const back = new THREE.Mesh(mergeColored(hills), far);
    const clouds = new THREE.Mesh(mergeColored([[-46, 30, -120, 9], [18, 36, -135, 11], [58, 27, -110, 8], [-14, 44, -140, 7]].map(([x, y, z, sc], i) => cloudGeometry(i + 1).applyMatrix4(at(x, y, z, 0, 0, 0, sc)))), far);
    this.backdrop.add(back, clouds);
    this.backdrop.userData.noToon = true;
    s.add(this.backdrop);
    // adornos de la orilla que se reciclan: palmeras, quitasoles, rocas y arbolitos en la loma
    this.decos = [];
    const TM = treeMaterials(), [pt, pl] = palmGeometries(false);
    const rockG = rockGeometry(0xb9a58c, 3), rockM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const greens = [0x5fbd62, 0x74c96a, 0x4faa5c].map((c) => new THREE.MeshStandardMaterial({ vertexColors: true, color: c, roughness: 0.9 }));
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1, kind = i % 11;
      const d = new THREE.Group();
      let off;
      if (kind === 3 || kind === 8) { d.add(makeUmbrella(0.9)); off = rand(2, 4.2); }
      else if (kind === 5) { const r = new THREE.Mesh(rockG, rockM); r.scale.setScalar(rand(0.5, 0.9)); r.rotation.y = rand(0, 6); d.add(r); off = rand(0.4, 1.6); }
      else if (kind === 1 || kind === 6 || kind === 9) {
        // arbolito en la loma de pasto
        const c = new THREE.Mesh(crownGeometry(i % 2, true), greens[i % 3]);
        const sc = rand(1.5, 2.3);
        c.scale.set(sc, sc * 1.05, sc);
        c.position.y = sc * 0.8;
        d.add(c);
        off = rand(9.5, 14);
      } else {
        const h = rand(4.2, 5.8);
        const tr = new THREE.Mesh(pt, TM.palmTrunk), lv = new THREE.Mesh(pl, TM.palmLeaf);
        tr.scale.setScalar(h); lv.scale.setScalar(h);
        tr.castShadow = lv.castShadow = false;
        d.add(tr, lv);
        d.rotation.set(rand(-0.08, 0.08), rand(0, 6), rand(-0.08, 0.08));
        off = rand(2.2, 6.5);
      }
      d.position.set(side * (EDGE + off), off < 1.6 ? 0.03 + off * 0.14 : off < 4.5 ? 0.26 + (off - 1.6) * 0.09 : off < 9.5 ? 0.52 + (off - 4.5) * 0.126 : 1.15 + (off - 9.5) * 0.115, -i * 6);
      s.add(d);
      this.decos.push(d);
    }
    this.decoStep = 6;
    // la lancha deportiva con el Matichico manejando (el casco pintado + el parabrisas)
    this.boat = new THREE.Group();
    const bg = boatGeometries();
    const hull = new THREE.Mesh(bg.hull, paintedMaterial());
    hull.castShadow = true;
    const glass = new THREE.Mesh(bg.glass, new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.42, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    this.boat.add(hull, glass);
    for (const sx of [-1, 1]) {
      const lg = makeLogo(0.42);
      lg.position.set(sx * (BOAT.beam * 0.96 + 0.02), 0.44, 1.15);
      lg.rotation.y = (sx * Math.PI) / 2;
      this.boat.add(lg);
    }
    // banderín rosado en la popa
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.26, 0, 0, -0.13, 0.5], 3));
    fg.computeVertexNormals();
    this.flag = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xffc800, side: THREE.DoubleSide }));
    this.flag.position.set(-0.66, 1.5, BOAT.length / 2 - 0.2);
    this.boat.add(this.flag);
    s.add(this.boat);
    // la estela: una V de espuma detrás de la lancha, pegada al agua
    this.wakeTex = wakeTexture();
    this.wake = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 11), new THREE.MeshBasicMaterial({ map: this.wakeTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    this.wake.rotation.x = -Math.PI / 2;
    this.wake.userData.noToon = true;
    s.add(this.wake);

    // piezas que se reciclan
    this.buoyGeo = buoyGeometry();
    this.rockGeo = rockGeometry(0x6a4126, 1);
    this.rockMat = paintedMaterial();
    this.ringGeo = new THREE.RingGeometry(0.95, 1.3, 20);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.rampGeo = waveGeometry();
    this.rampMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // la ola va sin luz: celeste clara con la cresta blanca (con sombra se veía gris, como una roca)
    this.coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 20);
    this.coinMats = alfajorMaterials();
    this.things = [];
    this.hero = null;
    this._ensureHero();
    this._bindInput();
  }

  _ensureHero() {
    if (this.hero && this.heroId === this.character.id) { this.hero.setLook(this.look); return; }
    if (this.hero) this.boat.remove(this.hero.group);
    this.hero = createMatichico(this.character, this.outfit, this.look);
    this.heroId = this.character.id;
    this.hero.group.scale.setScalar(0.6);
    this.hero.group.position.set(0, 0.33, 0.62); // sentado en su asiento, con los pies en el piso de la cabina
    this.hero.group.rotation.y = Math.PI;
    this.hero.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    detailByDistance(this.hero.group); // (las piezas de 1 o 2 cm no tiran sombra)
    this.boat.add(this.hero.group);
  }

  _bindInput() {
    const wrap = this.els.wrap;
    const L = this.els.touch && this.els.touch.left, Rb = this.els.touch && this.els.touch.right;
    const hold = (btn, key) => {
      if (!btn) return;
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); this.keys[key] = true; });
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, () => { this.keys[key] = false; });
    };
    hold(L, "left");
    hold(Rb, "right");
    window.addEventListener("keydown", (e) => {
      if (!this.running) return;
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.keys.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.keys.right = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.keys.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.keys.right = false;
    });
    // arrastrar el dedo en el agua: la lancha sigue al dedo
    let drag = null;
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, .overlay:not(.hidden)")) return;
      drag = { x0: e.clientX, bx: this.bx };
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const w = wrap.clientWidth || 800;
      this.pointerX = clamp(drag.bx + ((e.clientX - drag.x0) / w) * 14, -HALF, HALF);
    });
    for (const ev of ["pointerup", "pointercancel"]) wrap.addEventListener(ev, () => { drag = null; this.pointerX = null; });
  }

  setupMission() { this.mission = null; this._missionWon = false; }

  // ---------- partida ----------

  reset() {
    for (const t of this.things || []) this.scene.remove(t.mesh);
    this.things = [];
    this.bx = 0;
    this.vx = 0;
    this.bz = 0;
    this.by = 0;
    this.vy = 0;
    this.speed = 12;
    this.dist = 0;
    this.score = 0;
    this.hearts = 3;
    this.invuln = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.items = 0;
    this.jumps = 0;
    this.coinsEarned = 0;
    this.nextSpawn = -20;
    this.keys = {};
    this.pointerX = null;
    this._ensureHero();
    this.boat.position.set(0, 0, 0);
    this.boat.rotation.set(0, 0, 0);
    this.boat.visible = true;
    this.decos.forEach((d, i) => { d.position.z = -i * this.decoStep; });
    this._updateHud();
    this._placeCamera(0);
  }

  _spawn() {
    const z = this.bz - AHEAD;
    const lvl = Math.min(1, this.dist / 2500);
    const r = Math.random();
    if (r < 0.45) {
      // fila de boyas con un hueco (por donde se pasa)
      const gap = rand(-HALF + 1.5, HALF - 1.5);
      for (let x = -HALF + 0.6; x <= HALF - 0.6; x += 1.6) {
        if (Math.abs(x - gap) < 1.6 - lvl * 0.4) continue;
        if (Math.random() < 0.35) continue;
        const g = new THREE.Mesh(this.buoyGeo, paintedMaterial());
        g.castShadow = true;
        g.position.set(x, 0.3, z);
        this.scene.add(g);
        this.things.push({ kind: "buoy", mesh: g, x, z, r: 0.55, ph: rand(0, 6) });
      }
    } else if (r < 0.65) {
      const x = rand(-HALF + 1, HALF - 1);
      // roca de chocolate con su anillo de espuma donde rompe el agua
      const m = new THREE.Group();
      const rock = new THREE.Mesh(this.rockGeo, this.rockMat);
      rock.rotation.y = rand(0, 6);
      rock.position.y = 0.15;
      rock.castShadow = true;
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
      ring.position.y = -0.16;
      m.add(rock, ring);
      m.position.set(x, 0.2, z);
      this.scene.add(m);
      this.things.push({ kind: "rock", mesh: m, x, z, r: 0.95 });
    } else if (r < 0.8) {
      // ola-rampa: se salta y da puntos; con alfajores en el aire
      const x = rand(-HALF + 1.5, HALF - 1.5);
      const m = new THREE.Mesh(this.rampGeo, this.rampMat);
      m.position.set(x, 0.0, z);
      this.scene.add(m);
      this.things.push({ kind: "ramp", mesh: m, x, z, r: 1.3 });
      for (let i = 1; i <= 3; i++) this._coin(x, z - 3 - i * 2.2, 1.6 + Math.sin((i / 4) * Math.PI) * 1.2);
    } else {
      // camino de alfajores
      const x0 = rand(-HALF + 1, HALF - 1);
      for (let i = 0; i < 6; i++) this._coin(clamp(x0 + Math.sin(i * 0.7) * 1.6, -HALF + 0.5, HALF - 0.5), z - i * 2.4, 0.7);
    }
    this.nextSpawn = this.bz - rand(13, 19) + lvl * 5;
  }

  _coin(x, z, y) {
    const m = new THREE.Mesh(this.coinGeo, this.coinMats[Math.floor(Math.random() * this.coinMats.length)]);
    m.position.set(x, y, z);
    m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    this.things.push({ kind: "coin", mesh: m, x, z, y });
  }

  _hit(why) {
    if (this.invuln > 0) return;
    this.hearts--;
    this.face("ay", 0.9);
    this.invuln = 1.5;
    this.combo = 0;
    this.speed = Math.max(12, this.speed * 0.75);
    audio.playCrash();
    audio.playSplash(0.7);
    this.haptic(80);
    this.particles.burst(new THREE.Vector3(this.bx, 0.6, this.bz), [0xffffff, 0x9fe8ff, 0xd4216c], 20, 4, 0.6, 5);
    this.banner(this.hearts > 0 ? `${why} 💔` : "¡La lancha quedó en pana!");
    this._updateHud();
    if (this.hearts <= 0) this._gameOver();
  }

  _gameOver() {
    if (this.state !== "playing") return;
    audio.playLose();
    this.state = "ending";
    setTimeout(() => this.finish(`Navegaste ${Math.floor(this.dist)} metros, saltaste ${this.jumps} olas y juntaste ${this.items} alfajores: ${this.score} puntos` +
      (this.coinsEarned > 0 ? `, y ganaste ${this.coinsEarned} Matipuntos.` : ".")), 450);
  }

  _updateHud() {
    const e = this.els;
    if (e.hudScore) e.hudScore.textContent = String(this.score);
    if (e.hudDist) e.hudDist.textContent = `${Math.floor(this.dist)} m`;
    if (e.hudSpeed) e.hudSpeed.textContent = `${Math.round(this.speed * 3.6)} km/h`;
    if (e.hudHearts) e.hudHearts.textContent = "❤".repeat(Math.max(0, this.hearts)) + "♡".repeat(Math.max(0, 3 - this.hearts));
    if (e.hudCoins) e.hudCoins.textContent = String(this.progress.coins);
  }

  // ---------- bucle ----------

  update(dt) {
    const playing = this.state === "playing";
    if (playing) this._step(dt);
    // llegada: la primera vez la lancha entra desde atrás de la cámara, con la proa levantada, y frena en su lugar
    const arr = this.arriving > 0 ? this.arriving * this.arriving : 0;
    this.boat.position.set(this.bx, this.by + Math.sin(this.time * 6) * 0.04, this.bz + arr * 8.5);
    this.boat.rotation.z = lerp(this.boat.rotation.z, -this.vx * 0.05, 1 - Math.exp(-8 * dt));
    this.boat.rotation.x = this.by > 0.05 || arr > 0.05 ? lerp(this.boat.rotation.x, 0.25, 1 - Math.exp(-6 * dt)) : lerp(this.boat.rotation.x, 0.04, 1 - Math.exp(-8 * dt));
    if (arr > 0.02 && Math.random() < 0.9) this.particles.burst(new THREE.Vector3(this.bx + rand(-0.6, 0.6), 0.15, this.bz + arr * 8.5 + 1.7), [0xffffff, 0xd8f6ff], 3, 2.2, 0.5, 2, 0.9);
    this.boat.visible = this.state !== "playing" || this.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0;
    this.hero.animate(this.time, "drive", 1);
    for (const t of this.things) {
      if (t.kind === "buoy") { t.mesh.position.y = 0.14 + Math.sin(this.time * 2.5 + t.ph) * 0.08; t.mesh.rotation.z = Math.sin(this.time * 1.7 + t.ph) * 0.12; }
      else if (t.kind === "coin") t.mesh.rotation.y += dt * 3;
    }
    // la estela
    if (playing && this.by <= 0.02 && Math.random() < 0.6) this.particles.burst(new THREE.Vector3(this.bx + rand(-0.5, 0.5), 0.15, this.bz + 1.7), [0xffffff, 0xd8f6ff], 2, 1.2, 0.5, 1, 0.8);
    // el agua y las orillas acompañan a la lancha; la textura se desliza
    this.water.position.z = this.bz - 60;
    this.shine.position.z = this.bz - 60;
    for (const sh of this.shores) sh.position.z = this.bz - 60;
    this.waterTex.offset.y = (-this.bz / 200) * 40 % 1;
    this.shineTex.offset.set((this.time * 0.02) % 1, ((-this.bz / 200) * 14 + this.time * 0.05) % 1);
    this.foamMat.opacity = 0.42 + Math.sin(this.time * 1.8) * 0.14;
    for (const d of this.decos) if (d.position.z > this.bz + 12) d.position.z -= this.decoStep * this.decos.length;
    this.backdrop.position.z = this.bz;
    // la estela sigue a la lancha pegada al agua (en el aire no hay estela) y su espuma corre hacia atrás
    const moving = playing || arr > 0.02;
    this.wake.visible = moving && this.by < 0.25;
    this.wake.position.set(this.bx, 0.035, this.boat.position.z + BOAT.length / 2 + 5.1);
    this.wake.material.opacity = 0.55 + Math.min(0.4, (this.speed - 12) / 40);
    this.flag.rotation.y = Math.sin(this.time * 9) * 0.35;
    this._placeCamera(dt);
  }

  _step(dt) {
    this.speed = Math.min(28, this.speed + dt * 0.35);
    this.motorSpeed = (this.speed - 12) / 16 + (this.by > 0.05 ? 0.35 : 0); // en el aire el motor se acelera
    this.bz -= this.speed * dt;
    this.dist += this.speed * dt;
    // dirección: dedo (posición), botones o flechas (velocidad)
    let tvx = ((this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)) * 9;
    if (this.pointerX != null) tvx = clamp((this.pointerX - this.bx) * 8, -11, 11);
    this.vx = lerp(this.vx, tvx, 1 - Math.exp(-10 * dt));
    this.bx = clamp(this.bx + this.vx * dt, -HALF, HALF);
    // salto (después de una ola-rampa)
    if (this.by > 0 || this.vy > 0) {
      this.vy -= 26 * dt;
      this.by = Math.max(0, this.by + this.vy * dt);
      if (this.by === 0 && this.vy < 0) { this.vy = 0; this.particles.burst(new THREE.Vector3(this.bx, 0.2, this.bz), [0xffffff, 0x9fe8ff], 16, 3, 0.5, 4); audio.playSplash(0.9); }
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.bz <= this.nextSpawn) this._spawn();
    for (const t of this.things) {
      if (t.done) continue;
      const dx = t.x - this.bx, dz = t.z - this.bz;
      if (Math.abs(dz) > 2.2) continue;
      if (t.kind === "coin") {
        const dy = t.y - (this.by + 0.8);
        if (dx * dx + dz * dz + dy * dy < 1.6) {
          t.done = true; t.mesh.visible = false; this.items++; this.score += 10;
          this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
          audio.playCollect();
          if (this.items % 10 === 0) { earnCoins(this.progress, 2); this.coinsEarned += 2; saveProgress(this.progress); }
        }
      } else if (t.kind === "ramp") {
        if (Math.abs(dx) < 1.4 && Math.abs(dz) < 1.2 && this.by === 0) {
          t.done = true; this.vy = 11; this.by = 0.01; this.jumps++; this.score += 40;
          this.banner("¡Al aire! 🌊"); audio.playJump(); this.haptic(25);
          this.glory(null, { slow: 0.5, hold: 0.5, zoom: 0.12, sound: false });
        }
      } else if (this.by < 0.6 && dx * dx + dz * dz < (t.r + 0.75) ** 2) {
        t.done = true;
        this._hit(t.kind === "rock" ? "¡Una roca de chocolate!" : "¡Chocaste una boya!");
        if (this.state !== "playing") return;
      }
    }
    for (let i = this.things.length - 1; i >= 0; i--) if (this.things[i].z > this.bz + 8) { this.scene.remove(this.things[i].mesh); this.things.splice(i, 1); }
    this.meterEnergy("metros", this.dist, 250); // 1 de energía cada 250 m
    if (Math.floor(this.dist / 500) > Math.floor((this.dist - this.speed * dt) / 500)) { this.banner(`🚤 ¡${Math.floor(this.dist / 500) * 500} m!`); audio.playPowerup(); this.score += 100; }
    this._updateHud();
  }

  _placeCamera(dt) {
    const tx = this.bx * 0.6;
    const cx = dt ? lerp(this.camera.position.x, tx, 1 - Math.exp(-5 * dt)) : tx;
    this.camera.position.set(cx, 3.6 + this.by * 0.4, this.bz + 7.2);
    this.camera.lookAt(this.bx * 0.4, 0.6 + this.by * 0.3, this.bz - 8);
    if (this.sun) { this.sun.position.set(this.bx + 6, 14, this.bz + 4); this.sun.target.position.set(this.bx, 0, this.bz - 6); }
  }
}
