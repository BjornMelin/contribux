/**
 * Opportunity Result Card Component
 * Displays individual opportunity search results
 */

'use client'

import { memo, useCallback } from 'react'
import type { Opportunity } from '@/lib/api/hooks/use-opportunities'
import { getDifficultyBadgeStyle } from '@/lib/utils/badge-styles'

interface OpportunityResultCardProps {
  opportunity: Opportunity
  onSave: (opportunityId: string, isSaved: boolean) => void
  isSavePending: boolean
}

export const OpportunityResultCard = memo<OpportunityResultCardProps>(
  function OpportunityResultCard({ opportunity, onSave, isSavePending }) {
    const handleSaveClick = useCallback(() => {
      onSave(opportunity.id, false)
    }, [onSave, opportunity.id])

    return (
      <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-medium text-lg text-primary">{opportunity.title}</h3>
            {opportunity.description && (
              <p className="mt-1 line-clamp-2 text-muted-foreground">{opportunity.description}</p>
            )}
            <div className="mt-2 flex items-center space-x-4 text-sm">
              <span
                className={`rounded-full px-2 py-1 font-medium text-xs ${getDifficultyBadgeStyle(opportunity.metadata?.difficulty)}`}
              >
                {opportunity.metadata?.difficulty || 'Unknown'}
              </span>
              <span className="text-muted-foreground">Impact: {opportunity.impactScore}/10</span>
              <span className="text-muted-foreground">Match: {opportunity.matchScore}/10</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSavePending}
            className="ml-4 rounded-md border bg-secondary px-3 py-1 text-secondary-foreground text-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            {isSavePending ? '...' : '💾 Save'}
          </button>
        </div>
      </div>
    )
  }
)
