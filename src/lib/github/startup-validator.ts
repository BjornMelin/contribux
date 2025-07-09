/**
 * Simplified GitHub Startup Validation
 * Streamlined validation for GitHub configuration
 */

import { gitHubRuntimeValidator, type ValidationResult } from './runtime-validator'

export interface StartupValidationOptions {
  failOnUnhealthy?: boolean
  timeoutMs?: number
  silent?: boolean
}

export interface StartupValidationResult {
  shouldProceed: boolean
  validation: ValidationResult
  warnings: string[]
  errors: string[]
}

/**
 * Simplified GitHub startup validation
 */
export async function validateGitHubStartup(
  options: StartupValidationOptions = {}
): Promise<StartupValidationResult> {
  const { failOnUnhealthy = true, timeoutMs = 10000, silent = false } = options

  try {
    const validation = await Promise.race([
      gitHubRuntimeValidator.validateConfiguration(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Validation timeout')), timeoutMs)
      ),
    ])

    const result = analyzeValidation(validation, failOnUnhealthy)

    if (!silent && result.errors.length > 0) {
      // Log validation errors in non-silent mode
      // Using console in validation context is acceptable for startup diagnostics
      // biome-ignore lint/suspicious/noConsole: Validation errors need logging
      console.error('GitHub validation errors:', result.errors)
    }

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Validation failed'
    return {
      shouldProceed: !failOnUnhealthy,
      validation: createFailedValidation(errorMsg),
      warnings: [],
      errors: [errorMsg],
    }
  }
}

/**
 * Analyze validation results and extract issues
 */
function analyzeValidation(
  validation: ValidationResult,
  failOnUnhealthy: boolean
): StartupValidationResult {
  const warnings: string[] = []
  const errors: string[] = []

  // Check overall status
  if (validation.status === 'unhealthy') {
    errors.push('GitHub configuration is unhealthy')
  } else if (validation.status === 'degraded') {
    warnings.push('GitHub configuration is degraded')
  }

  // Check individual components
  const { checks } = validation

  if (checks.environment.status === 'unhealthy') {
    errors.push(`Environment: ${checks.environment.details || 'Configuration error'}`)
  }

  if (checks.authentication.status === 'unhealthy') {
    errors.push(`Authentication: ${checks.authentication.details || 'Auth not configured'}`)
    if (checks.authentication.method === 'none') {
      errors.push('Set GITHUB_TOKEN or GitHub App credentials')
    }
  }

  if (checks.dependencies.status === 'unhealthy') {
    errors.push(`Dependencies: ${checks.dependencies.missing.join(', ')}`)
  }

  if (checks.connectivity.status === 'unhealthy') {
    errors.push(`Connectivity: ${checks.connectivity.details || 'Cannot connect to GitHub'}`)
  }

  return {
    shouldProceed: !(failOnUnhealthy && validation.status === 'unhealthy'),
    validation,
    warnings,
    errors,
  }
}

/**
 * Create failed validation response
 */
function createFailedValidation(errorMessage: string): ValidationResult {
  return {
    status: 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      environment: { status: 'unhealthy', details: errorMessage },
      authentication: { status: 'unhealthy', method: 'none', details: errorMessage },
      dependencies: { status: 'unhealthy', missing: [], details: errorMessage },
      connectivity: { status: 'unhealthy', details: errorMessage },
    },
  }
}

/**
 * Quick health check
 */
export async function quickStartupCheck(): Promise<boolean> {
  try {
    const status = await gitHubRuntimeValidator.quickHealthCheck()
    return status === 'healthy'
  } catch {
    return false
  }
}

/**
 * Wait for healthy configuration with simplified polling
 */
export async function waitForHealthyConfiguration(maxWaitMs = 30000): Promise<boolean> {
  const startTime = Date.now()
  const checkInterval = 1000

  while (Date.now() - startTime < maxWaitMs) {
    if (await quickStartupCheck()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }
  return false
}

/**
 * Simple production readiness check
 */
export async function validateProductionReadiness(): Promise<{
  ready: boolean
  issues: string[]
}> {
  const validation = await gitHubRuntimeValidator.validateConfiguration()
  const issues: string[] = []

  if (validation.status === 'unhealthy') {
    issues.push('Configuration is unhealthy')

    // Add specific issues
    Object.entries(validation.checks).forEach(([check, result]) => {
      if (result.status === 'unhealthy') {
        issues.push(`${check}: ${result.details || 'Not configured'}`)
      }
    })
  }

  return {
    ready: issues.length === 0,
    issues,
  }
}
