import { expect, test } from '@playwright/test'

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-attack-${label}-${Date.now()}` }
}

test.describe('Attack simulation security contracts', () => {
  test('rejects protected routes without bearer credentials', async ({ request }) => {
    for (const endpoint of ['/dashboard', '/settings/accounts', '/admin', '/api/security/health']) {
      const response = await request.get(endpoint, { headers: isolatedHeaders(endpoint) })
      expect(response.status(), endpoint).toBe(401)
    }
  })

  test('does not trust spoofed identity headers', async ({ request }) => {
    const response = await request.get('/dashboard', {
      headers: {
        ...isolatedHeaders('spoofed'),
        'x-forwarded-user': 'admin',
        'x-user-id': 'admin',
      },
    })

    expect(response.status()).toBe(401)
  })

  test('returns structured errors for malformed public search requests', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=', {
      headers: isolatedHeaders('malformed-search'),
    })

    expect([400, 422]).toContain(response.status())
    const payload = await response.json()
    expect(payload).toHaveProperty('error')
    expect(payload.error).toHaveProperty('code')
  })

  test('keeps NextAuth CSRF bootstrap available for browser clients', async ({ request }) => {
    const response = await request.get('/api/auth/csrf', {
      headers: isolatedHeaders('csrf'),
    })

    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(typeof payload.csrfToken).toBe('string')
    expect(payload.csrfToken.length).toBeGreaterThan(16)
  })

  test('does not expose diagnostic error simulation endpoints anonymously', async ({ request }) => {
    const response = await request.get('/api/search/error', {
      headers: isolatedHeaders('diagnostic'),
    })

    expect(response.status()).toBe(401)
    expect(await response.json()).toHaveProperty('error', 'Authentication required')
  })
})
