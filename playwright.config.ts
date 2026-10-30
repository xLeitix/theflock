import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const installedChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.FLOCK_CHROME_EXECUTABLE ?? (existsSync(installedChrome) ? installedChrome : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  outputDir: '.local/playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Start the real app with npm run dev first. Tests never launch a mock API or
  // silently take ownership of another service listening on the prototype port.
});
