/**
 * Simplified Test Mocks
 * Lightweight mock utilities for fast test execution
 */

import { vi } from 'vitest'

/**
 * Database mock setup - simplified
 */
export function setupDatabaseMock() {
  // Mock database configuration
  vi.mock('@/lib/db/config', () => ({
    sql: vi.fn().mockResolvedValue([]),
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({ insertId: 1 }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ affectedRows: 1 }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      }),
    },
    connectionPool: {
      getConnection: vi.fn().mockResolvedValue({
        release: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
      }),
    },
  }))

  // Mock database schemas
  vi.mock('@/lib/db/schema', () => ({
    users: {},
    repositories: {},
    userPreferences: {},
    securityAuditLogs: {},
  }))
}

/**
 * WebAuthn server mock setup - simplified
 */
export function setupWebAuthnServerMock() {
  vi.mock('@/lib/security/webauthn/server', () => ({
    generateWebAuthnRegistration: vi.fn().mockResolvedValue({
      challenge: 'test-challenge',
      rp: { name: 'Test App', id: 'localhost' },
      user: {
        id: 'test-user-id',
        name: 'test@example.com',
        displayName: 'Test User',
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      timeout: 60000,
      attestation: 'none',
    }),
    generateWebAuthnAuthentication: vi.fn().mockResolvedValue({
      challenge: 'test-auth-challenge',
      allowCredentials: [
        {
          id: 'test-credential-id',
          type: 'public-key',
        },
      ],
      timeout: 60000,
    }),
    verifyWebAuthnRegistration: vi.fn().mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialID: 'test-credential-id',
        credentialPublicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
      },
    }),
    verifyWebAuthnAuthentication: vi.fn().mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'test-credential-id',
        newCounter: 1,
      },
    }),
  }))
}

/**
 * GitHub API mock setup - simplified
 */
export function setupGitHubMock() {
  vi.mock('@/lib/github/client', () => ({
    GitHubClient: vi.fn().mockImplementation(() => ({
      searchRepositories: vi.fn().mockResolvedValue({
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            id: 1,
            name: 'test-repo',
            full_name: 'test-owner/test-repo',
            description: 'Test repository',
            html_url: 'https://github.com/test-owner/test-repo',
            stargazers_count: 100,
            language: 'TypeScript',
            topics: ['test', 'repository'],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-12-01T00:00:00Z',
            owner: {
              login: 'test-owner',
              avatar_url: 'https://github.com/test-owner.png',
            },
          },
        ],
      }),
      getUser: vi.fn().mockResolvedValue({
        login: 'test-user',
        id: 12345,
        email: 'test@example.com',
        name: 'Test User',
      }),
      getRateLimit: vi.fn().mockResolvedValue({
        rate: {
          limit: 5000,
          remaining: 4999,
          reset: Date.now() / 1000 + 3600,
        },
      }),
    })),
  }))
}

/**
 * NextAuth mock setup - simplified
 */
export function setupAuthMock() {
  const mockSession = {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
    expires: '2024-12-31T23:59:59.999Z',
  }

  // Fix NextAuth v5 mock with proper default export
  vi.mock('next-auth', () => {
    const mockNextAuth = vi.fn(() => ({
      handlers: {
        GET: vi.fn(),
        POST: vi.fn(),
      },
      auth: vi.fn().mockResolvedValue(mockSession),
      signIn: vi.fn(),
      signOut: vi.fn(),
    }))

    return {
      default: mockNextAuth,
      getServerSession: vi.fn().mockResolvedValue(mockSession),
    }
  })

  vi.mock('@/lib/config/auth', () => ({
    authConfig: {
      secret: 'test-secret',
      providers: [],
    },
  }))

  return mockSession
}

/**
 * Feature flags mock setup - simplified
 */
export function setupFeatureFlagsMock() {
  const mockSecurityFeatures = {
    webauthn: true,
    oauth: true,
    auditLogs: false,
    rateLimiting: true,
  }

  vi.mock('@/lib/security/feature-flags', () => ({
    securityFeatures: mockSecurityFeatures,
    getSecurityFeatures: vi.fn().mockReturnValue({
      webauthn: true,
      oauth: true,
      auditLogs: false,
      rateLimiting: true,
      basicSecurity: true,
      securityHeaders: true,
      isDevelopment: true,
      isProduction: false,
    }),
    getSecurityConfig: vi.fn().mockReturnValue({
      webauthn: {
        rpName: 'Contribux',
        rpId: 'localhost',
        origin: 'http://localhost:3000',
        timeout: 60000,
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 1000,
      },
      monitoring: {
        enableHealthChecks: false,
        enableMetrics: false,
      },
    }),
    isFeatureEnabled: vi.fn().mockImplementation((feature: string) => {
      return mockSecurityFeatures[feature as keyof typeof mockSecurityFeatures] || false
    }),
  }))
}

/**
 * Telemetry/tracing mock setup - fixes telemetry test failures
 */
export function setupTelemetryMock() {
  // Mock OpenTelemetry tracing
  vi.mock('@/lib/monitoring/tracing', () => ({
    tracer: {
      startSpan: vi.fn().mockReturnValue({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      }),
    },
    startSpan: vi.fn().mockReturnValue({
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    }),
  }))

  // Mock span implementations
  vi.mock('@opentelemetry/api', () => ({
    trace: {
      getTracer: vi.fn().mockReturnValue({
        startSpan: vi.fn().mockReturnValue({
          setAttributes: vi.fn(),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
        }),
      }),
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
  }))
}

/**
 * All-in-one mock setup for unit tests
 */
export function setupAllMocks() {
  setupDatabaseMock()
  setupWebAuthnServerMock()
  setupGitHubMock()
  setupAuthMock()
  setupFeatureFlagsMock()
  setupTelemetryMock()
}
