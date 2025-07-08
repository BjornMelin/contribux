/**
 * Example GitHub API Route with Distributed Rate Limiting
 * Demonstrates how to use Upstash Redis rate limiting in API routes
 */

import { withRateLimit } from '@/lib/security/rate-limit-middleware'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/github/example
 * Example endpoint showing rate limiting integration
 */
export const GET = withRateLimit(async (_req: NextRequest) => {
  try {
    // Your API logic here
    return NextResponse.json({
      message: 'GitHub API endpoint example',
      timestamp: new Date().toISOString(),
      // In a real implementation, this would fetch GitHub data
      data: {
        example: 'This endpoint is rate limited to 1000 requests per hour',
      },
    })
  } catch (_error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}, 'api') // Using 'api' rate limiter (1000 req/hour)
