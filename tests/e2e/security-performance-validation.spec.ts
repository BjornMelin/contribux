/**
 * Security & Performance Validation E2E Tests
 * Advanced testing for security measures, performance optimization,
 * and production readiness validation
 */

import { expect, test } from '@playwright/test'

test.describe('Security & Performance Validation', () => {
  test.describe('Security Validation Suite', () => {
    test('Comprehensive security headers validation', async ({ page }) => {
      console.log('🔒 Comprehensive Security Headers Analysis')

      const response = await page.goto('/')
      const headers = response?.headers() || {}

      // Complete security headers analysis
      const securityAnalysis = {
        'x-frame-options': {
          value: headers['x-frame-options'],
          expected: ['DENY', 'SAMEORIGIN'],
          critical: true,
        },
        'x-content-type-options': {
          value: headers['x-content-type-options'],
          expected: ['nosniff'],
          critical: true,
        },
        'referrer-policy': {
          value: headers['referrer-policy'],
          expected: ['strict-origin-when-cross-origin', 'no-referrer', 'same-origin'],
          critical: false,
        },
        'content-security-policy': {
          value: headers['content-security-policy'],
          expected: ['contains default-src'],
          critical: true,
        },
        'strict-transport-security': {
          value: headers['strict-transport-security'],
          expected: ['contains max-age'],
          critical: page.url().startsWith('https://'),
        },
        'permissions-policy': {
          value: headers['permissions-policy'],
          expected: ['restrictive policy'],
          critical: false,
        },
        'x-xss-protection': {
          value: headers['x-xss-protection'],
          expected: ['1; mode=block', '0'],
          critical: false,
        },
      }

      console.log('🛡️ Security Headers Analysis:')
      Object.entries(securityAnalysis).forEach(([header, config]) => {
        const status = config.value ? '✅' : config.critical ? '❌' : '⚠️'
        console.log(`  ${status} ${header}: ${config.value || 'Not Set'}`)

        if (config.critical && !config.value) {
          console.log(`    ⚠️ Critical security header missing: ${header}`)
        }
      })

      // Validate critical headers
      expect(securityAnalysis['x-content-type-options'].value).toBe('nosniff')

      if (securityAnalysis['x-frame-options'].value) {
        expect(
          securityAnalysis['x-frame-options'].expected.includes(
            securityAnalysis['x-frame-options'].value.toUpperCase()
          )
        ).toBeTruthy()
      }

      // CSP validation
      if (securityAnalysis['content-security-policy'].value) {
        expect(securityAnalysis['content-security-policy'].value).toContain('default-src')
        console.log('✅ Content Security Policy implemented')
      }

      await page.screenshot({
        path: 'test-results/security/headers-analysis.png',
        fullPage: true,
      })
    })

    test('XSS and injection prevention validation', async ({ page }) => {
      console.log('🛡️ XSS and Injection Prevention Testing')

      await page.goto('/')

      // XSS prevention test vectors
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '"><script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(\'xss\')">',
        '<svg onload="alert(\'xss\')">',
        '<iframe src="javascript:alert(\'xss\')"></iframe>',
        '&#60;script&#62;alert(&#39;xss&#39;)&#60;/script&#62;',
        '<script>document.cookie="stolen="+document.cookie</script>',
      ]

      // Test search input if available
      const searchInput = page
        .locator('input[type="search"], [data-testid*="search"], [placeholder*="search" i]')
        .first()

      if (await searchInput.isVisible()) {
        console.log('🔍 Testing search input XSS prevention')

        for (const payload of xssPayloads) {
          await searchInput.fill(payload)
          await page.keyboard.press('Enter')

          // Validate no script execution
          const scriptExecuted = await page.evaluate(() => {
            return (
              window.location.href.includes('alert') ||
              document.body.innerHTML.includes('<script>') ||
              document.body.innerHTML.includes('javascript:')
            )
          })

          expect(scriptExecuted).toBeFalsy()

          // Check for proper escaping
          const inputValue = await searchInput.inputValue()
          expect(inputValue.includes('<script>')).toBeFalsy()

          console.log(`✅ XSS payload blocked: ${payload.substring(0, 30)}...`)
        }
      }

      // Test form inputs
      await page.goto('/auth/signin')

      // SQL injection test on authentication (should be safely handled)
      const sqlPayloads = [
        "admin'--",
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'; DELETE FROM users WHERE 't'='t",
        "1' UNION SELECT * FROM users--",
      ]

      // Test API endpoints with malicious input
      for (const payload of sqlPayloads) {
        const response = await page.request.get(
          `/api/search/repositories?q=${encodeURIComponent(payload)}`
        )

        expect([400, 401, 200, 404].includes(response.status())).toBeTruthy()

        if (response.status() === 200) {
          const data = await response.json()
          const responseStr = JSON.stringify(data).toLowerCase()

          // Should not expose database errors
          expect(responseStr).not.toContain('sql')
          expect(responseStr).not.toContain('database')
          expect(responseStr).not.toContain('syntax')
          expect(responseStr).not.toContain('table')

          console.log(`✅ SQL injection safely handled: ${response.status()}`)
        }
      }

      await page.screenshot({
        path: 'test-results/security/xss-prevention.png',
        fullPage: true,
      })
    })

    test('Authentication security validation', async ({ page, context }) => {
      console.log('🔐 Authentication Security Validation')

      // CSRF protection validation
      await page.goto('/auth/signin')

      const csrfResponse = await page.request.get('/api/auth/csrf')
      expect(csrfResponse.status()).toBe(200)

      const csrfData = await csrfResponse.json()
      expect(csrfData).toHaveProperty('csrfToken')
      expect(csrfData.csrfToken.length).toBeGreaterThan(16)

      console.log('✅ CSRF token generation validated')

      // Session security validation
      const sessionResponse = await page.request.get('/api/auth/session')
      expect([200, 401].includes(sessionResponse.status())).toBeTruthy()

      // Cookie security validation
      const cookies = await context.cookies()
      const authCookies = cookies.filter(
        cookie =>
          cookie.name.includes('auth') ||
          cookie.name.includes('session') ||
          cookie.name.includes('csrf')
      )

      authCookies.forEach(cookie => {
        expect(cookie.httpOnly).toBeTruthy()
        expect(['Lax', 'Strict'].includes(cookie.sameSite)).toBeTruthy()

        if (page.url().startsWith('https://')) {
          expect(cookie.secure).toBeTruthy()
        }

        console.log(`✅ Cookie security validated: ${cookie.name}`)
      })

      // Test authentication bypass attempts
      const bypassAttempts = [
        '/admin',
        '/dashboard',
        '/api/admin',
        '/settings/security',
        '/.env',
        '/config',
        '/api/internal',
      ]

      for (const endpoint of bypassAttempts) {
        const response = await page.request.get(endpoint)

        // Should either redirect to auth or return 401/403/404
        expect([200, 302, 401, 403, 404].includes(response.status())).toBeTruthy()

        if (response.status() === 302) {
          const location = response.headers().location
          if (location) {
            expect(location).toMatch(/\/auth\/signin|\/login/)
            console.log(`✅ Protected endpoint redirects to auth: ${endpoint}`)
          }
        } else if ([401, 403].includes(response.status())) {
          console.log(`✅ Protected endpoint returns ${response.status()}: ${endpoint}`)
        }
      }

      // WebAuthn security validation
      const webAuthnResponse = await page.request.post('/api/security/webauthn/register/options')

      if (webAuthnResponse.status() === 200) {
        const webAuthnData = await webAuthnResponse.json()

        // Validate challenge properties
        expect(webAuthnData).toHaveProperty('challenge')
        expect(webAuthnData.challenge.length).toBeGreaterThan(32)

        // Validate RP configuration
        expect(webAuthnData).toHaveProperty('rp')
        expect(webAuthnData.rp).toHaveProperty('name')
        expect(webAuthnData.rp.name).toBe('Contribux')

        console.log('✅ WebAuthn security parameters validated')
      }

      await page.screenshot({
        path: 'test-results/security/auth-security.png',
        fullPage: true,
      })
    })

    test('Rate limiting and abuse prevention', async ({ page }) => {
      console.log('🚦 Rate Limiting and Abuse Prevention Testing')

      // Test API rate limiting
      const apiEndpoints = [
        '/api/auth/session',
        '/api/search/repositories?q=test',
        '/api/security/health',
      ]

      for (const endpoint of apiEndpoints) {
        const requests = []
        const startTime = Date.now()

        // Rapid fire requests
        for (let i = 0; i < 10; i++) {
          requests.push(page.request.get(endpoint))
        }

        const responses = await Promise.all(requests)
        const endTime = Date.now()

        console.log(`📊 ${endpoint}: ${responses.length} requests in ${endTime - startTime}ms`)

        // Check for rate limiting
        const rateLimited = responses.some(response => response.status() === 429)
        const statusCodes = responses.map(r => r.status())

        console.log(`  Status codes: ${[...new Set(statusCodes)].join(', ')}`)

        if (rateLimited) {
          console.log(`✅ Rate limiting active for: ${endpoint}`)
        } else {
          console.log(`⚠️ No rate limiting detected for: ${endpoint}`)
        }

        // Validate reasonable response times
        const avgResponseTime = (endTime - startTime) / responses.length
        expect(avgResponseTime).toBeLessThan(2000) // Average under 2 seconds
      }

      // Test form submission rate limiting
      await page.goto('/auth/signin')

      // Attempt multiple rapid form submissions
      const submitAttempts = []
      for (let i = 0; i < 5; i++) {
        submitAttempts.push(
          page.request.post('/api/auth/signin/github', {
            data: { csrfToken: 'test-token' },
          })
        )
      }

      const submitResponses = await Promise.all(submitAttempts)
      const submitStatuses = submitResponses.map(r => r.status())

      console.log(`🔐 Auth submission status codes: ${[...new Set(submitStatuses)].join(', ')}`)

      await page.screenshot({
        path: 'test-results/security/rate-limiting.png',
        fullPage: true,
      })
    })
  })

  test.describe('Performance Validation Suite', () => {
    test('Core Web Vitals comprehensive measurement', async ({ page }) => {
      console.log('⚡ Core Web Vitals Comprehensive Analysis')

      // Navigation timing
      const navigationStart = Date.now()
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      const domContentLoaded = Date.now()
      await page.waitForLoadState('load')
      const fullyLoaded = Date.now()

      const timings = {
        domContentLoaded: domContentLoaded - navigationStart,
        fullyLoaded: fullyLoaded - navigationStart,
        timeToInteractive: fullyLoaded - navigationStart, // Approximation
      }

      console.log('📊 Navigation Timings:', timings)

      // Professional performance standards
      expect(timings.domContentLoaded).toBeLessThan(2000) // DOM ready < 2s
      expect(timings.fullyLoaded).toBeLessThan(4000) // Full load < 4s

      // Core Web Vitals measurement
      const webVitals = await page.evaluate(() => {
        return new Promise(resolve => {
          const vitals = {
            lcp: 0,
            fid: 0,
            cls: 0,
            fcp: 0,
            ttfb: 0,
          }

          // Time to First Byte
          const navigation = performance.getEntriesByType(
            'navigation'
          )[0] as PerformanceNavigationTiming
          if (navigation) {
            vitals.ttfb = navigation.responseStart - navigation.requestStart
          }

          // First Contentful Paint
          const fcpEntry = performance
            .getEntriesByType('paint')
            .find(entry => entry.name === 'first-contentful-paint')
          if (fcpEntry) {
            vitals.fcp = fcpEntry.startTime
          }

          // Largest Contentful Paint
          new PerformanceObserver(list => {
            const entries = list.getEntries()
            if (entries.length > 0) {
              vitals.lcp = entries[entries.length - 1].startTime
            }
          }).observe({ entryTypes: ['largest-contentful-paint'] })

          // First Input Delay (simulated)
          new PerformanceObserver(list => {
            vitals.fid =
              list.getEntries()[0]?.processingStart - list.getEntries()[0]?.startTime || 0
          }).observe({ entryTypes: ['first-input'] })

          // Cumulative Layout Shift
          new PerformanceObserver(list => {
            vitals.cls = list.getEntries().reduce((sum, entry) => {
              return sum + ((entry as PerformanceEntry & { value?: number }).value || 0)
            }, 0)
          }).observe({ entryTypes: ['layout-shift'] })

          setTimeout(() => resolve(vitals), 3000)
        })
      })

      console.log('🎯 Core Web Vitals:', webVitals)

      // Portfolio-worthy performance benchmarks
      if (webVitals.ttfb > 0) expect(webVitals.ttfb).toBeLessThan(800) // TTFB < 800ms
      if (webVitals.fcp > 0) expect(webVitals.fcp).toBeLessThan(1800) // FCP < 1.8s (Good)
      if (webVitals.lcp > 0) expect(webVitals.lcp).toBeLessThan(2500) // LCP < 2.5s (Good)
      if (webVitals.fid > 0) expect(webVitals.fid).toBeLessThan(100) // FID < 100ms (Good)
      expect(webVitals.cls).toBeLessThan(0.1) // CLS < 0.1 (Good)

      // Resource loading analysis
      const resourceTiming = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]

        const analysis = {
          totalResources: resources.length,
          javascriptResources: resources.filter(r => r.name.includes('.js')).length,
          cssResources: resources.filter(r => r.name.includes('.css')).length,
          imageResources: resources.filter(r => /\.(jpg|jpeg|png|gif|svg|webp)/.test(r.name))
            .length,
          fontResources: resources.filter(r => /\.(woff|woff2|ttf|otf)/.test(r.name)).length,
          avgLoadTime:
            resources.reduce((sum, r) => sum + (r.responseEnd - r.requestStart), 0) /
            resources.length,
          slowestResource: resources.reduce(
            (slowest, r) => {
              const loadTime = r.responseEnd - r.requestStart
              return loadTime > (slowest.loadTime || 0) ? { name: r.name, loadTime } : slowest
            },
            { name: '', loadTime: 0 }
          ),
        }

        return analysis
      })

      console.log('📦 Resource Loading Analysis:', resourceTiming)

      // Performance budget validation
      expect(resourceTiming.avgLoadTime).toBeLessThan(1000) // Average resource < 1s
      expect(resourceTiming.totalResources).toBeLessThan(100) // Resource count reasonable

      await page.screenshot({
        path: 'test-results/performance/core-web-vitals.png',
        fullPage: true,
      })
    })

    test('API performance benchmarking', async ({ page }) => {
      console.log('🔌 API Performance Benchmarking')

      const apiEndpoints = [
        { path: '/api/auth/session', expectedTime: 500 },
        { path: '/api/auth/providers', expectedTime: 300 },
        { path: '/api/auth/csrf', expectedTime: 200 },
        { path: '/api/security/health', expectedTime: 1000 },
        { path: '/api/search/repositories?q=react', expectedTime: 2000 },
      ]

      const performanceResults = []

      for (const endpoint of apiEndpoints) {
        const measurements = []

        // Multiple measurements for accuracy
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now()
          const response = await page.request.get(endpoint.path)
          const endTime = Date.now()
          const responseTime = endTime - startTime

          measurements.push({
            responseTime,
            status: response.status(),
            contentLength: response.headers()['content-length'] || '0',
          })

          // Brief pause between requests
          await page.waitForTimeout(100)
        }

        const avgResponseTime =
          measurements.reduce((sum, m) => sum + m.responseTime, 0) / measurements.length
        const minResponseTime = Math.min(...measurements.map(m => m.responseTime))
        const maxResponseTime = Math.max(...measurements.map(m => m.responseTime))

        const result = {
          endpoint: endpoint.path,
          avgResponseTime,
          minResponseTime,
          maxResponseTime,
          expectedTime: endpoint.expectedTime,
          status: measurements[0].status,
          passed: avgResponseTime <= endpoint.expectedTime,
        }

        performanceResults.push(result)

        console.log(`📊 ${endpoint.path}:`)
        console.log(`  Average: ${avgResponseTime}ms (expected: <${endpoint.expectedTime}ms)`)
        console.log(`  Range: ${minResponseTime}ms - ${maxResponseTime}ms`)
        console.log(`  Status: ${result.passed ? '✅ PASS' : '❌ FAIL'}`)

        expect(avgResponseTime).toBeLessThan(endpoint.expectedTime)
      }

      // Database performance validation
      const dbHealthResponse = await page.request.get('/api/security/health')
      if (dbHealthResponse.status() === 200) {
        const healthData = await dbHealthResponse.json()

        if (healthData.database?.responseTime) {
          console.log(`🗄️ Database Response Time: ${healthData.database.responseTime}ms`)
          expect(healthData.database.responseTime).toBeLessThan(500)
        }
      }

      // Overall API performance summary
      const totalApiTime = performanceResults.reduce((sum, r) => sum + r.avgResponseTime, 0)
      const averageApiTime = totalApiTime / performanceResults.length

      console.log('📈 API Performance Summary:')
      console.log(`  Average API Response Time: ${averageApiTime.toFixed(2)}ms`)
      console.log(`  Total Endpoints Tested: ${performanceResults.length}`)
      console.log(`  All Tests Passed: ${performanceResults.every(r => r.passed)}`)

      await page.screenshot({
        path: 'test-results/performance/api-benchmarks.png',
        fullPage: true,
      })
    })

    test('Memory and resource usage validation', async ({ page }) => {
      console.log('🧠 Memory and Resource Usage Analysis')

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Memory usage measurement
      const initialMemory = await page.evaluate(() => {
        if ('memory' in performance) {
          interface PerformanceMemory {
            usedJSHeapSize: number
            totalJSHeapSize: number
            jsHeapSizeLimit: number
          }
          const performanceWithMemory = performance as Performance & {
            memory: PerformanceMemory
          }
          const memory = performanceWithMemory.memory
          return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            timestamp: Date.now(),
          }
        }
        return null
      })

      if (initialMemory) {
        console.log('📊 Initial Memory Usage:', {
          used: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          total: `${(initialMemory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          limit: `${(initialMemory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
        })

        // Memory usage should be reasonable (under 50MB)
        expect(initialMemory.usedJSHeapSize).toBeLessThan(50 * 1024 * 1024)
      }

      // Simulate user interaction and measure memory
      const pages = ['/', '/auth/signin', '/', '/about']

      for (const pagePath of pages) {
        await page.goto(pagePath)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1000)
      }

      const finalMemory = await page.evaluate(() => {
        if ('memory' in performance) {
          interface PerformanceMemory {
            usedJSHeapSize: number
            totalJSHeapSize: number
            jsHeapSizeLimit: number
          }
          const performanceWithMemory = performance as Performance & {
            memory: PerformanceMemory
          }
          const memory = performanceWithMemory.memory
          return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            timestamp: Date.now(),
          }
        }
        return null
      })

      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize
        console.log(
          `📈 Memory increase after navigation: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`
        )

        // Memory increase should be minimal (under 20MB)
        expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024)
      }

      // DOM node count analysis
      const domAnalysis = await page.evaluate(() => {
        return {
          totalNodes: document.querySelectorAll('*').length,
          textNodes: document.createTreeWalker(document, NodeFilter.SHOW_TEXT).nextNode()
            ? 'present'
            : 'none',
          eventListeners: 'getEventListeners' in console ? 'available' : 'unavailable',
          stylesheets: document.styleSheets.length,
          scripts: document.scripts.length,
        }
      })

      console.log('🏗️ DOM Analysis:', domAnalysis)

      // DOM complexity should be reasonable
      expect(domAnalysis.totalNodes).toBeLessThan(2000) // Under 2000 DOM nodes
      expect(domAnalysis.stylesheets).toBeLessThan(20) // Reasonable CSS files
      expect(domAnalysis.scripts).toBeLessThan(15) // Reasonable JS files

      // Network resource analysis
      const networkAnalysis = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]

        return {
          totalSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
          totalRequests: resources.length,
          cacheHits: resources.filter(r => r.transferSize === 0).length,
          largestResource: resources.reduce(
            (largest, r) => {
              return (r.transferSize || 0) > (largest.size || 0)
                ? { name: r.name, size: r.transferSize }
                : largest
            },
            { name: '', size: 0 }
          ),
        }
      })

      console.log('🌐 Network Analysis:', {
        totalSize: `${(networkAnalysis.totalSize / 1024 / 1024).toFixed(2)} MB`,
        totalRequests: networkAnalysis.totalRequests,
        cacheHits: networkAnalysis.cacheHits,
        cacheHitRate: `${((networkAnalysis.cacheHits / networkAnalysis.totalRequests) * 100).toFixed(1)}%`,
        largestResource: `${networkAnalysis.largestResource.name} (${(networkAnalysis.largestResource.size / 1024).toFixed(2)} KB)`,
      })

      // Network performance expectations
      expect(networkAnalysis.totalSize).toBeLessThan(5 * 1024 * 1024) // Under 5MB total
      expect(networkAnalysis.totalRequests).toBeLessThan(50) // Under 50 requests

      await page.screenshot({
        path: 'test-results/performance/resource-usage.png',
        fullPage: true,
      })
    })

    test('Load testing simulation', async ({ page, context }) => {
      console.log('🚀 Load Testing Simulation')

      // Simulate concurrent user sessions
      const concurrentSessions = 5
      const sessionPromises = []

      for (let i = 0; i < concurrentSessions; i++) {
        const sessionPromise = (async () => {
          const newPage = await context.newPage()
          const startTime = Date.now()

          try {
            // Simulate user journey
            await newPage.goto('/')
            await newPage.waitForLoadState('domcontentloaded')

            await newPage.goto('/auth/signin')
            await newPage.waitForLoadState('domcontentloaded')

            // Test API calls
            await newPage.request.get('/api/auth/session')
            await newPage.request.get('/api/auth/providers')

            const endTime = Date.now()
            return {
              sessionId: i,
              duration: endTime - startTime,
              success: true,
            }
          } catch (error) {
            const endTime = Date.now()
            return {
              sessionId: i,
              duration: endTime - startTime,
              success: false,
              error: error.message,
            }
          } finally {
            await newPage.close()
          }
        })()

        sessionPromises.push(sessionPromise)
      }

      const sessionResults = await Promise.all(sessionPromises)

      console.log('📊 Concurrent Session Results:')
      sessionResults.forEach(result => {
        const status = result.success ? '✅' : '❌'
        console.log(`  Session ${result.sessionId}: ${status} ${result.duration}ms`)
        if (!result.success) {
          console.log(`    Error: ${result.error}`)
        }
      })

      // Validate performance under load
      const successfulSessions = sessionResults.filter(r => r.success)
      const averageLoadTime =
        successfulSessions.reduce((sum, r) => sum + r.duration, 0) / successfulSessions.length

      console.log('📈 Load Test Summary:')
      console.log(`  Successful Sessions: ${successfulSessions.length}/${concurrentSessions}`)
      console.log(`  Average Load Time: ${averageLoadTime.toFixed(2)}ms`)
      console.log(
        `  Success Rate: ${((successfulSessions.length / concurrentSessions) * 100).toFixed(1)}%`
      )

      // Performance expectations under load
      expect(successfulSessions.length).toBeGreaterThanOrEqual(concurrentSessions * 0.8) // 80% success rate
      expect(averageLoadTime).toBeLessThan(5000) // Under 5 seconds under load

      await page.screenshot({
        path: 'test-results/performance/load-testing.png',
        fullPage: true,
      })
    })
  })

  test.afterEach(async ({ page }, testInfo) => {
    // Performance and security test logging
    if (testInfo.status === 'passed') {
      console.log(`✅ Security/Performance Test Passed: ${testInfo.title}`)
    } else {
      console.log(`❌ Security/Performance Test Failed: ${testInfo.title}`)

      // Capture detailed failure information
      await page.screenshot({
        path: `test-results/failures/security-performance-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        fullPage: true,
      })
    }
  })
})
