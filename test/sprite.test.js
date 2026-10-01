import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOUTHS, VISEME_TO_MOUTH, mouthForVisemes, EYE_BOXES, eyePixels, BROW_BOX, browPixels,
  EXPRESSIONS, COLORS,
} from '../src/sprite/frames.js';
import { VISEMES } from '../src/lipsync/visemes.js';

const inBox = ([c0, r0, w, h], [c, r]) => c >= c0 && c < c0 + w && r >= r0 && r < r0 + h;
const known = new Set(['.', '_', ...Object.keys(COLORS)]);

test('toutes les bouches ont la même taille et des couleurs connues', () => {
  const ref = MOUTHS.closed;
  for (const [name, rows] of Object.entries(MOUTHS)) {
    assert.equal(rows.length, ref.length, name);
    for (const row of rows) {
      assert.equal(row.length, ref[0].length, `${name}: ${row}`);
      for (const ch of row) assert.ok(known.has(ch), `${name}: ${ch}`);
    }
    assert.equal(rows[0][5], '#', `${name} garde le sillon nez-bouche`);
  }
});

test('chaque visème a une forme de bouche', () => {
  for (const v of VISEMES) assert.ok(MOUTHS[VISEME_TO_MOUTH[v]], v);
});

test('mouthForVisemes choisit le visème dominant', () => {
  assert.equal(mouthForVisemes({ aa: 0.9, E: 0.3 }), 'open');
  assert.equal(mouthForVisemes({ O: 0.5, sil: 1 }), 'O');
  assert.equal(mouthForVisemes({ aa: 0.05 }), null);
  assert.equal(mouthForVisemes(null), null);
});

test('les yeux restent dans les verres, quel que soit le regard', () => {
  const shapes = ['open', 'half', 'closed', 'happy', 'wide', 'sad', 'angry'];
  for (const side of ['left', 'right']) {
    for (const s of shapes) {
      for (const gx of [-1, 0, 1]) {
        for (const gy of [-1, 0]) {
          const px = eyePixels(side, s, gx, gy);
          assert.ok(px.length > 0);
          for (const p of px) assert.ok(inBox(EYE_BOXES[side], p), `${side}/${s}/${gx},${gy}: ${p}`);
        }
      }
    }
  }
});

test('le sourcil reste dans sa zone', () => {
  for (const s of ['neutral', 'up', 'angry', 'sad']) {
    for (const p of browPixels(s)) assert.ok(inBox(BROW_BOX, p), `${s}: ${p}`);
  }
});

test('les expressions référencent des formes existantes', () => {
  for (const [name, e] of Object.entries(EXPRESSIONS)) {
    assert.ok(MOUTHS[e.mouth], `${name}.mouth`);
    for (const eye of [e.eyes].flat()) assert.ok(eyePixels('left', eye).length, `${name}.eyes`);
  }
});
