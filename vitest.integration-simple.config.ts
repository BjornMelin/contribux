import path from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir: '.vitest/cache-integration',

  plugins: [tsconfigPaths()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  define: {
    'import.meta.vitest': 'undefined',
    global: 'globalThis',
    'process.env.NEXT_RUNTIME': '"nodejs"',
  },

  test: {
    globals: true,
    environment: 'node',

    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    include: ['tests/integration/**/*.{test,spec}.{js,ts,tsx}'],

    exclude: [
      ...configDefaults.exclude,
      'tests/unit/**/*',
      'tests/performance/**/*',
      'tests/e2e/**/*',
      'node_modules/**/*',
      'dist/**/*',
      '.next/**/*',
    ],

    // Simplified setup for integration tests
    setupFiles: ['./tests/setup-integration-simple.ts'],

    // Single fork for reliable database connections
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: [
        ...(configDefaults.coverage?.exclude || []),
        'tests/**/*',
        '**/*.config.*',
        '**/*.d.ts',
        'scripts/**/*',
        '.next/**/*',
      ],
    },

    // Longer timeouts for integration tests
    testTimeout: 15000,
    hookTimeout: 10000,
    retry: 1,

    reporters: ['default'],

    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
      SKIP_ENV_VALIDATION: 'true',
      LOG_LEVEL: 'error',
      // Database URL for integration tests
      DATABASE_URL_TEST:
        process.env.DATABASE_URL_TEST || 'postgresql://localhost:5432/contribux_test',
      NEXTAUTH_SECRET: 'integration-test-secret-32-chars-minimum',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
})
