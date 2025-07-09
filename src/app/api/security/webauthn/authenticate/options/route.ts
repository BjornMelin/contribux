/**
 * WebAuthn Authentication Options API
 * Generate authentication options for existing WebAuthn credentials
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { securityFeatures } from '@/lib/security/feature-flags'
import { generateWebAuthnAuthentication } from '@/lib/security/webauthn/server'

const AuthOptionsRequestSchema = z.object({
  userId: z.string().optional(), // Optional for user-less authentication
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check if WebAuthn is enabled
  if (!securityFeatures.webauthn) {
    return NextResponse.json({ error: 'WebAuthn is not enabled' }, { status: 403 })
  }

  try {
    // Parse request body (userId is optional for discoverable credentials)
    const body = await request.json().catch(() => ({}))
    const validatedData = AuthOptionsRequestSchema.parse(body)

    // Generate authentication options
    const options = await generateWebAuthnAuthentication(validatedData.userId)

    return NextResponse.json({
      success: true,
      options,
      challenge: options.challenge, // Include for client verification
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to generate authentication options' },
      { status: 500 }
    )
  }
}
