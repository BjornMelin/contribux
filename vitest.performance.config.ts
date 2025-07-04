import path from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir: '.vitest/cache-performance',

  plugins: [tsconfigPaths(), react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  define: {
    'import.meta.vitest': 'undefined',
  },

  test: {
    // Performance and load test configuration
    globals: true,
    environment: 'node',

    include: ['tests/performance/**/*.{test,spec}.{js,ts,tsx}'],

    exclude: [
      ...configDefaults.exclude,
      'tests/unit/**/*',
      'tests/integration/**/*',
      'tests/e2e/**/*',
      'tests/security/**/*',
      'node_modules/**/*',
      'dist/**/*',
      '.next/**/*',
    ],

    setupFiles: ['./tests/setup.ts'],

    // Performance tests need extended timeouts
    testTimeout: 90000,
    hookTimeout: 45000,
    retry: 0, // No retries for performance tests

    // Optimized for performance testing
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 2,
        maxThreads: Math.min(8, require('os').cpus().length),
      },
    },

    // Disable coverage for performance tests
    coverage: {
      enabled: false,
    },

    // Performance-focused reporting
    reporters: ['default'],
    outputFile: {
      json: './performance-test-results.json',
    },

    // Environment configuration
    env: {
      NODE_ENV: 'test',
    },

    // Share environment for performance testing
    isolate: false,
  },
})
