import { EXPRESSIONS } from '../sprite/frames.js';

/**
 * Extrait les balises d'expression d'une réponse, ex. "[happy] Salut !".
 * Utile pour laisser un LLM choisir l'humeur de Ludo.
 * Retourne [{ expression, text }] dans l'ordre.
 */
export function parseExpressionTags(reply) {
  const re = /\[(\w+)\]/g;
  const segments = [];
  let last = 0;
  let current = null;
  let m;
  while ((m = re.exec(reply))) {
    const name = m[1].toLowerCase();
    if (!EXPRESSIONS[name]) continue;
    const text = reply.slice(last, m.index).trim();
    if (text) segments.push({ expression: current, text });
    current = name;
    last = m.index + m[0].length;
  }
  const rest = reply.slice(last).trim();
  if (rest || current) segments.push({ expression: current, text: rest });
  return segments;
}

/**
 * Boucle de conversation : écoute (STT) → réflexion (votre logique / LLM) → parole (TTS).
 *
 *   const convo = new LudoConversation({
 *     rig: ludo,               // instance LudoSprite
 *     stt: new BrowserSTT({ lang: 'fr-FR' }),
 *     tts: new BrowserTTS({ lang: 'fr-FR' }),
 *     respond: async (text, history) => (await fetch('/api/ludo', {...})).text(),
 *   });
 *   await convo.turn();
 *
 * `stt` doit exposer `listenOnce({ rig }) → Promise<string>` ;
 * `tts` doit exposer `speak(text, rig)` et `stop()`.
 */
export class LudoConversation extends EventTarget {
  constructor({ rig, stt = null, tts, respond = async (t) => t, maxHistory = 20 } = {}) {
    super();
    Object.assign(this, { rig, stt, tts, respond, maxHistory });
    this.history = [];
    this.running = false;
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Fait dire un texte à Ludo (gère les balises [expression]). */
  async say(reply) {
    for (const seg of parseExpressionTags(reply)) {
      if (seg.expression) this.rig.setExpression(seg.expression);
      if (seg.text) await this.tts.speak(seg.text, this.rig);
    }
    this._emit('spoken', { text: reply });
  }

  /** Traite un texte (déjà transcrit) : réflexion puis réponse orale. */
  async handle(userText) {
    if (!userText) return null;
    this.history.push({ role: 'user', content: userText });
    this._emit('user', { text: userText });
    this.rig.setState('thinking');
    let reply;
    try {
      reply = await this.respond(userText, this.history.slice(-this.maxHistory));
    } catch (err) {
      this.rig.setState('idle');
      this.rig.setExpression('sad', { duration: 3 });
      this._emit('error', { error: err });
      throw err;
    }
    if (typeof reply === 'object' && reply) {
      if (reply.expression) this.rig.setExpression(reply.expression);
      reply = reply.text ?? '';
    }
    this.history.push({ role: 'assistant', content: reply });
    this._emit('reply', { text: reply });
    this.rig.setState('idle');
    await this.say(reply);
    return reply;
  }

  /** Un tour complet : écoute → réponse. */
  async turn() {
    if (!this.stt) throw new Error('Aucun moteur STT configuré');
    const text = await this.stt.listenOnce({ rig: this.rig });
    this._emit('transcript', { text });
    return this.handle(text);
  }

  /** Conversation continue jusqu'à stop(). */
  async start() {
    this.running = true;
    while (this.running) {
      try {
        await this.turn();
      } catch (err) {
        this._emit('error', { error: err });
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  stop() {
    this.running = false;
    this.stt?.stop?.();
    this.tts?.stop?.();
    this.rig.setState('idle');
  }
}
