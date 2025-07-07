/**
 * Search Results and Pagination Components
 * Optimized with React.memo and useMemo for performance
 */

'use client'

import { Button } from '@/components/ui/button'
import type { PropsWithClassName } from '@/lib/types/advanced'
import type React from 'react'
import { memo, useCallback, useMemo } from 'react'
import { useSearch } from './search-context'
import type { SearchResult } from './search-context'

// Results component
interface SearchResultsProps extends PropsWithClassName {
  children: (results: SearchResult[], loading: boolean, error: string | null) => React.ReactNode
  emptyMessage?: string
  loadingMessage?: string
}

export const SearchResults = memo<SearchResultsProps>(function SearchResults({
  children,
  emptyMessage = 'No results found',
  loadingMessage = 'Loading...',
  className,
}) {
  const { results, loading, error, query } = useSearch()

  const content = useMemo(() => {
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
  }, [loading, error, query, results, emptyMessage, loadingMessage, className, children])

  return content
})

// Pagination component
export const SearchPagination = memo<PropsWithClassName>(function SearchPagination({ className }) {
  const { pagination, setPagination, onSearch } = useSearch()
  const { page, pageSize, total, hasMore } = pagination

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  const goToPage = useCallback(
    (newPage: number) => {
      setPagination({ page: newPage })
      onSearch()
    },
    [setPagination, onSearch]
  )

  const handlePrevious = useCallback(() => {
    goToPage(page - 1)
  }, [goToPage, page])

  const handleNext = useCallback(() => {
    goToPage(page + 1)
  }, [goToPage, page])

  const showingRange = useMemo(() => {
    const start = (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, total)
    return { start, end }
  }, [page, pageSize, total])

  if (total === 0) return null

  return (
    <div className={`search-pagination flex items-center justify-between ${className || ''}`}>
      <span className="text-gray-600 text-sm">
        Showing {showingRange.start} to {showingRange.end} of {total} results
      </span>

      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" onClick={handlePrevious} disabled={page <= 1}>
          Previous
        </Button>

        <span className="text-sm">
          Page {page} of {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={!hasMore || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
})

// Stats component
export const SearchStats = memo<PropsWithClassName>(function SearchStats({ className }) {
  const { results, loading, query } = useSearch()

  const shouldShow = useMemo(() => !loading && query, [loading, query])

  if (!shouldShow) return null

  return (
    <div className={`search-stats text-gray-600 text-sm ${className || ''}`}>
      Found {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}&quot;
    </div>
  )
})
