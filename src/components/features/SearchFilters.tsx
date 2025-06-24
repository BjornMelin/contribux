'use client'

import React from 'react'
import type { SearchFilters, SearchFiltersProps } from '@/types/search'

export function SearchFilters({ filters, onFiltersChange, loading = false }: SearchFiltersProps) {
  const handleFilterChange = (key: keyof SearchFilters, value: string | boolean | string[]) => {
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
      difficulty: '',
      type: '',
      languages: [],
      good_first_issue: false,
      help_wanted: false,
      min_score: 0,
    })
  }

  return (
    <div
      className="search-filters bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6"
      data-testid="search-filters"
    >
      {/* Difficulty Filter */}
      <div className="filter-group">
        <label htmlFor="difficulty-select" className="block text-sm font-medium text-gray-700 mb-2">
          Difficulty
        </label>
        <select
          id="difficulty-select"
          value={filters.difficulty}
          onChange={e => handleFilterChange('difficulty', e.target.value)}
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
        <label htmlFor="type-select" className="block text-sm font-medium text-gray-700 mb-2">
          Type
        </label>
        <select
          id="type-select"
          value={filters.type}
          onChange={e => handleFilterChange('type', e.target.value)}
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
        <label className="block text-sm font-medium text-gray-700 mb-3">Languages</label>
        <div className="language-checkboxes grid grid-cols-2 gap-2">
          {['TypeScript', 'Python', 'JavaScript', 'Java', 'Go', 'Rust'].map(language => (
            <label key={language} className="checkbox-label flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={filters.languages.includes(language)}
                onChange={() => handleLanguageToggle(language)}
                disabled={loading}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-gray-700">{language}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Boolean Filters */}
      <div className="filter-group">
        <label className="checkbox-label flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={filters.good_first_issue}
            onChange={e => handleFilterChange('good_first_issue', e.target.checked)}
            disabled={loading}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-gray-700">Good First Issue</span>
        </label>
      </div>

      <div className="filter-group">
        <label className="checkbox-label flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={filters.help_wanted}
            onChange={e => handleFilterChange('help_wanted', e.target.checked)}
            disabled={loading}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-gray-700">Help Wanted</span>
        </label>
      </div>

      {/* Minimum Score Slider */}
      <div className="filter-group">
        <label htmlFor="min-score-slider" className="block text-sm font-medium text-gray-700 mb-2">
          Minimum Relevance Score: {filters.min_score.toFixed(2)}
        </label>
        <input
          id="min-score-slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={filters.min_score}
          onChange={e => handleFilterChange('min_score', Number.parseFloat(e.target.value))}
          disabled={loading}
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
        className="reset-filters-button w-full px-4 py-2 text-sm text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Reset Filters
      </button>
    </div>
  )
}
