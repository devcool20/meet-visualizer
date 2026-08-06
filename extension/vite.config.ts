import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';
import manifest from './manifest.json' with { type: 'json' };

// Extension build. Output lands in `extension/dist/` (see .gitignore) as a
// directory that can be loaded directly via chrome://extensions ->
// "Load unpacked".
export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      '@stash/card-spec': path.resolve(__dirname, '../packages/card-spec/src/index.ts'),
      '@stash/card-core': path.resolve(__dirname, '../packages/card-core/src/index.ts'),
      '@stash/card-canvas': path.resolve(__dirname, '../packages/card-canvas/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup/popup.html'),
      },
    },
  },
});
