/**
 * Modern Test Utilities for Vitest 3.2+
 * Simplified patterns that eliminate complex isolation issues
 *
 * FIXES: Complex renderIsolated patterns causing SearchBar test failures
 */

import type { UUID } from '@/types/base'
import type { Repository, SearchFilters } from '@/types/search'
import { cleanup, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

// Conditionally import userEvent only when in DOM environment
let userEvent: any = null
if (typeof window !== 'undefined') {
  import('@testing-library/user-event').then(module => {
    userEvent = module.userEvent
  })
}

/**
 * Modern render helper with automatic cleanup
 * Replaces the complex renderIsolated pattern
 */
export function renderComponent(component: React.ReactElement) {
  // Use standard RTL render with automatic cleanup
  const result = render(component)

  // Return standard result with enhanced user utilities
  return {
    ...result,
    user: userEvent ? userEvent.setup() : null,
    // Use result-scoped queries instead of screen to avoid conflicts
    getByRole: result.getByRole,
    getByText: result.getByText,
    getByTestId: result.getByTestId,
    getByPlaceholderText: result.getByPlaceholderText,
    getByDisplayValue: result.getByDisplayValue,
    getAllByRole: result.getAllByRole,
    getAllByText: result.getAllByText,
    queryByText: result.queryByText,
    queryByRole: result.queryByRole,
    queryByTestId: result.queryByTestId,
  }
}

/**
 * Setup function for component tests
 * Call this in beforeEach to ensure clean state
 */
export function setupComponentTest() {
  // Clear React Testing Library state first
  cleanup()

  // Clean DOM thoroughly
  document.body.innerHTML = ''

  // Clear all mocks
  vi.clearAllMocks()
}

/**
 * Cleanup function for component tests
 * Call this in afterEach to prevent memory leaks
 */
export function cleanupComponentTest() {
  // Cleanup React Testing Library first
  cleanup()

  // Clean DOM thoroughly - this prevents multiple component renders
  document.body.innerHTML = ''

  // Clear any dynamically added style elements
  document.head.querySelectorAll('style[data-emotion], style[data-styled]').forEach(style => {
    style.remove()
  })
}

/**
 * Modern mock router factory
 * Provides consistent router mocking without complex setups
 */
export function createModernMockRouter() {
  const mockPush = vi.fn()
  const mockReplace = vi.fn()
  const mockRefresh = vi.fn()

  // Use vi.hoisted for better mock stability
  const mockUseRouter = vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }))

  const mockUseSearchParams = vi.fn(() => ({
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(''),
  }))

  const mockUsePathname = vi.fn(() => '/search')

  return {
    mockPush,
    mockReplace,
    mockRefresh,
    mockUseRouter,
    mockUseSearchParams,
    mockUsePathname,

    // Helper to setup mocks
    setup() {
      vi.mock('next/navigation', () => ({
        useRouter: mockUseRouter,
        useSearchParams: mockUseSearchParams,
        usePathname: mockUsePathname,
      }))
    },

    // Helper to reset mocks
    reset() {
      mockPush.mockClear()
      mockReplace.mockClear()
      mockRefresh.mockClear()
      mockUseRouter.mockClear()
      mockUseSearchParams.mockClear()
      mockUsePathname.mockClear()
    },
  }
}

/**
 * Modern test suite setup
 * Provides consistent beforeEach/afterEach patterns
 */
export function setupTestSuite() {
  beforeEach(() => {
    setupComponentTest()
  })

  afterEach(() => {
    cleanupComponentTest()
  })
}

// Helper function to cast strings to UUID for testing
export const asUUID = (str: string): UUID => str as UUID

// Helper function to create minimal Repository object for testing
export const createMockRepository = (overrides: {
  name: string
  fullName: string
  language?: string | undefined
  starsCount?: number
}): Repository => ({
  // BaseEntity fields
  id: asUUID('550e8400-e29b-41d4-a716-446655440000'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),

  // Repository fields with defaults
  githubId: 12345,
  name: overrides.name,
  fullName: overrides.fullName,
  description: 'A test repository',
  language: overrides.language || 'TypeScript',
  topics: [],
  starsCount: overrides.starsCount || 100,
  forksCount: 10,
  issuesCount: 5,
  url: `https://github.com/${overrides.fullName}`,
  defaultBranch: 'main',
  lastPushedAt: new Date('2024-01-01T00:00:00Z'),
  health: {
    score: 0.8,
    status: 'good' as const,
    metrics: {
      commitFrequency: 5.0,
      issueResponseTime: 24,
      prMergeTime: 48,
      maintainerActivity: 0.8,
      communityEngagement: 0.7,
      documentationQuality: 0.9,
      codeQuality: 0.85,
      testCoverage: 0.75,
    },
    lastUpdated: new Date('2024-01-01T00:00:00Z'),
  },
  isArchived: false,
  isFork: false,
  hasIssues: true,
  hasProjects: true,
  hasWiki: true,
})

// Helper to create default search filters
export const createDefaultFilters = (): SearchFilters => ({
  query: '',
  difficulty: undefined,
  type: undefined,
  languages: [],
  goodFirstIssue: false,
  helpWanted: false,
  hasAssignee: undefined,
  minScore: 0,
  maxScore: 1,
  minStars: undefined,
  maxStars: undefined,
  createdAfter: undefined,
  createdBefore: undefined,
  updatedAfter: undefined,
  updatedBefore: undefined,
  repositoryHealthMin: undefined,
  estimatedHoursMin: undefined,
  estimatedHoursMax: undefined,
  requiresMaintainerResponse: undefined,
  hasLinkedPR: undefined,
  page: 1,
  limit: 20,
  sortBy: 'relevance',
  order: 'desc',
})

/**
 * Helper to interact with form elements using modern patterns
 */
export async function fillAndSubmitForm(
  user: ReturnType<typeof userEvent.setup>,
  inputSelector: string,
  value: string,
  submitMethod: 'button' | 'enter' = 'button',
  container?: HTMLElement
) {
  // Find the input element - prioritize container scoping if provided
  let input: HTMLInputElement | null = null

  if (container) {
    // Use container scoping for better isolation
    input = container.querySelector('input[aria-label="Search input"]') as HTMLInputElement
  }

  if (!input) {
    // Fallback to screen queries if container scoping fails
    try {
      input = screen.getByRole('textbox', { name: inputSelector }) as HTMLInputElement
    } catch {
      input = screen.getByLabelText('Search input') as HTMLInputElement
    }
  }

  if (!input) {
    throw new Error(`Input with selector "${inputSelector}" not found`)
  }

  // Clear and type new value
  await user.clear(input)
  await user.type(input, value)

  if (submitMethod === 'enter') {
    // Use direct keyboard event on the input
    await user.keyboard('{Enter}')
  } else {
    // Find the submit button - it becomes enabled after typing
    let button: HTMLButtonElement | null = null

    if (container) {
      // Wait for button to become enabled after typing
      await new Promise(resolve => setTimeout(resolve, 10))
      button = container.querySelector(
        'button[aria-label="Search"]:not([disabled])'
      ) as HTMLButtonElement
    }

    if (!button) {
      try {
        button = screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement
      } catch {
        button = screen.getByLabelText('Search') as HTMLButtonElement
      }
    }

    if (!button) {
      throw new Error('Submit button not found')
    }

    if (button.disabled) {
      throw new Error('Submit button is disabled')
    }

    await user.click(button)
  }

  return input
}

/**
 * Helper to interact with select elements
 */
export async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  selectElement: HTMLSelectElement,
  value: string
) {
  await user.selectOptions(selectElement, value)
}

/**
 * Helper to toggle checkboxes
 */
export async function toggleCheckbox(
  user: ReturnType<typeof userEvent.setup>,
  checkboxName: string | RegExp
) {
  const checkbox = screen.getByRole('checkbox', { name: checkboxName })
  await user.click(checkbox)
  return checkbox
}

/**
 * Helper to wait for async updates
 */
export const waitFor = async (callback: () => void | Promise<void>, timeout = 1000) => {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      await callback()
      return
    } catch (_error) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  // Final attempt
  await callback()
}
