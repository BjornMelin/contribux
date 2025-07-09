/**
 * Repository Result Card Component
 * Displays individual repository search results
 */

'use client'

import { memo, useCallback } from 'react'
import type { Repository } from '@/lib/api/hooks/use-repositories'

interface RepositoryResultCardProps {
  repository: Repository
  onPrefetch: (query: string) => void
  onBookmark: (repositoryId: string, isBookmarked: boolean) => void
  isBookmarkPending: boolean
}

export const RepositoryResultCard = memo<RepositoryResultCardProps>(function RepositoryResultCard({
  repository,
  onPrefetch,
  onBookmark,
  isBookmarkPending,
}) {
  const handleMouseEnter = useCallback(() => {
    onPrefetch(repository.name)
  }, [onPrefetch, repository.name])

  const handleBookmarkClick = useCallback(() => {
    onBookmark(repository.id, false)
  }, [onBookmark, repository.id])

  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-lg text-primary hover:text-primary/80">
            <a
              href={`https://github.com/${repository.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={handleMouseEnter}
            >
              {repository.fullName}
            </a>
          </h3>
          {repository.description && (
            <p className="mt-1 text-muted-foreground">{repository.description}</p>
          )}
          <div className="mt-2 flex items-center space-x-4 text-muted-foreground text-sm">
            {repository.metadata?.language && <span>📝 {repository.metadata.language}</span>}
            {repository.metadata?.stars !== undefined && (
              <span>⭐ {repository.metadata.stars.toLocaleString()}</span>
            )}
            {repository.metadata?.forks !== undefined && (
              <span>🍴 {repository.metadata.forks.toLocaleString()}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleBookmarkClick}
          disabled={isBookmarkPending}
          className="ml-4 rounded-md border bg-secondary px-3 py-1 text-secondary-foreground text-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
        >
          {isBookmarkPending ? '...' : '🔖 Bookmark'}
        </button>
      </div>
    </div>
  )
})
