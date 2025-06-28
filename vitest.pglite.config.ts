import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * PGlite Ultra-Fast Test Configuration
 *
 * Optimized for maximum speed using in-memory PostgreSQL.
 * Perfect for CI/CD and rapid development cycles.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Ultra-fast test configuration
    globals: true,
    environment: 'node',

    // Include all database and integration tests
    include: [
      'tests/database/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*database*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],

    // Use PGlite setup for ultra-fast in-memory PostgreSQL
    setupFiles: ['./tests/setup.ts'],

    // Enable parallelism for maximum speed with PGlite
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true,
      },
    },

    // Maximum parallelism - PGlite can handle it
    maxConcurrency: 8,
    fileParallelism: true,

    // Shorter timeouts for fast tests
    testTimeout: 10000,
    hookTimeout: 5000,

    // Optimized sequence configuration
    sequence: {
      shuffle: true,
      concurrent: true,
    },

    // Force PGlite strategy
    env: {
      NODE_ENV: 'test',
      TEST_DB_STRATEGY: 'pglite',
      CI: 'true', // Force CI-like behavior for speed
    },

    // Enable fake timers for deterministic tests
    fakeTimers: {
      toFake: ['setTimeout', 'setInterval', 'Date'],
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/test-utils/**', 'src/lib/db/**', 'tests/database/**'],
      exclude: ['node_modules/', 'tests/setup.ts', '**/*.d.ts', '**/*.config.*'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Reporters for clear output
    reporters: process.env.CI ? ['verbose', 'json'] : ['verbose'],

    // Disable watch mode features for CI-like speed
    watch: false,
  },

  // ESBuild configuration for speed
  esbuild: {
    target: 'node18',
    sourcemap: true,
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['@electric-sql/pglite', '@neondatabase/serverless', '@faker-js/faker'],
  },
})
