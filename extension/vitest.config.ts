import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@stash/card-spec': path.resolve(__dirname, '../packages/card-spec/src/index.ts'),
      '@stash/card-core': path.resolve(__dirname, '../packages/card-core/src/index.ts'),
      '@stash/card-canvas': path.resolve(__dirname, '../packages/card-canvas/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
