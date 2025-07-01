/**
 * Comprehensive API Endpoints Test Suite
 * Tests all API endpoints with MSW mocking and comprehensive scenarios
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  type ApiErrorResponse,
  type AuthProvidersResponse,
  type AuthSigninResponse,
  apiResponseFactory,
  authResponseFactory,
  type HealthResponse,
  type MfaSettingsResponse,
  repositoryFactory,
  type SecurityHealthResponse,
  userFactory,
  type WebAuthnVerificationResponse,
  webauthnFactory,
} from './api-test-factories'

// Enable MSW mode
beforeAll(() => {
  global.__enableMSW?.()
})

afterAll(() => {
  global.__disableMSW?.()
})

// Response schemas for validation
const SearchOpportunitiesResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    opportunities: z.array(
      z.object({
        id: z.string().uuid(),
        repositoryId: z.string().uuid().nullable(),
        issueNumber: z.number().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        url: z.string().nullable(),
        metadata: z.object({}).optional(),
        difficultyScore: z.number(),
        impactScore: z.number(),
        matchScore: z.number(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    ),
    total_count: z.number(),
    page: z.number(),
    per_page: z.number(),
    has_more: z.boolean(),
  }),
  metadata: z.object({
    query: z.string(),
    filters: z.record(z.any()),
    execution_time_ms: z.number(),
  }),
})

const _ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  request_id: z.string().optional(),
})

// Request body types for MSW handlers
interface CredentialRequestBody {
  credential?: {
    id: string
    type: string
  }
}

interface SigninRequestBody {
  provider?: string
  callbackUrl?: string
}

interface ProviderRequestBody {
  provider?: string
}

interface MfaEnrollRequestBody {
  type?: string
}

interface MfaVerifyRequestBody {
  code?: string
  credential?: unknown
}

// Mock server setup
const BASE_URL = 'http://localhost:3000'

const server = setupServer(
  // Health endpoints
  http.get(`${BASE_URL}/api/health`, () => {
    return HttpResponse.json(apiResponseFactory.createHealthResponse('healthy'))
  }),

  http.get(`${BASE_URL}/api/simple-health`, () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
  }),

  http.get(`${BASE_URL}/api/performance`, () => {
    return HttpResponse.json({
      performance: {
        memory: { used: 128, total: 512 },
        uptime: 3600,
        responseTime: 42,
      },
      timestamp: new Date().toISOString(),
    })
  }),

  // Security endpoints
  http.get(`${BASE_URL}/api/security/health`, () => {
    return HttpResponse.json(apiResponseFactory.createSecurityHealthResponse())
  }),

  // WebAuthn endpoints
  http.post(`${BASE_URL}/api/security/webauthn/register/options`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    return HttpResponse.json({
      success: true,
      options: webauthnFactory.createRegistrationOptions(),
    })
  }),

  http.post(`${BASE_URL}/api/security/webauthn/register/verify`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const body = (await request.json()) as CredentialRequestBody
    if (!body.credential) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Missing credential', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json(webauthnFactory.createVerificationResponse(true))
  }),

  http.post(`${BASE_URL}/api/security/webauthn/authenticate/options`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    return HttpResponse.json({
      success: true,
      options: webauthnFactory.createAuthenticationOptions(),
    })
  }),

  http.post(`${BASE_URL}/api/security/webauthn/authenticate/verify`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const body = (await request.json()) as CredentialRequestBody
    if (!body.credential) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Missing credential', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json(webauthnFactory.createVerificationResponse(true))
  }),

  // Search endpoints
  http.get(`${BASE_URL}/api/search/opportunities`, ({ request }) => {
    const url = new URL(request.url)
    const authHeader = request.headers.get('authorization')

    // Check authentication
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const query = url.searchParams.get('q') || ''
    const pageParam = url.searchParams.get('page')
    const perPageParam = url.searchParams.get('per_page')
    const difficulty = url.searchParams.get('difficulty')
    const repositoryId = url.searchParams.get('repository_id')

    // Parse and validate page parameter
    const page = pageParam ? Number(pageParam) : 1
    if (pageParam && (Number.isNaN(page) || page < 1)) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse(
          'INVALID_PARAMETER',
          'Page must be greater than 0',
          400
        ),
        { status: 400 }
      )
    }

    // Parse and validate per_page parameter
    const perPage = perPageParam ? Number(perPageParam) : 20
    if (perPageParam && (Number.isNaN(perPage) || perPage < 1 || perPage > 100)) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse(
          'INVALID_PARAMETER',
          'per_page must be between 1 and 100',
          400
        ),
        { status: 400 }
      )
    }

    if (difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse(
          'INVALID_PARAMETER',
          'Invalid difficulty level',
          400
        ),
        { status: 400 }
      )
    }

    if (
      repositoryId &&
      !repositoryId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    ) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse(
          'INVALID_PARAMETER',
          'Invalid repository ID format',
          400
        ),
        { status: 400 }
      )
    }

    // Create test opportunities
    let opportunities = repositoryFactory.createMultipleOpportunities(5)

    // Apply filters
    if (query) {
      opportunities = opportunities.filter(
        op =>
          op.title.toLowerCase().includes(query.toLowerCase()) ||
          op.description?.toLowerCase().includes(query.toLowerCase())
      )
    }

    if (difficulty) {
      opportunities = opportunities.filter(op => op.metadata.difficulty === difficulty)
    }

    if (repositoryId) {
      opportunities = opportunities.filter(op => op.repositoryId === repositoryId)
    }

    // Apply pagination
    const offset = (page - 1) * perPage
    const paginatedOpportunities = opportunities.slice(offset, offset + perPage)

    return HttpResponse.json(
      apiResponseFactory.createSearchOpportunitiesResponse(paginatedOpportunities, {
        query,
        filters: { difficulty, repository_id: repositoryId },
      })
    )
  }),

  http.get(`${BASE_URL}/api/search/repositories`, ({ request }) => {
    const url = new URL(request.url)
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const query = url.searchParams.get('q') || ''
    const language = url.searchParams.get('language')
    const page = Number(url.searchParams.get('page')) || 1
    const perPage = Number(url.searchParams.get('per_page')) || 20

    let repositories = [
      repositoryFactory.createRepository(),
      repositoryFactory.createRepository({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'another-repo',
        fullName: 'test-user/another-repo',
        language: 'JavaScript',
      }),
    ]

    if (query) {
      repositories = repositories.filter(
        repo =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          repo.description?.toLowerCase().includes(query.toLowerCase())
      )
    }

    if (language) {
      repositories = repositories.filter(repo => repo.language === language)
    }

    return HttpResponse.json({
      success: true,
      data: {
        repositories,
        total_count: repositories.length,
        page,
        per_page: perPage,
        has_more: false,
      },
      metadata: {
        query,
        filters: { language },
        execution_time_ms: 35,
      },
    })
  }),

  http.get(`${BASE_URL}/api/search/error`, () => {
    return HttpResponse.json(
      apiResponseFactory.createErrorResponse(
        'SEARCH_ERROR',
        'Search service temporarily unavailable',
        503
      ),
      { status: 503 }
    )
  }),

  // Authentication endpoints
  http.get(`${BASE_URL}/api/auth/session`, ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(userFactory.createSession())
    }

    return HttpResponse.json(null, { status: 200 })
  }),

  http.get(`${BASE_URL}/api/auth/providers`, () => {
    return HttpResponse.json(authResponseFactory.createProvidersResponse())
  }),

  http.post(`${BASE_URL}/api/auth/signin`, async ({ request }) => {
    const body = (await request.json()) as SigninRequestBody

    if (!body.provider) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Provider is required', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json(authResponseFactory.createSigninResponse())
  }),

  http.get(`${BASE_URL}/api/auth/primary-provider`, ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    return HttpResponse.json({
      success: true,
      data: {
        provider: 'github',
        providerId: '123456789',
        email: 'test@example.com',
        isPrimary: true,
      },
    })
  }),

  http.post(`${BASE_URL}/api/auth/set-primary`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const body = (await request.json()) as ProviderRequestBody

    if (!body.provider) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Provider is required', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json({
      success: true,
      message: 'Primary provider updated successfully',
    })
  }),

  http.get(`${BASE_URL}/api/auth/can-unlink`, ({ request }) => {
    const url = new URL(request.url)
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const provider = url.searchParams.get('provider')

    if (!provider) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Provider is required', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json({
      success: true,
      data: {
        canUnlink: true,
        reason: null,
      },
    })
  }),

  http.post(`${BASE_URL}/api/auth/unlink`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const body = (await request.json()) as ProviderRequestBody

    if (!body.provider) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Provider is required', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json({
      success: true,
      message: 'Account unlinked successfully',
    })
  }),

  // MFA endpoints
  http.get(`${BASE_URL}/api/auth/mfa/settings`, ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    return HttpResponse.json(authResponseFactory.createMfaSettingsResponse(false))
  }),

  http.post(`${BASE_URL}/api/auth/mfa/enroll`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const body = (await request.json()) as MfaEnrollRequestBody

    if (!body.type || !['totp', 'webauthn'].includes(body.type)) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_PARAMETER', 'Invalid MFA type', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json({
      success: true,
      data: {
        type: body.type,
        enrollmentId: 'enroll_123456789',
        qrCode:
          body.type === 'totp' ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA...' : undefined,
        secret: body.type === 'totp' ? 'JBSWY3DPEHPK3PXP' : undefined,
        challenge:
          body.type === 'webauthn' ? webauthnFactory.createRegistrationOptions() : undefined,
      },
    })
  }),

  http.post(`${BASE_URL}/api/auth/mfa/verify`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('UNAUTHORIZED', 'Authentication required', 401),
        { status: 401 }
      )
    }

    const body = (await request.json()) as MfaVerifyRequestBody

    if (!body.code && !body.credential) {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse(
          'INVALID_PARAMETER',
          'Code or credential is required',
          400
        ),
        { status: 400 }
      )
    }

    // Simulate verification failure for specific codes
    if (body.code === '000000') {
      return HttpResponse.json(
        apiResponseFactory.createErrorResponse('INVALID_CODE', 'Invalid verification code', 400),
        { status: 400 }
      )
    }

    return HttpResponse.json({
      success: true,
      data: {
        verified: true,
        backupCodes: ['ABC123', 'DEF456', 'GHI789'],
      },
    })
  }),

  // Error handlers for unsupported methods
  http.post(`${BASE_URL}/api/security/health`, () => {
    return new HttpResponse(null, { status: 405 })
  }),

  http.put(`${BASE_URL}/api/security/health`, () => {
    return new HttpResponse(null, { status: 405 })
  }),

  http.delete(`${BASE_URL}/api/security/health`, () => {
    return new HttpResponse(null, { status: 405 })
  })
)

describe('Comprehensive API Endpoints Test Suite', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  describe('Health Endpoints', () => {
    it('should return health status from /api/health', async () => {
      const response = await fetch(`${BASE_URL}/api/health`)
      expect(response.status).toBe(200)

      const data = (await response.json()) as HealthResponse
      expect(data.status).toBe('healthy')
      expect(data.timestamp).toBeDefined()
      expect(data.version).toBe('1.0.0')
    })

    it('should return simple health status from /api/simple-health', async () => {
      const response = await fetch(`${BASE_URL}/api/simple-health`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('ok')
      expect(data.timestamp).toBeDefined()
    })

    it('should return performance metrics from /api/performance', async () => {
      const response = await fetch(`${BASE_URL}/api/performance`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.performance).toBeDefined()
      expect(data.performance.memory).toBeDefined()
      expect(data.performance.uptime).toBeGreaterThan(0)
    })
  })

  describe('Security Endpoints', () => {
    it('should return security health status', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      expect(response.status).toBe(200)

      const data = (await response.json()) as SecurityHealthResponse
      expect(data.status).toBe('healthy')
      expect(data.services.database).toBe('connected')
      expect(data.features.webauthnEnabled).toBe(true)
    })

    it('should reject unsupported HTTP methods on security health', async () => {
      const postResponse = await fetch(`${BASE_URL}/api/security/health`, { method: 'POST' })
      expect(postResponse.status).toBe(405)

      const putResponse = await fetch(`${BASE_URL}/api/security/health`, { method: 'PUT' })
      expect(putResponse.status).toBe(405)

      const deleteResponse = await fetch(`${BASE_URL}/api/security/health`, { method: 'DELETE' })
      expect(deleteResponse.status).toBe(405)
    })
  })

  describe('WebAuthn Endpoints', () => {
    const authHeaders = { authorization: 'Bearer test-token' }

    it('should generate WebAuthn registration options', async () => {
      const response = await fetch(`${BASE_URL}/api/security/webauthn/register/options`, {
        method: 'POST',
        headers: authHeaders,
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.options.challenge).toBeDefined()
      expect(data.options.rp.name).toBe('Contribux')
    })

    it('should verify WebAuthn registration', async () => {
      const response = await fetch(`${BASE_URL}/api/security/webauthn/register/verify`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          credential: { id: 'test-credential', type: 'public-key' },
        }),
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as WebAuthnVerificationResponse
      expect(data.success).toBe(true)
      expect(data.verified).toBe(true)
    })

    it('should generate WebAuthn authentication options', async () => {
      const response = await fetch(`${BASE_URL}/api/security/webauthn/authenticate/options`, {
        method: 'POST',
        headers: authHeaders,
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.options.challenge).toBeDefined()
    })

    it('should verify WebAuthn authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/security/webauthn/authenticate/verify`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          credential: { id: 'test-credential', type: 'public-key' },
        }),
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as WebAuthnVerificationResponse
      expect(data.success).toBe(true)
      expect(data.verified).toBe(true)
    })

    it('should require authentication for WebAuthn endpoints', async () => {
      const endpoints = [
        '/api/security/webauthn/register/options',
        '/api/security/webauthn/register/verify',
        '/api/security/webauthn/authenticate/options',
        '/api/security/webauthn/authenticate/verify',
      ]

      for (const endpoint of endpoints) {
        const response = await fetch(`${BASE_URL}${endpoint}`, { method: 'POST' })
        expect(response.status).toBe(401)

        const data = (await response.json()) as ApiErrorResponse
        expect(data.success).toBe(false)
        expect(data.error.code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('Search Endpoints', () => {
    const authHeaders = { authorization: 'Bearer test-token' }

    it('should search opportunities with authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?q=TypeScript`, {
        headers: authHeaders,
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      const validated = SearchOpportunitiesResponseSchema.parse(data)
      expect(validated.success).toBe(true)
      expect(validated.metadata.query).toBe('TypeScript')
    })

    it('should validate search opportunity parameters', async () => {
      // Test invalid page
      const invalidPageResponse = await fetch(`${BASE_URL}/api/search/opportunities?page=0`, {
        headers: authHeaders,
      })
      expect(invalidPageResponse.status).toBe(400)

      // Test invalid per_page
      const invalidPerPageResponse = await fetch(
        `${BASE_URL}/api/search/opportunities?per_page=150`,
        {
          headers: authHeaders,
        }
      )
      expect(invalidPerPageResponse.status).toBe(400)

      // Test invalid difficulty
      const invalidDifficultyResponse = await fetch(
        `${BASE_URL}/api/search/opportunities?difficulty=invalid`,
        {
          headers: authHeaders,
        }
      )
      expect(invalidDifficultyResponse.status).toBe(400)

      // Test invalid repository ID
      const invalidRepoIdResponse = await fetch(
        `${BASE_URL}/api/search/opportunities?repository_id=invalid`,
        {
          headers: authHeaders,
        }
      )
      expect(invalidRepoIdResponse.status).toBe(400)
    })

    it('should search repositories with filters', async () => {
      const response = await fetch(
        `${BASE_URL}/api/search/repositories?q=test&language=TypeScript`,
        {
          headers: authHeaders,
        }
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.repositories).toBeDefined()
      expect(data.metadata.query).toBe('test')
    })

    it('should require authentication for search endpoints', async () => {
      const endpoints = ['/api/search/opportunities', '/api/search/repositories']

      for (const endpoint of endpoints) {
        const response = await fetch(`${BASE_URL}${endpoint}`)
        expect(response.status).toBe(401)

        const data = (await response.json()) as ApiErrorResponse
        expect(data.success).toBe(false)
        expect(data.error.code).toBe('UNAUTHORIZED')
      }
    })

    it('should handle search service errors', async () => {
      const response = await fetch(`${BASE_URL}/api/search/error`)
      expect(response.status).toBe(503)

      const data = (await response.json()) as ApiErrorResponse
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('SEARCH_ERROR')
    })
  })

  describe('Authentication Endpoints', () => {
    it('should return session when authenticated', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/session`, {
        headers: { authorization: 'Bearer test-token' },
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.user).toBeDefined()
      expect(data.user.email).toBe('test@example.com')
      expect(data.expires).toBeDefined()
    })

    it('should return null session when not authenticated', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/session`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toBeNull()
    })

    it('should return available providers', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/providers`)
      expect(response.status).toBe(200)

      const data = (await response.json()) as AuthProvidersResponse
      expect(data.github).toBeDefined()
      expect(data.github.id).toBe('github')
      expect(data.github.name).toBe('GitHub')
    })

    it('should handle signin requests', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'github',
          callbackUrl: 'http://localhost:3000/dashboard',
        }),
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as AuthSigninResponse
      expect(data.url).toBe('http://localhost:3000/dashboard')
      expect(data.ok).toBe(true)
    })

    it('should validate signin parameters', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(response.status).toBe(400)

      const data = (await response.json()) as ApiErrorResponse
      expect(data.error.code).toBe('INVALID_PARAMETER')
    })
  })

  describe('Account Management Endpoints', () => {
    const authHeaders = { authorization: 'Bearer test-token' }

    it('should get primary provider', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/primary-provider`, {
        headers: authHeaders,
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.provider).toBe('github')
      expect(data.data.isPrimary).toBe(true)
    })

    it('should set primary provider', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/set-primary`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'github' }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should check if account can be unlinked', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/can-unlink?provider=github`, {
        headers: authHeaders,
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.canUnlink).toBe(true)
    })

    it('should unlink account', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/unlink`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'github' }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('MFA Endpoints', () => {
    const authHeaders = { authorization: 'Bearer test-token' }

    it('should get MFA settings', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/mfa/settings`, {
        headers: authHeaders,
      })
      expect(response.status).toBe(200)

      const data = (await response.json()) as MfaSettingsResponse
      expect(data.success).toBe(true)
      expect(data.data.totpEnabled).toBeDefined()
      expect(data.data.webauthnEnabled).toBeDefined()
    })

    it('should enroll in TOTP MFA', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/mfa/enroll`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'totp' }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.type).toBe('totp')
      expect(data.data.qrCode).toBeDefined()
      expect(data.data.secret).toBeDefined()
    })

    it('should enroll in WebAuthn MFA', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/mfa/enroll`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'webauthn' }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.type).toBe('webauthn')
      expect(data.data.challenge).toBeDefined()
    })

    it('should verify MFA code', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.verified).toBe(true)
      expect(data.data.backupCodes).toBeDefined()
    })

    it('should handle invalid MFA code', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ code: '000000' }),
      })
      expect(response.status).toBe(400)

      const data = (await response.json()) as ApiErrorResponse
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('INVALID_CODE')
    })

    it('should validate MFA enrollment type', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/mfa/enroll`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'invalid' }),
      })
      expect(response.status).toBe(400)

      const data = (await response.json()) as ApiErrorResponse
      expect(data.error.code).toBe('INVALID_PARAMETER')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid json',
      })
      expect([400, 500]).toContain(response.status)
    })

    it('should return proper content-type headers', async () => {
      const response = await fetch(`${BASE_URL}/api/health`)
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () => fetch(`${BASE_URL}/api/health`))

      const responses = await Promise.all(requests)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })

    it('should validate request IDs in error responses', async () => {
      const response = await fetch(`${BASE_URL}/api/search/error`)
      const data = (await response.json()) as ApiErrorResponse

      expect(data.request_id).toBeDefined()
      expect(data.request_id).toMatch(/^req_\d+_[a-z0-9]+$/)
    })
  })
})
