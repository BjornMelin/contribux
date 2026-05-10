import { expect, test } from '@playwright/test'

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-load-${label}-${Date.now()}` }
}

test.describe('Load and resilience contracts', () => {
  test('handles repeated repository searches without state leakage', async ({ request }) => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request.get(`/api/search/repositories?q=react&page=${index + 1}&per_page=1`, {
          headers: isolatedHeaders(`repo-${index}`),
        })
      )
    )

    for (const response of responses) {
      expect(response.status()).toBe(200)
      const payload = await response.json()
      expect(payload.success).toBe(true)
      expect(payload.data).toHaveProperty('repositories')
    }
  })

  test('handles repeated validation errors and recovers on the next valid request', async ({
    request,
  }) => {
    for (let index = 0; index < 6; index += 1) {
      const response = await request.get(`/api/search/repositories?q=&attempt=${index}`, {
        headers: isolatedHeaders(`invalid-${index}`),
      })
      expect([400, 422]).toContain(response.status())
    }

    const recovery = await request.get('/api/search/repositories?q=typescript', {
      headers: isolatedHeaders('recovery'),
    })
    expect(recovery.status()).toBe(200)

    const payload = await recovery.json()
    expect(payload.success).toBe(true)
    expect(Array.isArray(payload.data.repositories)).toBe(true)
  })

  test('keeps protected APIs fast at the proxy boundary', async ({ request }) => {
    const startedAt = Date.now()
    const responses = await Promise.all(
      ['/dashboard', '/api/monitoring/dashboard', '/api/security/monitoring'].map(endpoint =>
        request.get(endpoint, { headers: isolatedHeaders(endpoint) })
      )
    )

    for (const response of responses) {
      expect(response.status()).toBe(401)
    }

    expect(Date.now() - startedAt).toBeLessThan(1500)
  })

  test('loads auth and home screens in sequence without browser errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    await page.goto('/')
    await page.goto('/auth/signin')
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()

    expect(errors).toEqual([])
  })
})
