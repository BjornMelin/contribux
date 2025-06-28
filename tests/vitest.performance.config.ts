import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Performance-optimized test configuration
 *
 * This configuration reduces test execution time by:
 * - Lowering iteration counts for expensive tests
 * - Using faster mocking strategies
 * - Optimizing concurrent test execution
 * - Reducing wait times and timeouts
 *
 * Usage:
 * - For fast local development: pnpm test --config tests/vitest.performance.config.ts
 * - For full CI runs: pnpm test (uses default config)
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  test: {
    // Global test configuration
    globals: true,
    environment: 'node',

    // Setup files
    setupFiles: [path.resolve(__dirname, './setup.ts')],

    // Run tests in parallel for better performance
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use more threads for faster execution
        minThreads: 2,
        maxThreads: 8,
      },
    },

    // Allow more concurrency
    maxConcurrency: 4,
    fileParallelism: true,

    // Shorter timeouts for faster feedback
    testTimeout: 10000, // 10 seconds instead of default 30
    hookTimeout: 5000, // 5 seconds for hooks

    // Environment variables for performance mode
    env: {
      NODE_ENV: 'test',
      FAST_TESTS: 'true',
      // Reduce iteration counts
      TEST_ITERATIONS_MULTIPLIER: '0.2', // Run at 20% of normal iterations
    },

    // Reporter optimizations
    reporters: [['default', { summary: false }]], // Use simpler reporter for speed

    // Disable coverage in performance mode
    coverage: {
      enabled: false,
    },

    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
