/**
 * GitHub API Client Startup Validation
 * Validates GitHub configuration during application startup
 * Provides comprehensive validation and health checking for production readiness
 */

import { gitHubRuntimeValidator, type ValidationResult } from './runtime-validator'

export interface StartupValidationOptions {
  /** Whether to fail startup on unhealthy configuration */
  failOnUnhealthy?: boolean
  /** Whether to fail startup on degraded configuration */
  failOnDegraded?: boolean
  /** Timeout for validation in milliseconds */
  timeoutMs?: number
  /** Whether to log validation results */
  silent?: boolean
}

export interface StartupValidationResult {
  /** Whether startup should proceed */
  shouldProceed: boolean
  /** Validation result details */
  validation: ValidationResult
  /** Any warnings to display */
  warnings: string[]
  /** Any critical errors */
  errors: string[]
}

/**
 * Validate GitHub configuration during application startup
 */
export async function validateGitHubStartup(
  options: StartupValidationOptions = {}
): Promise<StartupValidationResult> {
  const {
    failOnUnhealthy = true,
    failOnDegraded = false,
    timeoutMs = 10000,
    silent = false,
  } = options

  const startTime = Date.now()

  try {
    // Run validation with timeout
    const validation = await Promise.race([
      gitHubRuntimeValidator.validateConfiguration(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Validation timeout')), timeoutMs)
      ),
    ])

    const warnings: string[] = []
    const errors: string[] = []
    let shouldProceed = true

    // Analyze validation results
    const { status, checks } = validation

    // Check overall status
    if (status === 'unhealthy') {
      errors.push('GitHub configuration is unhealthy')
      if (failOnUnhealthy) {
        shouldProceed = false
      }
    } else if (status === 'degraded') {
      warnings.push('GitHub configuration is degraded')
      if (failOnDegraded) {
        shouldProceed = false
      }
    }

    // Check individual components
    analyzeEnvironmentCheck(checks.environment, warnings, errors)
    analyzeAuthenticationCheck(checks.authentication, warnings, errors)
    analyzeDependenciesCheck(checks.dependencies, warnings, errors)
    analyzeConnectivityCheck(checks.connectivity, warnings, errors)

    // Log results if not silent
    if (!silent) {
      logValidationResults(validation, warnings, errors, Date.now() - startTime)
    }

    return {
      shouldProceed,
      validation,
      warnings,
      errors,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown validation error'
    const errors = [`Startup validation failed: ${errorMessage}`]

    if (!silent) {
      console.error('[GitHub Startup Validation] Failed:', errorMessage)
    }

    return {
      shouldProceed: !failOnUnhealthy,
      validation: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          environment: { status: 'unhealthy', details: errorMessage },
          authentication: { status: 'unhealthy', method: 'none', details: errorMessage },
          dependencies: { status: 'unhealthy', missing: [], details: errorMessage },
          connectivity: { status: 'unhealthy', details: errorMessage },
        },
      },
      warnings: [],
      errors,
    }
  }
}

/**
 * Analyze environment validation results
 */
function analyzeEnvironmentCheck(
  check: ValidationResult['checks']['environment'],
  warnings: string[],
  errors: string[]
): void {
  if (check.status === 'unhealthy') {
    errors.push(`Environment configuration issue: ${check.details || 'Unknown error'}`)
  } else if (check.status === 'degraded') {
    warnings.push(
      `Environment configuration warning: ${check.details || 'Configuration issues detected'}`
    )
  }
}

/**
 * Analyze authentication validation results
 */
function analyzeAuthenticationCheck(
  check: ValidationResult['checks']['authentication'],
  warnings: string[],
  errors: string[]
): void {
  if (check.status === 'unhealthy') {
    errors.push(
      `Authentication issue: ${check.details || 'Authentication not configured properly'}`
    )
  } else if (check.status === 'degraded') {
    warnings.push(
      `Authentication warning: ${check.details || 'Authentication configuration issues'}`
    )
  }

  // Provide guidance based on authentication method
  if (check.method === 'none') {
    errors.push('No GitHub authentication configured. Set GITHUB_TOKEN or GitHub App credentials.')
  } else if (check.method === 'token' && check.status === 'healthy') {
    // Token auth is working
  } else if (check.method === 'app' && check.status === 'healthy') {
    // App auth is working
  }
}

/**
 * Analyze dependencies validation results
 */
function analyzeDependenciesCheck(
  check: ValidationResult['checks']['dependencies'],
  warnings: string[],
  errors: string[]
): void {
  if (check.status === 'unhealthy') {
    errors.push(`Missing critical dependencies: ${check.missing.join(', ')}`)
    errors.push(
      'Install missing packages: pnpm install @octokit/rest @octokit/graphql @octokit/webhooks'
    )
  } else if (check.status === 'degraded') {
    warnings.push(`Some optional dependencies missing: ${check.missing.join(', ')}`)
  }
}

/**
 * Analyze connectivity validation results
 */
function analyzeConnectivityCheck(
  check: ValidationResult['checks']['connectivity'],
  warnings: string[],
  errors: string[]
): void {
  if (check.status === 'unhealthy') {
    errors.push(`GitHub API connectivity issue: ${check.details || 'Cannot connect to GitHub API'}`)

    if (check.details?.includes('timeout')) {
      errors.push(
        'GitHub API connection timeout - check network connectivity and firewall settings'
      )
    } else if (check.details?.includes('authentication')) {
      errors.push('GitHub API authentication failed - verify token or app credentials')
    }
  } else if (check.status === 'degraded') {
    warnings.push(`GitHub API performance issue: ${check.details || 'Slow response times'}`)

    if (check.response_time_ms && check.response_time_ms > 3000) {
      warnings.push(`Slow GitHub API response time: ${check.response_time_ms}ms`)
    }
  }
}

/**
 * Log validation results to console
 */
function logValidationResults(
  validation: ValidationResult,
  warnings: string[],
  errors: string[],
  durationMs: number
): void {
  const { status, checks } = validation

  console.log('\n=== GitHub Startup Validation Results ===')
  console.log(`Overall Status: ${status.toUpperCase()}`)
  console.log(`Validation Duration: ${durationMs}ms`)
  console.log(`Timestamp: ${validation.timestamp}`)

  // Log individual check results
  console.log('\nComponent Status:')
  console.log(`  Environment: ${checks.environment.status}`)
  console.log(`  Authentication: ${checks.authentication.status} (${checks.authentication.method})`)
  console.log(`  Dependencies: ${checks.dependencies.status}`)
  console.log(
    `  Connectivity: ${checks.connectivity.status}${
      checks.connectivity.response_time_ms ? ` (${checks.connectivity.response_time_ms}ms)` : ''
    }`
  )

  // Log warnings
  if (warnings.length > 0) {
    console.log('\nWarnings:')
    warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`))
  }

  // Log errors
  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(error => console.error(`  ❌ ${error}`))
  }

  console.log('==========================================\n')
}

/**
 * Quick startup health check (minimal validation)
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
 * Wait for GitHub configuration to become healthy
 */
export async function waitForHealthyConfiguration(
  maxWaitMs = 30000,
  checkIntervalMs = 1000
): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const isHealthy = await quickStartupCheck()
      if (isHealthy) {
        return true
      }
    } catch {
      // Continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, checkIntervalMs))
  }

  return false
}

/**
 * Validate GitHub configuration for production deployment
 */
export async function validateProductionReadiness(): Promise<{
  ready: boolean
  issues: string[]
  recommendations: string[]
}> {
  const validation = await gitHubRuntimeValidator.validateConfiguration()
  const issues: string[] = []
  const recommendations: string[] = []

  // Check for production-critical issues
  if (validation.status === 'unhealthy') {
    issues.push('Configuration is unhealthy - not ready for production')
  }

  // Environment checks
  if (validation.checks.environment.status !== 'healthy') {
    issues.push('Environment configuration issues detected')
    recommendations.push('Review environment variables and configuration')
  }

  // Authentication checks
  if (validation.checks.authentication.status !== 'healthy') {
    issues.push('Authentication configuration issues detected')
    if (validation.checks.authentication.method === 'token') {
      recommendations.push('Consider using GitHub App authentication for production')
    }
  }

  // Dependencies checks
  if (validation.checks.dependencies.status !== 'healthy') {
    issues.push('Missing required dependencies')
    recommendations.push('Ensure all required packages are installed')
  }

  // Connectivity checks
  if (validation.checks.connectivity.status !== 'healthy') {
    issues.push('GitHub API connectivity issues')
    recommendations.push('Verify network connectivity and API access')
  }

  // Performance recommendations
  if (
    validation.checks.connectivity.response_time_ms &&
    validation.checks.connectivity.response_time_ms > 1000
  ) {
    recommendations.push(
      'Consider optimizing network configuration for better GitHub API performance'
    )
  }

  return {
    ready: issues.length === 0,
    issues,
    recommendations,
  }
}
