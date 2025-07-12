/**
 * MFA Enrollment API Route
 * Handles enrollment for TOTP and WebAuthn methods
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { enrollMFA } from '@/lib/auth/mfa-service'
import { MFAEnrollmentRequestSchema, type User } from '@/types/auth'

const EnrollmentRequestSchema = MFAEnrollmentRequestSchema.extend({
  deviceName: z.string().min(1).max(100).optional().default('Security Key'),
})

/**
 * POST /api/auth/mfa/enroll
 * Enroll user in MFA with specified method
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json()
    const enrollmentRequest = EnrollmentRequestSchema.parse(body)

    // Get authenticated user
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user } = authReq.auth

    // Check if user already has MFA enabled
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled for this account' },
        { status: 400 }
      )
    }

    // Enroll user in MFA
    const result = await enrollMFA(user, enrollmentRequest, req)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Return enrollment response (without exposing internal details)
    return NextResponse.json({
      success: true,
      method: result.method,
      ...(result.secret && { secret: result.secret }),
      ...(result.qrCodeUrl && { qrCodeUrl: result.qrCodeUrl }),
      ...(result.backupCodes && { backupCodes: result.backupCodes }),
      ...(result.registrationOptions && { registrationOptions: result.registrationOptions }),
    })
  } catch (error) {
    // Log enrollment error for monitoring (handled by application logging)

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
 * GET /api/auth/mfa/enroll
 * Get available MFA methods for enrollment
 */
export async function GET() {
  return NextResponse.json({
    availableMethods: [
      {
        method: 'totp',
        name: 'Authenticator App',
        description: 'Use Google Authenticator, Authy, or similar apps',
        icon: '📱',
      },
      {
        method: 'webauthn',
        name: 'Security Key',
        description: 'Use FIDO2 security keys or biometric authentication',
        icon: '🔐',
      },
    ],
    requirements: {
      totp: {
        apps: ['Google Authenticator', 'Authy', '1Password', 'Bitwarden'],
        setup: 'Scan QR code with your authenticator app',
      },
      webauthn: {
        devices: ['FIDO2 Security Keys', 'Touch ID', 'Face ID', 'Windows Hello'],
        setup: 'Follow browser prompts to register your device',
      },
    },
  })
}

// Authentication should be handled within the route handlers
// Middleware export is not compatible with Next.js API routes
