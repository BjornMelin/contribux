/**
 * TOTP (Time-based One-Time Password) implementation for MFA
 * Implements RFC 6238 with security enhancements for production use
 */

import * as crypto from 'node:crypto'
import type { MFAEnrollmentResponse, MFAVerificationResponse, TOTPCredential } from '@/types/auth'
import { z } from 'zod'

// =============================================================================
// SECURITY CONSTANTS
// =============================================================================

const TOTP_DEFAULTS = {
  ALGORITHM: 'SHA1' as const,
  DIGITS: 6 as const,
  PERIOD: 30 as const, // 30 seconds
  WINDOW: 2 as const, // Allow 2 time steps variance (±60 seconds)
  SECRET_LENGTH: 32, // 32 bytes = 256 bits for high entropy
  BACKUP_CODES_COUNT: 10,
  BACKUP_CODE_LENGTH: 8,
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION: 900, // 15 minutes
} as const

const ISSUER_NAME = 'Contribux'
const _QR_CODE_SIZE = 200

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate cryptographically secure random secret
 */
function generateSecureSecret(): string {
  const bytes = crypto.randomBytes(TOTP_DEFAULTS.SECRET_LENGTH)
  return base32Encode(bytes)
}

/**
 * Base32 encoding without padding (RFC 4648)
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31]
  }

  return result
}

/**
 * Base32 decoding
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleanInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '')

  let bits = 0
  let value = 0
  const result: number[] = []

  for (const char of cleanInput) {
    const index = alphabet.indexOf(char)
    if (index === -1) {
      throw new Error('Invalid base32 character')
    }

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(result)
}

/**
 * Generate HMAC-based One-Time Password (RFC 4226)
 */
function generateHOTP(secret: Buffer, counter: number, digits: number): string {
  const hmac = crypto.createHmac('sha1', secret)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))

  const hash = hmac.update(counterBuffer).digest()
  const offset = (hash[hash.length - 1] || 0) & 0x0f

  const code =
    (((hash[offset] || 0) & 0x7f) << 24) |
    (((hash[offset + 1] || 0) & 0xff) << 16) |
    (((hash[offset + 2] || 0) & 0xff) << 8) |
    ((hash[offset + 3] || 0) & 0xff)

  return (code % 10 ** digits).toString().padStart(digits, '0')
}

/**
 * Generate Time-based One-Time Password (RFC 6238)
 */
function generateTOTP(
  secret: string,
  timestamp?: number,
  period = TOTP_DEFAULTS.PERIOD,
  digits = TOTP_DEFAULTS.DIGITS
): string {
  const time = Math.floor((timestamp || Date.now()) / 1000)
  const counter = Math.floor(time / period)
  const secretBuffer = base32Decode(secret)

  return generateHOTP(secretBuffer, counter, digits)
}

/**
 * Verify TOTP with time window tolerance
 */
function verifyTOTP(
  token: string,
  secret: string,
  timestamp?: number,
  window = TOTP_DEFAULTS.WINDOW,
  period = TOTP_DEFAULTS.PERIOD,
  digits = TOTP_DEFAULTS.DIGITS
): { valid: boolean; timeStepUsed?: number } {
  const time = Math.floor((timestamp || Date.now()) / 1000)
  const currentCounter = Math.floor(time / period)

  // Check current time step and surrounding window
  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i
    const expectedToken = generateTOTP(secret, counter * period * 1000, period, digits)

    if (timingSafeEqual(token, expectedToken)) {
      return { valid: true, timeStepUsed: counter }
    }
  }

  return { valid: false }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

/**
 * Generate secure backup codes
 */
function generateBackupCodes(count = TOTP_DEFAULTS.BACKUP_CODES_COUNT): string[] {
  const codes: string[] = []

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(TOTP_DEFAULTS.BACKUP_CODE_LENGTH)
    const code = bytes.toString('hex').toUpperCase().slice(0, TOTP_DEFAULTS.BACKUP_CODE_LENGTH)
    codes.push(code)
  }

  return codes
}

/**
 * Generate QR code URL for authenticator apps
 */
function generateQRCodeUrl(secret: string, accountName: string, issuer = ISSUER_NAME): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: TOTP_DEFAULTS.ALGORITHM,
    digits: TOTP_DEFAULTS.DIGITS.toString(),
    period: TOTP_DEFAULTS.PERIOD.toString(),
  })

  const otpAuthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params}`

  // Generate QR code URL using a service or return the otpauth URL for QR generation
  return otpAuthUrl
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const TOTPEnrollmentParams = z.object({
  userId: z.string().uuid(),
  userEmail: z.string().email(),
  userName: z.string().min(1).max(255),
})

export const TOTPVerificationParams = z.object({
  userId: z.string().uuid(),
  token: z.string().regex(/^\d{6,8}$/, 'Token must be 6-8 digits'),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
})

export const TOTPBackupCodeVerificationParams = z.object({
  userId: z.string().uuid(),
  backupCode: z.string().length(TOTP_DEFAULTS.BACKUP_CODE_LENGTH),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
})

// =============================================================================
// MAIN TOTP FUNCTIONS
// =============================================================================

/**
 * Generate TOTP enrollment data for a user
 */
export async function generateTOTPEnrollment(
  params: z.infer<typeof TOTPEnrollmentParams>
): Promise<MFAEnrollmentResponse> {
  try {
    const validatedParams = TOTPEnrollmentParams.parse(params)
    const { userId: _userId, userEmail, userName } = validatedParams

    // Generate secure secret and backup codes
    const secret = generateSecureSecret()
    const backupCodes = generateBackupCodes()
    const accountName = `${userName} (${userEmail})`
    const qrCodeUrl = generateQRCodeUrl(secret, accountName)

    return {
      success: true,
      method: 'totp',
      secret,
      qrCodeUrl,
      backupCodes, // Show plaintext codes once during enrollment
    }
  } catch (error) {
    return {
      success: false,
      method: 'totp',
      error: error instanceof Error ? error.message : 'Failed to generate TOTP enrollment',
    }
  }
}

/**
 * Verify TOTP token for authentication
 */
export async function verifyTOTPToken(
  params: z.infer<typeof TOTPVerificationParams>,
  storedCredential: TOTPCredential,
  lastUsedCounter?: number
): Promise<MFAVerificationResponse> {
  try {
    const validatedParams = TOTPVerificationParams.parse(params)
    const { token } = validatedParams

    // Verify token against stored secret
    const verification = verifyTOTP(
      token,
      storedCredential.secret,
      undefined,
      TOTP_DEFAULTS.WINDOW,
      storedCredential.period as 30,
      storedCredential.digits as 6
    )

    if (!verification.valid) {
      return {
        success: false,
        method: 'totp',
        error: 'Invalid TOTP token',
      }
    }

    // Prevent replay attacks by checking if this time step was already used
    if (
      lastUsedCounter &&
      verification.timeStepUsed &&
      verification.timeStepUsed <= lastUsedCounter
    ) {
      return {
        success: false,
        method: 'totp',
        error: 'TOTP token already used',
      }
    }

    return {
      success: true,
      method: 'totp',
    }
  } catch (error) {
    return {
      success: false,
      method: 'totp',
      error: error instanceof Error ? error.message : 'TOTP verification failed',
    }
  }
}

/**
 * Verify backup code for recovery
 */
export async function verifyBackupCode(
  params: z.infer<typeof TOTPBackupCodeVerificationParams>,
  storedBackupCodes: string[] // Hashed backup codes from database
): Promise<MFAVerificationResponse> {
  try {
    const validatedParams = TOTPBackupCodeVerificationParams.parse(params)
    const { backupCode } = validatedParams

    // Hash the provided backup code for comparison
    const hashedCode = crypto.createHash('sha256').update(backupCode).digest('hex')

    // Check if the hashed code exists in stored backup codes
    const isValidCode = storedBackupCodes.some(storedCode =>
      timingSafeEqual(hashedCode, storedCode)
    )

    if (!isValidCode) {
      return {
        success: false,
        method: 'backup_code',
        error: 'Invalid backup code',
      }
    }

    return {
      success: true,
      method: 'backup_code',
    }
  } catch (error) {
    return {
      success: false,
      method: 'backup_code',
      error: error instanceof Error ? error.message : 'Backup code verification failed',
    }
  }
}

/**
 * Hash backup codes for secure storage
 */
function hashBackupCodesImpl(plainTextCodes: string[]): string[] {
  return plainTextCodes.map(code => crypto.createHash('sha256').update(code).digest('hex'))
}

/**
 * Generate new backup codes (for regeneration)
 */
export function regenerateBackupCodes(): { plainText: string[]; hashed: string[] } {
  const plainText = generateBackupCodes()
  const hashed = hashBackupCodesImpl(plainText)

  return { plainText, hashed }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCodesImpl as hashBackupCodes,
  generateQRCodeUrl,
  TOTP_DEFAULTS,
}
