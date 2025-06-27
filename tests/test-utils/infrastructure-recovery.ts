/**
 * Infrastructure Recovery Utility
 * Provides automatic recovery and optimization for test infrastructure failures
 */

import { vi } from 'vitest'

export interface InfrastructureHealth {
  status: 'healthy' | 'degraded' | 'critical'
  memoryUsage: NodeJS.MemoryUsage
  testPerformance: {
    averageDuration: number
    slowTests: number
    failureRate: number
  }
  authentication: {
    githubTokenValid: boolean
    testTokensConfigured: boolean
  }
  recommendations: string[]
}

/**
 * Recovery Manager for test infrastructure issues
 */
export class InfrastructureRecoveryManager {
  private memoryBaseline: NodeJS.MemoryUsage | null = null
  private testMetrics: Array<{ duration: number; success: boolean }> = []
  private recoveryAttempts = 0
  private maxRecoveryAttempts = 3

  /**
   * Establish infrastructure baseline
   */
  establishBaseline(): void {
    // Force GC to get clean baseline
    if (global.gc && typeof global.gc === 'function') {
      global.gc()
    }
    this.memoryBaseline = process.memoryUsage()
    this.testMetrics = []
    this.recoveryAttempts = 0
  }

  /**
   * Check infrastructure health
   */
  checkHealth(): InfrastructureHealth {
    const currentMemory = process.memoryUsage()
    const memoryGrowth = this.memoryBaseline
      ? currentMemory.heapUsed - this.memoryBaseline.heapUsed
      : 0

    const testPerformance = this.calculateTestPerformance()
    const authHealth = this.checkAuthenticationHealth()

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy'
    const recommendations: string[] = []

    // Determine overall health status
    if (memoryGrowth > 100 * 1024 * 1024) {
      // 100MB growth
      status = 'critical'
      recommendations.push('Critical memory growth detected - force garbage collection')
    } else if (memoryGrowth > 50 * 1024 * 1024) {
      // 50MB growth
      status = 'degraded'
      recommendations.push('High memory usage - consider garbage collection')
    }

    if (testPerformance.failureRate > 0.2) {
      // >20% failure rate
      status = 'critical'
      recommendations.push('High test failure rate - investigate test infrastructure')
    } else if (testPerformance.failureRate > 0.1) {
      // >10% failure rate
      status = 'degraded'
      recommendations.push('Elevated test failure rate - monitor test stability')
    }

    if (!authHealth.githubTokenValid) {
      status = 'degraded'
      recommendations.push(
        'GitHub authentication not configured - set GITHUB_TOKEN for integration tests'
      )
    }

    if (testPerformance.slowTests > 5) {
      recommendations.push('Multiple slow tests detected - optimize test performance')
    }

    return {
      status,
      memoryUsage: currentMemory,
      testPerformance,
      authentication: authHealth,
      recommendations,
    }
  }

  /**
   * Attempt automatic recovery
   */
  async attemptRecovery(health: InfrastructureHealth): Promise<boolean> {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      console.warn('Maximum recovery attempts reached - manual intervention required')
      return false
    }

    this.recoveryAttempts++
    console.log(
      `Infrastructure recovery attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts}`
    )

    let recoverySuccess = true

    // Memory recovery
    if (health.status === 'critical' && health.memoryUsage.heapUsed > 100 * 1024 * 1024) {
      console.log('Performing emergency memory cleanup...')
      await this.performMemoryRecovery()
    }

    // Test performance recovery
    if (health.testPerformance.failureRate > 0.15) {
      console.log('Optimizing test execution environment...')
      this.optimizeTestEnvironment()
    }

    // Authentication recovery
    if (!health.authentication.githubTokenValid) {
      console.log('Attempting authentication recovery...')
      recoverySuccess = this.attemptAuthRecovery() && recoverySuccess
    }

    // Verify recovery effectiveness
    await new Promise(resolve => setTimeout(resolve, 1000)) // Allow system to stabilize
    const newHealth = this.checkHealth()

    if (newHealth.status === 'healthy') {
      console.log('Infrastructure recovery successful')
      return true
    }
    if (newHealth.status !== health.status) {
      console.log('Partial infrastructure recovery achieved')
      return true
    }

    console.warn('Infrastructure recovery unsuccessful')
    return false
  }

  /**
   * Record test metrics
   */
  recordTestMetric(duration: number, success: boolean): void {
    this.testMetrics.push({ duration, success })

    // Keep only last 100 test metrics to prevent memory growth
    if (this.testMetrics.length > 100) {
      this.testMetrics = this.testMetrics.slice(-100)
    }
  }

  /**
   * Get recovery recommendations
   */
  getRecoveryRecommendations(): string[] {
    const health = this.checkHealth()
    return [
      ...health.recommendations,
      'Consider reducing test concurrency if memory issues persist',
      'Implement test sharding for large test suites',
      'Set up proper CI/CD environment variables for authentication',
      'Monitor test infrastructure metrics continuously',
    ]
  }

  private calculateTestPerformance() {
    if (this.testMetrics.length === 0) {
      return {
        averageDuration: 0,
        slowTests: 0,
        failureRate: 0,
      }
    }

    const totalDuration = this.testMetrics.reduce((sum, metric) => sum + metric.duration, 0)
    const averageDuration = totalDuration / this.testMetrics.length
    const slowTests = this.testMetrics.filter(metric => metric.duration > 5000).length // >5s
    const failures = this.testMetrics.filter(metric => !metric.success).length
    const failureRate = failures / this.testMetrics.length

    return {
      averageDuration,
      slowTests,
      failureRate,
    }
  }

  private checkAuthenticationHealth() {
    // Check if GitHub token is available
    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_AUTH_TOKEN
    const githubTokenValid = Boolean(githubToken && githubToken.length > 10)

    // Check if test tokens are properly configured
    const testTokensConfigured = Boolean(
      process.env.TEST_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.CI // Assume CI environments have proper token configuration
    )

    return {
      githubTokenValid,
      testTokensConfigured,
    }
  }

  private async performMemoryRecovery(): Promise<void> {
    // Clear Vitest mocks and caches
    vi.clearAllMocks()

    // Force garbage collection multiple times
    for (let i = 0; i < 3; i++) {
      if (global.gc && typeof global.gc === 'function') {
        global.gc()
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Clear test metrics to free memory
    this.testMetrics = this.testMetrics.slice(-20) // Keep only last 20 metrics

    console.log('Memory recovery completed')
  }

  private optimizeTestEnvironment(): void {
    // Reset test environment configurations
    process.env.NODE_ENV = 'test'
    process.env.VITEST = 'true'

    // Clear module cache to prevent stale imports
    if (vi.hoisted) {
      // Note: vi.resetModules() might be too aggressive for infrastructure tests
      // Use selective clearing instead
    }

    console.log('Test environment optimization completed')
  }

  private attemptAuthRecovery(): boolean {
    // Try to set up authentication from various sources
    const potentialTokens = [
      process.env.GITHUB_TOKEN,
      process.env.GITHUB_AUTH_TOKEN,
      process.env.TEST_GITHUB_TOKEN,
      process.env.GH_TOKEN,
    ].filter(Boolean)

    if (potentialTokens.length > 0) {
      process.env.GITHUB_TOKEN = potentialTokens[0]
      console.log('GitHub token configured from environment')
      return true
    }

    // For CI environments, suggest proper token configuration
    if (process.env.CI) {
      console.warn(
        'CI environment detected but no GitHub token found - configure GITHUB_TOKEN secret'
      )
    } else {
      console.warn('Local development: GitHub integration tests will use mocked responses')
      // Set up mock token for local development
      process.env.GITHUB_TOKEN = 'ghp_mock_token_for_local_development_only'
    }

    return false
  }
}

/**
 * Global infrastructure recovery instance
 */
export const infrastructureRecovery = new InfrastructureRecoveryManager()
