import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT || 3000)
const baseURL = `http://127.0.0.1:${port}`
const rpId = new URL(baseURL).hostname
const testNextAuthSecret = 'playwright-test-nextauth-secret-32-chars'
const testDatabaseUrl = 'postgresql://playwright:playwright@localhost:5432/playwright'
const testEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const ciWorkers = Number(process.env.PLAYWRIGHT_WORKERS || 2)

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
  workers: process.env.CI ? ciWorkers : 4,
  /* Timeout for each test */
  timeout: process.env.CI ? 30000 : 60000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['json', { outputFile: 'playwright-report.json' }], ['line']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

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
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 60 * 1000 : 120 * 1000, // Reduced timeout for CI
    env: {
      DATABASE_URL: process.env.DATABASE_URL || testDatabaseUrl,
      ...(process.env.DATABASE_URL_TEST && { DATABASE_URL_TEST: process.env.DATABASE_URL_TEST }),
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || testNextAuthSecret,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || baseURL,
      NODE_OPTIONS: process.env.CI
        ? '--max-old-space-size=2048' // Reduced memory for CI
        : '--max-old-space-size=4096',
      NODE_ENV: 'development',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || testEncryptionKey,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || 'playwright-client-id',
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || 'playwright-client-secret',
      ENABLE_AUDIT_LOGS: process.env.ENABLE_AUDIT_LOGS || 'false',
      ENABLE_OAUTH: process.env.ENABLE_OAUTH || 'false',
      ENABLE_WEBAUTHN: process.env.ENABLE_WEBAUTHN || 'false',
      // Optimize Next.js for faster startup
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || baseURL,
      NEXT_PUBLIC_RP_ID: process.env.NEXT_PUBLIC_RP_ID || rpId,
      NEXT_PRIVATE_STANDALONE: '1',
      PORT: String(port),
      WEBAUTHN_ORIGIN: process.env.WEBAUTHN_ORIGIN || baseURL,
      WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID || rpId,
    },
    // CI-specific server optimizations
    ...(process.env.CI && {
      stderr: 'pipe',
      stdout: 'pipe',
    }),
  },
})
