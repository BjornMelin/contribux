import { cpus } from 'node:os'
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
      'next/server': path.resolve(__dirname, 'node_modules/next/dist/server/web/exports/index.js'),
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

    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

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
      'node_modules/**/*',
      'dist/**/*',
      '.next/**/*',
    ],

    // Simplified setup - no complex managers
    setupFiles: ['./tests/setup-simple.ts'],

    // Optimized pool configuration for fast mock tests
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: Math.min(2, cpus().length), // Reduced for faster startup
        useAtomics: true,
        isolate: true,
      },
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        ...(configDefaults.coverage?.exclude || []),
        'tests/**/*',
        '**/*.config.*',
        '**/*.d.ts',
        'scripts/**/*',
        '.next/**/*',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Performance-optimized timeouts for mock strategy
    testTimeout: 3000, // Reduced for mock database strategy
    hookTimeout: 2000, // Reduced for faster setup/teardown
    retry: 0, // Disable retries for faster feedback

    reporters: ['default'],
    outputFile: {
      json: './test-results.json',
    },

    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
      SKIP_ENV_VALIDATION: 'true',
      LOG_LEVEL: 'error', // Reduced logging
      ENABLE_OAUTH: 'false',
      ENABLE_WEBAUTHN: 'false',
      ENABLE_AUDIT_LOGS: 'false',
      NEXTAUTH_SECRET: 'unit-test-secret-32-chars-minimum-for-testing',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      TEST_DB_STRATEGY: 'mock', // Force mock database strategy to avoid PGlite WASM issues
    },
  },
})
