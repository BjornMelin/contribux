import { expect, test } from '@playwright/test'

test.describe('Error monitoring and recovery contracts', () => {
  test('returns structured authentication errors for protected application routes', async ({
    page,
  }) => {
    const response = await page.goto('/dashboard')

    expect(response?.status()).toBe(401)
    await expect(page.getByText(/authentication required/i)).toBeVisible()

    const headers = response?.headers() ?? {}
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  test('keeps monitoring and diagnostic APIs behind the proxy auth boundary', async ({
    request,
  }) => {
    for (const endpoint of [
      '/api/monitoring/health',
      '/api/monitoring/dashboard',
      '/api/monitoring/performance',
      '/api/search/error',
      '/api/security/monitoring',
    ]) {
      const response = await request.get(endpoint)
      expect(response.status(), endpoint).toBe(401)

      const payload = await response.json()
      expect(payload).toHaveProperty('error', 'Authentication required')
    }
  })

  test('returns structured validation errors without breaking public repository search', async ({
    request,
  }) => {
    const invalidResponse = await request.get('/api/search/repositories?q=')
    expect([400, 422]).toContain(invalidResponse.status())

    const invalidPayload = await invalidResponse.json()
    expect(invalidPayload).toHaveProperty('error')
    expect(invalidPayload.error).toHaveProperty('code')
    expect(invalidPayload.error).toHaveProperty('message')

    const recoveryResponse = await request.get('/api/search/repositories?q=typescript')
    expect(recoveryResponse.status()).toBe(200)

    const recoveryPayload = await recoveryResponse.json()
    expect(recoveryPayload.success).toBe(true)
    expect(Array.isArray(recoveryPayload.data.repositories)).toBe(true)
  })

  test('continues responding after repeated handled API errors', async ({ request }) => {
    for (let index = 0; index < 10; index += 1) {
      const response = await request.get(`/api/search/repositories?q=&attempt=${index}`)
      expect([400, 422]).toContain(response.status())
    }

    const response = await request.get('/api/simple-health')
    expect(response.status()).toBe(200)

    const payload = await response.json()
    expect(payload).toHaveProperty('status')
    expect(payload).toHaveProperty('timestamp')
  })

  test('renders the public home page after API failures', async ({ page, request }) => {
    await request.get('/api/search/repositories?q=')

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /find your perfect open source match/i }).first()
    ).toBeVisible()
  })

  test('keeps public error recovery usable on mobile viewports', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await request.get('/api/search/repositories?q=')

    await page.goto('/')

    const heading = page
      .getByRole('heading', { name: /find your perfect open source match/i })
      .first()
    await expect(heading).toBeVisible()

    const box = await heading.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(375)
  })
})
