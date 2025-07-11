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
        // Parse search parameters with Next.js 15 URL handling
        const { searchParams } = new URL(request.url)
        const params = Object.fromEntries(searchParams)

        // Enhanced validation with better error messages
        const parseResult = searchSchema.safeParse({
          ...params,
          per_page: params.per_page ? Number.parseInt(params.per_page, 10) : undefined,
          page: params.page ? Number.parseInt(params.page, 10) : undefined,
        })

        if (!parseResult.success) {
          throw ErrorHandler.createError(
            'INVALID_PARAMS',
            `Validation failed: ${parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            'validation',
            'low',
            {
              context: requestContext,
              validationErrors: parseResult.error.errors,
              receivedParams: params,
            }
          )
        }

        const validatedParams = parseResult.data

        // Enhanced response with Next.js 15 features
        const responseData = {
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

        // Use Next.js 15 Response.json() for better performance
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

        // Enhanced error handling with structured logging
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
    })(req)
  },
  { limiterType: 'search' }
) // Enhanced search rate limiter with 60 req/min // Using 'search' rate limiter (60 req/min)
