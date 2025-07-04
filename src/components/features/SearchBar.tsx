'use client'

import type { SearchBarProps } from '@/types/search'
import type { FormEvent } from 'react'
import { useState } from 'react'

export function SearchBar({
  onSearch,
  placeholder = 'Search opportunities...',
  defaultValue = '',
  loading = false,
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
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
        disabled={loading}
        className="search-input w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Search input"
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="search-button ml-3 rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Search"
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  )
}
