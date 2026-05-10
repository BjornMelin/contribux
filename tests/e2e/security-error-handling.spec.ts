import { expect, test } from '@playwright/test'

function isolatedHeaders(label: string) {
  return { 'x-api-key': `e2e-security-error-${label}-${Date.now()}` }
}

test.describe('Security error handling contracts', () => {
  test('renders the supported OAuth error page', async ({ page }) => {
    await page.goto('/auth/error?error=OAuthAccountNotLinked')

    await expect(page.getByRole('heading', { name: /authentication error/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/auth/signin'
    )
  })

  test('returns 401 for protected routes without session or token context', async ({ request }) => {
    for (const endpoint of ['/dashboard', '/settings/accounts', '/admin/users']) {
      const response = await request.get(endpoint, { headers: isolatedHeaders(endpoint) })
      expect(response.status(), endpoint).toBe(401)
      expect(await response.json()).toHaveProperty('error', 'Authentication required')
    }
  })

  test('rejects spoofed auth and role headers at the proxy boundary', async ({ request }) => {
    const response = await request.get('/admin/users', {
      headers: {
        ...isolatedHeaders('spoofed'),
        'x-forwarded-user': 'admin',
        'x-user-role': 'admin',
        'x-api-key': 'compromised-key',
      },
    })

    expect(response.status()).toBe(401)
  })

  test('exposes CSRF bootstrap while keeping session anonymous', async ({ request }) => {
    const csrfResponse = await request.get('/api/auth/csrf', {
      headers: isolatedHeaders('csrf'),
    })
    expect(csrfResponse.status()).toBe(200)

    const csrf = await csrfResponse.json()
    expect(typeof csrf.csrfToken).toBe('string')
    expect(csrf.csrfToken.length).toBeGreaterThan(16)

    const sessionResponse = await request.get('/api/auth/session', {
      headers: isolatedHeaders('session'),
    })
    expect(sessionResponse.status()).toBe(200)

    const session = await sessionResponse.json()
    expect(session.user ?? null).toBeNull()
  })

  test('returns structured validation errors for malformed public search requests', async ({
    request,
  }) => {
    const response = await request.get('/api/search/repositories?q=', {
      headers: isolatedHeaders('validation'),
    })

    expect([400, 422]).toContain(response.status())
    const payload = await response.json()
    expect(payload).toHaveProperty('error')
    expect(payload.error).toHaveProperty('code')
    expect(payload.error).toHaveProperty('message')
  })

  test('keeps authenticated opportunity search from executing without auth', async ({
    request,
  }) => {
    const response = await request.get('/api/search/opportunities?q=react', {
      headers: isolatedHeaders('opportunities'),
    })

    expect(response.status()).toBe(401)
    const payload = await response.json()
    expect(payload.error.code).toBe('UNAUTHORIZED')
  })
})
