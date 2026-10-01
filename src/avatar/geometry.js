import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Dimensions de la tête (ellipsoïde), en unités de scène. */
export const HEAD = { a: 0.52, b: 0.48, c: 0.46 };

/** Profondeur (z) de la surface de la tête au point (x, y), plus un décalage. */
export function headZ(x, y, offset = 0) {
  const xe = x / cheekWidening(y);
  const k = 1 - (xe / HEAD.a) ** 2 - (y / HEAD.b) ** 2;
  return HEAD.c * Math.sqrt(Math.max(0, k)) + offset;
}

/** Élargissement des joues (bas du visage plus large, comme le sprite). */
export function cheekWidening(y) {
  return y < 0 ? 1 + 0.06 * Math.sin(Math.min(1, -y / HEAD.b) * Math.PI) : 1;
}

/** Point 3D sur la surface de la tête, poussé vers l'extérieur le long de la normale. */
export function headPoint(x, y, lift = 0) {
  const p = new THREE.Vector3(x, y, headZ(x, y));
  return p.addScaledVector(headNormal(p), lift);
}

/** Normale de l'ellipsoïde de la tête au point p. */
export function headNormal(p) {
  return new THREE.Vector3(p.x / HEAD.a ** 2, p.y / HEAD.b ** 2, p.z / HEAD.c ** 2).normalize();
}

/**
 * Mèche / tube effilé suivant une courbe, à section elliptique.
 * - points: Vector3[] (courbe Catmull-Rom)
 * - radius(t): rayon le long de la mèche (t ∈ [0,1])
 * - flat: facteur d'aplatissement de la section (1 = rond)
 * - up(p, tangent): direction "normale" de la section (ex. normale de la tête)
 */
export function strandGeometry(points, { radius, flat = 1, up, segments = 24, radial = 10 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [];
  const idx = [];
  const tmpUp = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    const N = (up ? up(p, T) : new THREE.Vector3(0, 0, 1)).clone();
    N.addScaledVector(T, -N.dot(T)).normalize();
    if (N.lengthSq() < 1e-6) N.copy(tmpUp.set(0, 1, 0));
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    const r = Math.max(radius(t), 0.0005);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const v = p.clone()
        .addScaledVector(B, Math.cos(a) * r)
        .addScaledVector(N, Math.sin(a) * r * flat);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Capuchons aux deux extrémités.
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);
  const s = pos.length / 3;
  pos.push(start.x, start.y, start.z, end.x, end.y, end.z);
  const last = segments * radial;
  for (let j = 0; j < radial; j++) {
    idx.push(s, j, (j + 1) % radial);
    idx.push(s + 1, last + ((j + 1) % radial), last + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Géométrie lissée (normales fusionnées) pour le contour en "coque inversée". */
export function smoothOutlineGeometry(geometry) {
  const g = geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  g.morphAttributes = {};
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

/** Triangulation en éventail : [centre, ...anneau]. */
export function fanIndices(ringCount) {
  const idx = [];
  for (let i = 0; i < ringCount; i++) idx.push(0, 1 + i, 1 + ((i + 1) % ringCount));
  return idx;
}

/** Triangulation en bande : [haut(n), bas(n)]. */
export function stripIndices(n) {
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i, b = i + 1, c = n + i, d = n + i + 1;
    idx.push(a, c, b, b, c, d);
  }
  return idx;
}

/** Super-ellipse : exposant < 1 => plus carré. */
export function superEllipse(t, hw, hh, e = 0.6) {
  const c = Math.cos(t), s = Math.sin(t);
  return [hw * Math.sign(c) * Math.abs(c) ** e, hh * Math.sign(s) * Math.abs(s) ** e];
}
