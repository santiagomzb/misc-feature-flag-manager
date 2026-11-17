import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5174',
    launchOptions: { slowMo: process.argv.includes('--headed') ? 300 : 0 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter ./backend dev',
      url: 'http://127.0.0.1:3101/api/flags',
      env: {
        PORT: '3101',
        FLAG_STORE_PATH: resolve('.e2e-data', `flags-${Date.now()}.json`),
      },
    },
    {
      command: 'pnpm --filter ./frontend dev --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101' },
    },
  ],
});
