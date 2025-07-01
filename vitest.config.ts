import path from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir: '.vitest/cache',

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
    // Modern Vitest 3.2+ configuration for unit and security tests
    globals: true,
    environment: 'jsdom',

    include: [
      'tests/unit/**/*.{test,spec}.{js,ts,tsx}',
      'tests/security/**/*.{test,spec}.{js,ts,tsx}',
      'src/**/*.{test,spec}.{js,ts,tsx}',
    ],

    exclude: [
      ...configDefaults.exclude,
      'tests/integration/**/*',
      'tests/performance/**/*',
      'tests/e2e/**/*',
    ],

    setupFiles: ['./tests/setup.ts'],

    // Performance optimized for unit tests
    isolate: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [...(configDefaults.coverage.exclude || []), 'tests/**/*', '**/*.config.*'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    testTimeout: 30000,
    hookTimeout: 15000,
    retry: 2,

    reporters: ['default', 'json'],
    outputFile: { json: './test-results.json' },
  },
})
