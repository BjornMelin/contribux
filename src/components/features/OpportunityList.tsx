'use client'

import type { OpportunityListProps } from '@/types/search'
import { OpportunityCard } from './OpportunityCard'

export function OpportunityList({
  opportunities,
  loading = false,
  error = undefined,
  onOpportunitySelect,
  emptyMessage = 'No opportunities found',
}: OpportunityListProps) {
  if (error) {
    return (
      <div
        className="opportunity-list-error rounded-lg border border-red-200 bg-red-50 p-6 text-center"
        role="alert"
      >
        <div className="mb-4 text-red-800">
          <p className="font-medium">Error loading opportunities: {error}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-md border border-red-300 bg-red-100 px-4 py-2 font-medium text-red-700 text-sm transition-colors hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className="opportunity-list-loading flex flex-col items-center justify-center py-12"
        aria-live="polite"
      >
        <div className="loading-spinner mb-4 h-8 w-8 animate-spin rounded-full border-blue-600 border-b-2" />
        <p className="text-gray-600">Loading opportunities...</p>
      </div>
    )
  }

  if (opportunities.length === 0) {
    return (
      <div className="opportunity-list-empty rounded-lg border border-gray-200 bg-gray-50 py-12 text-center">
        <div className="mb-2 text-gray-500">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <title>No opportunities available</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-gray-600">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="opportunity-list space-y-4" data-testid="opportunity-list">
      {opportunities.map(opportunity => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          onSelect={onOpportunitySelect}
        />
      ))}
    </div>
  )
}
