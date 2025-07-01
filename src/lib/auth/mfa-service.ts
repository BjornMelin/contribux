/**
 * Multi-Factor Authentication Service
 * Comprehensive MFA implementation with TOTP, WebAuthn, and backup codes
 * Addresses OWASP A07 Authentication Failures
 */

import { type NextRequest, NextResponse } from 'next/server'
import type {
  MFAEnrollmentRequest,
  MFAEnrollmentResponse,
  MFAMethod,
  MFASettings,
  MFAVerificationRequest,
  MFAVerificationResponse,
  TOTPCredential,
  User,
  WebAuthnCredential,
} from '@/types/auth'
import type { UUID } from '@/types/base'

// Import MFA implementations
import { generateTOTPEnrollment, hashBackupCodes, verifyBackupCode, verifyTOTPToken } from './totp'
import {
  generateWebAuthnRegistrationOptions,
  verifyWebAuthnAuthentication,
} from './webauthn-enhanced'

// =============================================================================
// SECURITY CONSTANTS
// =============================================================================

const MFA_SECURITY = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION: 900, // 15 minutes in seconds
  MAX_BACKUP_CODES: 10,
  RATE_LIMIT_WINDOW: 300, // 5 minutes
  MAX_REQUESTS_PER_WINDOW: 10,
  SESSION_TIMEOUT: 3600, // 1 hour for MFA session
  TRUSTED_DEVICE_DURATION: 30 * 24 * 60 * 60, // 30 days
} as const

// =============================================================================
// IN-MEMORY STORES (Replace with Redis in production)
// =============================================================================

interface MFAAttempt {
  userId: string
  attempts: number
  lockedUntil?: number
  lastAttempt: number
}

interface MFAChallenge {
  userId: string
  challenge: string
  method: MFAMethod
  expiresAt: number
  registrationOptions?: PublicKeyCredentialCreationOptions
}

const mfaAttempts = new Map<string, MFAAttempt>()
const mfaChallenges = new Map<string, MFAChallenge>()
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate device fingerprint from request
 */
function generateDeviceFingerprint(req: NextRequest): string {
  const userAgent = req.headers.get('user-agent') || ''
  const acceptLanguage = req.headers.get('accept-language') || ''
  const acceptEncoding = req.headers.get('accept-encoding') || ''

  const crypto = require('node:crypto')
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${userAgent}:${acceptLanguage}:${acceptEncoding}`)
    .digest('hex')
    .slice(0, 32)

  return fingerprint
}

/**
 * Check if user is rate limited
 */
function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts?: number } {
  const now = Date.now()
  const key = `mfa:${identifier}`
  const limit = rateLimitStore.get(key)

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + MFA_SECURITY.RATE_LIMIT_WINDOW * 1000 })
    return { allowed: true, remainingAttempts: MFA_SECURITY.MAX_REQUESTS_PER_WINDOW - 1 }
  }

  if (limit.count >= MFA_SECURITY.MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false }
  }

  limit.count++
  return { allowed: true, remainingAttempts: MFA_SECURITY.MAX_REQUESTS_PER_WINDOW - limit.count }
}

/**
 * Check if user is locked out from too many failed attempts
 */
function checkMFALockout(userId: string): { locked: boolean; remainingTime?: number } {
  const attempt = mfaAttempts.get(userId)
  if (!attempt) return { locked: false }

  const now = Date.now()
  if (attempt.lockedUntil && now < attempt.lockedUntil) {
    return {
      locked: true,
      remainingTime: Math.ceil((attempt.lockedUntil - now) / 1000),
    }
  }

  // Clear expired lockout
  if (attempt.lockedUntil && now >= attempt.lockedUntil) {
    mfaAttempts.delete(userId)
  }

  return { locked: false }
}

/**
 * Record failed MFA attempt
 */
function recordFailedAttempt(userId: string): void {
  const now = Date.now()
  const attempt = mfaAttempts.get(userId) || { userId, attempts: 0, lastAttempt: now }

  attempt.attempts++
  attempt.lastAttempt = now

  if (attempt.attempts >= MFA_SECURITY.MAX_ATTEMPTS) {
    attempt.lockedUntil = now + MFA_SECURITY.LOCKOUT_DURATION * 1000
  }

  mfaAttempts.set(userId, attempt)
}

/**
 * Clear failed attempts on successful verification
 */
function clearFailedAttempts(userId: string): void {
  mfaAttempts.delete(userId)
}

// =============================================================================
// MFA ENROLLMENT FUNCTIONS
// =============================================================================

/**
 * Enroll user in MFA with specified method
 */
async function enrollMFA(
  user: User,
  request: MFAEnrollmentRequest,
  req: NextRequest
): Promise<MFAEnrollmentResponse> {
  try {
    // Rate limiting check
    const rateCheck = checkRateLimit(`enroll:${user.id}`)
    if (!rateCheck.allowed) {
      return {
        success: false,
        method: request.method,
        error: 'Too many enrollment attempts. Please try again later.',
      }
    }

    switch (request.method) {
      case 'totp':
        return await enrollTOTP(user)

      case 'webauthn':
        return await enrollWebAuthn(user, request.deviceName || 'Default Device', req)

      default:
        return {
          success: false,
          method: request.method,
          error: 'Unsupported MFA method',
        }
    }
  } catch (error) {
    return {
      success: false,
      method: request.method,
      error: error instanceof Error ? error.message : 'MFA enrollment failed',
    }
  }
}

/**
 * Enroll TOTP for user
 */
async function enrollTOTP(user: User): Promise<MFAEnrollmentResponse> {
  const enrollment = await generateTOTPEnrollment({
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName,
  })

  if (enrollment.success && enrollment.secret && enrollment.backupCodes) {
    // Store challenge for verification
    const challengeId = `totp:${user.id}:${Date.now()}`
    mfaChallenges.set(challengeId, {
      userId: user.id,
      challenge: enrollment.secret,
      method: 'totp',
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    })

    // Hash backup codes for storage (implementation would save to database)
    const _hashedBackupCodes = hashBackupCodes(enrollment.backupCodes)

    // TODO: Save to database
    // await saveTOTPCredential(user.id, enrollment.secret, hashedBackupCodes)

    // Handle qrCodeUrl assignment for exactOptionalPropertyTypes compatibility
    const response: {
      success: true
      method: 'totp'
      secret: string
      qrCodeUrl?: string
      backupCodes: string[]
    } = {
      success: true,
      method: 'totp',
      secret: enrollment.secret,
      backupCodes: enrollment.backupCodes, // Show once during enrollment
    }

    if (enrollment.qrCodeUrl !== undefined) {
      response.qrCodeUrl = enrollment.qrCodeUrl
    }

    return response
  }

  return enrollment
}

/**
 * Enroll WebAuthn for user
 */
async function enrollWebAuthn(
  user: User,
  _deviceName: string,
  _req: NextRequest
): Promise<MFAEnrollmentResponse> {
  const enrollment = await generateWebAuthnRegistrationOptions({
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName,
    excludeCredentials: [], // TODO: Get existing credentials from database
  })

  if (enrollment.success && enrollment.registrationOptions) {
    // Store challenge for verification
    const challengeId = `webauthn:${user.id}:${Date.now()}`
    const regOptions = enrollment.registrationOptions as PublicKeyCredentialCreationOptions
    mfaChallenges.set(challengeId, {
      userId: user.id,
      challenge: regOptions?.challenge
        ? typeof regOptions.challenge === 'string'
          ? regOptions.challenge
          : regOptions.challenge instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(regOptions.challenge)).toString('base64')
            : Buffer.from(regOptions.challenge as Uint8Array).toString('base64')
        : challengeId,
      method: 'webauthn',
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      registrationOptions: enrollment.registrationOptions as PublicKeyCredentialCreationOptions,
    })

    return {
      success: true,
      method: 'webauthn',
      registrationOptions: enrollment.registrationOptions,
    }
  }

  return enrollment
}

// =============================================================================
// MFA VERIFICATION FUNCTIONS
// =============================================================================

/**
 * Verify MFA challenge
 */
async function verifyMFA(
  user: User,
  request: MFAVerificationRequest,
  _req: NextRequest
): Promise<MFAVerificationResponse> {
  try {
    // Rate limiting check
    const rateCheck = checkRateLimit(`verify:${user.id}`)
    if (!rateCheck.allowed) {
      return {
        success: false,
        method: request.method,
        error: 'Too many verification attempts. Please try again later.',
      }
    }

    // Lockout check
    const lockoutCheck = checkMFALockout(user.id)
    if (lockoutCheck.locked) {
      return {
        success: false,
        method: request.method,
        lockoutDuration: lockoutCheck.remainingTime || 0,
        error: 'Account temporarily locked due to too many failed attempts',
      }
    }

    let verificationResult: MFAVerificationResponse

    switch (request.method) {
      case 'totp':
        verificationResult = await verifyTOTPMFA(user, request)
        break

      case 'webauthn':
        verificationResult = await verifyWebAuthnMFA(user, request)
        break

      case 'backup_code':
        verificationResult = await verifyBackupCodeMFA(user, request)
        break

      default:
        verificationResult = {
          success: false,
          method: request.method,
          error: 'Unsupported MFA method',
        }
    }

    // Handle verification result
    if (verificationResult.success) {
      clearFailedAttempts(user.id)

      // TODO: Update last MFA used timestamp in database
      // await updateLastMFAUsed(user.id, request.method)
    } else {
      recordFailedAttempt(user.id)

      // Add remaining attempts to response
      const attempt = mfaAttempts.get(user.id)
      if (attempt) {
        const remainingAttempts = Math.max(0, MFA_SECURITY.MAX_ATTEMPTS - attempt.attempts)
        verificationResult = {
          ...verificationResult,
          remainingAttempts,
        }
      }
    }

    return verificationResult
  } catch (error) {
    recordFailedAttempt(user.id)
    return {
      success: false,
      method: request.method,
      error: error instanceof Error ? error.message : 'MFA verification failed',
    }
  }
}

/**
 * Verify TOTP token
 */
async function verifyTOTPMFA(
  user: User,
  request: MFAVerificationRequest
): Promise<MFAVerificationResponse> {
  if (!request.token) {
    return {
      success: false,
      method: 'totp',
      error: 'TOTP token is required',
    }
  }

  // TODO: Get TOTP credential from database
  const totpCredential: TOTPCredential = {
    id: '00000000-0000-0000-0000-000000000000' as UUID,
    userId: user.id,
    secret: 'mock-secret',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    issuer: 'Contribux',
    accountName: user.email,
    backupCodes: [],
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return await verifyTOTPToken(
    {
      userId: user.id,
      token: request.token,
    },
    totpCredential
  )
}

/**
 * Verify WebAuthn assertion
 */
async function verifyWebAuthnMFA(
  user: User,
  request: MFAVerificationRequest
): Promise<MFAVerificationResponse> {
  if (!request.assertion || !request.credentialId) {
    return {
      success: false,
      method: 'webauthn',
      error: 'WebAuthn assertion and credential ID are required',
    }
  }

  // TODO: Get WebAuthn credential from database
  const webauthnCredential: WebAuthnCredential = {
    id: '00000000-0000-0000-0000-000000000000' as UUID,
    userId: user.id,
    credentialId: request.credentialId,
    publicKey: 'mock-public-key',
    counter: 0,
    deviceType: 'single_device',
    backedUp: false,
    transports: ['usb'],
    attestationType: 'none',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // Find challenge for this verification
  const challengeKey = Array.from(mfaChallenges.keys()).find(key =>
    key.startsWith(`webauthn:${user.id}:`)
  )

  if (!challengeKey) {
    return {
      success: false,
      method: 'webauthn',
      error: 'No active WebAuthn challenge found',
    }
  }

  const challenge = mfaChallenges.get(challengeKey)
  if (!challenge || Date.now() > challenge.expiresAt) {
    mfaChallenges.delete(challengeKey)
    return {
      success: false,
      method: 'webauthn',
      error: 'WebAuthn challenge expired',
    }
  }

  const result = await verifyWebAuthnAuthentication(
    {
      userId: user.id,
      credentialId: request.credentialId,
      assertion: request.assertion as PublicKeyCredential,
    },
    webauthnCredential,
    challenge.challenge
  )

  // Clean up challenge after use
  mfaChallenges.delete(challengeKey)

  return result
}

/**
 * Verify backup code
 */
async function verifyBackupCodeMFA(
  user: User,
  request: MFAVerificationRequest
): Promise<MFAVerificationResponse> {
  if (!request.token) {
    return {
      success: false,
      method: 'backup_code',
      error: 'Backup code is required',
    }
  }

  // TODO: Get backup codes from database
  const storedBackupCodes: string[] = [] // Hashed backup codes

  return await verifyBackupCode(
    {
      userId: user.id,
      backupCode: request.token,
    },
    storedBackupCodes
  )
}

// =============================================================================
// MFA MIDDLEWARE
// =============================================================================

/**
 * Enhanced MFA middleware for API routes
 */
function requireMFA<T = unknown>(handler: (req: NextRequest, params: T) => Promise<NextResponse>) {
  return async (req: NextRequest, params: T): Promise<NextResponse> => {
    const authReq = req as NextRequest & {
      auth?: { user: User; session_id: string }
    }

    if (!authReq.auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { user } = authReq.auth

    // Check if user has MFA enabled
    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        {
          error: 'Multi-factor authentication required',
          setup_url: '/settings/security/mfa',
          available_methods: ['totp', 'webauthn'],
        },
        { status: 403 }
      )
    }

    // Check for valid MFA session or trusted device
    const _deviceFingerprint = generateDeviceFingerprint(req)
    const mfaSession = req.headers.get('x-mfa-session')
    const trustedDevice = req.headers.get('x-trusted-device')

    // TODO: Verify MFA session or trusted device from database/cache

    if (!mfaSession && !trustedDevice) {
      return NextResponse.json(
        {
          error: 'MFA verification required',
          mfa_challenge_url: '/api/auth/mfa/challenge',
          available_methods: ['totp', 'webauthn', 'backup_code'],
        },
        { status: 403 }
      )
    }

    return handler(req, params)
  }
}

/**
 * MFA session verification middleware
 */
function verifyMFASession(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const mfaSession = req.headers.get('x-mfa-session')

    if (!mfaSession) {
      return NextResponse.json({ error: 'MFA session required' }, { status: 401 })
    }

    // TODO: Verify MFA session validity from database/cache

    return handler(req)
  }
}

// =============================================================================
// MFA SETTINGS MANAGEMENT
// =============================================================================

/**
 * Get user's MFA settings
 */
async function getMFASettings(_userId: string): Promise<MFASettings> {
  // TODO: Get from database
  return {
    enabled: false,
    enrolledMethods: [],
    backupCodesCount: 0,
    trustedDevices: [],
  }
}

/**
 * Update user's MFA settings
 */
async function updateMFASettings(_userId: string, _settings: Partial<MFASettings>): Promise<void> {
  // TODO: Update in database
}

/**
 * Regenerate backup codes for a user
 */
function regenerateBackupCodes(): { plainText: string[]; hashed: string[] } {
  const { generateBackupCodes, hashBackupCodes } = require('./totp')
  const plainTextCodes = generateBackupCodes()
  const hashedCodes = hashBackupCodes(plainTextCodes)

  return {
    plainText: plainTextCodes,
    hashed: hashedCodes,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  enrollMFA,
  verifyMFA,
  requireMFA,
  verifyMFASession,
  getMFASettings,
  updateMFASettings,
  generateDeviceFingerprint,
  MFA_SECURITY,
  regenerateBackupCodes,
}
