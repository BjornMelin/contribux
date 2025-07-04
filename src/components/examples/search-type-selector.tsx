/**
 * Search Type Selector Component
 * Toggle between repositories and opportunities search
 */

'use client'

import { memo, useCallback } from 'react'

interface SearchTypeSelectorProps {
  searchType: 'repositories' | 'opportunities'
  setSearchType: (type: 'repositories' | 'opportunities') => void
}

export const SearchTypeSelector = memo<SearchTypeSelectorProps>(function SearchTypeSelector({
  searchType,
  setSearchType,
}) {
  const handleRepositoriesClick = useCallback(() => {
    setSearchType('repositories')
  }, [setSearchType])

  const handleOpportunitiesClick = useCallback(() => {
    setSearchType('opportunities')
  }, [setSearchType])

  return (
    <div className="mb-4 flex space-x-4">
      <button
        type="button"
        onClick={handleRepositoriesClick}
        className={`rounded-md px-4 py-2 font-medium text-sm transition-colors ${
          searchType === 'repositories'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        Repositories
      </button>
      <button
        type="button"
        onClick={handleOpportunitiesClick}
        className={`rounded-md px-4 py-2 font-medium text-sm transition-colors ${
          searchType === 'opportunities'
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        Opportunities
      </button>
    </div>
  )
})
