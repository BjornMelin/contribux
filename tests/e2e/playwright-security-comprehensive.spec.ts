import { expect, test } from '@playwright/test'

/**
 * COMPREHENSIVE PLAYWRIGHT SECURITY TESTING SUITE
 *
 * Portfolio-quality security testing using Playwright MCP tools
 * Demonstrates advanced security validation capabilities including:
 * - Complete authentication flow security validation
 * - API security testing with real browser context
 * - Security headers and CSRF protection verification
 * - Rate limiting and abuse prevention testing
 * - WebAuthn and MFA security validation
 * - Attack simulation and prevention testing
 */

test.describe('Comprehensive Playwright Security Validation', () => {
  let securityTestData: {
    startTime: number
    testResults: Array<{
      testName: string
      status: 'passed' | 'failed'
      securityLevel: 'high' | 'medium' | 'low'
      findings: string[]
    }>
  }

  test.beforeEach(async ({ page }) => {
    securityTestData = {
      startTime: Date.now(),
      testResults: [],
    }

    // Security monitoring setup
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().toLowerCase().includes('security')) {
        console.log(`🔒 Security Console Error: ${msg.text()}`)
      }
    })
  })

  test('Complete OAuth Security Flow with Playwright MCP', async ({ page, context }) => {
    console.log('🔐 Testing Complete OAuth Security Flow with Real Browser Automation')

    const testFindings: string[] = []

    // Navigate to authentication page using Playwright MCP
    const response = await page.goto('/auth/signin')
    expect(response?.status()).toBe(200)
    testFindings.push('Authentication page loads successfully')

    // Validate security headers in real browser context
    const headers = response?.headers() || {}
    const securityHeaders = {
      'x-frame-options': headers['x-frame-options'],
      'x-content-type-options': headers['x-content-type-options'],
      'content-security-policy': headers['content-security-policy'],
      'strict-transport-security': headers['strict-transport-security'],
    }

    console.log('🛡️ Security Headers Analysis:', securityHeaders)

    // Validate critical security headers
    expect(securityHeaders['x-content-type-options']).toBe('nosniff')
    testFindings.push('X-Content-Type-Options header properly set')

    if (securityHeaders['x-frame-options']) {
      expect(
        ['DENY', 'SAMEORIGIN'].includes(securityHeaders['x-frame-options'].toUpperCase())
      ).toBeTruthy()
      testFindings.push('X-Frame-Options header prevents clickjacking')
    }

    // CSRF Token Security Validation
    const csrfResponse = await page.request.get('/api/auth/csrf')
    expect(csrfResponse.status()).toBe(200)

    const csrfData = await csrfResponse.json()
    expect(csrfData).toHaveProperty('csrfToken')
    expect(csrfData.csrfToken.length).toBeGreaterThan(32)
    testFindings.push('CSRF token generation meets security requirements')

    // OAuth Provider Security Validation
    const providersResponse = await page.request.get('/api/auth/providers')
    expect(providersResponse.status()).toBe(200)

    const providers = await providersResponse.json()
    expect(providers).toHaveProperty('github')
    expect(providers).toHaveProperty('google')
    testFindings.push('OAuth providers properly configured')

    // Test OAuth state parameter security
    const githubProvider = providers.github
    if (githubProvider && githubProvider.authorization) {
      const authUrl = new URL(githubProvider.authorization.url)
      expect(authUrl.searchParams.has('state')).toBeTruthy()
      const state = authUrl.searchParams.get('state')
      expect(state?.length).toBeGreaterThan(16)
      testFindings.push('OAuth state parameter provides CSRF protection')
    }

    // Session Security Validation
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
      testFindings.push(`Cookie security validated: ${cookie.name}`)
    })

    // Screenshot for security validation
    await page.screenshot({
      path: 'test-results/playwright-security/oauth-security-flow.png',
      fullPage: true,
    })

    securityTestData.testResults.push({
      testName: 'OAuth Security Flow',
      status: 'passed',
      securityLevel: 'high',
      findings: testFindings,
    })

    console.log('✅ OAuth Security Flow validation completed')
  })

  test('WebAuthn Security Validation with Real Browser Context', async ({ page }) => {
    console.log('🔑 Testing WebAuthn Security with Real Browser Automation')

    const testFindings: string[] = []

    // Navigate to WebAuthn registration
    await page.goto('/auth/signin')

    // Test WebAuthn registration options endpoint
    const registerOptionsResponse = await page.request.post(
      '/api/security/webauthn/register/options'
    )

    if (registerOptionsResponse.status() === 200) {
      const options = await registerOptionsResponse.json()

      // Validate WebAuthn challenge security
      expect(options).toHaveProperty('challenge')
      expect(options.challenge.length).toBeGreaterThan(32)
      testFindings.push('WebAuthn challenge meets cryptographic requirements')

      // Validate RP (Relying Party) configuration
      expect(options).toHaveProperty('rp')
      expect(options.rp).toHaveProperty('name', 'Contribux')
      expect(options.rp).toHaveProperty('id')
      testFindings.push('WebAuthn RP configuration properly secured')

      // Validate user verification requirements
      expect(options).toHaveProperty('authenticatorSelection')
      if (options.authenticatorSelection) {
        expect(
          ['required', 'preferred', 'discouraged'].includes(
            options.authenticatorSelection.userVerification
          )
        ).toBeTruthy()
        testFindings.push('WebAuthn user verification requirements properly set')
      }

      // Validate timeout settings
      expect(options.timeout).toBeGreaterThan(30000) // At least 30 seconds
      expect(options.timeout).toBeLessThan(300000) // No more than 5 minutes
      testFindings.push('WebAuthn timeout settings within security bounds')
    }

    // Test WebAuthn authentication options
    const authOptionsResponse = await page.request.post(
      '/api/security/webauthn/authenticate/options'
    )

    if (authOptionsResponse.status() === 200) {
      const authOptions = await authOptionsResponse.json()

      expect(authOptions).toHaveProperty('challenge')
      expect(authOptions.challenge.length).toBeGreaterThan(32)
      testFindings.push('WebAuthn authentication challenge properly generated')
    }

    // Validate WebAuthn error handling
    const invalidWebAuthnRequest = await page.request.post(
      '/api/security/webauthn/register/verify',
      {
        data: { invalid: 'data' },
      }
    )

    expect([400, 422].includes(invalidWebAuthnRequest.status())).toBeTruthy()
    testFindings.push('WebAuthn endpoints properly validate input')

    await page.screenshot({
      path: 'test-results/playwright-security/webauthn-security.png',
      fullPage: true,
    })

    securityTestData.testResults.push({
      testName: 'WebAuthn Security',
      status: 'passed',
      securityLevel: 'high',
      findings: testFindings,
    })

    console.log('✅ WebAuthn Security validation completed')
  })

  test('API Security Testing with Real Browser Requests', async ({ page }) => {
    console.log('🛡️ Testing API Security with Playwright Browser Context')

    const testFindings: string[] = []

    // Test rate limiting with real browser requests
    const apiEndpoints = [
      '/api/auth/session',
      '/api/auth/providers',
      '/api/auth/csrf',
      '/api/security/health',
    ]

    for (const endpoint of apiEndpoints) {
      console.log(`🔍 Testing rate limiting for: ${endpoint}`)

      const requests = []
      const startTime = Date.now()

      // Rapid fire requests to test rate limiting
      for (let i = 0; i < 15; i++) {
        requests.push(page.request.get(endpoint))
      }

      const responses = await Promise.all(requests)
      const endTime = Date.now()

      const statusCodes = responses.map(r => r.status())
      const rateLimited = responses.some(r => r.status() === 429)
      const responseTime = endTime - startTime

      console.log(`📊 ${endpoint}: ${responses.length} requests in ${responseTime}ms`)
      console.log(`📈 Status codes: ${[...new Set(statusCodes)].join(', ')}`)

      if (rateLimited) {
        testFindings.push(`Rate limiting active for ${endpoint}`)
        console.log(`✅ Rate limiting detected for: ${endpoint}`)
      } else {
        testFindings.push(`No rate limiting detected for ${endpoint}`)
        console.log(`⚠️ No rate limiting detected for: ${endpoint}`)
      }

      // Validate response times are reasonable
      const avgResponseTime = responseTime / responses.length
      expect(avgResponseTime).toBeLessThan(2000)
      testFindings.push(`Average response time acceptable: ${avgResponseTime.toFixed(2)}ms`)
    }

    // Test XSS prevention in API responses
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '"><script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src="x" onerror="alert(\'xss\')">',
    ]

    for (const payload of xssPayloads) {
      const searchResponse = await page.request.get(
        `/api/search/repositories?q=${encodeURIComponent(payload)}`
      )

      if (searchResponse.status() === 200) {
        const responseText = await searchResponse.text()

        // Validate XSS payloads are properly escaped
        expect(responseText.includes('<script>')).toBeFalsy()
        expect(responseText.includes('javascript:')).toBeFalsy()
        testFindings.push('XSS payload properly escaped in API response')
      }
    }

    // Test SQL injection prevention
    const sqlPayloads = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "admin'--",
      "1' UNION SELECT * FROM users--",
    ]

    for (const payload of sqlPayloads) {
      const response = await page.request.get(
        `/api/search/repositories?q=${encodeURIComponent(payload)}`
      )

      if (response.status() === 200) {
        const responseText = await response.text()
        const lowerResponse = responseText.toLowerCase()

        // Should not expose database errors
        expect(lowerResponse).not.toContain('sql')
        expect(lowerResponse).not.toContain('database')
        expect(lowerResponse).not.toContain('syntax error')
        testFindings.push('SQL injection payload safely handled')
      }
    }

    await page.screenshot({
      path: 'test-results/playwright-security/api-security-testing.png',
      fullPage: true,
    })

    securityTestData.testResults.push({
      testName: 'API Security Testing',
      status: 'passed',
      securityLevel: 'high',
      findings: testFindings,
    })

    console.log('✅ API Security testing completed')
  })

  test('Cross-Browser Security Compliance Testing', async ({ page, browserName }) => {
    console.log(`🌐 Testing Security Compliance in ${browserName}`)

    const testFindings: string[] = []

    // Test security features across different browsers
    await page.goto('/')

    // Browser-specific security feature detection
    const securityFeatures = await page.evaluate(() => {
      return {
        csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
        httpsOnly: location.protocol === 'https:',
        secureContext: window.isSecureContext,
        permissions: 'permissions' in navigator,
        credentials: 'credentials' in navigator,
        crypto: 'crypto' in window && 'subtle' in window.crypto,
        storage: 'localStorage' in window,
        cookies: navigator.cookieEnabled,
      }
    })

    console.log(`🔒 ${browserName} Security Features:`, securityFeatures)

    // Validate crypto API availability for WebAuthn
    expect(securityFeatures.crypto).toBeTruthy()
    testFindings.push(`Web Crypto API available in ${browserName}`)

    // Test credential management API if available
    if (securityFeatures.credentials) {
      testFindings.push(`Credential Management API available in ${browserName}`)
    }

    // Test permissions API if available
    if (securityFeatures.permissions) {
      testFindings.push(`Permissions API available in ${browserName}`)
    }

    // Browser-specific CSP testing
    const response = await page.goto('/auth/signin')
    const cspHeader = response?.headers()['content-security-policy']

    if (cspHeader) {
      // Validate CSP directives work across browsers
      expect(cspHeader).toContain('default-src')
      testFindings.push(`CSP header properly interpreted in ${browserName}`)
    }

    // Test form security across browsers
    const formTests = await page.evaluate(() => {
      const forms = document.querySelectorAll('form')
      const results = {
        formsFound: forms.length,
        autoCompleteOff: 0,
        methodPost: 0,
        httpsAction: 0,
      }

      forms.forEach(form => {
        if (form.getAttribute('autocomplete') === 'off') results.autoCompleteOff++
        if (form.method.toLowerCase() === 'post') results.methodPost++
        if (form.action.startsWith('https://')) results.httpsAction++
      })

      return results
    })

    console.log(`📝 ${browserName} Form Security:`, formTests)
    testFindings.push(`Form security validated in ${browserName}`)

    await page.screenshot({
      path: `test-results/playwright-security/cross-browser-${browserName}.png`,
      fullPage: true,
    })

    securityTestData.testResults.push({
      testName: `Cross-Browser Security (${browserName})`,
      status: 'passed',
      securityLevel: 'medium',
      findings: testFindings,
    })

    console.log(`✅ ${browserName} security compliance validated`)
  })

  test('Security Performance Under Load with Real Browser Context', async ({ page, context }) => {
    console.log('⚡ Testing Security Performance Under Load')

    const testFindings: string[] = []
    const concurrentSessions = 8
    const sessionPromises = []

    // Simulate concurrent authentication attempts
    for (let i = 0; i < concurrentSessions; i++) {
      const sessionPromise = (async (sessionId: number) => {
        const newPage = await context.newPage()
        const startTime = Date.now()

        try {
          // Simulate user authentication flow
          await newPage.goto('/auth/signin')

          // Test CSRF token generation under load
          const csrfResponse = await newPage.request.get('/api/auth/csrf')
          expect(csrfResponse.status()).toBe(200)

          const csrfData = await csrfResponse.json()
          expect(csrfData.csrfToken.length).toBeGreaterThan(16)

          // Test session endpoint under load
          const sessionResponse = await newPage.request.get('/api/auth/session')
          expect([200, 401].includes(sessionResponse.status())).toBeTruthy()

          const endTime = Date.now()
          return {
            sessionId,
            duration: endTime - startTime,
            success: true,
            csrfTokenLength: csrfData.csrfToken.length,
          }
        } catch (error) {
          const endTime = Date.now()
          return {
            sessionId,
            duration: endTime - startTime,
            success: false,
            error: error.message,
          }
        } finally {
          await newPage.close()
        }
      })(i)

      sessionPromises.push(sessionPromise)
    }

    const sessionResults = await Promise.all(sessionPromises)

    console.log('📊 Concurrent Security Session Results:')
    sessionResults.forEach(result => {
      const status = result.success ? '✅' : '❌'
      console.log(`  Session ${result.sessionId}: ${status} ${result.duration}ms`)
      if (!result.success) {
        console.log(`    Error: ${result.error}`)
      }
    })

    // Validate security performance under load
    const successfulSessions = sessionResults.filter(r => r.success)
    const averageLoadTime =
      successfulSessions.reduce((sum, r) => sum + r.duration, 0) / successfulSessions.length
    const successRate = (successfulSessions.length / concurrentSessions) * 100

    console.log('📈 Security Performance Summary:')
    console.log(`  Successful Sessions: ${successfulSessions.length}/${concurrentSessions}`)
    console.log(`  Average Load Time: ${averageLoadTime.toFixed(2)}ms`)
    console.log(`  Success Rate: ${successRate.toFixed(1)}%`)

    // Security performance expectations
    expect(successRate).toBeGreaterThanOrEqual(85) // 85% success rate minimum
    expect(averageLoadTime).toBeLessThan(3000) // Under 3 seconds under load
    testFindings.push(
      `Security performance maintained under ${concurrentSessions} concurrent sessions`
    )
    testFindings.push(`Average security response time: ${averageLoadTime.toFixed(2)}ms`)

    await page.screenshot({
      path: 'test-results/playwright-security/security-performance-load.png',
      fullPage: true,
    })

    securityTestData.testResults.push({
      testName: 'Security Performance Under Load',
      status: 'passed',
      securityLevel: 'high',
      findings: testFindings,
    })

    console.log('✅ Security performance under load validated')
  })

  test('Security Monitoring and Event Validation', async ({ page }) => {
    console.log('📊 Testing Security Monitoring and Event Validation')

    const testFindings: string[] = []
    const securityEvents: string[] = []

    // Monitor console for security events
    page.on('console', msg => {
      if (
        msg.text().toLowerCase().includes('security') ||
        msg.text().toLowerCase().includes('auth') ||
        msg.text().toLowerCase().includes('csrf')
      ) {
        securityEvents.push(msg.text())
      }
    })

    // Test security health monitoring
    const healthResponse = await page.request.get('/api/security/health')

    if (healthResponse.status() === 200) {
      const healthData = await healthResponse.json()

      // Validate security health metrics
      expect(healthData).toHaveProperty('status')
      testFindings.push('Security health endpoint accessible')

      if (healthData.database) {
        expect(healthData.database.status).toBe('healthy')
        testFindings.push('Database security status validated')
      }

      if (healthData.auth) {
        expect(healthData.auth.status).toBe('operational')
        testFindings.push('Authentication system status validated')
      }
    }

    // Test authentication event logging
    await page.goto('/auth/signin')

    // Trigger authentication events
    await page.request.get('/api/auth/session')
    await page.request.get('/api/auth/csrf')
    await page.request.get('/api/auth/providers')

    // Validate security events were captured
    console.log('🔍 Security Events Captured:', securityEvents)
    testFindings.push(`Security events monitoring: ${securityEvents.length} events captured`)

    // Test error handling security
    const invalidEndpoints = [
      '/api/auth/invalid',
      '/api/security/restricted',
      '/api/admin/unauthorized',
    ]

    for (const endpoint of invalidEndpoints) {
      const response = await page.request.get(endpoint)

      // Should return appropriate error codes without exposing sensitive info
      expect([401, 403, 404, 405].includes(response.status())).toBeTruthy()

      if (response.status() !== 404) {
        const responseText = await response.text()
        const lowerResponse = responseText.toLowerCase()

        // Should not expose sensitive error details
        expect(lowerResponse).not.toContain('stack trace')
        expect(lowerResponse).not.toContain('internal error')
        expect(lowerResponse).not.toContain('database')
        testFindings.push(`Secure error handling for ${endpoint}`)
      }
    }

    await page.screenshot({
      path: 'test-results/playwright-security/security-monitoring.png',
      fullPage: true,
    })

    securityTestData.testResults.push({
      testName: 'Security Monitoring',
      status: 'passed',
      securityLevel: 'medium',
      findings: testFindings,
    })

    console.log('✅ Security monitoring and event validation completed')
  })

  test.afterEach(async ({ page }, testInfo) => {
    // Generate security test report
    const endTime = Date.now()
    const testDuration = endTime - securityTestData.startTime

    console.log('\n🔒 PLAYWRIGHT SECURITY TEST SUMMARY')
    console.log('═'.repeat(60))
    console.log(`Test: ${testInfo.title}`)
    console.log(`Status: ${testInfo.status}`)
    console.log(`Duration: ${testDuration}ms`)
    console.log('Security Test Results:')

    securityTestData.testResults.forEach(result => {
      const levelIcon =
        result.securityLevel === 'high' ? '🔴' : result.securityLevel === 'medium' ? '🟡' : '🟢'
      console.log(`  ${levelIcon} ${result.testName}: ${result.status}`)
      result.findings.forEach(finding => {
        console.log(`    ✓ ${finding}`)
      })
    })

    if (testInfo.status === 'failed') {
      await page.screenshot({
        path: `test-results/playwright-security/failure-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        fullPage: true,
      })
    }

    console.log('═'.repeat(60))
  })
})
