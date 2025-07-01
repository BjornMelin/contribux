/**
 * WebAuthn Registration Verification API
 * Verify and store new WebAuthn credentials
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authConfig } from '@/lib/config/auth'
import { securityFeatures } from '@/lib/security/feature-flags'
import { verifyWebAuthnRegistration } from '@/lib/security/webauthn/server'

const RegistrationRequestSchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
    type: z.literal('public-key'),
  }),
  expectedChallenge: z.string(),
  deviceName: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check if WebAuthn is enabled
  if (!securityFeatures.webauthn) {
    return NextResponse.json({ error: 'WebAuthn is not enabled' }, { status: 403 })
  }

  try {
    // Get authenticated session
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
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
      return NextResponse.json({
        success: true,
        message: 'WebAuthn credential registered successfully',
        credentialId: result.credentialId,
      })
    }
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Registration verification failed',
      },
      { status: 400 }
    )
  } catch (error) {
    console.error('WebAuthn registration verification error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Failed to verify registration' }, { status: 500 })
  }
}
