/**
 * API Test Data Factories
 * Centralized factory functions for creating test data for API endpoints
 */

// User and Session Data Factories
export const userFactory = {
  createUser: (overrides: Partial<User> = {}): User => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    image: 'https://example.com/avatar.jpg',
    ...overrides,
  }),

  createSession: (overrides: Partial<Session> = {}): Session => ({
    user: userFactory.createUser(),
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }),

  createGitHubAccount: (overrides: Partial<GitHubAccount> = {}): GitHubAccount => ({
    provider: 'github',
    providerAccountId: '123456789',
    access_token: 'gho_test_token',
    scope: 'user:email,read:user',
    token_type: 'bearer',
    ...overrides,
  }),
}

// Repository and Opportunity Data Factories
export const repositoryFactory = {
  createRepository: (overrides: Partial<Repository> = {}): Repository => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    githubId: 123456789,
    name: 'test-repo',
    fullName: 'test-user/test-repo',
    description: 'A test repository for API testing',
    url: 'https://github.com/test-user/test-repo',
    homepage: null,
    language: 'TypeScript',
    stargazersCount: 1250,
    forksCount: 89,
    openIssuesCount: 15,
    isActive: true,
    lastSyncAt: new Date().toISOString(),
    createdAt: new Date('2023-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  createOpportunity: (overrides: Partial<Opportunity> = {}): Opportunity => ({
    id: '550e8400-e29b-41d4-a716-446655440001',
    repositoryId: '550e8400-e29b-41d4-a716-446655440000',
    issueNumber: 42,
    title: 'Fix TypeScript type errors in search module',
    description: 'Several type errors need to be fixed in the search functionality',
    url: 'https://github.com/test-user/test-repo/issues/42',
    metadata: {
      labels: ['bug', 'good first issue', 'help wanted'],
      author: {
        login: 'contributor',
        id: 987654321,
        avatarUrl: 'https://github.com/contributor.png',
      },
      assignees: [],
      state: 'open',
      locked: false,
      comments: 3,
      createdAt: '2023-06-01T12:00:00Z',
      updatedAt: '2023-06-02T08:30:00Z',
      difficulty: 'intermediate',
      estimatedHours: 4,
      skillsRequired: ['TypeScript', 'debugging'],
      mentorshipAvailable: true,
      goodFirstIssue: true,
      hacktoberfest: false,
      priority: 'medium',
      complexity: 5,
      impactLevel: 'medium',
      learningOpportunity: 8,
      communitySupport: true,
      documentationNeeded: false,
      testingRequired: true,
    },
    difficultyScore: 5,
    impactScore: 7,
    matchScore: 8.5,
    createdAt: new Date('2023-06-01T12:00:00Z').toISOString(),
    updatedAt: new Date('2023-06-02T08:30:00Z').toISOString(),
    ...overrides,
  }),

  createMultipleOpportunities: (count = 5): Opportunity[] => {
    return Array.from({ length: count }, (_, index) =>
      repositoryFactory.createOpportunity({
        id: `550e8400-e29b-41d4-a716-44665544000${index + 1}`,
        issueNumber: 42 + index,
        title: `Test Opportunity ${index + 1}`,
        difficultyScore: 3 + (index % 3),
        impactScore: 5 + (index % 3),
        matchScore: 7 + index * 0.3,
      })
    )
  },
}

// API Response Factories
export const apiResponseFactory = {
  createSearchOpportunitiesResponse: (
    opportunities: Opportunity[] = [],
    metadata: Partial<SearchMetadata> = {}
  ): SearchOpportunitiesResponse => ({
    success: true,
    data: {
      opportunities,
      total_count: opportunities.length,
      page: 1,
      per_page: 20,
      has_more: false,
    },
    metadata: {
      query: '',
      filters: {},
      execution_time_ms: 42,
      performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
      stats: {
        total: opportunities.length,
        beginnerFriendly: opportunities.filter(o => o.difficultyScore <= 3).length,
        withMentorship: opportunities.filter(o => o.metadata?.mentorshipAvailable).length,
        embeddingCoverage: 0.95,
      },
      ...metadata,
    },
  }),

  createErrorResponse: (
    code = 'INTERNAL_ERROR',
    message = 'Internal server error',
    _status = 500
  ): ApiErrorResponse => ({
    success: false,
    error: {
      code,
      message,
      details: undefined,
    },
    request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  }),

  createHealthResponse: (
    status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
  ): HealthResponse => ({
    status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: {
      database: {
        status: status === 'unhealthy' ? 'unhealthy' : 'healthy',
        response_time_ms: status === 'unhealthy' ? 5000 : 45,
        details: status === 'unhealthy' ? 'Database connection failed' : undefined,
      },
      memory: {
        status: 'healthy',
        usage_mb: 128,
        free_mb: 256,
      },
    },
  }),

  createSecurityHealthResponse: (
    status: 'healthy' | 'warning' | 'critical' = 'healthy',
    features: Partial<SecurityFeatures> = {}
  ): SecurityHealthResponse => ({
    timestamp: new Date().toISOString(),
    status,
    services: {
      database: status === 'critical' ? 'error' : 'connected',
      webauthn: features.webauthnEnabled !== false ? 'available' : 'disabled',
      rateLimit: features.rateLimitingEnabled !== false ? 'active' : 'inactive',
      securityHeaders: 'enabled',
    },
    features: {
      webauthnEnabled: true,
      rateLimitingEnabled: true,
      advancedMonitoringEnabled: true,
      securityDashboardEnabled: true,
      ...features,
    },
    ...(features.advancedMonitoringEnabled !== false && {
      metrics: {
        totalWebAuthnCredentials: 5,
        activeUserSessions: 12,
        recentSecurityEvents: 0,
      },
    }),
    configuration: {
      environment: 'test',
      webauthnRpId: 'localhost',
      securityLevel: 'enterprise',
    },
  }),
}

// Auth Response Factories
export const authResponseFactory = {
  createProvidersResponse: (): AuthProvidersResponse => ({
    github: {
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
      signinUrl: 'http://localhost:3000/api/auth/signin/github',
      callbackUrl: 'http://localhost:3000/api/auth/callback/github',
    },
  }),

  createSigninResponse: (url = 'http://localhost:3000/dashboard'): AuthSigninResponse => ({
    url,
    ok: true,
  }),

  createMfaSettingsResponse: (enabled = false): MfaSettingsResponse => ({
    success: true,
    data: {
      totpEnabled: enabled,
      webauthnEnabled: enabled,
      backupCodes: enabled ? 8 : 0,
      lastUsed: enabled ? new Date().toISOString() : null,
    },
  }),
}

// WebAuthn Response Factories
export const webauthnFactory = {
  createRegistrationOptions: (): WebAuthnRegistrationOptions => ({
    challenge: 'test-challenge-string',
    rp: {
      name: 'Contribux',
      id: 'localhost',
    },
    user: {
      id: 'dGVzdC11c2VyLWlk', // base64 encoded 'test-user-id'
      name: 'test@example.com',
      displayName: 'Test User',
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    timeout: 60000,
    excludeCredentials: [],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    },
  }),

  createAuthenticationOptions: (): WebAuthnAuthenticationOptions => ({
    challenge: 'test-auth-challenge',
    timeout: 60000,
    allowCredentials: [
      {
        id: 'test-credential-id',
        type: 'public-key',
        transports: ['internal'],
      },
    ],
    userVerification: 'required',
  }),

  createVerificationResponse: (success = true): WebAuthnVerificationResponse => ({
    success,
    ...(success && {
      credential: {
        id: 'test-credential-id',
        type: 'public-key',
        rawId: 'dGVzdC1jcmVkZW50aWFsLWlk',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation-object',
        },
      },
    }),
    ...(success && { verified: true }),
  }),
}

// Type definitions for factories
export type User = {
  id: string
  email: string
  name: string
  image: string
}

export type Session = {
  user: User
  expires: string
}

export type GitHubAccount = {
  provider: string
  providerAccountId: string
  access_token: string
  scope: string
  token_type: string
}

export type Repository = {
  id: string
  githubId: number
  name: string
  fullName: string
  description: string | null
  url: string
  homepage: string | null
  language: string | null
  stargazersCount: number
  forksCount: number
  openIssuesCount: number
  isActive: boolean
  lastSyncAt: string
  createdAt: string
  updatedAt: string
}

export type Opportunity = {
  id: string
  repositoryId: string
  issueNumber: number
  title: string
  description: string | null
  url: string | null
  metadata: {
    labels?: string[]
    author?: {
      login?: string
      id?: number
      avatarUrl?: string
    }
    assignees?: Array<{
      login?: string
      id?: number
    }>
    state?: 'open' | 'closed'
    locked?: boolean
    comments?: number
    createdAt?: string
    updatedAt?: string
    closedAt?: string
    difficulty?: 'beginner' | 'intermediate' | 'advanced'
    estimatedHours?: number
    skillsRequired?: string[]
    mentorshipAvailable?: boolean
    goodFirstIssue?: boolean
    hacktoberfest?: boolean
    priority?: 'low' | 'medium' | 'high'
    complexity?: number
    impactLevel?: 'low' | 'medium' | 'high'
    learningOpportunity?: number
    communitySupport?: boolean
    documentationNeeded?: boolean
    testingRequired?: boolean
  }
  difficultyScore: number
  impactScore: number
  matchScore: number
  createdAt: string
  updatedAt: string
}

export type SearchOpportunitiesResponse = {
  success: boolean
  data: {
    opportunities: Opportunity[]
    total_count: number
    page: number
    per_page: number
    has_more: boolean
  }
  metadata: SearchMetadata
}

export type SearchMetadata = {
  query: string
  filters: Record<string, unknown>
  execution_time_ms: number
  performance_note?: string
  stats?: {
    total: number
    beginnerFriendly: number
    withMentorship: number
    embeddingCoverage: number
  }
}

export type ApiErrorResponse = {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
  request_id?: string
}

export type HealthResponse = {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  checks?: {
    database: {
      status: 'healthy' | 'degraded' | 'unhealthy'
      response_time_ms: number
      details?: string
    }
    memory: {
      status: 'healthy' | 'degraded' | 'unhealthy'
      usage_mb: number
      free_mb: number
    }
  }
}

export type SecurityHealthResponse = {
  timestamp: string
  status: 'healthy' | 'warning' | 'critical'
  services: {
    database: 'connected' | 'disconnected' | 'error'
    webauthn: 'available' | 'unavailable' | 'disabled'
    rateLimit: 'active' | 'inactive'
    securityHeaders: 'enabled' | 'disabled'
  }
  features: SecurityFeatures
  metrics?: {
    totalWebAuthnCredentials: number
    activeUserSessions: number
    recentSecurityEvents: number
  }
  configuration: {
    environment: string
    webauthnRpId: string
    securityLevel: 'basic' | 'enhanced' | 'enterprise'
  }
}

export type SecurityFeatures = {
  webauthnEnabled: boolean
  rateLimitingEnabled: boolean
  advancedMonitoringEnabled: boolean
  securityDashboardEnabled: boolean
}

export type AuthProvidersResponse = {
  github: {
    id: string
    name: string
    type: string
    signinUrl: string
    callbackUrl: string
  }
}

export type AuthSigninResponse = {
  url: string
  ok: boolean
}

export type MfaSettingsResponse = {
  success: boolean
  data: {
    totpEnabled: boolean
    webauthnEnabled: boolean
    backupCodes: number
    lastUsed: string | null
  }
}

export type WebAuthnRegistrationOptions = {
  challenge: string
  rp: {
    name: string
    id: string
  }
  user: {
    id: string
    name: string
    displayName: string
  }
  pubKeyCredParams: Array<{
    alg: number
    type: string
  }>
  timeout: number
  excludeCredentials: unknown[]
  authenticatorSelection: {
    authenticatorAttachment: string
    userVerification: string
  }
}

export type WebAuthnAuthenticationOptions = {
  challenge: string
  timeout: number
  allowCredentials: Array<{
    id: string
    type: string
    transports: string[]
  }>
  userVerification: string
}

export type WebAuthnVerificationResponse = {
  success: boolean
  credential?: {
    id: string
    type: string
    rawId: string
    response: {
      clientDataJSON: string
      attestationObject: string
    }
  }
  verified?: boolean
}
