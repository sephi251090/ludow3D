# Ludo — la mascotte pixel-art qui parle

![Ludo qui écoute, réfléchit puis parle](docs/ludo-parle.gif)

Le sprite d'origine de Ludo, animé **pixel par pixel**, sans 3D : la bouche suit la voix
(lip-sync), les yeux clignent et suivent le pointeur, le sourcil bouge, les oreilles frétillent,
la pointe de la couette se balance et Ludo « respire ». Le tout est prêt à brancher sur une chaîne
**speech-to-text → cerveau (LLM ou autre) → text-to-speech**.

Aucune dépendance : un `<canvas>` 2D et l'image `src/sprite/ludo.webp`.

## Démarrage

```bash
npm install
npm run dev          # démo sur http://localhost:5173
npm test             # tests unitaires (Node)
npm run build        # démo statique → dist-demo/
npm run build:lib    # bibliothèque ESM autonome → dist/ludo.js (image incluse)
npm run build:artifact  # page HTML unique à héberger n'importe où → artifact/dist/ludo.html
```

La démo permet de faire parler Ludo (voix du navigateur), de lui parler au micro, de tester
expressions / états / visèmes, de faire du lip-sync sur un fichier audio ou sur le micro, et
d'exporter une capture PNG.

## Utilisation

```js
import { LudoSprite } from 'ludo-sprite';

const ludo = new LudoSprite(document.getElementById('ludo'), { lang: 'fr-FR' });
await ludo.ready;
await ludo.speak("[happy] Salut, moi c'est Ludo !");
```

Ou en composant web :

```html
<script type="module" src="ludo-sprite/src/element.js"></script>
<ludo-sprite id="ludo" lang="fr-FR" style="height:420px"></ludo-sprite>
<script type="module">
  document.getElementById('ludo').speak('Bonjour !');
</script>
```

## Brancher le speech-to-text

`LudoConversation` enchaîne **écoute → réflexion → parole** et pilote les états de Ludo
(`listening` : oreilles dressées, sourcil levé ; `thinking` : regard en l'air et bulle « … » ;
`speaking` : lip-sync et petits hochements).

```js
import { LudoSprite, LudoConversation, BrowserSTT, BrowserTTS } from 'ludo-sprite';

const ludo = new LudoSprite(el);
const convo = new LudoConversation({
  rig: ludo,
  stt: new BrowserSTT({ lang: 'fr-FR' }),     // Web Speech API (Chrome, Edge, Safari)
  tts: new BrowserTTS({ lang: 'fr-FR' }),
  respond: async (text, history) => {          // votre logique : LLM, règles, FAQ…
    const r = await fetch('/api/ludo', { method: 'POST', body: JSON.stringify({ text, history }) });
    return (await r.json()).text;              // peut contenir des balises [happy], [sad]…
  },
});
await convo.turn();   // un échange ; convo.start() pour une conversation continue
```

Chaque brique est remplaçable :

| Besoin | Classe | Notes |
| --- | --- | --- |
| STT du navigateur | `BrowserSTT` | `listenOnce()` → texte final ; évènement `transcript` pour l'intermédiaire |
| STT serveur (Whisper, Deepgram, Azure…) | `MicRecorder` | `record()` → `Blob` audio, coupe au silence ; à envoyer à votre API |
| STT perso | tout objet `{ listenOnce({ rig }) }` | appelez `rig.setState('listening')` pendant l'écoute |
| TTS du navigateur | `BrowserTTS` | gratuit ; lip-sync estimé depuis le texte, recalé sur les mots |
| TTS audio (OpenAI, ElevenLabs, Piper…) | `AudioTTS({ synthesize })` | `synthesize(text)` renvoie URL / Blob / ArrayBuffer ; lip-sync par analyse du signal |
| TTS avec visèmes (Azure, Polly) | `AudioTTS` → `{ audio, cues }` | synchro exacte ; convertir avec `eventsToCues(events, { map: AZURE_VISEME_MAP })` |
| Flux live (WebRTC, agent vocal) | `ludo.lipSyncStream(mediaStream)` | la bouche suit le flux en temps réel |
| Audio ponctuel | `ludo.playAudio(blobOuUrl)` | |

Un backend d'exemple qui fait répondre Ludo avec Claude est fourni dans
[`examples/server-claude.mjs`](examples/server-claude.mjs) (la clé API reste côté serveur) :

```bash
cd examples && npm install
ANTHROPIC_API_KEY=... node server-claude.mjs   # puis, dans la démo : mode « Endpoint HTTP »,
                                               # URL http://localhost:8787/api/ludo
```

## Expressions et états

```js
ludo.setExpression('happy');                       // neutral happy sad surprised angry thinking wink smug
ludo.setExpression('surprised', { duration: 2 });  // revient à neutral après 2 s
ludo.setState('listening');                        // idle listening thinking speaking
ludo.lookAt(0.5, 0.2);                             // regard (x, y ∈ [-1, 1]) ; null = autonome
ludo.twitchEar('left');
ludo.setVisemes({ O: 1 });                         // contrôle manuel de la bouche (null pour rendre la main)
```

Dans un texte à prononcer, les balises `[happy]`, `[sad]`… changent l'expression au fil de la
phrase : il suffit de demander à votre LLM de les utiliser.

## Comment ça marche

Le sprite est du pixel-art agrandi : un « vrai » pixel fait ~15,25 px de l'image (grille 68 × 68).
L'image d'origine est affichée telle quelle, et seules les zones animées sont redessinées sur la
grille :

- **bouche** : 12 formes (fermée, ouverte, « O », « ou », dents, sourire, moue…) choisies à partir
  des 15 visèmes standard (`sil PP FF TH DD kk CH SS nn RR aa E I O U`) ;
- **yeux** : regard (pupille ±1 pixel), clignements, yeux fermés heureux, ronds, tristes, fâchés,
  clin d'œil ;
- **sourcil**, **oreilles**, **pointe de la couette**, **respiration** (1 pixel), bulle « … ».

Pour effacer un trait, on recopie la peau d'origine voisine : le grain de l'image est conservé.
Les formes sont décrites comme de petits dessins ASCII dans
[`src/sprite/frames.js`](src/sprite/frames.js), faciles à retoucher.

```
src/
  LudoSprite.js         rendu canvas + animation (clignements, regard, oreilles, états, lip-sync)
  element.js            composant web <ludo-sprite>
  sprite/ludo.webp      le sprite d'origine
  sprite/frames.js      grille, bouches, yeux, sourcil, expressions
  lipsync/              visèmes (texte → visèmes en français), chronologies, analyse audio
  conversation/         BrowserTTS, AudioTTS, BrowserSTT, MicRecorder, LudoConversation
```

## Limites connues

- `BrowserTTS` ne donne pas accès au signal audio : la bouche suit une estimation à partir du texte,
  recalée sur les mots quand le navigateur émet les évènements `boundary`. Pour une synchro parfaite,
  utilisez `AudioTTS`.
- La reconnaissance vocale du navigateur dépend de Chrome / Edge / Safari (pas Firefox) ;
  utilisez `MicRecorder` + un STT serveur pour couvrir tous les navigateurs.
- Le second sourcil est caché par la frange sur le sprite : seul le sourcil visible est animé.
