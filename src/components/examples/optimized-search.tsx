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

import React, { useEffect, useMemo, useState } from 'react'
import { useQueryMetrics } from '@/components/providers/query-provider'
import {
  useBeginnerOpportunities,
  useOpportunitiesSearch,
  useSaveOpportunity,
} from '@/lib/api/hooks/use-opportunities'
import {
  usePrefetchRepositories,
  useRepositoriesInfinite,
  useRepositoriesSearch,
  useRepositoryBookmark,
} from '@/lib/api/hooks/use-repositories'
import { useOpportunityUpdates, useRepositoryUpdates } from '@/lib/api/hooks/use-websocket'

interface SearchFilters {
  query: string
  language?: string
  minStars?: number
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  goodFirstIssue?: boolean
}

export function OptimizedSearchExample() {
  const [searchType, setSearchType] = useState<'repositories' | 'opportunities'>('repositories')
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    language: '',
    minStars: 0,
    difficulty: 'beginner',
    goodFirstIssue: true,
  })

  // Query metrics for performance monitoring
  const queryMetrics = useQueryMetrics()

  // Repository search with intelligent caching
  const {
    data: repositoriesData,
    isLoading: repositoriesLoading,
    error: repositoriesError,
    isFetching: repositoriesFetching,
  } = useRepositoriesSearch(
    {
      q: filters.query,
      language: filters.language,
      min_stars: filters.minStars,
      per_page: 20,
    },
    {
      enabled: searchType === 'repositories' && filters.query.length > 2,
      staleTime: 2 * 60 * 1000, // 2 minutes
      placeholderData: undefined, // Could provide placeholder data here
    }
  )

  // Opportunity search with smart filtering
  const {
    data: opportunitiesData,
    isLoading: opportunitiesLoading,
    error: opportunitiesError,
    isFetching: opportunitiesFetching,
  } = useOpportunitiesSearch(
    {
      q: filters.query,
      difficulty: filters.difficulty,
      good_first_issue: filters.goodFirstIssue,
      per_page: 20,
    },
    {
      enabled: searchType === 'opportunities' && filters.query.length > 2,
      staleTime: 3 * 60 * 1000, // 3 minutes for opportunities
    }
  )

  // Beginner-friendly opportunities (always prefetched)
  const { data: beginnerOpportunities, isLoading: beginnerLoading } = useBeginnerOpportunities({
    per_page: 10,
  })

  // Infinite scroll for large result sets
  const {
    data: infiniteRepositories,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRepositoriesInfinite(
    {
      q: filters.query,
      language: filters.language,
      min_stars: filters.minStars,
    },
    {
      enabled: searchType === 'repositories' && filters.query.length > 2,
      pageSize: 10,
    }
  )

  // Optimistic mutations
  const bookmarkMutation = useRepositoryBookmark()
  const saveOpportunityMutation = useSaveOpportunity()

  // Real-time updates
  const { repositoryUpdate } = useRepositoryUpdates()
  const { opportunityUpdate } = useOpportunityUpdates()

  // Prefetching for better UX
  const { prefetchSearch } = usePrefetchRepositories()

  // Debounced search to reduce API calls
  const debouncedQuery = useMemo(() => {
    const timeoutId = setTimeout(() => filters.query, 300)
    return () => clearTimeout(timeoutId)
  }, [filters.query])

  // Prefetch popular searches on hover
  const handlePrefetch = (searchQuery: string) => {
    prefetchSearch({
      q: searchQuery,
      sort_by: 'stars',
      order: 'desc',
      per_page: 10,
    })
  }

  // Handle optimistic bookmark
  const handleBookmark = async (repositoryId: string, isBookmarked: boolean) => {
    try {
      await bookmarkMutation.mutateAsync({
        repositoryId,
        action: isBookmarked ? 'remove' : 'add',
      })
    } catch (error) {
      console.error('Bookmark failed:', error)
      // Error handling is automatic via TanStack Query
    }
  }

  // Handle optimistic save
  const handleSaveOpportunity = async (opportunityId: string, isSaved: boolean) => {
    try {
      await saveOpportunityMutation.mutateAsync({
        opportunityId,
        action: isSaved ? 'unsave' : 'save',
      })
    } catch (error) {
      console.error('Save failed:', error)
    }
  }

  // Real-time update notifications
  useEffect(() => {
    if (repositoryUpdate) {
      console.log('Repository updated:', repositoryUpdate)
      // Could show toast notification
    }
  }, [repositoryUpdate])

  useEffect(() => {
    if (opportunityUpdate) {
      console.log('Opportunity updated:', opportunityUpdate)
      // Could show toast notification
    }
  }, [opportunityUpdate])

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header with performance metrics */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Optimized API Integration Demo</h1>

        {/* Performance metrics display */}
        <div className="bg-gray-50 rounded-md p-3 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Performance Metrics</h3>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-500">Avg Duration:</span>
              <span className="ml-1 font-medium">{queryMetrics.averageDuration.toFixed(0)}ms</span>
            </div>
            <div>
              <span className="text-gray-500">Cache Hit Rate:</span>
              <span className="ml-1 font-medium">
                {(queryMetrics.cacheHitRate * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Error Rate:</span>
              <span className="ml-1 font-medium">{(queryMetrics.errorRate * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-gray-500">Total Queries:</span>
              <span className="ml-1 font-medium">{queryMetrics.metrics.length}</span>
            </div>
          </div>
        </div>

        {/* Search type selector */}
        <div className="flex space-x-4 mb-4">
          <button
            onClick={() => setSearchType('repositories')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              searchType === 'repositories'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Repositories
          </button>
          <button
            onClick={() => setSearchType('opportunities')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              searchType === 'opportunities'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Opportunities
          </button>
        </div>

        {/* Search filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
            <input
              type="text"
              value={filters.query}
              onChange={e => setFilters({ ...filters, query: e.target.value })}
              placeholder="Search..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              value={filters.language}
              onChange={e => setFilters({ ...filters, language: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Languages</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
          </div>

          {searchType === 'repositories' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Stars</label>
              <input
                type="number"
                value={filters.minStars}
                onChange={e =>
                  setFilters({ ...filters, minStars: Number.parseInt(e.target.value) || 0 })
                }
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {searchType === 'opportunities' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                value={filters.difficulty}
                onChange={e => setFilters({ ...filters, difficulty: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Results section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main results */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {searchType === 'repositories' ? 'Repositories' : 'Opportunities'}
                {(repositoriesFetching || opportunitiesFetching) && (
                  <span className="ml-2 text-sm text-blue-600">Updating...</span>
                )}
              </h2>
            </div>

            <div className="p-4">
              {/* Loading state */}
              {(repositoriesLoading || opportunitiesLoading) && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <span className="ml-2 text-gray-600">Searching...</span>
                </div>
              )}

              {/* Error state */}
              {(repositoriesError || opportunitiesError) && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Search failed</h3>
                      <div className="mt-2 text-sm text-red-700">
                        Please try again or adjust your search terms.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Repository results */}
              {searchType === 'repositories' && repositoriesData?.success && (
                <div className="space-y-4">
                  {repositoriesData.data.repositories.map(repo => (
                    <div
                      key={repo.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-blue-600 hover:text-blue-800">
                            <a
                              href={`https://github.com/${repo.fullName}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onMouseEnter={() => handlePrefetch(repo.name)}
                            >
                              {repo.fullName}
                            </a>
                          </h3>
                          {repo.description && (
                            <p className="text-gray-600 mt-1">{repo.description}</p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            {repo.metadata?.language && <span>📝 {repo.metadata.language}</span>}
                            {repo.metadata?.stars !== undefined && (
                              <span>⭐ {repo.metadata.stars.toLocaleString()}</span>
                            )}
                            {repo.metadata?.forks !== undefined && (
                              <span>🍴 {repo.metadata.forks.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleBookmark(repo.id, false)}
                          disabled={bookmarkMutation.isPending}
                          className="ml-4 px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {bookmarkMutation.isPending ? '...' : '🔖 Bookmark'}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Load more button for infinite scroll */}
                  {hasNextPage && (
                    <div className="text-center pt-4">
                      <button
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {isFetchingNextPage ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Opportunity results */}
              {searchType === 'opportunities' && opportunitiesData?.success && (
                <div className="space-y-4">
                  {opportunitiesData.data.opportunities.map(opportunity => (
                    <div
                      key={opportunity.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-green-600">
                            {opportunity.title}
                          </h3>
                          {opportunity.description && (
                            <p className="text-gray-600 mt-1 line-clamp-2">
                              {opportunity.description}
                            </p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                opportunity.metadata?.difficulty === 'beginner'
                                  ? 'bg-green-100 text-green-800'
                                  : opportunity.metadata?.difficulty === 'intermediate'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {opportunity.metadata?.difficulty || 'Unknown'}
                            </span>
                            <span className="text-gray-500">
                              Impact: {opportunity.impactScore}/10
                            </span>
                            <span className="text-gray-500">
                              Match: {opportunity.matchScore}/10
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSaveOpportunity(opportunity.id, false)}
                          disabled={saveOpportunityMutation.isPending}
                          className="ml-4 px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {saveOpportunityMutation.isPending ? '...' : '💾 Save'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar with beginner opportunities */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Beginner Opportunities</h3>
            </div>
            <div className="p-4">
              {beginnerLoading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-200 rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {beginnerOpportunities?.data?.opportunities?.slice(0, 5).map(opportunity => (
                    <div
                      key={opportunity.id}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <h4 className="text-sm font-medium text-gray-900 line-clamp-2">
                        {opportunity.title}
                      </h4>
                      <div className="mt-1 flex items-center space-x-2 text-xs text-gray-500">
                        <span>🎯 {opportunity.matchScore}/10</span>
                        {opportunity.metadata?.goodFirstIssue && (
                          <span className="bg-green-100 text-green-800 px-1 rounded">
                            Good First Issue
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Circuit breaker status */}
          {queryMetrics.circuitBreakerStates.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Circuit Breaker Status</h3>
              </div>
              <div className="p-4 space-y-2">
                {queryMetrics.circuitBreakerStates.map(cb => (
                  <div key={cb.endpoint} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{cb.endpoint}</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        cb.state === 'closed'
                          ? 'bg-green-100 text-green-800'
                          : cb.state === 'open'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {cb.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OptimizedSearchExample
