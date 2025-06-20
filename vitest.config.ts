import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Global test configuration
    globals: true,
    environment: 'node',

    // Test file patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [...configDefaults.exclude, 'packages/template/*'],

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Coverage configuration with V8 provider (2025 best practice)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'coverage/**',
        'dist/**',
        'packages/*/test{,s}/**',
        '**/*.d.ts',
        'cypress/**',
        'test{,s}/**',
        'test{,-*}.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}spec.{js,cjs,mjs,ts,tsx,jsx}',
        '**/__tests__/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}',
        'next.config.js',
        'tailwind.config.js',
        'postcss.config.js',
      ],
      // 2025 best practice: Set coverage thresholds
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      // Ignore empty lines and comments (2025 feature)
      ignoreEmptyLines: true,
    },

    // Performance optimizations - use single fork to prevent ESBuild service errors
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },

    // Limit concurrency to prevent resource exhaustion
    maxConcurrency: 1,
    fileParallelism: false,

    // Configure fake timers properly
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'Date',
      ],
      loopLimit: 10_000,
      shouldAdvanceTime: false,
      advanceTimeDelta: 20,
    },

    // Reporter configuration
    reporters: ['verbose'],

    // Timeout settings
    testTimeout: 30000,
    hookTimeout: 10000,

    // Retry configuration for flaky tests
    retry: 0,

    // Fail fast on first failure (useful for CI)
    bail: 0,

    // Mock configuration
    clearMocks: true,
    restoreMocks: true,

    // File watching
    watchExclude: ['**/node_modules/**', '**/dist/**'],

    // Sequence configuration for consistent test ordering
    sequence: {
      shuffle: false,
      concurrent: false,
    },

    // Environment variables and context
    env: {
      NODE_ENV: 'test',
    },
  },

  // ESBuild configuration for optimal TypeScript transpilation
  esbuild: {
    target: 'node18',
  },
})
