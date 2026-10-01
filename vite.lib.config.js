import { defineConfig } from 'vite';

// Build de la bibliothèque (ESM) : dist/ludo.js (+ l'image du sprite).
export default defineConfig({
  build: {
    outDir: 'dist',
    lib: { entry: 'src/index.js', formats: ['es'], fileName: () => 'ludo.js' },
  },
});
