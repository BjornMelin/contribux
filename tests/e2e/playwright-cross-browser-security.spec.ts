import { expect, test } from '@playwright/test'

test.describe('Browser security compliance contracts', () => {
  test('sets core security headers on public pages', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers() ?? {}

    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy']).toContain("default-src 'self'")
  })

  test('keeps protected route responses hardened too', async ({ page }) => {
    const response = await page.goto('/dashboard')
    const headers = response?.headers() ?? {}

    expect(response?.status()).toBe(401)
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  })

  test('runs in a secure browser context for crypto APIs', async ({ page }) => {
    await page.goto('/')

    const capabilities = await page.evaluate(() => ({
      secureContext: window.isSecureContext,
      crypto: typeof window.crypto?.subtle === 'object',
      credentialApi: typeof navigator.credentials === 'object',
    }))

    expect(capabilities.secureContext).toBe(true)
    expect(capabilities.crypto).toBe(true)
    expect(capabilities.credentialApi).toBe(true)
  })

  test('uses HttpOnly cookies for NextAuth bootstrap state', async ({ page, context }) => {
    await page.goto('/auth/signin')
    await page.request.get('/api/auth/csrf')

    const authCookies = (await context.cookies()).filter(cookie =>
      cookie.name.toLowerCase().includes('next-auth')
    )

    expect(authCookies.length).toBeGreaterThan(0)
    for (const cookie of authCookies) {
      expect(cookie.httpOnly).toBe(true)
      expect(cookie.sameSite).toBe('Lax')
    }
  })
})
