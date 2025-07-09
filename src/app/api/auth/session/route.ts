/**
 * Session API Endpoint
 * Returns the current session status for demo authentication with rate limiting
 */

import {
  applyProgressiveDelay,
  checkAuthRateLimit,
  createRateLimitResponse,
  recordAuthResult,
} from '@/lib/security/auth-rate-limiting'
import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Apply authentication rate limiting
  const rateLimitResult = checkAuthRateLimit(request)
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(
      'Too many session requests. Please try again later.',
      rateLimitResult.retryAfter,
      rateLimitResult.escalationLevel
    )
  }

  // Apply progressive delay for repeated attempts
  await applyProgressiveDelay(request)

  try {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
      recordAuthResult(request, true) // Not a failure in production
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('next-auth.session-token')

    if (!sessionToken) {
      recordAuthResult(request, true) // No token is not a failure
      return NextResponse.json({ user: null }, { status: 200 })
    }

    try {
      // Verify the JWT token
      const secret = new TextEncoder().encode(
        process.env.NEXTAUTH_SECRET || 'development-secret-key-at-least-32-characters-long'
      )
      const { payload } = await jwtVerify(sessionToken.value, secret)

      // Record successful session verification
      recordAuthResult(request, true)

      return NextResponse.json({
        user: {
          id: payload.sub,
          name: payload.name,
          email: payload.email,
          image: payload.picture,
        },
        expires: new Date((payload.exp as number) * 1000).toISOString(),
      })
    } catch (_error) {
      // Invalid token - record as failed authentication
      recordAuthResult(request, false)
      return NextResponse.json({ user: null }, { status: 200 })
    }
  } catch (_error) {
    recordAuthResult(request, false)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
