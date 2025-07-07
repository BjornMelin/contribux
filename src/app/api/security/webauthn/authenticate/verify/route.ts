/**
 * WebAuthn Authentication Verification API
 * Verify WebAuthn authentication responses with rate limiting protection
 */

import { securityFeatures } from '@/lib/security/feature-flags'
import { verifyWebAuthnAuthentication } from '@/lib/security/webauthn/server'
import { 
  checkAuthRateLimit, 
  recordAuthResult, 
  createRateLimitResponse,
  applyProgressiveDelay 
} from '@/lib/security/auth-rate-limiting'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const AuthenticationRequestSchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.unknown()).optional().default({}),
  }),
  expectedChallenge: z.string(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check if WebAuthn is enabled
  if (!securityFeatures.webauthn) {
    return NextResponse.json({ error: 'WebAuthn is not enabled' }, { status: 403 })
  }

  // Apply authentication rate limiting
  const rateLimitResult = checkAuthRateLimit(request)
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(
      'Too many authentication attempts. Please try again later.',
      rateLimitResult.retryAfter,
      rateLimitResult.escalationLevel
    )
  }

  // Apply progressive delay for repeated attempts
  await applyProgressiveDelay(request)

  try {
    // Parse and validate request body
    const body = await request.json()
    const validatedData = AuthenticationRequestSchema.parse(body)

    // Verify authentication response
    const result = await verifyWebAuthnAuthentication(
      validatedData.response,
      validatedData.expectedChallenge
    )

    if (result.verified) {
      // Record successful authentication
      recordAuthResult(request, true)
      
      return NextResponse.json({
        success: true,
        message: 'WebAuthn authentication successful',
        userId: result.userId,
        credentialId: result.credentialId,
      })
    }
    
    // Record failed authentication
    recordAuthResult(request, false)
    
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Authentication verification failed',
      },
      { status: 401 }
    )
  } catch (error) {
    // Record failed authentication for any error
    recordAuthResult(request, false)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Failed to verify authentication' }, { status: 500 })
  }
}
