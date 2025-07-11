import { expect, test } from '@playwright/test'

test.describe('Authentication E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies and local storage before each test
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
  })

  test.describe('Sign In Flow', () => {
    test('should sign in with email and password', async ({ page }) => {
      await page.goto('/auth/signin')

      // Fill in credentials
      await page.fill('[data-testid="email-input"]', 'test@example.com')
      await page.fill('[data-testid="password-input"]', 'TestPassword123!')

      // Click sign in
      await page.click('[data-testid="signin-button"]')

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard')

      // Should show user info
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
      await expect(page.locator('[data-testid="user-email"]')).toContainText('test@example.com')
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/signin')

      await page.fill('[data-testid="email-input"]', 'wrong@example.com')
      await page.fill('[data-testid="password-input"]', 'wrongpassword')
      await page.click('[data-testid="signin-button"]')

      // Should show error message
      await expect(page.locator('[data-testid="auth-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="auth-error"]')).toContainText('Invalid credentials')

      // Should not redirect
      await expect(page).toHaveURL('/auth/signin')
    })

    test('should validate email format', async ({ page }) => {
      await page.goto('/auth/signin')

      await page.fill('[data-testid="email-input"]', 'notanemail')
      await page.click('[data-testid="password-input"]') // Trigger blur

      // Should show validation error
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="email-error"]')).toContainText('valid email')

      // Sign in button should be disabled
      await expect(page.locator('[data-testid="signin-button"]')).toBeDisabled()
    })

    test('should handle password visibility toggle', async ({ page }) => {
      await page.goto('/auth/signin')

      const passwordInput = page.locator('[data-testid="password-input"]')
      const toggleButton = page.locator('[data-testid="password-toggle"]')

      // Initially password should be hidden
      await expect(passwordInput).toHaveAttribute('type', 'password')

      // Click toggle to show password
      await toggleButton.click()
      await expect(passwordInput).toHaveAttribute('type', 'text')

      // Click again to hide
      await toggleButton.click()
      await expect(passwordInput).toHaveAttribute('type', 'password')
    })
  })

  test.describe('OAuth Sign In', () => {
    test('should redirect to GitHub OAuth', async ({ page }) => {
      await page.goto('/auth/signin')

      // Mock GitHub OAuth URL
      await page.route('**/api/auth/signin', route => {
        if (route.request().postData()?.includes('github')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              url: 'https://github.com/login/oauth/authorize?client_id=test',
            }),
          })
        } else {
          route.continue()
        }
      })

      // Click GitHub sign in
      await page.click('[data-testid="github-signin"]')

      // Should initiate OAuth flow
      await expect(page).toHaveURL(/github\.com\/login\/oauth/)
    })

    test('should handle OAuth callback success', async ({ page }) => {
      // Mock successful OAuth callback
      await page.route('**/api/auth/callback/github*', route => {
        route.fulfill({
          status: 302,
          headers: {
            Location: '/dashboard',
            'Set-Cookie': 'session-token=valid; Path=/; HttpOnly; Secure',
          },
        })
      })

      // Navigate to callback URL
      await page.goto('/api/auth/callback/github?code=test-code&state=test-state')

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard')
    })

    test('should handle OAuth callback errors', async ({ page }) => {
      await page.goto('/api/auth/callback/github?error=access_denied')

      // Should redirect to error page
      await expect(page).toHaveURL('/auth/error')
      await expect(page.locator('[data-testid="oauth-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Access denied')
    })
  })

  test.describe('Sign Up Flow', () => {
    test('should complete sign up process', async ({ page }) => {
      await page.goto('/auth/signup')

      // Fill registration form
      await page.fill('[data-testid="name-input"]', 'New User')
      await page.fill('[data-testid="email-input"]', 'newuser@example.com')
      await page.fill('[data-testid="password-input"]', 'SecurePassword123!')
      await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!')

      // Accept terms
      await page.check('[data-testid="terms-checkbox"]')

      // Mock successful registration
      await page.route('**/api/auth/register', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Verification email sent',
          }),
        })
      })

      // Submit form
      await page.click('[data-testid="signup-button"]')

      // Should show success message
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        'Verification email sent'
      )
    })

    test('should validate password requirements', async ({ page }) => {
      await page.goto('/auth/signup')

      const passwordInput = page.locator('[data-testid="password-input"]')
      const requirements = page.locator('[data-testid="password-requirements"]')

      // Type weak password
      await passwordInput.fill('weak')

      // Should show requirements
      await expect(requirements).toBeVisible()
      await expect(requirements.locator('[data-testid="req-length"]')).toHaveClass(/invalid/)
      await expect(requirements.locator('[data-testid="req-uppercase"]')).toHaveClass(/invalid/)
      await expect(requirements.locator('[data-testid="req-number"]')).toHaveClass(/invalid/)

      // Type strong password
      await passwordInput.fill('StrongPassword123!')

      // All requirements should be met
      await expect(requirements.locator('[data-testid="req-length"]')).toHaveClass(/valid/)
      await expect(requirements.locator('[data-testid="req-uppercase"]')).toHaveClass(/valid/)
      await expect(requirements.locator('[data-testid="req-number"]')).toHaveClass(/valid/)
      await expect(requirements.locator('[data-testid="req-special"]')).toHaveClass(/valid/)
    })

    test('should check for existing email', async ({ page }) => {
      await page.goto('/auth/signup')

      // Mock email check API
      await page.route('**/api/auth/check-email', route => {
        const email = new URL(route.request().url()).searchParams.get('email')
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            exists: email === 'existing@example.com',
          }),
        })
      })

      // Type existing email
      await page.fill('[data-testid="email-input"]', 'existing@example.com')
      await page.click('[data-testid="password-input"]') // Trigger blur

      // Should show error
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="email-error"]')).toContainText('already registered')
    })
  })

  test.describe('Password Reset Flow', () => {
    test('should request password reset', async ({ page }) => {
      await page.goto('/auth/forgot-password')

      // Enter email
      await page.fill('[data-testid="email-input"]', 'test@example.com')

      // Mock reset email API
      await page.route('**/api/auth/reset-password', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sent: true,
          }),
        })
      })

      // Submit
      await page.click('[data-testid="reset-button"]')

      // Should show success message
      await expect(page.locator('[data-testid="reset-success"]')).toBeVisible()
      await expect(page.locator('[data-testid="reset-success"]')).toContainText('Check your email')
    })

    test('should reset password with token', async ({ page }) => {
      // Navigate to reset page with token
      await page.goto('/auth/reset-password?token=valid-reset-token')

      // Enter new password
      await page.fill('[data-testid="new-password-input"]', 'NewSecurePassword123!')
      await page.fill('[data-testid="confirm-password-input"]', 'NewSecurePassword123!')

      // Mock password update API
      await page.route('**/api/auth/update-password', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
          }),
        })
      })

      // Submit
      await page.click('[data-testid="update-password-button"]')

      // Should redirect to sign in
      await expect(page).toHaveURL('/auth/signin?reset=success')
      await expect(page.locator('[data-testid="success-banner"]')).toBeVisible()
    })
  })

  test.describe('Session Management', () => {
    test('should maintain session across page refreshes', async ({ page }) => {
      // Mock authenticated session
      await page.context().addCookies([
        {
          name: 'session-token',
          value: 'valid-session',
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
        },
      ])

      await page.goto('/dashboard')

      // Should stay authenticated
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()

      // Refresh page
      await page.reload()

      // Should still be authenticated
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
    })

    test('should handle session expiry', async ({ page }) => {
      // Start with valid session
      await page.context().addCookies([
        {
          name: 'session-token',
          value: 'expiring-session',
          domain: 'localhost',
          path: '/',
        },
      ])

      await page.goto('/dashboard')

      // Mock session expiry on next API call
      await page.route('**/api/**', route => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Session expired',
          }),
        })
      })

      // Trigger an API call
      await page.click('[data-testid="refresh-data"]')

      // Should show session expired modal
      await expect(page.locator('[data-testid="session-expired-modal"]')).toBeVisible()

      // Click sign in again
      await page.click('[data-testid="signin-again-button"]')

      // Should redirect to sign in
      await expect(page).toHaveURL('/auth/signin?redirect=/dashboard')
    })

    test('should sign out successfully', async ({ page }) => {
      // Start authenticated
      await page.context().addCookies([
        {
          name: 'session-token',
          value: 'valid-session',
          domain: 'localhost',
          path: '/',
        },
      ])

      await page.goto('/dashboard')

      // Open user menu
      await page.click('[data-testid="user-menu"]')

      // Mock logout API
      await page.route('**/api/auth/logout', route => {
        route.fulfill({
          status: 200,
          headers: {
            'Set-Cookie': 'session-token=; Max-Age=0; Path=/',
          },
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      })

      // Click sign out
      await page.click('[data-testid="signout-button"]')

      // Should redirect to home
      await expect(page).toHaveURL('/')

      // Should clear session
      const cookies = await page.context().cookies()
      expect(cookies.find(c => c.name === 'session-token')).toBeUndefined()
    })
  })

  test.describe('Multi-Factor Authentication', () => {
    test('should complete MFA setup', async ({ page }) => {
      // Navigate to security settings
      await page.goto('/settings/security')

      // Click enable MFA
      await page.click('[data-testid="enable-mfa-button"]')

      // Should show QR code
      await expect(page.locator('[data-testid="mfa-qr-code"]')).toBeVisible()
      await expect(page.locator('[data-testid="mfa-secret"]')).toBeVisible()

      // Enter verification code
      await page.fill('[data-testid="mfa-code-input"]', '123456')

      // Mock verification
      await page.route('**/api/auth/mfa/verify', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            verified: true,
            backupCodes: ['ABC123', 'DEF456', 'GHI789'],
          }),
        })
      })

      // Submit
      await page.click('[data-testid="verify-mfa-button"]')

      // Should show backup codes
      await expect(page.locator('[data-testid="backup-codes"]')).toBeVisible()
      await expect(page.locator('[data-testid="backup-code-1"]')).toContainText('ABC123')
    })

    test('should require MFA on sign in', async ({ page }) => {
      await page.goto('/auth/signin')

      // Sign in with credentials
      await page.fill('[data-testid="email-input"]', 'mfa@example.com')
      await page.fill('[data-testid="password-input"]', 'password123')

      // Mock MFA requirement
      await page.route('**/api/auth/signin', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            requiresMFA: true,
            tempToken: 'temp-mfa-token',
          }),
        })
      })

      await page.click('[data-testid="signin-button"]')

      // Should show MFA prompt
      await expect(page).toHaveURL('/auth/mfa')
      await expect(page.locator('[data-testid="mfa-prompt"]')).toBeVisible()

      // Enter MFA code
      await page.fill('[data-testid="mfa-code"]', '123456')

      // Mock successful MFA
      await page.route('**/api/auth/mfa/validate', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            redirectUrl: '/dashboard',
          }),
        })
      })

      await page.click('[data-testid="submit-mfa"]')

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard')
    })
  })

  test.describe('Mobile Authentication', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should work on mobile viewport', async ({ page }) => {
      await page.goto('/auth/signin')

      // Mobile menu should be visible
      await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()

      // Form should be responsive
      const form = page.locator('[data-testid="signin-form"]')
      await expect(form).toBeVisible()

      // Fill and submit should work
      await page.fill('[data-testid="email-input"]', 'mobile@example.com')
      await page.fill('[data-testid="password-input"]', 'password123')
      await page.click('[data-testid="signin-button"]')
    })

    test('should handle biometric prompt', async ({ page }) => {
      // Mock biometric availability
      await page.addInitScript(() => {
        window.PublicKeyCredential = {
          isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
        } as any
      })

      await page.goto('/auth/signin')

      // Should show biometric option
      await expect(page.locator('[data-testid="biometric-signin"]')).toBeVisible()

      // Click biometric sign in
      await page.click('[data-testid="biometric-signin"]')

      // Should show biometric prompt message
      await expect(page.locator('[data-testid="biometric-prompt"]')).toBeVisible()
    })
  })
})
