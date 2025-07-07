/**
 * WebAuthn Registration Verification API
 * Verify and store new WebAuthn credentials with rate limiting protection
 */

import { auth } from '@/lib/auth/index'
import { securityFeatures } from '@/lib/security/feature-flags'
import { verifyWebAuthnRegistration } from '@/lib/security/webauthn/server'
import { 
  checkAuthRateLimit, 
  recordAuthResult, 
  createRateLimitResponse,
  applyProgressiveDelay 
} from '@/lib/security/auth-rate-limiting'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const RegistrationRequestSchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.unknown()).optional().default({}),
  }),
  expectedChallenge: z.string(),
  deviceName: z.string().optional(),
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
      'Too many registration attempts. Please try again later.',
      rateLimitResult.retryAfter,
      rateLimitResult.escalationLevel
    )
  }

  // Apply progressive delay for repeated attempts
  await applyProgressiveDelay(request)

  try {
    // Get authenticated session
    const session = await auth()
    if (!session?.user?.id) {
      recordAuthResult(request, false) // Authentication required but not provided
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = RegistrationRequestSchema.parse(body)

    // Verify registration response
    const result = await verifyWebAuthnRegistration(
      session.user.id,
      validatedData.response,
      validatedData.expectedChallenge
    )

    if (result.verified) {
      // Record successful registration
      recordAuthResult(request, true)
      
      return NextResponse.json({
        success: true,
        message: 'WebAuthn credential registered successfully',
        credentialId: result.credentialId,
      })
    }
    
    // Record failed registration
    recordAuthResult(request, false)
    
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Registration verification failed',
      },
      { status: 400 }
    )
  } catch (error) {
    // Record failed registration for any error
    recordAuthResult(request, false)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Failed to verify registration' }, { status: 500 })
  }
}
