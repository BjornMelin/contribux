/**
 * Environment-specific JWT validation utilities
 * Extracted from main JWT module to reduce complexity
 */

/**
 * JWT secret validation for different environments
 */
export interface SecretValidationOptions {
  environment: string
  secret: string | Uint8Array
  minLength?: number
}

/**
 * Validate JWT secret for test environment
 */
export function validateTestEnvironmentSecret(secret: string): void {
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
    throw new Error('Test environment validation failed: NODE_ENV must be set to "test"')
  }

  if (!secret) {
    throw new Error('Test environment validation failed: JWT_SECRET or NEXTAUTH_SECRET required')
  }

  if (secret.length < 32) {
    throw new Error('Test environment validation failed: JWT secret must be at least 32 characters')
  }

  if (secret.includes('prod') || secret.includes('production')) {
    throw new Error(
      'Test environment validation failed: Production secrets detected in test environment'
    )
  }
}

/**
 * Validate JWT secret for production environment
 */
export function validateProductionSecret(secret: string): void {
  if (secret.length < 64) {
    throw new Error(
      'Production environment validation failed: JWT secret must be at least 64 characters in production'
    )
  }

  if (secret.includes('test') || secret.includes('demo')) {
    throw new Error(
      'Production environment validation failed: Test secrets detected in production environment'
    )
  }

  // Check for mixed case
  if (secret === secret.toLowerCase() || secret === secret.toUpperCase()) {
    throw new Error(
      'Production environment validation failed: JWT secret must contain mixed case characters'
    )
  }

  // Check for weak patterns
  const weakPatterns = ['123', 'abc', 'password', 'secret', 'key']
  if (weakPatterns.some(pattern => secret.toLowerCase().includes(pattern))) {
    throw new Error('Production environment validation failed: JWT secret contains weak patterns')
  }
}

/**
 * Get validated JWT secret for current environment
 */
export function getValidatedSecret(rawSecret: string): Uint8Array {
  const environment = process.env.NODE_ENV

  if (environment === 'test') {
    validateTestEnvironmentSecret(rawSecret)
  } else if (environment === 'production') {
    validateProductionSecret(rawSecret)
  }

  return new TextEncoder().encode(rawSecret)
}

/**
 * Validate environment-specific payload claims
 */
export function validateEnvironmentPayload(payload: Record<string, unknown>): void {
  const environment = process.env.NODE_ENV

  if (environment === 'test') {
    validateTestPayload(payload)
  } else if (environment === 'production') {
    validateProductionPayload(payload)
  }
}

/**
 * Validate payload for test environment
 */
function validateTestPayload(_payload: Record<string, unknown>): void {
  // Allow flexibility in test environment
  // No strict validation for test subjects/emails
}

/**
 * Validate payload for production environment
 */
function validateProductionPayload(payload: Record<string, unknown>): void {
  // Reject test-specific subjects and JTIs in production
  if (
    typeof payload.sub === 'string' &&
    (payload.sub.includes('test') || payload.sub.includes('demo'))
  ) {
    throw new Error('JWT validation failed: Test subject detected in production environment')
  }

  if (typeof payload.jti === 'string' && payload.jti.includes('test')) {
    throw new Error('JWT validation failed: Test JTI detected in production environment')
  }
}
