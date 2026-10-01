import {
  GRID, SKIN_CELL, COLORS, MOUTH_ORIGIN, MOUTHS, mouthForVisemes, EYE_BOXES, eyePixels,
  BROW_BOX, browPixels, EAR_TIPS, PONYTAIL, THINK_DOTS, EXPRESSIONS, STATES,
} from './sprite/frames.js';
import { BrowserTTS } from './conversation/speech.js';
import { AudioLipSync } from './lipsync/AudioLipSync.js';
import { TimelineLipSync } from './lipsync/TimelineLipSync.js';
import { parseExpressionTags } from './conversation/LudoConversation.js';

const DEFAULT_SRC = new URL('./sprite/ludo.webp', import.meta.url).href;
const rand = (a, b) => a + Math.random() * (b - a);
const SKIN_RGB = [240, 213, 138];

/**
 * Ludo en pixel-art animé : le sprite d'origine, dont la bouche, les yeux,
 * le sourcil, les oreilles, la couette et la tête sont animés pixel par pixel.
 *
 *   const ludo = new LudoSprite(document.getElementById('ludo'));
 *   await ludo.ready;
 *   await ludo.speak("[happy] Salut, moi c'est Ludo !");
 */
export class LudoSprite extends EventTarget {
  constructor(container, {
    src = DEFAULT_SRC,
    lang = 'fr-FR',
    tts = null,
    followPointer = true,
    fps = 30,
  } = {}) {
    super();
    this.container = container;
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      display: 'block', height: '100%', maxWidth: '100%', margin: '0 auto',
    });
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.tts = tts ?? new BrowserTTS({ lang });
    this.audioLipSync = new AudioLipSync();
    this.frameInterval = 1 / fps;

    // État d'animation
    this.state = 'idle';
    this.expression = 'neutral';
    this._exprTimer = 0;
    this.lipSync = null;
    this.manualVisemes = null;
    this.time = 0;
    this._acc = 0;
    this._mouth = 'closed';
    this._mouthHold = 0;
    this._volume = 0;
    this._blinkT = -1;
    this._nextBlink = rand(1.5, 4);
    this._gaze = { x: 0, y: 0 };
    this._saccade = { x: 0, y: 0 };
    this._nextSaccade = rand(1, 3);
    this.lookTarget = null;
    this._flick = { left: 0, right: 0 };
    this._nextFlick = rand(3, 7);
    this._emphasis = 0;

    this.ready = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this._init(img); resolve(this); };
      img.onerror = () => reject(new Error(`Impossible de charger le sprite : ${src}`));
      img.src = src;
    });

    if (followPointer) {
      this._onPointer = (e) => {
        const r = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1;
        const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
        this.lookAt(x, y);
        clearTimeout(this._lookTimeout);
        this._lookTimeout = setTimeout(() => this.lookAt(null), 2500);
      };
      window.addEventListener('pointermove', this._onPointer);
    }
  }

  _init(img) {
    this.img = img;
    const S = img.naturalWidth;
    this.size = S;
    this.k = (GRID.size * S) / 1024;
    this._crop = Math.ceil(this.k);
    this.canvas.width = S;
    this.canvas.height = S - this._crop;
    this.canvas.style.aspectRatio = `${S} / ${S - this._crop}`;
    this.work = document.createElement('canvas');
    this.work.width = this.work.height = S;
    this.wctx = this.work.getContext('2d');
    this.tmp = document.createElement('canvas');
    this.tmp.width = this.tmp.height = S;
    this.tctx = this.tmp.getContext('2d');
    for (const c of [this.ctx, this.wctx, this.tctx]) c.imageSmoothingEnabled = false;
    this._skinMap = this._buildSkinMap();
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this._acc += dt;
      if (this._acc >= this.frameInterval) {
        this.update(this._acc);
        this._acc = 0;
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ API publique
  /** idle | listening | thinking | speaking */
  setState(state) {
    if (!STATES.includes(state)) throw new Error(`État inconnu : ${state}`);
    if (state === this.state) return;
    this.state = state;
    if (state === 'listening') this.twitchEar('both');
    this.dispatchEvent(new CustomEvent('state', { detail: { state } }));
  }

  /** neutral | happy | sad | surprised | angry | thinking | wink | smug */
  setExpression(name, { duration = 0 } = {}) {
    if (!EXPRESSIONS[name]) throw new Error(`Expression inconnue : ${name}`);
    this.expression = name;
    this._exprTimer = duration;
    this.dispatchEvent(new CustomEvent('expression', { detail: { name } }));
  }

  /** Source de lip-sync ({ sample() → { visemes, volume } }) ou null. */
  setLipSync(source) {
    this.lipSync = source;
  }

  /** Impose des visèmes, ex. { aa: 1 } ; null pour rendre la main. */
  setVisemes(weights) {
    this.manualVisemes = weights;
  }

  /** Regard vers (x, y) ∈ [-1, 1] (repère écran), null = regard autonome. */
  lookAt(x, y) {
    this.lookTarget = x == null ? null : { x, y };
  }

  blink() {
    this._blinkT = 0;
  }

  /** 'left' | 'right' | 'both' (côtés à l'écran) */
  twitchEar(side = Math.random() < 0.5 ? 'left' : 'right') {
    if (side === 'both' || side === 'L' || side === 'R') {
      if (side !== 'R') this._flick.left = 0.16;
      if (side !== 'L') this._flick.right = 0.16;
    } else this._flick[side] = 0.16;
  }

  /** Fait parler Ludo (balises [expression] acceptées). */
  async speak(text) {
    for (const seg of parseExpressionTags(text)) {
      if (seg.expression) this.setExpression(seg.expression);
      if (seg.text) await this.tts.speak(seg.text, this);
    }
  }

  /** Joue un audio (URL, Blob, ArrayBuffer) avec lip-sync automatique. */
  async playAudio(input, { cues = null } = {}) {
    this.setState('speaking');
    try {
      if (cues) {
        const ctx = this.audioLipSync.context;
        let t0 = 0;
        const tl = new TimelineLipSync(cues, { clock: () => ctx.currentTime - t0 });
        await this.audioLipSync.play(input, { onStart: () => { t0 = ctx.currentTime; this.setLipSync(tl); } });
      } else {
        this.setLipSync(this.audioLipSync);
        await this.audioLipSync.play(input);
      }
    } finally {
      this.setLipSync(null);
      this.setState('idle');
    }
  }

  /** Anime la bouche sur un flux (WebRTC, micro…) jusqu'à stopStream(). */
  lipSyncStream(stream, opts) {
    this.audioLipSync.connectStream(stream, opts);
    this.setLipSync(this.audioLipSync);
  }

  stopStream() {
    this.audioLipSync.disconnect();
    this.setLipSync(null);
  }

  stopSpeaking() {
    this.tts?.stop?.();
    this.audioLipSync.stop();
    this.setLipSync(null);
    this.setState('idle');
  }

  /** Image PNG de l'état courant. */
  snapshot() {
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    if (this._onPointer) window.removeEventListener('pointermove', this._onPointer);
    this.stopSpeaking();
    this.canvas.remove();
  }

  // ------------------------------------------------------------ Animation
  update(dt) {
    if (!this.img) return;
    this.time += dt;
    const t = this.time;

    if (this._exprTimer > 0 && (this._exprTimer -= dt) <= 0) this.setExpression('neutral');
    const expr = EXPRESSIONS[this.state === 'thinking' && this.expression === 'neutral' ? 'thinking' : this.expression];

    // Bouche : visèmes > expression
    const sample = this.lipSync?.sample?.() ?? null;
    const visemes = this.manualVisemes ?? sample?.visemes;
    const volume = this.manualVisemes ? 0.6 : sample?.volume ?? 0;
    this._volume += (volume - this._volume) * Math.min(1, dt * 12);
    const talking = this.manualVisemes || (this.lipSync && this.state === 'speaking') || this._volume > 0.05;
    let mouth = mouthForVisemes(visemes);
    if (!mouth) mouth = talking ? (expr.mouth === 'grin' ? 'smile' : 'closed') : expr.mouth;
    this._mouthHold -= dt;
    if (mouth !== this._mouth && this._mouthHold <= 0) {
      this._mouth = mouth;
      this._mouthHold = 0.06; // évite le scintillement
    }

    // Emphase : le sourcil se lève sur les pics de voix
    if (this._volume > 0.75 && this._emphasis <= 0 && Math.random() < 0.08) this._emphasis = 0.35;
    this._emphasis -= dt;

    // Clignements
    this._nextBlink -= dt;
    if (this._nextBlink <= 0 && this._blinkT < 0) {
      this._blinkT = 0;
      this._nextBlink = Math.random() < 0.15 ? 0.25 : rand(2, 5);
    }
    let blink = null;
    if (this._blinkT >= 0) {
      this._blinkT += dt;
      blink = this._blinkT < 0.05 ? 'half' : this._blinkT < 0.13 ? 'closed' : this._blinkT < 0.18 ? 'half' : null;
      if (this._blinkT >= 0.18) this._blinkT = -1;
    }

    // Regard
    this._nextSaccade -= dt;
    if (this._nextSaccade <= 0) {
      this._saccade = { x: rand(-0.6, 0.6), y: rand(-0.3, 0.3) };
      this._nextSaccade = rand(1.2, 3.5);
    }
    const look = this.lookTarget ?? (this.state === 'listening' ? { x: 0, y: 0 } : this._saccade);
    let gx = look.x > 0.33 ? 1 : look.x < -0.33 ? -1 : 0;
    let gy = look.y > 0.45 ? -1 : 0;
    if (expr.gaze) [gx, gy] = expr.gaze;

    // Oreilles
    this._nextFlick -= dt;
    if (this._nextFlick <= 0) {
      this.twitchEar();
      this._nextFlick = this.state === 'listening' ? rand(1.2, 3) : rand(4, 9);
    }
    this._flick.left = Math.max(0, this._flick.left - dt);
    this._flick.right = Math.max(0, this._flick.right - dt);

    // Respiration (1 px), hochements pendant la parole
    let bob = (t % 2.2) < 1.1 ? -1 : 0;
    if (talking) bob = this._volume > 0.45 ? -1 : 0;
    if (this.state === 'listening') bob = -1;

    const pony = Math.sin((t * Math.PI * 2) / 2.8) > 0.35 ? 1 : 0;

    this._render({ expr, blink, gx, gy, bob, pony });
  }

  // ------------------------------------------------------------ Rendu
  _rect(c, r, w = 1, h = 1) {
    const { ox, oy } = GRID;
    const s = this.size / 1024;
    const x0 = Math.round((ox + c * GRID.size) * s), y0 = Math.round((oy + r * GRID.size) * s);
    const x1 = Math.round((ox + (c + w) * GRID.size) * s), y1 = Math.round((oy + (r + h) * GRID.size) * s);
    return [x0, y0, x1 - x0, y1 - y0];
  }

  /**
   * Pour chaque cellule, la cellule de peau d'origine la plus proche sur la
   * même ligne : effacer un trait redonne exactement le grain de l'image.
   */
  _buildSkinMap() {
    const n = GRID.cells;
    const c = document.createElement('canvas');
    c.width = c.height = this.size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(this.img, 0, 0);
    const data = g.getImageData(0, 0, this.size, this.size).data;
    const isSkin = (col, row) => {
      const [x, y, w, h] = this._rect(col, row);
      let r = 0, gg = 0, b = 0, a = 0, m = 0;
      for (let yy = y + 3; yy < y + h - 3; yy += 2) {
        for (let xx = x + 3; xx < x + w - 3; xx += 2) {
          if (xx < 0 || yy < 0 || xx >= this.size || yy >= this.size) continue;
          const i = (yy * this.size + xx) * 4;
          r += data[i]; gg += data[i + 1]; b += data[i + 2]; a += data[i + 3]; m++;
        }
      }
      if (!m) return false;
      r /= m; gg /= m; b /= m; a /= m;
      return a > 200 && Math.hypot(r - SKIN_RGB[0], gg - SKIN_RGB[1], b - SKIN_RGB[2]) < 38;
    };
    const skin = [];
    for (let row = 0; row < n; row++) skin.push(Array.from({ length: n }, (_, col) => isSkin(col, row)));
    return (col, row) => {
      for (let d = 0; d < 8; d++) {
        for (const cc of [col - d, col + d]) if (skin[row]?.[cc]) return [cc, row];
      }
      return SKIN_CELL;
    };
  }

  _cell(ctx, c, r, ch) {
    if (ch === '_') return;
    const [x, y, w, h] = this._rect(c, r);
    if (ch === '.') {
      const [sc, sr] = this._skinMap(c, r);
      const [sx, sy, sw, sh] = this._rect(sc, sr);
      const i = 3; // on évite les bords de cellule, où bave parfois le trait voisin
      ctx.drawImage(this.img, sx + i, sy + i, sw - 2 * i, sh - 2 * i, x, y, w, h);
    } else {
      ctx.fillStyle = COLORS[ch];
      ctx.fillRect(x, y, w, h);
    }
  }

  _fillBox(ctx, [c0, r0, w, h]) {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) this._cell(ctx, c, r, '.');
  }

  /** Déplace une zone de cellules de (dx, dy) cellules. */
  _shift(ctx, [c0, r0, w, h], dx, dy, clear = true) {
    if (!dx && !dy) return;
    const [x, y, pw, ph] = this._rect(c0, r0, w, h);
    this.tctx.clearRect(0, 0, this.size, this.size);
    this.tctx.drawImage(this.work, x, y, pw, ph, x, y, pw, ph);
    if (clear) ctx.clearRect(x, y, pw, ph);
    ctx.drawImage(this.tmp, x, y, pw, ph, x + Math.round(dx * this.k), y + Math.round(dy * this.k), pw, ph);
  }

  _render({ expr, blink, gx, gy, bob, pony }) {
    const w = this.wctx;
    const S = this.size;
    w.clearRect(0, 0, S, S);
    w.drawImage(this.img, 0, 0);

    // Yeux
    const shapes = Array.isArray(expr.eyes) ? expr.eyes : [expr.eyes, expr.eyes];
    ['left', 'right'].forEach((side, i) => {
      this._fillBox(w, EYE_BOXES[side]);
      let shape = shapes[i];
      if (blink && shape !== 'happy') shape = blink;
      if (this.state === 'listening' && shape === 'open' && !blink) shape = 'open';
      for (const [c, r, ch] of eyePixels(side, shape, gx, gy)) this._cell(w, c, r, ch);
    });

    // Sourcil
    this._fillBox(w, BROW_BOX);
    const brow = this._emphasis > 0 || this.state === 'listening' ? 'up' : expr.brow;
    for (const [c, r, ch] of browPixels(brow)) this._cell(w, c, r, ch);

    // Bouche
    const [mc, mr] = MOUTH_ORIGIN;
    MOUTHS[this._mouth].forEach((row, j) => {
      for (let i = 0; i < row.length; i++) this._cell(w, mc + i, mr + j, row[i]);
    });

    // Oreilles : dressées à l'écoute, petits frétillements
    for (const side of ['left', 'right']) {
      const { box, out } = EAR_TIPS[side];
      if (this.state === 'listening') this._shift(w, box, 0, -1, false);
      if (this._flick[side] > 0) {
        const [c0, r0, bw] = box;
        const top = this.state === 'listening' ? r0 - 1 : r0;
        this._shift(w, [c0 - 1, top, bw + 2, 4], out, 0);
      }
    }

    // Couette
    this._shift(w, PONYTAIL, pony, 0);

    // Bulle de réflexion
    if (this.state === 'thinking') {
      const n = Math.floor(this.time * 2.5) % (THINK_DOTS.length + 1);
      THINK_DOTS.slice(0, n).forEach(([c, r], i) => {
        const s = i + 1;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) this._cell(w, c + x, r + y, '#');
      });
    }

    // Composition finale : tout le sprite "respire" d'un pixel (la rangée du bas, du t-shirt, est rognée)
    const ctx = this.ctx;
    ctx.clearRect(0, 0, S, this.canvas.height);
    ctx.drawImage(this.work, 0, Math.round(bob * this.k));
  }
}

export { EXPRESSIONS, STATES };
