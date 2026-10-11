import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Use a preinstalled Chromium when Playwright's own download isn't available.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  // Builds the app and serves it from the real Workers runtime with a local D1 database.
  webServer: {
    command: `npm run build && npx wrangler d1 migrations apply DB --local && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
