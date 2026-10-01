import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildLudo } from './avatar/buildLudo.js';

/** Clips d'animation livrés avec le .glb (utilisables dans n'importe quel moteur). */
export function createLudoClips(model) {
  const face = model.getObjectByName('Ludo_Face');
  if (!face) throw new Error('Ludo_Face introuvable');
  const morph = (name, times, values) =>
    new THREE.NumberKeyframeTrack(`Ludo_Face.morphTargetInfluences[${name}]`, times, values);
  const rot = (node, times, eulers) => new THREE.QuaternionKeyframeTrack(
    `${node}.quaternion`, times,
    eulers.flatMap((e) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...e)).toArray()),
  );
  const earL = model.getObjectByName('EarPivot_L').rotation;
  const earR = model.getObjectByName('EarPivot_R').rotation;
  const pony = model.getObjectByName('PonytailPivot').rotation;
  const E = (r, dx = 0, dy = 0, dz = 0) => [r.x + dx, r.y + dy, r.z + dz];

  const talk = ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_U'].map((n, i) => {
    const t0 = 0.05 + i * 0.3;
    return morph(n, [0, t0, t0 + 0.12, t0 + 0.26, 1.3], [0, 0, 1, 0, 0]);
  });

  return [
    new THREE.AnimationClip('Blink', 0.2, [
      morph('eyeBlinkLeft', [0, 0.08, 0.2], [0, 1, 0]),
      morph('eyeBlinkRight', [0, 0.08, 0.2], [0, 1, 0]),
    ]),
    new THREE.AnimationClip('EarTwitch', 0.5, [
      rot('EarPivot_L', [0, 0.08, 0.2, 0.32, 0.5],
        [E(earL), E(earL, 0.35, 0, -0.25), E(earL, -0.1, 0, 0.08), E(earL, 0.05), E(earL)]),
    ]),
    new THREE.AnimationClip('Idle', 4, [
      rot('HeadPivot', [0, 1, 2, 3, 4], [[0, 0, 0], [0.02, 0.05, 0.02], [0, 0, 0], [0.02, -0.05, -0.02], [0, 0, 0]]),
      rot('PonytailPivot', [0, 1, 2, 3, 4], [E(pony), E(pony, 0, 0, -0.05), E(pony), E(pony, 0, 0, 0.05), E(pony)]),
      morph('eyeBlinkLeft', [0, 2.4, 2.48, 2.6, 4], [0, 0, 1, 0, 0]),
      morph('eyeBlinkRight', [0, 2.4, 2.48, 2.6, 4], [0, 0, 1, 0, 0]),
    ]),
    new THREE.AnimationClip('Listening', 1, [
      rot('HeadPivot', [0, 1], [[0.05, 0, 0.09], [0.05, 0, 0.09]]),
      rot('EarPivot_L', [0, 1], [E(earL, -0.22, 0, 0.1), E(earL, -0.22, 0, 0.1)]),
      rot('EarPivot_R', [0, 1], [E(earR, -0.22, 0, -0.1), E(earR, -0.22, 0, -0.1)]),
    ]),
    new THREE.AnimationClip('TalkDemo', 1.3, talk),
  ];
}

/**
 * Exporte Ludo en glTF binaire (ArrayBuffer) : matériaux PBR/unlit, sans
 * contours, bas du buste à y = 0, morph targets + clips d'animation.
 */
export async function exportLudoGLB({ animations = true } = {}) {
  const model = buildLudo({ materials: 'standard', outlines: false });
  model.position.y = 1.48;
  model.updateMatrixWorld(true);
  const clips = animations ? createLudoClips(model) : [];
  return new GLTFExporter().parseAsync(model, { binary: true, animations: clips });
}
