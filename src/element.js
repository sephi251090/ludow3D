import { LudoSprite } from './LudoSprite.js';

/**
 * Composant web : <ludo-sprite lang="fr-FR" expression="happy" style="height:400px"></ludo-sprite>
 *
 * Attributs : lang, expression, state, src (image du sprite).
 * Méthodes : speak(text), playAudio(input), setExpression(name), setState(state), stopSpeaking().
 * Propriété : ludo (instance LudoSprite).
 */
export class LudoSpriteElement extends HTMLElement {
  static observedAttributes = ['expression', 'state'];

  connectedCallback() {
    if (this.ludo) return;
    if (!this.style.display) this.style.display = 'block';
    if (!this.style.height) this.style.height = '400px';
    const opts = { lang: this.getAttribute('lang') || 'fr-FR' };
    if (this.hasAttribute('src')) opts.src = this.getAttribute('src');
    this.ludo = new LudoSprite(this, opts);
    for (const a of LudoSpriteElement.observedAttributes) {
      if (this.hasAttribute(a)) this.attributeChangedCallback(a, null, this.getAttribute(a));
    }
    this.ludo.addEventListener('state', (e) => this.dispatchEvent(new CustomEvent('ludo-state', { detail: e.detail })));
    this.ludo.ready.then(() => this.dispatchEvent(new CustomEvent('ludo-ready', { detail: { ludo: this.ludo } })));
  }

  disconnectedCallback() {
    this.ludo?.dispose();
    this.ludo = null;
  }

  attributeChangedCallback(name, _old, value) {
    if (!this.ludo || value == null) return;
    if (name === 'expression') this.ludo.setExpression(value);
    if (name === 'state') this.ludo.setState(value);
  }

  speak(text) { return this.ludo.speak(text); }
  playAudio(input, opts) { return this.ludo.playAudio(input, opts); }
  setExpression(name, opts) { this.ludo.setExpression(name, opts); }
  setState(state) { this.ludo.setState(state); }
  stopSpeaking() { this.ludo.stopSpeaking(); }
}

if (typeof customElements !== 'undefined' && !customElements.get('ludo-sprite')) {
  customElements.define('ludo-sprite', LudoSpriteElement);
}
