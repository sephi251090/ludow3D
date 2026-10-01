import {
  LudoSprite, BrowserTTS, TimelineLipSync, EXPRESSIONS, STATES, VISEMES, splitSentences,
} from '../src/index.js';

const $ = (id) => document.getElementById(id);

/** Parole muette : la bouche suit le texte, sans voix (si le navigateur bloque la synthèse). */
class SilentTTS {
  async speak(text, rig) {
    this._stop = false;
    rig.setState('speaking');
    try {
      for (const s of splitSentences(text)) {
        if (this._stop) break;
        const tl = TimelineLipSync.fromText(s);
        tl.start();
        rig.setLipSync(tl);
        await new Promise((r) => { this._timer = setTimeout(r, (tl.duration + 0.25) * 1000); });
      }
    } finally {
      rig.setLipSync(null);
      if (rig.state === 'speaking') rig.setState('idle');
    }
  }
  stop() { this._stop = true; clearTimeout(this._timer); }
}

const voiceTTS = BrowserTTS.supported ? new BrowserTTS({ lang: 'fr-FR' }) : null;
const silentTTS = new SilentTTS();
const ludo = new LudoSprite($('ludo'), { lang: 'fr-FR', tts: voiceTTS ?? silentTTS });
window.ludo = ludo;

const setStatus = (s) => { $('status').textContent = { idle: 'au repos', listening: 'écoute', thinking: 'réfléchit', speaking: 'parle' }[s] ?? s; $('status').dataset.state = s; };
ludo.addEventListener('state', (e) => setStatus(e.detail.state));
setStatus('idle');

if (!voiceTTS) { $('withVoice').checked = false; $('withVoice').disabled = true; $('voiceNote').hidden = false; }

const pressed = (group, btn) => {
  for (const b of $(group).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
};

$('speak').onclick = async () => {
  ludo.tts = $('withVoice').checked && voiceTTS ? voiceTTS : silentTTS;
  $('speak').disabled = true;
  try { await ludo.speak($('text').value); } catch { ludo.tts = silentTTS; await ludo.speak($('text').value); }
  finally { $('speak').disabled = false; }
};
$('stop').onclick = () => { voiceTTS?.stop(); silentTTS.stop(); ludo.stopSpeaking(); };

for (const chip of document.querySelectorAll('[data-phrase]')) {
  chip.onclick = () => { $('text').value = chip.dataset.phrase; $('speak').click(); };
}

const LABELS = {
  neutral: 'neutre', happy: 'joie', sad: 'triste', surprised: 'surprise', angry: 'fâchée',
  thinking: 'pensive', wink: 'clin d’œil', smug: 'blasée',
};
for (const name of Object.keys(EXPRESSIONS)) {
  const b = document.createElement('button');
  b.textContent = LABELS[name] ?? name;
  b.setAttribute('aria-pressed', String(name === 'neutral'));
  b.onclick = () => { ludo.setExpression(name); pressed('expressions', b); };
  $('expressions').append(b);
}
for (const state of STATES) {
  const b = document.createElement('button');
  b.textContent = { idle: 'au repos', listening: 'écoute', thinking: 'réfléchit', speaking: 'parle' }[state];
  b.setAttribute('aria-pressed', String(state === 'idle'));
  b.onclick = () => { ludo.setState(state); pressed('states', b); };
  $('states').append(b);
}
ludo.addEventListener('state', (e) => {
  for (const b of $('states').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.s === e.detail.state));
});
[...$('states').querySelectorAll('button')].forEach((b, i) => { b.dataset.s = STATES[i]; });

for (const v of VISEMES) {
  const b = document.createElement('button');
  b.textContent = v;
  b.className = 'mono';
  b.onpointerdown = () => ludo.setVisemes({ [v]: 1 });
  b.onpointerup = b.onpointerleave = () => ludo.setVisemes(null);
  b.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') ludo.setVisemes({ [v]: 1 }); };
  b.onkeyup = () => ludo.setVisemes(null);
  $('visemes').append(b);
}

$('audio').onchange = async () => {
  const file = $('audio').files[0];
  if (!file) return;
  $('audioNote').textContent = `Lecture de ${file.name}…`;
  try { await ludo.playAudio(file); $('audioNote').textContent = 'Terminé. Choisissez un autre fichier pour recommencer.'; }
  catch { $('audioNote').textContent = 'Ce fichier ne peut pas être lu. Essayez un MP3, WAV ou OGG.'; }
};
