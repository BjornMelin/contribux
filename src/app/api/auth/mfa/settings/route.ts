/**
 * MFA Settings API Route
 * Handles MFA settings management (get, update, disable)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMFASettings, regenerateBackupCodes, updateMFASettings } from '@/lib/auth/mfa-service'
import type { User } from '@/types/auth'

const UpdateMFASettingsSchema = z.object({
  enabled: z.boolean().optional(),
  primaryMethod: z.enum(['totp', 'webauthn', 'backup_code']).optional(),
  trustedDevices: z.array(z.string()).optional(),
  regenerateBackupCodes: z.boolean().optional(),
})

/**
 * GET /api/auth/mfa/settings
 * Get user's MFA settings and status
 */
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user } = authReq.auth

    // Get MFA settings from database
    const settings = await getMFASettings(user.id)

    // Get enrolled methods information
    const enrolledMethodsInfo = await getEnrolledMethodsInfo(user.id)

    return NextResponse.json({
      ...settings,
      enrolledMethods: enrolledMethodsInfo,
      setupUrl: '/settings/security/mfa',
      supportedMethods: [
        {
          method: 'totp',
          name: 'Authenticator App',
          description: 'Time-based one-time passwords',
          icon: '📱',
        },
        {
          method: 'webauthn',
          name: 'Security Key',
          description: 'FIDO2 security keys and biometrics',
          icon: '🔐',
        },
      ],
    })
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to retrieve MFA settings' }, { status: 500 })
  }
}

/**
 * PUT /api/auth/mfa/settings
 * Update user's MFA settings
 */
export async function PUT(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json()
    const updateRequest = UpdateMFASettingsSchema.parse(body)

    // Get authenticated user
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user } = authReq.auth

    // Special handling for regenerating backup codes
    if (updateRequest.regenerateBackupCodes) {
      const newBackupCodes = regenerateBackupCodes()

      return NextResponse.json({
        success: true,
        backupCodes: newBackupCodes.plainText, // Show once
        message: 'New backup codes generated. Save them securely.',
      })
    }

    // Update MFA settings
    const currentSettings = await getMFASettings(user.id)

    // Filter out undefined values from update request
    const filteredUpdateRequest = Object.fromEntries(
      Object.entries(updateRequest).filter(([_, value]) => value !== undefined)
    )

    const updatedSettings = { ...currentSettings, ...filteredUpdateRequest }

    // Validate settings update
    if (updateRequest.enabled === false) {
      // Disabling MFA requires MFA verification
      const mfaSession = req.headers.get('x-mfa-session')
      if (!mfaSession) {
        return NextResponse.json(
          {
            error: 'MFA verification required to disable MFA',
            requiresMFA: true,
          },
          { status: 403 }
        )
      }
    }

    if (
      updateRequest.primaryMethod &&
      !currentSettings.enrolledMethods.includes(updateRequest.primaryMethod)
    ) {
      return NextResponse.json(
        { error: 'Cannot set primary method to a method that is not enrolled' },
        { status: 400 }
      )
    }

    // Update settings in database
    await updateMFASettings(user.id, updatedSettings)

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
      message: 'MFA settings updated successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Failed to update MFA settings' }, { status: 500 })
  }
}

/**
 * DELETE /api/auth/mfa/settings
 * Disable MFA for user (requires MFA verification)
 */
export async function DELETE(req: NextRequest) {
  try {
    // Get authenticated user
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user } = authReq.auth

    // Check if MFA is enabled
    if (!user.twoFactorEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled for this account' }, { status: 400 })
    }

    // Require MFA verification to disable MFA
    const mfaSession = req.headers.get('x-mfa-session')
    if (!mfaSession) {
      return NextResponse.json(
        {
          error: 'MFA verification required to disable MFA',
          requiresMFA: true,
        },
        { status: 403 }
      )
    }

    // TODO: Verify MFA session validity

    // Disable MFA and clean up all MFA data
    await disableMFACompletely(user.id)

    return NextResponse.json({
      success: true,
      message: 'MFA has been disabled for your account',
    })
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to disable MFA' }, { status: 500 })
  }
}

/**
 * Helper function to get enrolled methods information
 */
async function getEnrolledMethodsInfo(_userId: string) {
  // TODO: Get from database
  const methods: Array<{
    method: string
    enrolledAt?: Date
    lastUsed?: Date
    verified?: boolean
    credentialId?: string
    name?: string
  }> = []

  // Check for TOTP
  // const totpCredential = await getTOTPCredential(userId)
  // if (totpCredential) {
  //   methods.push({
  //     method: 'totp',
  //     enrolledAt: totpCredential.createdAt,
  //     lastUsed: totpCredential.lastUsedAt,
  //     verified: totpCredential.isVerified
  //   })
  // }

  // Check for WebAuthn credentials
  // const webauthnCredentials = await getWebAuthnCredentials(userId)
  // webauthnCredentials.forEach(cred => {
  //   methods.push({
  //     method: 'webauthn',
  //     credentialId: cred.credentialId,
  //     name: cred.name,
  //     enrolledAt: cred.createdAt,
  //     lastUsed: cred.lastUsedAt
  //   })
  // })

  return methods
}

/**
 * Helper function to completely disable MFA
 */
async function disableMFACompletely(_userId: string) {
  // TODO: Implement complete MFA disabling
  // 1. Remove all TOTP credentials
  // 2. Remove all WebAuthn credentials
  // 3. Remove all backup codes
  // 4. Update user's twoFactorEnabled flag
  // 5. Revoke all MFA sessions
  // 6. Log security audit event
}

// Authentication should be handled within the route handlers
// Middleware export is not compatible with Next.js API routes
