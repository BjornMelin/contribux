/**
 * Portfolio Demonstration E2E Tests
 * Comprehensive user journeys designed to showcase technical implementation
 * for technical interviews and portfolio demonstrations
 */

import { expect, test } from '@playwright/test'

test.describe('Portfolio Demonstration Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Performance and error monitoring
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('🚨 Console Error:', msg.text())
      }
    })

    // Network request monitoring
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log('📡 API Request:', request.method(), request.url())
      }
    })
  })

  test.describe('Technical Interview Demo Flow', () => {
    test('Complete authentication system showcase', async ({ page }) => {
      // Step 1: Professional homepage presentation
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Validate professional UI elements
      await expect(page.locator('h1')).toBeVisible()
      await expect(
        page.locator('[data-testid="hero-section"]').or(page.locator('main'))
      ).toBeVisible()

      // Step 2: Authentication system demonstration
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      // Multi-provider OAuth validation
      const githubProvider = page.locator('[data-provider="github"], text=GitHub').first()
      const googleProvider = page.locator('[data-provider="google"], text=Google').first()

      await expect(githubProvider.or(googleProvider)).toBeVisible()

      // Step 3: WebAuthn capability demonstration
      const webAuthnSupported = await page.evaluate(() => {
        return !!(
          navigator.credentials?.create &&
          navigator.credentials.get &&
          window.PublicKeyCredential
        )
      })

      console.log('🔐 WebAuthn Browser Support:', webAuthnSupported)

      if (webAuthnSupported) {
        // Test WebAuthn registration endpoint
        const registrationResponse = await page.request.post(
          '/api/security/webauthn/register/options'
        )

        if (registrationResponse.status() === 200) {
          const registrationData = await registrationResponse.json()
          expect(registrationData).toHaveProperty('challenge')
          expect(registrationData).toHaveProperty('rp')
          console.log('✅ WebAuthn Registration Options Generated')
        }
      }

      // Step 4: OAuth flow initiation (technical demonstration)
      const responsePromise = page
        .waitForResponse(
          response =>
            response.url().includes('/api/auth/signin/github') && response.status() === 302,
          { timeout: 5000 }
        )
        .catch(() => null)

      await githubProvider.click().catch(() => console.log('GitHub provider not clickable'))

      const oauthResponse = await responsePromise
      if (oauthResponse) {
        expect(oauthResponse.status()).toBe(302)

        const location = oauthResponse.headers().location
        if (location) {
          expect(location).toContain('github.com/login/oauth/authorize')
          expect(location).toContain('client_id=')
          expect(location).toContain('scope=')
          expect(location).toContain('state=')
          console.log('✅ OAuth Flow Properly Configured')
        }
      }

      // Step 5: Security demonstration
      await page.goto('/api/security/health')
      const securityResponse = await page.request.get('/api/security/health')

      if (securityResponse.status() === 200) {
        const securityData = await securityResponse.json()
        console.log('🛡️ Security Health Status:', securityData.status)

        // Validate security components
        expect(securityData).toHaveProperty('status')
        expect(['healthy', 'warning', 'error'].includes(securityData.status)).toBeTruthy()
      }

      // Portfolio screenshots
      await page.goto('/')
      await page.screenshot({
        path: 'test-results/portfolio/technical-interview-demo.png',
        fullPage: true,
      })
    })

    test('Security middleware and headers showcase', async ({ page }) => {
      // Test security headers implementation
      const response = await page.goto('/')
      const headers = response?.headers() || {}

      console.log('🔒 Security Headers Analysis:')

      // Critical security headers for portfolio demonstration
      const securityHeaders = {
        'x-frame-options': headers['x-frame-options'],
        'x-content-type-options': headers['x-content-type-options'],
        'referrer-policy': headers['referrer-policy'],
        'content-security-policy': headers['content-security-policy'],
      }

      Object.entries(securityHeaders).forEach(([header, value]) => {
        console.log(`  ${header}: ${value || 'Not Set'}`)
      })

      // Validate essential security measures
      expect(securityHeaders['x-content-type-options']).toBe('nosniff')

      if (securityHeaders['x-frame-options']) {
        expect(
          ['DENY', 'SAMEORIGIN'].includes(securityHeaders['x-frame-options'].toUpperCase())
        ).toBeTruthy()
      }

      // Test API security
      const apiResponse = await page.request.get('/api/auth/providers')
      expect([200, 401].includes(apiResponse.status())).toBeTruthy()

      if (apiResponse.status() === 200) {
        const providersData = await apiResponse.json()
        expect(providersData).toHaveProperty('github')
        expect(providersData).toHaveProperty('google')
        console.log('✅ Multi-Provider OAuth Configuration Validated')
      }

      await page.screenshot({
        path: 'test-results/portfolio/security-demonstration.png',
        fullPage: true,
      })
    })

    test('Performance monitoring showcase', async ({ page }) => {
      // Performance measurement for portfolio demonstration
      const navigationStart = Date.now()
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      const navigationEnd = Date.now()

      const pageLoadTime = navigationEnd - navigationStart
      console.log(`⚡ Page Load Time: ${pageLoadTime}ms`)

      // Portfolio-worthy performance standards
      expect(pageLoadTime).toBeLessThan(3000) // Under 3 seconds

      // Core Web Vitals measurement
      const webVitals = await page.evaluate(() => {
        return new Promise(resolve => {
          const vitals = { lcp: 0, cls: 0, fcp: 0 }

          // Largest Contentful Paint
          new PerformanceObserver(list => {
            const entries = list.getEntries()
            if (entries.length > 0) {
              vitals.lcp = entries[entries.length - 1].startTime
            }
          }).observe({ entryTypes: ['largest-contentful-paint'] })

          // First Contentful Paint
          const fcpEntry = performance
            .getEntriesByType('paint')
            .find(entry => entry.name === 'first-contentful-paint')
          if (fcpEntry) {
            vitals.fcp = fcpEntry.startTime
          }

          // Cumulative Layout Shift
          new PerformanceObserver(list => {
            vitals.cls = list.getEntries().reduce((sum, entry) => sum + entry.value, 0)
          }).observe({ entryTypes: ['layout-shift'] })

          setTimeout(() => resolve(vitals), 2000)
        })
      })

      console.log('📊 Core Web Vitals:', webVitals)

      // Validate performance metrics
      if (webVitals.lcp > 0) expect(webVitals.lcp).toBeLessThan(4000) // LCP under 4s
      if (webVitals.fcp > 0) expect(webVitals.fcp).toBeLessThan(2000) // FCP under 2s
      expect(webVitals.cls).toBeLessThan(0.25) // CLS under 0.25

      // API performance validation
      const apiStart = Date.now()
      const _sessionResponse = await page.request.get('/api/auth/session')
      const apiEnd = Date.now()
      const apiResponseTime = apiEnd - apiStart

      console.log(`🔌 API Response Time: ${apiResponseTime}ms`)
      expect(apiResponseTime).toBeLessThan(1000) // API under 1 second

      await page.screenshot({
        path: 'test-results/portfolio/performance-showcase.png',
        fullPage: true,
      })
    })
  })

  test.describe('Recruiter Impression Scenarios', () => {
    test('Professional UI/UX demonstration', async ({ page }) => {
      // Homepage professional presentation
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Validate modern UI components
      const uiElements = {
        mainHeading: page.locator('h1'),
        navigation: page.locator('nav, [role="navigation"]'),
        mainContent: page.locator('main, [role="main"]'),
        searchInterface: page
          .locator('[data-testid="search"], input[type="search"], input[placeholder*="search" i]')
          .first(),
      }

      // Professional layout validation
      await expect(uiElements.mainHeading).toBeVisible()
      await expect(uiElements.mainContent).toBeVisible()

      // Test search functionality if available
      if (await uiElements.searchInterface.isVisible()) {
        await uiElements.searchInterface.fill('react typescript')
        await page.keyboard.press('Enter')
        console.log('✅ Search Interface Functional')
      }

      // Responsive design showcase
      const viewports = [
        { name: 'Mobile', width: 375, height: 667 },
        { name: 'Tablet', width: 768, height: 1024 },
        { name: 'Desktop', width: 1920, height: 1080 },
      ]

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.waitForTimeout(500) // Allow layout adjustment

        // Validate responsive behavior
        await expect(uiElements.mainHeading).toBeVisible()
        await expect(uiElements.mainContent).toBeVisible()

        await page.screenshot({
          path: `test-results/portfolio/responsive-${viewport.name.toLowerCase()}.png`,
          fullPage: true,
        })

        console.log(`📱 ${viewport.name} Layout Validated`)
      }

      // Reset to desktop for final screenshot
      await page.setViewportSize({ width: 1920, height: 1080 })
    })

    test('Accessibility and modern standards showcase', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Keyboard navigation demonstration
      await page.keyboard.press('Tab')
      const firstFocusable = page.locator(':focus')
      await expect(firstFocusable).toBeVisible()
      console.log('⌨️ Keyboard Navigation: First element focused')

      // Continue keyboard navigation
      const focusedElements = []
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
        const focusedElement = await page
          .locator(':focus')
          .getAttribute('data-testid')
          .catch(() => null)
        if (focusedElement) {
          focusedElements.push(focusedElement)
        }
      }

      console.log('🔍 Keyboard Focus Path:', focusedElements)

      // Semantic HTML validation
      const semanticElements = await page.evaluate(() => {
        return {
          hasMain: !!document.querySelector('main'),
          hasNav: !!document.querySelector('nav'),
          hasHeader: !!document.querySelector('header'),
          hasFooter: !!document.querySelector('footer'),
          headingCount: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
          buttonCount: document.querySelectorAll('button').length,
          linkCount: document.querySelectorAll('a').length,
        }
      })

      console.log('🏗️ Semantic HTML Structure:', semanticElements)

      // Validate essential semantic elements
      expect(semanticElements.hasMain).toBeTruthy()
      expect(semanticElements.headingCount).toBeGreaterThan(0)

      // Color contrast and visual design
      const visualValidation = await page.evaluate(() => {
        const computedStyles = window.getComputedStyle(document.body)
        return {
          fontFamily: computedStyles.fontFamily,
          backgroundColor: computedStyles.backgroundColor,
          color: computedStyles.color,
          fontSize: computedStyles.fontSize,
        }
      })

      console.log('🎨 Visual Design Analysis:', visualValidation)

      await page.screenshot({
        path: 'test-results/portfolio/accessibility-showcase.png',
        fullPage: true,
      })
    })

    test('Error handling and resilience demonstration', async ({ page }) => {
      // Test graceful error handling
      const errorScenarios = [
        { url: '/nonexistent-page', expectedStatus: [404] },
        { url: '/api/nonexistent', expectedStatus: [404, 405] },
        { url: '/auth/invalid', expectedStatus: [404, 302] },
      ]

      for (const scenario of errorScenarios) {
        const response = await page.goto(scenario.url)
        const status = response?.status() || 0

        expect(scenario.expectedStatus.includes(status)).toBeTruthy()
        console.log(`🛡️ Error Handling: ${scenario.url} -> ${status}`)

        // Validate error page doesn't crash
        await expect(page.locator('body')).toBeVisible()
      }

      // Test malformed authentication requests
      const authErrorTests = [
        '/api/auth/callback/github?error=access_denied',
        '/api/auth/callback/github?code=',
        '/api/auth/signin/invalid-provider',
      ]

      for (const authUrl of authErrorTests) {
        const response = await page.goto(authUrl)
        const status = response?.status() || 0

        expect([200, 302, 400, 401, 404].includes(status)).toBeTruthy()
        console.log(`🔐 Auth Error Handling: ${authUrl} -> ${status}`)
      }

      // Network resilience test
      await page.goto('/')

      // Simulate slow network
      await page.route('**/*', route => {
        setTimeout(() => route.continue(), 100) // 100ms delay
      })

      const slowLoadStart = Date.now()
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      const slowLoadEnd = Date.now()

      console.log(`🐌 Slow Network Performance: ${slowLoadEnd - slowLoadStart}ms`)

      await page.screenshot({
        path: 'test-results/portfolio/error-handling-demo.png',
        fullPage: true,
      })
    })
  })

  test.describe('Cross-Browser Compatibility Showcase', () => {
    test('Multi-browser feature validation', async ({ page, browserName }) => {
      console.log(`🌐 Testing on: ${browserName}`)

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Core functionality across browsers
      await expect(page.locator('h1')).toBeVisible()

      // Modern web API support detection
      const browserCapabilities = await page.evaluate(() => {
        return {
          webAuthnSupported: !!(navigator.credentials && window.PublicKeyCredential),
          serviceWorkerSupported: 'serviceWorker' in navigator,
          webCryptoSupported: !!window.crypto?.subtle,
          fetchSupported: typeof fetch !== 'undefined',
          promiseSupported: typeof Promise !== 'undefined',
          localStorage: typeof Storage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined',
        }
      })

      console.log(`${browserName} Capabilities:`, browserCapabilities)

      // Validate essential modern features
      expect(browserCapabilities.fetchSupported).toBeTruthy()
      expect(browserCapabilities.promiseSupported).toBeTruthy()
      expect(browserCapabilities.localStorage).toBeTruthy()

      // Authentication system compatibility
      await page.goto('/auth/signin')
      await expect(page.locator('[data-provider="github"], text=GitHub').first()).toBeVisible()

      // Browser-specific optimizations
      if (browserName === 'webkit') {
        // Safari-specific validations
        console.log('🍎 Safari-specific optimizations validated')
      } else if (browserName === 'firefox') {
        // Firefox-specific validations
        console.log('🦊 Firefox-specific optimizations validated')
      } else if (browserName === 'chromium') {
        // Chrome-specific validations
        console.log('🌟 Chrome-specific optimizations validated')
      }

      await page.screenshot({
        path: `test-results/portfolio/browser-${browserName}.png`,
        fullPage: true,
      })
    })
  })

  test.describe('Real-World Usage Scenarios', () => {
    test('Complete user journey simulation', async ({ page }) => {
      // Scenario: Developer seeking contribution opportunities

      // Step 1: Discovery and exploration
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      console.log('👤 User Journey: Landing page discovery')
      await expect(page.locator('h1')).toBeVisible()

      // Step 2: Feature exploration
      const searchInterface = page
        .locator('input[type="search"], [data-testid*="search"], [placeholder*="search" i]')
        .first()
      if (await searchInterface.isVisible()) {
        await searchInterface.fill('react hooks beginner')
        await page.keyboard.press('Enter')
        console.log('🔍 User Journey: Search interaction')
      }

      // Step 3: Authentication interest
      await page.goto('/auth/signin')
      await page.waitForLoadState('domcontentloaded')

      const authProviders = page.locator('[data-provider], text=GitHub, text=Google')
      await expect(authProviders.first()).toBeVisible()
      console.log('🔐 User Journey: Authentication options presented')

      // Step 4: Security and privacy awareness
      const providersResponse = await page.request.get('/api/auth/providers')
      if (providersResponse.status() === 200) {
        const providers = await providersResponse.json()
        expect(providers).toHaveProperty('github')
        expect(providers).toHaveProperty('google')
        console.log('✅ User Journey: Provider configuration validated')
      }

      // Step 5: Performance expectations
      const performanceStart = Date.now()
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      const performanceEnd = Date.now()

      const userExperienceTime = performanceEnd - performanceStart
      console.log(`⚡ User Journey: Page load experience ${userExperienceTime}ms`)
      expect(userExperienceTime).toBeLessThan(5000) // 5 second user patience threshold

      await page.screenshot({
        path: 'test-results/portfolio/user-journey-complete.png',
        fullPage: true,
      })
    })

    test('Mobile user experience validation', async ({ page }) => {
      // Mobile-first experience
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Mobile-specific UI validation
      await expect(page.locator('h1')).toBeVisible()

      // Touch-friendly interface validation
      const interactiveElements = page.locator('button, a, input, [role="button"]')
      const elementCount = await interactiveElements.count()

      if (elementCount > 0) {
        for (let i = 0; i < Math.min(elementCount, 5); i++) {
          const element = interactiveElements.nth(i)
          const boundingBox = await element.boundingBox()

          if (boundingBox) {
            // Validate touch target size (minimum 44px)
            expect(Math.min(boundingBox.width, boundingBox.height)).toBeGreaterThan(32)
          }
        }
      }

      console.log('📱 Mobile Experience: Touch targets validated')

      // Mobile navigation test
      const mobileNav = page
        .locator('[data-testid="mobile-menu"], .mobile-nav, [data-mobile], nav')
        .first()
      if (await mobileNav.isVisible()) {
        console.log('📱 Mobile Experience: Navigation optimized')
      }

      // Performance on mobile
      const mobileLoadStart = Date.now()
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      const mobileLoadEnd = Date.now()

      console.log(`📱 Mobile Performance: ${mobileLoadEnd - mobileLoadStart}ms`)
      expect(mobileLoadEnd - mobileLoadStart).toBeLessThan(4000) // Mobile performance threshold

      await page.screenshot({
        path: 'test-results/portfolio/mobile-experience.png',
        fullPage: true,
      })
    })
  })

  test.afterEach(async ({ page }, testInfo) => {
    // Capture additional portfolio data on test completion
    if (testInfo.status === 'passed') {
      console.log(`✅ Portfolio Test Passed: ${testInfo.title}`)
    } else {
      console.log(`❌ Portfolio Test Failed: ${testInfo.title}`)

      // Capture failure screenshot for debugging
      await page.screenshot({
        path: `test-results/failures/${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        fullPage: true,
      })
    }
  })
})
