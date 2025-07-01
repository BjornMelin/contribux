/**
 * Compound Search Component
 * Demonstrates compound component pattern for flexible composition
 * Provides a search interface with filters, results, and pagination
 */

'use client'

import type React from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type {
  CompoundComponent,
  PropsWithChildren,
  PropsWithClassName,
  SearchCriteria,
  SearchQuery,
} from '@/lib/types/advanced'
import { createBrand } from '@/lib/types/advanced'

// Search context for sharing state between compound components
interface SearchContextValue {
  query: string
  setQuery: (query: string) => void
  filters: SearchCriteria
  setFilters: (filters: SearchCriteria) => void
  results: any[]
  setResults: (results: any[]) => void
  loading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  onSearch: () => void
  onClear: () => void
  onFilterChange: (key: string, value: any) => void
  pagination: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
  setPagination: (pagination: Partial<SearchContextValue['pagination']>) => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

// Hook to use search context
export function useSearch() {
  const context = useContext(SearchContext)
  if (!context) {
    throw new Error('Search compound components must be used within SearchContainer')
  }
  return context
}

// Container component
interface SearchContainerProps extends PropsWithChildren {
  onSearch?: (query: SearchQuery, filters: SearchCriteria) => Promise<any[]>
  onError?: (error: Error) => void
  initialQuery?: string
  initialFilters?: SearchCriteria
  className?: string
}

function SearchContainer({
  children,
  onSearch: onSearchProp,
  onError,
  initialQuery = '',
  initialFilters = {},
  className,
}: SearchContainerProps) {
  const [query, setQuery] = useState(initialQuery)
  const [filters, setFilters] = useState<SearchCriteria>(initialFilters)
  const [results, setResults] = useState<any[]>([])
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

  const onFilterChange = useCallback((key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }))
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
      setPagination,
    }),
    [query, filters, results, loading, error, pagination, onSearch, onClear, onFilterChange]
  )

  return (
    <SearchContext.Provider value={contextValue}>
      <div className={`search-container ${className || ''}`}>{children}</div>
    </SearchContext.Provider>
  )
}

// Search input component
interface SearchInputProps extends PropsWithClassName {
  placeholder?: string
  autoFocus?: boolean
  onEnter?: () => void
}

function SearchInput({
  placeholder = 'Search...',
  autoFocus,
  onEnter,
  className,
}: SearchInputProps) {
  const { query, setQuery, onSearch, loading } = useSearch()

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onEnter?.()
      onSearch()
    }
  }

  return (
    <Input
      value={query}
      onChange={e => setQuery(e.target.value)}
      onKeyPress={handleKeyPress}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={loading}
      className={className}
    />
  )
}

// Search button component
interface SearchButtonProps extends PropsWithClassName {
  children?: React.ReactNode
}

function SearchButton({ children = 'Search', className }: SearchButtonProps) {
  const { onSearch, loading, query } = useSearch()

  return (
    <Button onClick={onSearch} disabled={loading || !query.trim()} className={className}>
      {loading ? 'Searching...' : children}
    </Button>
  )
}

// Clear button component
function SearchClearButton({ className }: PropsWithClassName) {
  const { onClear, query, filters } = useSearch()
  const hasContent = query || Object.keys(filters).length > 0

  if (!hasContent) return null

  return (
    <Button variant="outline" onClick={onClear} className={className}>
      Clear
    </Button>
  )
}

// Filter component
interface SearchFilterProps extends PropsWithClassName {
  label: string
  filterKey: string
  type?: 'select' | 'multiselect' | 'range' | 'toggle'
  options?: Array<{ label: string; value: any }>
  min?: number
  max?: number
}

function SearchFilter({
  label,
  filterKey,
  type = 'select',
  options = [],
  min,
  max,
  className,
}: SearchFilterProps) {
  const { filters, onFilterChange } = useSearch()
  const currentValue = filters[filterKey]

  const renderFilter = () => {
    switch (type) {
      case 'select':
        return (
          <select
            value={currentValue || ''}
            onChange={e => onFilterChange(filterKey, e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="">All</option>
            {options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )

      case 'multiselect':
        return (
          <div className="space-y-1">
            {options.map(option => (
              <label key={option.value} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={currentValue?.includes(option.value) || false}
                  onChange={e => {
                    const values = currentValue || []
                    const newValues = e.target.checked
                      ? [...values, option.value]
                      : values.filter((v: any) => v !== option.value)
                    onFilterChange(filterKey, newValues)
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )

      case 'range':
        return (
          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="Min"
              min={min}
              max={max}
              value={currentValue?.min || ''}
              onChange={e =>
                onFilterChange(filterKey, {
                  ...currentValue,
                  min: Number(e.target.value) || undefined,
                })
              }
              className="border rounded px-2 py-1 w-20"
            />
            <span>-</span>
            <input
              type="number"
              placeholder="Max"
              min={min}
              max={max}
              value={currentValue?.max || ''}
              onChange={e =>
                onFilterChange(filterKey, {
                  ...currentValue,
                  max: Number(e.target.value) || undefined,
                })
              }
              className="border rounded px-2 py-1 w-20"
            />
          </div>
        )

      case 'toggle':
        return (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={currentValue || false}
              onChange={e => onFilterChange(filterKey, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        )

      default:
        return null
    }
  }

  return (
    <div className={`search-filter ${className || ''}`}>
      {type !== 'toggle' && <label className="block text-sm font-medium mb-1">{label}</label>}
      {renderFilter()}
    </div>
  )
}

// Active filters display
function SearchActiveFilters({ className }: PropsWithClassName) {
  const { filters, onFilterChange } = useSearch()

  const activeFilters = Object.entries(filters).filter(([_, value]) => {
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(v => v !== undefined && v !== '')
    }
    return value !== undefined && value !== '' && value !== null
  })

  if (activeFilters.length === 0) return null

  return (
    <div className={`search-active-filters ${className || ''}`}>
      <span className="text-sm font-medium">Active filters:</span>
      <div className="flex flex-wrap gap-2 mt-1">
        {activeFilters.map(([key, value]) => (
          <Badge
            key={key}
            variant="secondary"
            className="cursor-pointer"
            onClick={() => onFilterChange(key, undefined)}
          >
            {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
            <span className="ml-1">&times;</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}

// Results component
interface SearchResultsProps extends PropsWithClassName {
  children: (results: any[], loading: boolean, error: string | null) => React.ReactNode
  emptyMessage?: string
  loadingMessage?: string
}

function SearchResults({
  children,
  emptyMessage = 'No results found',
  loadingMessage = 'Loading...',
  className,
}: SearchResultsProps) {
  const { results, loading, error, query } = useSearch()

  if (loading) {
    return <div className={`search-results loading ${className || ''}`}>{loadingMessage}</div>
  }

  if (error) {
    return <div className={`search-results error ${className || ''}`}>Error: {error}</div>
  }

  if (!query && results.length === 0) {
    return <div className={`search-results empty ${className || ''}`}>Enter a search query</div>
  }

  if (results.length === 0) {
    return <div className={`search-results empty ${className || ''}`}>{emptyMessage}</div>
  }

  return (
    <div className={`search-results ${className || ''}`}>{children(results, loading, error)}</div>
  )
}

// Pagination component
function SearchPagination({ className }: PropsWithClassName) {
  const { pagination, setPagination, onSearch } = useSearch()
  const { page, pageSize, total, hasMore } = pagination

  const totalPages = Math.ceil(total / pageSize)

  const goToPage = (newPage: number) => {
    setPagination({ page: newPage })
    onSearch()
  }

  if (total === 0) return null

  return (
    <div className={`search-pagination flex items-center justify-between ${className || ''}`}>
      <span className="text-sm text-gray-600">
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} results
      </span>

      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>

        <span className="text-sm">
          Page {page} of {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page + 1)}
          disabled={!hasMore || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// Stats component
function SearchStats({ className }: PropsWithClassName) {
  const { results, loading, query } = useSearch()

  if (loading || !query) return null

  return (
    <div className={`search-stats text-sm text-gray-600 ${className || ''}`}>
      Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
    </div>
  )
}

// Compose the compound component
type SearchCompoundComponent = CompoundComponent<
  SearchContainerProps,
  {
    Input: typeof SearchInput
    Button: typeof SearchButton
    ClearButton: typeof SearchClearButton
    Filter: typeof SearchFilter
    ActiveFilters: typeof SearchActiveFilters
    Results: typeof SearchResults
    Pagination: typeof SearchPagination
    Stats: typeof SearchStats
  }
>

const Search = SearchContainer as SearchCompoundComponent

Search.Input = SearchInput
Search.Button = SearchButton
Search.ClearButton = SearchClearButton
Search.Filter = SearchFilter
Search.ActiveFilters = SearchActiveFilters
Search.Results = SearchResults
Search.Pagination = SearchPagination
Search.Stats = SearchStats

export { Search, useSearch }

// Example usage component
export function SearchExample() {
  const handleSearch = async (query: SearchQuery, filters: SearchCriteria) => {
    // Mock search implementation
    await new Promise(resolve => setTimeout(resolve, 1000))
    return [
      { id: 1, title: 'Result 1', description: 'Description 1' },
      { id: 2, title: 'Result 2', description: 'Description 2' },
    ]
  }

  return (
    <Search onSearch={handleSearch} className="max-w-4xl mx-auto p-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Search.Input placeholder="Search repositories..." className="flex-1" />
            <Search.Button />
            <Search.ClearButton />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Search.Filter
              label="Language"
              filterKey="languages"
              type="multiselect"
              options={[
                { label: 'JavaScript', value: 'javascript' },
                { label: 'TypeScript', value: 'typescript' },
                { label: 'Python', value: 'python' },
                { label: 'Go', value: 'go' },
              ]}
            />

            <Search.Filter label="Stars" filterKey="stars" type="range" min={0} max={10000} />

            <Search.Filter label="Good First Issues" filterKey="hasGoodFirstIssues" type="toggle" />
          </div>

          <Search.ActiveFilters />
          <Search.Stats />

          <Search.Results>
            {results => (
              <div className="space-y-4">
                {results.map((result: any) => (
                  <Card key={result.id} className="p-4">
                    <h3 className="font-semibold">{result.title}</h3>
                    <p className="text-gray-600">{result.description}</p>
                  </Card>
                ))}
              </div>
            )}
          </Search.Results>

          <Search.Pagination />
        </div>
      </Card>
    </Search>
  )
}
