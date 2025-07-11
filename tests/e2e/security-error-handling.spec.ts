import { expect, test } from '@playwright/test'

test.describe('Security Error Handling E2E Tests', () => {
  test.describe('Authentication Error Flows', () => {
    test('should handle JWT token expiration gracefully', async ({ page }) => {
      // Mock expired token response
      await page.route('**/api/auth/session', route =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Token expired',
            code: 'JWT_EXPIRED',
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          }),
        })
      )

      await page.goto('/dashboard')

      // Should show session expired message
      await expect(page.locator('[data-testid="session-expired-banner"]')).toBeVisible()
      await expect(page.locator('[data-testid="session-expired-banner"]')).toContainText(
        /session.*expired/i
      )

      // Should offer to refresh session
      const refreshButton = page.locator('button:has-text("Refresh Session")')
      await expect(refreshButton).toBeVisible()

      // Mock successful refresh
      await page.route('**/api/auth/refresh', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'new-jwt-token',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          }),
        })
      )

      await refreshButton.click()

      // Banner should disappear
      await expect(page.locator('[data-testid="session-expired-banner"]')).not.toBeVisible()
    })

    test('should handle OAuth provider errors', async ({ page }) => {
      // Mock OAuth error callback
      await page.goto('/auth/error?error=OAuthAccountNotLinked')

      // Should show appropriate error message
      await expect(page.locator('[data-testid="oauth-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="oauth-error"]')).toContainText(
        /account.*already exists/i
      )

      // Should provide resolution options
      await expect(page.locator('button:has-text("Sign in with existing account")')).toBeVisible()
      await expect(page.locator('button:has-text("Link accounts")')).toBeVisible()
    })

    test('should handle MFA failures', async ({ page }) => {
      await page.goto('/auth/mfa')

      // Enter incorrect MFA code
      await page.fill('[data-testid="mfa-code"]', '000000')
      await page.click('[data-testid="verify-mfa"]')

      // Mock MFA failure
      await page.route('**/api/auth/mfa/verify', route =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid MFA code',
            attemptsRemaining: 2,
          }),
        })
      )

      // Should show error with attempts remaining
      await expect(page.locator('[data-testid="mfa-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="mfa-error"]')).toContainText(/invalid.*code/i)
      await expect(page.locator('[data-testid="attempts-remaining"]')).toContainText('2')

      // Should offer backup codes option after multiple failures
      await page.fill('[data-testid="mfa-code"]', '111111')
      await page.click('[data-testid="verify-mfa"]')

      await expect(page.locator('button:has-text("Use backup code")')).toBeVisible()
    })
  })

  test.describe('Authorization Error Handling', () => {
    test('should handle permission denied errors', async ({ page }) => {
      // Try to access admin area without permissions
      await page.goto('/admin/users')

      // Mock 403 response
      await page.route('**/api/admin/users', route =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Insufficient permissions',
            requiredRole: 'admin',
            currentRole: 'user',
          }),
        })
      )

      // Should show permission denied message
      await expect(page.locator('[data-testid="permission-denied"]')).toBeVisible()
      await expect(page.locator('[data-testid="required-role"]')).toContainText('admin')

      // Should provide request access option
      await expect(page.locator('button:has-text("Request Access")')).toBeVisible()
    })

    test('should handle resource ownership errors', async ({ page }) => {
      // Try to edit another user's repository
      await page.goto('/repositories/other-user-repo/settings')

      await page.route('**/api/repositories/other-user-repo', route =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Not authorized to modify this repository',
            owner: 'other-user',
            currentUser: 'current-user',
          }),
        })
      )

      // Should explain ownership issue
      await expect(page.locator('[data-testid="ownership-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="ownership-error"]')).toContainText(
        /not authorized.*modify/i
      )

      // Should offer to fork instead
      await expect(page.locator('button:has-text("Fork Repository")')).toBeVisible()
    })
  })

  test.describe('Rate Limiting Security', () => {
    test('should implement progressive rate limiting', async ({ page }) => {
      await page.goto('/search')

      let requestCount = 0
      await page.route('**/api/search', route => {
        requestCount++
        if (requestCount <= 10) {
          route.fulfill({
            status: 200,
            headers: {
              'X-RateLimit-Limit': '100',
              'X-RateLimit-Remaining': String(100 - requestCount),
              'X-RateLimit-Reset': String(Date.now() + 3600000),
            },
            contentType: 'application/json',
            body: JSON.stringify({ results: [] }),
          })
        } else {
          route.fulfill({
            status: 429,
            headers: {
              'X-RateLimit-Limit': '100',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Date.now() + 3600000),
            },
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Rate limit exceeded',
              resetAt: new Date(Date.now() + 3600000).toISOString(),
            }),
          })
        }
      })

      // Make rapid requests
      for (let i = 0; i < 12; i++) {
        await page.fill('[data-testid="search-input"]', `query ${i}`)
        await page.click('[data-testid="search-button"]')
        await page.waitForTimeout(50)
      }

      // Should show rate limit warning when approaching limit
      await expect(page.locator('[data-testid="rate-limit-warning"]')).toBeVisible()

      // Should block requests after limit exceeded
      await expect(page.locator('[data-testid="rate-limit-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="rate-limit-reset-time"]')).toBeVisible()
    })

    test('should handle IP-based rate limiting', async ({ page }) => {
      await page.route('**/api/**', route => {
        if (route.request().url().includes('/api/auth/login')) {
          route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Too many login attempts from this IP',
              blockDuration: 900, // 15 minutes
              attemptsFromIp: 10,
            }),
          })
        } else {
          route.continue()
        }
      })

      await page.goto('/auth/signin')
      await page.fill('[data-testid="email"]', 'test@example.com')
      await page.fill('[data-testid="password"]', 'password')
      await page.click('[data-testid="signin-button"]')

      // Should show IP block message
      await expect(page.locator('[data-testid="ip-blocked-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="block-duration"]')).toContainText('15 minutes')

      // Should suggest alternative auth methods
      await expect(page.locator('[data-testid="use-oauth-suggestion"]')).toBeVisible()
    })
  })

  test.describe('CSRF Protection', () => {
    test('should handle CSRF token errors', async ({ page }) => {
      await page.goto('/settings')

      // Mock CSRF error
      await page.route('**/api/user/update', route =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid CSRF token',
            code: 'CSRF_VALIDATION_FAILED',
          }),
        })
      )

      // Try to update settings
      await page.fill('[data-testid="display-name"]', 'New Name')
      await page.click('[data-testid="save-settings"]')

      // Should show CSRF error
      await expect(page.locator('[data-testid="csrf-error"]')).toBeVisible()

      // Should offer to refresh and retry
      const refreshButton = page.locator('button:has-text("Refresh and Retry")')
      await expect(refreshButton).toBeVisible()

      // Mock successful retry
      await page.route('**/api/user/update', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      )

      await refreshButton.click()

      // Should succeed after refresh
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
    })
  })

  test.describe('Input Validation Security', () => {
    test('should prevent XSS attempts', async ({ page }) => {
      await page.goto('/posts/new')

      // Try to submit XSS payload
      const xssPayload = '<script>alert("XSS")</script>'
      await page.fill('[data-testid="post-title"]', xssPayload)
      await page.fill('[data-testid="post-content"]', `Content with ${xssPayload}`)

      await page.route('**/api/posts', route =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid input detected',
            code: 'MALICIOUS_INPUT',
            fields: {
              title: 'Contains potentially malicious content',
              content: 'Contains potentially malicious content',
            },
          }),
        })
      )

      await page.click('[data-testid="publish-post"]')

      // Should show security validation error
      await expect(page.locator('[data-testid="security-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="field-error-title"]')).toContainText(
        /malicious content/i
      )

      // Should sanitize preview
      await page.click('[data-testid="preview-tab"]')
      const previewContent = await page.locator('[data-testid="preview-content"]').innerHTML()
      expect(previewContent).not.toContain('<script>')
    })

    test('should handle SQL injection attempts', async ({ page }) => {
      await page.goto('/search')

      // Try SQL injection in search
      const sqlPayload = "'; DROP TABLE users; --"
      await page.fill('[data-testid="search-input"]', sqlPayload)

      await page.route('**/api/search', route =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid search query',
            code: 'INVALID_QUERY_SYNTAX',
            details: 'Query contains invalid characters',
          }),
        })
      )

      await page.click('[data-testid="search-button"]')

      // Should show validation error
      await expect(page.locator('[data-testid="query-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="query-error"]')).toContainText(/invalid characters/i)
    })
  })

  test.describe('Security Headers Validation', () => {
    test('should enforce CSP violations', async ({ page }) => {
      // Listen for CSP violations
      const cspViolations: string[] = []
      page.on('console', msg => {
        if (msg.text().includes('Content Security Policy')) {
          cspViolations.push(msg.text())
        }
      })

      await page.goto('/')

      // Try to inject inline script
      await page.evaluate(() => {
        const script = document.createElement('script')
        script.textContent = 'console.log("inline script")'
        document.head.appendChild(script)
      })

      // Should have CSP violation
      expect(cspViolations.length).toBeGreaterThan(0)

      // Check if CSP error handling UI appears
      await expect(page.locator('[data-testid="csp-violation-warning"]')).toBeVisible()
    })
  })

  test.describe('API Key Security', () => {
    test('should handle compromised API key', async ({ page }) => {
      await page.goto('/settings/api-keys')

      // Mock compromised key detection
      await page.route('**/api/user/api-keys/validate', route =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'API key has been compromised',
            code: 'API_KEY_COMPROMISED',
            detectedAt: new Date().toISOString(),
            recommendation: 'Rotate immediately',
          }),
        })
      )

      // Should show compromised key warning
      await expect(page.locator('[data-testid="compromised-key-alert"]')).toBeVisible()
      await expect(page.locator('[data-testid="compromised-key-alert"]')).toHaveClass(/urgent/)

      // Should offer immediate rotation
      await expect(page.locator('button:has-text("Rotate Now")')).toBeVisible()

      // Should disable the compromised key
      await expect(page.locator('[data-testid="api-key-status"]')).toContainText(/disabled/i)
    })

    test('should enforce API key permissions', async ({ page }) => {
      // Try to use read-only key for write operation
      await page.route('**/api/repositories', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'API key lacks required permissions',
              code: 'INSUFFICIENT_PERMISSIONS',
              required: ['repo:write'],
              current: ['repo:read'],
            }),
          })
        } else {
          route.continue()
        }
      })

      await page.goto('/repositories/new')
      await page.fill('[data-testid="repo-name"]', 'new-repo')
      await page.click('[data-testid="create-repo"]')

      // Should show permission error
      await expect(page.locator('[data-testid="api-permission-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="required-permissions"]')).toContainText('repo:write')

      // Should suggest using different key
      await expect(page.locator('[data-testid="switch-api-key-suggestion"]')).toBeVisible()
    })
  })

  test.describe('Session Security', () => {
    test('should detect concurrent session attempts', async ({ page }) => {
      await page.goto('/dashboard')

      // Simulate concurrent session detection
      await page.evaluate(() => {
        window.postMessage(
          {
            type: 'SESSION_CONFLICT',
            location: 'Chrome on Windows',
            ip: '192.168.1.100',
            timestamp: new Date().toISOString(),
          },
          '*'
        )
      })

      // Should show concurrent session warning
      await expect(page.locator('[data-testid="concurrent-session-alert"]')).toBeVisible()
      await expect(page.locator('[data-testid="other-session-location"]')).toContainText(
        'Chrome on Windows'
      )

      // Should offer to terminate other session
      await expect(page.locator('button:has-text("Terminate Other Session")')).toBeVisible()
      await expect(page.locator('button:has-text("Keep Both Sessions")')).toBeVisible()
    })
  })
})
