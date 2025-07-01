/**
 * Opportunities API Hooks
 * Optimized data fetching for contribution opportunity search and management
 *
 * Features:
 * - Smart caching with stale-while-revalidate
 * - Difficulty and impact scoring optimization
 * - Skill-based filtering and matching
 * - Real-time opportunity status updates
 * - Performance-optimized infinite scroll
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cacheUtils, createQueryFunction, deduplicatedFetch, queryKeys } from '../query-client'

// Type definitions
interface OpportunitySearchParams {
  q?: string
  page?: number
  per_page?: number
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  min_difficulty_score?: number
  max_difficulty_score?: number
  min_impact_score?: number
  max_impact_score?: number
  repository_id?: string
  good_first_issue?: boolean
  mentorship_available?: boolean
  hacktoberfest?: boolean
  labels?: string[]
  skills_required?: string[]
  sort_by?: 'difficulty' | 'impact' | 'match' | 'created' | 'updated' | 'relevance'
  order?: 'asc' | 'desc'
}

interface Opportunity {
  id: string
  repositoryId: string | null
  issueNumber: number | null
  title: string
  description: string | null
  url: string | null
  metadata?: {
    labels?: string[]
    author?: {
      login?: string
      id?: number
      avatarUrl?: string
    }
    assignees?: Array<{
      login?: string
      id?: number
    }>
    state?: 'open' | 'closed'
    comments?: number
    difficulty?: 'beginner' | 'intermediate' | 'advanced'
    estimatedHours?: number
    skillsRequired?: string[]
    mentorshipAvailable?: boolean
    goodFirstIssue?: boolean
    hacktoberfest?: boolean
    priority?: 'low' | 'medium' | 'high'
    [key: string]: any
  }
  difficultyScore: number
  impactScore: number
  matchScore: number
  createdAt: string
  updatedAt: string
}

interface OpportunitySearchResponse {
  success: boolean
  data: {
    opportunities: Opportunity[]
    total_count: number
    page: number
    per_page: number
    has_more: boolean
  }
  metadata: {
    query: string
    filters: OpportunitySearchParams
    execution_time_ms: number
    stats: {
      total: number
      beginnerFriendly: number
      withMentorship: number
      embeddingCoverage: number
    }
  }
}

interface OpportunityApplyRequest {
  opportunityId: string
  message?: string
  estimatedCompletionTime?: string
  relevantExperience?: string
}

// API functions
async function fetchOpportunities(
  params: OpportunitySearchParams
): Promise<OpportunitySearchResponse> {
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

  return deduplicatedFetch<OpportunitySearchResponse>(
    `/api/search/opportunities?${searchParams.toString()}`,
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

async function fetchOpportunityDetail(id: string): Promise<Opportunity> {
  return deduplicatedFetch<Opportunity>(`/api/opportunities/${id}`, {
    method: 'GET',
    credentials: 'include',
  })
}

async function applyToOpportunity(request: OpportunityApplyRequest): Promise<{ success: boolean }> {
  return deduplicatedFetch(`/api/opportunities/${request.opportunityId}/apply`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify(request),
  })
}

async function fetchUserOpportunities(
  status?: 'applied' | 'saved' | 'completed'
): Promise<Opportunity[]> {
  const params = status ? `?status=${status}` : ''
  return deduplicatedFetch<Opportunity[]>(`/api/user/opportunities${params}`, {
    method: 'GET',
    credentials: 'include',
  })
}

// Search opportunities hook
export function useOpportunitiesSearch(
  params: OpportunitySearchParams,
  options: {
    enabled?: boolean
    refetchOnMount?: boolean
    staleTime?: number
    placeholderData?: OpportunitySearchResponse
  } = {}
) {
  const {
    enabled = true,
    refetchOnMount = false,
    staleTime = 3 * 60 * 1000, // 3 minutes for opportunity search
    placeholderData,
  } = options

  return useQuery({
    queryKey: queryKeys.opportunitiesSearch(params),
    queryFn: createQueryFunction(() => fetchOpportunities(params)),
    enabled,
    staleTime,
    refetchOnMount,
    placeholderData,
    meta: {
      errorMessage: 'Failed to search opportunities. Please try again.',
    },
  })
}

// Infinite scroll opportunities hook
export function useOpportunitiesInfinite(
  baseParams: Omit<OpportunitySearchParams, 'page'>,
  options: {
    enabled?: boolean
    pageSize?: number
  } = {}
) {
  const { enabled = true, pageSize = 20 } = options

  return useInfiniteQuery({
    queryKey: [...queryKeys.opportunitiesSearch(baseParams), 'infinite'],
    queryFn: createQueryFunction(({ pageParam = 1 }) =>
      fetchOpportunities({ ...baseParams, page: pageParam, per_page: pageSize })
    ),
    enabled,
    initialPageParam: 1,
    getNextPageParam: lastPage => {
      const { page, has_more } = lastPage.data
      return has_more ? page + 1 : undefined
    },
    getPreviousPageParam: firstPage => {
      const { page } = firstPage.data
      return page > 1 ? page - 1 : undefined
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    meta: {
      errorMessage: 'Failed to load more opportunities. Please try again.',
    },
  })
}

// Opportunity detail hook
export function useOpportunityDetail(
  id: string,
  options: {
    enabled?: boolean
  } = {}
) {
  const { enabled = true } = options

  return useQuery({
    queryKey: queryKeys.opportunitiesDetail(id),
    queryFn: createQueryFunction(() => fetchOpportunityDetail(id)),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes for opportunity details
    meta: {
      errorMessage: 'Failed to load opportunity details. Please try again.',
    },
  })
}

// User opportunities hook (applied, saved, completed)
export function useUserOpportunities(
  status?: 'applied' | 'saved' | 'completed',
  options: {
    enabled?: boolean
    refetchInterval?: number
  } = {}
) {
  const { enabled = true, refetchInterval = 5 * 60 * 1000 } = options // 5 minutes

  return useQuery({
    queryKey: [...queryKeys.opportunities(), 'user', status],
    queryFn: createQueryFunction(() => fetchUserOpportunities(status)),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval, // Auto-refresh for status updates
    meta: {
      errorMessage: 'Failed to load your opportunities. Please try again.',
    },
  })
}

// Beginner-friendly opportunities hook
export function useBeginnerOpportunities(
  additionalParams: Partial<OpportunitySearchParams> = {},
  options: {
    enabled?: boolean
  } = {}
) {
  const { enabled = true } = options

  const params: OpportunitySearchParams = {
    difficulty: 'beginner',
    good_first_issue: true,
    sort_by: 'match',
    order: 'desc',
    per_page: 15,
    ...additionalParams,
  }

  return useQuery({
    queryKey: [...queryKeys.opportunities(), 'beginner', params],
    queryFn: createQueryFunction(() => fetchOpportunities(params)),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes for beginner opportunities
    meta: {
      errorMessage: 'Failed to load beginner opportunities. Please try again.',
    },
  })
}

// Apply to opportunity mutation
export function useApplyToOpportunity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: applyToOpportunity,

    onMutate: async request => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities() })

      // Snapshot the previous value
      const previousOpportunity = queryClient.getQueryData(
        queryKeys.opportunitiesDetail(request.opportunityId)
      )

      // Optimistically update the opportunity
      queryClient.setQueryData(queryKeys.opportunitiesDetail(request.opportunityId), (old: any) => {
        if (!old) return old
        return {
          ...old,
          metadata: {
            ...old.metadata,
            hasApplied: true,
            applicationStatus: 'pending',
          },
        }
      })

      return { previousOpportunity }
    },

    onError: (err, variables, context) => {
      // Rollback the optimistic update
      if (context?.previousOpportunity) {
        queryClient.setQueryData(
          queryKeys.opportunitiesDetail(variables.opportunityId),
          context.previousOpportunity
        )
      }
    },

    onSuccess: (data, variables) => {
      // Invalidate and refetch user opportunities
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.opportunities(), 'user'],
      })

      // Update the opportunity detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.opportunitiesDetail(variables.opportunityId),
      })
    },

    meta: {
      errorMessage: 'Failed to apply to opportunity. Please try again.',
    },
  })
}

// Save opportunity mutation
export function useSaveOpportunity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      opportunityId,
      action,
    }: {
      opportunityId: string
      action: 'save' | 'unsave'
    }) => {
      return deduplicatedFetch(`/api/opportunities/${opportunityId}/save`, {
        method: action === 'save' ? 'POST' : 'DELETE',
        credentials: 'include',
      })
    },

    onMutate: async ({ opportunityId, action }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities() })

      const previousData = queryClient.getQueryData(queryKeys.opportunities())

      // Optimistically update all opportunity queries
      queryClient.setQueriesData({ queryKey: queryKeys.opportunities() }, (old: any) => {
        if (!old) return old

        // Update search results
        if (old.data?.opportunities) {
          return {
            ...old,
            data: {
              ...old.data,
              opportunities: old.data.opportunities.map((opp: Opportunity) =>
                opp.id === opportunityId ? { ...opp, isSaved: action === 'save' } : opp
              ),
            },
          }
        }

        // Update single opportunity
        if (old.id === opportunityId) {
          return { ...old, isSaved: action === 'save' }
        }

        return old
      })

      return { previousData }
    },

    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.opportunities(), context.previousData)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.opportunities(), 'user', 'saved'],
      })
    },

    meta: {
      errorMessage: 'Failed to save opportunity. Please try again.',
    },
  })
}

// Prefetch opportunities hook
export function usePrefetchOpportunities() {
  const queryClient = useQueryClient()

  return {
    prefetchSearch: (params: OpportunitySearchParams) => {
      return queryClient.prefetchQuery({
        queryKey: queryKeys.opportunitiesSearch(params),
        queryFn: createQueryFunction(() => fetchOpportunities(params)),
        staleTime: 3 * 60 * 1000,
      })
    },

    prefetchDetail: (id: string) => {
      return queryClient.prefetchQuery({
        queryKey: queryKeys.opportunitiesDetail(id),
        queryFn: createQueryFunction(() => fetchOpportunityDetail(id)),
        staleTime: 5 * 60 * 1000,
      })
    },

    prefetchBeginner: () => {
      return queryClient.prefetchQuery({
        queryKey: [...queryKeys.opportunities(), 'beginner'],
        queryFn: createQueryFunction(() =>
          fetchOpportunities({
            difficulty: 'beginner',
            good_first_issue: true,
            sort_by: 'match',
            order: 'desc',
            per_page: 15,
          })
        ),
        staleTime: 10 * 60 * 1000,
      })
    },
  }
}

// Opportunity cache management utilities
export const opportunityCacheUtils = {
  // Invalidate all opportunity queries
  invalidateAll: () => cacheUtils.invalidateOpportunities(),

  // Update opportunity in cache
  updateOpportunity: (opportunity: Opportunity) => {
    const queryClient = useQueryClient()

    // Update detail cache
    queryClient.setQueryData(queryKeys.opportunitiesDetail(opportunity.id), opportunity)

    // Update search caches
    queryClient.setQueriesData({ queryKey: queryKeys.opportunities() }, (old: any) => {
      if (!old?.data?.opportunities) return old

      return {
        ...old,
        data: {
          ...old.data,
          opportunities: old.data.opportunities.map((opp: Opportunity) =>
            opp.id === opportunity.id ? opportunity : opp
          ),
        },
      }
    })
  },

  // Mark opportunity as applied
  markAsApplied: (opportunityId: string) => {
    const queryClient = useQueryClient()

    queryClient.setQueriesData({ queryKey: queryKeys.opportunities() }, (old: any) => {
      if (!old) return old

      if (old.data?.opportunities) {
        return {
          ...old,
          data: {
            ...old.data,
            opportunities: old.data.opportunities.map((opp: Opportunity) =>
              opp.id === opportunityId
                ? {
                    ...opp,
                    metadata: {
                      ...opp.metadata,
                      hasApplied: true,
                      applicationStatus: 'pending',
                    },
                  }
                : opp
            ),
          },
        }
      }

      if (old.id === opportunityId) {
        return {
          ...old,
          metadata: {
            ...old.metadata,
            hasApplied: true,
            applicationStatus: 'pending',
          },
        }
      }

      return old
    })
  },

  // Clear stale search results
  clearSearchCache: () => {
    const queryClient = useQueryClient()
    queryClient.removeQueries({
      queryKey: queryKeys.opportunities(),
      predicate: query => query.queryKey.includes('search'),
    })
  },
}

// Export types for components
export type {
  OpportunitySearchParams,
  Opportunity,
  OpportunitySearchResponse,
  OpportunityApplyRequest,
}
