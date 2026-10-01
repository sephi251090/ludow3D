import { textToVisemes } from './visemes.js';

/**
 * Lip-sync piloté par une chronologie de visèmes (cues).
 * Sources possibles : texte (textToVisemes), évènements Azure / Polly,
 * fichiers Rhubarb, etc.
 *
 * L'horloge est par défaut performance.now(), mais peut être celle d'un
 * élément audio (`clock: () => audio.currentTime`) pour une synchro parfaite.
 */
export class TimelineLipSync {
  constructor(cues = [], { clock = null, attack = 0.05, release = 0.09, gain = 1 } = {}) {
    this.cues = cues;
    this.clock = clock;
    this.attack = attack;
    this.release = release;
    this.gain = gain;
    this._start = null;
    this._cursor = 0;
    this.duration = cues.length ? cues[cues.length - 1].end : 0;
  }

  static fromText(text, opts = {}) {
    const { cues } = textToVisemes(text, opts);
    return new TimelineLipSync(cues, opts);
  }

  _now() {
    return performance.now() / 1000;
  }

  /** Temps courant dans la chronologie (s), ou null si non démarrée. */
  get currentTime() {
    if (this.clock) return this.clock();
    if (this._start == null) return null;
    return this._now() - this._start;
  }

  start(offset = 0) {
    this._start = this._now() - offset;
    this._cursor = 0;
  }

  stop() {
    this._start = null;
  }

  get finished() {
    const t = this.currentTime;
    return t != null && t > this.duration + this.release;
  }

  /** Recalage sur un index de caractère (évènement `boundary` de SpeechSynthesis). */
  seekToChar(charIndex) {
    const cue = this.cues.find((c) => c.charIndex != null && c.charIndex >= charIndex);
    if (!cue || this.clock) return;
    const t = this.currentTime ?? 0;
    // On ne recule jamais beaucoup pour éviter les saccades.
    if (cue.start > t - 0.05) this._start = this._now() - cue.start;
  }

  sample() {
    const t = this.currentTime;
    const visemes = {};
    if (t == null || !this.cues.length) return { visemes, volume: 0 };
    let volume = 0;
    // Recherche à partir du dernier curseur (les cues sont triés).
    while (this._cursor > 0 && this.cues[this._cursor].start > t) this._cursor--;
    while (this._cursor < this.cues.length - 1 && this.cues[this._cursor].end + this.release < t) this._cursor++;
    for (let i = this._cursor; i < this.cues.length; i++) {
      const c = this.cues[i];
      if (c.start - this.attack > t) break;
      const w = Math.max(0, Math.min(1, (t - c.start + this.attack) / this.attack, (c.end + this.release - t) / this.release));
      if (w <= 0) continue;
      visemes[c.viseme] = Math.max(visemes[c.viseme] ?? 0, w * this.gain);
      if (c.viseme !== 'sil') volume = Math.max(volume, w);
    }
    return { visemes, volume: volume * 0.7 };
  }
}
