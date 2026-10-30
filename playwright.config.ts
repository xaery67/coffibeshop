import { defineConfig, devices } from '@playwright/test';

/**
 * E2E CoffeeShop — jalankan terhadap stack yang sudah hidup:
 *   docker compose up -d postgres redis     # infra
 *   npm run dev:api  &  npm run dev:web     # app (lihat README e2e)
 *
 * Base URL bisa ditimpa: E2E_BASE_URL=https://staging... npx playwright test
 * Default = web container (nginx → api). `vite preview` juga jalan (proxy /api).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile viewport: PDP memakai BottomSheet + CartFAB (PRD-FRONTEND §2.3-C).
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
