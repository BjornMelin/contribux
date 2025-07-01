/**
 * WebAuthn Registration Options API
 * Generate registration options for new WebAuthn credentials
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/config/auth'
import { securityFeatures } from '@/lib/security/feature-flags'
import { generateWebAuthnRegistration } from '@/lib/security/webauthn/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check if WebAuthn is enabled
  if (!securityFeatures.webauthn) {
    return NextResponse.json({ error: 'WebAuthn is not enabled' }, { status: 403 })
  }

  try {
    // Get authenticated session
    const session = await getServerSession(authConfig)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Generate registration options
    const options = await generateWebAuthnRegistration(session.user.id, session.user.email)

    // Store challenge in session or secure storage
    // For simplicity, we'll include it in the response
    // In production, store the challenge server-side

    return NextResponse.json({
      success: true,
      options,
      challenge: options.challenge, // Include for client verification
    })
  } catch (error) {
    console.error('WebAuthn registration options error:', error)

    return NextResponse.json({ error: 'Failed to generate registration options' }, { status: 500 })
  }
}
