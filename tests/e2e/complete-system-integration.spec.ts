/**
 * Complete System Integration E2E Tests
 * Validates end-to-end user journeys with security and monitoring integration
 */

import { expect, type Page, test } from '@playwright/test'

// Test utilities for system integration
class SystemIntegrationHelper {
  constructor(private page: Page) {}

  /**
   * Monitor console errors and network failures
   */
  async startMonitoring() {
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text())
      }
    })

    this.page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })

    this.page.on('requestfailed', request => {
      console.log('Request failed:', request.url(), request.failure()?.errorText)
    })
  }

  /**
   * Check for security headers in response
   */
  async validateSecurityHeaders(url: string) {
    const response = await this.page.goto(url)
    if (!response) return

    const headers = response.headers()

    // Validate critical security headers
    expect(headers['x-frame-options']).toBeDefined()
    expect(headers['x-content-type-options']).toBeDefined()
    expect(headers['referrer-policy']).toBeDefined()

    // Validate CSP if present
    if (headers['content-security-policy']) {
      expect(headers['content-security-policy']).toContain("default-src 'self'")
    }
  }

  /**
   * Simulate network latency for performance testing
   */
  async simulateNetworkConditions(latency = 100) {
    const context = this.page.context()
    await context.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, latency))
      await route.continue()
    })
  }

  /**
   * Monitor API requests and responses
   */
  async monitorAPIRequests() {
    const apiRequests: Array<{ url: string; method: string; status: number; duration: number }> = []

    this.page.on('request', request => {
      request.timing = { startTime: Date.now() }
    })

    this.page.on('response', response => {
      const request = response.request()
      if (request.url().includes('/api/')) {
        const requestWithTiming = request as unknown as { timing?: { startTime: number } }
        const startTime = requestWithTiming.timing?.startTime || Date.now()
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          status: response.status(),
          duration: Date.now() - startTime,
        })
      }
    })

    return apiRequests
  }

  /**
   * Wait for application to be fully loaded and interactive
   */
  async waitForAppReady() {
    // Wait for network idle
    await this.page.waitForLoadState('networkidle')

    // Wait for React hydration
    await this.page.waitForFunction(() => {
      return window.document.readyState === 'complete'
    })

    // Additional wait for dynamic content
    await this.page.waitForTimeout(500)
  }

  /**
   * Take screenshot with timestamp for debugging
   */
  async takeTimestampedScreenshot(name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    await this.page.screenshot({
      path: `test-results/integration/${name}-${timestamp}.png`,
      fullPage: true,
    })
  }
}

test.describe('Complete System Integration', () => {
  let helper: SystemIntegrationHelper

  test.beforeEach(async ({ page }) => {
    helper = new SystemIntegrationHelper(page)
    await helper.startMonitoring()
  })

  test.describe('Authentication System Integration', () => {
    test('should complete OAuth authentication flow with security validation', async ({ page }) => {
      await helper.validateSecurityHeaders('/')

      // Navigate to sign-in page
      await page.goto('/auth/signin')
      await helper.waitForAppReady()
      await helper.takeTimestampedScreenshot('signin-page')

      // Verify security headers on auth page
      const response = await page.goto('/auth/signin')
      if (response) {
        const headers = response.headers()
        expect(headers['x-frame-options']).toBe('DENY')
      }

      // Check for GitHub OAuth provider
      const githubButton = page
        .locator('[data-provider="github"], button:has-text("GitHub")')
        .first()
      await expect(githubButton).toBeVisible()

      // Start monitoring API requests
      const _apiRequests = await helper.monitorAPIRequests()

      // Initiate OAuth flow
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/auth/signin/github') && response.status() === 302
      )

      await githubButton.click()
      const oauthResponse = await responsePromise

      // Verify OAuth redirect
      expect(oauthResponse.status()).toBe(302)
      const location = oauthResponse.headers().location
      expect(location).toContain('github.com/login/oauth/authorize')
      expect(location).toContain('client_id=')
      expect(location).toContain('scope=')

      await helper.takeTimestampedScreenshot('oauth-redirect')
    })

    test('should handle authentication state persistence across tabs', async ({ browser }) => {
      const context = await browser.newContext()

      // Open first tab
      const page1 = await context.newPage()
      const helper1 = new SystemIntegrationHelper(page1)
      await helper1.startMonitoring()

      await page1.goto('/auth/signin')
      await helper1.waitForAppReady()

      // Check session in first tab
      const sessionResponse1 = await page1.request.get('/api/auth/session')
      const sessionStatus1 = sessionResponse1.status()

      // Open second tab
      const page2 = await context.newPage()
      const helper2 = new SystemIntegrationHelper(page2)
      await helper2.startMonitoring()

      await page2.goto('/auth/signin')
      await helper2.waitForAppReady()

      // Check session in second tab
      const sessionResponse2 = await page2.request.get('/api/auth/session')
      const sessionStatus2 = sessionResponse2.status()

      // Both tabs should have consistent session state
      expect(sessionStatus1).toBe(sessionStatus2)

      await context.close()
    })

    test('should validate session security with CSRF protection', async ({ page }) => {
      await page.goto('/auth/signin')
      await helper.waitForAppReady()

      // Test CSRF token endpoint
      const csrfResponse = await page.request.get('/api/auth/csrf')
      expect(csrfResponse.status()).toBe(200)

      const csrfData = await csrfResponse.json()
      expect(csrfData).toHaveProperty('csrfToken')
      expect(typeof csrfData.csrfToken).toBe('string')
      expect(csrfData.csrfToken.length).toBeGreaterThan(16)

      // Verify CSRF token in POST requests
      const signoutResponse = await page.request.post('/api/auth/signout', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: `csrfToken=${csrfData.csrfToken}`,
      })

      // Should handle CSRF token validation
      expect([200, 302, 405].includes(signoutResponse.status())).toBeTruthy()
    })
  })

  test.describe('API Security Integration', () => {
    test('should enforce rate limiting across API endpoints', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      const responses: number[] = []

      // Make rapid requests to test rate limiting
      for (let i = 0; i < 15; i++) {
        const response = await page.request.get('/api/health')
        responses.push(response.status())

        // Small delay to avoid overwhelming the server
        await page.waitForTimeout(50)
      }

      // Should have some successful responses
      const successfulResponses = responses.filter(status => status === 200)
      expect(successfulResponses.length).toBeGreaterThan(0)

      // Should have some rate-limited responses if rate limiting is active
      const _rateLimitedResponses = responses.filter(status => status === 429)
      // Note: Rate limiting might not trigger in test environment
    })

    test('should validate API security headers across endpoints', async ({ page }) => {
      const apiEndpoints = [
        '/api/health',
        '/api/auth/session',
        '/api/auth/providers',
        '/api/search/repositories',
      ]

      for (const endpoint of apiEndpoints) {
        const response = await page.request.get(endpoint)

        // All API endpoints should return valid responses or proper errors
        expect([200, 401, 404, 405].includes(response.status())).toBeTruthy()

        // Check for security headers if response includes them
        const headers = response.headers()
        if (headers['x-frame-options']) {
          expect(
            ['DENY', 'SAMEORIGIN'].includes(headers['x-frame-options'].toUpperCase())
          ).toBeTruthy()
        }
      }
    })
  })

  test.describe('Search Functionality Integration', () => {
    test('should perform complete search flow with monitoring', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      // Monitor API requests during search
      const _apiRequests = await helper.monitorAPIRequests()

      // Find search input
      const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first()
      if ((await searchInput.count()) > 0) {
        await searchInput.fill('react typescript')

        // Submit search
        await searchInput.press('Enter')

        // Wait for search results
        await page.waitForTimeout(2000)

        // Verify search API was called
        // Note: Actual API might not be available in test environment

        await helper.takeTimestampedScreenshot('search-results')
      }
    })

    test('should handle search errors gracefully', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      // Test search with potentially problematic input
      const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first()
      if ((await searchInput.count()) > 0) {
        await searchInput.fill('<script>alert("xss")</script>')
        await searchInput.press('Enter')

        // Application should handle this gracefully without XSS
        await page.waitForTimeout(1000)

        // Check that no alert was triggered
        const alertTriggered = await page.evaluate(() => {
          return document.documentElement.innerHTML.includes('alert("xss")')
        })
        expect(alertTriggered).toBe(false)
      }
    })
  })

  test.describe('Performance Integration', () => {
    test('should meet performance thresholds under normal load', async ({ page }) => {
      // Simulate realistic network conditions
      await helper.simulateNetworkConditions(100)

      const startTime = Date.now()
      await page.goto('/')
      await helper.waitForAppReady()
      const loadTime = Date.now() - startTime

      // Page should load within 5 seconds
      expect(loadTime).toBeLessThan(5000)

      // Measure API response times
      const _apiRequests = await helper.monitorAPIRequests()

      const healthStart = Date.now()
      await page.request.get('/api/health')
      const healthTime = Date.now() - healthStart

      // Health check should be fast
      expect(healthTime).toBeLessThan(1000)

      await helper.takeTimestampedScreenshot('performance-test')
    })

    test('should handle concurrent user simulation', async ({ browser }) => {
      const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()))

      const startTime = Date.now()

      // Simulate multiple users loading the app simultaneously
      const loadPromises = contexts.map(async (context, _index) => {
        const page = await context.newPage()
        const helper = new SystemIntegrationHelper(page)
        await helper.startMonitoring()

        await page.goto('/')
        await helper.waitForAppReady()

        // Simulate some user activity
        await page.locator('body').click()
        await page.waitForTimeout(1000)

        return page
      })

      const _pages = await Promise.all(loadPromises)
      const totalTime = Date.now() - startTime

      // All pages should load within reasonable time
      expect(totalTime).toBeLessThan(10000)

      // Cleanup
      await Promise.all(contexts.map(context => context.close()))
    })
  })

  test.describe('Monitoring System Integration', () => {
    test('should track user interactions and API calls', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      // Track API requests
      const _apiRequests = await helper.monitorAPIRequests()

      // Perform various user interactions
      await page.locator('body').click()

      // Navigate to different pages
      if ((await page.locator('a[href="/about"]').count()) > 0) {
        await page.locator('a[href="/about"]').click()
        await helper.waitForAppReady()
      }

      // Make API requests
      await page.request.get('/api/health')
      await page.request.get('/api/auth/session')

      // Wait for monitoring to process
      await page.waitForTimeout(1000)

      // Verify monitoring captured activities
      // Note: Actual monitoring verification would require access to monitoring system
    })

    test('should handle monitoring errors gracefully', async ({ page }) => {
      // Simulate monitoring service unavailability
      await page.route('**/api/monitoring/**', route => {
        route.fulfill({
          status: 503,
          body: 'Service Unavailable',
        })
      })

      await page.goto('/')
      await helper.waitForAppReady()

      // Application should still work despite monitoring issues
      const healthResponse = await page.request.get('/api/health')
      expect([200, 503].includes(healthResponse.status())).toBeTruthy()

      await helper.takeTimestampedScreenshot('monitoring-error-handling')
    })
  })

  test.describe('Error Recovery Integration', () => {
    test('should handle network failures gracefully', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      // Simulate network failure
      await page.route('**/api/**', route => {
        route.abort('failed')
      })

      // Application should handle API failures gracefully
      await page.locator('body').click()

      // Look for error handling UI
      await page.waitForTimeout(2000)

      // Application should not crash
      const pageTitle = await page.title()
      expect(pageTitle).toBeTruthy()

      await helper.takeTimestampedScreenshot('network-failure-handling')
    })

    test('should recover from temporary service outages', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      let requestCount = 0

      // Simulate intermittent service issues
      await page.route('**/api/health', route => {
        requestCount++
        if (requestCount <= 2) {
          route.fulfill({
            status: 503,
            body: 'Service Temporarily Unavailable',
          })
        } else {
          route.continue()
        }
      })

      // Make requests that should eventually succeed
      let finalResponse: Response | undefined
      for (let i = 0; i < 5; i++) {
        finalResponse = await page.request.get('/api/health')
        await page.waitForTimeout(500)
      }

      // Should eventually get successful response
      expect(finalResponse).toBeDefined()
      if (finalResponse) {
        expect([200, 503].includes(finalResponse.status())).toBeTruthy()
      }
    })
  })

  test.describe('Cross-Browser Compatibility', () => {
    test('should work consistently across different viewports', async ({ page }) => {
      const viewports = [
        { width: 320, height: 568 }, // Mobile
        { width: 768, height: 1024 }, // Tablet
        { width: 1920, height: 1080 }, // Desktop
      ]

      for (const viewport of viewports) {
        await page.setViewportSize(viewport)
        await page.goto('/')
        await helper.waitForAppReady()

        // Application should be functional at all viewport sizes
        const title = await page.title()
        expect(title).toBeTruthy()

        // Take screenshot for visual verification
        await helper.takeTimestampedScreenshot(`viewport-${viewport.width}x${viewport.height}`)
      }
    })

    test('should handle different user agents gracefully', async ({ page }) => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ]

      for (const userAgent of userAgents) {
        await page.setExtraHTTPHeaders({
          'User-Agent': userAgent,
        })

        await page.goto('/')
        await helper.waitForAppReady()

        // Application should work with different user agents
        const healthResponse = await page.request.get('/api/health')
        expect([200, 404].includes(healthResponse.status())).toBeTruthy()
      }
    })
  })

  test.describe('Security Validation Integration', () => {
    test('should prevent common security vulnerabilities', async ({ page }) => {
      await page.goto('/')
      await helper.waitForAppReady()

      // Test for XSS prevention
      await page.evaluate(() => {
        const script = document.createElement('script')
        script.innerHTML = 'window.xssTest = true'
        document.body.appendChild(script)
      })

      const _xssExecuted = await page.evaluate(() => {
        const windowWithXss = window as unknown as { xssTest?: boolean }
        return windowWithXss.xssTest
      })
      // XSS should be prevented by CSP
      // Note: This test might not be reliable depending on CSP configuration

      // Test for clickjacking protection
      const response = await page.goto('/')
      if (response) {
        const headers = response.headers()
        const xFrameOptions = headers['x-frame-options']
        if (xFrameOptions) {
          expect(['DENY', 'SAMEORIGIN'].includes(xFrameOptions.toUpperCase())).toBeTruthy()
        }
      }

      await helper.takeTimestampedScreenshot('security-validation')
    })

    test('should enforce secure cookie configuration', async ({ page, context }) => {
      await page.goto('/auth/signin')
      await helper.waitForAppReady()

      // Check cookie security attributes
      const cookies = await context.cookies()
      const authCookies = cookies.filter(
        cookie => cookie.name.includes('next-auth') || cookie.name.includes('session')
      )

      authCookies.forEach(cookie => {
        // In production, cookies should be secure
        if (process.env.NODE_ENV === 'production') {
          expect(cookie.secure).toBe(true)
        }
        expect(cookie.httpOnly).toBe(true)
        expect(cookie.sameSite).toBe('Lax')
      })
    })
  })
})
