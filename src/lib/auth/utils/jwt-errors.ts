/**
 * JWT error handling utilities
 * Extracted from main JWT module to reduce complexity
 */

import { errors as joseErrors } from 'jose'
import { createAuthError, createError } from '@/lib/errors/enhanced-error-handler'

/**
 * JWT verification error types
 */
export type JWTErrorType =
  | 'token_expired'
  | 'invalid_token'
  | 'invalid_signature'
  | 'claim_validation_failed'

/**
 * Check if error is a jose library error
 */
export function isJoseError(error: unknown): error is joseErrors.JOSEError {
  return error instanceof joseErrors.JOSEError
}

/**
 * Check if error is a custom validation error
 */
export function isCustomValidationError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('JWT validation failed:')
}

/**
 * Check if error is an environment validation error
 */
export function isEnvironmentValidationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.includes('Test environment validation failed:') ||
      error.message.includes('Production environment validation failed:'))
  )
}

/**
 * Handle jose library errors with appropriate error types
 */
export function handleJoseError(error: joseErrors.JOSEError): never {
  if (error instanceof joseErrors.JWTExpired) {
    throw createAuthError('token_expired', error, {
      joseErrorType: 'JWTExpired',
      originalMessage: error.message,
    })
  }

  if (error instanceof joseErrors.JWTInvalid) {
    throw createAuthError('invalid_token', error, {
      joseErrorType: 'JWTInvalid',
      originalMessage: error.message,
    })
  }

  if (error instanceof joseErrors.JWSInvalid) {
    throw createAuthError('invalid_token', error, {
      joseErrorType: 'JWSInvalid',
      originalMessage: error.message,
      issue: 'signature_verification_failed',
    })
  }

  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    throw createAuthError('invalid_token', error, {
      joseErrorType: 'JWTClaimValidationFailed',
      originalMessage: error.message,
      issue: 'claim_validation_failed',
    })
  }

  // Generic jose error
  throw createAuthError('invalid_token', error, {
    joseErrorType: 'JOSEError',
    originalMessage: error.message,
  })
}

/**
 * Handle custom validation errors
 */
export function handleCustomValidationError(error: Error): never {
  throw createAuthError('invalid_token', error, {
    validationType: 'custom_validation',
    originalMessage: error.message,
  })
}

/**
 * Handle environment validation errors
 */
export function handleEnvironmentValidationError(error: Error): never {
  throw createError(
    'JWT_ENVIRONMENT_VALIDATION_ERROR',
    'JWT validation failed due to environment configuration.',
    'authentication',
    'high',
    {
      originalError: error,
      context: {
        environment: process.env.NODE_ENV,
        validationType: 'environment_specific',
      },
      actionableSteps: [
        'Check environment configuration settings',
        'Verify JWT secrets are properly configured for this environment',
        'Ensure environment-specific validation rules are correct',
      ],
      developmentDetails: `Environment validation error: ${error.message}. Check JWT configuration for ${process.env.NODE_ENV} environment.`,
      documentationLinks: ['/docs/authentication#environment-configuration'],
    }
  )
}

/**
 * Centralized JWT verification error handler
 */
export function handleJWTVerificationError(error: unknown): never {
  if (isJoseError(error)) {
    return handleJoseError(error)
  }

  if (isCustomValidationError(error)) {
    return handleCustomValidationError(error)
  }

  if (isEnvironmentValidationError(error)) {
    return handleEnvironmentValidationError(error)
  }

  // For any other errors, create a generic authentication error with context
  throw createAuthError('invalid_token', error, {
    errorType: 'unknown_jwt_error',
    originalMessage: error instanceof Error ? error.message : String(error),
  })
}

/**
 * Simple error transformation for common cases
 */
export function transformJWTError(error: unknown): Error {
  if (error instanceof Error) {
    // Transform specific error messages for compatibility
    if (error.message.includes('Token cannot be empty')) {
      return new Error('No token provided')
    }
    if (error.message.includes('Token expired')) {
      return new Error('Token expired')
    }
    if (error.message.includes('Invalid token')) {
      return new Error('Invalid token')
    }
  }

  return error instanceof Error ? error : new Error('Unknown JWT error')
}
