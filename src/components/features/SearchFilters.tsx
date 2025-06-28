'use client'

import { useId } from 'react'
import type {
  DifficultyLevel,
  OpportunityType,
  SearchFiltersProps,
  SearchFilters as SearchFiltersType,
} from '@/types/search'

export function SearchFilters({ filters, onFiltersChange, loading = false }: SearchFiltersProps) {
  const difficultyId = useId()
  const typeId = useId()
  const scoreId = useId()

  const handleFilterChange = <K extends keyof SearchFiltersType>(
    key: K,
    value: SearchFiltersType[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const handleLanguageToggle = (language: string) => {
    const newLanguages = filters.languages.includes(language)
      ? filters.languages.filter(lang => lang !== language)
      : [...filters.languages, language]

    handleFilterChange('languages', newLanguages)
  }

  const resetFilters = () => {
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
  }

  return (
    <div
      className="search-filters space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      data-testid="search-filters"
    >
      {/* Difficulty Filter */}
      <div className="filter-group">
        <label htmlFor={difficultyId} className="mb-2 block font-medium text-gray-700 text-sm">
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
        <label htmlFor={typeId} className="mb-2 block font-medium text-gray-700 text-sm">
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Language Checkboxes */}
      <div className="filter-group">
        <fieldset>
          <legend className="mb-3 block font-medium text-gray-700 text-sm">Languages</legend>
          <div className="language-checkboxes grid grid-cols-2 gap-2">
            {['TypeScript', 'Python', 'JavaScript', 'Java', 'Go', 'Rust'].map(language => (
              <label key={language} className="checkbox-label flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.languages.includes(language)}
                  onChange={() => handleLanguageToggle(language)}
                  disabled={loading}
                  aria-label={language.toLowerCase()}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-gray-700">{language}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Boolean Filters */}
      <div className="filter-group">
        <label className="checkbox-label flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={filters.goodFirstIssue}
            onChange={e => handleFilterChange('goodFirstIssue', e.target.checked)}
            disabled={loading}
            aria-label="Good first issue"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-gray-700">Good First Issue</span>
        </label>
      </div>

      <div className="filter-group">
        <label className="checkbox-label flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={filters.helpWanted}
            onChange={e => handleFilterChange('helpWanted', e.target.checked)}
            disabled={loading}
            aria-label="Help wanted"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-gray-700">Help Wanted</span>
        </label>
      </div>

      {/* Minimum Score Slider */}
      <div className="filter-group">
        <label htmlFor={scoreId} className="mb-2 block font-medium text-gray-700 text-sm">
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
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between text-gray-500 text-xs">
          <span>0.0</span>
          <span>1.0</span>
        </div>
      </div>

      <button
        type="button"
        onClick={resetFilters}
        disabled={loading}
        aria-label="Reset filters"
        className="reset-filters-button w-full rounded-md border border-gray-300 bg-gray-100 px-4 py-2 text-gray-700 text-sm transition-colors hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset Filters
      </button>
    </div>
  )
}
