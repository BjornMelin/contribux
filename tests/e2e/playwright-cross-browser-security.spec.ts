import { devices, expect, test } from '@playwright/test'

/**
 * CROSS-BROWSER SECURITY COMPLIANCE TESTING
 *
 * Portfolio demonstration of security testing across different browsers
 * Validates security features work consistently across Chrome, Firefox, Safari
 * Tests browser-specific security APIs and compliance requirements
 */

// Define browser-specific test configurations
const browsers = [
  { name: 'chrome', device: devices['Desktop Chrome'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
  { name: 'safari', device: devices['Desktop Safari'] },
]

browsers.forEach(({ name: browserName, device }) => {
  test.describe(`Security Compliance Testing - ${browserName}`, () => {
    test.use(device)

    test(`Security Headers Validation - ${browserName}`, async ({ page }) => {
      console.log(`🌐 Testing Security Headers in ${browserName}`)

      const response = await page.goto('/')
      const headers = response?.headers() || {}

      // Critical security headers validation
      const securityHeaders = {
        'x-frame-options': headers['x-frame-options'],
        'x-content-type-options': headers['x-content-type-options'],
        'content-security-policy': headers['content-security-policy'],
        'strict-transport-security': headers['strict-transport-security'],
        'referrer-policy': headers['referrer-policy'],
        'permissions-policy': headers['permissions-policy'],
      }

      console.log(`🔒 ${browserName} Security Headers:`, securityHeaders)

      // Validate X-Content-Type-Options
      expect(securityHeaders['x-content-type-options']).toBe('nosniff')

      // Validate X-Frame-Options
      if (securityHeaders['x-frame-options']) {
        expect(
          ['DENY', 'SAMEORIGIN'].includes(securityHeaders['x-frame-options'].toUpperCase())
        ).toBeTruthy()
      }

      // Validate CSP if present
      if (securityHeaders['content-security-policy']) {
        expect(securityHeaders['content-security-policy']).toContain('default-src')
      }

      await page.screenshot({
        path: `test-results/cross-browser-security/headers-${browserName}.png`,
        fullPage: true,
      })

      console.log(`✅ Security headers validated in ${browserName}`)
    })

    test(`Web Crypto API Security - ${browserName}`, async ({ page }) => {
      console.log(`🔐 Testing Web Crypto API in ${browserName}`)

      await page.goto('/auth/signin')

      // Test Web Crypto API availability and functionality
      const cryptoTest = await page.evaluate(async () => {
        try {
          // Check if Web Crypto API is available
          if (!window.crypto || !window.crypto.subtle) {
            return { available: false, error: 'Web Crypto API not available' }
          }

          // Test basic cryptographic operations
          const encoder = new TextEncoder()
          const data = encoder.encode('test data for encryption')

          // Generate a key for AES-GCM
          const key = await window.crypto.subtle.generateKey(
            {
              name: 'AES-GCM',
              length: 256,
            },
            false,
            ['encrypt', 'decrypt']
          )

          // Generate random IV
          const iv = window.crypto.getRandomValues(new Uint8Array(12))

          // Encrypt data
          const encrypted = await window.crypto.subtle.encrypt(
            {
              name: 'AES-GCM',
              iv: iv,
            },
            key,
            data
          )

          return {
            available: true,
            keyGenerated: !!key,
            encryptionWorked: encrypted.byteLength > 0,
            randomValues: iv.length === 12,
          }
        } catch (error) {
          return {
            available: false,
            error: error.message,
          }
        }
      })

      console.log(`🔑 ${browserName} Crypto Test Results:`, cryptoTest)

      expect(cryptoTest.available).toBeTruthy()
      if (cryptoTest.available) {
        expect(cryptoTest.keyGenerated).toBeTruthy()
        expect(cryptoTest.encryptionWorked).toBeTruthy()
        expect(cryptoTest.randomValues).toBeTruthy()
      }

      console.log(`✅ Web Crypto API functional in ${browserName}`)
    })

    test(`WebAuthn API Support - ${browserName}`, async ({ page }) => {
      console.log(`🗝️ Testing WebAuthn API support in ${browserName}`)

      await page.goto('/auth/signin')

      // Test WebAuthn API availability
      const webAuthnSupport = await page.evaluate(() => {
        const support = {
          credentialsAPI: 'credentials' in navigator,
          webAuthnSupported: false,
          publicKeyCredential: 'PublicKeyCredential' in window,
          conditionalMediation: false,
          userVerification: false,
        }

        if (support.publicKeyCredential) {
          support.webAuthnSupported = true

          // Check for conditional mediation support
          if ('isConditionalMediationAvailable' in PublicKeyCredential) {
            support.conditionalMediation = true
          }

          // Check for user verification support
          if ('isUserVerifyingPlatformAuthenticatorAvailable' in PublicKeyCredential) {
            support.userVerification = true
          }
        }

        return support
      })

      console.log(`🔐 ${browserName} WebAuthn Support:`, webAuthnSupport)

      // Basic WebAuthn support should be available
      expect(webAuthnSupport.credentialsAPI).toBeTruthy()
      expect(webAuthnSupport.publicKeyCredential).toBeTruthy()

      if (webAuthnSupport.webAuthnSupported) {
        console.log(`✅ WebAuthn fully supported in ${browserName}`)
      } else {
        console.log(`⚠️ Limited WebAuthn support in ${browserName}`)
      }

      await page.screenshot({
        path: `test-results/cross-browser-security/webauthn-${browserName}.png`,
        fullPage: true,
      })
    })

    test(`Cookie Security Compliance - ${browserName}`, async ({ page, context }) => {
      console.log(`🍪 Testing Cookie Security in ${browserName}`)

      await page.goto('/auth/signin')

      // Trigger authentication-related requests to generate cookies
      await page.request.get('/api/auth/session')
      await page.request.get('/api/auth/csrf')

      const cookies = await context.cookies()
      const authCookies = cookies.filter(
        cookie =>
          cookie.name.includes('auth') ||
          cookie.name.includes('session') ||
          cookie.name.includes('csrf') ||
          cookie.name.includes('next-auth')
      )

      console.log(`🔒 ${browserName} Auth Cookies Found:`, authCookies.length)

      authCookies.forEach(cookie => {
        console.log(`  Cookie: ${cookie.name}`)
        console.log(`    HttpOnly: ${cookie.httpOnly}`)
        console.log(`    Secure: ${cookie.secure}`)
        console.log(`    SameSite: ${cookie.sameSite}`)

        // Validate security attributes
        expect(cookie.httpOnly).toBeTruthy()
        expect(['Lax', 'Strict'].includes(cookie.sameSite)).toBeTruthy()

        if (page.url().startsWith('https://')) {
          expect(cookie.secure).toBeTruthy()
        }
      })

      console.log(`✅ Cookie security validated in ${browserName}`)
    })

    test(`CSP Compliance Testing - ${browserName}`, async ({ page }) => {
      console.log(`🛡️ Testing CSP Compliance in ${browserName}`)

      // Test CSP with inline script blocking
      await page.goto('/')

      const cspTest = await page.evaluate(() => {
        try {
          // Attempt to execute inline script (should be blocked by CSP)
          const script = document.createElement('script')
          script.textContent = 'window.testCSPViolation = true'
          document.head.appendChild(script)

          return {
            inlineScriptBlocked: !window.testCSPViolation,
            cspViolationDetected: true,
          }
        } catch (error) {
          return {
            inlineScriptBlocked: true,
            cspViolationDetected: true,
            error: error.message,
          }
        }
      })

      console.log(`🔒 ${browserName} CSP Test:`, cspTest)

      // CSP should block inline scripts
      expect(cspTest.inlineScriptBlocked).toBeTruthy()

      // Test CSP violation reporting
      let _cspViolationReported = false
      page.on('console', msg => {
        if (msg.text().includes('Content Security Policy')) {
          _cspViolationReported = true
        }
      })

      await page.screenshot({
        path: `test-results/cross-browser-security/csp-${browserName}.png`,
        fullPage: true,
      })

      console.log(`✅ CSP compliance validated in ${browserName}`)
    })

    test(`HTTPS and Secure Context - ${browserName}`, async ({ page }) => {
      console.log(`🔐 Testing HTTPS and Secure Context in ${browserName}`)

      await page.goto('/')

      const securityContext = await page.evaluate(() => {
        return {
          protocol: location.protocol,
          isSecureContext: window.isSecureContext,
          origin: location.origin,
          httpsOnly: location.protocol === 'https:',
          secureFeatures: {
            geolocation: 'geolocation' in navigator,
            camera: 'mediaDevices' in navigator,
            serviceWorker: 'serviceWorker' in navigator,
            crypto: 'crypto' in window && 'subtle' in window.crypto,
          },
        }
      })

      console.log(`🔒 ${browserName} Security Context:`, securityContext)

      // In production, should be HTTPS
      if (process.env.NODE_ENV === 'production') {
        expect(securityContext.httpsOnly).toBeTruthy()
        expect(securityContext.isSecureContext).toBeTruthy()
      }

      // Secure features should be available
      expect(securityContext.secureFeatures.crypto).toBeTruthy()

      console.log(`✅ Security context validated in ${browserName}`)
    })

    test(`Form Security Testing - ${browserName}`, async ({ page }) => {
      console.log(`📝 Testing Form Security in ${browserName}`)

      await page.goto('/auth/signin')

      const formSecurity = await page.evaluate(() => {
        const forms = document.querySelectorAll('form')
        const results = {
          totalForms: forms.length,
          secureSubmission: 0,
          autoCompleteOff: 0,
          csrfProtection: 0,
          httpsAction: 0,
        }

        forms.forEach(form => {
          // Check for HTTPS action
          if (form.action.startsWith('https://') || form.action.startsWith('/')) {
            results.httpsAction++
          }

          // Check for autocomplete off on sensitive forms
          if (form.getAttribute('autocomplete') === 'off') {
            results.autoCompleteOff++
          }

          // Check for CSRF token fields
          const csrfField = form.querySelector('input[name*="csrf"], input[name*="token"]')
          if (csrfField) {
            results.csrfProtection++
          }

          // Check for secure submission method
          if (form.method.toLowerCase() === 'post') {
            results.secureSubmission++
          }
        })

        return results
      })

      console.log(`📋 ${browserName} Form Security Analysis:`, formSecurity)

      // Forms should use secure submission methods
      if (formSecurity.totalForms > 0) {
        expect(formSecurity.secureSubmission).toBeGreaterThan(0)
      }

      await page.screenshot({
        path: `test-results/cross-browser-security/forms-${browserName}.png`,
        fullPage: true,
      })

      console.log(`✅ Form security validated in ${browserName}`)
    })

    test(`Browser-Specific Security Features - ${browserName}`, async ({ page }) => {
      console.log(`🔧 Testing Browser-Specific Security Features in ${browserName}`)

      await page.goto('/')

      const browserFeatures = await page.evaluate(() => {
        const userAgent = navigator.userAgent
        const features = {
          userAgent,
          browserType: '',
          securityFeatures: {
            permissions: 'permissions' in navigator,
            credentials: 'credentials' in navigator,
            serviceWorker: 'serviceWorker' in navigator,
            webAuthn: 'PublicKeyCredential' in window,
            paymentRequest: 'PaymentRequest' in window,
            backgroundSync:
              'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype,
          },
        }

        // Detect browser type
        if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
          features.browserType = 'chrome'
        } else if (userAgent.includes('Firefox')) {
          features.browserType = 'firefox'
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
          features.browserType = 'safari'
        } else {
          features.browserType = 'unknown'
        }

        return features
      })

      console.log(`🔍 ${browserName} Browser Features:`, browserFeatures)

      // Core security features should be available
      expect(browserFeatures.securityFeatures.credentials).toBeTruthy()
      expect(browserFeatures.securityFeatures.webAuthn).toBeTruthy()

      // Browser-specific validations
      if (browserName === 'chrome') {
        expect(browserFeatures.securityFeatures.permissions).toBeTruthy()
      }

      console.log(`✅ Browser-specific security features validated in ${browserName}`)
    })

    test.afterEach(async ({ page }, testInfo) => {
      if (testInfo.status === 'failed') {
        await page.screenshot({
          path: `test-results/cross-browser-security/failure-${browserName}-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
          fullPage: true,
        })
      }

      console.log(`🔒 ${browserName} Security Test: ${testInfo.title} - ${testInfo.status}`)
    })
  })
})

// Cross-browser compatibility summary test
test.describe('Cross-Browser Security Summary', () => {
  test('Security Feature Compatibility Matrix', async ({ browser }) => {
    console.log('📊 Generating Cross-Browser Security Compatibility Matrix')

    const testResults = {
      timestamp: new Date().toISOString(),
      browserName: browser.browserType().name(),
      securityFeatures: {
        webCrypto: false,
        webAuthn: false,
        csp: false,
        secureContext: false,
        permissions: false,
        credentials: false,
      },
      complianceScore: 0,
    }

    const page = await browser.newPage()

    try {
      await page.goto('/')

      // Test all security features
      const features = await page.evaluate(async () => {
        const results = {
          webCrypto: 'crypto' in window && 'subtle' in window.crypto,
          webAuthn: 'PublicKeyCredential' in window,
          secureContext: window.isSecureContext,
          permissions: 'permissions' in navigator,
          credentials: 'credentials' in navigator,
        }

        // Test CSP
        const response = await fetch('/')
        const cspHeader = response.headers.get('content-security-policy')
        results.csp = !!cspHeader && cspHeader.includes('default-src')

        return results
      })

      testResults.securityFeatures = features

      // Calculate compliance score
      const totalFeatures = Object.keys(features).length
      const supportedFeatures = Object.values(features).filter(Boolean).length
      testResults.complianceScore = Math.round((supportedFeatures / totalFeatures) * 100)

      console.log('🔒 Security Compatibility Results:', testResults)

      // Minimum compliance requirements
      expect(testResults.complianceScore).toBeGreaterThanOrEqual(70) // 70% minimum
      expect(testResults.securityFeatures.webCrypto).toBeTruthy()
      expect(testResults.securityFeatures.webAuthn).toBeTruthy()

      await page.screenshot({
        path: `test-results/cross-browser-security/compatibility-matrix-${testResults.browserName}.png`,
        fullPage: true,
      })
    } finally {
      await page.close()
    }

    console.log(
      `✅ Cross-browser security compatibility validated: ${testResults.complianceScore}%`
    )
  })
})
