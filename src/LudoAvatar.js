import * as THREE from 'three';
import { buildLudo } from './avatar/buildLudo.js';
import { LudoRig } from './avatar/LudoRig.js';
import { BrowserTTS } from './conversation/speech.js';
import { AudioLipSync } from './lipsync/AudioLipSync.js';
import { TimelineLipSync } from './lipsync/TimelineLipSync.js';
import { parseExpressionTags } from './conversation/LudoConversation.js';

const FRAMINGS = {
  bust: { pos: [0, 1.75, 4.6], target: [0, 1.52, 0], fov: 28 },
  face: { pos: [0, 1.85, 3.1], target: [0, 1.78, 0], fov: 28 },
  full: { pos: [0, 1.5, 6.2], target: [0, 1.25, 0], fov: 28 },
};

/**
 * Ludo prêt à l'emploi dans un élément HTML : rendu, animation, parole.
 *
 *   const ludo = new LudoAvatar(document.getElementById('ludo'));
 *   await ludo.speak('Salut, moi c’est Ludo !');
 */
export class LudoAvatar {
  constructor(container, {
    background = null,       // null = transparent, sinon couleur CSS
    materials = 'toon',
    outlines = true,
    framing = 'bust',
    followPointer = true,
    pixelRatio = Math.min(window.devicePixelRatio, 2),
    tts = null,              // moteur TTS ({ speak(text, rig), stop() }), BrowserTTS par défaut
    lang = 'fr-FR',
  } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: background == null, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

    this.scene = new THREE.Scene();
    if (background != null) this.scene.background = new THREE.Color(background);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.setFraming(framing);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2, 3, 4);
    this.scene.add(key);

    this.model = buildLudo({ materials, outlines });
    this.scene.add(this.model);
    this.rig = new LudoRig(this.model);

    this.tts = tts ?? new BrowserTTS({ lang });
    this.audioLipSync = new AudioLipSync();

    this._resize = () => this.resize();
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(container);
    this.resize();

    if (followPointer) {
      this._onPointer = (e) => {
        const r = this.renderer.domElement.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1;
        const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
        this.rig.lookAt(Math.max(-1, Math.min(1, x * 0.8)), Math.max(-1, Math.min(1, y * 0.6)));
        clearTimeout(this._lookTimeout);
        this._lookTimeout = setTimeout(() => this.rig.lookAt(null), 2500);
      };
      window.addEventListener('pointermove', this._onPointer);
    }

    this.timer = new THREE.Timer();
    this._loop = (time) => {
      this._raf = requestAnimationFrame(this._loop);
      this.timer.update(time);
      this.update(this.timer.getDelta());
    };
    this._raf = requestAnimationFrame(this._loop);
  }

  setFraming(name) {
    const f = FRAMINGS[name] ?? FRAMINGS.bust;
    this.camera.fov = f.fov;
    this.camera.position.set(...f.pos);
    this.camera.lookAt(...f.target);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.rig.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ---- Raccourcis vers le rig / la parole --------------------------------
  /** Fait parler Ludo avec le moteur TTS configuré. Gère les balises [expression]. */
  async speak(text) {
    for (const seg of parseExpressionTags(text)) {
      if (seg.expression) this.rig.setExpression(seg.expression);
      if (seg.text) await this.tts.speak(seg.text, this.rig);
    }
  }

  /** Joue un audio (URL, Blob, ArrayBuffer) avec lip-sync automatique. */
  async playAudio(input, { cues = null } = {}) {
    this.rig.setState('speaking');
    try {
      if (cues) {
        const ctx = this.audioLipSync.context;
        let t0 = 0;
        const tl = new TimelineLipSync(cues, { clock: () => ctx.currentTime - t0 });
        await this.audioLipSync.play(input, { onStart: () => { t0 = ctx.currentTime; this.rig.setLipSync(tl); } });
      } else {
        this.rig.setLipSync(this.audioLipSync);
        await this.audioLipSync.play(input);
      }
    } finally {
      this.rig.setLipSync(null);
      this.rig.setState('idle');
    }
  }

  /** Anime la bouche sur un flux (WebRTC, micro…) jusqu'à stopStream(). */
  lipSyncStream(stream, opts) {
    this.audioLipSync.connectStream(stream, opts);
    this.rig.setLipSync(this.audioLipSync);
  }

  stopStream() {
    this.audioLipSync.disconnect();
    this.rig.setLipSync(null);
  }

  stopSpeaking() {
    this.tts?.stop?.();
    this.audioLipSync.stop();
    this.rig.setLipSync(null);
    this.rig.setState('idle');
  }

  setExpression(name, opts) { this.rig.setExpression(name, opts); }
  setState(state) { this.rig.setState(state); }

  /** Capture PNG de la vue courante. */
  snapshot() {
    this.update(0);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    if (this._onPointer) window.removeEventListener('pointermove', this._onPointer);
    this.stopSpeaking();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
