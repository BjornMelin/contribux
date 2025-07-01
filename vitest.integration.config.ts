import path from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir: '.vitest/cache-integration',

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
    // Integration test configuration
    globals: true,
    environment: 'node',

    include: ['tests/integration/**/*.{test,spec}.{js,ts,tsx}'],

    exclude: [
      ...configDefaults.exclude,
      'tests/unit/**/*',
      'tests/performance/**/*',
      'tests/e2e/**/*',
      'tests/security/**/*',
    ],

    setupFiles: ['./tests/setup.ts'],

    // Integration tests need more time and resources
    testTimeout: 60000,
    hookTimeout: 30000,
    retry: 1,

    // Sequential execution for integration tests to avoid conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Coverage for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: [...configDefaults.coverage.exclude, 'tests/**/*', '**/*.config.*'],
    },

    reporters: ['default', 'json'],
    outputFile: { json: './integration-test-results.json' },
  },
})
