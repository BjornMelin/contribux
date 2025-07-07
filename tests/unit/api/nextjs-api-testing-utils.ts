/**
 * Next.js API Route Testing Utilities
 * Provides utilities for testing Next.js API routes directly without HTTP calls
 */

import { NextRequest, type NextResponse } from 'next/server'
import { vi } from 'vitest'

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(url: string, options: RequestInit = {}): NextRequest {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`

  return new NextRequest(
    new Request(fullUrl, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
      },
      ...options,
    })
  )
}

/**
 * Test an API route handler function directly with better error handling
 */
export async function testApiRoute(
  handler: (request: NextRequest) => Promise<NextResponse | Response>,
  request: NextRequest
): Promise<{
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
  headers: Headers
}> {
  try {
    const response = await handler(request)

    return {
      status: response.status,
      json: async () => {
        try {
          const text = await response.text()
          return text ? JSON.parse(text) : {}
        } catch (error) {
          console.error('Failed to parse JSON response:', error)
          return {}
        }
      },
      text: async () => {
        try {
          return await response.text()
        } catch (error) {
          console.error('Failed to get text response:', error)
          return ''
        }
      },
      headers: response.headers,
    }
  } catch (error) {
    console.error('Route handler error:', error)

    // Return a mock error response for test consistency
    return {
      status: 500,
      json: async () => ({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      }),
      text: async () =>
        JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        }),
      headers: new Headers({ 'content-type': 'application/json' }),
    }
  }
}

/**
 * Create mock Next.js environment
 */
export function setupNextjsTestEnvironment() {
  // Mock Next.js headers
  vi.mock('next/headers', () => ({
    headers: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue('application/json'),
    }),
    cookies: vi.fn().mockReturnValue({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }),
  }))

  // Mock Next.js server utilities
  vi.mock('next/server', async () => {
    const actual = await vi.importActual('next/server')
    return {
      ...actual,
      NextResponse: {
        json: vi.fn().mockImplementation((data, init) => {
          const response = new Response(JSON.stringify(data), {
            status: init?.status || 200,
            headers: {
              'content-type': 'application/json',
              ...init?.headers,
            },
          })
          return response
        }),
        redirect: vi.fn().mockImplementation((url, status = 302) => {
          return new Response(null, {
            status,
            headers: {
              location: url,
            },
          })
        }),
      },
    }
  })
}

/**
 * Mock NextAuth API for testing
 */
export function mockNextAuthApi() {
  vi.mock('@/lib/auth', () => ({
    handlers: {
      GET: vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ message: 'NextAuth GET handler' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
      POST: vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ message: 'NextAuth POST handler' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    },
    auth: vi.fn().mockResolvedValue({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  }))
}

/**
 * Create a mock database client for API route testing with proper sql.unsafe support
 */
interface MockSqlFunction {
  (template: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  unsafe?: (query: string) => Promise<unknown[]>
}

export function createMockDatabaseClient() {
  const mockSql = vi
    .fn()
    .mockImplementation((template: TemplateStringsArray, ..._values: unknown[]) => {
      // Mock different database responses based on the query
      const query = template.join('?')

      if (query.includes('SELECT 1 as health_check')) {
        return Promise.resolve([{ health_check: 1 }])
      }

      if (query.includes('opportunities')) {
        return Promise.resolve([
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            repository_id: '550e8400-e29b-41d4-a716-446655440000',
            title: 'Fix TypeScript type errors',
            description: 'Several type errors need to be fixed',
            type: 'bug_fix',
            difficulty: 'intermediate',
            priority: 1,
            required_skills: ['TypeScript', 'debugging'],
            technologies: ['TypeScript', 'Node.js'],
            good_first_issue: false,
            help_wanted: true,
            estimated_hours: 4,
            created_at: '2023-06-01T12:00:00Z',
            relevance_score: 0.95,
          },
        ])
      }

      if (query.includes('repositories')) {
        return Promise.resolve([
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            github_id: 998877,
            full_name: 'test-org/search-engine',
            name: 'search-engine',
            description: 'A powerful search engine with AI capabilities',
            language: 'TypeScript',
            topics: ['search', 'ai', 'typescript'],
            stars_count: 1250,
            health_score: 88.5,
            activity_score: 92.0,
            first_time_contributor_friendly: true,
            created_at: '2023-01-01T00:00:00Z',
            relevance_score: 0.92,
          },
        ])
      }

      return Promise.resolve([])
    })

  // Add the unsafe method that the API routes use
  ;(mockSql as MockSqlFunction).unsafe = vi.fn().mockImplementation((query: string) => {
    // Handle dynamic SQL queries used by the search opportunities route
    if (query.includes('COUNT')) {
      return Promise.resolve([{ total: 2 }])
    }

    if (query.includes('opportunities')) {
      return Promise.resolve([
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          repository_id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Fix TypeScript type errors in search module',
          description: 'Several type errors need to be fixed in the search functionality',
          type: 'bug_fix',
          difficulty: 'intermediate',
          priority: 1,
          required_skills: ['TypeScript', 'debugging'],
          technologies: ['TypeScript'],
          good_first_issue: false,
          help_wanted: true,
          estimated_hours: 4,
          created_at: '2023-06-01T12:00:00Z',
          relevance_score: 0.5,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          repository_id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Add AI-powered search capabilities',
          description: 'Implement vector search using embeddings for better search results',
          type: 'feature',
          difficulty: 'advanced',
          priority: 2,
          required_skills: ['AI/ML', 'PostgreSQL', 'vector-search'],
          technologies: ['Python'],
          good_first_issue: false,
          help_wanted: false,
          estimated_hours: 16,
          created_at: '2023-06-01T10:00:00Z',
          relevance_score: 0.5,
        },
      ])
    }

    return Promise.resolve([])
  })

  return {
    sql: mockSql,
  }
}

/**
 * Setup environment variables for testing
 */
export function setupTestEnvironment() {
  // NODE_ENV is already set to 'test' by the test runner
  process.env.NEXTAUTH_SECRET = 'secure-test-token-32chars-minimum'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
}

/**
 * Clean up test environment
 */
export function cleanupTestEnvironment() {
  vi.clearAllMocks()
  vi.resetAllMocks()
}
