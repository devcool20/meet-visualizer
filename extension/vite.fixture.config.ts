import { defineConfig } from 'vite';
import path from 'path';

/**
 * Dev-server-only config for the Playwright fixture page (plan §5.2).
 *
 * Deliberately does NOT use `@crxjs/vite-plugin` — the fixture is a plain
 * web page (not an extension context), used only to prove the compositor
 * module's `getUserMedia` interception and card compositing logic run
 * correctly outside of `chrome.*` APIs, which the fixture never calls.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'test-fixtures'),
  resolve: {
    alias: {
      '@stash/card-spec': path.resolve(__dirname, '../packages/card-spec/src/index.ts'),
      '@stash/card-core': path.resolve(__dirname, '../packages/card-core/src/index.ts'),
      '@stash/card-canvas': path.resolve(__dirname, '../packages/card-canvas/src/index.ts'),
    },
  },
  server: {
    port: 5183,
    strictPort: true,
  },
});
