import { expect, test } from '@playwright/test'

test.describe('Navigation Tests', () => {
  test('should navigate to authentication pages', async ({ page }) => {
    // Monitor console for errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    // Check if signin page is accessible
    const signinResponse = await page.goto('/auth/signin')
    expect(signinResponse?.status()).toBe(200)

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded')

    // Check for signin page elements
    const signinContent = page.locator('text=Sign in')
    if ((await signinContent.count()) > 0) {
      await expect(signinContent).toBeVisible()
    }

    // Check that no console errors occurred during navigation
    if (errors.length > 0) {
      console.log('Navigation errors detected:', errors)
      expect(errors).toHaveLength(0)
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/signin-page.png', fullPage: true })
  })

  test('should handle 404 pages gracefully', async ({ page }) => {
    const response = await page.goto('/non-existent-page')

    // Should return 404 or redirect appropriately
    expect([404, 200].includes(response?.status() || 0)).toBeTruthy()

    // If it's a 404, check for proper error page
    if (response?.status() === 404) {
      await expect(page.locator('text=404')).toBeVisible()
    }
  })

  test('should handle settings page navigation', async ({ page }) => {
    await page.goto('/')

    // Try to access settings page
    const settingsResponse = await page.goto('/settings/accounts')

    // Should either show settings or redirect to auth
    expect([200, 302, 401].includes(settingsResponse?.status() || 0)).toBeTruthy()

    await page.waitForLoadState('domcontentloaded')

    // Take screenshot of settings page state
    await page.screenshot({ path: 'test-results/settings-page.png', fullPage: true })
  })

  test('should have working back/forward navigation', async ({ page }) => {
    await page.goto('/')

    // Navigate to different pages
    await page.goto('/auth/signin')
    await page.waitForLoadState('domcontentloaded')

    // Go back
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')

    // Should be back on homepage
    await expect(page.locator('h1')).toContainText('Welcome to Contribux')

    // Go forward
    await page.goForward()
    await page.waitForLoadState('domcontentloaded')

    // Should be on signin page or have signin content
    const url = page.url()
    expect(url).toContain('/auth/signin')
  })

  test('should handle page reloads without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Reload the page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Check that content is still there
    await expect(page.locator('h1')).toContainText('Welcome to Contribux')

    // Check for errors
    if (errors.length > 0) {
      console.log('Reload errors detected:', errors)
      expect(errors).toHaveLength(0)
    }
  })

  test('should load pages within reasonable time', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const loadTime = Date.now() - startTime

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000)

    console.log(`Page load time: ${loadTime}ms`)
  })
})
