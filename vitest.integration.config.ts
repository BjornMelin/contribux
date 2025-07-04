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
  },

  define: {
    'import.meta.vitest': 'undefined',
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
      'node_modules/**/*',
      'dist/**/*',
      '.next/**/*',
    ],

    setupFiles: ['./tests/setup.ts'],

    // Integration tests configuration
    testTimeout: 45000,
    hookTimeout: 20000,
    retry: 1,

    // Sequential execution for database integration tests
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

    // Reporter configuration
    reporters: ['default'],
    outputFile: {
      json: './integration-test-results.json',
    },

    // Environment configuration
    env: {
      NODE_ENV: 'test',
    },
  },
})
