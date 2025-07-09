/**
 * Optimized Search Component Example
 * Demonstrates the new API integration optimizations
 *
 * Features:
 * - TanStack Query with intelligent caching
 * - Request deduplication and retry logic
 * - Optimistic updates for better UX
 * - Real-time updates via WebSocket
 * - Performance monitoring integration
 * - Error boundaries and graceful fallbacks
 */

'use client'

import { useMemo } from 'react'
import { useSaveOpportunity } from '@/lib/api/hooks/use-opportunities'
import { useRepositoryBookmark } from '@/lib/api/hooks/use-repositories'

// Import extracted components
import { BeginnerSidebar } from './beginner-sidebar'
import { CircuitBreakerStatus } from './circuit-breaker-status'
import { useSearchActions } from './hooks/use-search-actions'
import { useSearchQueries } from './hooks/use-search-queries'
import { useSearchState } from './hooks/use-search-state'
import { OpportunityResultCard } from './opportunity-result-card'
import { PerformanceMetrics } from './performance-metrics'
import { RepositoryResultCard } from './repository-result-card'
import { SearchFiltersForm } from './search-filters'
import { SearchTypeSelector } from './search-type-selector'

// Optimistic mutations hook
function useOptimisticMutations() {
  const bookmarkMutation = useRepositoryBookmark()
  const saveOpportunityMutation = useSaveOpportunity()

  return {
    bookmark: bookmarkMutation,
    saveOpportunity: saveOpportunityMutation,
  }
}

// Real-time updates hook (disabled - will be re-enabled when needed)
// function useRealtimeUpdates() {
//   const { repositoryUpdate } = useRepositoryUpdates()
//   const { opportunityUpdate } = useOpportunityUpdates()

//   // Real-time update notifications
//   useEffect(() => {
//     if (repositoryUpdate) {
//       // Could show toast notification
//     }
//   }, [repositoryUpdate])

//   useEffect(() => {
//     if (opportunityUpdate) {
//       // Could show toast notification
//     }
//   }, [opportunityUpdate])

//   return {
//     repositoryUpdate,
//     opportunityUpdate,
//   }
// }

export function OptimizedSearchExample() {
  const { searchType, setSearchType, filters, setFilters } = useSearchState()
  const queries = useSearchQueries(searchType, filters)
  const mutations = useOptimisticMutations()
  const { handlePrefetch, handleBookmark, handleSaveOpportunity } = useSearchActions(mutations)

  // Initialize real-time updates (disabled for now to prevent WebSocket errors)
  // useRealtimeUpdates()

  // Debounced search to reduce API calls
  const _debouncedQuery = useMemo(() => {
    const timeoutId = setTimeout(() => filters.query, 300)
    return () => clearTimeout(timeoutId)
  }, [filters.query])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header with performance metrics */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h1 className="mb-4 font-bold text-2xl text-card-foreground">
          Optimized API Integration Demo
        </h1>

        <PerformanceMetrics queryMetrics={queries.queryMetrics} />
        <SearchTypeSelector searchType={searchType} setSearchType={setSearchType} />
        <SearchFiltersForm searchType={searchType} filters={filters} setFilters={setFilters} />
      </div>

      {/* Results section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main results */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="border-b p-4">
              <h2 className="font-semibold text-card-foreground text-lg">
                {searchType === 'repositories' ? 'Repositories' : 'Opportunities'}
                {(queries.repositories.isFetching || queries.opportunities.isFetching) && (
                  <span className="ml-2 text-primary text-sm">Updating...</span>
                )}
              </h2>
            </div>

            <div className="p-4">
              {/* Loading state */}
              {(queries.repositories.isLoading || queries.opportunities.isLoading) && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
                  <span className="ml-2 text-muted-foreground">Searching...</span>
                </div>
              )}

              {/* Error state */}
              {(queries.repositories.error || queries.opportunities.error) && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-destructive"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <title>Error</title>
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="font-medium text-destructive text-sm">Search failed</h3>
                      <div className="mt-2 text-destructive/80 text-sm">
                        Please try again or adjust your search terms.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Repository results */}
              {searchType === 'repositories' && queries.repositories.data?.success && (
                <div className="space-y-4">
                  {queries.repositories.data.data.repositories.map(repo => (
                    <RepositoryResultCard
                      key={repo.id}
                      repository={repo}
                      onPrefetch={handlePrefetch}
                      onBookmark={handleBookmark}
                      isBookmarkPending={mutations.bookmark.isPending}
                    />
                  ))}

                  {/* Load more button for infinite scroll */}
                  {queries.infinite.hasNextPage && (
                    <div className="pt-4 text-center">
                      <button
                        type="button"
                        onClick={() => queries.infinite.fetchNextPage()}
                        disabled={queries.infinite.isFetchingNextPage}
                        className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {queries.infinite.isFetchingNextPage ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Opportunity results */}
              {searchType === 'opportunities' && queries.opportunities.data?.success && (
                <div className="space-y-4">
                  {queries.opportunities.data.data.opportunities.map(opportunity => (
                    <OpportunityResultCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      onSave={handleSaveOpportunity}
                      isSavePending={mutations.saveOpportunity.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar with beginner opportunities */}
        <div className="space-y-6">
          <BeginnerSidebar />

          <CircuitBreakerStatus circuitBreakerStates={queries.queryMetrics.circuitBreakerStates} />
        </div>
      </div>
    </div>
  )
}

export default OptimizedSearchExample
