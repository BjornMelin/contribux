/**
 * Search Filters Component
 * Form controls for filtering search results
 */

'use client'

import type React from 'react'
import { memo, useCallback } from 'react'
import type { SearchFilters } from './hooks/use-search-state'

interface SearchFiltersProps {
  searchType: 'repositories' | 'opportunities'
  filters: SearchFilters
  setFilters: (filters: SearchFilters) => void
}

export const SearchFiltersForm = memo<SearchFiltersProps>(function SearchFiltersForm({
  searchType,
  filters,
  setFilters,
}) {
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilters({ ...filters, query: e.target.value })
    },
    [filters, setFilters]
  )

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setFilters({ ...filters, language: e.target.value })
    },
    [filters, setFilters]
  )

  const handleMinStarsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilters({ ...filters, minStars: Number.parseInt(e.target.value) || 0 })
    },
    [filters, setFilters]
  )

  const handleDifficultyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value
      const { difficulty: _difficulty, ...restFilters } = filters
      setFilters(
        value === ''
          ? restFilters
          : { ...filters, difficulty: value as 'beginner' | 'intermediate' | 'advanced' }
      )
    },
    [filters, setFilters]
  )

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div>
        <label htmlFor="search-query" className="mb-1 block font-medium text-gray-700 text-sm">
          Search Query
        </label>
        <input
          id="search-query"
          type="text"
          value={filters.query}
          onChange={handleQueryChange}
          placeholder="Search..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="language-select" className="mb-1 block font-medium text-gray-700 text-sm">
          Language
        </label>
        <select
          id="language-select"
          value={filters.language}
          onChange={handleLanguageChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Languages</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
        </select>
      </div>

      {searchType === 'repositories' && (
        <div>
          <label htmlFor="min-stars" className="mb-1 block font-medium text-gray-700 text-sm">
            Min Stars
          </label>
          <input
            id="min-stars"
            type="number"
            value={filters.minStars}
            onChange={handleMinStarsChange}
            min="0"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {searchType === 'opportunities' && (
        <div>
          <label
            htmlFor="difficulty-select"
            className="mb-1 block font-medium text-gray-700 text-sm"
          >
            Difficulty
          </label>
          <select
            id="difficulty-select"
            value={filters.difficulty || ''}
            onChange={handleDifficultyChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Difficulty Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      )}
    </div>
  )
})
