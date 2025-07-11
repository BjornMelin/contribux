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
      'next/server': path.resolve(__dirname, 'node_modules/next/dist/server/index.js'),
      'next/headers': path.resolve(
        __dirname,
        'node_modules/next/dist/client/components/headers.js'
      ),
      'next/navigation': path.resolve(
        __dirname,
        'node_modules/next/dist/client/components/navigation.js'
      ),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  define: {
    'import.meta.vitest': 'undefined',
    global: 'globalThis',
    'process.env.NEXT_RUNTIME': '"nodejs"',
    'process.env.__NEXT_PRIVATE_ORIGIN': '"http://localhost:3000"',
  },

  ssr: {
    noExternal: ['msw', '@testing-library/react'],
  },

  test: {
    globals: true,
    environment: 'jsdom',

    include: ['tests/integration/**/*.{test,spec}.{js,ts,tsx}'],

    exclude: [
      ...configDefaults.exclude,
      'tests/unit/**/*',
      'tests/e2e/**/*',
      'tests/performance/**/*',
      'node_modules/**/*',
      'dist/**/*',
      '.next/**/*',
    ],

    setupFiles: ['./tests/setup-integration-enhanced.ts'],

    // Sequential execution for integration tests to prevent DB conflicts
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        minThreads: 1,
        maxThreads: 1,
      },
    },

    // Integration test specific timeouts
    testTimeout: 30000,
    hookTimeout: 15000,
    retry: 2,

    // Optimized for CI
    reporters: process.env.CI ? ['verbose'] : ['default'],
    outputFile: {
      json: './integration-test-results.json',
    },

    // Enhanced integration test environment with full isolation
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
      SKIP_ENV_VALIDATION: 'true',
      CI: process.env.CI || 'false',
      // Integration test configuration
      LOG_LEVEL: 'error',
      ENABLE_OAUTH: 'true',
      ENABLE_WEBAUTHN: 'true',
      ENABLE_AUDIT_LOGS: 'true',
      // Authentication for integration tests
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'integration-test-secret-32-chars-minimum-for-testing',
      GITHUB_CLIENT_ID: 'test-github-integration',
      GITHUB_CLIENT_SECRET: 'test-github-secret-integration',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      // Database connection for integration tests
      DATABASE_URL_TEST:
        process.env.DATABASE_URL_TEST ||
        'postgresql://test:test@localhost:5432/contribux_test_integration',
    },
  },
})
