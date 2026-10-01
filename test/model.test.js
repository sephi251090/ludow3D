import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLudo } from '../src/avatar/buildLudo.js';
import { FACE_TARGETS } from '../src/avatar/face.js';
import { LudoRig, EXPRESSIONS, STATES } from '../src/avatar/LudoRig.js';
import { VISEMES } from '../src/lipsync/visemes.js';

test('le modèle expose toutes les parties nommées', () => {
  const m = buildLudo({ materials: 'standard', outlines: false });
  for (const n of ['Body', 'HeadPivot', 'Head', 'Ludo_Face', 'EarPivot_L', 'EarPivot_R', 'PonytailPivot', 'Glasses', 'Logo']) {
    assert.ok(m.getObjectByName(n), n);
  }
});

test('le visage porte tous les visèmes et blendshapes', () => {
  const face = buildLudo({ outlines: false }).getObjectByName('Ludo_Face');
  assert.deepEqual(Object.keys(face.morphTargetDictionary), FACE_TARGETS);
  for (const v of VISEMES) assert.ok(`viseme_${v}` in face.morphTargetDictionary);
  const pos = face.geometry.attributes.position;
  for (const t of face.geometry.morphAttributes.position) {
    assert.equal(t.count, pos.count);
    assert.ok(t.array.every(Number.isFinite), t.name);
  }
});

test('le rig anime le visage sans erreur dans tous les états et expressions', () => {
  const model = buildLudo({ outlines: false });
  const rig = new LudoRig(model);
  const face = model.getObjectByName('Ludo_Face');
  for (const s of STATES) {
    rig.setState(s);
    for (const e of Object.keys(EXPRESSIONS)) {
      rig.setExpression(e);
      for (let i = 0; i < 10; i++) rig.update(1 / 60);
    }
  }
  rig.setExpression('neutral');
  rig.setVisemes({ aa: 1 });
  for (let i = 0; i < 30; i++) rig.update(1 / 60);
  const aa = face.morphTargetInfluences[face.morphTargetDictionary.viseme_aa];
  assert.ok(aa > 0.9, `viseme_aa = ${aa}`);
  assert.ok(face.morphTargetInfluences.every((x) => x >= 0 && x <= 1));
});
