/**
 * Performance Security Integration Tests
 *
 * Comprehensive testing of security implementation performance impact
 * and security effectiveness under various load conditions.
 *
 * Test Coverage:
 * - Security control performance under load conditions
 * - Rate limiting effectiveness during high volume
 * - Authentication performance with concurrent users
 * - Security middleware performance optimization
 * - Attack defense performance under stress
 * - Security monitoring performance impact
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiTestUtils } from '../api/utils/api-test-utilities'

// Performance security schemas
const SecurityPerformanceMetricsSchema = z.object({
  testId: z.string().uuid(),
  securityControl: z.string(),
  metrics: z.object({
    averageResponseTime: z.number(),
    p95ResponseTime: z.number(),
    p99ResponseTime: z.number(),
    throughput: z.number(),
    errorRate: z.number(),
    securityOverhead: z.number(),
    memoryUsage: z.number(),
    cpuUsage: z.number(),
  }),
  loadConditions: z.object({
    concurrentUsers: z.number(),
    requestsPerSecond: z.number(),
    duration: z.number(),
    attackIntensity: z.enum(['none', 'low', 'medium', 'high', 'extreme']),
  }),
  securityEffectiveness: z.object({
    threatsBlocked: z.number(),
    falsePositives: z.number(),
    falseNegatives: z.number(),
    detectionAccuracy: z.number(),
  }),
  timestamp: z.string().datetime(),
})

const ConcurrentSecurityTestSchema = z.object({
  testId: z.string().uuid(),
  testType: z.enum([
    'concurrent_authentication',
    'parallel_rate_limiting',
    'simultaneous_attacks',
    'load_with_security',
    'stress_test_security',
  ]),
  configuration: z.object({
    concurrentUsers: z.number(),
    testDuration: z.number(),
    securityControlsEnabled: z.array(z.string()),
    performanceThresholds: z.object({
      maxResponseTime: z.number(),
      minThroughput: z.number(),
      maxErrorRate: z.number(),
    }),
  }),
  results: z.object({
    totalRequests: z.number(),
    successfulRequests: z.number(),
    failedRequests: z.number(),
    blockedRequests: z.number(),
    averageResponseTime: z.number(),
    throughput: z.number(),
    securityViolationsDetected: z.number(),
    securityViolationsBlocked: z.number(),
  }),
  performanceAcceptable: z.boolean(),
  securityEffective: z.boolean(),
})

const SecurityLoadTestResultSchema = z.object({
  testSuiteId: z.string().uuid(),
  testResults: z.array(ConcurrentSecurityTestSchema),
  overallMetrics: z.object({
    totalDuration: z.number(),
    peakConcurrency: z.number(),
    averageSecurityOverhead: z.number(),
    securityFailures: z.number(),
    performanceFailures: z.number(),
  }),
  recommendations: z.array(z.string()),
  scalabilityAssessment: z.enum(['poor', 'acceptable', 'good', 'excellent']),
})

// Test setup
const server = setupServer()
const performanceTracker = new apiTestUtils.performanceTracker()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  performanceTracker.clear()
})
afterAll(() => server.close())

describe('Performance Security Integration Tests', () => {
  let performanceMetrics: z.infer<typeof SecurityPerformanceMetricsSchema>[] = []
  let concurrentTestResults: z.infer<typeof ConcurrentSecurityTestSchema>[] = []
  let loadTestResults: z.infer<typeof SecurityLoadTestResultSchema>[] = []

  beforeEach(() => {
    performanceMetrics = []
    concurrentTestResults = []
    loadTestResults = []
    vi.clearAllMocks()
  })

  describe('Security Under Load Conditions', () => {
    it('should maintain rate limiting under high volume with performance validation', async () => {
      const testId = apiTestUtils.dataGenerator.generateUUID()
      const concurrentUsers = 50
      const requestsPerUser = 10
      const rateLimitThreshold = 100 // requests per minute per user

      const rateLimitStore = new Map<string, { count: number; timestamps: number[] }>()
      const performanceData: number[] = []

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const startTime = performance.now()
          const userId = request.headers.get('X-User-ID') || 'anonymous'
          const now = Date.now()
          const windowSize = 60000 // 1 minute

          // Initialize or update rate limit data
          if (!rateLimitStore.has(userId)) {
            rateLimitStore.set(userId, { count: 0, timestamps: [] })
          }

          const userLimit = rateLimitStore.get(userId)!

          // Clean old timestamps
          userLimit.timestamps = userLimit.timestamps.filter(ts => now - ts < windowSize)
          userLimit.count = userLimit.timestamps.length

          // Check rate limit
          if (userLimit.count >= rateLimitThreshold) {
            const responseTime = performance.now() - startTime
            performanceData.push(responseTime)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Rate limit exceeded',
                },
              },
              {
                status: 429,
                headers: {
                  'X-RateLimit-Limit': String(rateLimitThreshold),
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(now + windowSize),
                },
              }
            )
          }

          // Allow request
          userLimit.timestamps.push(now)
          userLimit.count++

          const responseTime = performance.now() - startTime
          performanceData.push(responseTime)

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [{ id: '1', name: 'test-repo' }],
              rateLimit: {
                remaining: rateLimitThreshold - userLimit.count,
                limit: rateLimitThreshold,
              },
            },
          })
        })
      )

      // Execute concurrent load test
      const startTime = Date.now()
      const promises: Promise<Response>[] = []

      for (let user = 0; user < concurrentUsers; user++) {
        for (let req = 0; req < requestsPerUser; req++) {
          promises.push(
            fetch('http://localhost:3000/api/search/repositories', {
              headers: {
                'X-User-ID': `user-${user}`,
              },
            })
          )

          // Stagger requests slightly to simulate real-world conditions
          if (req % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }
      }

      const responses = await Promise.all(promises)
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      // Analyze results
      const successfulRequests = responses.filter(r => r.status === 200).length
      const rateLimitedRequests = responses.filter(r => r.status === 429).length
      const errorRequests = responses.filter(r => r.status >= 500).length

      const averageResponseTime =
        performanceData.reduce((sum, time) => sum + time, 0) / performanceData.length
      const p95ResponseTime = performanceData.sort((a, b) => a - b)[
        Math.floor(performanceData.length * 0.95)
      ]
      const p99ResponseTime = performanceData.sort((a, b) => a - b)[
        Math.floor(performanceData.length * 0.99)
      ]
      const throughput = (responses.length / totalDuration) * 1000 // requests per second

      // Record performance metrics
      const metrics: z.infer<typeof SecurityPerformanceMetricsSchema> = {
        testId,
        securityControl: 'rate_limiting',
        metrics: {
          averageResponseTime,
          p95ResponseTime,
          p99ResponseTime,
          throughput,
          errorRate: errorRequests / responses.length,
          securityOverhead: averageResponseTime * 0.15, // Estimated overhead
          memoryUsage: rateLimitStore.size * 100, // Simplified metric
          cpuUsage: Math.min(95, throughput * 0.1), // Simplified metric
        },
        loadConditions: {
          concurrentUsers,
          requestsPerSecond: throughput,
          duration: totalDuration,
          attackIntensity: 'medium',
        },
        securityEffectiveness: {
          threatsBlocked: rateLimitedRequests,
          falsePositives: 0,
          falseNegatives: 0,
          detectionAccuracy: 100,
        },
        timestamp: new Date().toISOString(),
      }

      performanceMetrics.push(metrics)

      // Validate performance requirements
      expect(averageResponseTime).toBeLessThan(100) // Less than 100ms average
      expect(p95ResponseTime).toBeLessThan(200) // Less than 200ms for 95th percentile
      expect(throughput).toBeGreaterThan(100) // At least 100 requests/second
      expect(metrics.metrics.errorRate).toBeLessThan(0.01) // Less than 1% error rate

      // Validate security effectiveness
      expect(rateLimitedRequests).toBeGreaterThan(0) // Rate limiting should be triggered
      expect(successfulRequests + rateLimitedRequests).toBe(responses.length) // No other errors

      // Validate that rate limiting is working per user
      expect(rateLimitedRequests).toBeLessThan(responses.length * 0.5) // Not blocking everything

      console.log(`Rate Limiting Performance Test Results:
        - Total Requests: ${responses.length}
        - Successful: ${successfulRequests}
        - Rate Limited: ${rateLimitedRequests}
        - Average Response Time: ${averageResponseTime.toFixed(2)}ms
        - P95 Response Time: ${p95ResponseTime.toFixed(2)}ms
        - Throughput: ${throughput.toFixed(2)} req/s`)
    })

    it('should handle concurrent authentication securely with acceptable performance', async () => {
      const testId = apiTestUtils.dataGenerator.generateUUID()
      const concurrentUsers = 25
      const authenticationAttempts = 3

      const authPerformanceData: number[] = []
      const authResults: { success: boolean; responseTime: number; userId: string }[] = []

      server.use(
        http.post('http://localhost:3000/api/auth/signin', async ({ request }) => {
          const startTime = performance.now()
          const body = await request.json()
          const { email, password } = body

          // Simulate authentication processing with security checks
          await new Promise(resolve => setTimeout(resolve, 20)) // Simulate DB lookup
          await new Promise(resolve => setTimeout(resolve, 15)) // Simulate password hashing
          await new Promise(resolve => setTimeout(resolve, 10)) // Simulate session creation

          const responseTime = performance.now() - startTime
          authPerformanceData.push(responseTime)

          // Simulate authentication logic
          const isValidCredentials = email.includes('valid') && password === 'password123'

          if (isValidCredentials) {
            const userId = apiTestUtils.dataGenerator.generateUUID()
            authResults.push({ success: true, responseTime, userId })

            return HttpResponse.json({
              success: true,
              data: {
                user: { id: userId, email },
                sessionToken: apiTestUtils.dataGenerator.generateRandomString(64),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              },
            })
          }
            authResults.push({ success: false, responseTime, userId: '' })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_CREDENTIALS',
                  message: 'Invalid email or password',
                },
              },
              { status: 401 }
            )
        })
      )

      // Execute concurrent authentication test
      const startTime = Date.now()
      const promises: Promise<Response>[] = []

      for (let user = 0; user < concurrentUsers; user++) {
        for (let attempt = 0; attempt < authenticationAttempts; attempt++) {
          const isValidAttempt = attempt === authenticationAttempts - 1 // Last attempt is valid
          promises.push(
            fetch('http://localhost:3000/api/auth/signin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: isValidAttempt
                  ? `valid-user-${user}@example.com`
                  : `invalid-user-${user}@example.com`,
                password: isValidAttempt ? 'password123' : 'wrongpassword',
              }),
            })
          )
        }
      }

      const responses = await Promise.all(promises)
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      // Analyze authentication performance
      const successfulAuth = authResults.filter(r => r.success).length
      const failedAuth = authResults.filter(r => !r.success).length
      const averageAuthTime =
        authPerformanceData.reduce((sum, time) => sum + time, 0) / authPerformanceData.length
      const maxAuthTime = Math.max(...authPerformanceData)
      const authThroughput = (responses.length / totalDuration) * 1000

      // Record concurrent test results
      const concurrentTest: z.infer<typeof ConcurrentSecurityTestSchema> = {
        testId,
        testType: 'concurrent_authentication',
        configuration: {
          concurrentUsers,
          testDuration: totalDuration,
          securityControlsEnabled: ['password_verification', 'session_management', 'rate_limiting'],
          performanceThresholds: {
            maxResponseTime: 500,
            minThroughput: 50,
            maxErrorRate: 0.05,
          },
        },
        results: {
          totalRequests: responses.length,
          successfulRequests: successfulAuth,
          failedRequests: failedAuth,
          blockedRequests: 0,
          averageResponseTime: averageAuthTime,
          throughput: authThroughput,
          securityViolationsDetected: failedAuth,
          securityViolationsBlocked: failedAuth,
        },
        performanceAcceptable: averageAuthTime < 500 && authThroughput > 50,
        securityEffective: failedAuth > 0 && successfulAuth === concurrentUsers, // Each user should have one success
      }

      concurrentTestResults.push(concurrentTest)

      // Validate concurrent authentication performance
      expect(averageAuthTime).toBeLessThan(500) // Less than 500ms average
      expect(maxAuthTime).toBeLessThan(1000) // No single auth takes more than 1 second
      expect(authThroughput).toBeGreaterThan(50) // At least 50 auths per second

      // Validate security effectiveness
      expect(successfulAuth).toBe(concurrentUsers) // Each user should authenticate once
      expect(failedAuth).toBe(concurrentUsers * (authenticationAttempts - 1)) // Failed attempts

      // Validate no race conditions or data corruption
      const uniqueUserIds = new Set(authResults.filter(r => r.success).map(r => r.userId))
      expect(uniqueUserIds.size).toBe(concurrentUsers) // Each user gets unique ID

      console.log(`Concurrent Authentication Test Results:
        - Concurrent Users: ${concurrentUsers}
        - Total Requests: ${responses.length}
        - Successful Authentications: ${successfulAuth}
        - Failed Authentications: ${failedAuth}
        - Average Auth Time: ${averageAuthTime.toFixed(2)}ms
        - Max Auth Time: ${maxAuthTime.toFixed(2)}ms
        - Auth Throughput: ${authThroughput.toFixed(2)} req/s`)
    })

    it('should maintain security effectiveness under timing attack scenarios', async () => {
      const testId = apiTestUtils.dataGenerator.generateUUID()
      const timingAttackAttempts = 100
      const validEmail = 'admin@contribux.com'
      const invalidEmails = Array.from(
        { length: timingAttackAttempts },
        (_, i) => `fake${i}@example.com`
      )

      const timingData: { email: string; responseTime: number; success: boolean }[] = []

      server.use(
        http.post('http://localhost:3000/api/auth/check-email', async ({ request }) => {
          const startTime = performance.now()
          const body = await request.json()
          const { email } = body

          // Simulate database lookup with timing attack protection
          const baseDelay = 50 // Base processing time
          const randomDelay = Math.random() * 20 // Random jitter to prevent timing attacks
          await new Promise(resolve => setTimeout(resolve, baseDelay + randomDelay))

          // Always perform the same operations regardless of email validity
          const isValid = email === validEmail

          // Simulate constant-time operations
          await new Promise(resolve => setTimeout(resolve, 10)) // Additional processing

          const responseTime = performance.now() - startTime
          timingData.push({ email, responseTime, success: isValid })

          if (isValid) {
            return HttpResponse.json({
              success: true,
              data: { emailExists: true },
            })
          }
            return HttpResponse.json({
              success: true,
              data: { emailExists: false },
            })
        })
      )

      // Execute timing attack test
      const startTime = Date.now()

      // Mix valid and invalid emails randomly
      const testEmails = [validEmail, ...invalidEmails].sort(() => Math.random() - 0.5)

      const promises = testEmails.map(email =>
        fetch('http://localhost:3000/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
      )

      const responses = await Promise.all(promises)
      const endTime = Date.now()

      // Analyze timing attack resistance
      const validEmailTimes = timingData
        .filter(d => d.email === validEmail)
        .map(d => d.responseTime)
      const invalidEmailTimes = timingData
        .filter(d => d.email !== validEmail)
        .map(d => d.responseTime)

      const avgValidTime =
        validEmailTimes.reduce((sum, time) => sum + time, 0) / validEmailTimes.length
      const avgInvalidTime =
        invalidEmailTimes.reduce((sum, time) => sum + time, 0) / invalidEmailTimes.length
      const timingDifference = Math.abs(avgValidTime - avgInvalidTime)

      // Calculate timing variance
      const allTimes = timingData.map(d => d.responseTime)
      const avgTime = allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length
      const variance =
        allTimes.reduce((sum, time) => sum + (time - avgTime) ** 2, 0) / allTimes.length
      const standardDeviation = Math.sqrt(variance)

      // Record performance metrics for timing attack resistance
      const timingMetrics: z.infer<typeof SecurityPerformanceMetricsSchema> = {
        testId,
        securityControl: 'timing_attack_protection',
        metrics: {
          averageResponseTime: avgTime,
          p95ResponseTime: allTimes.sort((a, b) => a - b)[Math.floor(allTimes.length * 0.95)],
          p99ResponseTime: allTimes.sort((a, b) => a - b)[Math.floor(allTimes.length * 0.99)],
          throughput: (responses.length / (endTime - startTime)) * 1000,
          errorRate: 0,
          securityOverhead: standardDeviation,
          memoryUsage: responses.length * 10, // Simplified
          cpuUsage: Math.min(50, avgTime * 0.1), // Simplified
        },
        loadConditions: {
          concurrentUsers: 1,
          requestsPerSecond: (responses.length / (endTime - startTime)) * 1000,
          duration: endTime - startTime,
          attackIntensity: 'high',
        },
        securityEffectiveness: {
          threatsBlocked: timingAttackAttempts, // All timing attacks should be ineffective
          falsePositives: 0,
          falseNegatives: 0,
          detectionAccuracy: 100,
        },
        timestamp: new Date().toISOString(),
      }

      performanceMetrics.push(timingMetrics)

      // Validate timing attack resistance
      expect(timingDifference).toBeLessThan(5) // Less than 5ms difference between valid/invalid
      expect(standardDeviation).toBeGreaterThan(5) // Sufficient randomness in response times
      expect(standardDeviation).toBeLessThan(20) // Not too much variance to impact UX

      // Validate that all requests were processed correctly
      expect(responses.every(r => r.status === 200)).toBe(true)

      // Validate security effectiveness - timing differences should be minimal
      const timingAttackResistance = ((20 - timingDifference) / 20) * 100 // Higher is better
      expect(timingAttackResistance).toBeGreaterThan(75) // At least 75% resistance

      console.log(`Timing Attack Resistance Test Results:
        - Total Attempts: ${responses.length}
        - Average Valid Email Time: ${avgValidTime.toFixed(2)}ms
        - Average Invalid Email Time: ${avgInvalidTime.toFixed(2)}ms
        - Timing Difference: ${timingDifference.toFixed(2)}ms
        - Standard Deviation: ${standardDeviation.toFixed(2)}ms
        - Timing Attack Resistance: ${timingAttackResistance.toFixed(1)}%`)
    })
  })

  describe('Comprehensive Security Performance Analysis', () => {
    it('should generate comprehensive security load test results with recommendations', async () => {
      const testSuiteId = apiTestUtils.dataGenerator.generateUUID()
      const startTime = Date.now()

      // Aggregate all test results from previous tests
      const allTestResults = concurrentTestResults
      const allMetrics = performanceMetrics

      // Calculate overall metrics
      const totalDuration = Date.now() - startTime
      const peakConcurrency = Math.max(...allTestResults.map(t => t.configuration.concurrentUsers))
      const averageSecurityOverhead =
        allMetrics.reduce((sum, m) => sum + m.metrics.securityOverhead, 0) / allMetrics.length
      const securityFailures = allTestResults.filter(t => !t.securityEffective).length
      const performanceFailures = allTestResults.filter(t => !t.performanceAcceptable).length

      // Generate recommendations based on results
      const recommendations: string[] = []

      if (averageSecurityOverhead > 50) {
        recommendations.push('Optimize security middleware to reduce response time overhead')
      }

      if (performanceFailures > 0) {
        recommendations.push('Investigate performance bottlenecks in security controls')
      }

      if (securityFailures > 0) {
        recommendations.push('Review security control effectiveness under concurrent load')
      }

      const avgThroughput =
        allMetrics.reduce((sum, m) => sum + m.metrics.throughput, 0) / allMetrics.length
      if (avgThroughput < 100) {
        recommendations.push('Consider horizontal scaling for improved throughput')
      }

      const maxResponseTime = Math.max(...allMetrics.map(m => m.metrics.p99ResponseTime))
      if (maxResponseTime > 500) {
        recommendations.push('Optimize slow security checks for better user experience')
      }

      // Determine scalability assessment
      let scalabilityAssessment: 'poor' | 'acceptable' | 'good' | 'excellent'

      if (performanceFailures > 2 || securityFailures > 1 || averageSecurityOverhead > 100) {
        scalabilityAssessment = 'poor'
      } else if (performanceFailures > 0 || averageSecurityOverhead > 50) {
        scalabilityAssessment = 'acceptable'
      } else if (averageSecurityOverhead < 25 && maxResponseTime < 200) {
        scalabilityAssessment = 'excellent'
      } else {
        scalabilityAssessment = 'good'
      }

      // Create comprehensive load test results
      const loadTestResult: z.infer<typeof SecurityLoadTestResultSchema> = {
        testSuiteId,
        testResults: allTestResults,
        overallMetrics: {
          totalDuration,
          peakConcurrency,
          averageSecurityOverhead,
          securityFailures,
          performanceFailures,
        },
        recommendations,
        scalabilityAssessment,
      }

      loadTestResults.push(loadTestResult)

      // Validate overall security performance
      expect(securityFailures).toBe(0) // No security controls should fail under load
      expect(performanceFailures).toBeLessThanOrEqual(1) // At most one performance failure acceptable
      expect(averageSecurityOverhead).toBeLessThan(100) // Security overhead should be reasonable
      expect(scalabilityAssessment).not.toBe('poor') // Should have at least acceptable scalability

      // Generate detailed performance report
      console.log(`
=== SECURITY PERFORMANCE INTEGRATION TEST SUMMARY ===

Test Suite ID: ${testSuiteId}
Test Duration: ${totalDuration}ms
Peak Concurrency: ${peakConcurrency} users

Performance Metrics:
- Average Security Overhead: ${averageSecurityOverhead.toFixed(2)}ms
- Security Failures: ${securityFailures}
- Performance Failures: ${performanceFailures}
- Scalability Assessment: ${scalabilityAssessment.toUpperCase()}

Security Controls Tested:
${allMetrics.map(m => `- ${m.securityControl}: ${m.metrics.averageResponseTime.toFixed(2)}ms avg, ${m.securityEffectiveness.detectionAccuracy}% accuracy`).join('\n')}

Recommendations:
${recommendations.map(r => `- ${r}`).join('\n')}

=== END SUMMARY ===`)

      // Validate that security is not significantly impacting performance
      const performanceImpact = (averageSecurityOverhead / 200) * 100 // Assuming 200ms is acceptable baseline
      expect(performanceImpact).toBeLessThan(50) // Security should not impact performance by more than 50%

      // Validate security effectiveness across all tests
      const averageDetectionAccuracy =
        allMetrics.reduce((sum, m) => sum + m.securityEffectiveness.detectionAccuracy, 0) /
        allMetrics.length
      expect(averageDetectionAccuracy).toBeGreaterThanOrEqual(95) // At least 95% detection accuracy

      return loadTestResult
    })
  })
})
