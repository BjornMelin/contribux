import { expect, test } from '@playwright/test'

const HEALTH_HTTP_STATUSES = [200, 503]

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-${label}-${Date.now()}` }
}

test.describe('Performance contracts', () => {
  test('loads the public home page within the interactive budget', async ({ page }) => {
    const startedAt = Date.now()

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()

    expect(Date.now() - startedAt).toBeLessThan(5000)
  })

  test('responds from public health endpoints quickly', async ({ request }) => {
    const startedAt = Date.now()
    const response = await request.get('/api/simple-health')

    expect(response.status()).toBe(200)
    expect(Date.now() - startedAt).toBeLessThan(1000)

    const payload = await response.json()
    expect(payload).toHaveProperty('status')
    expect(payload).toHaveProperty('timestamp')
  })

  test('handles canonical health checks even when dependencies are unhealthy', async ({
    request,
  }) => {
    const startedAt = Date.now()
    const response = await request.get('/api/health')

    expect(HEALTH_HTTP_STATUSES).toContain(response.status())
    expect(Date.now() - startedAt).toBeLessThan(2500)

    const payload = await response.json()
    expect(payload).toHaveProperty('overall')
    expect(Array.isArray(payload.components)).toBe(true)
  })

  test('serves concurrent public API requests within budget', async ({ request }) => {
    const startedAt = Date.now()
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        request.get('/api/search/repositories?q=react', {
          headers: isolatedHeaders(`concurrent-${index}`),
        })
      )
    )

    for (const response of responses) {
      expect(response.status()).toBe(200)
    }

    expect(Date.now() - startedAt).toBeLessThan(3000)
  })

  test('keeps layout responsive across common viewport sizes', async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/')

      await expect(
        page.getByRole('heading', { name: /find your perfect open source match/i }).first()
      ).toBeVisible()
    }
  })
})
