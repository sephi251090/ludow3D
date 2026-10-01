// Exporte Ludo en glTF binaire (public/ludo.glb) avec ses morph targets
// (visèmes + expressions) et quelques clips d'animation, pour Unity, Unreal,
// Godot, Blender, etc.
//
//   npm run export:glb
import { writeFile, mkdir } from 'node:fs/promises';

// GLTFExporter s'appuie sur FileReader (API navigateur).
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;
      this.onloadend?.(); this.onload?.({ target: this });
    });
  }
};
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('normalized normal')) warn(...a); };

const { exportLudoGLB } = await import('../src/exportGLB.js');
const { FACE_TARGETS } = await import('../src/avatar/face.js');
const glb = await exportLudoGLB();
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/ludo.glb', import.meta.url), Buffer.from(glb));
console.log(`public/ludo.glb écrit (${(glb.byteLength / 1024).toFixed(0)} Ko)`);
console.log(`Morph targets (Ludo_Face) : ${FACE_TARGETS.join(', ')}`);
