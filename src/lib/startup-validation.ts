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

import { validateWebAuthnConfig } from './auth/webauthn-config'
import { validateEnvironmentOnStartup } from './validation/env'

/**
 * Comprehensive startup validation that checks:
 * - Environment variable schema and format validation
 * - JWT secret entropy and security validation
 * - OAuth configuration validation
 * - WebAuthn domain and origin validation
 * - Production security checks
 * - Database URL format validation
 *
 * This function will exit the process with code 1 if validation fails.
 */
export function validateApplicationOnStartup(): void {
  console.log('🔍 Starting application environment validation...')

  try {
    // 1. Core environment variable validation
    console.log('  Validating environment variables...')
    validateEnvironmentOnStartup()

    // Import env after validation
    const { env } = require('./validation/env')

    // 2. WebAuthn specific validation
    if (env.ENABLE_WEBAUTHN) {
      console.log('  Validating WebAuthn configuration...')
      validateWebAuthnConfig()
    }

    // 3. Additional authentication service checks
    console.log('  Validating authentication services...')
    validateAuthenticationServices(env)

    console.log('✅ All environment validation checks passed!')
    console.log(`🚀 Application ready to start in ${env.NODE_ENV} mode`)
  } catch (_error) {
    console.error('❌ Application startup validation failed!')
    console.error('Please fix the configuration issues above before starting the application.')
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

  // Check WebAuthn
  if (env.ENABLE_WEBAUTHN) {
    enabledServices.push('WebAuthn')
  }

  // Ensure at least one authentication method is available
  if (enabledServices.length === 0) {
    throw new Error('No authentication services are properly configured')
  }

  console.log(`    ✓ Authentication services enabled: ${enabledServices.join(', ')}`)
}

/**
 * Environment validation summary for development
 */
export function printEnvironmentSummary(): void {
  try {
    const { env } = require('./validation/env')

    console.log('\n📋 Environment Configuration Summary:')
    console.log(`   Environment: ${env.NODE_ENV}`)
    console.log(`   Database: ${env.DATABASE_URL ? 'Configured' : 'Missing'}`)
    console.log(`   JWT Secret: ${env.JWT_SECRET ? 'Configured' : 'Missing'}`)
    console.log(`   OAuth: ${env.ENABLE_OAUTH ? 'Enabled' : 'Disabled'}`)
    console.log(`   WebAuthn: ${env.ENABLE_WEBAUTHN ? 'Enabled' : 'Disabled'}`)
    console.log(`   Encryption: ${env.ENCRYPTION_KEY ? 'Configured' : 'Using default'}`)
    console.log(`   Audit Logs: ${env.ENABLE_AUDIT_LOGS ? 'Enabled' : 'Disabled'}`)
    console.log('')
  } catch (error) {
    console.warn(
      'Could not print environment summary:',
      error instanceof Error ? error.message : 'Unknown error'
    )
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

    // Check WebAuthn
    if (env.ENABLE_WEBAUTHN) {
      try {
        validateWebAuthnConfig()
        services.push('WebAuthn')
      } catch (error) {
        issues.push(`WebAuthn: ${error instanceof Error ? error.message : 'Configuration error'}`)
      }
    }

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
