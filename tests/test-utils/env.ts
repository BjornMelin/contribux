/**
 * Environment variable management for Vitest 3.2+ testing
 * Provides safe environment setup and cleanup patterns
 */

/**
 * Store original environment for restoration
 */
const originalEnv = { ...process.env }

/**
 * Test environment manager for safe env manipulation
 * Automatically restores environment after tests
 */
export class TestEnvironment {
  private snapshot: NodeJS.ProcessEnv

  constructor() {
    this.snapshot = { ...process.env }
  }

  /**
   * Set environment variable for testing
   */
  set(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
    return this
  }

  /**
   * Set multiple environment variables
   */
  setMany(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) {
      this.set(key, value)
    }
    return this
  }

  /**
   * Get environment variable
   */
  get(key: string): string | undefined {
    return process.env[key]
  }

  /**
   * Reset to snapshot
   */
  reset() {
    process.env = { ...this.snapshot }
    return this
  }

  /**
   * Reset to original environment
   */
  restore() {
    process.env = { ...originalEnv }
    return this
  }

  /**
   * Create isolated environment
   */
  isolate() {
    return new TestEnvironment()
  }
}

/**
 * Create test environment with safe defaults
 */
export function createTestEnv() {
  const env = new TestEnvironment()

  // Set safe test defaults
  env.setMany({
    NODE_ENV: 'test',
    VITEST: 'true',
    // Database URLs for testing
    DATABASE_URL_TEST:
      process.env.DATABASE_URL_TEST || 'postgresql://test:test@localhost:5432/test',
    // API keys (use test values)
    GITHUB_TOKEN: 'test-github-token',
    OPENAI_API_KEY: 'test-openai-key',
    // Security settings
    NEXTAUTH_SECRET: 'test-secret-key-min-32-chars-long',
    NEXTAUTH_URL: 'http://localhost:3000',
    // Disable external services in tests
    DISABLE_ANALYTICS: 'true',
    DISABLE_TELEMETRY: 'true',
  })

  return env
}

/**
 * Environment setup for different test types
 */
export const testEnvironments = {
  /**
   * Unit test environment - minimal setup
   */
  unit: () =>
    createTestEnv().setMany({
      MOCK_EXTERNAL_APIS: 'true',
      DISABLE_RATE_LIMITING: 'true',
    }),

  /**
   * Integration test environment - realistic setup
   */
  integration: () =>
    createTestEnv().setMany({
      ENABLE_TEST_DATABASE: 'true',
      MOCK_EXTERNAL_APIS: 'false',
    }),

  /**
   * E2E test environment - production-like
   */
  e2e: () =>
    createTestEnv().setMany({
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_ENV: 'test',
    }),

  /**
   * Security test environment - strict settings
   */
  security: () =>
    createTestEnv().setMany({
      ENABLE_SECURITY_HEADERS: 'true',
      ENABLE_CSRF_PROTECTION: 'true',
      ENABLE_RATE_LIMITING: 'true',
    }),
}

/**
 * Mock environment variables with automatic cleanup
 */
export function mockEnv(env: Record<string, string | undefined>) {
  const original = { ...process.env }

  // Apply mock environment
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  // Return cleanup function
  return () => {
    process.env = original
  }
}

/**
 * Environment variable validation for tests
 */
export function validateTestEnv() {
  const required = ['NODE_ENV', 'DATABASE_URL_TEST', 'NEXTAUTH_SECRET']

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required test environment variables: ${missing.join(', ')}`)
  }
}

/**
 * Setup environment with automatic cleanup
 * Use in beforeEach/afterEach hooks
 */
export function setupTestEnvironment(type: keyof typeof testEnvironments = 'unit') {
  const env = testEnvironments[type]()

  return {
    env,
    cleanup: () => env.restore(),
  }
}

/**
 * Quick environment setup for individual test files
 * Modern pattern for focused test isolation
 */
export function useTestEnv(type: keyof typeof testEnvironments = 'unit') {
  return setupTestEnvironment(type)
}
