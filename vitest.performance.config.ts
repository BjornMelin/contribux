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
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  define: {
    'import.meta.vitest': undefined,
    global: 'globalThis',
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
    ],

    setupFiles: ['./tests/setup.ts'],

    // Performance tests need extended timeouts
    testTimeout: 120000,
    hookTimeout: 60000,
    retry: 0, // No retries for performance tests

    // Optimized for performance testing
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 2,
        maxThreads: 8,
      },
    },

    // Minimal coverage for performance tests
    coverage: {
      enabled: false,
    },

    // Performance-focused reporting
    reporters: ['default', 'json'],
    outputFile: { json: './performance-test-results.json' },

    // Memory and resource limits
    isolate: false, // Share environment for performance testing
  },
})
