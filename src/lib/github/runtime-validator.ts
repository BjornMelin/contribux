/**
 * GitHub API Client Runtime Configuration Validator
 * Provides comprehensive runtime validation for GitHub API client configuration
 * Following patterns from health check and database monitoring implementations
 */

import { z } from 'zod'

// GitHub token format validation schema
const GitHubTokenSchema = z.object({
  token: z
    .string()
    .min(1, 'GitHub token is required')
    .refine(
      token => {
        // GitHub personal access tokens start with ghp_, ghs_, or gho_
        const validPrefixes = ['ghp_', 'ghs_', 'gho_']
        return validPrefixes.some(prefix => token.startsWith(prefix))
      },
      {
        message: 'Invalid GitHub token format. Must start with ghp_, ghs_, or gho_',
      }
    ),
})

// GitHub App configuration validation schema
const GitHubAppConfigSchema = z.object({
  appId: z
    .string()
    .min(1, 'GitHub App ID is required')
    .regex(/^\d+$/, 'GitHub App ID must be numeric'),
  privateKey: z
    .string()
    .min(1, 'GitHub App private key is required')
    .refine(
      key => {
        try {
          // Validate Base64 encoding and PEM format
          if (key.includes('-----BEGIN')) {
            return (
              key.includes('-----BEGIN PRIVATE KEY-----') ||
              key.includes('-----BEGIN RSA PRIVATE KEY-----')
            )
          }
          // Try to decode base64
          Buffer.from(key, 'base64')
          return true
        } catch {
          return false
        }
      },
      {
        message: 'Invalid private key format. Must be PEM format or valid Base64 encoding',
      }
    ),
  webhookSecret: z.string().optional(),
})

// Environment variables validation schema
const EnvironmentConfigSchema = z.object({
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

// Runtime validation result schema
const ValidationResultSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  checks: z.object({
    environment: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      details: z.string().optional(),
    }),
    authentication: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      method: z.enum(['token', 'app', 'none']),
      details: z.string().optional(),
    }),
    dependencies: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      missing: z.array(z.string()).default([]),
      details: z.string().optional(),
    }),
    connectivity: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      response_time_ms: z.number().optional(),
      details: z.string().optional(),
    }),
  }),
})

// Export types for TypeScript
export type GitHubTokenConfig = z.infer<typeof GitHubTokenSchema>
export type GitHubAppConfig = z.infer<typeof GitHubAppConfigSchema>
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>
export type ValidationResult = z.infer<typeof ValidationResultSchema>

// Required package dependencies
const REQUIRED_PACKAGES = ['@octokit/rest', '@octokit/graphql', '@octokit/webhooks'] as const

/**
 * GitHub API Client Runtime Validator
 * Validates configuration and runtime environment for GitHub API operations
 */
export class GitHubRuntimeValidator {
  private lastValidation: ValidationResult | null = null
  private validationCache: Map<string, { result: ValidationResult; timestamp: number }> = new Map()
  private readonly cacheTimeout = 30000 // 30 seconds cache

  /**
   * Perform comprehensive runtime validation
   */
  async validateConfiguration(): Promise<ValidationResult> {
    const cacheKey = 'runtime-validation'
    const cached = this.validationCache.get(cacheKey)

    // Return cached result if still valid
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.result
    }

    const startTime = Date.now()

    try {
      // Validate environment variables
      const envCheck = await this.validateEnvironment()

      // Validate authentication configuration
      const authCheck = await this.validateAuthentication()

      // Validate package dependencies
      const depsCheck = await this.validateDependencies()

      // Validate GitHub API connectivity
      const connectivityCheck = await this.validateConnectivity()

      // Determine overall status
      const overallStatus = this.determineOverallStatus([
        envCheck.status,
        authCheck.status,
        depsCheck.status,
        connectivityCheck.status,
      ])

      const result: ValidationResult = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: {
          environment: envCheck,
          authentication: authCheck,
          dependencies: depsCheck,
          connectivity: connectivityCheck,
        },
      }

      // Validate and cache result
      const validatedResult = ValidationResultSchema.parse(result)
      this.validationCache.set(cacheKey, {
        result: validatedResult,
        timestamp: Date.now(),
      })
      this.lastValidation = validatedResult

      return validatedResult
    } catch (error) {
      // Return unhealthy status if validation itself fails
      const errorResult: ValidationResult = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          environment: {
            status: 'unhealthy',
            details: error instanceof Error ? error.message : 'Validation failed',
          },
          authentication: {
            status: 'unhealthy',
            method: 'none',
            details: 'Validation failed',
          },
          dependencies: {
            status: 'unhealthy',
            missing: [],
            details: 'Validation failed',
          },
          connectivity: {
            status: 'unhealthy',
            response_time_ms: Date.now() - startTime,
            details: 'Validation failed',
          },
        },
      }

      this.lastValidation = errorResult
      return errorResult
    }
  }

  /**
   * Validate environment variables
   */
  private async validateEnvironment(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    details?: string
  }> {
    try {
      const envConfig = {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        GITHUB_APP_ID: process.env.GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
        NODE_ENV: process.env.NODE_ENV || 'development',
      }

      const validatedEnv = EnvironmentConfigSchema.parse(envConfig)

      // Check if any authentication method is configured
      const hasToken = validatedEnv.GITHUB_TOKEN
      const hasApp = validatedEnv.GITHUB_APP_ID && validatedEnv.GITHUB_PRIVATE_KEY

      if (!hasToken && !hasApp) {
        return {
          status: 'unhealthy',
          details: 'No GitHub authentication configured (missing token or app credentials)',
        }
      }

      return { status: 'healthy' }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Environment validation failed',
      }
    }
  }

  /**
   * Validate authentication configuration
   */
  private async validateAuthentication(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    method: 'token' | 'app' | 'none'
    details?: string
  }> {
    const token = process.env.GITHUB_TOKEN
    const appId = process.env.GITHUB_APP_ID
    const privateKey = process.env.GITHUB_PRIVATE_KEY

    // Check for token authentication
    if (token) {
      try {
        GitHubTokenSchema.parse({ token })
        return {
          status: 'healthy',
          method: 'token',
        }
      } catch (error) {
        return {
          status: 'unhealthy',
          method: 'token',
          details: error instanceof Error ? error.message : 'Invalid token format',
        }
      }
    }

    // Check for GitHub App authentication
    if (appId && privateKey) {
      try {
        GitHubAppConfigSchema.parse({
          appId,
          privateKey,
          webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
        })
        return {
          status: 'healthy',
          method: 'app',
        }
      } catch (error) {
        return {
          status: 'unhealthy',
          method: 'app',
          details: error instanceof Error ? error.message : 'Invalid app configuration',
        }
      }
    }

    return {
      status: 'unhealthy',
      method: 'none',
      details: 'No valid authentication method configured',
    }
  }

  /**
   * Validate required package dependencies
   */
  private async validateDependencies(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    missing: string[]
    details?: string
  }> {
    const missing: string[] = []

    for (const packageName of REQUIRED_PACKAGES) {
      try {
        await import(packageName)
      } catch {
        missing.push(packageName)
      }
    }

    if (missing.length === 0) {
      return { status: 'healthy', missing: [] }
    }

    if (missing.length < REQUIRED_PACKAGES.length) {
      return {
        status: 'degraded',
        missing,
        details: `Some optional packages missing: ${missing.join(', ')}`,
      }
    }

    return {
      status: 'unhealthy',
      missing,
      details: `Critical packages missing: ${missing.join(', ')}`,
    }
  }

  /**
   * Validate GitHub API connectivity
   */
  private async validateConnectivity(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    response_time_ms?: number
    details?: string
  }> {
    const startTime = Date.now()

    try {
      // Import Octokit dynamically to avoid startup dependencies
      const { Octokit } = await import('@octokit/rest')

      // Create a minimal Octokit instance for testing
      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
        request: {
          timeout: 5000, // 5 second timeout
        },
      })

      // Test basic API connectivity with rate limit endpoint (doesn't count against rate limit)
      await octokit.rest.rateLimit.get()

      const responseTime = Date.now() - startTime

      if (responseTime > 3000) {
        return {
          status: 'degraded',
          response_time_ms: responseTime,
          details: 'Slow GitHub API response',
        }
      }

      return {
        status: 'healthy',
        response_time_ms: responseTime,
      }
    } catch (error) {
      const responseTime = Date.now() - startTime

      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          status: 'unhealthy',
          response_time_ms: responseTime,
          details: 'GitHub API timeout',
        }
      }

      return {
        status: 'unhealthy',
        response_time_ms: responseTime,
        details: error instanceof Error ? error.message : 'GitHub API connectivity failed',
      }
    }
  }

  /**
   * Determine overall status from individual check statuses
   */
  private determineOverallStatus(
    statuses: Array<'healthy' | 'degraded' | 'unhealthy'>
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (statuses.includes('unhealthy')) {
      return 'unhealthy'
    }

    if (statuses.includes('degraded')) {
      return 'degraded'
    }

    return 'healthy'
  }

  /**
   * Get the last validation result
   */
  getLastValidation(): ValidationResult | null {
    return this.lastValidation
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear()
  }

  /**
   * Quick health check without full validation
   */
  async quickHealthCheck(): Promise<'healthy' | 'degraded' | 'unhealthy'> {
    // Use cached result if available and recent
    const cached = this.validationCache.get('runtime-validation')
    if (cached && Date.now() - cached.timestamp < 10000) {
      // 10 second cache for quick checks
      return cached.result.status
    }

    // Perform minimal checks
    const hasAuth = !!(
      process.env.GITHUB_TOKEN ||
      (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY)
    )

    if (!hasAuth) {
      return 'unhealthy'
    }

    try {
      // Quick dependency check
      await import('@octokit/rest')
      return 'healthy'
    } catch {
      return 'degraded'
    }
  }
}

// Export singleton instance
export const gitHubRuntimeValidator = new GitHubRuntimeValidator()

// Export validation schemas for external use
export { GitHubTokenSchema, GitHubAppConfigSchema, EnvironmentConfigSchema, ValidationResultSchema }
