/**
 * Setup global mocks for unit tests
 */
import { vi } from 'vitest'

// Auto-mock these modules
vi.mock('@/lib/config/provider')
vi.mock('@/lib/errors/enhanced-error-handler')
vi.mock('@/lib/db/config')

// Mock console methods globally but allow them to be overridden
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}
