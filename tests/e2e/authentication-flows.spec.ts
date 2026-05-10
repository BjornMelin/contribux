import { expect, type Page, test } from '@playwright/test'

async function clearBrowserState(page: Page) {
  await page.context().clearCookies()
  await page.goto('/')
  await page
    .evaluate(() => {
      try {
        localStorage.clear()
      } catch {
        // Storage is unavailable on opaque origins and failed navigations.
      }

      try {
        sessionStorage.clear()
      } catch {
        // Storage is unavailable on opaque origins and failed navigations.
      }
    })
    .catch(() => undefined)
}

test.describe('Authentication E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page)
  })

  test('should render the OAuth sign-in experience', async ({ page }) => {
    await page.goto('/auth/signin')

    await expect(page.getByRole('button', { name: /github/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/legal/terms'
    )
    await expect(page.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/legal/privacy'
    )
  })

  test('should redirect to GitHub OAuth through NextAuth', async ({ page }) => {
    let authorizationUrl = ''

    await page.route('https://github.com/login/oauth/authorize**', async route => {
      authorizationUrl = route.request().url()
      await route.abort('aborted')
    })

    await page.goto('/auth/signin')
    await page.getByRole('button', { name: /github/i }).click()

    await expect.poll(() => authorizationUrl, { timeout: 5000 }).toContain('github.com')
    expect(authorizationUrl).toContain('github.com/login/oauth/authorize')
    expect(authorizationUrl).toContain('client_id=')
    expect(authorizationUrl).toContain('scope=')
  })

  test('should expose NextAuth bootstrap endpoints', async ({ request }) => {
    const csrfResponse = await request.get('/api/auth/csrf')
    expect(csrfResponse.status()).toBe(200)
    const csrfData = await csrfResponse.json()
    expect(csrfData).toHaveProperty('csrfToken')
    expect(typeof csrfData.csrfToken).toBe('string')

    const sessionResponse = await request.get('/api/auth/session')
    expect(sessionResponse.status()).toBe(200)
    const sessionData = await sessionResponse.json()
    expect(typeof sessionData).toBe('object')
  })

  test('should handle OAuth error pages', async ({ page }) => {
    await page.goto('/auth/error?error=OAuthCallback')

    await expect(page.getByRole('heading', { name: /authentication error/i })).toBeVisible()
    await expect(page.getByText(/error occurred during oauth callback/i).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/auth/signin'
    )
  })

  test('should protect authenticated routes', async ({ page }) => {
    const response = await page.goto('/dashboard')

    expect(response?.status()).toBe(401)
    await expect(page.getByText(/authentication required/i)).toBeVisible()
  })

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/auth/signin')

    const githubButton = page.getByRole('button', { name: /github/i })
    const googleButton = page.getByRole('button', { name: /google/i })

    await expect(githubButton).toBeVisible()
    await expect(googleButton).toBeVisible()
  })
})
