#!/usr/bin/env tsx

/**
 * Setup Verification Script
 *
 * Verifies that the integration test reporting system is properly configured
 * and all dependencies are available.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MetricsCollector } from './metrics-collector'
import { createPerformanceAnalyzer } from './performance-analyzer'
import { createIntegrationTestReporter } from './reporter'
import { type IntegrationTestEnv, loadIntegrationTestEnv } from './test-config'

async function verifySetup() {
  console.log('🔍 Verifying Integration Test Setup')
  console.log('='.repeat(50))

  let hasErrors = false

  try {
    // Check environment configuration
    console.log('📋 Checking environment configuration...')
    let env: IntegrationTestEnv | Record<string, unknown>
    try {
      env = loadIntegrationTestEnv()
    } catch (_error) {
      console.log('  ⚠️  Environment validation failed - checking individual variables...')
      env = {
        GITHUB_TEST_TOKEN: process.env.GITHUB_TEST_TOKEN,
        GITHUB_TEST_ORG: process.env.GITHUB_TEST_ORG || 'test-org',
        GITHUB_TEST_REPO_PREFIX: process.env.GITHUB_TEST_REPO_PREFIX || 'contribux-test-',
        TEST_TIMEOUT: Number.parseInt(process.env.TEST_TIMEOUT || '60000', 10),
        TEST_CONCURRENCY: Number.parseInt(process.env.TEST_CONCURRENCY || '3', 10),
        TEST_CLEANUP: process.env.TEST_CLEANUP !== 'false',
        LOAD_TEST_ENABLED: process.env.LOAD_TEST_ENABLED === 'true',
        LOAD_TEST_DURATION: Number.parseInt(process.env.LOAD_TEST_DURATION || '30000', 10),
        LOAD_TEST_CONCURRENT_USERS: Number.parseInt(
          process.env.LOAD_TEST_CONCURRENT_USERS || '10',
          10
        ),
        METRICS_ENABLED: process.env.METRICS_ENABLED !== 'false',
        MEMORY_PROFILING: process.env.MEMORY_PROFILING !== 'false',
        WEBHOOK_TEST_SECRET: process.env.WEBHOOK_TEST_SECRET || 'test-webhook-secret',
        WEBHOOK_TEST_PORT: Number.parseInt(process.env.WEBHOOK_TEST_PORT || '3001', 10),
        GITHUB_APP_ID: process.env.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
        GITHUB_APP_INSTALLATION_ID: process.env.GITHUB_APP_INSTALLATION_ID,
      }
    }

    if (env.GITHUB_TEST_TOKEN) {
      console.log('  ✅ GitHub test token configured')
    } else {
      console.log('  ⚠️  GitHub test token missing (GITHUB_TEST_TOKEN) - required for actual tests')
    }

    if (env.GITHUB_TEST_ORG) {
      console.log('  ✅ GitHub test organization configured')
    } else {
      console.log('  ⚠️  GitHub test organization missing (GITHUB_TEST_ORG) - using default')
    }

    console.log(`  ✅ Test timeout: ${env.TEST_TIMEOUT}ms`)
    console.log(`  ✅ Test concurrency: ${env.TEST_CONCURRENCY}`)
    console.log(`  ✅ Metrics enabled: ${env.METRICS_ENABLED}`)
    console.log(`  ✅ Memory profiling: ${env.MEMORY_PROFILING}`)

    // Check directory structure
    console.log('\n📁 Checking directory structure...')
    const reportsDir = './tests/integration/reports'
    const baselinesDir = join(reportsDir, 'baselines')
    const coverageDir = join(reportsDir, 'coverage')

    for (const dir of [reportsDir, baselinesDir, coverageDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        console.log(`  ✅ Created directory: ${dir}`)
      } else {
        console.log(`  ✅ Directory exists: ${dir}`)
      }
    }

    // Test metrics collector
    console.log('\n📊 Testing metrics collector...')
    const metricsCollector = new MetricsCollector()

    // Record some test metrics
    metricsCollector.recordApiCall('/test', 100, 200)
    metricsCollector.recordCacheHit('test-key')
    metricsCollector.recordMemoryUsage(process.memoryUsage().heapUsed)

    const metrics = metricsCollector.getMetrics()
    if (metrics.apiCalls.total === 1) {
      console.log('  ✅ Metrics collector working')
    } else {
      console.log('  ❌ Metrics collector not recording correctly')
      hasErrors = true
    }

    // Test reporter
    console.log('\n📄 Testing reporter...')
    const reporter = createIntegrationTestReporter({
      outputDir: reportsDir,
      metricsCollector,
    })

    if (reporter) {
      console.log('  ✅ Reporter initialized successfully')
    } else {
      console.log('  ❌ Reporter initialization failed')
      hasErrors = true
    }

    // Test performance analyzer
    console.log('\n📈 Testing performance analyzer...')
    const analyzer = createPerformanceAnalyzer({
      baselineDir: baselinesDir,
      reportsDir,
    })

    if (analyzer) {
      console.log('  ✅ Performance analyzer initialized successfully')
    } else {
      console.log('  ❌ Performance analyzer initialization failed')
      hasErrors = true
    }

    // Test GitHub API connectivity (if token provided)
    if (env.GITHUB_TEST_TOKEN) {
      console.log('\n🔗 Testing GitHub API connectivity...')
      try {
        const response = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `token ${env.GITHUB_TEST_TOKEN}`,
            'User-Agent': 'contribux-integration-test-setup',
          },
        })

        if (response.ok) {
          const user = await response.json()
          console.log(`  ✅ GitHub API accessible (user: ${user.login})`)
        } else {
          console.log(`  ❌ GitHub API error: ${response.status} ${response.statusText}`)
          hasErrors = true
        }
      } catch (error) {
        console.log(`  ❌ GitHub API connection failed: ${error}`)
        hasErrors = true
      }
    }

    // Test Vitest configuration
    console.log('\n⚡ Testing Vitest configuration...')
    const vitestConfigPath = './vitest.integration.config.ts'
    if (existsSync(vitestConfigPath)) {
      console.log('  ✅ Integration test Vitest config found')
    } else {
      console.log('  ❌ Integration test Vitest config missing')
      hasErrors = true
    }

    // Check dependencies
    console.log('\n📦 Checking dependencies...')
    try {
      const { program } = await import('commander')
      if (typeof program === 'object' && program !== null) {
        console.log('  ✅ commander available')
      } else {
        console.log('  ❌ commander not working correctly')
        hasErrors = true
      }
    } catch {
      console.log('  ❌ commander missing - run: pnpm add commander')
      hasErrors = true
    }

    try {
      const { defineConfig } = await import('vitest/config')
      if (typeof defineConfig === 'function') {
        console.log('  ✅ vitest available')
      } else {
        console.log('  ❌ vitest not working correctly')
        hasErrors = true
      }
    } catch (error) {
      console.log(`  ❌ vitest missing or not working - error: ${error}`)
      hasErrors = true
    }

    // Summary
    console.log(`\n${'='.repeat(50)}`)
    if (hasErrors) {
      console.log('❌ Setup verification failed - please fix the errors above')
      console.log('\nTo fix common issues:')
      console.log('1. Set environment variables in .env.test:')
      console.log('   GITHUB_TEST_TOKEN=your_token')
      console.log('   GITHUB_TEST_ORG=your_org')
      console.log('2. Install missing dependencies:')
      console.log('   pnpm install')
      console.log('3. Run setup again:')
      console.log('   pnpm tsx tests/integration/infrastructure/verify-setup.ts')
      process.exit(1)
    } else {
      console.log('✅ Setup verification successful!')
      console.log('\nYou can now run integration tests:')
      console.log('  pnpm test:integration        # Run all tests')
      console.log('  pnpm test:integration:watch  # Watch mode')
      console.log('  pnpm test:integration:status # Check status')
      console.log('  pnpm test:integration:report # Generate HTML report')
    }
  } catch (error) {
    console.error('\n❌ Setup verification failed with error:', error)
    process.exit(1)
  }
}

// Run verification
verifySetup().catch(error => {
  console.error('Fatal error during setup verification:', error)
  process.exit(1)
})
