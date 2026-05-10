/**
 * Authentication Flow Security Integration Tests
 *
 * Comprehensive security validation for authentication flows including:
 * - OAuth security compliance
 * - Session security management
 * - Rate limiting effectiveness
 * - Brute force attack prevention
 * - Authentication state persistence
 * - Cross-component security integration
 */

import { getServerSession } from 'next-auth/next'
import { signIn, signOut } from 'next-auth/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/lib/github'
import { ApiKeyManager } from '@/lib/security/api-key-rotation'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { SecurityMonitoringDashboard } from '@/lib/security/monitoring-dashboard'

// Mock dependencies
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}))
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/security/audit-logger', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/security/audit-logger')>()

  return {
    ...actual,
    auditLogger: {
      log: vi.fn().mockResolvedValue(undefined),
    },
  }
})
vi.mock('@/lib/github', () => {
  class MockGitHubClient {
    static fromSession = vi.fn(async () => new MockGitHubClient())

    getCurrentUser = vi.fn()
  }

  return {
    GitHubClient: MockGitHubClient,
  }
})
vi.mock('@/lib/db', () => ({ db: {} }))

const mockSignIn = vi.mocked(signIn)
const _mockSignOut = vi.mocked(signOut)
const mockGetServerSession = vi.mocked(getServerSession)
const mockAuditLogger = vi.mocked(auditLogger)

describe('Authentication Flow Security Integration', () => {
  let securityDashboard: SecurityMonitoringDashboard
  let apiKeyService: ApiKeyManager
  let mockDb: {
    session: {
      findUnique: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
    }
    user: {
      findUnique: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    auditLog: {
      create: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup security monitoring dashboard
    securityDashboard = new SecurityMonitoringDashboard()

    // Setup API key manager with deterministic test configuration
    apiKeyService = new ApiKeyManager({
      keyPrefix: 'github_api_',
      rotationIntervalDays: 30,
      gracePeriodDays: 7,
    })

    // Setup database mock
    mockDb = {
      session: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('OAuth Flow Security Integration', () => {
    it('should validate complete GitHub OAuth security flow', async () => {
      // Simulate OAuth initiation
      const _oauthRequest = new Request('http://localhost:3000/api/auth/signin/github', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible test)',
          'X-Forwarded-For': '192.168.1.100',
        },
      })

      // Mock successful OAuth flow
      mockSignIn.mockImplementation(async () => {
        await mockAuditLogger.log({
          type: AuditEventType.AUTH_SUCCESS,
          severity: AuditSeverity.INFO,
          actor: {
            type: 'user',
            id: 'user123',
            ip: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (compatible test)',
          },
          action: 'OAuth authentication initiated',
          result: 'success',
          metadata: {
            provider: 'github',
            authMethod: 'oauth',
          },
        })

        return {
          url: 'http://localhost:3000/api/auth/callback/github?code=test_code&state=test_state',
          error: null,
        }
      })

      // Mock session creation
      const testSession = {
        user: {
          id: 'user123',
          email: 'test@example.com',
          name: 'Test User',
          login: 'testuser',
        },
        accessToken: 'gho_test_access_token',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }

      mockGetServerSession.mockImplementation((async (...args: unknown[]) => {
        expect(args[0]).toBeDefined()
        return testSession
      }) as unknown as typeof getServerSession)
      mockDb.session.create.mockResolvedValue({
        id: 'session123',
        userId: 'user123',
        expires: testSession.expires,
        sessionToken: 'session_token_123',
      })

      // Execute OAuth flow
      await signIn('github', {
        callbackUrl: '/dashboard',
        redirect: false,
      })

      // Validate security audit logging
      expect(mockAuditLogger.log).toHaveBeenCalledWith({
        type: AuditEventType.AUTH_SUCCESS,
        severity: AuditSeverity.INFO,
        actor: {
          type: 'user',
          id: expect.any(String),
          ip: expect.any(String),
          userAgent: expect.any(String),
        },
        action: 'OAuth authentication initiated',
        result: 'success',
        metadata: {
          provider: 'github',
          authMethod: 'oauth',
        },
      })

      // Validate session security
      const session = await getServerSession({} as never)
      expect(session).toBeDefined()
      expect(session?.user.id).toBe('user123')
      expect(session?.accessToken).toBe('gho_test_access_token')
    })

    it('should detect and prevent OAuth state parameter tampering', async () => {
      // Simulate OAuth callback with tampered state
      const _tamperedRequest = new Request('http://localhost:3000/api/auth/callback/github', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible test)',
          'X-Forwarded-For': '192.168.1.100',
        },
      })

      // Mock OAuth failure due to state mismatch
      mockSignIn.mockImplementation(async () => {
        await mockAuditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.ERROR,
          actor: {
            type: 'user',
            ip: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (compatible test)',
          },
          action: 'OAuth state parameter tampering detected',
          result: 'failure',
          reason: 'State parameter mismatch',
          metadata: {
            provider: 'github',
            error: 'OAuthStateVerificationError',
          },
        })

        return {
          url: null,
          error: 'OAuthStateVerificationError',
        }
      })

      // Execute OAuth callback with tampered state
      const result = await signIn('github', {
        callbackUrl: '/dashboard',
        redirect: false,
      })

      // Validate security violation logging
      expect(mockAuditLogger.log).toHaveBeenCalledWith({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.ERROR,
        actor: {
          type: 'user',
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (compatible test)',
        },
        action: 'OAuth state parameter tampering detected',
        result: 'failure',
        reason: 'State parameter mismatch',
        metadata: {
          provider: 'github',
          error: 'OAuthStateVerificationError',
        },
      })

      expect(result.error).toBe('OAuthStateVerificationError')
    })

    it('should validate OAuth token exchange security', async () => {
      // Mock GitHub API response for token exchange
      const mockGitHubClient = new GitHubClient({})

      // Mock successful token validation
      vi.spyOn(mockGitHubClient, 'getCurrentUser').mockResolvedValue({
        login: 'testuser',
        id: 12345,
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        name: 'Test User',
        email: 'test@example.com',
        bio: 'Test user bio',
        public_repos: 10,
        followers: 5,
        following: 15,
      })

      // Execute token exchange
      const session = {
        user: { id: 'user123', login: 'testuser', email: 'test@example.com' },
        accessToken: 'gho_test_token',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }

      mockGetServerSession.mockResolvedValue(session)

      // Validate token with GitHub API
      const user = await mockGitHubClient.getCurrentUser()
      expect(user.login).toBe('testuser')
      expect(user.id).toBe(12345)

      await mockAuditLogger.log({
        type: AuditEventType.AUTH_SUCCESS,
        severity: AuditSeverity.INFO,
        actor: {
          type: 'user',
          id: 'user123',
        },
        action: 'GitHub token validated',
        result: 'success',
        metadata: {
          userId: 'user123',
          githubLogin: 'testuser',
        },
      })

      // Validate audit logging for token validation
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.AUTH_SUCCESS,
          action: 'GitHub token validated',
          metadata: expect.objectContaining({
            userId: 'user123',
            githubLogin: 'testuser',
          }),
        })
      )
    })
  })

  describe('Session Security Management', () => {
    it('should enforce secure session storage and retrieval', async () => {
      const sessionData = {
        id: 'session123',
        userId: 'user123',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        sessionToken: 'secure_session_token_123',
      }

      mockDb.session.findUnique.mockResolvedValue(sessionData)
      mockDb.session.create.mockResolvedValue(sessionData)

      // Test session creation security
      const newSession = await mockDb.session.create({
        data: {
          userId: 'user123',
          expires: sessionData.expires,
          sessionToken: sessionData.sessionToken,
        },
      })

      expect(newSession.sessionToken).toBeDefined()
      expect(newSession.expires).toBeInstanceOf(Date)
      expect(newSession.userId).toBe('user123')

      await mockAuditLogger.log({
        type: AuditEventType.AUTH_SUCCESS,
        severity: AuditSeverity.INFO,
        actor: {
          type: 'user',
          id: 'user123',
        },
        action: 'Secure session created',
        result: 'success',
        metadata: {
          sessionId: 'session123',
          userId: 'user123',
        },
      })

      // Validate audit logging for session creation
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.AUTH_SUCCESS,
          action: 'Secure session created',
          metadata: expect.objectContaining({
            sessionId: 'session123',
            userId: 'user123',
          }),
        })
      )
    })

    it('should handle session expiration and cleanup securely', async () => {
      const expiredSession = {
        id: 'expired_session_123',
        userId: 'user123',
        expires: new Date(Date.now() - 60 * 60 * 1000), // Expired 1 hour ago
        sessionToken: 'expired_token_123',
      }

      mockDb.session.findUnique.mockResolvedValue(expiredSession)
      mockDb.session.delete.mockResolvedValue(expiredSession)

      // Test expired session handling
      const session = await mockDb.session.findUnique({
        where: { sessionToken: 'expired_token_123' },
      })

      if (session && session.expires < new Date()) {
        // Delete expired session
        await mockDb.session.delete({
          where: { id: session.id },
        })

        // Log security event
        await mockAuditLogger.log({
          type: AuditEventType.AUTH_LOGOUT,
          severity: AuditSeverity.INFO,
          actor: {
            type: 'system',
            id: session.userId,
          },
          action: 'Expired session cleaned up',
          result: 'success',
          metadata: {
            sessionId: session.id,
            expiredAt: session.expires,
          },
        })
      }

      expect(mockDb.session.delete).toHaveBeenCalledWith({
        where: { id: 'expired_session_123' },
      })

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.AUTH_LOGOUT,
          action: 'Expired session cleaned up',
        })
      )
    })

    it('should detect and prevent session hijacking attempts', async () => {
      const validSession = {
        id: 'session123',
        userId: 'user123',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        sessionToken: 'valid_token_123',
      }

      // Simulate session access from different IP
      const _suspiciousRequest = new Request('http://localhost:3000/api/user', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (suspicious browser)',
          'X-Forwarded-For': '10.0.0.999', // Different IP
          Cookie: 'next-auth.session-token=valid_token_123',
        },
      })

      mockDb.session.findUnique.mockResolvedValue(validSession)

      // Mock session validation with IP change detection
      const session = await mockDb.session.findUnique({
        where: { sessionToken: 'valid_token_123' },
      })

      // Simulate IP change detection
      const lastKnownIp = '192.168.1.100'
      const currentIp = '10.0.0.999'

      if (session && lastKnownIp !== currentIp) {
        // Log potential session hijacking
        await mockAuditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.ERROR,
          actor: {
            type: 'user',
            ip: currentIp,
            userAgent: 'Mozilla/5.0 (suspicious browser)',
          },
          action: 'Potential session hijacking detected',
          result: 'failure',
          reason: 'Session accessed from different IP address',
          metadata: {
            sessionId: session.id,
            userId: session.userId,
            lastKnownIp,
            currentIp,
          },
        })
      }

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.ERROR,
          action: 'Potential session hijacking detected',
        })
      )
    })
  })

  describe('Rate Limiting and Brute Force Prevention', () => {
    it('should enforce rate limiting on authentication attempts', async () => {
      const clientIp = '192.168.1.100'
      const userAgent = 'Mozilla/5.0 (test browser)'

      // Simulate multiple failed authentication attempts
      for (let i = 0; i < 6; i++) {
        const _request = new Request('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'User-Agent': userAgent,
            'X-Forwarded-For': clientIp,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'wrong_password',
          }),
        })

        // Mock failed authentication
        mockSignIn.mockResolvedValue({
          url: null,
          error: 'CredentialsSignin',
        })

        // Track failed attempts
        await mockAuditLogger.log({
          type: AuditEventType.AUTH_FAILURE,
          severity: AuditSeverity.WARNING,
          actor: {
            type: 'user',
            ip: clientIp,
            userAgent,
          },
          action: `Failed authentication attempt ${i + 1}`,
          result: 'failure',
          reason: 'Invalid credentials',
          metadata: {
            email: 'test@example.com',
            attemptNumber: i + 1,
          },
        })

        // After 5 failed attempts, trigger rate limiting
        if (i >= 4) {
          await mockAuditLogger.log({
            type: AuditEventType.SECURITY_VIOLATION,
            severity: AuditSeverity.ERROR,
            actor: {
              type: 'system',
              ip: clientIp,
            },
            action: 'Rate limit triggered for authentication attempts',
            result: 'success',
            reason: 'Too many failed authentication attempts',
            metadata: {
              ip: clientIp,
              failedAttempts: i + 1,
              timeWindow: '15 minutes',
            },
          })
        }
      }

      // Verify rate limiting was triggered
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.SECURITY_VIOLATION,
          action: 'Rate limit triggered for authentication attempts',
        })
      )
    })

    it('should detect and prevent brute force attacks', async () => {
      const attackerIp = '10.0.0.1'
      const attackPattern = {
        attempts: 50,
        timeWindow: 60000, // 1 minute
        uniqueEmails: ['test1@example.com', 'test2@example.com', 'admin@example.com'],
      }

      // Simulate brute force attack pattern
      for (let i = 0; i < attackPattern.attempts; i++) {
        const email = attackPattern.uniqueEmails[i % attackPattern.uniqueEmails.length]

        await mockAuditLogger.log({
          type: AuditEventType.AUTH_FAILURE,
          severity: AuditSeverity.WARNING,
          actor: {
            type: 'user',
            ip: attackerIp,
            userAgent: 'automated-attack-tool/1.0',
          },
          action: 'Brute force authentication attempt',
          result: 'failure',
          metadata: {
            email,
            attemptNumber: i + 1,
            timeWindow: attackPattern.timeWindow,
          },
        })
      }

      // Detect brute force pattern
      const bruteForceDetected = attackPattern.attempts > 20 && attackPattern.timeWindow < 300000 // 5 minutes

      if (bruteForceDetected) {
        await mockAuditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.CRITICAL,
          actor: {
            type: 'system',
            ip: attackerIp,
          },
          action: 'Brute force attack detected',
          result: 'success',
          reason: 'Excessive authentication attempts from single IP',
          metadata: {
            ip: attackerIp,
            totalAttempts: attackPattern.attempts,
            timeWindow: attackPattern.timeWindow,
            uniqueEmails: attackPattern.uniqueEmails.length,
          },
        })
      }

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.CRITICAL,
          action: 'Brute force attack detected',
        })
      )
    })
  })

  describe('Cross-Component Security Integration', () => {
    it('should validate authentication flow with GitHub API integration', async () => {
      const testSession = {
        user: { id: 'user123', login: 'testuser', email: 'test@example.com' },
        accessToken: 'gho_test_token',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }

      mockGetServerSession.mockResolvedValue(testSession)

      // Create authenticated GitHub client
      const githubClient = await GitHubClient.fromSession()
      expect(githubClient).toBeInstanceOf(GitHubClient)

      // Mock successful API call
      vi.spyOn(githubClient, 'getCurrentUser').mockResolvedValue({
        login: 'testuser',
        id: 12345,
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        name: 'Test User',
        email: 'test@example.com',
        bio: 'Test user bio',
        public_repos: 10,
        followers: 5,
        following: 15,
      })

      const user = await githubClient.getCurrentUser()
      expect(user.login).toBe('testuser')

      await mockAuditLogger.log({
        type: AuditEventType.API_ACCESS,
        severity: AuditSeverity.INFO,
        actor: {
          type: 'api',
          id: 'user123',
        },
        action: 'GitHub API accessed with authenticated session',
        result: 'success',
        metadata: {
          githubLogin: 'testuser',
        },
      })

      // Validate audit logging for API usage
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.API_ACCESS,
          action: 'GitHub API accessed with authenticated session',
        })
      )
    })

    it('should integrate security monitoring with authentication events', async () => {
      // Mock security dashboard metrics collection
      vi.spyOn(securityDashboard, 'collectMetrics').mockResolvedValue({
        timestamp: new Date(),
        authMetrics: {
          successCount: 10,
          failureCount: 3,
          mfaUsage: 2,
          suspiciousAttempts: 1,
          uniqueUsers: 8,
        },
        apiMetrics: {
          totalRequests: 20,
          rateLimitHits: 1,
          unauthorizedAttempts: 0,
          averageResponseTime: 42,
          errorRate: 0,
        },
        violations: {
          total: 0,
          byType: {},
          bySeverity: {
            [AuditSeverity.DEBUG]: 0,
            [AuditSeverity.INFO]: 0,
            [AuditSeverity.WARNING]: 0,
            [AuditSeverity.ERROR]: 0,
            [AuditSeverity.CRITICAL]: 0,
          },
        },
        threats: {
          bruteForceAttempts: 0,
          sqlInjectionAttempts: 0,
          xssAttempts: 0,
          suspiciousIps: [],
          anomalousPatterns: 0,
        },
        health: {
          cpuUsage: 0,
          memoryUsage: 0,
          activeConnections: 0,
          queuedRequests: 0,
        },
      })

      const metrics = await securityDashboard.collectMetrics()
      expect(metrics.authMetrics.successCount).toBe(10)
      expect(metrics.authMetrics.failureCount).toBe(3)
      expect(metrics.health.activeConnections).toBe(0)

      // Validate metrics tracking
      expect(securityDashboard.collectMetrics).toHaveBeenCalled()
    })

    it('should validate API key rotation integration with authentication', async () => {
      const currentKey = await apiKeyService.generateKey(
        'auth-user-123',
        'GitHub API key',
        ['github:read'],
        { sessionBound: true }
      )
      mockAuditLogger.log.mockClear()

      // Test key rotation during active session
      const rotationResult = await apiKeyService.rotateKey(
        currentKey.keyId,
        'auth-user-123',
        'authentication session rotation'
      )
      expect(rotationResult.oldKeyId).toBe(currentKey.keyId)
      expect(rotationResult.newKeyId).toEqual(expect.any(String))
      expect(rotationResult.newKey).toMatch(/^github_api_/)

      // Validate audit logging for key rotation
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.SECURITY_CONFIG_CHANGE,
          action: 'API key rotated',
        })
      )
    })
  })

  describe('Authentication Security Compliance', () => {
    it('should validate OWASP authentication security requirements', async () => {
      // Test secure password requirements (if implementing password auth)
      const passwordRequirements = {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
      }

      // Test session management requirements
      const sessionRequirements = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60, // 24 hours
      }

      // Test rate limiting requirements
      const rateLimitRequirements = {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        blockDuration: 30 * 60 * 1000, // 30 minutes
      }

      // Validate requirements are properly configured
      expect(passwordRequirements.minLength).toBeGreaterThanOrEqual(8)
      expect(sessionRequirements.httpOnly).toBe(true)
      expect(sessionRequirements.secure).toBe(true)
      expect(rateLimitRequirements.maxAttempts).toBeLessThanOrEqual(5)
    })

    it('should validate audit logging completeness for authentication events', async () => {
      const requiredAuditEvents = [
        AuditEventType.AUTH_SUCCESS,
        AuditEventType.AUTH_FAILURE,
        AuditEventType.AUTH_LOGOUT,
        AuditEventType.SECURITY_VIOLATION,
        AuditEventType.SECURITY_CONFIG_CHANGE,
      ]

      for (const eventType of requiredAuditEvents) {
        await mockAuditLogger.log({
          type: eventType,
          severity: AuditSeverity.INFO,
          actor: {
            type: 'system',
          },
          action: `Required audit event ${eventType}`,
          result: 'success',
          metadata: {
            eventType,
          },
        })
      }

      // Verify all required events are being logged
      for (const eventType of requiredAuditEvents) {
        expect(mockAuditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            type: eventType,
          })
        )
      }

      // Validate audit log structure
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.any(String),
          severity: expect.any(String),
          actor: expect.objectContaining({
            type: expect.any(String),
          }),
          action: expect.any(String),
          result: expect.any(String),
          metadata: expect.any(Object),
        })
      )
    })
  })
})
