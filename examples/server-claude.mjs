// Backend d'exemple : donne un cerveau à Ludo avec Claude.
// La démo (mode "Endpoint HTTP") envoie POST { text, history } et attend { text }.
//
//   cd examples && npm install && ANTHROPIC_API_KEY=... node server-claude.mjs
//   → puis dans la démo : http://localhost:8787/api/ludo
//
// La clé API reste côté serveur : ne l'exposez jamais dans le navigateur.
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const PORT = process.env.PORT || 8787;

const SYSTEM = `Tu es Ludo, la mascotte de FT : une chatte aux cheveux blonds avec une couette, \
des lunettes noires carrées et un air un peu blasé mais bienveillant.
Tu parles à voix haute via une synthèse vocale : réponds en français, en 1 à 3 phrases courtes, \
sans markdown, sans listes, sans emoji.
Tu peux changer d'expression en insérant une balise avant une phrase, parmi : \
[neutral] [happy] [sad] [surprised] [angry] [thinking] [wink] [smug].
Exemple : "[happy] Salut ! [thinking] Hmm, laisse-moi réfléchir..."`;

async function reply(text, history = []) {
  // L'historique envoyé par le client finit déjà par le message utilisateur courant.
  const messages = history.length
    ? history.map((m) => ({ role: m.role, content: String(m.content) }))
    : [{ role: 'user', content: text }];
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 1024,
    output_config: { effort: 'low' }, // conversation vocale : on privilégie la latence
    // Si une réponse est refusée par les filtres de sécurité, l'API la rejoue sur un modèle de repli.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages,
  });

  if (response.stop_reason === 'refusal') return '[sad] Désolée, je ne peux pas répondre à ça.';
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'POST' || req.url !== '/api/ludo') {
    res.statusCode = 404;
    return res.end();
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const { text, history } = JSON.parse(body);
    const out = await reply(text, history);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ text: out }));
  } catch (err) {
    console.error(err);
    res.statusCode = err instanceof Anthropic.APIError ? 502 : 400;
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, () => console.log(`Ludo écoute sur http://localhost:${PORT}/api/ludo`));
