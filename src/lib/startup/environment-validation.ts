/**
 * Startup Environment Validation for Contribux
 * Validates application configuration on startup with enhanced error reporting
 */

import { ErrorHandler } from '@/lib/errors/enhanced-error-handler'
import { validateCompleteEnvironment } from '@/lib/errors/environment-error-handler'

/**
 * Enhanced error interface for startup validation
 */
interface EnhancedStartupError extends Error {
  name: string
  correlationId?: string
  actionableSteps?: string[]
  documentationLinks?: string[]
  context?: unknown
  [key: string]: unknown
}

/**
 * Check if error is an enhanced error with correlation ID
 */
function isEnhancedError(error: unknown): error is EnhancedStartupError {
  return error != null && typeof error === 'object' && 'correlationId' in error
}

/**
 * Process enhanced error details for logging
 */
function processEnhancedError(enhancedError: EnhancedStartupError): void {
  if (enhancedError.actionableSteps?.length) {
    enhancedError.actionableSteps.forEach((step: string, index: number) => {
      void step
      void index
    })
  }

  if (enhancedError.documentationLinks?.length) {
    enhancedError.documentationLinks.forEach((link: string) => {
      void link
    })
  }

  if (process.env.NODE_ENV === 'development' && enhancedError.context) {
    void enhancedError.context
  }
}

/**
 * Create startup validation error
 */
function createStartupValidationError(
  originalError: unknown
): import('@/lib/errors/enhanced-error-handler').EnhancedError {
  return ErrorHandler.createError(
    'STARTUP_VALIDATION_ERROR',
    'Application startup validation failed.',
    'configuration',
    'critical',
    {
      originalError,
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
      developmentDetails: `Startup validation failed: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
      documentationLinks: [
        '/docs/deployment#environment-setup',
        '/docs/troubleshooting#startup-errors',
      ],
      productionMessage:
        'Application configuration error prevented startup. Please contact support.',
    }
  )
}

/**
 * Handle startup error processing and exit logic
 */
function handleStartupError(error: unknown): never {
  if (isEnhancedError(error)) {
    processEnhancedError(error)
  } else {
    const startupError = createStartupValidationError(error)
    ErrorHandler.logError(startupError)
  }

  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }

  throw error
}

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
    return validateCompleteEnvironment()
  } catch (error) {
    handleStartupError(error)
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
      const enhancedError = error as Error & {
        severity?: string
        message: string
        [key: string]: unknown
      }

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
        case 'database': {
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
        }

        case 'api_keys': {
          const { validateApiKeys } = await import('@/lib/errors/environment-error-handler')
          validateApiKeys()
          results.push({
            component: 'api_keys',
            isValid: true,
            severity: 'low',
          })
          break
        }

        case 'production': {
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
        }

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
        const errorWithSeverity = error as { severity?: 'low' | 'medium' | 'high' | 'critical' }
        severity = errorWithSeverity.severity || 'medium'
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
 * Severity icon mapping for validation results
 */
const SEVERITY_ICONS = {
  critical: '🚨',
  high: '⚠️',
  medium: '⚡',
  low: 'ℹ️',
} as const

/**
 * Get status icon for validation result
 */
function getStatusIcon(isValid: boolean): string {
  return isValid ? '✅' : '❌'
}

/**
 * Get severity icon for validation result
 */
function getSeverityIcon(severity: EnvironmentCheckResult['severity']): string {
  return SEVERITY_ICONS[severity]
}

/**
 * Get result message for validation result
 */
function getResultMessage(result: EnvironmentCheckResult): string {
  if (result.message) {
    return result.message
  }
  return result.isValid ? 'OK' : 'Failed'
}

/**
 * Format single validation result line
 */
function formatResultLine(result: EnvironmentCheckResult): string {
  const status = getStatusIcon(result.isValid)
  const severity = getSeverityIcon(result.severity)
  const message = getResultMessage(result)

  return `${status} ${severity} ${result.component}: ${message}`
}

/**
 * Create validation summary statistics
 */
function createValidationSummary(results: EnvironmentCheckResult[]): string[] {
  const failedCount = results.filter(r => !r.isValid).length
  const criticalCount = results.filter(r => !r.isValid && r.severity === 'critical').length
  const passedCount = results.length - failedCount

  const summaryLines = ['', `Summary: ${passedCount}/${results.length} checks passed`]

  if (criticalCount > 0) {
    summaryLines.push(
      `🚨 ${criticalCount} critical issues must be resolved before production deployment`
    )
  }

  return summaryLines
}

/**
 * Format environment validation results for logging
 */
export function formatValidationResults(results: EnvironmentCheckResult[]): string {
  const lines = [
    'Environment Validation Results:',
    '=====================================',
    ...results.map(formatResultLine),
    ...createValidationSummary(results),
  ]

  return lines.join('\n')
}
