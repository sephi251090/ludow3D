import * as THREE from 'three';
import { VISEMES } from '../lipsync/visemes.js';

/**
 * Expressions : poids de morph targets du visage + pose des oreilles + pose de tête.
 * ear.x > 0 : oreilles vers l'arrière ; ear.z > 0 : oreilles tombantes vers l'extérieur.
 */
export const EXPRESSIONS = {
  neutral: { face: {}, ear: { x: 0, z: 0 }, head: { x: 0, z: 0 } },
  happy: { face: { mouthSmile: 0.85, eyeSquint: 0.55, browUp: 0.25 }, ear: { x: -0.08, z: -0.06 }, head: { x: -0.03, z: 0.05 } },
  sad: { face: { mouthFrown: 0.75, browSad: 1, eyesLookDown: 0.5, eyeSquint: 0.15 }, ear: { x: 0.3, z: 0.45 }, head: { x: 0.12, z: -0.04 } },
  surprised: { face: { eyeWide: 1, browUp: 1, jawOpen: 0.3, mouthPucker: 0.3 }, ear: { x: -0.18, z: -0.12 }, head: { x: -0.06, z: 0 } },
  angry: { face: { browAngry: 1, mouthFrown: 0.45, eyeSquint: 0.35 }, ear: { x: 0.55, z: 0.3 }, head: { x: 0.08, z: 0 } },
  thinking: { face: { browUp: 0.35, browSad: 0.25, eyesLookUp: 0.8, eyesLookRight: 0.6, mouthPucker: 0.35 }, ear: { x: 0.05, z: 0.08 }, head: { x: -0.06, z: -0.1 } },
  wink: { face: { eyeBlinkLeft: 1, mouthSmile: 0.7, browUp: 0.2 }, ear: { x: -0.05, z: 0 }, head: { x: 0, z: 0.08 } },
  smug: { face: { eyeSquint: 0.3, mouthSmile: 0.3, browDown: 0.3 }, ear: { x: 0.05, z: 0.05 }, head: { x: 0.03, z: 0.06 } },
};

/**
 * Retrouve les parties animables, que le modèle vienne de buildLudo()
 * ou d'un ludo.glb chargé avec GLTFLoader (on passe alors gltf.scene).
 */
export function resolveParts(model) {
  const get = (name) => {
    const o = model.getObjectByName(name);
    if (!o) throw new Error(`LudoRig : nœud « ${name} » introuvable`);
    return o;
  };
  const face = get('Ludo_Face');
  const faceMeshes = [];
  face.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) faceMeshes.push(o); });
  if (!faceMeshes.length) throw new Error('LudoRig : Ludo_Face sans morph targets');
  return {
    body: get('Body'), headPivot: get('HeadPivot'), head: get('Head'), face, faceMeshes,
    earL: get('EarPivot_L'), earR: get('EarPivot_R'), ponytail: get('PonytailPivot'),
  };
}

/** États de conversation. */
export const STATES = ['idle', 'listening', 'thinking', 'speaking'];

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Contrôleur d'animation de Ludo, indépendant du moteur de rendu :
 * appelez `update(dt)` à chaque frame.
 */
export class LudoRig extends EventTarget {
  constructor(model) {
    super();
    this.model = model;
    this.parts = resolveParts(model);
    // Le visage peut être un seul Mesh (modèle procédural) ou un Group de
    // primitives (modèle chargé depuis ludo.glb) partageant les mêmes targets.
    this.faceMeshes = this.parts.faceMeshes;
    this.dict = this.faceMeshes[0].morphTargetDictionary;
    for (const name of ['earL', 'earR', 'ponytail']) this.parts[name].userData.restRotation = this.parts[name].rotation.clone();

    this.time = 0;
    this.state = 'idle';
    this.expression = 'neutral';
    this.expressionIntensity = 1;
    this._exprTimer = 0;

    this.lipSync = null;        // source : { sample() => { visemes, volume } }
    this.manualVisemes = null;  // poids de visèmes imposés à la main
    this.visemes = Object.fromEntries(VISEMES.map((v) => [v, 0]));
    this.speechLevel = 0;

    this.faceWeights = {};      // expression lissée
    this.earPose = { x: 0, z: 0 };
    this.headPose = { x: 0, y: 0, z: 0 };

    this.blinkValue = 0;
    this._blinkT = -1;
    this._nextBlink = rand(1, 3);
    this._doubleBlink = false;

    this.lookTarget = null;     // {x, y} en [-1, 1], null = regard autonome
    this.look = { x: 0, y: 0 };
    this._saccade = { x: 0, y: 0 };
    this._nextSaccade = rand(1, 3);

    this._earTwitch = { L: { v: 0, a: 0 }, R: { v: 0, a: 0 } };
    this._nextTwitch = rand(3, 7);
    this._pony = { x: 0, z: 0, vx: 0, vz: 0 };
    this._prevHead = new THREE.Euler();
    this._nod = 0;
  }

  // ------------------------------------------------------------- API publique
  /** Branche une source de lip-sync (AudioLipSync, TimelineLipSync...) ou null. */
  setLipSync(source) {
    this.lipSync = source;
  }

  /** Impose des poids de visèmes, ex. { aa: 1 } ou null pour rendre la main. */
  setVisemes(weights) {
    this.manualVisemes = weights;
  }

  /**
   * Change d'expression. `duration` (s) optionnelle : retour à neutral ensuite.
   */
  setExpression(name, { intensity = 1, duration = 0 } = {}) {
    if (!EXPRESSIONS[name]) throw new Error(`Expression inconnue : ${name}`);
    this.expression = name;
    this.expressionIntensity = intensity;
    this._exprTimer = duration;
    this.dispatchEvent(new CustomEvent('expression', { detail: { name, intensity } }));
  }

  /** idle | listening | thinking | speaking */
  setState(state) {
    if (!STATES.includes(state)) throw new Error(`État inconnu : ${state}`);
    if (state === this.state) return;
    this.state = state;
    if (state === 'listening') this.twitchEar('both');
    this.dispatchEvent(new CustomEvent('state', { detail: { state } }));
  }

  /** Regarde un point (x, y ∈ [-1, 1], repère écran) ou null pour un regard autonome. */
  lookAt(x, y) {
    this.lookTarget = x == null ? null : { x, y };
  }

  blink() {
    this._blinkT = 0;
  }

  /** 'L' | 'R' | 'both' */
  twitchEar(side = Math.random() < 0.5 ? 'L' : 'R') {
    const kick = (s) => { this._earTwitch[s].v += rand(9, 14); };
    if (side === 'both') { kick('L'); kick('R'); } else kick(side);
  }

  /** Liste des morph targets disponibles sur le visage. */
  get morphTargets() {
    return Object.keys(this.dict);
  }

  // ------------------------------------------------------------- Mise à jour
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const t = this.time;

    if (this._exprTimer > 0) {
      this._exprTimer -= dt;
      if (this._exprTimer <= 0) this.setExpression('neutral');
    }

    // --- Lip-sync
    const sample = this.lipSync?.sample?.() ?? null;
    const target = this.manualVisemes ?? sample?.visemes ?? null;
    let mouthActivity = 0;
    for (const v of VISEMES) {
      const goal = v === 'sil' ? 0 : target?.[v] ?? 0;
      const cur = this.visemes[v];
      this.visemes[v] = damp(cur, goal, goal > cur ? 35 : 18, dt);
      if (v !== 'sil' && v !== 'PP') mouthActivity = Math.max(mouthActivity, this.visemes[v]);
    }
    const level = sample?.volume ?? mouthActivity;
    this.speechLevel = damp(this.speechLevel, level, 14, dt);

    // --- Expression (lissée)
    const expr = EXPRESSIONS[this.state === 'thinking' && this.expression === 'neutral' ? 'thinking' : this.expression];
    const k = this.expressionIntensity;
    const names = new Set([...Object.keys(this.faceWeights), ...Object.keys(expr.face)]);
    for (const n of names) this.faceWeights[n] = damp(this.faceWeights[n] ?? 0, (expr.face[n] ?? 0) * k, 7, dt);

    // --- Clignements
    this._nextBlink -= dt;
    if (this._nextBlink <= 0 && this._blinkT < 0) {
      this._blinkT = 0;
      this._doubleBlink = !this._doubleBlink && Math.random() < 0.15;
      this._nextBlink = rand(2, 5.5);
    }
    if (this._blinkT >= 0) {
      this._blinkT += dt;
      const d = 0.16;
      this.blinkValue = Math.sin(Math.min(1, this._blinkT / d) * Math.PI);
      if (this._blinkT >= d) {
        this._blinkT = -1;
        this.blinkValue = 0;
        if (this._doubleBlink) this._nextBlink = 0.1;
      }
    }

    // --- Regard
    this._nextSaccade -= dt;
    if (this._nextSaccade <= 0) {
      this._saccade = { x: rand(-0.35, 0.35), y: rand(-0.2, 0.25) };
      this._nextSaccade = this.state === 'listening' ? rand(2, 4) : rand(1, 3.5);
    }
    const lt = this.lookTarget ?? (this.state === 'listening' ? { x: 0, y: 0 } : this._saccade);
    this.look.x = damp(this.look.x, lt.x, 12, dt);
    this.look.y = damp(this.look.y, lt.y, 12, dt);

    this._applyFace();
    this._applyHead(dt, t, expr);
    this._applyEars(dt, t, expr);
    this._applyPonytail(dt, t);
  }

  _applyFace() {
    const w = {};
    const add = (n, v) => { w[n] = (w[n] ?? 0) + v; };
    // Pendant la parole, on atténue la bouche de l'expression pour garder l'articulation lisible.
    const talk = Math.min(1, this.speechLevel * 2);
    for (const [n, v] of Object.entries(this.faceWeights)) {
      const mouth = n.startsWith('mouth') || n === 'jawOpen';
      add(n, mouth ? v * (1 - 0.55 * talk) : v);
    }
    for (const v of VISEMES) if (v !== 'sil') add(`viseme_${v}`, this.visemes[v]);
    add('eyeBlinkLeft', this.blinkValue);
    add('eyeBlinkRight', this.blinkValue);
    if (this.state === 'listening') add('eyeWide', 0.25);
    const lx = this.look.x, ly = this.look.y;
    add(lx > 0 ? 'eyesLookLeft' : 'eyesLookRight', Math.abs(lx));
    add(ly > 0 ? 'eyesLookUp' : 'eyesLookDown', Math.abs(ly));

    for (const mesh of this.faceMeshes) {
      const inf = mesh.morphTargetInfluences;
      for (const [name, i] of Object.entries(mesh.morphTargetDictionary)) {
        inf[i] = Math.min(1, Math.max(0, w[name] ?? 0));
      }
    }
  }

  _applyHead(dt, t, expr) {
    const { headPivot, body } = this.parts;
    const k = this.expressionIntensity;
    let tx = expr.head.x * k + Math.sin(t * 0.9) * 0.015;
    let ty = this.look.x * 0.12 + Math.sin(t * 0.37) * 0.04;
    let tz = expr.head.z * k + Math.sin(t * 0.53) * 0.02;
    if (this.state === 'listening') { tz += 0.09; tx += 0.05; }
    if (this.state === 'thinking') { tz -= 0.06; tx -= 0.05; ty += Math.sin(t * 0.6) * 0.05; }
    if (this.state === 'speaking' || this.speechLevel > 0.05) {
      this._nod = damp(this._nod, this.speechLevel, 8, dt);
      tx += this._nod * 0.07 * (0.6 + 0.4 * Math.sin(t * 7.3));
      ty += Math.sin(t * 2.1) * 0.03 * this._nod;
    }
    tx -= this.look.y * 0.06;
    this.headPose.x = damp(this.headPose.x, tx, 6, dt);
    this.headPose.y = damp(this.headPose.y, ty, 5, dt);
    this.headPose.z = damp(this.headPose.z, tz, 5, dt);
    this._prevHead.copy(headPivot.rotation);
    headPivot.rotation.set(this.headPose.x, this.headPose.y, this.headPose.z);
    // Respiration
    const breathe = Math.sin(t * 1.6);
    body.scale.set(1 + breathe * 0.006, 1 + breathe * 0.01, 1 + breathe * 0.006);
    body.rotation.y = this.headPose.y * 0.25;
  }

  _applyEars(dt, t, expr) {
    const k = this.expressionIntensity;
    let px = expr.ear.x * k, pz = expr.ear.z * k;
    if (this.state === 'listening') { px -= 0.22; pz -= 0.1; }
    if (this.state === 'thinking') { pz += 0.05; }
    this.earPose.x = damp(this.earPose.x, px, 8, dt);
    this.earPose.z = damp(this.earPose.z, pz, 8, dt);

    this._nextTwitch -= dt;
    if (this._nextTwitch <= 0) {
      this.twitchEar();
      this._nextTwitch = this.state === 'listening' ? rand(1.5, 3.5) : rand(4, 9);
    }
    for (const s of ['L', 'R']) {
      const tw = this._earTwitch[s];
      // ressort amorti
      tw.v += (-tw.a * 260 - tw.v * 14) * dt;
      tw.a += tw.v * dt;
      const ear = s === 'L' ? this.parts.earL : this.parts.earR;
      const side = s === 'L' ? 1 : -1;
      const rest = ear.userData.restRotation;
      ear.rotation.x = rest.x + this.earPose.x + tw.a * 0.6 + Math.sin(t * 1.1 + side) * 0.01;
      ear.rotation.z = rest.z - side * (this.earPose.z + tw.a * 0.5);
    }
  }

  _applyPonytail(dt, t) {
    const pony = this.parts.ponytail;
    const hp = this.parts.headPivot.rotation;
    const p = this._pony;
    const targetZ = -hp.z * 0.9 + Math.sin(t * 1.3) * 0.035;
    const targetX = -hp.x * 0.7 + Math.sin(t * 0.9 + 1) * 0.02;
    // inertie : la couette réagit à la vitesse de la tête
    const dvz = (hp.z - this._prevHead.z) / Math.max(dt, 1e-3);
    const dvx = (hp.x - this._prevHead.x) / Math.max(dt, 1e-3);
    p.vz += ((targetZ - p.z) * 60 - p.vz * 6 - dvz * 2) * dt;
    p.vx += ((targetX - p.x) * 60 - p.vx * 6 - dvx * 2) * dt;
    p.z += p.vz * dt;
    p.x += p.vx * dt;
    const rest = pony.userData.restRotation;
    pony.rotation.set(rest.x + p.x, rest.y, rest.z + p.z);
  }
}
