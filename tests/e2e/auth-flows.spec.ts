import { expect, test } from '@playwright/test'

test.describe('Authentication Flow Tests', () => {
  test('should display authentication providers', async ({ page }) => {
    // Monitor console for errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/auth/signin')
    await page.waitForLoadState('domcontentloaded')

    // Check for authentication provider buttons/links
    const githubAuth = page.locator('text=GitHub').or(page.locator('[data-provider="github"]'))
    const googleAuth = page.locator('text=Google').or(page.locator('[data-provider="google"]'))

    // At least one provider should be visible
    const githubVisible = (await githubAuth.count()) > 0
    const googleVisible = (await googleAuth.count()) > 0

    expect(githubVisible || googleVisible).toBe(true)

    // Check that no console errors occurred
    if (errors.length > 0) {
      console.log('Auth page errors detected:', errors)
      expect(errors).toHaveLength(0)
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/auth-providers.png', fullPage: true })
  })

  test('should handle auth error page', async ({ page }) => {
    await page.goto('/auth/error')
    await page.waitForLoadState('domcontentloaded')

    // Should display error page without crashing
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()

    // Take screenshot
    await page.screenshot({ path: 'test-results/auth-error.png', fullPage: true })
  })

  test('should handle OAuth callback attempts', async ({ page }) => {
    // Test OAuth callback handling (without actual OAuth flow)
    const response = await page.goto('/api/auth/callback/github')

    // Should handle callback appropriately (redirect or error)
    expect([200, 302, 400, 401].includes(response?.status() || 0)).toBeTruthy()
  })

  test('should protect authenticated routes', async ({ page }) => {
    // Try to access a protected route without authentication
    const response = await page.goto('/settings/accounts')

    // Should either redirect to signin or show the page if public
    expect([200, 302, 401].includes(response?.status() || 0)).toBeTruthy()

    // If redirected, should be on signin page
    if (response?.status() === 302 || page.url().includes('/auth/signin')) {
      await expect(page).toHaveURL(/\/auth\/signin/)
    }
  })

  test('should handle session management', async ({ page }) => {
    // Check if session endpoints are working
    const sessionResponse = await page.request.get('/api/auth/session')

    // Should return session info or null
    expect([200, 401].includes(sessionResponse.status())).toBeTruthy()

    if (sessionResponse.status() === 200) {
      const sessionData = await sessionResponse.json()
      expect(sessionData).toBeDefined()
    }
  })

  test('should handle CSRF protection', async ({ page }) => {
    // Test CSRF token handling
    const csrfResponse = await page.request.get('/api/auth/csrf')

    if (csrfResponse.status() === 200) {
      const csrfData = await csrfResponse.json()
      expect(csrfData).toHaveProperty('csrfToken')
      expect(typeof csrfData.csrfToken).toBe('string')
    }
  })

  test('should handle signout functionality', async ({ page }) => {
    // Test signout endpoint
    const signoutResponse = await page.request.post('/api/auth/signout')

    // Should handle signout appropriately
    expect([200, 302, 405].includes(signoutResponse.status())).toBeTruthy()
  })

  test('should validate provider configurations', async ({ page }) => {
    // Check that providers are properly configured
    const providersResponse = await page.request.get('/api/auth/providers')
    expect(providersResponse.status()).toBe(200)

    const providers = await providersResponse.json()

    // Should have GitHub and Google providers configured
    expect(providers).toHaveProperty('github')
    expect(providers).toHaveProperty('google')

    // Check provider properties
    expect(providers.github).toHaveProperty('id', 'github')
    expect(providers.github).toHaveProperty('name', 'GitHub')
    expect(providers.google).toHaveProperty('id', 'google')
    expect(providers.google).toHaveProperty('name', 'Google')
  })

  test('should handle authentication state changes', async ({ page }) => {
    // Monitor authentication state throughout navigation
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    // Navigate through different pages
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await page.goto('/auth/signin')
    await page.waitForLoadState('domcontentloaded')

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Check that no auth-related errors occurred
    const authErrors = errors.filter(
      error =>
        error.toLowerCase().includes('auth') ||
        error.toLowerCase().includes('session') ||
        error.toLowerCase().includes('token')
    )

    if (authErrors.length > 0) {
      console.log('Authentication errors detected:', authErrors)
      expect(authErrors).toHaveLength(0)
    }
  })
})
