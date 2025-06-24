import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Neon Branching Test Configuration
 *
 * Production-like testing with real Neon PostgreSQL branches.
 * Perfect for staging tests and production validation.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Production-like test configuration
    globals: true,
    environment: 'node',

    // Include database and integration tests
    include: [
      'tests/database/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*neon*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],

    // Use Neon setup for production-like testing
    setupFiles: ['./tests/setup.ts'],

    // Sequential execution to avoid Neon API rate limits
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: false,
      },
    },

    // Limited concurrency for Neon API
    maxConcurrency: 2,
    fileParallelism: false,

    // Longer timeouts for Neon operations
    testTimeout: 60000,
    hookTimeout: 30000,

    // Sequential execution for stability
    sequence: {
      shuffle: false,
      concurrent: false,
    },

    // Force Neon strategy
    env: {
      NODE_ENV: 'test',
      TEST_DB_STRATEGY: 'neon-branch',
      NEON_API_KEY: process.env.NEON_API_KEY,
      NEON_PROJECT_ID: process.env.NEON_PROJECT_ID,
    },

    // Disable fake timers for real timing
    fakeTimers: {
      toFake: [],
    },

    // Coverage for database operations
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/lib/test-utils/neon-*', 'src/lib/db/**'],
      exclude: ['node_modules/', 'tests/setup.ts', '**/*.d.ts'],
    },

    // Detailed reporting for production-like tests
    reporters: ['verbose', 'json'],
  },

  // ESBuild configuration
  esbuild: {
    target: 'node18',
  },
})
