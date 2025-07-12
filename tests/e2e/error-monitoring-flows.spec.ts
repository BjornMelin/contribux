import { expect, test } from '@playwright/test'

test.describe('Error Monitoring E2E Tests', () => {
  test.describe('Error Classification Flow', () => {
    test('should display appropriate error messages for network errors', async ({ page }) => {
      // Simulate network error by blocking API calls
      await page.route('**/api/**', route => route.abort('failed'))

      await page.goto('/')

      // Try to perform an action that requires API
      await page.click('[data-testid="search-button"]')

      // Should see network error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        /network|connection/i
      )

      // Should show retry button
      await expect(page.locator('button:has-text("Retry")')).toBeVisible()

      // Take screenshot for documentation
      await page.screenshot({ path: 'test-results/network-error-recovery.png', fullPage: true })
    })

    test('should handle authentication errors with proper recovery', async ({ page }) => {
      // Mock 401 response
      await page.route('**/api/auth/session', route =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' }),
        })
      )

      await page.goto('/dashboard')

      // Should redirect to sign-in page
      await page.waitForURL('**/auth/signin')

      // Should show appropriate message
      await expect(page.locator('[data-testid="auth-message"]')).toContainText(/sign in/i)
    })

    test('should handle rate limiting with countdown', async ({ page }) => {
      // Mock 429 response with retry-after header
      await page.route('**/api/search', route =>
        route.fulfill({
          status: 429,
          headers: { 'retry-after': '60' },
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Rate limit exceeded' }),
        })
      )

      await page.goto('/')
      await page.fill('[data-testid="search-input"]', 'test query')
      await page.click('[data-testid="search-button"]')

      // Should show rate limit message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/rate limit/i)

      // Should show countdown or wait message
      await expect(page.locator('[data-testid="retry-countdown"]')).toBeVisible()
    })
  })

  test.describe('Error Dashboard', () => {
    test('should display health status dashboard', async ({ page }) => {
      await page.goto('/admin/error-dashboard')

      // Check health score display
      await expect(page.locator('[data-testid="health-score"]')).toBeVisible()

      // Check error metrics
      await expect(page.locator('[data-testid="total-errors"]')).toBeVisible()
      await expect(page.locator('[data-testid="error-rate"]')).toBeVisible()

      // Check component status
      await expect(page.locator('[data-testid="component-status"]')).toBeVisible()

      // Take screenshot
      await page.screenshot({ path: 'test-results/error-dashboard.png', fullPage: true })
    })

    test('should filter errors by category', async ({ page }) => {
      await page.goto('/admin/error-dashboard')

      // Select filter
      await page.selectOption('[data-testid="error-category-filter"]', 'database')

      // Verify filtered results
      await expect(
        page.locator('[data-testid="error-list"] [data-category="database"]')
      ).toBeVisible()

      // Other categories should not be visible
      await expect(
        page.locator('[data-testid="error-list"] [data-category="network"]')
      ).not.toBeVisible()
    })

    test('should export error data', async ({ page }) => {
      await page.goto('/admin/error-dashboard')

      // Set up download promise before clicking
      const downloadPromise = page.waitForEvent('download')

      // Click export button
      await page.click('[data-testid="export-csv"]')

      // Wait for download
      const download = await downloadPromise

      // Verify download
      expect(download.suggestedFilename()).toContain('.csv')
    })
  })

  test.describe('Alert System', () => {
    test('should display real-time alerts', async ({ page }) => {
      await page.goto('/admin/alerts')

      // Trigger an alert by simulating high error rate
      await page.evaluate(() => {
        // Simulate WebSocket alert message
        window.postMessage(
          {
            type: 'ALERT',
            severity: 'high',
            message: 'High error rate detected',
          },
          '*'
        )
      })

      // Should see alert notification
      await expect(page.locator('[data-testid="alert-notification"]')).toBeVisible()
      await expect(page.locator('[data-testid="alert-notification"]')).toContainText(
        /high error rate/i
      )
    })

    test('should allow alert acknowledgment', async ({ page }) => {
      await page.goto('/admin/alerts')

      // Wait for alert to appear
      await page.waitForSelector('[data-testid="alert-item"]')

      // Click acknowledge button
      await page.click('[data-testid="acknowledge-alert"]')

      // Alert should be marked as acknowledged
      await expect(page.locator('[data-testid="alert-status"]')).toContainText(/acknowledged/i)
    })
  })

  test.describe('Error Recovery Workflows', () => {
    test('should auto-retry transient errors', async ({ page }) => {
      let attemptCount = 0

      // Fail first attempt, succeed on retry
      await page.route('**/api/data', route => {
        attemptCount++
        if (attemptCount === 1) {
          route.fulfill({
            status: 503,
            body: 'Service unavailable',
          })
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: 'success' }),
          })
        }
      })

      await page.goto('/')
      await page.click('[data-testid="load-data"]')

      // Should show retry in progress
      await expect(page.locator('[data-testid="retry-indicator"]')).toBeVisible()

      // Should eventually succeed
      await expect(page.locator('[data-testid="data-display"]')).toContainText('success')
    })

    test('should use cached data as fallback', async ({ page }) => {
      // First, load data successfully
      await page.goto('/')
      await page.click('[data-testid="load-data"]')
      await page.waitForSelector('[data-testid="data-display"]')

      // Now simulate API failure
      await page.route('**/api/data', route =>
        route.fulfill({
          status: 503,
          body: 'Service unavailable',
        })
      )

      // Reload page
      await page.reload()
      await page.click('[data-testid="load-data"]')

      // Should show cached data with indicator
      await expect(page.locator('[data-testid="cached-indicator"]')).toBeVisible()
      await expect(page.locator('[data-testid="data-display"]')).toBeVisible()
    })

    test('should handle circuit breaker activation', async ({ page }) => {
      // Simulate multiple failures to trigger circuit breaker
      await page.route('**/api/unstable', route =>
        route.fulfill({
          status: 500,
          body: 'Internal server error',
        })
      )

      await page.goto('/')

      // Try multiple times to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await page.click('[data-testid="unstable-action"]')
        await page.waitForTimeout(100)
      }

      // Circuit breaker should activate
      await expect(page.locator('[data-testid="circuit-breaker-message"]')).toBeVisible()
      await expect(page.locator('[data-testid="circuit-breaker-message"]')).toContainText(
        /temporarily disabled/i
      )
    })
  })

  test.describe('Error Reporting Integration', () => {
    test('should capture and display console errors', async ({ page }) => {
      // Navigate to page with intentional console errors
      await page.goto('/test/console-errors')

      // Trigger action that causes console error
      await page.click('[data-testid="trigger-error"]')

      // Open error panel
      await page.click('[data-testid="error-panel-toggle"]')

      // Should display console errors
      await expect(page.locator('[data-testid="console-errors"]')).toBeVisible()
      await expect(page.locator('[data-testid="console-error-count"]')).toContainText(/[1-9]/)
    })

    test('should track user journey on error', async ({ page }) => {
      // Perform some actions
      await page.goto('/')
      await page.click('[data-testid="nav-search"]')
      await page.fill('[data-testid="search-input"]', 'test')

      // Trigger an error
      await page.route('**/api/search', route =>
        route.fulfill({
          status: 500,
          body: 'Server error',
        })
      )

      await page.click('[data-testid="search-button"]')

      // Check error details include user journey
      await page.click('[data-testid="view-error-details"]')

      await expect(page.locator('[data-testid="user-journey"]')).toContainText('nav-search')
      await expect(page.locator('[data-testid="user-journey"]')).toContainText('search-input')
    })
  })

  test.describe('Performance Under Error Load', () => {
    test('should remain responsive under high error rate', async ({ page }) => {
      await page.goto('/')

      // Generate many errors quickly
      const errorPromises = []
      for (let i = 0; i < 50; i++) {
        errorPromises.push(
          page
            .evaluate(() => {
              // Trigger client-side error
              throw new Error(`Test error ${Date.now()}`)
            })
            .catch(() => {
              // Intentionally empty - preventing test failure
            }) // Catch to prevent test failure
        )
      }

      await Promise.all(errorPromises)

      // Page should still be interactive
      await page.click('[data-testid="nav-home"]')
      await expect(page).toHaveURL('/')

      // UI should not be frozen
      const startTime = Date.now()
      await page.click('[data-testid="test-button"]')
      const clickTime = Date.now() - startTime

      expect(clickTime).toBeLessThan(1000) // Should respond within 1 second
    })
  })

  test.describe('Mobile Error Handling', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should display mobile-friendly error messages', async ({ page }) => {
      await page.route('**/api/**', route => route.abort('failed'))

      await page.goto('/')
      await page.click('[data-testid="mobile-menu"]')
      await page.click('[data-testid="search-mobile"]')

      // Error message should be visible and readable on mobile
      const errorMessage = page.locator('[data-testid="error-message"]')
      await expect(errorMessage).toBeVisible()

      const boundingBox = await errorMessage.boundingBox()
      expect(boundingBox?.width).toBeLessThan(350) // Should fit mobile viewport

      // Take mobile screenshot
      await page.screenshot({ path: 'test-results/mobile-error-display.png', fullPage: true })
    })
  })
})
