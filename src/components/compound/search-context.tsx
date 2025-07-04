/**
 * Search Context for sharing state between compound components
 * Extracted from search-compound.tsx for better maintainability
 */

'use client'

import { createContext, useContext } from 'react'

import type { SearchCriteria } from '@/lib/types/advanced'
import type { Opportunity, Repository } from '@/types/search'

// Union type for search results
export type SearchResult = Opportunity | Repository

// Search context for sharing state between compound components
export interface SearchContextValue {
  query: string
  setQuery: (query: string) => void
  filters: SearchCriteria
  setFilters: (filters: SearchCriteria) => void
  results: SearchResult[]
  setResults: (results: SearchResult[]) => void
  loading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  onSearch: () => void
  onClear: () => void
  onFilterChange: (key: string, value: unknown) => void
  pagination: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
  setPagination: (pagination: Partial<SearchContextValue['pagination']>) => void
}

export const SearchContext = createContext<SearchContextValue | null>(null)

// Hook to use search context
export function useSearch() {
  const context = useContext(SearchContext)
  if (!context) {
    throw new Error('Search compound components must be used within SearchContainer')
  }
  return context
}
