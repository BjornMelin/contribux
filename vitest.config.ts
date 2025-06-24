import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  define: {
    'import.meta.vitest': undefined,
  },
  test: {
    // Global test configuration - modern Vitest 3.2+ patterns
    globals: true,
    environment: 'jsdom',

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

    // Enable concurrency for faster test execution in Vitest 3.2+ with memory constraints
    maxConcurrency: process.env.CI ? 1 : 2, // Further reduce concurrency for memory optimization
    fileParallelism: true,

    // Vitest 3.2+ memory optimization features
    teardownTimeout: 15000, // Extended teardown for thorough cleanup
    forceRerunTriggers: ['**/test-utils/**'], // Restart workers when test utils change

    // Enhanced memory management with projects-based approach (Vitest 3.2+ pattern)
    projects: [
      {
        test: {
          name: 'integration',
          include: ['**/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: false,
              isolate: true,
            },
          },
        },
      },
      {
        test: {
          name: 'github-load',
          include: ['**/github/load-testing**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
        },
      },
      {
        test: {
          name: 'default',
          include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          exclude: [
            ...configDefaults.exclude,
            'packages/template/*',
            '**/integration/**',
            '**/github/load-testing**',
          ],
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: !!process.env.CI,
              isolate: true,
              // @ts-expect-error - execArgv is supported in Vitest 3.2+ but TypeScript types haven't been updated
              execArgv: [
                '--max-old-space-size=2048',
                '--expose-gc',
                '--gc-interval=100',
                '--optimize-for-size',
              ],
            },
          },
        },
      },
    ],

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
    testTimeout: 10000,
    hookTimeout: 10000, // Extended hook timeout for cleanup operations

    // Retry configuration optimized for modern CI
    retry: 1, // Single retry for flaky tests

    // Fail fast disabled for comprehensive test coverage
    bail: 0,

    // Enhanced mock configuration for Vitest 3.2+ with memory optimization
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    mockReset: true, // Additional mock reset for test isolation

    // Optimized sequence configuration for memory efficiency
    sequence: {
      shuffle: false,
      concurrent: true, // Enable concurrent test execution
      setupFiles: 'list', // Optimize setup file handling
    },

    // Environment variables and context
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
      // Enable garbage collection for memory testing
      NODE_OPTIONS: '--expose-gc',
    },

    // Modern benchmark configuration
    benchmark: {
      include: ['**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      reporters: ['verbose'],
    },

    // Advanced debugging and memory optimization options
    logHeapUsage: !process.env.CI, // Log heap usage in local development
    isolate: true, // Better test isolation

    // Optimized watch mode for development
    watch: process.env.CI !== 'true',
  },

  // Optimized ESBuild configuration for Node.js 18+
  esbuild: {
    target: 'node18',
    keepNames: true, // Better stack traces
    sourcemap: true, // Enhanced debugging
  },
})
