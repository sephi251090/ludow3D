import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Construit une page HTML autonome (sprite et code inclus) : artifact/dist/ludo.html.
const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(here);
await build({
  logLevel: 'warn',
  configFile: false,
  define: { 'import.meta.url': 'self.location.href' },
  build: {
    outDir: 'dist/tmp', emptyOutDir: true, assetsInlineLimit: 10_000_000,
    lib: { entry: 'main.js', formats: ['iife'], name: 'LudoDemo', fileName: () => 'demo.js' },
  },
});
const js = fs.readFileSync('dist/tmp/demo.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('page.html', 'utf8').replace('/*__SCRIPT__*/', () => js);
fs.writeFileSync('dist/ludo.html', html);
console.log('artifact/dist/ludo.html', (html.length / 1024).toFixed(0), 'Ko');
