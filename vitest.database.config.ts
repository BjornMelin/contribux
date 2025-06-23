import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Database-specific test configuration
    globals: true,
    environment: 'node',

    // Only run database tests
    include: ['tests/database/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    // Use database-specific setup that doesn't mock database clients
    setupFiles: ['./tests/database/setup.ts'],

    // Disable mocking for database tests
    clearMocks: false,
    restoreMocks: false,

    // Sequential execution for database tests to avoid connection issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: false,
      },
    },

    // No parallelism for database tests
    maxConcurrency: 1,
    fileParallelism: false,

    // Longer timeouts for database operations
    testTimeout: 60000,
    hookTimeout: 30000,

    // Sequence configuration
    sequence: {
      shuffle: false,
      concurrent: false,
    },

    // Environment variables
    env: {
      NODE_ENV: 'test',
    },

    // Disable fake timers for database tests
    fakeTimers: {
      toFake: [],
    },
  },

  // ESBuild configuration
  esbuild: {
    target: 'node18',
  },
})
