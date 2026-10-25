import { defineConfig, devices } from '@playwright/test'
import { TEST_BASE_URL } from './tests/fixtures/config'

const baseURL = `http://127.0.0.1:3101${TEST_BASE_URL}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `npm run build:test && npm run preview -- --port 3101 --base ${TEST_BASE_URL}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
})
