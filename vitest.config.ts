import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@stash/card-spec': path.resolve(__dirname, './packages/card-spec/src/index.ts'),
      '@stash/card-core': path.resolve(__dirname, './packages/card-core/src/index.ts'),
      '@stash/card-react': path.resolve(__dirname, './packages/card-react/src/index.ts'),
      '@stash/card-canvas': path.resolve(__dirname, './packages/card-canvas/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/**/test/**/*.test.ts', 'packages/**/test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
