/**
 * Search Component Test Setup and Configuration
 * Centralized setup utilities for search component testing
 */

import { afterEach, beforeEach, vi } from 'vitest'
import {
  createMockRouter,
  setupTestContainer,
  teardownTestContainer,
} from '../utils/search-test-helpers'

// Global setup for search component tests
export const setupSearchComponentTests = () => {
  let container: HTMLElement
  const { mockPush, mockReplace } = createMockRouter()

  beforeEach(() => {
    // Create a fresh container for each test
    container = setupTestContainer()
    vi.clearAllMocks()
    mockPush.mockClear()
    mockReplace.mockClear()
  })

  afterEach(() => {
    // Remove the container completely
    teardownTestContainer(container)
  })

  return { mockPush, mockReplace }
}

// Specific setup for components that need router mocking
export const setupWithRouter = () => {
  const mockPush = vi.fn()
  const mockReplace = vi.fn()

  vi.mock('next/navigation', () => ({
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      refresh: vi.fn(),
    }),
    useSearchParams: () => ({
      get: vi.fn().mockReturnValue(null),
      toString: vi.fn().mockReturnValue(''),
    }),
    usePathname: () => '/search',
  }))

  return { mockPush, mockReplace }
}

// Setup for components that don't need router mocking
export const setupBasic = () => {
  let container: HTMLElement

  beforeEach(() => {
    container = setupTestContainer()
    vi.clearAllMocks()
  })

  afterEach(() => {
    teardownTestContainer(container)
  })

  return { container }
}

// Configuration constants for test consistency
export const TEST_IDS = {
  SEARCH_INPUT: 'search-input',
  SEARCH_BUTTON: 'search-button',
  OPPORTUNITY_LIST: 'opportunity-list',
  OPPORTUNITY_CARD: 'opportunity-card',
  FILTER_PANEL: 'filter-panel',
  RESET_BUTTON: 'reset-filters-button',
  LOADING_INDICATOR: 'loading-indicator',
  ERROR_MESSAGE: 'error-message',
  EMPTY_STATE: 'empty-state',
} as const

export const ARIA_LABELS = {
  SEARCH_INPUT: 'Search input',
  SEARCH_BUTTON: 'Search',
  DIFFICULTY_SELECT: 'Difficulty',
  TYPE_SELECT: 'Type',
  MIN_SCORE_SLIDER: 'Minimum relevance score',
  GOOD_FIRST_ISSUE: /good first issue/i,
  HELP_WANTED: /help wanted/i,
  TYPESCRIPT_CHECKBOX: /typescript/i,
  PYTHON_CHECKBOX: /python/i,
  RESET_FILTERS: /reset filters/i,
  RETRY_BUTTON: /retry/i,
} as const

export const TEST_TIMEOUTS = {
  USER_EVENT: 100,
  COMPONENT_UPDATE: 50,
  ASYNC_OPERATION: 1000,
} as const
