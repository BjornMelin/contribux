import path from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

// CRITICAL: Set up TransformStream polyfill BEFORE any other imports or configurations
// This must happen at the very beginning to prevent Vite environment initialization errors
try {
  // Ensure TransformStream is available for Vite and MSW
  if (typeof TransformStream !== 'undefined') {
    ;(globalThis as any).TransformStream = TransformStream
  } else {
    // Fallback for environments where TransformStream is not defined
    ;(globalThis as any).TransformStream = class TransformStream {
      constructor() {
        throw new Error('TransformStream not available')
      }
    }
  }
} catch (error) {
  console.warn('TransformStream polyfill setup failed:', error)
}

export default defineConfig({
  // Vite cache directory for performance
  cacheDir: '.vitest/cache',

  plugins: [
    // Essential plugins for modern React 19 + Next.js 15 testing
    tsconfigPaths(), // TypeScript path mapping support
    react(), // React JSX/TSX transformation and fast refresh
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mts', '.mjs'],
  },
  define: {
    'import.meta.vitest': undefined,
    // MSW polyfill for Node.js environment
    global: 'globalThis',
    // Ensure TransformStream is available for MSW and Vite environment
    TransformStream:
      typeof TransformStream !== 'undefined' ? 'TransformStream' : 'globalThis.TransformStream',
    'globalThis.TransformStream':
      typeof TransformStream !== 'undefined' ? 'TransformStream' : 'globalThis.TransformStream',
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
      // Explicitly include only source files
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'coverage/**',
        'dist/**',
        '.next/**', // Explicitly exclude Next.js build artifacts
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
        // Additional excludes for generated files
        'src/**/*.stories.{ts,tsx,js,jsx}',
        'src/**/*.config.{ts,tsx,js,jsx}',
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

    // Memory-optimized concurrency for solo developer environments
    maxConcurrency: process.env.CI ? 3 : 4, // Reduced for better memory management
    fileParallelism: true,

    // Vitest 3.2+ memory optimization features
    teardownTimeout: 10000, // Reduced for faster cleanup
    forceRerunTriggers: ['**/test-utils/**'], // Restart workers when test utils change

    // Enhanced memory management
    slowTestThreshold: 5000, // Flag tests slower than 5s
    disableConsoleIntercept: false, // Keep console intercept for debugging

    // Simplified test configuration optimized for solo developer workflow
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      'packages/template/*',
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
    ],

    // Optimized pool configuration - use threads instead of vmThreads to avoid polyfill isolation issues
    pool: 'threads', // Use threads instead of vmThreads to allow polyfill inheritance
    poolOptions: {
      threads: {
        minThreads: process.env.CI ? 1 : 2,
        maxThreads: process.env.CI ? 3 : 4, // Reduced for better memory management
        singleThread: false, // Enable multi-threading for better performance
        // Ensure polyfills are inherited by worker threads - keep only essential and safe flags
        execArgv: ['--require', './scripts/transform-stream-polyfill.js'],
      },
    },

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

    // Optimized timeout settings for fast execution
    testTimeout: 5000, // Further reduced for faster feedback while accommodating 3s delays
    hookTimeout: 5000, // Aligned with test timeout for consistency

    // Retry configuration optimized for stability
    retry: process.env.CI ? 2 : 1, // More retries in CI, less locally

    // Fail fast configuration for developer productivity
    bail: process.env.CI ? 0 : 3, // Fail fast locally, continue in CI

    // Enhanced mock configuration for Vitest 3.2+ with memory optimization
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    mockReset: false, // Disable aggressive mock reset to prevent test pollution

    // Optimized sequence configuration for high-performance execution
    sequence: {
      shuffle: false,
      concurrent: true, // Enable concurrent test execution
      setupFiles: 'parallel', // Parallel setup file loading for speed
      hooks: 'stack', // Use stack for better memory cleanup of hooks
    },

    // Test sharding for large test suite (178 files) - enables parallel execution across shards
    // Note: Sharding configuration will be handled via CLI flags for Vitest 3.2+ compatibility

    // Simplified environment configuration
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
    },

    // Modern benchmark configuration
    benchmark: {
      include: ['**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      reporters: ['verbose'],
    },

    // Advanced debugging and memory optimization options
    logHeapUsage: !process.env.CI, // Log heap usage in local development
    isolate: true, // Better test isolation

    // Memory monitoring callback for leak detection
    onConsoleLog: (log, type) => {
      if (type === 'stdout' && log.includes('MEMORY_MONITOR')) {
        // Memory monitoring logs - can be processed by external tools
        process.stdout.write(log)
      }
    },

    // Enhanced memory optimization - Note: non-standard Vitest properties removed for compatibility

    // Node.js configuration for Web API compatibility
    server: {
      deps: {
        external: ['@mswjs/interceptors'],
      },
    },

    // Performance optimization features - cache settings moved to Vite level
    deps: {
      optimizer: {
        web: {
          enabled: true, // Enable web dependency optimization
        },
        ssr: {
          enabled: true, // Enable SSR dependency optimization
        },
      },
    },

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
