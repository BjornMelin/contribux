'use client'

import { useCallback, useId, useMemo } from 'react'
import type {
  DifficultyLevel,
  OpportunityType,
  SearchFiltersProps,
  SearchFilters as SearchFiltersType,
} from '@/types/search'

export function SearchFilters({ filters, onFiltersChange, loading = false }: SearchFiltersProps) {
  // React 19 optimizations: useId for stable IDs across renders
  const difficultyId = useId()
  const typeId = useId()
  const scoreId = useId()

  // Memoized filter change handler
  const handleFilterChange = useCallback(
    <K extends keyof SearchFiltersType>(key: K, value: SearchFiltersType[K]) => {
      onFiltersChange({ ...filters, [key]: value })
    },
    [filters, onFiltersChange]
  )

  // Memoized language toggle with optimistic updates
  const handleLanguageToggle = useCallback(
    (language: string) => {
      const newLanguages = filters.languages.includes(language)
        ? filters.languages.filter(lang => lang !== language)
        : [...filters.languages, language]

      handleFilterChange('languages', newLanguages)
    },
    [filters.languages, handleFilterChange]
  )

  // Memoized reset function
  const resetFilters = useCallback(() => {
    onFiltersChange({
      query: '',
      difficulty: undefined,
      type: undefined,
      languages: [],
      goodFirstIssue: false,
      helpWanted: false,
      minScore: 0,
      maxScore: 1,
      minStars: undefined,
      maxStars: undefined,
      createdAfter: undefined,
      createdBefore: undefined,
      updatedAfter: undefined,
      updatedBefore: undefined,
      repositoryHealthMin: undefined,
      estimatedHoursMin: undefined,
      estimatedHoursMax: undefined,
      requiresMaintainerResponse: undefined,
      hasLinkedPR: undefined,
      hasAssignee: undefined,
      page: 1,
      limit: 20,
      sortBy: 'relevance',
      order: 'desc',
    })
  }, [onFiltersChange])

  // Memoized language options
  const languageOptions = useMemo(
    () => ['TypeScript', 'Python', 'JavaScript', 'Java', 'Go', 'Rust', 'C++', 'C#', 'PHP', 'Ruby'],
    []
  )

  return (
    <div
      className="search-filters space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      data-testid="search-filters"
    >
      {/* Difficulty Filter */}
      <div className="filter-group">
        <label
          htmlFor={difficultyId}
          className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300"
        >
          Difficulty
        </label>
        <select
          id={difficultyId}
          value={filters.difficulty || ''}
          onChange={e => {
            const value = e.target.value
            handleFilterChange('difficulty', value === '' ? undefined : (value as DifficultyLevel))
          }}
          disabled={loading}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">All Difficulties</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </div>

      {/* Type Filter */}
      <div className="filter-group">
        <label
          htmlFor={typeId}
          className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300"
        >
          Type
        </label>
        <select
          id={typeId}
          value={filters.type || ''}
          onChange={e => {
            const value = e.target.value
            handleFilterChange('type', value === '' ? undefined : (value as OpportunityType))
          }}
          disabled={loading}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">All Types</option>
          <option value="bug_fix">Bug Fix</option>
          <option value="feature">Feature</option>
          <option value="documentation">Documentation</option>
          <option value="testing">Testing</option>
          <option value="refactoring">Refactoring</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Language Checkboxes - Enhanced with React 19 optimizations */}
      <div className="filter-group">
        <fieldset>
          <legend className="mb-3 block font-medium text-gray-700 text-sm dark:text-gray-300">
            Languages
          </legend>
          <div className="language-checkboxes grid grid-cols-2 gap-2">
            {languageOptions.map(language => (
              <label key={language} className="checkbox-label flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.languages.includes(language)}
                  onChange={() => handleLanguageToggle(language)}
                  disabled={loading}
                  aria-label={language.toLowerCase()}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
                />
                <span className="text-gray-700 dark:text-gray-300">{language}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Boolean Filters */}
      <div className="filter-group space-y-3">
        <label className="checkbox-label flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={filters.goodFirstIssue}
            onChange={e => handleFilterChange('goodFirstIssue', e.target.checked)}
            disabled={loading}
            aria-label="Good first issue"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
          />
          <span className="text-gray-700 dark:text-gray-300">Good First Issue</span>
        </label>

        <label className="checkbox-label flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={filters.helpWanted}
            onChange={e => handleFilterChange('helpWanted', e.target.checked)}
            disabled={loading}
            aria-label="Help wanted"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"
          />
          <span className="text-gray-700 dark:text-gray-300">Help Wanted</span>
        </label>
      </div>

      {/* Minimum Score Slider */}
      <div className="filter-group">
        <label
          htmlFor={scoreId}
          className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300"
        >
          Minimum Relevance Score: {filters.minScore.toFixed(2)}
        </label>
        <input
          id={scoreId}
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={filters.minScore}
          onChange={e => handleFilterChange('minScore', Number.parseFloat(e.target.value))}
          disabled={loading}
          aria-label="Minimum relevance score"
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-600"
        />
        <div className="mt-1 flex justify-between text-gray-500 text-xs dark:text-gray-400">
          <span>0.0</span>
          <span>1.0</span>
        </div>
      </div>

      <button
        type="button"
        onClick={resetFilters}
        disabled={loading}
        aria-label="Reset filters"
        className="reset-filters-button w-full rounded-md border border-gray-300 bg-gray-100 px-4 py-2 text-gray-700 text-sm transition-colors hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
      >
        Reset Filters
      </button>
    </div>
  )
}
