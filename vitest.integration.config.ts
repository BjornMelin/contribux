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

    setupFiles: ['./tests/setup-integration.ts'],

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

    // Environment configuration for integration tests
    env: {
      NODE_ENV: 'test',
      CI: process.env.CI || 'false',
    },
  },
})
