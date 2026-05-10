import { expect, type Page, test } from '@playwright/test'

async function clearBrowserState(page: Page) {
  await page.context().clearCookies()
  await page
    .context()
    .setOffline(false)
    .catch(() => undefined)

  await page.goto('/')
  await page
    .evaluate(() => {
      try {
        localStorage.clear()
      } catch {
        // Storage can be unavailable after failed navigations.
      }

      try {
        sessionStorage.clear()
      } catch {
        // Storage can be unavailable after failed navigations.
      }
    })
    .catch(() => undefined)
}

test.describe('NextAuth.js v4 authentication journey', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page)
  })

  test('renders the OAuth sign-in screen with semantic landmarks', async ({ page }) => {
    await page.goto('/auth/signin')

    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { name: /welcome to contribux/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/legal/terms'
    )
    await expect(page.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/legal/privacy'
    )
  })

  test('starts GitHub OAuth through the native NextAuth provider route', async ({ page }) => {
    let authorizationUrl = ''

    await page.route('https://github.com/login/oauth/authorize**', async route => {
      authorizationUrl = route.request().url()
      await route.abort('aborted')
    })

    await page.goto('/auth/signin')
    await page.getByRole('button', { name: /continue with github/i }).click()

    await expect.poll(() => authorizationUrl, { timeout: 5000 }).toContain('github.com')
    const parsedUrl = new URL(authorizationUrl)

    expect(parsedUrl.origin).toBe('https://github.com')
    expect(parsedUrl.pathname).toBe('/login/oauth/authorize')
    expect(parsedUrl.searchParams.get('client_id')).toBeTruthy()
    expect(parsedUrl.searchParams.get('scope')).toContain('read:user')
    expect(parsedUrl.searchParams.get('state')).toBeTruthy()
  })

  test('exposes NextAuth bootstrap endpoints', async ({ request }) => {
    const csrfResponse = await request.get('/api/auth/csrf')
    expect(csrfResponse.status()).toBe(200)

    const csrfData = await csrfResponse.json()
    expect(csrfData).toHaveProperty('csrfToken')
    expect(typeof csrfData.csrfToken).toBe('string')
    expect(csrfData.csrfToken.length).toBeGreaterThan(16)

    const providersResponse = await request.get('/api/auth/providers')
    expect(providersResponse.status()).toBe(200)

    const providers = await providersResponse.json()
    expect(providers.github).toMatchObject({
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
    })
    expect(providers.google).toMatchObject({
      id: 'google',
      name: 'Google',
      type: 'oauth',
    })

    const sessionResponse = await request.get('/api/auth/session')
    expect(sessionResponse.status()).toBe(200)
    const session = await sessionResponse.json()
    expect(typeof session).toBe('object')
    expect(session.user ?? null).toBeNull()
  })

  test('handles signout and rendered OAuth error pages without stale v5 assumptions', async ({
    page,
    request,
  }) => {
    const csrfResponse = await request.get('/api/auth/csrf')
    const { csrfToken } = await csrfResponse.json()

    const signoutResponse = await request.post('/api/auth/signout', {
      form: { csrfToken, json: 'true' },
    })

    expect([200, 302, 400].includes(signoutResponse.status())).toBe(true)

    await page.goto('/auth/error?error=OAuthCallback')
    await expect(page.getByRole('heading', { name: /authentication error/i })).toBeVisible()
  })

  test('protects authenticated application routes', async ({ page }) => {
    const response = await page.goto('/dashboard')

    expect(response?.status()).toBe(401)
    await expect(page.getByText(/authentication required/i)).toBeVisible()
  })

  test('keeps public auth pages reachable', async ({ page }) => {
    const publicRoutes = ['/', '/auth/signin', '/auth/error?error=OAuthCallback']

    for (const route of publicRoutes) {
      const response = await page.goto(route)
      expect(response?.status()).toBe(200)
      await page.waitForLoadState('domcontentloaded')
    }
  })

  test('supports keyboard navigation on the sign-in screen', async ({ page }) => {
    await page.goto('/auth/signin')

    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab')

      if ((await page.locator('button:focus, a:focus').count()) > 0) {
        break
      }
    }

    await expect(page.locator('button:focus, a:focus').first()).toBeVisible()
  })

  test('keeps provider buttons usable across responsive viewports', async ({ page }) => {
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/auth/signin')

      await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    }
  })
})
