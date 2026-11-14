// End-to-end tests: a real browser drives the built site (dist/) served locally.
// Nothing leaves the machine: AI, the article reader and web fonts are mocked in tests/e2e/helpers.mjs.
import { defineConfig } from '@playwright/test';

const PORT = 8181;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1360, height: 900 },
    trace: 'off',
  },
  webServer: [
    {
      command: `node scripts/build.mjs && node scripts/serve.mjs ${PORT}`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Firebase emulators (accounts + cloud database) for tests/e2e/accounts.spec.mjs; needs Java 21+
      command: 'npx -y firebase-tools@15.36.0 emulators:start --only auth,firestore --project demo-ptl',
      url: 'http://127.0.0.1:9099/',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // let firebase-tools stop the Java emulator it started, or the next run finds its port taken
      gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
    },
  ],
});
