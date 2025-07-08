import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 4,
  /* Timeout for each test */
  timeout: process.env.CI ? 30000 : 60000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['json', { outputFile: 'playwright-report.json' }], ['line']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* Extra HTTP headers for requests */
    extraHTTPHeaders: {
      Connection: 'close',
    },
  },

  /* Configure projects for major browsers */
  projects: process.env.CI
    ? [
        // CI: Only run essential browsers for speed
        {
          name: 'chromium',
          use: {
            ...devices['Desktop Chrome'],
            // CI-specific optimizations
            launchOptions: {
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
              ],
            },
          },
        },
        {
          name: 'Mobile Chrome',
          use: {
            ...devices['Pixel 5'],
            launchOptions: {
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
              ],
            },
          },
        },
      ]
    : [
        // Local development: Full browser coverage
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
        {
          name: 'Mobile Chrome',
          use: { ...devices['Pixel 5'] },
        },
        {
          name: 'Mobile Safari',
          use: { ...devices['iPhone 12'] },
        },
      ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 60 * 1000 : 120 * 1000, // Reduced timeout for CI
    env: {
      NODE_OPTIONS: process.env.CI
        ? '--max-old-space-size=2048' // Reduced memory for CI
        : '--max-old-space-size=4096',
      NODE_ENV: 'development',
      // Optimize Next.js for faster startup
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PRIVATE_STANDALONE: '1',
    },
    // CI-specific server optimizations
    ...(process.env.CI && {
      stderr: 'pipe',
      stdout: 'pipe',
    }),
  },
})
