import * as THREE from 'three';
import { headPoint, fanIndices, stripIndices, superEllipse } from './geometry.js';
import { VISEMES } from '../lipsync/visemes.js';

/**
 * Le visage (bouche, dents, langue, yeux, reflets, sourcils, sillon) est un
 * unique maillage plaqué sur la tête, avec des morph targets compatibles
 * avec les conventions courantes (visèmes Oculus + blendshapes type ARKit).
 */
export const FACE_TARGETS = [
  ...VISEMES.map((v) => `viseme_${v}`),
  'jawOpen', 'mouthSmile', 'mouthFrown', 'mouthPucker',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWide', 'eyeSquint',
  'eyesLookLeft', 'eyesLookRight', 'eyesLookUp', 'eyesLookDown',
  'browUp', 'browDown', 'browSad', 'browAngry',
];

// Paramètres de bouche par visème / expression.
// Bouche au repos : léger sourire (plus avenant que la ligne plate du sprite).
const BASE_MOUTH = { smile: 0.35 };
const mouthParams = (target) => ({ ...BASE_MOUTH, ...(MOUTH[target] ?? {}) });

const MOUTH = {
  viseme_sil: {},
  viseme_PP: { press: 1 },
  viseme_FF: { open: 0.14, wide: 0.15 },
  viseme_TH: { open: 0.22, wide: 0.1 },
  viseme_DD: { open: 0.3, wide: 0.15 },
  viseme_kk: { open: 0.38, wide: 0.05 },
  viseme_CH: { open: 0.26, round: 0.55 },
  viseme_SS: { open: 0.13, wide: 0.4 },
  viseme_nn: { open: 0.22, wide: 0.08 },
  viseme_RR: { open: 0.26, round: 0.35 },
  viseme_aa: { open: 1, wide: 0.1 },
  viseme_E: { open: 0.5, wide: 0.4 },
  viseme_I: { open: 0.3, wide: 0.6 },
  viseme_O: { open: 0.72, round: 0.8 },
  viseme_U: { open: 0.38, round: 1 },
  jawOpen: { open: 1 },
  mouthSmile: { smile: 1, wide: 0.25 },
  mouthFrown: { smile: 0, frown: 1 },
  mouthPucker: { round: 1, open: 0.08 },
};

const MOUTH_Y = -0.245;
const MOUTH_HW = 0.075;
const MOUTH_H = 0.09;

function mouthMetrics(p) {
  const open = p.open ?? 0, wide = p.wide ?? 0, round = p.round ?? 0, press = p.press ?? 0;
  const hw = MOUTH_HW * (1 + 0.3 * wide - 0.45 * round - 0.06 * press);
  const lower = 0.0055 * (1 - press) + MOUTH_H * open * (1 - 0.15 * wide) + 0.012 * round;
  const upper = 0.0045 * (1 - press) + 0.3 * MOUTH_H * open + 0.01 * round;
  const e = 0.75 + 0.5 * round; // plus rond quand les lèvres s'arrondissent
  return { hw, lower, upper, e, smile: p.smile ?? 0, frown: p.frown ?? 0 };
}

function mouthCurve(m, x) {
  const u = x / m.hw;
  return m.smile * (0.032 * u * u - 0.008) - m.frown * 0.026 * u * u;
}

// Bord supérieur / inférieur de la bouche à l'abscisse x.
function mouthEdge(m, x, upper) {
  const c = Math.min(1, Math.abs(x) / m.hw) ** (1 / m.e);
  const s = Math.sqrt(Math.max(0, 1 - c * c)) ** m.e;
  return (upper ? m.upper * s : -m.lower * s) + mouthCurve(m, x);
}

const RING = 40;
const BAND = 12;

function mouthPart(p) {
  const m = mouthMetrics(p);
  const pts = [[0, MOUTH_Y + (m.upper - m.lower) / 2 + mouthCurve(m, 0)]];
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2;
    const [x, y0] = superEllipse(t, m.hw, 1, m.e);
    const y = (y0 >= 0 ? m.upper * y0 : m.lower * y0) + mouthCurve(m, x);
    pts.push([x, MOUTH_Y + y]);
  }
  return pts;
}

function teethPart(p) {
  const m = mouthMetrics(p);
  const total = m.upper + m.lower;
  const h = Math.min(0.016, 0.3 * Math.max(0, total - 0.012));
  const top = [], bottom = [];
  for (let i = 0; i < BAND; i++) {
    const x = (-0.78 + (1.56 * i) / (BAND - 1)) * m.hw;
    const yt = mouthEdge(m, x, true) - 0.002;
    top.push([x, MOUTH_Y + yt]);
    bottom.push([x, MOUTH_Y + Math.max(yt - h, mouthEdge(m, x, false))]);
  }
  return [...top, ...bottom];
}

function tonguePart(p) {
  const m = mouthMetrics(p);
  const total = m.upper + m.lower;
  const h = 0.4 * Math.max(0, total - 0.03);
  const top = [], bottom = [];
  for (let i = 0; i < BAND; i++) {
    const x = (-0.62 + (1.24 * i) / (BAND - 1)) * m.hw;
    const yb = mouthEdge(m, x, false) + 0.002;
    const u = x / (0.62 * m.hw);
    top.push([x, MOUTH_Y + yb + h * Math.sqrt(Math.max(0, 1 - u * u))]);
    bottom.push([x, MOUTH_Y + yb]);
  }
  return [...top, ...bottom];
}

// --- Yeux -------------------------------------------------------------------
const EYE_X = 0.185;
const EYE_Y = -0.014;
const EYE_HW = 0.058;
const EYE_HH = 0.062;
const NEUTRAL_LID = 0.12; // paupières à peine baissées : regard doux

function eyeParams(name, side) {
  const p = { lid: NEUTRAL_LID, squint: 0, scale: 1, lx: 0, ly: 0 };
  const isLeft = side > 0; // gauche du personnage = +x
  if ((name === 'eyeBlinkLeft' && isLeft) || (name === 'eyeBlinkRight' && !isLeft)) p.lid = 1;
  if (name === 'eyeWide') { p.lid = 0; p.scale = 1.12; }
  if (name === 'eyeSquint') { p.squint = 0.45; p.lid = 0.42; }
  if (name === 'eyesLookLeft') p.lx = 0.02;
  if (name === 'eyesLookRight') p.lx = -0.02;
  if (name === 'eyesLookUp') p.ly = 0.016;
  if (name === 'eyesLookDown') p.ly = -0.014;
  return p;
}

function eyeClamp(p, y) {
  const top = EYE_HH - p.lid * 1.25 * EYE_HH;
  const bottom = -EYE_HH + Math.max(p.squint, (Math.max(0, p.lid - 0.6) / 0.4) * 0.62) * EYE_HH;
  const lo = Math.min(bottom, top - 0.003);
  return Math.min(Math.max(y, lo), Math.max(top, lo + 0.003));
}

function eyePart(p, side) {
  const cx = side * EYE_X;
  const pts = [];
  const ring = [];
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2;
    const [x, y] = superEllipse(t, EYE_HW * p.scale, EYE_HH * p.scale, 0.75);
    ring.push([cx + x + p.lx, EYE_Y + eyeClamp(p, y + p.ly)]);
  }
  const cy = ring.reduce((s, q) => s + q[1], 0) / RING;
  pts.push([cx + p.lx, cy], ...ring);
  return pts;
}

function highlightPart(p, side, small = false) {
  const cx = side * EYE_X + (small ? 0.02 : -0.018) + p.lx * 1.1;
  const cy = (small ? -0.025 : 0.016) + p.ly;
  const s = small ? 0.008 : 0.017;
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const [x, y] = superEllipse(t, s, s, 1);
    ring.push([cx + x, EYE_Y + eyeClamp(p, cy + y)]);
  }
  const yc = ring.reduce((a, q) => a + q[1], 0) / 8;
  return [[cx, yc], ...ring];
}

// --- Sourcils ---------------------------------------------------------------
function browPart(name, side) {
  const raise = name === 'browUp' ? 1 : name === 'browDown' ? -0.7 : 0;
  const sad = name === 'browSad' ? 1 : 0;
  const angry = name === 'browAngry' ? 1 : 0;
  const cx = side * 0.19, cy = 0.13, hw = 0.07, hh = 0.016;
  const ring = [];
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2;
    const [x, y] = superEllipse(t, hw, hh, 0.4);
    const inner = (1 - side * x / hw) / 2; // 1 côté nez, 0 côté tempe
    const dy = raise * 0.035 + inner * (sad * 0.035 - angry * 0.035) + 0.008 * (1 - inner);
    ring.push([cx + x, cy + y + dy]);
  }
  const yc = ring.reduce((a, q) => a + q[1], 0) / RING;
  return [[cx, yc], ...ring];
}

function blushPart(side) {
  const ring = [];
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2;
    ring.push([side * 0.3 + 0.06 * Math.cos(t), -0.17 + 0.03 * Math.sin(t)]);
  }
  return [[side * 0.3, -0.17], ...ring];
}

function philtrumPart() {
  const ring = [[-0.0045, MOUTH_Y], [0.0045, MOUTH_Y], [0.0045, -0.168], [-0.0045, -0.168]];
  return [[0, (-0.168 + MOUTH_Y) / 2], ...ring];
}

/** Définition de chaque élément du visage. */
function faceParts() {
  const parts = [];
  parts.push({
    material: 'mouth', lift: 0.004, indices: fanIndices(RING),
    shape: (target) => mouthPart(mouthParams(target)),
  });
  parts.push({
    material: 'teeth', lift: 0.006, indices: stripIndices(BAND),
    shape: (target) => teethPart(mouthParams(target)),
  });
  parts.push({
    material: 'tongue', lift: 0.0055, indices: stripIndices(BAND),
    shape: (target) => tonguePart(mouthParams(target)),
  });
  parts.push({ material: 'mouth', lift: 0.003, indices: fanIndices(4), shape: () => philtrumPart() });
  for (const side of [1, -1]) {
    parts.push({ material: 'eye', lift: 0.004, indices: fanIndices(RING), shape: (t) => eyePart(eyeParams(t, side), side) });
    parts.push({ material: 'eyeHighlight', lift: 0.006, indices: fanIndices(8), shape: (t) => highlightPart(eyeParams(t, side), side) });
    parts.push({ material: 'eyeHighlight', lift: 0.006, indices: fanIndices(8), shape: (t) => highlightPart(eyeParams(t, side), side, true) });
    parts.push({ material: 'blush', lift: 0.002, indices: fanIndices(RING), shape: () => blushPart(side) });
    parts.push({ material: 'brow', lift: 0.004, indices: fanIndices(RING), shape: (t) => browPart(t, side) });
  }
  return parts;
}

export const FACE_MATERIALS = ['blush', 'mouth', 'tongue', 'teeth', 'eye', 'eyeHighlight', 'brow'];

/** Construit la géométrie du visage avec toutes les morph targets (relatives). */
export function buildFaceGeometry() {
  const parts = faceParts().sort(
    (a, b) => FACE_MATERIALS.indexOf(a.material) - FACE_MATERIALS.indexOf(b.material),
  );
  const toVec = (pts, lift) => pts.map(([x, y]) => headPoint(x, y, lift));
  const base = [];
  const targets = FACE_TARGETS.map(() => []);
  const index = [];
  const groups = [];
  let vertexOffset = 0;
  for (const part of parts) {
    const basePts = toVec(part.shape('base'), part.lift);
    for (const v of basePts) base.push(v.x, v.y, v.z);
    FACE_TARGETS.forEach((name, ti) => {
      const pts = toVec(part.shape(name), part.lift);
      pts.forEach((v, i) => targets[ti].push(v.x - basePts[i].x, v.y - basePts[i].y, v.z - basePts[i].z));
    });
    const start = index.length;
    for (const i of part.indices) index.push(i + vertexOffset);
    const matIndex = FACE_MATERIALS.indexOf(part.material);
    const prev = groups[groups.length - 1];
    if (prev && prev.materialIndex === matIndex) prev.count += part.indices.length;
    else groups.push({ start, count: part.indices.length, materialIndex: matIndex });
    vertexOffset += basePts.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
  const normals = [];
  for (let i = 0; i < base.length; i += 3) normals.push(0, 0, 1);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.morphTargetsRelative = true;
  g.morphAttributes.position = targets.map((arr, i) => {
    const attr = new THREE.Float32BufferAttribute(arr, 3);
    attr.name = FACE_TARGETS[i];
    return attr;
  });
  return g;
}
