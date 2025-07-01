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

    // Check for main heading
    await expect(page.locator('h1')).toContainText('Welcome to Contribux')

    // Check for technology stack information
    await expect(
      page.locator('text=Next.js 15 • TypeScript • Tailwind CSS • App Router')
    ).toBeVisible()
    await expect(page.locator('text=Modern web application with PWA support')).toBeVisible()

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
    const main = page.locator('main')
    await expect(main).toBeVisible()
    await expect(main).toHaveClass(/flex min-h-screen/)

    // Check heading styling
    const heading = page.locator('h1')
    await expect(heading).toHaveClass(/text-center font-bold text-4xl/)

    // Check for responsive layout classes - be more specific about which div
    await expect(page.locator('div.z-10.w-full.max-w-5xl')).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Check that content is still visible and properly arranged
    await expect(page.locator('h1')).toBeVisible()
    await expect(
      page.locator('text=Next.js 15 • TypeScript • Tailwind CSS • App Router')
    ).toBeVisible()

    // Take mobile screenshot
    await page.screenshot({ path: 'test-results/homepage-mobile.png', fullPage: true })
  })

  test('should have proper dark mode support', async ({ page }) => {
    await page.goto('/')

    // Check for dark mode classes
    const darkModeElement = page.locator('.dark\\:bg-gray-800')
    await expect(darkModeElement).toBeVisible()

    const darkTextElement = page.locator('.dark\\:text-gray-400')
    await expect(darkTextElement).toBeVisible()
  })
})
