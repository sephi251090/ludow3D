import { TimelineLipSync } from '../lipsync/TimelineLipSync.js';
import { AudioLipSync } from '../lipsync/AudioLipSync.js';

/**
 * Tous les moteurs de synthèse vocale (TTS) exposent la même interface :
 *   await tts.speak(text, rig)  → anime `rig` (LudoSprite) pendant la lecture
 *   tts.stop()
 */

/** Découpe un texte en phrases (Chrome coupe les énoncés trop longs). */
export function splitSentences(text, max = 220) {
  const parts = text.match(/[^.!?…\n]+[.!?…]*|\n+/g) ?? [text];
  const out = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    if (p.length <= max) { out.push(p); continue; }
    let cur = '';
    for (const w of p.split(/(?<=,)\s+|\s+/)) {
      if ((cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** TTS du navigateur (Web Speech API) — gratuit, hors-ligne selon les voix. */
export class BrowserTTS {
  constructor({ lang = 'fr-FR', voice = null, rate = 1, pitch = 1.15, volume = 1 } = {}) {
    Object.assign(this, { lang, voice, rate, pitch, volume });
    this._cancelled = false;
  }

  static get supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Liste des voix disponibles (asynchrone sur Chrome). */
  static voices() {
    return new Promise((resolve) => {
      const v = speechSynthesis.getVoices();
      if (v.length) return resolve(v);
      speechSynthesis.addEventListener('voiceschanged', () => resolve(speechSynthesis.getVoices()), { once: true });
      setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    });
  }

  async _pickVoice() {
    if (this.voice && typeof this.voice !== 'string') return this.voice;
    const voices = await BrowserTTS.voices();
    if (typeof this.voice === 'string') {
      const v = voices.find((x) => x.name === this.voice || x.voiceURI === this.voice);
      if (v) return v;
    }
    const lang = this.lang.toLowerCase();
    const same = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang.slice(0, 2)));
    return same.find((v) => v.lang.toLowerCase() === lang && /natural|neural|google|online/i.test(v.name))
      ?? same.find((v) => v.lang.toLowerCase() === lang) ?? same[0] ?? null;
  }

  async speak(text, rig) {
    if (!BrowserTTS.supported) throw new Error('speechSynthesis indisponible dans ce navigateur');
    this.stop();
    this._cancelled = false;
    const voice = await this._pickVoice();
    rig?.setState('speaking');
    try {
      for (const sentence of splitSentences(text)) {
        if (this._cancelled) break;
        await this._speakOne(sentence, voice, rig);
      }
    } finally {
      rig?.setLipSync(null);
      if (rig?.state === 'speaking') rig.setState('idle');
    }
  }

  _speakOne(text, voice, rig) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang ?? this.lang;
      if (voice) u.voice = voice;
      u.rate = this.rate;
      u.pitch = this.pitch;
      u.volume = this.volume;
      const lip = TimelineLipSync.fromText(text, { rate: this.rate, lang: u.lang });
      let started = false;
      u.onstart = () => { started = true; lip.start(); rig?.setLipSync(lip); };
      u.onboundary = (e) => { if (e.name === 'word' || e.name === undefined) lip.seekToChar(e.charIndex); };
      const done = () => { rig?.setLipSync(null); resolve(); };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
      // Sécurité : certains navigateurs n'émettent jamais onstart/onend.
      setTimeout(() => { if (!started) { lip.start(); rig?.setLipSync(lip); } }, 600);
      setTimeout(() => { if (!speechSynthesis.speaking) done(); }, lip.duration * 1000 / Math.max(0.3, this.rate) + 4000);
    });
  }

  stop() {
    this._cancelled = true;
    if (BrowserTTS.supported) speechSynthesis.cancel();
  }
}

/**
 * TTS basé sur de l'audio : fournissez `synthesize(text)` qui renvoie une URL,
 * un Blob, un ArrayBuffer ou un AudioBuffer (OpenAI TTS, ElevenLabs, Azure,
 * Piper, Coqui...). La bouche est animée par analyse du signal.
 *
 * Si votre service renvoie aussi des visèmes horodatés, renvoyez
 * `{ audio, cues }` : la chronologie sera alors utilisée (synchro exacte).
 */
export class AudioTTS {
  constructor({ synthesize, lipSync = new AudioLipSync() } = {}) {
    if (!synthesize) throw new Error('AudioTTS: option `synthesize(text)` requise');
    this.synthesize = synthesize;
    this.lipSync = lipSync;
  }

  async speak(text, rig) {
    const res = await this.synthesize(text);
    const isWrapped = res && typeof res === 'object' && 'audio' in res;
    const audio = isWrapped ? res.audio : res;
    const cues = isWrapped ? res.cues : null;
    rig?.setState('speaking');
    try {
      if (cues?.length) {
        const ctx = this.lipSync.context;
        let t0 = 0;
        const timeline = new TimelineLipSync(cues, {
          clock: () => ctx.currentTime - t0,
        });
        await this.lipSync.play(audio, { onStart: () => { t0 = ctx.currentTime; rig?.setLipSync(timeline); } });
      } else {
        rig?.setLipSync(this.lipSync);
        await this.lipSync.play(audio);
      }
    } finally {
      rig?.setLipSync(null);
      if (rig?.state === 'speaking') rig.setState('idle');
    }
  }

  stop() {
    this.lipSync.stop();
  }
}

/** Reconnaissance vocale du navigateur (Web Speech API : Chrome, Edge, Safari). */
export class BrowserSTT extends EventTarget {
  constructor({ lang = 'fr-FR', interimResults = true, continuous = false } = {}) {
    super();
    Object.assign(this, { lang, interimResults, continuous });
    this.listening = false;
  }

  static get supported() {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /** Écoute jusqu'à la fin d'une phrase et renvoie la transcription finale. */
  listenOnce({ rig } = {}) {
    if (!BrowserSTT.supported) return Promise.reject(new Error('SpeechRecognition indisponible dans ce navigateur'));
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    return new Promise((resolve, reject) => {
      const rec = new Rec();
      this._rec = rec;
      rec.lang = this.lang;
      rec.interimResults = this.interimResults;
      rec.continuous = this.continuous;
      let finalText = '';
      rec.onstart = () => {
        this.listening = true;
        rig?.setState('listening');
        this.dispatchEvent(new Event('start'));
      };
      rec.onspeechstart = () => rig?.twitchEar('both');
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        this.dispatchEvent(new CustomEvent('transcript', { detail: { text: (finalText + interim).trim(), final: !interim } }));
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        this.listening = false;
        reject(new Error(e.error));
      };
      rec.onend = () => {
        this.listening = false;
        if (rig?.state === 'listening') rig.setState('idle');
        this.dispatchEvent(new Event('end'));
        resolve(finalText.trim());
      };
      rec.start();
    });
  }

  stop() {
    this._rec?.stop();
  }
}

/**
 * Enregistreur micro avec détection de silence, pour un STT côté serveur
 * (Whisper, Deepgram, Google, Azure...). `record()` renvoie un Blob audio.
 * Le niveau du micro fait bouger les oreilles de Ludo pendant l'écoute.
 */
export class MicRecorder {
  constructor({ silenceMs = 1200, maxMs = 30000, threshold = 0.015, mimeType } = {}) {
    Object.assign(this, { silenceMs, maxMs, threshold, mimeType });
  }

  async record({ rig } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const rec = new MediaRecorder(stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rig?.setState('listening');
    this._rec = rec;
    return new Promise((resolve) => {
      let heard = false;
      let lastVoice = performance.now();
      const t0 = performance.now();
      const tick = () => {
        if (rec.state !== 'recording') return;
        an.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
        const now = performance.now();
        if (rms > this.threshold) {
          if (!heard) rig?.twitchEar('both');
          heard = true;
          lastVoice = now;
        }
        if ((heard && now - lastVoice > this.silenceMs) || now - t0 > this.maxMs) rec.stop();
        else requestAnimationFrame(tick);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        if (rig?.state === 'listening') rig.setState('idle');
        resolve(new Blob(chunks, { type: rec.mimeType }));
      };
      rec.start();
      tick();
    });
  }

  stop() {
    if (this._rec?.state === 'recording') this._rec.stop();
  }
}
