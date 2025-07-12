/**
 * Simplified Integration Test Setup
 * Fast, reliable setup for integration tests without complex managers
 */

import { config } from 'dotenv'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { mswServer, restoreConsoleError, suppressMSWWarnings } from './utils/msw-simple'
import { setupAllMocks } from './utils/simple-mocks'

// Load test environment
config({ path: '.env.test.local' })
config({ path: '.env.test' })

beforeAll(async () => {
  // Set environment variables
  process.env.NODE_ENV = 'test'
  process.env.SKIP_ENV_VALIDATION = 'true'
  process.env.VITEST = 'true'
  process.env.LOG_LEVEL = 'error'

  // Setup MSW for API mocking
  suppressMSWWarnings()
  mswServer.listen({
    onUnhandledRequest: 'warn',
  })

  // Setup all mocks
  setupAllMocks()

  console.log('✅ Integration test setup loaded')
})

afterAll(async () => {
  restoreConsoleError()
  mswServer.close()
})

afterEach(() => {
  vi.clearAllMocks()
  mswServer.resetHandlers()
})

// Simplified database mock for integration tests
export const mockDatabase = {
  query: vi.fn().mockResolvedValue([]),
  transaction: vi.fn().mockImplementation(async callback => {
    const tx = {
      rollback: vi.fn(),
      commit: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
    }
    return callback(tx)
  }),
}

// Simple utilities for integration tests
export const integrationUtils = {
  createTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  }),
  createTestRepository: () => ({
    id: 1,
    name: 'test-repo',
    full_name: 'test-owner/test-repo',
    description: 'Test repository',
    html_url: 'https://github.com/test-owner/test-repo',
    stargazers_count: 100,
    language: 'TypeScript',
  }),
  createTestSession: () => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
    expires: '2024-12-31T23:59:59.999Z',
  }),
}
