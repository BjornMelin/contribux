'use client'

import React from 'react'
import type { SearchBarProps } from '@/types/search'

export function SearchBar({
  onSearch,
  placeholder = 'Search opportunities...',
  defaultValue = '',
  loading = false,
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = React.useState(defaultValue)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch(query)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`search-bar ${className}`}>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        className="search-input w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Search input"
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="search-button ml-3 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Search"
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  )
}
