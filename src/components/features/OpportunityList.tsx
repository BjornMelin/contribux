'use client'

import type { OpportunityListProps } from '@/types/search'
import { OpportunityCard } from './OpportunityCard'

export function OpportunityList({
  opportunities,
  loading = false,
  error = null,
  onOpportunitySelect,
  emptyMessage = 'No opportunities found',
}: OpportunityListProps) {
  if (error) {
    return (
      <div
        className="opportunity-list-error bg-red-50 border border-red-200 rounded-lg p-6 text-center"
        role="alert"
      >
        <div className="text-red-800 mb-4">
          <p className="font-medium">Error loading opportunities: {error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
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
        <div className="loading-spinner animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
        <p className="text-gray-600">Loading opportunities...</p>
      </div>
    )
  }

  if (opportunities.length === 0) {
    return (
      <div className="opportunity-list-empty text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-gray-500 mb-2">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
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
