import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',              // <<< ESSENTIEL pour Electron (assets relatifs)
  build: {
    outDir: 'dist',
  }
});