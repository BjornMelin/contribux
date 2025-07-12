/**
 * Repository Search API Route with Rate Limiting
 * Provides search functionality for GitHub repositories
 */

import type { NextRequest } from 'next/server'
import { z } from 'zod'
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
    const { ErrorHandler } = require('@/lib/errors/enhanced-error-handler')
    throw ErrorHandler.createError(
      'INVALID_PARAMS',
      `Validation failed: ${parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      'validation',
      'low',
      {
        validationErrors: parseResult.error.errors,
        receivedParams: params,
      }
    )
  }

  return parseResult.data
}

// Utility function for building success response
const buildSuccessResponse = (
  validatedParams: RepositorySearchParams,
  requestContext: RequestContext
) => {
  return {
    total_count: 0,
    items: [],
    query: validatedParams,
    message: 'Repository search endpoint with enhanced rate limiting',
    correlationId: requestContext.timestamp,
    metadata: {
      timestamp: new Date().toISOString(),
      apiVersion: '1.0',
      rateLimit: {
        applied: true,
        policy: 'search',
      },
    },
  }
}

// Utility function for handling search errors
const handleSearchError = (
  error: unknown,
  request: NextRequest,
  requestContext: RequestContext
) => {
  const { ErrorHandler } = require('@/lib/errors/enhanced-error-handler')

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
    const { withEnhancedErrorHandling } = require('@/lib/errors/enhanced-error-handler')
    const { extractRequestContext } = require('@/lib/errors/error-utils')

    return withEnhancedErrorHandling(async (request: NextRequest) => {
      const requestContext = extractRequestContext(request)

      try {
        // Parse and validate search parameters
        const { searchParams } = new URL(request.url)
        const validatedParams = validateSearchParams(searchParams)

        // Build and return success response
        const responseData = buildSuccessResponse(validatedParams, requestContext)

        return Response.json(responseData, {
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
