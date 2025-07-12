/**
 * JWT option building utilities
 * Extracted from main JWT module to reduce complexity
 */

import type { JWTVerifyOptions } from 'jose'

/**
 * JWT verification options builder
 */
export function createJWTVerifyOptions(overrides?: Partial<JWTVerifyOptions>): JWTVerifyOptions {
  const TOKEN_ISSUER = 'contribux'
  const TOKEN_AUDIENCE = ['contribux-api']

  const baseOptions: JWTVerifyOptions = {
    algorithms: ['HS256'], // Only allow HS256 for security
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    clockTolerance: process.env.NODE_ENV === 'test' ? 60 : 30, // 60s for test, 30s for production
    requiredClaims: ['sub', 'iat', 'exp', 'jti'],
  }

  // Add current date for consistent testing
  if (process.env.NODE_ENV === 'test') {
    baseOptions.currentDate = new Date()
  }

  return { ...baseOptions, ...overrides }
}

/**
 * JWT signing payload builder
 */
export interface JWTSigningPayload {
  sub: string
  email?: string
  githubUsername?: string
  authMethod?: string
  sessionId: string
  iat: number
  exp: number
  iss: string
  aud: string[]
  jti: string
}

/**
 * Create standardized JWT payload
 */
export function createJWTPayload(data: {
  sub: string
  email?: string
  githubUsername?: string
  authMethod?: string
  sessionId: string
  jti: string
  expirySeconds: number
}): JWTSigningPayload {
  const now = Math.floor(Date.now() / 1000)

  return {
    sub: data.sub,
    email: data.email,
    githubUsername: data.githubUsername,
    authMethod: data.authMethod || 'oauth',
    sessionId: data.sessionId,
    iat: now,
    exp: now + data.expirySeconds,
    iss: 'contribux',
    aud: ['contribux-api'],
    jti: data.jti,
  }
}

/**
 * Token format validation options
 */
export interface TokenFormatOptions {
  requireValidStructure?: boolean
  requireValidAlgorithm?: boolean
  allowedAlgorithms?: string[]
}

/**
 * Basic token format validation
 */
export function validateBasicTokenFormat(token: string, options: TokenFormatOptions = {}): void {
  const {
    requireValidStructure = true,
    requireValidAlgorithm = true,
    allowedAlgorithms = ['HS256'],
  } = options

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('JWT validation failed: Token must be a non-empty string')
  }

  if (!requireValidStructure) return

  // Validate JWT structure (header.payload.signature)
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('JWT validation failed: Token must have exactly 3 parts separated by dots')
  }

  const [header, payload, signature] = parts
  if (!header || !payload || !signature) {
    throw new Error('JWT validation failed: All token parts must be non-empty')
  }

  if (!requireValidAlgorithm) return

  // Basic header validation for algorithm
  try {
    const headerBytes = new Uint8Array(
      atob(header.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => c.charCodeAt(0))
    )
    const decodedHeader = JSON.parse(new TextDecoder().decode(headerBytes))

    if (!decodedHeader.alg || !allowedAlgorithms.includes(decodedHeader.alg)) {
      throw new Error(
        `JWT validation failed: Invalid algorithm. Allowed: ${allowedAlgorithms.join(', ')}`
      )
    }

    if (decodedHeader.typ !== 'JWT') {
      throw new Error('JWT validation failed: Token type must be JWT')
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('JWT validation failed:')) {
      throw error
    }
    throw new Error('JWT validation failed: Invalid token encoding')
  }
}
