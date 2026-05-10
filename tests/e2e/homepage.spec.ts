import { expect, test } from '@playwright/test'

test.describe('Homepage Tests', () => {
  test('should load homepage without errors', async ({ page }) => {
    // Monitor console for errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    // Monitor page errors
    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`)
    })

    // Navigate to homepage
    await page.goto('/')

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('networkidle')

    // Check for current main heading
    await expect(
      page.getByRole('heading', { level: 1, name: /Find Your Perfect\s+Open Source Match/ })
    ).toBeVisible()

    // Check for the primary product signals and actions
    await expect(page.getByText('AI-Powered Open Source Discovery')).toBeVisible()
    await expect(page.getByText(/Discover repositories that match your skills/)).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in with GitHub/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Try Demo Search/ })).toBeVisible()

    // Check that no console errors occurred
    if (errors.length > 0) {
      console.log('Console errors detected:', errors)
      expect(errors).toHaveLength(0)
    }

    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/homepage.png', fullPage: true })
  })

  test('should have proper page structure and styling', async ({ page }) => {
    await page.goto('/')

    // Check main layout structure
    const main = page.getByRole('main')
    await expect(main).toBeVisible()
    await expect(main).toHaveClass(/min-h-screen/)

    // Check heading styling
    const heading = page.getByRole('heading', {
      level: 1,
      name: /Find Your Perfect\s+Open Source Match/,
    })
    await expect(heading).toHaveClass(/text-5xl/)

    // Check current feature and demo sections render.
    await expect(page.getByRole('heading', { level: 3, name: 'AI-Powered Matching' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Optimized API Integration Demo' })
    ).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Check that content is still visible and properly arranged
    await expect(
      page.getByRole('heading', { level: 1, name: /Find Your Perfect\s+Open Source Match/ })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Try Demo Search/ })).toBeVisible()

    // Take mobile screenshot
    await page.screenshot({ path: 'test-results/homepage-mobile.png', fullPage: true })
  })

  test('should remain usable with dark color scheme enabled', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page.evaluate(() => document.documentElement.classList.add('dark'))

    await expect(
      page.getByRole('heading', { level: 1, name: /Find Your Perfect\s+Open Source Match/ })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in with GitHub/ })).toBeVisible()
    await expect(page.getByRole('main')).toHaveClass(/from-background/)
  })
})
