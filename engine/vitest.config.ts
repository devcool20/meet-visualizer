import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Engine-scoped vitest config (plan §5.2). Deliberately separate from the
 * root `vitest.config.ts` (which targets `packages/**` + root `src/**` for
 * the dashboard/extension code) so `npm test` inside `engine/` runs exactly
 * the engine's own suite, with no jsdom environment and no dependency on
 * anything outside `engine/`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@stash/card-spec': path.resolve(__dirname, '../packages/card-spec/src/index.ts'),
      '@stash/card-core': path.resolve(__dirname, '../packages/card-core/src/index.ts'),
      '@stash/card-react': path.resolve(__dirname, '../packages/card-react/src/index.ts'),
      '@stash/card-canvas': path.resolve(__dirname, '../packages/card-canvas/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10_000,
  },
});

