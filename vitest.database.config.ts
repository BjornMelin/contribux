import { cpus } from 'node:os'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir: '.vitest/cache-database',

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
    environment: 'node',

    include: [
      'tests/integration/database/**/*.{test,spec}.{js,ts,tsx}',
      'tests/lib/db/**/*.{test,spec}.{js,ts,tsx}',
    ],

    exclude: [
      ...configDefaults.exclude,
      'tests/unit/**/*',
      'tests/e2e/**/*',
      'tests/performance/**/*',
      'node_modules/**/*',
      'dist/**/*',
      '.next/**/*',
    ],

    setupFiles: ['./tests/setup-database-enhanced.ts'],

    // Optimized execution for database tests with connection pooling
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false, // Enable parallelization
        minThreads: 1,
        maxThreads: Math.min(3, cpus().length), // Limited for database tests to avoid connection conflicts
        // Use pool isolation to prevent database connection conflicts
        isolate: true,
      },
    },

    // Reasonable timeouts with retry logic
    testTimeout: 15000, // Reduced from 20s
    hookTimeout: 8000, // Reduced from 10s
    retry: 2, // Increased retry for database flakiness

    // Optimized reporting for CI
    reporters: process.env.CI ? ['verbose', 'json'] : ['default'],
    outputFile: {
      json: './database-test-results.json',
    },

    // Database test environment with enhanced isolation
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
      SKIP_ENV_VALIDATION: 'true',
      CI: process.env.CI || 'false',
      // Database connection pooling
      DATABASE_POOL_MAX: '5',
      DATABASE_POOL_MIN: '1',
      // Enhanced database test isolation
      LOG_LEVEL: 'warn',
      // Test database URL will be set by enhanced test setup
      DATABASE_URL_TEST:
        process.env.DATABASE_URL_TEST || 'postgresql://test:test@localhost:5432/contribux_test_db',
      // Test security keys
      NEXTAUTH_SECRET: 'database-test-secret-32-chars-minimum-for-testing',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },

    // Improved memory management
    maxWorkers: Math.min(3, cpus().length),
    logHeapUsage: true,
  },
})
