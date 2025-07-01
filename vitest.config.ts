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
      // Fix Next.js module resolution for tests
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
    // Fix for Next.js edge runtime compatibility
    'process.env.NEXT_RUNTIME': '"nodejs"',
    'process.env.__NEXT_PRIVATE_ORIGIN': '"http://localhost:3000"',
  },

  // MSW and test environment compatibility
  ssr: {
    noExternal: ['msw', '@testing-library/react'],
  },

  test: {
    // Modern Vitest 3.2+ configuration
    globals: true,
    environment: 'jsdom',

    include: [
      'tests/unit/**/*.{test,spec}.{js,ts,tsx}',
      'tests/security/**/*.{test,spec}.{js,ts,tsx}',
      'tests/mocks/**/*.{test,spec}.{js,ts,tsx}',
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

    setupFiles: ['./tests/setup.ts'],

    // Optimized pool configuration for Vitest 3.2+
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: Math.min(4, require('os').cpus().length),
      },
    },

    // Modern coverage configuration
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

    // Reasonable timeouts
    testTimeout: 15000,
    hookTimeout: 10000,
    retry: 1,

    // Modern reporter configuration
    reporters: ['default'],
    outputFile: {
      json: './test-results.json',
    },

    // Environment configuration
    env: {
      NODE_ENV: 'test',
    },
  },
})
