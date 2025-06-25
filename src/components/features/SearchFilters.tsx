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
      className="search-filters bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6"
      data-testid="search-filters"
    >
      {/* Difficulty Filter */}
      <div className="filter-group">
        <label htmlFor={difficultyId} className="block text-sm font-medium text-gray-700 mb-2">
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
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
        <label htmlFor={typeId} className="block text-sm font-medium text-gray-700 mb-2">
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
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
          <legend className="block text-sm font-medium text-gray-700 mb-3">Languages</legend>
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
        <label htmlFor={scoreId} className="block text-sm font-medium text-gray-700 mb-2">
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
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0.0</span>
          <span>1.0</span>
        </div>
      </div>

      <button
        type="button"
        onClick={resetFilters}
        disabled={loading}
        aria-label="Reset filters"
        className="reset-filters-button w-full px-4 py-2 text-sm text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Reset Filters
      </button>
    </div>
  )
}
