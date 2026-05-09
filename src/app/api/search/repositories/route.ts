/**
 * Repository Search API Route with Rate Limiting
 * Provides search functionality for GitHub repositories
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ErrorHandler, withEnhancedErrorHandling } from '@/lib/errors/enhanced-error-handler'
import { extractRequestContext } from '@/lib/errors/error-utils'
import { withRateLimit } from '@/lib/security/rate-limit-middleware'

// Search query schema
const searchSchema = z.object({
  q: z.string().min(1).max(100),
  language: z.string().optional(),
  sort: z.enum(['stars', 'forks', 'updated']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  per_page: z.number().min(1).max(100).optional().default(30),
  page: z.number().min(1).optional().default(1),
})

// Request context interface
interface RequestContext {
  timestamp: string
  userAgent?: string
  ip?: string
  [key: string]: unknown
}

// Repository search parameters interface
interface RepositorySearchParams {
  q: string
  language?: string
  sort?: 'stars' | 'forks' | 'updated'
  order?: 'asc' | 'desc'
  per_page: number
  page: number
}

const demoRepositories = [
  {
    id: 'demo-react',
    githubId: 10270250,
    fullName: 'facebook/react',
    name: 'react',
    owner: 'facebook',
    description: 'The library for web and native user interfaces.',
    metadata: {
      language: 'JavaScript',
      stars: 238000,
      forks: 49000,
      topics: ['react', 'ui', 'javascript'],
      defaultBranch: 'main',
    },
    healthMetrics: {
      overallScore: 96,
      maintainerResponsiveness: 92,
      activityLevel: 98,
    },
    createdAt: '2013-05-24T16:15:54Z',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-typescript',
    githubId: 20929025,
    fullName: 'microsoft/TypeScript',
    name: 'TypeScript',
    owner: 'microsoft',
    description: 'TypeScript is a superset of JavaScript that compiles to clean JavaScript output.',
    metadata: {
      language: 'TypeScript',
      stars: 104000,
      forks: 13000,
      topics: ['typescript', 'javascript', 'compiler'],
      defaultBranch: 'main',
    },
    healthMetrics: {
      overallScore: 94,
      maintainerResponsiveness: 90,
      activityLevel: 95,
    },
    createdAt: '2014-06-17T15:28:39Z',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-nextjs',
    githubId: 70107786,
    fullName: 'vercel/next.js',
    name: 'next.js',
    owner: 'vercel',
    description: 'The React framework for production.',
    metadata: {
      language: 'JavaScript',
      stars: 135000,
      forks: 29000,
      topics: ['react', 'nextjs', 'framework'],
      defaultBranch: 'canary',
    },
    healthMetrics: {
      overallScore: 95,
      maintainerResponsiveness: 91,
      activityLevel: 97,
    },
    createdAt: '2016-10-05T23:32:51Z',
    updatedAt: new Date().toISOString(),
  },
]

function searchDemoRepositories(validatedParams: RepositorySearchParams) {
  const normalizedQuery = validatedParams.q.toLowerCase()
  const language = validatedParams.language?.toLowerCase()

  const filteredRepositories = demoRepositories.filter(repository => {
    const matchesQuery =
      repository.fullName.toLowerCase().includes(normalizedQuery) ||
      repository.description.toLowerCase().includes(normalizedQuery) ||
      repository.metadata.topics.some(topic => topic.includes(normalizedQuery))

    const matchesLanguage =
      !language || repository.metadata.language.toLowerCase() === language.toLowerCase()

    return matchesQuery && matchesLanguage
  })

  const startIndex = (validatedParams.page - 1) * validatedParams.per_page
  const endIndex = validatedParams.page * validatedParams.per_page

  return {
    repositories: filteredRepositories.slice(startIndex, endIndex),
    totalCount: filteredRepositories.length,
    hasMore: endIndex < filteredRepositories.length,
  }
}

/**
 * GET /api/search/repositories
 * Search GitHub repositories with rate limiting
 */
// Utility function for validating search parameters
const validateSearchParams = (searchParams: URLSearchParams) => {
  const params = Object.fromEntries(searchParams)

  const parseResult = searchSchema.safeParse({
    ...params,
    per_page: params.per_page ? Number.parseInt(params.per_page, 10) : undefined,
    page: params.page ? Number.parseInt(params.page, 10) : undefined,
  })

  if (!parseResult.success) {
    throw parseResult.error
  }

  return parseResult.data
}

// Utility function for building success response
const buildSuccessResponse = (
  validatedParams: RepositorySearchParams,
  requestContext: RequestContext
) => {
  const { repositories, totalCount, hasMore } = searchDemoRepositories(validatedParams)

  return {
    success: true,
    data: {
      repositories,
      total_count: totalCount,
      page: validatedParams.page,
      per_page: validatedParams.per_page,
      has_more: hasMore,
    },
    metadata: {
      query: validatedParams.q,
      filters: validatedParams,
      execution_time_ms: 0,
      request_id: requestContext.timestamp,
    },
  }
}

// Utility function for handling search errors
const handleSearchError = (
  error: unknown,
  request: NextRequest,
  requestContext: RequestContext
) => {
  if (error instanceof z.ZodError) {
    const enhancedError = ErrorHandler.createValidationError(error, {
      endpoint: '/api/search/repositories',
      operation: 'repository_search',
      requestMethod: 'GET',
      ...requestContext,
    })
    ErrorHandler.logError(enhancedError, request)
    return ErrorHandler.toHttpResponse(enhancedError)
  }

  const enhancedError = ErrorHandler.createError(
    'SEARCH_ERROR',
    'Repository search temporarily unavailable. Please try again.',
    'internal',
    'medium',
    {
      originalError: error,
      endpoint: '/api/search/repositories',
      context: {
        operation: 'repository_search',
        requestMethod: 'GET',
        userAgent: request.headers.get('user-agent'),
        ...requestContext,
      },
      actionableSteps: [
        'Verify your search parameters are valid',
        'Try simplifying your search query',
        'Check our status page for known issues',
        'Contact support if the issue persists',
      ],
      developmentDetails:
        process.env.NODE_ENV === 'development'
          ? `Repository search failed: ${error instanceof Error ? error.message : String(error)}`
          : undefined,
      documentationLinks: [
        '/docs/api/search#repositories',
        '/docs/api/rate-limits',
        '/docs/troubleshooting',
      ],
    }
  )

  ErrorHandler.logError(enhancedError, request)
  return ErrorHandler.toHttpResponse(enhancedError)
}
export const GET = withRateLimit(
  async (req: NextRequest) => {
    return withEnhancedErrorHandling(async (request: NextRequest) => {
      const extractedContext = extractRequestContext(request)
      const requestContext: RequestContext = {
        ...extractedContext,
        timestamp: String(extractedContext.timestamp),
        userAgent:
          typeof extractedContext.userAgent === 'string' ? extractedContext.userAgent : undefined,
        ip: typeof extractedContext.ip === 'string' ? extractedContext.ip : undefined,
      }

      try {
        // Parse and validate search parameters
        const { searchParams } = new URL(request.url)
        const validatedParams = validateSearchParams(searchParams)

        // Build and return success response
        const responseData = buildSuccessResponse(validatedParams, requestContext)

        return NextResponse.json(responseData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
            'X-Request-ID': requestContext.timestamp,
            'X-API-Version': '1.0',
          },
        })
      } catch (error) {
        return handleSearchError(error, request, requestContext)
      }
    })(req)
  },
  { limiterType: 'search' }
) // Enhanced search rate limiter with 60 req/min // Enhanced search rate limiter with 60 req/min // Using 'search' rate limiter (60 req/min)
