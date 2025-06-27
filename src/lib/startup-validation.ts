/**
 * Startup Environment Validation
 *
 * This module performs comprehensive environment validation during application startup.
 * It validates all environment variables, security configurations, and authentication
 * settings before the application starts serving requests.
 *
 * Import this module early in your application startup process to ensure
 * fail-fast behavior for misconfigured environments.
 */

import { validateEnvironmentOnStartup } from './validation/env'

// Helper function to check if validation should be skipped
function shouldSkipValidation(): boolean {
  return process.env.SKIP_ENV_VALIDATION === 'true' || process.env.NODE_ENV === 'test'
}

/**
 * Comprehensive startup validation that checks:
 * - Environment variable schema and format validation
 * - JWT secret entropy and security validation
 * - OAuth configuration validation
 * - Production security checks
 * - Database URL format validation
 *
 * This function will exit the process with code 1 if validation fails.
 */
export function validateApplicationOnStartup(): void {
  // Check if validation should be skipped (test environment or explicit skip flag)
  if (shouldSkipValidation()) {
    return
  }

  try {
    validateEnvironmentOnStartup()

    // Import env after validation
    const { env } = require('./validation/env')
    validateAuthenticationServices(env)
  } catch (_error) {
    // In test environment, throw error instead of exiting process
    if (process.env.NODE_ENV === 'test') {
      throw _error
    }

    process.exit(1)
  }
}

/**
 * Validate authentication service configurations
 */
function validateAuthenticationServices(env: Record<string, unknown>): void {
  const enabledServices: string[] = []

  // Check OAuth services
  if (env.ENABLE_OAUTH) {
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      enabledServices.push('GitHub OAuth')
    } else if (env.NODE_ENV === 'production') {
      throw new Error('OAuth is enabled but GitHub credentials are missing in production')
    }
  }

  // Ensure at least one authentication method is available
  if (enabledServices.length === 0) {
    throw new Error('No authentication services are properly configured')
  }
}

/**
 * Environment validation summary for development
 */
export function printEnvironmentSummary(): void {
  try {
    require('./validation/env')
    // TODO: Implement environment summary printing
  } catch (_error) {
    // Environment summary unavailable - validation failed
  }
}

/**
 * Check if the application is ready to handle authentication requests
 */
export function checkAuthenticationReadiness(): {
  ready: boolean
  services: string[]
  issues: string[]
} {
  const services: string[] = []
  const issues: string[] = []

  try {
    const { env } = require('./validation/env')

    // Check OAuth
    if (env.ENABLE_OAUTH) {
      if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
        services.push('GitHub OAuth')
      } else {
        issues.push('OAuth: Missing GitHub credentials')
      }
    }

    // Check JWT
    if (!env.JWT_SECRET) {
      issues.push('JWT: Missing secret')
    }

    return {
      ready: issues.length === 0 && services.length > 0,
      services,
      issues,
    }
  } catch (error) {
    return {
      ready: false,
      services: [],
      issues: [
        `Environment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    }
  }
}
