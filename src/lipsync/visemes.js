/**
 * Jeu de visèmes standard (Oculus / Meta OVR LipSync, aussi utilisé par
 * Ready Player Me, Unity uLipSync, etc.). Chaque visème est exposé comme
 * morph target `viseme_<nom>` sur le maillage `Ludo_Face`.
 */
export const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];

/**
 * Correspondance des IDs de visèmes Azure Speech (0..21) vers notre jeu.
 * https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis-viseme
 */
export const AZURE_VISEME_MAP = {
  0: 'sil', 1: 'aa', 2: 'aa', 3: 'O', 4: 'E', 5: 'RR', 6: 'I', 7: 'U', 8: 'O', 9: 'aa',
  10: 'O', 11: 'aa', 12: 'kk', 13: 'RR', 14: 'nn', 15: 'SS', 16: 'CH', 17: 'TH', 18: 'FF',
  19: 'DD', 20: 'kk', 21: 'PP',
};

/** Correspondance des formes de bouche Rhubarb Lip Sync (A..H, X) vers notre jeu. */
export const RHUBARB_MAP = {
  A: 'PP', B: 'kk', C: 'E', D: 'aa', E: 'O', F: 'U', G: 'FF', H: 'nn', X: 'sil',
};

/** Correspondance des visèmes Amazon Polly vers notre jeu. */
export const POLLY_MAP = {
  sil: 'sil', p: 'PP', t: 'DD', S: 'CH', T: 'TH', f: 'FF', k: 'kk', i: 'I', r: 'RR',
  s: 'SS', u: 'U', '@': 'E', a: 'aa', e: 'E', E: 'E', o: 'O', O: 'O',
};

const VOWELS = new Set(['aa', 'E', 'I', 'O', 'U']);
export const isVowel = (v) => VOWELS.has(v);

// Règles graphème → visème, essayées de la plus longue à la plus courte.
// Pensées pour le français, mais donnent un résultat crédible en anglais.
const RULES = [
  ['eaux', ['O']], ['eau', ['O']], ['aient', ['E']], ['ain', ['E']], ['ein', ['E']],
  ['oin', ['U', 'E']], ['oi', ['U', 'aa']], ['oy', ['U', 'aa']], ['ou', ['U']], ['oo', ['U']],
  ['au', ['O']], ['ai', ['E']], ['ei', ['E']], ['eu', ['E']], ['œu', ['E']], ['ee', ['I']],
  ['an', ['aa']], ['am', ['aa']], ['en', ['aa']], ['em', ['aa']], ['on', ['O']], ['om', ['O']],
  ['in', ['E']], ['im', ['E']], ['un', ['E']], ['ch', ['CH']], ['sh', ['CH']], ['ph', ['FF']],
  ['th', ['TH']], ['qu', ['kk']], ['gn', ['nn']], ['ll', ['nn']], ['ss', ['SS']], ['tion', ['SS', 'I', 'O']],
  ['a', ['aa']], ['à', ['aa']], ['â', ['aa']], ['e', ['E']], ['é', ['E']], ['è', ['E']], ['ê', ['E']], ['ë', ['E']],
  ['i', ['I']], ['î', ['I']], ['ï', ['I']], ['y', ['I']], ['o', ['O']], ['ô', ['O']], ['u', ['U']], ['ù', ['U']],
  ['û', ['U']], ['ü', ['U']], ['w', ['U']],
  ['b', ['PP']], ['p', ['PP']], ['m', ['PP']], ['f', ['FF']], ['v', ['FF']], ['t', ['DD']], ['d', ['DD']],
  ['l', ['nn']], ['n', ['nn']], ['k', ['kk']], ['c', ['kk']], ['q', ['kk']], ['g', ['kk']], ['x', ['kk', 'SS']],
  ['s', ['SS']], ['z', ['SS']], ['ç', ['SS']], ['j', ['CH']], ['r', ['RR']], ['h', []],
];
RULES.sort((a, b) => b[0].length - a[0].length);

// Lettres finales généralement muettes en français.
const SILENT_FINALS = /[estdxpz]$/;

const PAUSES = { ',': 0.22, ';': 0.3, ':': 0.3, '.': 0.42, '!': 0.42, '?': 0.42, '…': 0.5, '\n': 0.4 };

/**
 * Convertit un texte en chronologie de visèmes.
 * Retourne { cues: [{ viseme, start, end, charIndex }], duration } (secondes).
 * `rate` suit la convention de SpeechSynthesis (1 = normal).
 */
export function textToVisemes(text, { rate = 1, lang = 'fr' } = {}) {
  const french = lang.toLowerCase().startsWith('fr');
  const cues = [];
  let t = 0;
  const vowelDur = 0.11 / rate;
  const consDur = 0.065 / rate;
  const re = /([\p{L}'’-]+)|([,;:.!?…\n])|(\s+)/gu;
  let m;
  while ((m = re.exec(text))) {
    if (m[2]) {
      t += (PAUSES[m[2]] ?? 0.2) / rate;
      continue;
    }
    if (m[3]) {
      t += 0.04 / rate;
      continue;
    }
    let word = m[1].toLowerCase().replace(/[’']/g, '');
    const wordStart = m.index;
    if (french && word.length > 2) {
      // On retire une lettre muette finale (ex. "petit" -> "peti", "chats" -> "chat").
      while (word.length > 2 && SILENT_FINALS.test(word) && !/(ez|er)$/.test(word)) {
        word = word.slice(0, -1);
        if (!/[st]$/.test(word)) break;
      }
    }
    let i = 0;
    while (i < word.length) {
      let matched = false;
      for (const [g, vs] of RULES) {
        if (word.startsWith(g, i)) {
          for (const v of vs) {
            const d = isVowel(v) ? vowelDur : consDur;
            cues.push({ viseme: v, start: t, end: t + d, charIndex: wordStart + i });
            t += d;
          }
          i += g.length;
          matched = true;
          break;
        }
      }
      if (!matched) i++;
    }
  }
  return { cues, duration: t };
}

/** Normalise une liste d'évènements { viseme, time } (ex. Azure) en cues avec fin. */
export function eventsToCues(events, { map = null, tail = 0.12 } = {}) {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  return sorted.map((e, i) => {
    const viseme = map ? map[e.viseme] ?? 'sil' : e.viseme;
    const end = i + 1 < sorted.length ? sorted[i + 1].time : e.time + tail;
    return { viseme, start: e.time, end };
  });
}
