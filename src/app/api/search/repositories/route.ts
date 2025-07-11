/**
 * Repository Search API Route with Rate Limiting
 * Provides search functionality for GitHub repositories
 */

import { type NextRequest, NextResponse } from 'next/server'
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

/**
 * GET /api/search/repositories
 * Search GitHub repositories with rate limiting
 */
export const GET = withRateLimit(
  async (req: NextRequest) => {
    const {
      withEnhancedErrorHandling,
      ErrorHandler,
    } = require('@/lib/errors/enhanced-error-handler')
    const { extractRequestContext } = require('@/lib/errors/error-utils')

    return withEnhancedErrorHandling(async (request: NextRequest) => {
      const requestContext = extractRequestContext(request)

      try {
        // Parse search parameters
        const url = new URL(request.url)
        const params = Object.fromEntries(url.searchParams)

        // Validate input with enhanced error handling
        const parseResult = searchSchema.safeParse({
          ...params,
          per_page: params.per_page ? Number.parseInt(params.per_page) : undefined,
          page: params.page ? Number.parseInt(params.page) : undefined,
        })

        if (!parseResult.success) {
          throw ErrorHandler.createError(
            'INVALID_PARAMS',
            parseResult.error.errors.map(e => e.message).join(', '),
            'validation',
            'low',
            { context: requestContext }
          )
        }

        const validatedParams = parseResult.data

        // TODO: Implement actual GitHub search logic here
        // This is a placeholder response
        return NextResponse.json({
          total_count: 0,
          items: [],
          query: validatedParams,
          message: 'Repository search endpoint with rate limiting (60 req/min)',
          correlationId: requestContext.timestamp, // Temporary correlation ID
        })
      } catch (error) {
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

        // Handle other errors
        const enhancedError = ErrorHandler.createError(
          'SEARCH_ERROR',
          'An error occurred while searching repositories.',
          'internal',
          'medium',
          {
            originalError: error,
            endpoint: '/api/search/repositories',
            context: {
              operation: 'repository_search',
              requestMethod: 'GET',
              ...requestContext,
            },
            actionableSteps: [
              'Try modifying your search query',
              'Check if all search parameters are valid',
              'Contact support if the issue persists',
            ],
            developmentDetails: `Repository search failed: ${error instanceof Error ? error.message : String(error)}`,
            documentationLinks: ['/docs/api/search#repositories'],
          }
        )

        ErrorHandler.logError(enhancedError, request)
        return ErrorHandler.toHttpResponse(enhancedError)
      }
    })(req)
  },
  { limiterType: 'search' }
) // Using 'search' rate limiter (60 req/min)
