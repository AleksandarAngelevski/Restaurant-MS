import { defineConfig } from '@playwright/test';

// Smoke tests run against an already running stack (docker compose up, or the dev servers).
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: 1, // the tests share one database
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
});
