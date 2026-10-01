import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToVisemes, eventsToCues, VISEMES, AZURE_VISEME_MAP } from '../src/lipsync/visemes.js';
import { TimelineLipSync } from '../src/lipsync/TimelineLipSync.js';
import { parseExpressionTags } from '../src/conversation/LudoConversation.js';
import { splitSentences } from '../src/conversation/speech.js';

test('textToVisemes produit une chronologie croissante de visèmes connus', () => {
  const { cues, duration } = textToVisemes('Bonjour, je suis Ludo !');
  assert.ok(cues.length > 5);
  assert.ok(duration > 0.5);
  for (let i = 0; i < cues.length; i++) {
    assert.ok(VISEMES.includes(cues[i].viseme), cues[i].viseme);
    assert.ok(cues[i].end > cues[i].start);
    if (i) assert.ok(cues[i].start >= cues[i - 1].start);
  }
  assert.equal(cues[0].viseme, 'PP'); // "B"
  assert.ok(cues.some((c) => c.viseme === 'U')); // "ou"
});

test('le débit raccourcit la chronologie', () => {
  const slow = textToVisemes('Le chat dort', { rate: 1 }).duration;
  const fast = textToVisemes('Le chat dort', { rate: 2 }).duration;
  assert.ok(fast < slow);
});

test('eventsToCues convertit des visèmes Azure', () => {
  const cues = eventsToCues([{ viseme: 21, time: 0 }, { viseme: 2, time: 0.1 }], { map: AZURE_VISEME_MAP });
  assert.deepEqual(cues.map((c) => c.viseme), ['PP', 'aa']);
  assert.equal(cues[0].end, 0.1);
});

test('TimelineLipSync échantillonne selon son horloge', () => {
  let now = 0;
  const tl = new TimelineLipSync([{ viseme: 'aa', start: 0.1, end: 0.3 }], { clock: () => now });
  now = 0.0; assert.equal(tl.sample().visemes.aa ?? 0, 0);
  now = 0.2; assert.equal(tl.sample().visemes.aa, 1);
  now = 1.0; assert.equal(tl.sample().visemes.aa ?? 0, 0);
  assert.ok(tl.finished);
});

test('parseExpressionTags découpe le texte par humeur', () => {
  assert.deepEqual(parseExpressionTags('[happy] Salut ! [sad] Bof.'), [
    { expression: 'happy', text: 'Salut !' },
    { expression: 'sad', text: 'Bof.' },
  ]);
  assert.deepEqual(parseExpressionTags('Sans balise'), [{ expression: null, text: 'Sans balise' }]);
  // Les balises inconnues restent dans le texte.
  assert.equal(parseExpressionTags('[foo] x')[0].text, '[foo] x');
});

test('splitSentences respecte la longueur max', () => {
  const parts = splitSentences('Une phrase. Une autre ! ' + 'mot '.repeat(100), 80);
  assert.ok(parts.length >= 3);
  for (const p of parts) assert.ok(p.length <= 80, p);
});
