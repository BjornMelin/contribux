import { expect, test } from '@playwright/test'

// Identifies individual test requests in logs; this is not an auth credential.
function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-security-${label}-${Date.now()}` }
}

test.describe('Comprehensive security validation', () => {
  test('starts OAuth through NextAuth without exposing custom mock providers', async ({ page }) => {
    let authorizationUrl = ''

    await page.route('https://github.com/login/oauth/authorize**', async route => {
      authorizationUrl = route.request().url()
      await route.abort('aborted')
    })

    await page.goto('/auth/signin')
    await page.getByRole('button', { name: /continue with github/i }).click()

    await expect.poll(() => authorizationUrl, { timeout: 5000 }).toContain('github.com')
    const parsedUrl = new URL(authorizationUrl)
    expect(parsedUrl.pathname).toBe('/login/oauth/authorize')
    expect(parsedUrl.searchParams.get('client_id')).toBeTruthy()
    expect(parsedUrl.searchParams.get('state')).toBeTruthy()
  })

  test('publishes only supported NextAuth providers', async ({ request }) => {
    const response = await request.get('/api/auth/providers', {
      headers: isolatedHeaders('providers'),
    })

    expect(response.status()).toBe(200)
    const providers = await response.json()
    expect(Object.keys(providers).sort()).toEqual(['github', 'google'])
  })

  test('requires authentication before opportunity data access', async ({ request }) => {
    const response = await request.get('/api/search/opportunities?q=react', {
      headers: isolatedHeaders('opportunities'),
    })

    expect(response.status()).toBe(401)
    const payload = await response.json()
    expect(payload).toHaveProperty('error')
    expect(payload.error.code).toBe('UNAUTHORIZED')
  })

  test('rejects protected monitoring endpoints without session context', async ({ request }) => {
    for (const endpoint of [
      '/api/monitoring/health',
      '/api/monitoring/performance',
      '/api/security/monitoring',
    ]) {
      const response = await request.get(endpoint, { headers: isolatedHeaders(endpoint) })
      expect(response.status(), endpoint).toBe(401)
    }
  })

  test('keeps public search response shape stable', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=nextjs', {
      headers: isolatedHeaders('search'),
    })

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data).toHaveProperty('repositories')
    expect(payload.metadata).toHaveProperty('query', 'nextjs')
  })
})
