/**
 * Repository API Hooks
 * Optimized data fetching for repository search and details
 *
 * Features:
 * - Intelligent caching with background refresh
 * - Optimistic updates for better UX
 * - Request deduplication and retry logic
 * - Performance monitoring and error recovery
 * - Infinite scrolling support
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cacheUtils, createQueryFunction, deduplicatedFetch, queryKeys } from '../query-client'

// Type definitions
interface RepositorySearchParams {
  q?: string
  page?: number
  per_page?: number
  language?: string
  min_stars?: number
  topics?: string[]
  sort_by?: 'stars' | 'updated' | 'created' | 'name' | 'relevance'
  order?: 'asc' | 'desc'
  has_issues?: boolean
  is_archived?: boolean
  license?: string
}

interface Repository {
  id: string
  githubId: number
  fullName: string
  name: string
  owner: string
  description: string | null
  metadata?: {
    language?: string
    stars?: number
    forks?: number
    topics?: string[]
    defaultBranch?: string
    homepage?: string
    [key: string]: unknown
  }
  healthMetrics?: {
    overallScore?: number
    maintainerResponsiveness?: number
    activityLevel?: number
    [key: string]: unknown
  }
  createdAt: string
  updatedAt: string
}

interface RepositorySearchResponse {
  success: boolean
  data: {
    repositories: Repository[]
    total_count: number
    page: number
    per_page: number
    has_more: boolean
  }
  metadata: {
    query: string
    filters: RepositorySearchParams
    execution_time_ms: number
    request_id: string
  }
}

// API functions
async function fetchRepositories(
  params: RepositorySearchParams
): Promise<RepositorySearchResponse> {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        searchParams.set(key, value.join(','))
      } else {
        searchParams.set(key, String(value))
      }
    }
  })

  return deduplicatedFetch<RepositorySearchResponse>(
    `/api/search/repositories?${searchParams.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
    },
    {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000,
    }
  )
}

async function fetchRepositoryDetail(owner: string, repo: string): Promise<Repository> {
  return deduplicatedFetch<Repository>(`/api/repositories/${owner}/${repo}`, {
    method: 'GET',
    credentials: 'include',
  })
}

// Search repositories hook
export function useRepositoriesSearch(
  params: RepositorySearchParams,
  options: {
    enabled?: boolean
    refetchOnMount?: boolean
    staleTime?: number
    placeholderData?: RepositorySearchResponse
  } = {}
) {
  const {
    enabled = true,
    refetchOnMount = false,
    staleTime = 2 * 60 * 1000, // 2 minutes for search results
    placeholderData,
  } = options

  return useQuery({
    queryKey: queryKeys.repositoriesSearch(params),
    queryFn: createQueryFunction(() => fetchRepositories(params)),
    enabled: enabled && !!params.q, // Only fetch if we have a search query
    staleTime,
    refetchOnMount,
    placeholderData,
    meta: {
      errorMessage: 'Failed to search repositories. Please try again.',
    },
  })
}

// Infinite scroll repositories hook
export function useRepositoriesInfinite(
  baseParams: Omit<RepositorySearchParams, 'page'>,
  options: {
    enabled?: boolean
    pageSize?: number
  } = {}
) {
  const { enabled = true, pageSize = 20 } = options

  return useInfiniteQuery<RepositorySearchResponse>({
    queryKey: [...queryKeys.repositoriesSearch(baseParams), 'infinite'],
    queryFn: ({ pageParam = 1 }) =>
      fetchRepositories({ ...baseParams, page: pageParam as number, per_page: pageSize }),
    enabled: enabled && !!baseParams.q,
    initialPageParam: 1,
    getNextPageParam: (lastPage: RepositorySearchResponse) => {
      const { page, has_more } = lastPage.data
      return has_more ? page + 1 : undefined
    },
    getPreviousPageParam: (firstPage: RepositorySearchResponse) => {
      const { page } = firstPage.data
      return page > 1 ? page - 1 : undefined
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    meta: {
      errorMessage: 'Failed to load more repositories. Please try again.',
    },
  })
}

// Repository detail hook
export function useRepositoryDetail(
  owner: string,
  repo: string,
  options: {
    enabled?: boolean
  } = {}
) {
  const { enabled = true } = options

  return useQuery({
    queryKey: queryKeys.repositoriesDetail(owner, repo),
    queryFn: createQueryFunction(() => fetchRepositoryDetail(owner, repo)),
    enabled: enabled && !!owner && !!repo,
    staleTime: 10 * 60 * 1000, // 10 minutes for repository details
    meta: {
      errorMessage: 'Failed to load repository details. Please try again.',
    },
  })
}

// Prefetch repository search hook
export function usePrefetchRepositories() {
  const queryClient = useQueryClient()

  return {
    prefetchSearch: (params: RepositorySearchParams) => {
      return queryClient.prefetchQuery({
        queryKey: queryKeys.repositoriesSearch(params),
        queryFn: createQueryFunction(() => fetchRepositories(params)),
        staleTime: 2 * 60 * 1000,
      })
    },

    prefetchDetail: (owner: string, repo: string) => {
      return queryClient.prefetchQuery({
        queryKey: queryKeys.repositoriesDetail(owner, repo),
        queryFn: createQueryFunction(() => fetchRepositoryDetail(owner, repo)),
        staleTime: 10 * 60 * 1000,
      })
    },
  }
}

// Repository bookmark mutation
export function useRepositoryBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      repositoryId,
      action,
    }: {
      repositoryId: string
      action: 'add' | 'remove'
    }) => {
      return deduplicatedFetch(`/api/repositories/${repositoryId}/bookmark`, {
        method: action === 'add' ? 'POST' : 'DELETE',
        credentials: 'include',
      })
    },

    onMutate: async ({ repositoryId, action }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.repositories() })

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKeys.repositories())

      // Optimistically update the cache
      queryClient.setQueriesData(
        { queryKey: queryKeys.repositories() },
        (old: RepositorySearchResponse | undefined) => {
          if (!old) return old

          // Update bookmarked status in search results
          if (old.data?.repositories) {
            return {
              ...old,
              data: {
                ...old.data,
                repositories: old.data.repositories.map((repo: Repository) =>
                  repo.id === repositoryId ? { ...repo, isBookmarked: action === 'add' } : repo
                ),
              },
            }
          }

          return old
        }
      )

      return { previousData }
    },

    onError: (_err, _variables, context) => {
      // Rollback the optimistic update
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.repositories(), context.previousData)
      }
    },

    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.repositories() })
    },

    meta: {
      errorMessage: 'Failed to update bookmark. Please try again.',
    },
  })
}

// Repository cache management custom hook
export function useRepositoryMutations() {
  const queryClient = useQueryClient()

  return {
    // Invalidate all repository queries
    invalidateAll: () => cacheUtils.invalidateRepositories(),

    // Update repository in cache
    updateRepository: (repository: Repository) => {
      // Update detail cache
      queryClient.setQueryData(
        queryKeys.repositoriesDetail(repository.owner, repository.name),
        repository
      )

      // Update search caches
      queryClient.setQueriesData(
        { queryKey: queryKeys.repositories() },
        (old: RepositorySearchResponse | undefined) => {
          if (!old?.data?.repositories) return old

          return {
            ...old,
            data: {
              ...old.data,
              repositories: old.data.repositories.map((repo: Repository) =>
                repo.id === repository.id ? repository : repo
              ),
            },
          }
        }
      )
    },

    // Prefetch trending repositories
    prefetchTrending: () => {
      return queryClient.prefetchQuery({
        queryKey: queryKeys.repositoriesSearch({
          sort_by: 'stars',
          order: 'desc',
          per_page: 10,
        }),
        queryFn: createQueryFunction(() =>
          fetchRepositories({
            sort_by: 'stars',
            order: 'desc',
            per_page: 10,
          })
        ),
        staleTime: 5 * 60 * 1000, // 5 minutes for trending
      })
    },

    // Clear search cache for new searches
    clearSearchCache: () => {
      queryClient.removeQueries({
        queryKey: queryKeys.repositories(),
        predicate: query => query.queryKey.includes('search'),
      })
    },
  }
}

// Export search params type for components
export type { RepositorySearchParams, Repository, RepositorySearchResponse }
