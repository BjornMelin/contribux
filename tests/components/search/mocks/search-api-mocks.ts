/**
 * Search API Mocks for Component Testing
 * Mock API responses and handlers for search component testing
 */

import { vi } from 'vitest'
import type { Opportunity, SearchFilters } from '@/types/search'
import { mockOpportunities, sharedMockOpportunity } from '../fixtures/search-component-data'

// Mock search API responses
export const createMockSearchResponse = (
  opportunities: Opportunity[] = mockOpportunities,
  total = opportunities.length,
  hasMore = false
) => ({
  opportunities,
  pagination: {
    page: 1,
    limit: 20,
    total,
    hasMore,
  },
  filters: {} as SearchFilters,
  facets: {
    difficulties: ['beginner', 'intermediate', 'advanced'],
    types: ['bug_fix', 'feature', 'enhancement'],
    languages: ['TypeScript', 'Python', 'JavaScript', 'Go'],
  },
})

// Mock API functions
export const createMockSearchAPI = () => {
  const searchOpportunities = vi.fn()
  const getOpportunityById = vi.fn()
  const updateSearchFilters = vi.fn()

  // Default implementations
  searchOpportunities.mockResolvedValue(createMockSearchResponse())
  getOpportunityById.mockResolvedValue(sharedMockOpportunity)
  updateSearchFilters.mockResolvedValue({ success: true })

  return {
    searchOpportunities,
    getOpportunityById,
    updateSearchFilters,
    // Helper to reset all mocks
    resetMocks: () => {
      searchOpportunities.mockClear()
      getOpportunityById.mockClear()
      updateSearchFilters.mockClear()
    },
  }
}

// Mock hook implementations
export const createMockSearchHooks = () => {
  const useSearch = vi.fn()
  const useFilters = vi.fn()
  const useOpportunitySelection = vi.fn()

  // Default hook return values
  useSearch.mockReturnValue({
    opportunities: mockOpportunities,
    loading: false,
    error: null,
    search: vi.fn(),
    hasMore: false,
    loadMore: vi.fn(),
  })

  useFilters.mockReturnValue({
    filters: {
      query: '',
      difficulty: undefined,
      type: undefined,
      languages: [],
      goodFirstIssue: false,
      helpWanted: false,
    },
    updateFilters: vi.fn(),
    resetFilters: vi.fn(),
  })

  useOpportunitySelection.mockReturnValue({
    selectedOpportunity: null,
    selectOpportunity: vi.fn(),
    clearSelection: vi.fn(),
  })

  return {
    useSearch,
    useFilters,
    useOpportunitySelection,
    // Helper to reset all mocks
    resetMocks: () => {
      useSearch.mockClear()
      useFilters.mockClear()
      useOpportunitySelection.mockClear()
    },
  }
}

// Error response mocks
export const createErrorResponse = (message = 'API Error', status = 500) => ({
  error: {
    message,
    status,
    code: 'SEARCH_ERROR',
  },
})

// Loading state mocks
export const createLoadingState = () => ({
  loading: true,
  opportunities: [],
  error: null,
})

// Empty state mocks
export const createEmptyResponse = () => ({
  opportunities: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  },
  filters: {} as SearchFilters,
  facets: {
    difficulties: [],
    types: [],
    languages: [],
  },
})

// Mock debounced functions for search input
export const createMockDebouncedSearch = () => {
  const debouncedSearch = vi.fn()
  const cancelSearch = vi.fn()
  
  return {
    debouncedSearch,
    cancelSearch,
    // Helper to simulate debounce behavior
    triggerDebounce: (searchTerm: string, delay = 300) => {
      setTimeout(() => {
        debouncedSearch(searchTerm)
      }, delay)
    },
  }
}

// Mock local storage for filter persistence
export const createMockStorage = () => {
  const storage: Record<string, string> = {}
  
  const getItem = vi.fn((key: string) => storage[key] || null)
  const setItem = vi.fn((key: string, value: string) => {
    storage[key] = value
  })
  const removeItem = vi.fn((key: string) => {
    delete storage[key]
  })
  const clear = vi.fn(() => {
    Object.keys(storage).forEach(key => delete storage[key])
  })

  // Mock localStorage
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem,
      setItem,
      removeItem,
      clear,
      length: 0,
      key: vi.fn(),
    },
    writable: true,
  })

  return {
    getItem,
    setItem,
    removeItem,
    clear,
    storage,
  }
}