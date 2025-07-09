/**
 * Demo Rate Limit API Route
 * Demonstrates rate limiting behavior with real-time feedback
 */

import { checkApiRateLimit } from '@/lib/security/rate-limit-middleware'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/demo/rate-limit
 * Test endpoint to demonstrate rate limiting
 */
export async function GET(req: NextRequest) {
  // Check rate limit with detailed result
  const { allowed, headers } = await checkApiRateLimit(req, 'api')

  // Parse rate limit info from headers
  const limit = Number.parseInt(headers['X-RateLimit-Limit'] || '0')
  const remaining = Number.parseInt(headers['X-RateLimit-Remaining'] || '0')
  const reset = headers['X-RateLimit-Reset']
  const retryAfter = headers['Retry-After']

  // Calculate percentage used
  const percentageUsed = limit > 0 ? ((limit - remaining) / limit) * 100 : 0

  if (!allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: 'You have exceeded the rate limit. Please try again later.',
        rateLimit: {
          limit,
          remaining: 0,
          used: limit,
          percentageUsed: 100,
          resetAt: reset,
          retryAfter: Number.parseInt(retryAfter || '0'),
        },
        tip: 'Rate limits reset on a sliding window. Wait for the retry-after period.',
      },
      {
        status: 429,
        headers,
      }
    )
  }

  // Success response with rate limit info
  return NextResponse.json(
    {
      success: true,
      message: `Request successful! You have ${remaining} requests remaining.`,
      timestamp: new Date().toISOString(),
      rateLimit: {
        limit,
        remaining,
        used: limit - remaining,
        percentageUsed: percentageUsed.toFixed(1),
        resetAt: reset,
      },
      demo: {
        endpoint: '/api/demo/rate-limit',
        limiter: 'api',
        description: 'This endpoint is limited to 1000 requests per hour',
      },
    },
    {
      headers,
    }
  )
}
