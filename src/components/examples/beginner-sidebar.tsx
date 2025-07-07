/**
 * Beginner Sidebar Component
 * Displays beginner-friendly opportunities
 */

'use client'

import { useBeginnerOpportunities } from '@/lib/api/hooks/use-opportunities'
import { memo } from 'react'

export const BeginnerSidebar = memo(function BeginnerSidebar() {
  const { data: beginnerOpportunities, isLoading: beginnerLoading } = useBeginnerOpportunities({
    per_page: 10,
  })

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="border-b p-4">
        <h3 className="font-semibold text-card-foreground text-lg">Beginner Opportunities</h3>
      </div>
      <div className="p-4">
        {beginnerLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 3 }, (_, _i) => (
              <div
                key={`skeleton-beginner-${crypto.randomUUID()}`}
                className="h-16 rounded bg-muted"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {beginnerOpportunities?.data?.opportunities?.slice(0, 5).map(opportunity => (
              <div
                key={opportunity.id}
                className="rounded-md border p-3 transition-colors hover:bg-muted"
              >
                <h4 className="line-clamp-2 font-medium text-card-foreground text-sm">
                  {opportunity.title}
                </h4>
                <div className="mt-1 flex items-center space-x-2 text-muted-foreground text-xs">
                  <span>🎯 {opportunity.matchScore}/10</span>
                  {opportunity.metadata?.goodFirstIssue && (
                    <span className="rounded bg-success/10 px-1 text-success">
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
  )
})
