import { expect, test } from '@playwright/test'

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-secperf-${label}-${Date.now()}` }
}

test.describe('Security and performance validation', () => {
  test('validates hardened security headers on public and protected responses', async ({
    page,
  }) => {
    for (const path of ['/', '/dashboard']) {
      const response = await page.goto(path)
      const headers = response?.headers() ?? {}

      expect(headers['x-frame-options'], path).toBe('DENY')
      expect(headers['x-content-type-options'], path).toBe('nosniff')
      expect(headers['content-security-policy'], path).toContain("default-src 'self'")
    }
  })

  test('validates NextAuth bootstrap API response times', async ({ request }) => {
    for (const endpoint of ['/api/auth/csrf', '/api/auth/providers', '/api/auth/session']) {
      const startedAt = Date.now()
      const response = await request.get(endpoint, { headers: isolatedHeaders(endpoint) })

      expect(response.status(), endpoint).toBe(200)
      expect(Date.now() - startedAt, endpoint).toBeLessThan(1000)
    }
  })

  test('validates public search API response time and shape', async ({ request }) => {
    const startedAt = Date.now()
    const response = await request.get('/api/search/repositories?q=react', {
      headers: isolatedHeaders('search'),
    })

    expect(response.status()).toBe(200)
    expect(Date.now() - startedAt).toBeLessThan(1500)

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(Array.isArray(payload.data.repositories)).toBe(true)
  })

  test('validates graceful health status when dependencies are down', async ({ request }) => {
    const response = await request.get('/api/health', {
      headers: isolatedHeaders('health'),
    })

    expect([200, 503]).toContain(response.status())
    const payload = await response.json()
    expect(payload).toHaveProperty('overall')
    expect(Array.isArray(payload.components)).toBe(true)
  })

  test('handles concurrent auth bootstrap requests without failures', async ({ request }) => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        request.get('/api/auth/session', { headers: isolatedHeaders(`session-${index}`) })
      )
    )

    for (const response of responses) {
      expect(response.status()).toBe(200)
    }
  })

  test('keeps mobile home layout within viewport bounds', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const heading = page
      .getByRole('heading', { name: /find your perfect open source match/i })
      .first()

    await expect(heading).toBeVisible()
    const box = await heading.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(375)
  })
})
