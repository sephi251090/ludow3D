import { LudoAvatar } from './LudoAvatar.js';

/**
 * Composant web : <ludo-avatar lang="fr-FR" framing="bust" expression="happy"></ludo-avatar>
 *
 * Attributs : lang, framing (bust|face|full), background, expression, state, no-outlines.
 * Méthodes : speak(text), playAudio(input), setExpression(name), setState(state), stopSpeaking().
 * Propriété : avatar (instance LudoAvatar), rig (LudoRig).
 */
export class LudoAvatarElement extends HTMLElement {
  static observedAttributes = ['expression', 'state', 'framing'];

  connectedCallback() {
    if (this.avatar) return;
    if (!this.style.display) this.style.display = 'block';
    if (!this.style.height && !this.getAttribute('style')?.includes('height')) this.style.height = '400px';
    this.avatar = new LudoAvatar(this, {
      lang: this.getAttribute('lang') || 'fr-FR',
      framing: this.getAttribute('framing') || 'bust',
      background: this.getAttribute('background'),
      outlines: !this.hasAttribute('no-outlines'),
    });
    this.rig = this.avatar.rig;
    for (const a of LudoAvatarElement.observedAttributes) {
      if (this.hasAttribute(a)) this.attributeChangedCallback(a, null, this.getAttribute(a));
    }
    this.rig.addEventListener('state', (e) => this.dispatchEvent(new CustomEvent('ludo-state', { detail: e.detail })));
    this.dispatchEvent(new CustomEvent('ludo-ready', { detail: { avatar: this.avatar } }));
  }

  disconnectedCallback() {
    this.avatar?.dispose();
    this.avatar = null;
  }

  attributeChangedCallback(name, _old, value) {
    if (!this.avatar || value == null) return;
    if (name === 'expression') this.avatar.setExpression(value);
    if (name === 'state') this.avatar.setState(value);
    if (name === 'framing') this.avatar.setFraming(value);
  }

  speak(text) { return this.avatar.speak(text); }
  playAudio(input, opts) { return this.avatar.playAudio(input, opts); }
  setExpression(name, opts) { this.avatar.setExpression(name, opts); }
  setState(state) { this.avatar.setState(state); }
  stopSpeaking() { this.avatar.stopSpeaking(); }
}

if (typeof customElements !== 'undefined' && !customElements.get('ludo-avatar')) {
  customElements.define('ludo-avatar', LudoAvatarElement);
}
