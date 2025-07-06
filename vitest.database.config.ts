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

    setupFiles: ['./tests/setup-database.ts'],

    // Sequential execution for database tests
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        minThreads: 1,
        maxThreads: 1,
      },
    },

    // Database-specific timeouts
    testTimeout: 20000,
    hookTimeout: 10000,
    retry: 1,

    // CI optimized reporting
    reporters: process.env.CI ? ['verbose'] : ['default'],
    outputFile: {
      json: './database-test-results.json',
    },

    // Database test environment
    env: {
      NODE_ENV: 'test',
      CI: process.env.CI || 'false',
    },
  },
})