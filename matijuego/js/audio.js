// Efectos de sonido generados con Web Audio API, música (canciones de assets/music o generada) y el volumen de cada una.

let ctx = null;
let master = null;
let musicBus = null; // salida de la música generada (separada de los efectos, para su propio volumen)

// ---------- volumen (lo elige cada familia en "🔊 Sonido": se guarda en el celular, no en el perfil) ----------
// Música y efectos van de 0 a 100. El oído percibe el volumen al cuadrado: así la mitad de la barra suena a "la mitad".
// Parten más bajos que antes (la dueña: "suena fuerte el juego").
const VOL_KEY = "matichoc_sonido";
const VOL_DEFAULT = { music: 60, sfx: 70, muted: false };
const vol = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(VOL_KEY) || "null") || {};
    const n = (x, d) => (Number.isFinite(+x) ? Math.max(0, Math.min(100, Math.round(+x))) : d);
    return { music: n(v.music, VOL_DEFAULT.music), sfx: n(v.sfx, VOL_DEFAULT.sfx), muted: v.muted === true };
  } catch (e) { return { ...VOL_DEFAULT }; }
})();
const curve = (v) => (v / 100) ** 2;
const MASTER = 0.8; // volumen de siempre de los efectos (y de la música generada) con la barra al 100
let muted = vol.muted;
function saveVol() {
  try { localStorage.setItem(VOL_KEY, JSON.stringify({ music: vol.music, sfx: vol.sfx, muted })); } catch (e) { /* sin almacenamiento */ }
}

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    // Salida común: un filtro que recorta los agudos (las ondas cuadradas y de sierra "chillan" en el parlante del celular)
    // y un limitador suave para que ningún efecto suene más fuerte que el resto.
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 2600;
    soft.Q.value = 0.4;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = MASTER * curve(vol.sfx);
    master.connect(soft);
    musicBus = ctx.createGain();
    musicBus.gain.value = MASTER * curve(vol.music);
    musicBus.connect(soft);
    soft.connect(limiter);
    limiter.connect(ctx.destination);
  }
  return ctx;
}

/** Dónde se conecta todo lo que suena (la salida común de arriba). */
function out() {
  getCtx();
  return master;
}

function tone(freq, duration, type = "sine", startGain = 0.18, delay = 0) {
  if (muted) return;
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = startGain;
  osc.connect(gain);
  gain.connect(out());
  const t0 = audio.currentTime + delay;
  gain.gain.setValueAtTime(startGain, t0); // si suena más adelante (delay), parte con su volumen y recién ahí se apaga
  osc.start(t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.stop(t0 + duration + 0.02);
}

export function setMuted(value) {
  muted = !!value;
  saveVol();
  if (muted) { stopSchedulers(); pauseSong(); stopWorld(true); }
  else if (currentTheme) startMusic(currentTheme);
}

/** Volumen de la música y de los efectos (0 a 100). */
export function getVolume() {
  return { music: vol.music, sfx: vol.sfx };
}

/** Cambia el volumen de "music" o "sfx" (0 a 100), se escucha al tiro y queda guardado en el celular. */
export function setVolume(kind, value) {
  if (kind !== "music" && kind !== "sfx") return;
  vol[kind] = Math.max(0, Math.min(100, Math.round(+value || 0)));
  saveVol();
  if (!ctx) return; // todavía no suena nada: se aplica al crear el audio
  const t = ctx.currentTime;
  const ramp = (g, to) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(to, t + 0.08); };
  if (kind === "sfx") ramp(master, MASTER * curve(vol.sfx));
  else {
    ramp(musicBus, MASTER * curve(vol.music));
    if (songGain && songEl && !songEl.paused) ramp(songGain, songTarget());
    else if (songEl && !songGain) songEl.volume = songTarget();
  }
}

export function isMuted() {
  return muted;
}

export function playCollect() {
  tone(880, 0.09, "triangle");
  tone(1320, 0.11, "triangle", 0.12, 0.05);
  tone(1760, 0.16, "sine", 0.045, 0.05); // un brillito que queda sonando
}

export function playMissionComplete() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "square", 0.14, i * 0.1));
}

// Lo último que sonó al terminar una partida ("lose" o "victory") y cuándo: con eso el Matichico sabe cómo le fue
// y celebra o se anima (ver Game3D.finish en three-kit.js), sin que cada juego tenga que decírselo.
let lastCue = null;
let lastCueAt = 0;
const cue = (kind) => { lastCue = kind; lastCueAt = typeof performance !== "undefined" ? performance.now() : 0; };
/** "lose" | "victory" si sonó hace poco (menos de `ms`); si no, null. */
export function recentCue(ms = 4000) {
  return lastCue && typeof performance !== "undefined" && performance.now() - lastCueAt < ms ? lastCue : null;
}

export function playLose() {
  cue("lose");
  // dos notas que se caen ("oooh..."), más redondas que la sierra de antes
  sweep(330, 262, 0.3, "triangle", 0.11);
  sweep(262, 185, 0.46, "triangle", 0.1, 0.24);
  tone(131, 0.5, "sine", 0.06, 0.24);
}

export function playVictory() {
  cue("victory");
  // la escalerita de siempre, ahora con la octava de abajo y un acorde que queda sonando al final
  [523, 659, 784, 1046, 1318].forEach((f, i) => { tone(f, 0.3, "square", 0.11, i * 0.12); tone(f / 2, 0.3, "triangle", 0.07, i * 0.12); });
  [1046, 1318, 1568].forEach((f) => tone(f, 0.75, "triangle", 0.045, 0.6));
}

export function playBump() {
  tone(120, 0.08, "square", 0.1);
}

export function playBounce() {
  sweep(240, 110, 0.11, "sine", 0.16); // el golpe sordo del bote
  tone(300, 0.06, "sine", 0.13);
  tone(520, 0.09, "sine", 0.11, 0.05);
}

export function playJump() {
  // un "boing" que sube de un tirón (antes eran dos notas cuadradas)
  sweep(340, 780, 0.17, "triangle", 0.2);
  sweep(680, 1400, 0.12, "sine", 0.05, 0.03);
}

export function playBonusCollect() {
  [660, 880, 1100, 1320, 1568].forEach((f, i) => tone(f, 0.16, "triangle", 0.15, i * 0.06));
}

export function playPurchase() {
  tone(523, 0.1, "triangle", 0.15);
  tone(784, 0.14, "triangle", 0.13, 0.08);
}

export function playShoot() {
  tone(520, 0.07, "square", 0.1);
  tone(210, 0.1, "sawtooth", 0.1, 0.02);
}

export function playHitEnemy() {
  tone(660, 0.05, "triangle", 0.14);
}

export function playHeadshot() {
  tone(880, 0.06, "triangle", 0.16);
  tone(1320, 0.1, "triangle", 0.14, 0.05);
}

export function playPop() {
  tone(400, 0.05, "sine", 0.18);
  tone(800, 0.08, "triangle", 0.14, 0.04);
  tone(1200, 0.1, "triangle", 0.1, 0.09);
}

export function playHurt() {
  sweep(330, 165, 0.2, "triangle", 0.25); // "¡ay!": una nota que se cae
  tone(110, 0.22, "square", 0.07, 0.06);
}

export function playReload() {
  tone(300, 0.05, "square", 0.08);
  tone(450, 0.06, "square", 0.08, 0.35);
}

export function playWave() {
  [392, 523, 659].forEach((f, i) => tone(f, 0.18, "triangle", 0.14, i * 0.1));
}

// ---------- efectos extra ----------

function noise(duration, gainV = 0.12, lowpass = 1800, delay = 0) {
  if (muted) return;
  const audio = getCtx();
  const len = Math.floor(audio.sampleRate * duration);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const gain = audio.createGain();
  gain.gain.value = gainV;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out());
  src.start(audio.currentTime + delay);
}

export function playCrash() {
  noise(0.35, 0.2, 1400);
  tone(110, 0.25, "sawtooth", 0.1);
  sweep(260, 90, 0.28, "sine", 0.18); // el golpe
  swish(0.2, 0.5, 2300, 700, { q: 0.7 }); // lo que salta
}

export function playWhoosh() {
  swish(0.3, 0.22, 520, 2200, { q: 1.1, attack: 0.1 }); // un soplido que sube (antes era ruido parejo)
}

/** Subida de tono según el combo (1, 2, 3...). */
export function playCombo(n = 1) {
  const base = 520 * Math.pow(1.0595, Math.min(n, 12) * 2);
  tone(base, 0.08, "triangle", 0.14);
  tone(base * 1.5, 0.1, "triangle", 0.11, 0.05);
}

export function playPowerup() {
  [392, 523, 659, 880].forEach((f, i) => tone(f, 0.12, "square", 0.1, i * 0.05));
}

/** Bocina del auto (dos notitas). */
export function playHorn() {
  tone(392, 0.18, "square", 0.12);
  tone(330, 0.18, "square", 0.1, 0.0);
  tone(392, 0.25, "square", 0.12, 0.22);
  tone(330, 0.25, "square", 0.1, 0.22);
}

export function playCountdown(go = false) {
  tone(go ? 880 : 440, go ? 0.3 : 0.12, "square", 0.13);
}

/** Sonidito suave del sello de inicio (si el aparato todavía no deja sonar, simplemente no suena). */
export function playIntro() {
  try {
    if (muted) return;
    // en el navegador el sonido solo se permite después de tocar la pantalla; en la app (Capacitor) sí suena de entrada
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive && !window.Capacitor) return;
    const c = getCtx();
    if (c.state === "suspended") c.resume();
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.9, "sine", 0.1, 0.25 + i * 0.16));
    tone(1046, 1.2, "triangle", 0.06, 1.0);
  } catch (e) { /* sin audio */ }
}

/**
 * Saltos de Porristas: un tiempo de la música de la rutina (la marca el juego, así los toques calzan con lo que suena).
 * Bombo en cada tiempo, aplauso en el 2 y el 4, bajo que sigue los acordes (do, sol, la menor, fa) y una campanita
 * cuando en ese tiempo hay que tocar.
 */
const CHEER_PROG = [0, 7, 9, 5];
export function playCheerBeat(beat, cue = false, delay = 0) {
  if (muted) return;
  try {
    tone(62, 0.16, "sine", 0.32, delay); // bombo
    if (beat % 2 === 1) noise(0.09, 0.13, 2600, delay); // aplauso
    const root = 48 + CHEER_PROG[Math.floor(beat / 2) % 4];
    tone(MIDI(root), 0.32, "triangle", 0.13, delay);
    if (beat % 2 === 0) [0, 4, 7].forEach((st) => tone(MIDI(root + 12 + st + (CHEER_PROG[Math.floor(beat / 2) % 4] === 9 && st === 4 ? -1 : 0)), 0.22, "sine", 0.035, delay));
    if (cue) { tone(1318, 0.14, "triangle", 0.1, delay); tone(1760, 0.18, "triangle", 0.07, delay + 0.04); }
  } catch (e) { /* sin audio */ }
}

/** Cuánto tarda en oírse lo que suena (el celular lo informa; 0 si no se sabe o aún no hay audio). */
export function latency() {
  if (!ctx) return 0;
  return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
}

/** Golpe de cine para los momentos de gloria (gol, canasta, hoyo en uno): un bombo grave, un soplido y un brillo que sube. */
export function playGlory(delay = 0) {
  if (muted) return;
  tone(70, 0.55, "sine", 0.5, delay);
  tone(105, 0.4, "sine", 0.25, delay);
  sweep(250, 115, 0.2, "triangle", 0.16, delay); // el mismo golpe, a una altura que el parlante del celular sí alcanza
  noise(0.45, 0.1, 5200, delay);
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, "triangle", 0.1, delay + 0.1 + i * 0.07));
}

/** La cortina de chocolate al cambiar de pantalla (js/curtain.js): un chorro grave y cortito, apenas se nota. */
export function playCurtain() {
  if (muted) return;
  noise(0.3, 0.05, 620);
  tone(132, 0.2, "sine", 0.09);
  tone(98, 0.26, "sine", 0.08, 0.07);
}

export function playStar() {
  [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, "triangle", 0.13, i * 0.08));
}

// ---------- música de fondo (generada, sin archivos) ----------
// Un bajo y una melodía cortitos que se repiten, distintos para cada tipo de juego.

const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
const THEMES = {
  // bpm, nota base, escala (semitonos), progresión de acordes (grados), onda de la melodía, brillo (0..1)
  arcade: { bpm: 128, root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4], wave: "square", lead: 0.7, seed: 11 },
  race: { bpm: 150, root: 57, scale: [0, 3, 5, 7, 10], prog: [0, 0, 5, 3], wave: "sawtooth", lead: 0.55, seed: 23 },
  puzzle: { bpm: 112, root: 62, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 0], wave: "triangle", lead: 0.9, seed: 37 },
  sport: { bpm: 120, root: 64, scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 3], wave: "square", lead: 0.6, seed: 41 },
  chill: { bpm: 96, root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4], wave: "triangle", lead: 0.8, seed: 53 },
  adventure: { bpm: 136, root: 55, scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 3], wave: "square", lead: 0.65, seed: 67 },
};
THEMES.cozy = THEMES.chill; // cocina y puzzles: suena igual que "chill" hasta que esté su canción (cocina)
THEMES.cave = THEMES.chill; // mundos tranquilos de Aventura Choco (con canción: la de aventura)
THEMES.castle = THEMES.sport; // Castillo Dulce de Aventura Choco (con canción: la de aventura)
const CHORD_ROOTS = [0, 2, 4, 5, 7, 9, 11];

let currentTheme = null;
let timer = null;
let nextT = 0;
let step = 0;
let musicGain = null;
let tracks = null;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arma de antemano la melodía de 16 compases (64 pasos de corchea x2) para que suene "compuesta" y se repita. */
function composeTrack(th) {
  const r = rng(th.seed);
  const lead = [];
  let idx = 2;
  for (let bar = 0; bar < 16; bar++) {
    for (let st = 0; st < 8; st++) {
      const strong = st % 4 === 0;
      if (!strong && r() > th.lead) { lead.push(null); continue; }
      const move = Math.floor(r() * 3) - 1;
      idx = Math.max(0, Math.min(th.scale.length * 2 - 1, idx + move + (r() < 0.12 ? 2 : 0)));
      lead.push(idx);
    }
  }
  return lead;
}

function noteAt(th, degreeIdx) {
  const oct = Math.floor(degreeIdx / th.scale.length);
  return th.root + 12 + oct * 12 + th.scale[degreeIdx % th.scale.length];
}

function playNote(freq, t0, dur, type, gainV, dest) {
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainV, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function schedule() {
  if (!currentTheme || muted) return;
  const audio = getCtx();
  const th = THEMES[currentTheme];
  const stepDur = 60 / th.bpm / 2; // corchea
  while (nextT < audio.currentTime + 0.35) {
    const bar = Math.floor(step / 8) % 16;
    const st = step % 8;
    const chordDeg = th.prog[Math.floor(bar / 1) % th.prog.length];
    const chordRoot = th.root - 12 + th.scale[chordDeg % th.scale.length];
    // bajo: raíz en 1 y 3, quinta en 2 y 4 (con pausitas)
    if (st % 2 === 0) playNote(MIDI(chordRoot + (st === 4 ? 7 : 0)), nextT, stepDur * 1.7, "triangle", 0.5, musicGain);
    // melodía
    const li = tracks.lead[(bar * 8 + st) % tracks.lead.length];
    if (li != null) playNote(MIDI(noteAt(th, li)), nextT, stepDur * 1.5, th.wave, 0.22, musicGain);
    // percusión simple
    if (st % 4 === 0) playNote(60, nextT, 0.08, "sine", 0.6, musicGain);
    if (st % 2 === 1) playNote(MIDI(84), nextT, 0.03, "triangle", 0.05, musicGain);
    nextT += stepDur;
    step++;
  }
}

function stopSchedulers() {
  if (timer) { clearInterval(timer); timer = null; }
  if (musicGain) { try { musicGain.disconnect(); } catch (e) { /* nada */ } musicGain = null; }
}

// ---------- canciones (archivos en assets/music/, hechas con Suno: ver docs/MUSICA-SUNO.md) ----------
// Cada tema de música usa una canción. Si la canción todavía no está en SONG_FILES, suena la música generada de arriba
// (y el menú queda en silencio, como antes). Las canciones suenan con un elemento <audio> (no se decodifican enteras
// en memoria: importa en celulares baratos) que pasa por un volumen propio de Web Audio (en iPhone el volumen del
// <audio> no se puede cambiar).

const SONG_OF = { menu: "menu", chill: "pueblo", cave: "aventura", castle: "aventura", cozy: "cocina", puzzle: "cocina", sport: "deportes", adventure: "aventura", race: "aventura", arcade: "aventura" };
const SONG_FILES = new Set(["menu", "pueblo", "deportes", "aventura", "cocina"]); // canciones que ya están en assets/music/<nombre>.m4a
const SONG_VOLUME = 0.5; // con la barra de música al 100 (las canciones vienen a −18 LUFS: así quedan debajo de los efectos)
let boost = 1; // cuánto sube la música en los momentos fuertes (1 = lo de siempre; ver setTension)
const songTarget = () => SONG_VOLUME * curve(vol.music) * boost;
const genTarget = () => (0.06 / MASTER) * boost; // lo mismo para la música generada
const FADE = 0.6; // segundos de fundido al entrar y al salir

// La música partía 3 o 4 segundos tarde (prueba en el celular, 28-nov-2026): la canción recién se empezaba a cargar en el
// momento de sonar, se volvía a cargar en cada cambio (menú → juego → menú) y en la app esperaba un toque que ahí no hace
// falta. Ahora hay un <audio> por canción, que queda cargado de antemano (la del menú apenas abre el juego; la de cada
// juego, mientras se lee su tarjeta de inicio: ver prepareMusic) y solo se pausa y se reanuda; el fundido de entrada es
// corto, y en la app la música parte al abrir, sin esperar el primer toque.
// Además, la música ya no espera a que empiece la partida: suena desde que se va el sello de inicio (con la entrada del
// monito) y, en cada juego, desde que se abre (su tarjeta de inicio, la cámara que se acerca a la fuente del Pueblo…).
let songEl = null; // el <audio> de la canción que suena (o de la última que sonó)
let songGain = null; // su volumen propio (Web Audio)
let songName = null;
let wantedSong = null; // la que debería estar sonando (se retoma al volver a la app o al primer toque)
const songs = {}; // nombre → { name, el, gain, wired }
const FADE_IN = 0.25; // segundos de fundido cuando una canción parte desde el silencio
let onHold = false; // mientras suena el sello de inicio (js/splash.js) la música espera

function songFor(theme) {
  const s = SONG_OF[theme];
  return s && SONG_FILES.has(s) ? s : null;
}

/** ¿Ya hubo un toque? Antes de eso el navegador no deja sonar nada (ni crear el audio sin un aviso en la consola). */
function touched() {
  const ua = typeof navigator !== "undefined" && navigator.userActivation;
  return !ua || ua.hasBeenActive;
}

// En la app (Capacitor) el navegador interno deja sonar sin esperar un toque: la música del menú parte al abrir.
const NATIVE_APP = (() => {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
})();
const canSound = () => NATIVE_APP || touched();

/** Deja una canción cargando, sin sonar (no necesita toque ni crea todavía el audio de los efectos). */
function loadSong(name) {
  if (songs[name]) return songs[name];
  const el = new Audio();
  el.loop = true;
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  el.src = `assets/music/${name}.m4a`;
  try { el.load(); } catch (e) { /* se carga sola al pedirle que suene */ }
  return (songs[name] = { name, el, gain: null, wired: false });
}

/** Conecta la canción a su volumen propio (en iPhone el volumen del <audio> no se puede cambiar). Se hace recién al sonar. */
function wire(song) {
  if (song.wired) return;
  song.wired = true;
  try {
    const audio = getCtx();
    song.gain = audio.createGain();
    song.gain.gain.value = 0;
    audio.createMediaElementSource(song.el).connect(song.gain);
    song.gain.connect(audio.destination); // directo a la salida: el filtro de agudos de los efectos apagaría la canción
  } catch (e) {
    song.gain = null; // sin Web Audio: se usa el volumen del propio elemento
    song.el.volume = songTarget();
  }
}

function fadeGain(gain, to, secs = FADE) {
  if (!gain) return;
  const t = getCtx().currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(to, t + secs);
}

/** Apaga una canción con un fundido y la deja en pausa (queda cargada y en su lugar: al volver sigue donde iba). */
function quiet(song) {
  if (!song || song.el.paused) return;
  if (!song.gain) { song.el.pause(); return; }
  fadeGain(song.gain, 0);
  setTimeout(() => { if (wantedSong !== song.name || muted) song.el.pause(); }, FADE * 1000 + 50);
}

function playSong(name) {
  wantedSong = name;
  const song = loadSong(name); // (si todavía no puede sonar, al menos queda cargando)
  if (muted || onHold || !canSound() || (typeof document !== "undefined" && document.visibilityState === "hidden")) return; // parte después
  if (songName && songName !== name) quiet(songs[songName]);
  wire(song);
  songName = name;
  songEl = song.el;
  songGain = song.gain;
  const audio = getCtx();
  if (audio.state === "suspended") audio.resume();
  const fromSilence = song.el.paused;
  if (fromSilence && song.gain) { song.gain.gain.cancelScheduledValues(audio.currentTime); song.gain.gain.value = 0; }
  const p = song.el.play();
  if (p && p.catch) p.catch(() => { /* se reintenta con el próximo toque (ver abajo) */ });
  fadeGain(song.gain, songTarget(), fromSilence ? FADE_IN : FADE);
}

function pauseSong() {
  if (songName) quiet(songs[songName]);
}

/**
 * El sello de inicio tiene su propio sonido: mientras está en pantalla la música espera (`on` = true) y parte apenas se
 * va (`on` = false), junto con la entrada del monito.
 */
export function holdMusic(on) {
  onHold = !!on;
  if (onHold) pauseSong();
  else if (wantedSong) playSong(wantedSong);
}

if (typeof document !== "undefined") {
  // la canción del menú se va cargando apenas abre el juego
  if (!muted && songFor("menu")) loadSong(songFor("menu"));
  // App en segundo plano (llamada, cambio de app): la canción se calla y vuelve al regresar
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopWorld(true); // olas, motores y tic-tac se callan al tiro
    if (!wantedSong) return;
    if (document.visibilityState === "hidden") { if (songEl) songEl.pause(); }
    else playSong(wantedSong);
  });
  // Antes del primer toque el navegador no deja sonar nada: la canción que quedó esperando parte ahí
  document.addEventListener("pointerdown", () => {
    if (wantedSong && (!songEl || songEl.paused || songName !== wantedSong)) playSong(wantedSong);
  }, true);
}

/** Empieza (o cambia) la música de fondo. Se llama desde un gesto del usuario (el botón de jugar). */
export function startMusic(name) {
  const song = songFor(name);
  if (!song && !THEMES[name]) {
    // tema sin canción ni música generada (el menú, mientras no esté su canción): silencio
    currentTheme = null;
    stopSchedulers();
    wantedSong = null;
    pauseSong();
    return;
  }
  currentTheme = name;
  if (muted) return;
  if (song) {
    stopSchedulers();
    playSong(song);
    return;
  }
  wantedSong = null;
  pauseSong();
  stopSchedulers();
  const audio = getCtx();
  if (audio.state === "suspended") audio.resume();
  musicGain = audio.createGain();
  musicGain.gain.value = genTarget();
  musicGain.connect(musicBus); // (musicBus ya lleva el volumen de la música: con la barra al 100 suena como siempre)
  tracks = { lead: composeTrack(THEMES[name]) };
  step = 0;
  nextT = audio.currentTime + 0.1;
  timer = setInterval(schedule, 90);
  schedule();
}

export function stopMusic() {
  currentTheme = null;
  stopSchedulers();
  wantedSong = null;
  pauseSong();
}

// ---------- piezas para los efectos más ricos ----------

let noiseBuf = null;
/** Dos segundos de ruido blanco: se crean una sola vez y sirven para todos los soplidos, olas y aplausos. */
function whiteNoise() {
  const audio = getCtx();
  if (!noiseBuf || noiseBuf.sampleRate !== audio.sampleRate) {
    const len = Math.floor(audio.sampleRate * 2);
    noiseBuf = audio.createBuffer(1, len, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Tono que se desliza de una frecuencia a otra (golpes sordos, "boing", lamentos). Parte suave, sin chasquido. */
function sweep(f0, f1, duration, type = "sine", peak = 0.18, delay = 0) {
  if (muted) return;
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const t0 = audio.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(out());
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

/** Ruido por un filtro de banda que se mueve de f0 a f1: soplidos, chapuzones y aplausos. */
function swish(duration, peak, f0, f1, { q = 0.9, attack = 0.02, delay = 0 } = {}) {
  if (muted) return;
  const audio = getCtx();
  const t0 = audio.currentTime + delay;
  const src = audio.createBufferSource();
  src.buffer = whiteNoise();
  src.loop = true;
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = q;
  band.frequency.setValueAtTime(f0, t0);
  band.frequency.exponentialRampToValueAtTime(f1, t0 + duration);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(band);
  band.connect(gain);
  gain.connect(out());
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + duration + 0.05);
}

/** Chapuzón: el agua que salta (un soplido que baja), las gotas (uno que sube) y el golpe sordo de abajo. `size` de 0,5 a 1,5. */
export function playSplash(size = 1) {
  if (muted) return;
  swish(0.36 + 0.2 * size, 0.55 * size, 2300, 520, { q: 0.6, attack: 0.012 });
  swish(0.3, 0.2 * size, 900, 2300, { q: 1.2, attack: 0.06, delay: 0.06 });
  sweep(190, 80, 0.2, "sine", 0.2 * size);
}

/** La barra: el público que grita un gol o una canasta. `size` de 0,5 (un festejo corto) a 1,5 (gol de copa). */
export function playCheer(size = 1) {
  if (muted) return;
  const audio = getCtx();
  const t0 = audio.currentTime;
  const dur = 0.9 + 0.6 * size;
  // dos bandas de ruido (voces graves y agudas) que suben rápido, tiemblan como un grito de muchos y se apagan
  for (const [f, peak, q, rate] of [[700, 0.34, 0.9, 6.5], [1500, 0.19, 1.1, 8.3]]) {
    const src = audio.createBufferSource();
    src.buffer = whiteNoise();
    src.loop = true;
    const band = audio.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = q;
    band.frequency.setValueAtTime(f * 0.8, t0);
    band.frequency.linearRampToValueAtTime(f * 1.15, t0 + 0.25);
    band.frequency.linearRampToValueAtTime(f * 0.9, t0 + dur);
    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak * size, t0 + 0.16);
    env.gain.setValueAtTime(peak * size, t0 + 0.16 + dur * 0.25);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const trem = audio.createGain();
    trem.gain.value = 0.8;
    const lfo = audio.createOscillator();
    lfo.frequency.value = rate;
    const depth = audio.createGain();
    depth.gain.value = 0.2;
    lfo.connect(depth);
    depth.connect(trem.gain);
    src.connect(band);
    band.connect(env);
    env.connect(trem);
    trem.connect(out());
    src.start(t0, Math.random() * 1.5);
    lfo.start(t0);
    src.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
  }
}

/** Una palmada (ruido cortito y seco). */
export function playClap(delay = 0) {
  swish(0.08, 0.8, 1700, 1250, { q: 1.3, attack: 0.002, delay });
}

/** Acompaña la actuación del Matichico al terminar la partida (ver Game3D._finalAct en three-kit.js). */
export function playAct(mood) {
  if (muted) return;
  if (mood === "gran") {
    playCheer(1.2); // la barra
    swish(0.5, 0.26, 420, 1900, { q: 1.0, attack: 0.22, delay: 0.16 }); // la vuelta en el aire
    sweep(210, 90, 0.14, "sine", 0.2, 0.86); // cae
  } else if (mood === "bien") {
    playCheer(0.7);
    tone(784, 0.12, "triangle", 0.1, 0.05);
    tone(1047, 0.22, "triangle", 0.1, 0.17);
  } else if (mood === "justo") {
    for (let i = 0; i < 4; i++) playClap(0.12 + i * 0.26);
  } else if (mood === "animo") {
    // tres notas que suben justo cuando levanta el puño: "¡va-mos-ya!"
    tone(523, 0.12, "triangle", 0.11, 0.72);
    tone(659, 0.12, "triangle", 0.11, 0.84);
    tone(784, 0.28, "triangle", 0.12, 0.96);
  }
}

// ---------- mezcla de cine: la música se agacha antes del golpe y sube en los momentos fuertes ----------

/** La música baja de golpe a `depth` (0 a 1), se queda así `hold` segundos y vuelve en `release`: el silencio corto que
 * hace que el golpe de un gol se sienta más grande. No toca los efectos. */
export function duck(depth = 0.25, hold = 0.5, release = 0.7) {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const dip = (g, v) => {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v * depth, t + 0.07);
    g.setValueAtTime(v * depth, t + 0.07 + hold);
    g.linearRampToValueAtTime(v, t + 0.07 + hold + release);
  };
  if (songGain && songEl && !songEl.paused && wantedSong) dip(songGain.gain, songTarget()); // (si la canción ya se está apagando, no se toca)
  if (musicGain) dip(musicGain.gain, genTarget());
}

let tense = false; // quedan pocos segundos: la música sube y suena un tic-tac
let tenseNext = 0;
/** Apuro (quedan pocos segundos de la partida): la música sube un tercio y se suma un tic-tac suave. */
export function setTension(on) {
  on = !!on && !muted;
  if (on === tense) return;
  tense = on;
  boost = on ? 1.3 : 1;
  if (on) getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const go = (g, v) => { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + 0.5); };
  if (songGain && songEl && !songEl.paused && wantedSong) go(songGain.gain, songTarget()); // (si la canción ya se está apagando, no se toca)
  if (musicGain) go(musicGain.gain, genTarget());
  if (on) { tenseNext = t + 0.05; tick(); watchOn(); }
}

/** El tic-tac del apuro: se programa un poquito por adelantado para que no dependa del ritmo de los cuadros. */
function tick() {
  if (!tense || !ctx) return;
  const now = ctx.currentTime;
  if (tenseNext < now) tenseNext = now + 0.02;
  while (tenseNext < now + 0.45) {
    tone(1047, 0.04, "triangle", 0.08, tenseNext - now); // tic
    tone(784, 0.05, "triangle", 0.07, tenseNext - now + 0.375); // tac
    tenseNext += 0.75;
  }
}

// ---------- sonidos continuos del mundo: ambiente (olas, pájaros, grillos, público) y motor ----------
// El juego dice en cada cuadro qué debería estar sonando (ver `scene`). Si deja de decirlo (pausa, salida al menú, la app
// pasa a segundo plano), se apagan solos en menos de medio segundo: no puede quedar un motor sonando.

const W = { amb: null, eng: null, seen: 0, timer: null };

function loopNoise(audio) {
  const src = audio.createBufferSource();
  src.buffer = whiteNoise();
  src.loop = true;
  return src;
}

/** Arma el ambiente `name` y devuelve cómo apagarlo. Todo pasa por los efectos (su mismo volumen), bien abajo. */
function startAmb(name) {
  const audio = getCtx();
  const t = audio.currentTime;
  const bus = audio.createGain();
  bus.gain.setValueAtTime(0.0001, t);
  bus.gain.linearRampToValueAtTime(1, t + 0.9);
  bus.connect(out());
  const nodes = [];
  /** Ruido filtrado cuyo volumen sube y baja despacio (`rate` veces por segundo). */
  const bed = (type, freq, q, level, sway, rate) => {
    const src = loopNoise(audio);
    const f = audio.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = audio.createGain();
    g.gain.value = level;
    const lfo = audio.createOscillator();
    lfo.frequency.value = rate;
    const d = audio.createGain();
    d.gain.value = sway;
    lfo.connect(d);
    d.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 1.5);
    lfo.start(t);
    nodes.push(src, lfo);
  };
  let next = t + 0.8 + Math.random() * 1.5;
  let every = null; // lo que se repite cada tanto (pájaros, grillos)
  if (name === "playa") {
    bed("lowpass", 620, 0.5, 0.085, 0.055, 0.1); // la ola que viene y se va
    bed("bandpass", 1700, 0.8, 0.015, 0.013, 0.13); // la espuma
  } else if (name === "estadio") {
    bed("bandpass", 780, 0.5, 0.055, 0.022, 0.21); // el murmullo del público
  } else if (name === "dia") {
    // pájaros: cada tanto, dos a cuatro silbidos cortos que suben
    every = (now) => {
      if (now < next) return;
      const f = 1500 + Math.random() * 700, n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) sweep(f * (1 + k * 0.04), f * 1.3, 0.07, "sine", 0.045, k * 0.1);
      next = now + 2.2 + Math.random() * 4.5;
    };
  } else if (name === "noche") {
    // grillos: tres chirridos seguidos, cada segundo y algo
    every = (now) => {
      if (now < next) return;
      const f = 2150 + Math.random() * 200;
      for (let k = 0; k < 3; k++) sweep(f, f * 1.02, 0.035, "sine", 0.032, k * 0.065);
      next = now + 0.9 + Math.random() * 0.7;
    };
  }
  return {
    name,
    tick() { if (every) every(audio.currentTime); },
    stop(fast) {
      const now = audio.currentTime, fade = fast ? 0.04 : 0.45;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0.0001, now + fade);
      for (const n of nodes) { try { n.stop(now + fade + 0.05); } catch (e) { /* ya estaba detenido */ } }
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* nada */ } }, (fade + 0.2) * 1000);
    },
  };
}

// motor: nota grave (sube con la velocidad), cuánto se abre el filtro, el "puf-puf" (veces por segundo) y el volumen
const ENGINES = {
  lancha: { f: [78, 124], cut: 650, puff: [13, 24], depth: 0.5, level: 0.038 },
  avioneta: { f: [104, 150], cut: 900, puff: [28, 44], depth: 0.42, level: 0.032 },
  auto: { f: [70, 150], cut: 560, puff: [9, 9], depth: 0.14, level: 0.03 },
};

function startEng(kind) {
  const E = ENGINES[kind];
  if (!E) return null;
  const audio = getCtx();
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = E.f[0];
  const lp = audio.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = E.cut;
  const am = audio.createGain();
  am.gain.value = 1 - E.depth;
  const lfo = audio.createOscillator();
  lfo.frequency.value = E.puff[0];
  const d = audio.createGain();
  d.gain.value = E.depth;
  const vol = audio.createGain();
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.linearRampToValueAtTime(E.level, t + 0.5);
  lfo.connect(d);
  d.connect(am.gain);
  osc.connect(lp);
  lp.connect(am);
  am.connect(vol);
  vol.connect(out());
  osc.start(t);
  lfo.start(t);
  return {
    kind,
    /** `speed` de 0 a 1: sube la nota, el ritmo del "puf-puf" y un poco el volumen. */
    set(speed) {
      const s = Math.max(0, Math.min(1, speed || 0)), now = audio.currentTime;
      osc.frequency.setTargetAtTime(E.f[0] + (E.f[1] - E.f[0]) * s, now, 0.12);
      lfo.frequency.setTargetAtTime(E.puff[0] + (E.puff[1] - E.puff[0]) * s, now, 0.12);
      vol.gain.setTargetAtTime(E.level * (0.75 + 0.25 * s), now, 0.15);
    },
    stop(fast) {
      const now = audio.currentTime, fade = fast ? 0.04 : 0.3;
      vol.gain.cancelScheduledValues(now);
      vol.gain.setValueAtTime(vol.gain.value, now);
      vol.gain.linearRampToValueAtTime(0.0001, now + fade);
      try { osc.stop(now + fade + 0.05); lfo.stop(now + fade + 0.05); } catch (e) { /* ya estaba detenido */ }
      setTimeout(() => { try { vol.disconnect(); } catch (e) { /* nada */ } }, (fade + 0.2) * 1000);
    },
  };
}

function stopWorld(fast = false) {
  if (W.amb) { W.amb.stop(fast); W.amb = null; }
  if (W.eng) { W.eng.stop(fast); W.eng = null; }
  setTension(false);
}

function watchOn() {
  if (!W.timer) W.timer = setInterval(watch, 200);
}

function watch() {
  if (W.amb) W.amb.tick();
  tick();
  if (typeof performance !== "undefined" && performance.now() - W.seen > 450) stopWorld();
  if (!W.amb && !W.eng && !tense) { clearInterval(W.timer); W.timer = null; }
}

/**
 * Lo que debería estar sonando de fondo en este cuadro (lo llama el juego en cada cuadro: ver Game3D._loop):
 * `amb` = ambiente ("playa" | "estadio" | "dia" | "noche" | null) · `motor` = "lancha" | "avioneta" | "auto" | null, con
 * su `speed` de 0 a 1 · `hurry` = quedan pocos segundos (la música sube y suena un tic-tac).
 */
export function scene(amb = null, motor = null, speed = 0, hurry = false) {
  try {
    if (muted || !touched() || (typeof document !== "undefined" && document.visibilityState === "hidden")) { amb = null; motor = null; hurry = false; }
    W.seen = typeof performance !== "undefined" ? performance.now() : 0;
    if ((W.amb ? W.amb.name : null) !== amb) {
      if (W.amb) W.amb.stop();
      W.amb = amb ? startAmb(amb) : null;
    }
    if ((W.eng ? W.eng.kind : null) !== motor) {
      if (W.eng) W.eng.stop();
      W.eng = motor ? startEng(motor) : null;
    }
    if (W.eng) W.eng.set(speed);
    setTension(hurry);
    if (W.amb || W.eng || tense) watchOn();
  } catch (e) { /* sin audio: el juego sigue igual */ }
}
