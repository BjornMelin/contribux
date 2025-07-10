/**
 * Startup Environment Validation for Contribux
 * Validates application configuration on startup with enhanced error reporting
 */

import { validateCompleteEnvironment } from '@/lib/errors/environment-error-handler'
import { ErrorHandler } from '@/lib/errors/enhanced-error-handler'

/**
 * Validate application environment on startup
 * This should be called during application initialization
 */
export async function validateStartupEnvironment(): Promise<{
  isValid: boolean
  environment: string
  validatedAt: string
}> {
  try {
    console.log('🔍 Validating application environment...')

    const validation = validateCompleteEnvironment()

    console.log(`✅ Environment validation successful for ${validation.environment}`)
    console.log(`📝 Validated at: ${validation.validatedAt}`)

    return validation
  } catch (error) {
    // Enhanced error handling for startup failures
    console.error('❌ Environment validation failed!')

    if (error && typeof error === 'object' && 'correlationId' in error) {
      // This is already an enhanced error, log it properly
      const enhancedError = error as any
      console.error(`🔗 Correlation ID: ${enhancedError.correlationId}`)
      console.error(`📋 Error Code: ${enhancedError.code}`)
      console.error(`💬 Message: ${enhancedError.message}`)

      if (enhancedError.actionableSteps?.length > 0) {
        console.error('🛠️  Actionable Steps:')
        enhancedError.actionableSteps.forEach((step: string, index: number) => {
          console.error(`   ${index + 1}. ${step}`)
        })
      }

      if (enhancedError.documentationLinks?.length > 0) {
        console.error('📚 Documentation:')
        enhancedError.documentationLinks.forEach((link: string) => {
          console.error(`   - ${link}`)
        })
      }

      // In development, show detailed context
      if (process.env.NODE_ENV === 'development' && enhancedError.context) {
        console.error('🔧 Debug Context:', enhancedError.context)
      }
    } else {
      // Create enhanced error for unexpected startup failures
      const startupError = ErrorHandler.createError(
        'STARTUP_VALIDATION_ERROR',
        'Application startup validation failed.',
        'configuration',
        'critical',
        {
          originalError: error,
          context: {
            phase: 'startup',
            environment: process.env.NODE_ENV || 'unknown',
          },
          actionableSteps: [
            'Check all environment variables are properly set',
            'Verify .env file exists and contains required configuration',
            'Ensure all external services are accessible',
            'Review the error details above for specific issues',
          ],
          developmentDetails: `Startup validation failed: ${error instanceof Error ? error.message : String(error)}`,
          documentationLinks: [
            '/docs/deployment#environment-setup',
            '/docs/troubleshooting#startup-errors',
          ],
          productionMessage:
            'Application configuration error prevented startup. Please contact support.',
        }
      )

      ErrorHandler.logError(startupError)
      console.error(`🔗 Correlation ID: ${startupError.correlationId}`)
    }

    // Exit the process for critical configuration errors
    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 Critical configuration error in production. Exiting...')
      process.exit(1)
    } else {
      console.error('⚠️  Development mode: Continuing despite configuration errors')
      console.error('   → Fix configuration issues before deploying to production')
    }

    throw error
  }
}

/**
 * Validate environment with graceful degradation
 * For use in non-critical paths where the application can continue with reduced functionality
 */
export async function validateEnvironmentWithGracefulDegradation(): Promise<{
  isValid: boolean
  warnings: string[]
  errors: string[]
  canContinue: boolean
}> {
  const warnings: string[] = []
  const errors: string[] = []
  let canContinue = true

  try {
    await validateStartupEnvironment()
    return {
      isValid: true,
      warnings,
      errors,
      canContinue: true,
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'severity' in error) {
      const enhancedError = error as any

      if (enhancedError.severity === 'critical' || enhancedError.severity === 'high') {
        errors.push(enhancedError.message)
        canContinue = false
      } else {
        warnings.push(enhancedError.message)
      }
    } else {
      errors.push(error instanceof Error ? error.message : String(error))
      canContinue = false
    }

    return {
      isValid: false,
      warnings,
      errors,
      canContinue,
    }
  }
}

/**
 * Validate specific environment aspects for targeted checks
 */
export interface EnvironmentCheckResult {
  component: string
  isValid: boolean
  message?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export async function validateSpecificEnvironmentAspects(
  aspects: string[]
): Promise<EnvironmentCheckResult[]> {
  const results: EnvironmentCheckResult[] = []

  for (const aspect of aspects) {
    try {
      switch (aspect) {
        case 'database':
          const { validateDatabaseConnection } = await import(
            '@/lib/errors/environment-error-handler'
          )
          validateDatabaseConnection()
          results.push({
            component: 'database',
            isValid: true,
            severity: 'low',
          })
          break

        case 'api_keys':
          const { validateApiKeys } = await import('@/lib/errors/environment-error-handler')
          validateApiKeys()
          results.push({
            component: 'api_keys',
            isValid: true,
            severity: 'low',
          })
          break

        case 'production':
          const { validateProductionEnvironment } = await import(
            '@/lib/errors/environment-error-handler'
          )
          validateProductionEnvironment()
          results.push({
            component: 'production',
            isValid: true,
            severity: 'low',
          })
          break

        default:
          results.push({
            component: aspect,
            isValid: false,
            message: `Unknown environment aspect: ${aspect}`,
            severity: 'medium',
          })
      }
    } catch (error) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'

      if (error && typeof error === 'object' && 'severity' in error) {
        severity = (error as any).severity
      }

      results.push({
        component: aspect,
        isValid: false,
        message: error instanceof Error ? error.message : String(error),
        severity,
      })
    }
  }

  return results
}

/**
 * Format environment validation results for logging
 */
export function formatValidationResults(results: EnvironmentCheckResult[]): string {
  const lines: string[] = []

  lines.push('Environment Validation Results:')
  lines.push('=====================================')

  for (const result of results) {
    const status = result.isValid ? '✅' : '❌'
    const severity =
      result.severity === 'critical'
        ? '🚨'
        : result.severity === 'high'
          ? '⚠️'
          : result.severity === 'medium'
            ? '⚡'
            : 'ℹ️'

    lines.push(
      `${status} ${severity} ${result.component}: ${result.message || (result.isValid ? 'OK' : 'Failed')}`
    )
  }

  const failedCount = results.filter(r => !r.isValid).length
  const criticalCount = results.filter(r => !r.isValid && r.severity === 'critical').length

  lines.push('')
  lines.push(`Summary: ${results.length - failedCount}/${results.length} checks passed`)

  if (criticalCount > 0) {
    lines.push(`🚨 ${criticalCount} critical issues must be resolved before production deployment`)
  }

  return lines.join('\n')
}
