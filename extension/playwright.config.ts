import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke test config (plan §5.2).
 *
 * Drives the real MAIN-world compositor module (`src/inject/compositor.ts`)
 * against a local fixture page — see `test-fixtures/compositor-fixture.html`
 * for exactly what this proves and does not prove (not a real Meet call).
 *
 * `--use-fake-device-for-media-stream` (+ `--use-fake-ui-for-media-stream` to
 * skip the permission prompt) gives Chromium a synthetic, deterministic
 * camera feed so `getUserMedia` resolves without any real hardware or
 * consent UI, headlessly.
 */
export default defineConfig({
  testDir: './test',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'npx vite --config vite.fixture.config.ts',
    port: 5183,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5183',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
});
