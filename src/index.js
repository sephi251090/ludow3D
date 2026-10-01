// Ludo 3D — mascotte parlante.
export { buildLudo } from './avatar/buildLudo.js';
export { LudoRig, EXPRESSIONS, STATES } from './avatar/LudoRig.js';
export { FACE_TARGETS } from './avatar/face.js';
export { PALETTE } from './avatar/palette.js';
export { LudoAvatar } from './LudoAvatar.js';
export { LudoAvatarElement } from './element.js';
export { AudioLipSync } from './lipsync/AudioLipSync.js';
export { TimelineLipSync } from './lipsync/TimelineLipSync.js';
export {
  VISEMES, AZURE_VISEME_MAP, RHUBARB_MAP, POLLY_MAP, textToVisemes, eventsToCues,
} from './lipsync/visemes.js';
export { BrowserTTS, AudioTTS, BrowserSTT, MicRecorder, splitSentences } from './conversation/speech.js';
export { LudoConversation, parseExpressionTags } from './conversation/LudoConversation.js';
export { exportLudoGLB, createLudoClips } from './exportGLB.js';
