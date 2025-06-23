/**
 * Vitest Configuration for Integration Tests
 *
 * Specialized configuration for integration tests with custom reporters,
 * metrics collection, and performance analysis.
 */

import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { MetricsCollector } from './tests/integration/infrastructure/metrics-collector'
import { createIntegrationTestReporter } from './tests/integration/infrastructure/reporter'

// Global metrics collector instance
const metricsCollector = new MetricsCollector()

// Make metrics collector available globally for tests
declare global {
  var __INTEGRATION_METRICS_COLLECTOR__: MetricsCollector
}

globalThis.__INTEGRATION_METRICS_COLLECTOR__ = metricsCollector

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Environment configuration
    globals: true,
    environment: 'node',

    // Test file patterns - only integration tests
    include: ['tests/integration/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      'tests/auth/**',
      'tests/database/**',
      'tests/github/**',
      'tests/validation/**',
    ],

    // Setup files
    setupFiles: ['./tests/integration/infrastructure/test-setup.ts'],

    // Custom reporters
    reporters: [
      'verbose',
      ['json', { outputFile: 'tests/integration/reports/vitest-results.json' }],
      // Custom integration test reporter
      {
        onInit: () => {
          console.log('🚀 Integration Test Reporter initialized with metrics collection')
        },
        onFinished: (files, errors) => {
          const reporter = createIntegrationTestReporter({
            outputDir: './tests/integration/reports',
            metricsCollector,
            qualityGates: [
              {
                name: 'Test Success Rate',
                type: 'coverage',
                threshold: 95,
                operator: 'gte',
                description: 'At least 95% of tests must pass',
              },
              {
                name: 'Average Test Duration',
                type: 'performance',
                threshold: 3000,
                operator: 'lt',
                description: 'Average test duration should be under 3 seconds',
              },
              {
                name: 'Cache Hit Rate',
                type: 'metrics',
                threshold: 0.85,
                operator: 'gte',
                description: 'Cache hit rate should be at least 85%',
              },
              {
                name: 'API Error Rate',
                type: 'metrics',
                threshold: 0.02,
                operator: 'lt',
                description: 'API error rate should be under 2%',
              },
            ],
          })

          reporter.onFinished(files, errors)
        },
      },
    ],

    // Coverage configuration optimized for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'clover'],
      reportsDirectory: './tests/integration/reports/coverage',
      exclude: [
        'coverage/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        'next.config.js',
        'tailwind.config.js',
        'postcss.config.js',
        'vitest*.config.ts',
        // Exclude non-integration test files from coverage
        'src/components/**', // UI components not tested in integration
        'src/hooks/**', // Hooks not tested in integration
        'src/context/**', // Context not tested in integration
      ],
      include: [
        'src/lib/**', // Core business logic
        'src/app/**', // API routes and pages
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        // Specific thresholds for critical modules
        'src/lib/github/**': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'src/lib/db/**': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Performance optimizations for integration tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },

    // Sequential execution for integration tests to avoid conflicts
    maxConcurrency: 1,
    fileParallelism: false,

    // Timeout settings for integration tests
    testTimeout: 60000, // 60 seconds for integration tests
    hookTimeout: 30000, // 30 seconds for setup/teardown

    // Retry configuration for flaky integration tests
    retry: 2,

    // Bail on multiple failures to save CI time
    bail: 3,

    // Enhanced mock configuration
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // Sequential test execution for consistency
    sequence: {
      shuffle: false,
      concurrent: false,
    },

    // Environment variables for integration tests
    env: {
      NODE_ENV: 'test',
      INTEGRATION_TEST: 'true',
      LOG_LEVEL: 'error', // Reduce noise in integration tests
    },

    // Global test configuration
    globalSetup: './tests/integration/infrastructure/global-setup.ts',
  },

  // ESBuild configuration
  esbuild: {
    target: 'node18',
    sourcemap: true,
  },

  // Define configuration
  define: {
    __INTEGRATION_TEST__: true,
    __METRICS_ENABLED__: true,
  },
})
