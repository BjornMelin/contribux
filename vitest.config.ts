import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Global test configuration - modern Vitest 3.2+ patterns
    globals: true,
    environment: 'node',

    // Test file patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [...configDefaults.exclude, 'packages/template/*'],

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Coverage configuration with V8 provider - modernized for Vitest 3.2+
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
      // Updated coverage thresholds for 90% minimum
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
      // Vitest 3.2+ features
      ignoreEmptyLines: true,
      skipFull: false, // Include files with 100% coverage in reports
    },

    // Modern pool configuration for Vitest 3.2+
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Enable parallel testing for better performance
        isolate: true,
        maxForks: 4, // Optimize for modern CI environments
      },
    },

    // Enable concurrency for faster test execution in Vitest 3.2+
    maxConcurrency: 4,
    fileParallelism: true,

    // Modern fake timers configuration
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'Date',
        'performance',
      ],
      loopLimit: 10_000,
      shouldAdvanceTime: true, // Auto-advance time for better async testing
      advanceTimeDelta: 20,
    },

    // Modern reporter configuration
    reporters: ['verbose', 'hanging-process'],

    // Optimized timeout settings
    testTimeout: 15000, // Reduced for faster feedback
    hookTimeout: 5000,

    // Retry configuration optimized for modern CI
    retry: 1, // Single retry for flaky tests

    // Fail fast disabled for comprehensive test coverage
    bail: 0,

    // Enhanced mock configuration for Vitest 3.2+
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    mockReset: true, // Additional mock reset for test isolation

    // Optimized sequence configuration
    sequence: {
      shuffle: false,
      concurrent: true, // Enable concurrent test execution
      setupTimeout: 10000,
    },

    // Environment variables and context
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
    },

    // Modern benchmark configuration
    benchmark: {
      include: ['**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      reporters: ['verbose'],
    },

    // Advanced debugging options
    logHeapUsage: !process.env.CI,
    isolate: true, // Better test isolation
  },

  // Optimized ESBuild configuration for Node.js 18+
  esbuild: {
    target: 'node18',
    keepNames: true, // Better stack traces
    sourcemap: true, // Enhanced debugging
  },
})
