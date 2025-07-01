/**
 * MFA Verification API Route
 * Handles verification for TOTP, WebAuthn, and backup codes
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateDeviceFingerprint, verifyMFA } from '@/lib/auth/mfa-service'
import { requireAuthentication } from '@/lib/auth/middleware'
import { type MFAVerificationRequest, MFAVerificationRequestSchema, type User } from '@/types/auth'

/**
 * POST /api/auth/mfa/verify
 * Verify MFA token/assertion for authentication
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json()
    const verificationRequest = MFAVerificationRequestSchema.parse(body)

    // Get authenticated user
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user } = authReq.auth

    // Check if user has MFA enabled
    if (!user.twoFactorEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled for this account' }, { status: 400 })
    }

    // Create a properly typed verification request by handling undefined values
    const mfaRequest: MFAVerificationRequest = {
      method: verificationRequest.method,
      ...(verificationRequest.token !== undefined && { token: verificationRequest.token }),
      ...(verificationRequest.credentialId !== undefined && {
        credentialId: verificationRequest.credentialId,
      }),
      ...(verificationRequest.assertion !== undefined && {
        assertion: verificationRequest.assertion,
      }),
    }

    // Verify MFA
    const result = await verifyMFA(user, mfaRequest, req)

    if (!result.success) {
      // Log failed verification attempt for security monitoring (handled by application logging)
      // Monitoring service will capture failed MFA attempts

      return NextResponse.json(
        {
          error: result.error,
          method: result.method,
          ...(result.remainingAttempts !== undefined && {
            remainingAttempts: result.remainingAttempts,
          }),
          ...(result.lockoutDuration && { lockoutDuration: result.lockoutDuration }),
        },
        { status: 400 }
      )
    }

    // Generate device fingerprint for trusted device feature
    const deviceFingerprint = generateDeviceFingerprint(req)

    // Create MFA session token (valid for current session)
    const mfaSessionToken = generateMFASessionToken(user.id, result.method)

    // Log successful verification for security monitoring (handled by application logging)
    // Monitoring service will capture successful MFA verifications

    const response = NextResponse.json({
      success: true,
      method: result.method,
      mfaSessionToken,
      deviceFingerprint,
    })

    // Set secure HTTP-only cookie for MFA session
    response.cookies.set('mfa-session', mfaSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    })

    return response
  } catch (error) {
    // Log verification error for monitoring (handled by application logging)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Generate MFA session token
 */
function generateMFASessionToken(userId: string, method: string): string {
  const crypto = require('node:crypto')
  const timestamp = Date.now()
  const randomBytes = crypto.randomBytes(16).toString('hex')

  // Simple session token (in production, use JWT or similar)
  const payload = `${userId}:${method}:${timestamp}:${randomBytes}`
  return Buffer.from(payload).toString('base64url')
}

/**
 * GET /api/auth/mfa/verify
 * Get MFA verification challenge for WebAuthn
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const method = searchParams.get('method')

    if (method !== 'webauthn') {
      return NextResponse.json(
        { error: 'Challenge generation only supported for WebAuthn' },
        { status: 400 }
      )
    }

    // Get authenticated user
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user: _user } = authReq.auth

    // TODO: Get user's WebAuthn credentials from database
    const userCredentials: string[] = [] // Array of credential IDs

    // Generate authentication options
    const { generateWebAuthnAuthenticationOptions } = await import('@/lib/auth/webauthn-enhanced')
    const authenticationOptions = await generateWebAuthnAuthenticationOptions(userCredentials)

    return NextResponse.json({
      authenticationOptions,
      challenge: authenticationOptions.challenge,
    })
  } catch (_error) {
    // Log challenge generation error for monitoring (handled by application logging)
    return NextResponse.json({ error: 'Failed to generate MFA challenge' }, { status: 500 })
  }
}

// Apply authentication middleware
export const middleware = [requireAuthentication]
