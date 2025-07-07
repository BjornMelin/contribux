/**
 * Search Actions Hook
 * Handles optimistic mutations and search actions
 */

import { useSaveOpportunity } from '@/lib/api/hooks/use-opportunities'
import { usePrefetchRepositories, useRepositoryBookmark } from '@/lib/api/hooks/use-repositories'
import { useCallback } from 'react'

export function useOptimisticMutations() {
  const bookmarkMutation = useRepositoryBookmark()
  const saveOpportunityMutation = useSaveOpportunity()

  return {
    bookmark: bookmarkMutation,
    saveOpportunity: saveOpportunityMutation,
  }
}

export function useSearchActions(mutations: ReturnType<typeof useOptimisticMutations>) {
  const { prefetchSearch } = usePrefetchRepositories()

  // Prefetch popular searches on hover
  const handlePrefetch = useCallback(
    (searchQuery: string) => {
      prefetchSearch({
        q: searchQuery,
        sort_by: 'stars',
        order: 'desc',
        per_page: 10,
      })
    },
    [prefetchSearch]
  )

  // Handle optimistic bookmark
  const handleBookmark = useCallback(
    async (repositoryId: string, isBookmarked: boolean) => {
      try {
        await mutations.bookmark.mutateAsync({
          repositoryId,
          action: isBookmarked ? 'remove' : 'add',
        })
      } catch (_error) {
        // Error handling is automatic via TanStack Query
      }
    },
    [mutations.bookmark]
  )

  // Handle optimistic save
  const handleSaveOpportunity = useCallback(
    async (opportunityId: string, isSaved: boolean) => {
      try {
        await mutations.saveOpportunity.mutateAsync({
          opportunityId,
          action: isSaved ? 'unsave' : 'save',
        })
      } catch (_error) {
        // Error handling for save action - silently fail for UX
      }
    },
    [mutations.saveOpportunity]
  )

  return {
    handlePrefetch,
    handleBookmark,
    handleSaveOpportunity,
  }
}
