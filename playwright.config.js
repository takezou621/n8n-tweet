/**
 * Playwright Configuration for n8n-tweet E2E Tests
 */

module.exports = {
  testDir: './tests/playwright',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/playwright-results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { 
        ...require('@playwright/test').devices['Desktop Chrome'],
        headless: true
      }
    },
    {
      name: 'firefox',
      use: { 
        ...require('@playwright/test').devices['Desktop Firefox'],
        headless: true
      }
    },
    {
      name: 'webkit',
      use: { 
        ...require('@playwright/test').devices['Desktop Safari'],
        headless: true
      }
    },
    {
      name: 'mobile-chrome',
      use: { 
        ...require('@playwright/test').devices['Pixel 5'],
        headless: true
      }
    }
  ],
  webServer: {
    command: 'node src/dashboard/server.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
};