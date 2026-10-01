// Ludo — la mascotte pixel-art qui parle.
export { LudoSprite } from './LudoSprite.js';
export { LudoSpriteElement } from './element.js';
export {
  EXPRESSIONS, STATES, MOUTHS, VISEME_TO_MOUTH, mouthForVisemes, GRID,
} from './sprite/frames.js';
export { AudioLipSync } from './lipsync/AudioLipSync.js';
export { TimelineLipSync } from './lipsync/TimelineLipSync.js';
export {
  VISEMES, AZURE_VISEME_MAP, RHUBARB_MAP, POLLY_MAP, textToVisemes, eventsToCues,
} from './lipsync/visemes.js';
export { BrowserTTS, AudioTTS, BrowserSTT, MicRecorder, splitSentences } from './conversation/speech.js';
export { LudoConversation, parseExpressionTags } from './conversation/LudoConversation.js';
