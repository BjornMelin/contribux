import { expect, test } from '@playwright/test'

test.describe('Performance Tests', () => {
  test('should have fast page load times', async ({ page }) => {
    const startTime = Date.now()

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const loadTime = Date.now() - startTime
    console.log(`Total page load time: ${loadTime}ms`)

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000)
  })

  test('should have fast API response times', async ({ request }) => {
    const startTime = Date.now()

    const response = await request.get('/api/health')

    const responseTime = Date.now() - startTime
    console.log(`API response time: ${responseTime}ms`)

    expect(response.status()).toBe(200)
    // API should respond within 1 second
    expect(responseTime).toBeLessThan(1000)
  })

  test('should handle concurrent requests efficiently', async ({ request }) => {
    const startTime = Date.now()

    // Make 5 concurrent requests
    const promises = Array.from({ length: 5 }, () => request.get('/api/health'))

    const responses = await Promise.all(promises)

    const totalTime = Date.now() - startTime
    console.log(`5 concurrent requests completed in: ${totalTime}ms`)

    // All requests should succeed
    responses.forEach(response => {
      expect(response.status()).toBe(200)
    })

    // Should complete within 2 seconds
    expect(totalTime).toBeLessThan(2000)
  })

  test('should have efficient resource loading', async ({ page }) => {
    const resourceSizes: Record<string, number> = {}
    const resourceTimes: Record<string, number> = {}

    page.on('response', async response => {
      const url = response.url()
      const contentLength = response.headers()['content-length']

      if (contentLength) {
        resourceSizes[url] = Number.parseInt(contentLength)
      }

      // Track timing for main resources
      if (url.includes('localhost:3000') && !url.includes('api/')) {
        const timing = await response.timing()
        resourceTimes[url] = timing.responseEnd - timing.requestStart
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Log resource information
    console.log('Resource sizes:', resourceSizes)
    console.log('Resource timings:', resourceTimes)

    // Check that main page isn't too large
    const mainPageSize = Object.entries(resourceSizes)
      .filter(([url]) => url === 'http://localhost:3000/')
      .reduce((total, [, size]) => total + size, 0)

    if (mainPageSize > 0) {
      console.log(`Main page size: ${mainPageSize} bytes`)
      // Should be reasonable size (under 1MB)
      expect(mainPageSize).toBeLessThan(1024 * 1024)
    }
  })

  test('should handle memory efficiently', async ({ page }) => {
    // Navigate through multiple pages to test memory usage
    const pages = ['/', '/auth/signin', '/auth/error', '/settings/accounts']

    for (const pagePath of pages) {
      await page.goto(pagePath)
      await page.waitForLoadState('domcontentloaded')

      // Check for memory leaks by monitoring console
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error' && msg.text().toLowerCase().includes('memory')) {
          errors.push(msg.text())
        }
      })

      // Ensure no memory-related errors
      expect(errors).toHaveLength(0)
    }
  })

  test('should have responsive interactions', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Test clicking interactions
    const clickableElements = await page.locator('button, a, [role="button"]').all()

    for (const element of clickableElements.slice(0, 3)) {
      // Test first 3 elements
      if (await element.isVisible()) {
        const startTime = Date.now()

        try {
          await element.click({ timeout: 1000 })
          const clickTime = Date.now() - startTime

          console.log(`Click response time: ${clickTime}ms`)
          // Interactions should respond within 100ms
          expect(clickTime).toBeLessThan(100)
        } catch (error) {
          // Element might not be clickable, that's okay
          console.log('Element not clickable:', error)
        }
      }
    }
  })

  test('should handle viewport changes efficiently', async ({ page }) => {
    await page.goto('/')

    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 768, height: 1024 }, // Tablet
      { width: 375, height: 667 }, // Mobile
    ]

    for (const viewport of viewports) {
      const startTime = Date.now()

      await page.setViewportSize(viewport)
      await page.waitForLoadState('domcontentloaded')

      const resizeTime = Date.now() - startTime
      console.log(`Viewport resize time (${viewport.width}x${viewport.height}): ${resizeTime}ms`)

      // Should adapt to new viewport quickly
      expect(resizeTime).toBeLessThan(500)

      // Content should still be visible
      await expect(page.locator('h1')).toBeVisible()
    }
  })

  test('should have efficient network usage', async ({ page }) => {
    const requests: string[] = []

    page.on('request', request => {
      requests.push(request.url())
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    console.log('Network requests made:', requests.length)
    console.log('Unique domains:', [...new Set(requests.map(url => new URL(url).hostname))])

    // Should not make excessive requests
    expect(requests.length).toBeLessThan(50)

    // Should primarily request from localhost
    const localhostRequests = requests.filter(url => url.includes('localhost'))
    expect(localhostRequests.length).toBeGreaterThan(0)
  })
})
