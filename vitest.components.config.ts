import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Component-specific test configuration with JSDOM
    globals: true,
    environment: 'jsdom',

    // Only run component tests
    include: ['tests/components/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    // Use component-specific setup file
    setupFiles: ['./tests/components/setup.ts'],

    // Enable mocking for components
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,

    // Sequential execution for component tests to avoid DOM conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
        maxForks: 1,
      },
    },

    // Standard timeouts for component tests
    testTimeout: 10000,
    hookTimeout: 5000,

    // Disable concurrency for component tests to prevent DOM conflicts
    maxConcurrency: 1,
    fileParallelism: false,

    // Sequence configuration
    sequence: {
      shuffle: false,
      concurrent: true,
    },

    // Environment variables
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
    },

    // Fake timers for testing UI interactions
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      loopLimit: 1000,
      shouldAdvanceTime: true,
      advanceTimeDelta: 20,
    },

    // Coverage specific to components
    coverage: {
      include: ['src/components/**/*'],
      exclude: [
        'src/components/**/*.stories.*',
        'src/components/**/*.test.*',
        'src/components/**/*.d.ts',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage/components',
    },
  },

  // ESBuild configuration optimized for React components
  esbuild: {
    target: 'es2020',
    keepNames: true,
    sourcemap: true,
  },
})
