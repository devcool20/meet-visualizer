import { defineConfig } from 'vitest/config';

/**
 * Engine-scoped vitest config (plan §5.2). Deliberately separate from the
 * root `vitest.config.ts` (which targets `packages/**` + root `src/**` for
 * the dashboard/extension code) so `npm test` inside `engine/` runs exactly
 * the engine's own suite, with no jsdom environment and no dependency on
 * anything outside `engine/`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
