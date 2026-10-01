/**
 * Lip-sync temps réel à partir de n'importe quel signal audio (Web Audio API).
 *
 * Fonctionne avec : un fichier/URL, un Blob/ArrayBuffer renvoyé par une API
 * de TTS (OpenAI, ElevenLabs, Azure, Piper...), un <audio>, un flux micro
 * ou WebRTC (MediaStream), ou n'importe quel AudioNode.
 *
 * Analyse : volume (RMS) => ouverture ; répartition spectrale => forme
 * (voyelles ouvertes / antérieures / arrondies, sifflantes).
 */
export class AudioLipSync {
  constructor({ audioContext = null, fftSize = 1024, sensitivity = 1, noiseFloor = -55 } = {}) {
    this.ctx = audioContext;
    this.fftSize = fftSize;
    this.sensitivity = sensitivity;
    this.noiseFloor = noiseFloor;
    this._sources = new WeakMap();
    this._current = null;
    this._peak = 0.05;
  }

  /** Contexte audio (créé à la demande ; doit suivre un geste utilisateur). */
  get context() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.35;
      this._freq = new Float32Array(this.analyser.frequencyBinCount);
      this._time = new Float32Array(this.analyser.fftSize);
    }
    return this.ctx;
  }

  /** Analyse un AudioNode existant (sans le router vers les haut-parleurs). */
  connectNode(node) {
    this.context;
    this.disconnect();
    node.connect(this.analyser);
    this._current = node;
    return this;
  }

  /** Analyse un élément <audio>/<video> (le son reste audible). */
  connectElement(el) {
    const ctx = this.context;
    let src = this._sources.get(el);
    if (!src) {
      src = ctx.createMediaElementSource(el);
      src.connect(ctx.destination);
      this._sources.set(el, src);
    }
    return this.connectNode(src);
  }

  /** Analyse un MediaStream (micro, WebRTC). `monitor` : le rendre audible. */
  connectStream(stream, { monitor = false } = {}) {
    const ctx = this.context;
    const src = ctx.createMediaStreamSource(stream);
    if (monitor) src.connect(ctx.destination);
    return this.connectNode(src);
  }

  disconnect() {
    try { this._current?.disconnect(this.analyser); } catch { /* déjà déconnecté */ }
    this._current = null;
  }

  /**
   * Joue un son et anime la bouche. Accepte URL, Blob, ArrayBuffer ou AudioBuffer.
   * Résout la promesse à la fin de la lecture.
   */
  async play(input, { onStart } = {}) {
    const ctx = this.context;
    if (ctx.state === 'suspended') await ctx.resume();
    let buffer = input;
    if (typeof input === 'string') input = await (await fetch(input)).arrayBuffer();
    if (input instanceof Blob) input = await input.arrayBuffer();
    if (input instanceof ArrayBuffer) buffer = await ctx.decodeAudioData(input);
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    this.connectNode(src);
    this._playing = src;
    return new Promise((resolve) => {
      src.onended = () => {
        if (this._playing === src) this._playing = null;
        this.disconnect();
        resolve();
      };
      src.start();
      onStart?.(buffer.duration);
    });
  }

  stop() {
    if (this._playing) {
      try { this._playing.stop(); } catch { /* déjà arrêté */ }
      this._playing = null;
    }
  }

  get active() {
    return !!this._current;
  }

  sample() {
    if (!this._current || !this.analyser) return { visemes: {}, volume: 0 };
    const a = this.analyser;
    a.getFloatTimeDomainData(this._time);
    let sum = 0;
    for (let i = 0; i < this._time.length; i++) sum += this._time[i] * this._time[i];
    const rms = Math.sqrt(sum / this._time.length);
    // Normalisation adaptative (suit le pic récent).
    this._peak = Math.max(rms, this._peak * 0.995, 0.02);
    const db = 20 * Math.log10(rms + 1e-9);
    const gate = Math.min(1, Math.max(0, (db - this.noiseFloor) / 12));
    const volume = Math.min(1, (rms / this._peak) * gate * this.sensitivity);

    a.getFloatFrequencyData(this._freq);
    const hz = this.ctx.sampleRate / a.fftSize;
    const band = (lo, hi) => {
      let e = 0;
      for (let i = Math.floor(lo / hz); i < Math.min(this._freq.length, Math.ceil(hi / hz)); i++) e += 10 ** (this._freq[i] / 10);
      return e;
    };
    const low = band(150, 800);
    const mid = band(800, 1800);
    const high = band(1800, 4000);
    const sib = band(4000, 9000);
    const total = low + mid + high + sib + 1e-12;

    const visemes = {};
    if (volume < 0.06) return { visemes: { sil: 1 }, volume: 0 };
    const sibR = sib / total;
    const front = clamp01((high / total - 0.12) / 0.3);
    const back = clamp01((low / total - 0.6) / 0.3) * (1 - front);
    const s = clamp01((sibR - 0.25) / 0.3);
    const open = volume * (1 - 0.7 * s);
    visemes.aa = open * (1 - front - back) * 0.9;
    visemes.E = open * front * 0.65;
    visemes.I = open * front * 0.35;
    visemes.O = open * back * 0.65;
    visemes.U = open * back * 0.35;
    visemes.SS = s * Math.min(1, volume * 2) * 0.8;
    return { visemes, volume };
  }
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
