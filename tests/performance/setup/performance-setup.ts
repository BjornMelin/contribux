/**
 * Performance test setup and configuration
 * Provides consistent test environment setup for all performance tests
 */

import { vi } from 'vitest'
import { setupLoadTestMSW } from '../utils/load-test-helpers'

// Global performance test setup
export function setupPerformanceTest() {
  const mswSetup = setupLoadTestMSW()
  
  return {
    beforeAll: () => {
      mswSetup.beforeAll()
    },
    beforeEach: () => {
      // Ensure MSW is enabled for our tests
      process.env.VITEST_MSW_ENABLED = 'true'
      
      // Clear all mocks but DON'T reset to default handlers
      vi.clearAllMocks()

      // Clear any global GitHub state
      if (global.__githubClientCache) {
        global.__githubClientCache = undefined
      }
      if (global.__githubRateLimitState) {
        global.__githubRateLimitState = undefined
      }
    },
    afterEach: () => {
      // Just clear mocks, don't reset handlers
      vi.clearAllMocks()
    },
    afterAll: () => {
      mswSetup.afterAll()
    }
  }
}

// Common test isolation setup
export function setupTestIsolation() {
  return {
    beforeEach: () => {
      // Prevent the default test isolation from interfering
      vi.clearAllMocks()

      // Clear any global GitHub state
      if (global.__githubClientCache) {
        global.__githubClientCache = undefined
      }
      if (global.__githubRateLimitState) {
        global.__githubRateLimitState = undefined
      }
    },
    afterEach: () => {
      // Just clear mocks, don't reset handlers
      vi.clearAllMocks()
    }
  }
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private startTime: number = 0
  private measurements: Array<{ name: string; duration: number }> = []

  start() {
    this.startTime = Date.now()
  }

  mark(name: string) {
    const duration = Date.now() - this.startTime
    this.measurements.push({ name, duration })
    console.log(`Performance mark: ${name} at ${duration}ms`)
  }

  getMeasurements() {
    return [...this.measurements]
  }

  reset() {
    this.startTime = 0
    this.measurements = []
  }
}

// Test result validation utilities
export function validatePerformanceResults(
  results: Array<{ success: boolean; duration: number }>,
  thresholds: {
    minSuccessRate?: number
    maxAvgDuration?: number
    maxP95Duration?: number
    minRequestsPerSecond?: number
  }
) {
  const successes = results.filter(r => r.success)
  const durations = results.map(r => r.duration)
  const successRate = (successes.length / results.length) * 100
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
  const sortedDurations = [...durations].sort((a, b) => a - b)
  const p95Duration = sortedDurations[Math.floor(sortedDurations.length * 0.95)]

  const validations = []

  if (thresholds.minSuccessRate && successRate < thresholds.minSuccessRate) {
    validations.push(`Success rate ${successRate.toFixed(2)}% below threshold ${thresholds.minSuccessRate}%`)
  }

  if (thresholds.maxAvgDuration && avgDuration > thresholds.maxAvgDuration) {
    validations.push(`Average duration ${avgDuration.toFixed(2)}ms above threshold ${thresholds.maxAvgDuration}ms`)
  }

  if (thresholds.maxP95Duration && p95Duration > thresholds.maxP95Duration) {
    validations.push(`P95 duration ${p95Duration}ms above threshold ${thresholds.maxP95Duration}ms`)
  }

  return {
    valid: validations.length === 0,
    violations: validations,
    metrics: {
      successRate,
      avgDuration,
      p95Duration,
    }
  }
}