import { defineConfig } from 'vite';

// Démo : index.html → dist-demo/
export default defineConfig({
  base: './',
  build: { outDir: 'dist-demo', chunkSizeWarningLimit: 1000 },
});
