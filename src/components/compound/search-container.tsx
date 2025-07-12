/**
 * Search Container Component
 * Optimized with useMemo and useCallback for performance
 */

'use client'

import { useCallback, useMemo, useState } from 'react'
import type { PropsWithChildren, SearchCriteria, SearchQuery } from '@/lib/types/advanced'
import { createBrand } from '@/lib/types/advanced'
import type { SearchContextValue, SearchResult } from './search-context'
import { SearchContext } from './search-context'

// Container component
interface SearchContainerProps extends PropsWithChildren {
  onSearch?: (query: SearchQuery, filters: SearchCriteria) => Promise<SearchResult[]>
  onError?: (error: Error) => void
  initialQuery?: string
  initialFilters?: SearchCriteria
  className?: string
}

export function SearchContainer({
  children,
  onSearch: onSearchProp,
  onError,
  initialQuery = '',
  initialFilters = {},
  className,
}: SearchContainerProps) {
  const [query, setQuery] = useState(initialQuery)
  const [filters, setFilters] = useState<SearchCriteria>(initialFilters)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  })

  const onSearch = useCallback(async () => {
    if (!onSearchProp || !query.trim()) return

    setLoading(true)
    setError(null)

    try {
      const searchQuery = createBrand<string, 'SearchQuery'>(query)
      const results = await onSearchProp(searchQuery, filters)
      setResults(results)

      // Update pagination
      setPagination(prev => ({
        ...prev,
        total: results.length,
        hasMore: results.length >= prev.pageSize,
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed'
      setError(errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
    } finally {
      setLoading(false)
    }
  }, [query, filters, onSearchProp, onError])

  const onClear = useCallback(() => {
    setQuery('')
    setFilters({})
    setResults([])
    setError(null)
    setPagination({
      page: 1,
      pageSize: 20,
      total: 0,
      hasMore: false,
    })
  }, [])

  const onFilterChange = useCallback((key: string, value: unknown) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const handleSetPagination = useCallback((updates: Partial<SearchContextValue['pagination']>) => {
    setPagination(prev => ({ ...prev, ...updates }))
  }, [])

  const contextValue = useMemo<SearchContextValue>(
    () => ({
      query,
      setQuery,
      filters,
      setFilters,
      results,
      setResults,
      loading,
      setLoading,
      error,
      setError,
      onSearch,
      onClear,
      onFilterChange,
      pagination,
      setPagination: handleSetPagination,
    }),
    [
      query,
      filters,
      results,
      loading,
      error,
      pagination,
      onSearch,
      onClear,
      onFilterChange,
      handleSetPagination,
    ]
  )

  return (
    <SearchContext.Provider value={contextValue}>
      <div className={`search-container ${className || ''}`}>{children}</div>
    </SearchContext.Provider>
  )
}
