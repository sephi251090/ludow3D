import { defineConfig } from 'vite';

// Build de la bibliothèque (ESM) : dist/ludo-3d.js — three reste une dépendance externe.
export default defineConfig({
  build: {
    outDir: 'dist',
    lib: { entry: 'src/index.js', formats: ['es'], fileName: () => 'ludo-3d.js' },
    rollupOptions: { external: [/^three/] },
  },
});
