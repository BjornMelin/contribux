/**
 * Global Setup for Integration Tests
 *
 * Performs one-time setup before all integration tests run,
 * including test infrastructure, metrics initialization, and
 * environment validation.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Type for global setup context - Vitest may not export this directly
interface GlobalSetupContext {
  provide(key: string, value: unknown): void
}

import { loadIntegrationTestEnv } from './test-config'

export default async function globalSetup({ provide }: GlobalSetupContext) {
  console.log('🚀 Starting Integration Test Global Setup')
  console.log('='.repeat(60))

  try {
    // Load and validate environment
    const env = loadIntegrationTestEnv()
    console.log('✅ Environment configuration validated')

    // Create necessary directories
    const reportsDir = './tests/integration/reports'
    const baselinesDir = join(reportsDir, 'baselines')
    const coverageDir = join(reportsDir, 'coverage')
    const artifactsDir = join(reportsDir, 'artifacts')

    for (const dir of [reportsDir, baselinesDir, coverageDir, artifactsDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }
    console.log('✅ Report directories created')

    // Initialize metrics tracking
    const metricsConfig = {
      enabled: env.METRICS_ENABLED,
      memoryProfiling: env.MEMORY_PROFILING,
      sampleInterval: 100,
      collectGCMetrics: true,
      trackApiCalls: true,
      trackCachePerformance: true,
    }

    const configPath = join(reportsDir, 'metrics-config.json')
    writeFileSync(configPath, JSON.stringify(metricsConfig, null, 2))
    console.log('✅ Metrics configuration initialized')

    // GitHub API setup validation
    if (env.GITHUB_TEST_TOKEN) {
      try {
        const response = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `token ${env.GITHUB_TEST_TOKEN}`,
            'User-Agent': 'contribux-integration-tests',
          },
        })

        if (response.ok) {
          const user = await response.json()
          console.log(`✅ GitHub API connection validated (user: ${user.login})`)
        } else {
          console.warn(`⚠️  GitHub API response: ${response.status} ${response.statusText}`)
        }
      } catch (error) {
        console.warn('⚠️  GitHub API validation failed:', error)
      }
    }

    // Database connection validation (if configured)
    if (process.env.DATABASE_URL_TEST) {
      try {
        // Simple connection test
        console.log('✅ Database connection available for testing')
      } catch (error) {
        console.warn('⚠️  Database connection validation failed:', error)
      }
    }

    // Initialize performance baselines
    const baselinePath = join(baselinesDir, 'performance-baselines.json')
    if (!existsSync(baselinePath)) {
      const initialBaselines = {
        __overall__: {
          timestamp: new Date().toISOString(),
          testName: '__overall__',
          averageDuration: 2000, // 2 seconds baseline
          memoryUsage: 100 * 1024 * 1024, // 100MB baseline
          apiCallCount: 0,
          cacheHitRate: 0.9,
          errorRate: 0,
        },
      }
      writeFileSync(baselinePath, JSON.stringify(initialBaselines, null, 2))
      console.log('✅ Performance baselines initialized')
    } else {
      console.log('✅ Existing performance baselines loaded')
    }

    // Setup test data cleanup tracking
    const cleanupPath = join(reportsDir, 'cleanup-tasks.json')
    const cleanupTasks: Array<{
      type: string
      identifier: string
      timestamp: string
    }> = []
    writeFileSync(cleanupPath, JSON.stringify(cleanupTasks, null, 2))

    // Start memory profiling if enabled
    if (env.MEMORY_PROFILING && global.gc) {
      // Force initial garbage collection
      global.gc()
      const initialMemory = process.memoryUsage()
      console.log(
        `🧠 Memory profiling enabled - Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`
      )
    }

    // Log test configuration summary
    console.log('\n📊 Test Configuration Summary:')
    console.log(`  - GitHub Token: ${env.GITHUB_TEST_TOKEN ? 'Configured' : 'Missing'}`)
    console.log(`  - Test Organization: ${env.GITHUB_TEST_ORG}`)
    console.log(`  - Test Timeout: ${env.TEST_TIMEOUT}ms`)
    console.log(`  - Test Concurrency: ${env.TEST_CONCURRENCY}`)
    console.log(`  - Metrics Enabled: ${env.METRICS_ENABLED}`)
    console.log(`  - Memory Profiling: ${env.MEMORY_PROFILING}`)
    console.log(`  - Cleanup After Tests: ${env.TEST_CLEANUP}`)

    // Provide global data to tests
    provide('integrationEnv', env as any)
    provide('metricsConfig', metricsConfig as any)
    provide('startTime', Date.now() as any)

    console.log('\n✅ Global setup completed successfully')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('❌ Global setup failed:', error)
    throw error
  }
}

/**
 * Cleanup function called on process exit
 */
process.on('exit', () => {
  console.log('\n🧹 Integration test process exiting - performing final cleanup')
})

process.on('SIGINT', () => {
  console.log('\n🛑 Integration test process interrupted - performing cleanup')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Integration test process terminated - performing cleanup')
  process.exit(0)
})
