/**
 * Repository Search API Route with Rate Limiting
 * Provides search functionality for GitHub repositories
 */

import { withRateLimit } from '@/lib/security/rate-limit-middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

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
export const GET = withRateLimit(async (req: NextRequest) => {
  try {
    // Parse search parameters
    const url = new URL(req.url)
    const params = Object.fromEntries(url.searchParams)

    // Validate input
    const validatedParams = searchSchema.parse({
      ...params,
      per_page: params.per_page ? Number.parseInt(params.per_page) : undefined,
      page: params.page ? Number.parseInt(params.page) : undefined,
    })

    // TODO: Implement actual GitHub search logic here
    // This is a placeholder response
    return NextResponse.json({
      total_count: 0,
      items: [],
      query: validatedParams,
      message: 'Repository search endpoint with rate limiting (60 req/min)',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid search parameters', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}, 'search') // Using 'search' rate limiter (60 req/min)
