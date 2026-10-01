import {
  LudoSprite, BrowserTTS, BrowserSTT, LudoConversation, EXPRESSIONS, STATES, VISEMES,
} from '../src/index.js';

const $ = (id) => document.getElementById(id);
const avatar = new LudoSprite($('ludo'), { lang: 'fr-FR' });
const rig = avatar;
window.ludo = avatar; // pratique depuis la console : ludo.speak('Bonjour')

rig.addEventListener('state', (e) => { $('status').textContent = e.detail.state; });

// ---- Parole -----------------------------------------------------------
const tts = new BrowserTTS({ lang: 'fr-FR' });
avatar.tts = tts;
if (BrowserTTS.supported) {
  BrowserTTS.voices().then((voices) => {
    for (const v of voices.filter((x) => /^fr|^en/i.test(x.lang))) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `${v.name} (${v.lang})`;
      $('voice').append(o);
    }
  });
} else {
  $('speak').disabled = true;
  $('speak').title = 'speechSynthesis indisponible dans ce navigateur';
}
$('voice').onchange = () => { tts.voice = $('voice').value || null; };
$('speak').onclick = () => avatar.speak($('text').value);
$('stop').onclick = () => { convo.stop(); avatar.stopSpeaking(); setLoop(false); };

// ---- Conversation (STT → réponse → TTS) ---------------------------------
const log = (who, text) => {
  const div = document.createElement('div');
  div.className = who === 'Vous' ? 'u' : '';
  div.textContent = `${who} : ${text}`;
  $('log').append(div);
  $('log').scrollTop = 1e9;
};

$('mode').onchange = () => { $('endpoint').style.display = $('mode').value === 'http' ? 'block' : 'none'; };

async function respond(text, history) {
  if ($('mode').value === 'echo') {
    await new Promise((r) => setTimeout(r, 600)); // petite "réflexion"
    return `[happy] Tu as dit : ${text}`;
  }
  // Contrat attendu : POST { text, history } → { text, expression? } ou texte brut.
  const res = await fetch($('endpoint').value, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, history }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  return type.includes('json') ? res.json() : res.text();
}

const stt = new BrowserSTT({ lang: 'fr-FR' });
const convo = new LudoConversation({ rig, stt, tts, respond });
convo.addEventListener('transcript', (e) => e.detail.text && log('Vous', e.detail.text));
convo.addEventListener('reply', (e) => log('Ludo', e.detail.text));
convo.addEventListener('error', (e) => log('⚠️', e.detail.error.message));

if (!BrowserSTT.supported) {
  $('mic').disabled = $('loop').disabled = true;
  log('⚠️', 'Reconnaissance vocale indisponible ici (essayez Chrome ou Edge).');
}
$('mic').onclick = () => convo.turn().catch(() => {});

function setLoop(on) {
  $('loop').setAttribute('aria-pressed', String(on));
  if (on) convo.start(); else convo.stop();
}
$('loop').onclick = () => setLoop($('loop').getAttribute('aria-pressed') !== 'true');

// ---- Expressions, états, visèmes ----------------------------------------
for (const name of Object.keys(EXPRESSIONS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => rig.setExpression(name);
  $('expressions').append(b);
}
for (const state of STATES) {
  const b = document.createElement('button');
  b.textContent = state;
  b.onclick = () => rig.setState(state);
  $('states').append(b);
}
for (const v of VISEMES) {
  const b = document.createElement('button');
  b.textContent = v;
  b.onpointerdown = () => rig.setVisemes({ [v]: 1 });
  b.onpointerup = b.onpointerleave = () => rig.setVisemes(null);
  $('visemes').append(b);
}

// ---- Audio ------------------------------------------------------------
$('audio').onchange = async () => {
  const file = $('audio').files[0];
  if (file) await avatar.playAudio(file);
};

let micStream = null;
$('micsync').onclick = async () => {
  if (micStream) {
    avatar.stopStream();
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    $('micsync').setAttribute('aria-pressed', 'false');
    return;
  }
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  await avatar.audioLipSync.context.resume();
  avatar.lipSyncStream(micStream);
  $('micsync').setAttribute('aria-pressed', 'true');
};

// ---- Export ---------------------------------------------------------------
const download = (href, name) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
};
$('png').onclick = () => download(avatar.snapshot(), 'ludo.png');
