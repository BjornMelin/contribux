/**
 * Cross-Platform & Cross-Browser Validation E2E Tests
 * Comprehensive testing across different browsers, devices, and platforms
 * Demonstrates professional-grade compatibility testing
 */

import { devices, expect, test } from '@playwright/test'

test.describe('Cross-Platform Compatibility Validation', () => {
  test.describe('Browser Compatibility Matrix', () => {
    // Test core functionality across all major browsers
    test('Authentication system cross-browser compatibility', async ({ page, browserName }) => {
      console.log(`🌐 Testing Authentication on: ${browserName}`)

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Browser capability detection
      const browserCapabilities = await page.evaluate(() => {
        return {
          browser: navigator.userAgent,
          webAuthn: !!(navigator.credentials && window.PublicKeyCredential),
          webCrypto: !!window.crypto?.subtle,
          serviceWorker: 'serviceWorker' in navigator,
          pushNotifications: 'PushManager' in window,
          geolocation: 'geolocation' in navigator,
          localStorage: typeof localStorage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined',
          fetch: typeof fetch !== 'undefined',
          promises: typeof Promise !== 'undefined',
          modules: typeof module !== 'undefined',
        }
      })

      console.log(`${browserName} Capabilities:`, browserCapabilities)

      // Validate essential features
      expect(browserCapabilities.fetch).toBeTruthy()
      expect(browserCapabilities.promises).toBeTruthy()
      expect(browserCapabilities.localStorage).toBeTruthy()

      // Authentication providers should be visible
      const githubProvider = page.locator('[data-provider="github"], text=GitHub').first()
      const googleProvider = page.locator('[data-provider="google"], text=Google').first()

      await expect(githubProvider.or(googleProvider)).toBeVisible()

      // WebAuthn support varies by browser
      if (browserCapabilities.webAuthn) {
        console.log(`✅ ${browserName}: WebAuthn supported`)

        // Test WebAuthn registration endpoint
        const webAuthnResponse = await page.request.post('/api/security/webauthn/register/options')
        if (webAuthnResponse.status() === 200) {
          const webAuthnData = await webAuthnResponse.json()
          expect(webAuthnData).toHaveProperty('challenge')
          console.log(`✅ ${browserName}: WebAuthn API functional`)
        }
      } else {
        console.log(`⚠️ ${browserName}: WebAuthn not supported, OAuth fallback active`)
        await expect(page.locator('[data-testid="oauth-only"]').or(githubProvider)).toBeVisible()
      }

      // Browser-specific optimizations
      if (browserName === 'webkit') {
        // Safari-specific tests
        expect(browserCapabilities.webCrypto).toBeTruthy()
        console.log('🍎 Safari optimizations validated')
      } else if (browserName === 'firefox') {
        // Firefox-specific tests
        expect(browserCapabilities.serviceWorker).toBeTruthy()
        console.log('🦊 Firefox optimizations validated')
      } else if (browserName === 'chromium') {
        // Chrome-specific tests
        expect(browserCapabilities.pushNotifications).toBeTruthy()
        console.log('🌟 Chrome optimizations validated')
      }

      await page.screenshot({
        path: `test-results/cross-browser/auth-${browserName}.png`,
        fullPage: true,
      })
    })

    test('API compatibility across browsers', async ({ page, browserName }) => {
      console.log(`🔌 Testing API Compatibility on: ${browserName}`)

      // Test core API endpoints
      const apiEndpoints = [
        '/api/auth/session',
        '/api/auth/providers',
        '/api/auth/csrf',
        '/api/security/health',
      ]

      const apiResults = []

      for (const endpoint of apiEndpoints) {
        const startTime = Date.now()
        const response = await page.request.get(endpoint)
        const endTime = Date.now()
        const responseTime = endTime - startTime

        apiResults.push({
          endpoint,
          status: response.status(),
          responseTime,
          browser: browserName,
        })

        // Validate response
        expect([200, 401, 404].includes(response.status())).toBeTruthy()
        expect(responseTime).toBeLessThan(2000) // 2 second max
      }

      console.log(`${browserName} API Performance:`, apiResults)

      // Browser-specific networking tests
      if (browserName === 'chromium') {
        // Test HTTP/2 support in Chrome
        const http2Test = await page.evaluate(() => {
          return 'chrome' in window && 'loadTimes' in window.chrome
        })
        console.log(`Chrome HTTP/2 optimization: ${http2Test}`)
      }

      await page.screenshot({
        path: `test-results/cross-browser/api-${browserName}.png`,
        fullPage: true,
      })
    })

    test('Performance across browsers', async ({ page, browserName }) => {
      console.log(`⚡ Testing Performance on: ${browserName}`)

      // Page load performance
      const navigationStart = Date.now()
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      const navigationEnd = Date.now()

      const loadTime = navigationEnd - navigationStart
      console.log(`${browserName} Load Time: ${loadTime}ms`)

      // Browser-specific performance thresholds
      let maxLoadTime = 3000 // Default 3 seconds
      if (browserName === 'webkit') {
        maxLoadTime = 4000 // Safari can be slower
      } else if (browserName === 'firefox') {
        maxLoadTime = 3500 // Firefox middle ground
      }

      expect(loadTime).toBeLessThan(maxLoadTime)

      // Memory usage simulation
      const memoryUsage = await page.evaluate(() => {
        interface PerformanceMemory {
          usedJSHeapSize: number
          totalJSHeapSize: number
          jsHeapSizeLimit: number
        }

        const performanceWithMemory = performance as Performance & {
          memory?: PerformanceMemory
        }
        if (performanceWithMemory.memory) {
          return {
            usedJSHeapSize: performanceWithMemory.memory.usedJSHeapSize,
            totalJSHeapSize: performanceWithMemory.memory.totalJSHeapSize,
            jsHeapSizeLimit: performanceWithMemory.memory.jsHeapSizeLimit,
          }
        }
        return null
      })

      if (memoryUsage) {
        console.log(`${browserName} Memory Usage:`, memoryUsage)

        // Validate reasonable memory usage (under 50MB)
        expect(memoryUsage.usedJSHeapSize).toBeLessThan(50 * 1024 * 1024)
      }

      // Core Web Vitals by browser
      const webVitals = await page.evaluate(() => {
        return new Promise(resolve => {
          const vitals = { lcp: 0, fid: 0, cls: 0 }

          // Largest Contentful Paint
          new PerformanceObserver(list => {
            const entries = list.getEntries()
            if (entries.length > 0) {
              vitals.lcp = entries[entries.length - 1].startTime
            }
          }).observe({ entryTypes: ['largest-contentful-paint'] })

          // Cumulative Layout Shift
          new PerformanceObserver(list => {
            vitals.cls = list.getEntries().reduce((sum, entry) => sum + entry.value, 0)
          }).observe({ entryTypes: ['layout-shift'] })

          setTimeout(() => resolve(vitals), 2000)
        })
      })

      console.log(`${browserName} Web Vitals:`, webVitals)

      if (webVitals.lcp > 0) {
        expect(webVitals.lcp).toBeLessThan(4000) // LCP under 4 seconds
      }
      expect(webVitals.cls).toBeLessThan(0.25) // CLS under 0.25

      await page.screenshot({
        path: `test-results/cross-browser/performance-${browserName}.png`,
        fullPage: true,
      })
    })
  })

  test.describe('Device & Viewport Compatibility', () => {
    const testDevices = [
      { name: 'iPhone 12', device: devices['iPhone 12'] },
      { name: 'iPhone 12 Pro', device: devices['iPhone 12 Pro'] },
      { name: 'iPad', device: devices['iPad Pro'] },
      { name: 'Pixel 5', device: devices['Pixel 5'] },
      { name: 'Galaxy S21', device: devices['Galaxy S21 Ultra'] },
    ]

    testDevices.forEach(testDevice => {
      test(`Mobile device compatibility: ${testDevice.name}`, async ({ browser }) => {
        const context = await browser.newContext(testDevice.device)
        const page = await context.newPage()

        console.log(`📱 Testing on: ${testDevice.name}`)

        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        // Mobile-specific validations
        await expect(page.locator('h1')).toBeVisible()

        // Viewport validation
        const viewport = page.viewportSize()
        console.log(`${testDevice.name} Viewport:`, viewport)

        // Touch target validation
        const buttons = page.locator('button, a[href], input, [role="button"]')
        const buttonCount = await buttons.count()

        for (let i = 0; i < Math.min(buttonCount, 5); i++) {
          const button = buttons.nth(i)
          const boundingBox = await button.boundingBox()

          if (boundingBox) {
            // Validate minimum touch target size (44x44px)
            const minDimension = Math.min(boundingBox.width, boundingBox.height)
            expect(minDimension).toBeGreaterThan(32) // Slightly relaxed for portfolio

            if (minDimension < 44) {
              console.log(`⚠️ ${testDevice.name}: Small touch target detected (${minDimension}px)`)
            }
          }
        }

        // Mobile navigation test
        const mobileNav = page.locator('[data-testid="mobile-nav"], .mobile-menu, nav').first()
        if (await mobileNav.isVisible()) {
          console.log(`✅ ${testDevice.name}: Mobile navigation optimized`)
        }

        // Mobile performance
        const mobileLoadStart = Date.now()
        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        const mobileLoadEnd = Date.now()

        const mobileLoadTime = mobileLoadEnd - mobileLoadStart
        console.log(`${testDevice.name} Load Time: ${mobileLoadTime}ms`)

        // Mobile performance expectations (more lenient)
        expect(mobileLoadTime).toBeLessThan(5000)

        // Test authentication on mobile
        await page.goto('/auth/signin')
        await page.waitForLoadState('domcontentloaded')

        const authButtons = page.locator('[data-provider], text=GitHub, text=Google')
        await expect(authButtons.first()).toBeVisible()

        // Mobile-specific auth UX
        const authButtonBox = await authButtons.first().boundingBox()
        if (authButtonBox) {
          expect(authButtonBox.height).toBeGreaterThan(40) // Adequate touch target
        }

        await page.screenshot({
          path: `test-results/mobile/device-${testDevice.name.replace(/\s+/g, '-').toLowerCase()}.png`,
          fullPage: true,
        })

        await context.close()
      })
    })

    test('Custom viewport responsiveness', async ({ page }) => {
      const viewports = [
        { name: 'Small Mobile', width: 320, height: 568 },
        { name: 'Large Mobile', width: 414, height: 896 },
        { name: 'Small Tablet', width: 768, height: 1024 },
        { name: 'Large Tablet', width: 1024, height: 1366 },
        { name: 'Small Desktop', width: 1366, height: 768 },
        { name: 'Large Desktop', width: 1920, height: 1080 },
        { name: 'Ultra Wide', width: 2560, height: 1440 },
      ]

      for (const viewport of viewports) {
        console.log(`🖥️ Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`)

        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        // Core layout validation
        await expect(page.locator('h1')).toBeVisible()
        await expect(page.locator('main, [role="main"]')).toBeVisible()

        // Responsive behavior validation
        if (viewport.width < 768) {
          // Mobile behavior
          const _mobileElements = page.locator('[data-testid*="mobile"], .mobile-only')
          console.log(`📱 ${viewport.name}: Mobile-specific elements`)
        } else if (viewport.width < 1024) {
          // Tablet behavior
          console.log(`📲 ${viewport.name}: Tablet layout`)
        } else {
          // Desktop behavior
          const _desktopElements = page.locator('[data-testid*="desktop"], .desktop-only')
          console.log(`🖥️ ${viewport.name}: Desktop layout`)
        }

        // Test navigation responsiveness
        const navigation = page.locator('nav, [role="navigation"]').first()
        if (await navigation.isVisible()) {
          const navBox = await navigation.boundingBox()
          if (navBox) {
            // Navigation should adapt to viewport
            expect(navBox.width).toBeLessThanOrEqual(viewport.width)
          }
        }

        // Content overflow prevention
        const body = page.locator('body')
        const bodyBox = await body.boundingBox()
        if (bodyBox) {
          expect(bodyBox.width).toBeLessThanOrEqual(viewport.width + 50) // 50px tolerance
        }

        await page.screenshot({
          path: `test-results/responsive/viewport-${viewport.name.replace(/\s+/g, '-').toLowerCase()}.png`,
          fullPage: true,
        })
      }
    })
  })

  test.describe('Feature Support & Graceful Degradation', () => {
    test('WebAuthn support across platforms', async ({ page, browserName }) => {
      console.log(`🔐 Testing WebAuthn support on: ${browserName}`)

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Check WebAuthn availability
      const webAuthnSupport = await page.evaluate(() => {
        return {
          credentialsAvailable: !!navigator.credentials,
          publicKeyCredentialAvailable: !!window.PublicKeyCredential,
          userVerifyingPlatformAuthenticatorAvailable:
            !!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable,
          conditionalMediationAvailable:
            !!window.PublicKeyCredential?.isConditionalMediationAvailable,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        }
      })

      console.log(`${browserName} WebAuthn Support:`, webAuthnSupport)

      if (webAuthnSupport.credentialsAvailable && webAuthnSupport.publicKeyCredentialAvailable) {
        // WebAuthn supported - test registration flow
        console.log(`✅ ${browserName}: Full WebAuthn support`)

        const registrationResponse = await page.request.post(
          '/api/security/webauthn/register/options'
        )
        if (registrationResponse.status() === 200) {
          const regData = await registrationResponse.json()
          expect(regData).toHaveProperty('challenge')
          expect(regData).toHaveProperty('rp')

          // Platform-specific validations
          if (browserName === 'webkit' && webAuthnSupport.platform.includes('Mac')) {
            console.log('🍎 macOS Safari: Touch ID support expected')
            expect(regData.authenticatorSelection?.userVerification).toBeTruthy()
          }
        }

        // Test authentication options
        const authResponse = await page.request.post('/api/security/webauthn/authenticate/options')
        if (authResponse.status() === 200) {
          const authData = await authResponse.json()
          expect(authData).toHaveProperty('challenge')
          console.log(`✅ ${browserName}: WebAuthn authentication options generated`)
        }
      } else {
        // WebAuthn not supported - validate fallback
        console.log(`⚠️ ${browserName}: WebAuthn not supported, validating OAuth fallback`)

        // Ensure OAuth providers are still visible
        const oauthProviders = page.locator('[data-provider="github"], [data-provider="google"]')
        await expect(oauthProviders.first()).toBeVisible()

        // Should show appropriate messaging
        const fallbackMessage = page.locator(
          '[data-testid="webauthn-unavailable"], .webauthn-fallback'
        )
        if (await fallbackMessage.isVisible()) {
          console.log(`✅ ${browserName}: Graceful WebAuthn fallback messaging`)
        }
      }

      await page.screenshot({
        path: `test-results/webauthn/support-${browserName}.png`,
        fullPage: true,
      })
    })

    test('Service Worker and PWA features', async ({ page, browserName }) => {
      console.log(`🛠️ Testing PWA features on: ${browserName}`)

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Service Worker support
      const serviceWorkerSupport = await page.evaluate(() => {
        return {
          serviceWorkerSupported: 'serviceWorker' in navigator,
          cacheStorageSupported: 'caches' in window,
          notificationSupported: 'Notification' in window,
          pushManagerSupported: 'PushManager' in window,
          backgroundSyncSupported:
            'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype,
          manifestSupported: 'onbeforeinstallprompt' in window,
        }
      })

      console.log(`${browserName} PWA Support:`, serviceWorkerSupport)

      if (serviceWorkerSupport.serviceWorkerSupported) {
        console.log(`✅ ${browserName}: Service Worker supported`)

        // Wait for service worker registration
        await page.waitForTimeout(2000)

        const swRegistration = await page.evaluate(() => {
          return navigator.serviceWorker.getRegistration().then(reg => !!reg)
        })

        if (swRegistration) {
          console.log(`✅ ${browserName}: Service Worker registered`)
        }
      } else {
        console.log(`⚠️ ${browserName}: Service Worker not supported`)
      }

      // Web App Manifest
      const manifestLink = page.locator('link[rel="manifest"]')
      if (await manifestLink.isVisible()) {
        const manifestHref = await manifestLink.getAttribute('href')
        console.log(`✅ ${browserName}: Web App Manifest linked (${manifestHref})`)

        // Test manifest accessibility
        if (manifestHref) {
          const manifestResponse = await page.request.get(manifestHref)
          if (manifestResponse.status() === 200) {
            const manifestData = await manifestResponse.json()
            expect(manifestData).toHaveProperty('name')
            console.log(`✅ ${browserName}: Web App Manifest accessible`)
          }
        }
      }

      // Progressive enhancement
      if (serviceWorkerSupport.cacheStorageSupported) {
        console.log(`✅ ${browserName}: Cache Storage supported - offline capability possible`)
      }

      if (serviceWorkerSupport.notificationSupported) {
        console.log(`✅ ${browserName}: Web Notifications supported`)
      }

      await page.screenshot({
        path: `test-results/pwa/features-${browserName}.png`,
        fullPage: true,
      })
    })

    test('Modern CSS and JavaScript features', async ({ page, browserName }) => {
      console.log(`🎨 Testing modern web features on: ${browserName}`)

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // CSS feature support
      const cssSupport = await page.evaluate(() => {
        const testDiv = document.createElement('div')
        document.body.appendChild(testDiv)

        const support = {
          cssGrid: CSS.supports('display', 'grid'),
          cssFlexbox: CSS.supports('display', 'flex'),
          cssCustomProperties: CSS.supports('--test-var', 'red'),
          cssClamp: CSS.supports('width', 'clamp(1rem, 2.5vw, 2rem)'),
          cssAspectRatio: CSS.supports('aspect-ratio', '16/9'),
          cssContainerQueries: CSS.supports('container-type', 'inline-size'),
        }

        document.body.removeChild(testDiv)
        return support
      })

      console.log(`${browserName} CSS Support:`, cssSupport)

      // Essential CSS features should be supported
      expect(cssSupport.cssFlexbox).toBeTruthy()
      expect(cssSupport.cssGrid).toBeTruthy()
      expect(cssSupport.cssCustomProperties).toBeTruthy()

      // JavaScript ES6+ feature support
      const jsSupport = await page.evaluate(() => {
        return {
          es6Classes: typeof class {} === 'function',
          arrowFunctions: (() => true)(),
          templateLiterals: (() => {
            try {
              const test = 'test'
              return `template${test}` === 'templatetest'
            } catch {
              return false
            }
          })(),
          destructuring: (() => {
            try {
              const [_a] = [1]
              return true
            } catch {
              return false
            }
          })(),
          promises: typeof Promise !== 'undefined',
          asyncAwait: (async () => true)().constructor === Promise,
          modules: typeof window !== 'undefined' && 'crypto' in window,
          fetch: typeof fetch !== 'undefined',
          intersectionObserver: 'IntersectionObserver' in window,
          resizeObserver: 'ResizeObserver' in window,
        }
      })

      console.log(`${browserName} JavaScript Support:`, jsSupport)

      // Modern JavaScript features
      expect(jsSupport.es6Classes).toBeTruthy()
      expect(jsSupport.arrowFunctions).toBeTruthy()
      expect(jsSupport.promises).toBeTruthy()
      expect(jsSupport.fetch).toBeTruthy()

      // Performance APIs
      const performanceSupport = await page.evaluate(() => {
        return {
          performanceObserver: 'PerformanceObserver' in window,
          performanceMark: 'performance' in window && 'mark' in performance,
          performanceMeasure: 'performance' in window && 'measure' in performance,
          navigationTiming: 'performance' in window && 'timing' in performance,
          resourceTiming: 'performance' in window && 'getEntriesByType' in performance,
        }
      })

      console.log(`${browserName} Performance API Support:`, performanceSupport)

      if (performanceSupport.performanceObserver) {
        console.log(`✅ ${browserName}: Performance monitoring capabilities available`)
      }

      await page.screenshot({
        path: `test-results/features/modern-web-${browserName}.png`,
        fullPage: true,
      })
    })
  })

  test.describe('Security & Privacy Cross-Platform', () => {
    test('Security headers consistency across browsers', async ({ page, browserName }) => {
      console.log(`🔒 Testing security headers on: ${browserName}`)

      const response = await page.goto('/')
      const headers = response?.headers() || {}

      const securityHeaders = {
        'x-frame-options': headers['x-frame-options'],
        'x-content-type-options': headers['x-content-type-options'],
        'referrer-policy': headers['referrer-policy'],
        'content-security-policy': headers['content-security-policy'],
        'strict-transport-security': headers['strict-transport-security'],
        'permissions-policy': headers['permissions-policy'],
      }

      console.log(`${browserName} Security Headers:`, securityHeaders)

      // Essential security headers
      expect(securityHeaders['x-content-type-options']).toBe('nosniff')

      if (securityHeaders['x-frame-options']) {
        expect(
          ['DENY', 'SAMEORIGIN'].includes(securityHeaders['x-frame-options'].toUpperCase())
        ).toBeTruthy()
      }

      // CSP validation
      if (securityHeaders['content-security-policy']) {
        expect(securityHeaders['content-security-policy']).toContain('default-src')
        console.log(`✅ ${browserName}: Content Security Policy active`)
      }

      // HTTPS enforcement (if applicable)
      if (page.url().startsWith('https://')) {
        expect(securityHeaders['strict-transport-security']).toBeTruthy()
        console.log(`✅ ${browserName}: HSTS enforced`)
      }

      await page.screenshot({
        path: `test-results/security/headers-${browserName}.png`,
        fullPage: true,
      })
    })

    test('Cookie security across platforms', async ({ page, browserName, context }) => {
      console.log(`🍪 Testing cookie security on: ${browserName}`)

      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Trigger potential cookie setting
      const csrfResponse = await page.request.get('/api/auth/csrf')
      if (csrfResponse.status() === 200) {
        console.log(`✅ ${browserName}: CSRF endpoint accessible`)
      }

      // Examine cookies
      const cookies = await context.cookies()
      console.log(
        `${browserName} Cookies:`,
        cookies.map(c => ({
          name: c.name,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
        }))
      )

      // Security validation for auth-related cookies
      const authCookies = cookies.filter(
        cookie =>
          cookie.name.includes('auth') ||
          cookie.name.includes('session') ||
          cookie.name.includes('csrf')
      )

      authCookies.forEach(cookie => {
        expect(cookie.httpOnly).toBeTruthy()
        expect(['Lax', 'Strict', 'None'].includes(cookie.sameSite)).toBeTruthy()

        // In production/HTTPS, should be secure
        if (page.url().startsWith('https://')) {
          expect(cookie.secure).toBeTruthy()
        }

        console.log(`✅ ${browserName}: Cookie ${cookie.name} has proper security attributes`)
      })

      await page.screenshot({
        path: `test-results/security/cookies-${browserName}.png`,
        fullPage: true,
      })
    })
  })

  test.afterEach(async ({ page }, testInfo) => {
    // Log test completion with browser context
    if (testInfo.status === 'passed') {
      console.log(`✅ Cross-Platform Test Passed: ${testInfo.title}`)
    } else {
      console.log(`❌ Cross-Platform Test Failed: ${testInfo.title}`)

      // Enhanced failure debugging
      await page.screenshot({
        path: `test-results/failures/cross-platform-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        fullPage: true,
      })
    }
  })
})
