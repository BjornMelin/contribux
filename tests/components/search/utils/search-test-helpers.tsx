/**
 * @vitest-environment jsdom
 */

/**
 * Search Component Test Utilities
 * Shared utilities for testing search-related React components
 */

import { cleanup, render, within } from '@testing-library/react'
import type React from 'react'
import { vi } from 'vitest'
import type { UUID } from '../../../../src/types/base'
import type { Repository, SearchFilters } from '../../../../src/types/search'

// Simplified isolated render helper for search components - purely synchronous
export function renderIsolated(component: React.ReactElement) {
  // Clean up any existing test containers first to prevent conflicts
  const existingContainers = document.querySelectorAll('[id^="test-container-"]')
  existingContainers.forEach(container => container.remove())

  // Ensure we start with a clean DOM state
  cleanup()

  // Create a fresh container for this render with a unique ID
  const testContainer = document.createElement('div')
  testContainer.id = `test-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // Clear body and append our container
  document.body.innerHTML = ''
  document.body.appendChild(testContainer)

  // Render the component synchronously
  const result = render(component, {
    container: testContainer,
    hydrate: false,
  })

  // Enhanced unmount function that also removes the container and cleans up properly
  const originalUnmount = result.unmount
  const enhancedUnmount = () => {
    try {
      originalUnmount()
    } catch (error) {
      // Ignore unmount errors as component might already be unmounted
      console.debug('Unmount error (expected):', error)
    }

    // Remove our container
    try {
      if (testContainer.parentNode) {
        testContainer.parentNode.removeChild(testContainer)
      }
    } catch (error) {
      console.debug('Container removal error (expected):', error)
    }

    // Additional cleanup to prevent memory leaks
    cleanup()
  }

  // Return enhanced result with scoped queries and proper cleanup
  return {
    ...result,
    unmount: enhancedUnmount,
    // Override queries to be scoped to this container
    getByRole: (role: string, options?: object) => within(testContainer).getByRole(role, options),
    getByText: (text: string | RegExp, options?: object) =>
      within(testContainer).getByText(text, options),
    getByTestId: (testId: string, options?: object) =>
      within(testContainer).getByTestId(testId, options),
    getByPlaceholderText: (text: string, options?: object) =>
      within(testContainer).getByPlaceholderText(text, options),
    getByDisplayValue: (value: string, options?: object) =>
      within(testContainer).getByDisplayValue(value, options),
    getAllByRole: (role: string, options?: object) =>
      within(testContainer).getAllByRole(role, options),
    getAllByText: (text: string | RegExp, options?: object) =>
      within(testContainer).getAllByText(text, options),
    queryByText: (text: string | RegExp, options?: object) =>
      within(testContainer).queryByText(text, options),
    queryByRole: (role: string, options?: object) =>
      within(testContainer).queryByRole(role, options),
    container: testContainer,
  }
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

// Setup helpers for consistent test isolation
export const setupTestContainer = () => {
  cleanup()
  document.body.innerHTML = ''
  const container = document.createElement('div')
  container.id = 'test-container'
  document.body.appendChild(container)
  return container
}

export const teardownTestContainer = (container?: HTMLElement) => {
  cleanup()
  if (container?.parentNode) {
    container.parentNode.removeChild(container)
  }
  document.body.innerHTML = ''
}

// Mock router setup for search components
export const createMockRouter = () => {
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

// Helper to get select elements by order (for components that use multiple selects)
export const getSelectByIndex = (
  container: HTMLElement,
  index: number
): HTMLSelectElement | null => {
  const selects = container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
  return selects[index] || null
}

// Helper to wait for component updates
export const waitForUpdate = async (callback: () => void, timeout = 100) => {
  await new Promise(resolve => setTimeout(resolve, timeout))
  callback()
}
