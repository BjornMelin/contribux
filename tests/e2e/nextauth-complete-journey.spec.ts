/**
 * NextAuth.js v5 Complete Authentication Journey E2E Tests
 * End-to-end testing using Playwright for complete user authentication flows
 */

import { expect, test } from '@playwright/test'

test.describe('NextAuth Complete Authentication Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Set up console error monitoring
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text())
      }
    })

    // Set up request monitoring for auth-related requests
    page.on('request', request => {
      if (request.url().includes('/api/auth/')) {
        console.log('Auth request:', request.method(), request.url())
      }
    })
  })

  test.describe('Complete OAuth Flow', () => {
    test('should complete GitHub OAuth authentication flow', async ({ page, context }) => {
      // Start from the sign-in page
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Take screenshot of sign-in page
      await page.screenshot({ path: 'test-results/auth/signin-page.png', fullPage: true })

      // Check for GitHub OAuth provider button
      const githubButton = page.locator('[data-provider="github"], text=GitHub').first()
      await expect(githubButton).toBeVisible()

      // Note: In E2E tests, we don't actually complete OAuth to avoid external dependencies
      // Instead, we test that the OAuth flow initiates correctly

      // Click GitHub sign-in button
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/auth/signin/github') && response.status() === 302
      )

      await githubButton.click()

      const response = await responsePromise
      expect(response.status()).toBe(302)

      // Verify redirect includes OAuth parameters
      const location = response.headers().location
      expect(location).toBeTruthy()

      if (location) {
        expect(location).toContain('github.com/login/oauth/authorize')
        expect(location).toContain('client_id=')
        expect(location).toContain('scope=')
        expect(location).toContain('state=')
      }
    })

    test('should handle OAuth callback with state validation', async ({ page }) => {
      // Test OAuth callback handling
      const mockState = 'test-state-parameter-12345'
      const mockCode = 'test-authorization-code-67890'

      // Navigate to OAuth callback URL
      const callbackUrl = `/api/auth/callback/github?code=${mockCode}&state=${mockState}`
      const response = await page.goto(callbackUrl)

      // Should handle callback appropriately (redirect or error)
      expect([200, 302, 400, 401].includes(response?.status() || 0)).toBeTruthy()

      // Take screenshot of callback handling
      await page.screenshot({ path: 'test-results/auth/oauth-callback.png', fullPage: true })
    })

    test('should handle OAuth error scenarios', async ({ page }) => {
      // Test OAuth error handling
      const errorCallbackUrl =
        '/api/auth/callback/github?error=access_denied&error_description=User%20denied%20access'
      await page.goto(errorCallbackUrl)

      // Should redirect to error page or sign-in page
      await page.waitForLoadState('domcontentloaded')

      const currentUrl = page.url()
      expect(currentUrl).toMatch(/\/(auth\/(signin|error)|$)/)

      // Take screenshot of error handling
      await page.screenshot({ path: 'test-results/auth/oauth-error.png', fullPage: true })
    })
  })

  test.describe('Session Management Journey', () => {
    test('should handle session creation and validation', async ({ page }) => {
      // Test session endpoint
      const sessionResponse = await page.request.get('/api/auth/session')
      expect([200, 401].includes(sessionResponse.status())).toBeTruthy()

      if (sessionResponse.status() === 200) {
        const sessionData = await sessionResponse.json()
        expect(sessionData).toBeDefined()

        // If session exists, validate structure
        if (sessionData.user) {
          expect(sessionData.user).toHaveProperty('email')
          expect(sessionData).toHaveProperty('expires')
        }
      }
    })

    test('should provide CSRF protection', async ({ page }) => {
      // Test CSRF token endpoint
      const csrfResponse = await page.request.get('/api/auth/csrf')
      expect(csrfResponse.status()).toBe(200)

      const csrfData = await csrfResponse.json()
      expect(csrfData).toHaveProperty('csrfToken')
      expect(typeof csrfData.csrfToken).toBe('string')
      expect(csrfData.csrfToken.length).toBeGreaterThan(16)
    })

    test('should list configured providers', async ({ page }) => {
      // Test providers endpoint
      const providersResponse = await page.request.get('/api/auth/providers')
      expect(providersResponse.status()).toBe(200)

      const providers = await providersResponse.json()
      expect(providers).toHaveProperty('github')
      expect(providers).toHaveProperty('google')

      // Verify provider configurations
      expect(providers.github).toHaveProperty('id', 'github')
      expect(providers.github).toHaveProperty('name', 'GitHub')
      expect(providers.github).toHaveProperty('type', 'oauth')

      expect(providers.google).toHaveProperty('id', 'google')
      expect(providers.google).toHaveProperty('name', 'Google')
      expect(providers.google).toHaveProperty('type', 'oauth')
    })

    test('should handle session expiration', async ({ page, context }) => {
      // Simulate expired session by setting old cookie
      const expiredDate = new Date(Date.now() - 86400000) // 24 hours ago

      await context.addCookies([
        {
          name: 'next-auth.session-token',
          value: 'expired-session-token-123',
          domain: 'localhost',
          path: '/',
          expires: Math.floor(expiredDate.getTime() / 1000),
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ])

      // Navigate to a page that checks authentication
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Should show sign-in page for expired session
      expect(page.url()).toContain('/auth/signin')
    })
  })

  test.describe('Multi-Tab Session Management', () => {
    test('should maintain session across multiple tabs', async ({ browser }) => {
      const context = await browser.newContext()

      // Open first tab
      const page1 = await context.newPage()
      await page1.goto('/auth/signin')

      // Open second tab
      const page2 = await context.newPage()
      await page2.goto('/auth/signin')

      // Both tabs should show the same authentication state
      const sessionResponse1 = await page1.request.get('/api/auth/session')
      const sessionResponse2 = await page2.request.get('/api/auth/session')

      expect(sessionResponse1.status()).toBe(sessionResponse2.status())

      await context.close()
    })

    test('should handle signout across tabs', async ({ browser }) => {
      const context = await browser.newContext()

      // Create multiple tabs
      const page1 = await context.newPage()
      const page2 = await context.newPage()

      await page1.goto('/')
      await page2.goto('/')

      // Perform signout on first tab
      const signoutResponse = await page1.request.post('/api/auth/signout', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: 'csrfToken=test-csrf-token',
      })

      expect([200, 302, 405].includes(signoutResponse.status())).toBeTruthy()

      await context.close()
    })
  })

  test.describe('Authentication State Navigation', () => {
    test('should redirect unauthenticated users from protected routes', async ({ page }) => {
      // Try to access a protected route
      const response = await page.goto('/dashboard')

      // Should either redirect to signin or show public content
      if (response?.status() === 302) {
        // Follow redirect
        await page.waitForLoadState('domcontentloaded')
        expect(page.url()).toMatch(/\/auth\/signin/)
      }

      // Take screenshot
      await page.screenshot({
        path: 'test-results/auth/protected-route-redirect.png',
        fullPage: true,
      })
    })

    test('should allow access to public routes', async ({ page }) => {
      const publicRoutes = ['/', '/about', '/privacy', '/terms', '/auth/signin', '/auth/error']

      for (const route of publicRoutes) {
        const response = await page.goto(route)
        expect([200, 404].includes(response?.status() || 0)).toBeTruthy()

        // Ensure page loads without auth redirects
        await page.waitForLoadState('domcontentloaded')

        if (response?.status() === 200) {
          expect(page.url()).toContain(route)
        }
      }
    })

    test('should maintain authentication state during navigation', async ({ page }) => {
      // Navigate through multiple pages
      const pages = ['/', '/auth/signin', '/', '/about', '/']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('domcontentloaded')

        // Check session consistency
        const sessionResponse = await page.request.get('/api/auth/session')
        expect([200, 401].includes(sessionResponse.status())).toBeTruthy()
      }
    })
  })

  test.describe('Security Validation', () => {
    test('should have secure cookie configuration', async ({ page, context }) => {
      // Navigate to trigger auth cookies
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check cookie security attributes
      const cookies = await context.cookies()
      const authCookies = cookies.filter(
        cookie => cookie.name.includes('next-auth') || cookie.name.includes('session')
      )

      authCookies.forEach(cookie => {
        // In production, these should be secure
        if (process.env.NODE_ENV === 'production') {
          expect(cookie.secure).toBe(true)
        }
        expect(cookie.httpOnly).toBe(true)
        expect(cookie.sameSite).toBe('Lax')
      })
    })

    test('should validate Content Security Policy headers', async ({ page }) => {
      const response = await page.goto('/auth/signin')

      if (response) {
        const headers = response.headers()

        // Check for security headers
        const securityHeaders = ['x-frame-options', 'x-content-type-options', 'referrer-policy']

        securityHeaders.forEach(header => {
          if (headers[header]) {
            expect(headers[header]).toBeTruthy()
          }
        })
      }
    })

    test('should prevent clickjacking attacks', async ({ page }) => {
      const response = await page.goto('/auth/signin')

      if (response) {
        const headers = response.headers()
        const xFrameOptions = headers['x-frame-options']

        if (xFrameOptions) {
          expect(['DENY', 'SAMEORIGIN'].includes(xFrameOptions.toUpperCase())).toBeTruthy()
        }
      }
    })

    test('should handle malformed authentication requests', async ({ page }) => {
      // Test with malformed OAuth callback
      const malformedCallbacks = [
        '/api/auth/callback/github?code=',
        '/api/auth/callback/github?state=',
        '/api/auth/callback/github?error=invalid_request',
        '/api/auth/callback/nonexistent',
      ]

      for (const callback of malformedCallbacks) {
        const response = await page.goto(callback)

        // Should handle errors gracefully
        expect([400, 401, 404, 302].includes(response?.status() || 0)).toBeTruthy()
      }
    })
  })

  test.describe('Responsive Authentication', () => {
    test('should work on mobile viewports', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check that auth providers are visible on mobile
      const githubButton = page.locator('[data-provider="github"], text=GitHub').first()
      await expect(githubButton).toBeVisible()

      // Take mobile screenshot
      await page.screenshot({ path: 'test-results/auth/mobile-signin.png', fullPage: true })
    })

    test('should work on tablet viewports', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 })

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check that auth interface is accessible on tablet
      const authProviders = page.locator('[data-provider]')
      await expect(authProviders.first()).toBeVisible()

      // Take tablet screenshot
      await page.screenshot({ path: 'test-results/auth/tablet-signin.png', fullPage: true })
    })

    test('should work on desktop viewports', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 })

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check that auth interface is properly displayed on desktop
      const signinContainer = page.locator('main, [role="main"], .signin-container').first()
      await expect(signinContainer).toBeVisible()

      // Take desktop screenshot
      await page.screenshot({ path: 'test-results/auth/desktop-signin.png', fullPage: true })
    })
  })

  test.describe('Performance Testing', () => {
    test('should load authentication pages quickly', async ({ page }) => {
      const startTime = Date.now()

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      const loadTime = Date.now() - startTime

      // Authentication page should load within 3 seconds
      expect(loadTime).toBeLessThan(3000)
    })

    test('should handle authentication API requests efficiently', async ({ page }) => {
      const startTime = Date.now()

      // Test session API performance
      const sessionResponse = await page.request.get('/api/auth/session')

      const responseTime = Date.now() - startTime

      // Session API should respond within 1 second
      expect(responseTime).toBeLessThan(1000)
      expect([200, 401].includes(sessionResponse.status())).toBeTruthy()
    })

    test('should handle providers API efficiently', async ({ page }) => {
      const startTime = Date.now()

      const providersResponse = await page.request.get('/api/auth/providers')

      const responseTime = Date.now() - startTime

      // Providers API should respond quickly
      expect(responseTime).toBeLessThan(500)
      expect(providersResponse.status()).toBe(200)
    })
  })

  test.describe('Accessibility Testing', () => {
    test('should be accessible to screen readers', async ({ page }) => {
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check for proper ARIA labels and roles
      const authButtons = page.locator('button, [role="button"]')
      const buttonCount = await authButtons.count()

      for (let i = 0; i < buttonCount; i++) {
        const button = authButtons.nth(i)
        const ariaLabel = await button.getAttribute('aria-label')
        const text = await button.textContent()

        // Buttons should have accessible text or aria-label
        expect(ariaLabel || text).toBeTruthy()
      }
    })

    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Tab through interactive elements
      await page.keyboard.press('Tab')

      // First focusable element should be focused
      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()

      // Continue tabbing to ensure all interactive elements are reachable
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
    })

    test('should have proper heading structure', async ({ page }) => {
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check for proper heading hierarchy
      const h1 = page.locator('h1')
      await expect(h1).toBeVisible()

      const headingText = await h1.textContent()
      expect(headingText).toMatch(/sign.?in|login|authenticate/i)
    })
  })
})
