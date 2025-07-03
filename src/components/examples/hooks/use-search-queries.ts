/**
 * Search Queries Hook
 * Manages all search-related queries with optimized caching
 */

import { useQueryMetrics } from '@/components/providers/query-provider'
import { useBeginnerOpportunities, useOpportunitiesSearch } from '@/lib/api/hooks/use-opportunities'
import { useRepositoriesInfinite, useRepositoriesSearch } from '@/lib/api/hooks/use-repositories'
import type { SearchFilters } from './use-search-state'

export function useSearchQueries(
  searchType: 'repositories' | 'opportunities',
  filters: SearchFilters
) {
  const queryMetrics = useQueryMetrics()

  const repositoriesQuery = useRepositoriesSearch(
    {
      q: filters.query,
      ...(filters.language && { language: filters.language }),
      ...(filters.minStars && { min_stars: filters.minStars }),
      per_page: 20,
    },
    {
      enabled: searchType === 'repositories' && filters.query.length > 2,
      staleTime: 2 * 60 * 1000,
    }
  )

  const opportunitiesQuery = useOpportunitiesSearch(
    {
      q: filters.query,
      ...(filters.difficulty && { difficulty: filters.difficulty }),
      ...(filters.goodFirstIssue !== undefined && { good_first_issue: filters.goodFirstIssue }),
      per_page: 20,
    },
    {
      enabled: searchType === 'opportunities' && filters.query.length > 2,
      staleTime: 3 * 60 * 1000,
    }
  )

  const infiniteQuery = useRepositoriesInfinite(
    {
      q: filters.query,
      ...(filters.language && { language: filters.language }),
      ...(filters.minStars && { min_stars: filters.minStars }),
    },
    {
      enabled: searchType === 'repositories' && filters.query.length > 2,
      pageSize: 10,
    }
  )

  return {
    queryMetrics,
    repositories: repositoriesQuery,
    opportunities: opportunitiesQuery,
    infinite: infiniteQuery,
  }
}

export function useBeginnerSidebar() {
  const { data: beginnerOpportunities, isLoading: beginnerLoading } = useBeginnerOpportunities({
    per_page: 10,
  })

  return {
    beginnerOpportunities,
    beginnerLoading,
  }
}
