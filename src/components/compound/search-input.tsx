/**
 * Search Input Components
 * Optimized with React.memo for performance
 */

'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PropsWithClassName } from '@/lib/types/advanced'
import type React from 'react'
import { memo, useCallback } from 'react'
import { useSearch } from './search-context'

// Search input component
interface SearchInputProps extends PropsWithClassName {
  placeholder?: string
  autoFocus?: boolean
  onEnter?: () => void
}

export const SearchInput = memo<SearchInputProps>(function SearchInput({
  placeholder = 'Search...',
  autoFocus,
  onEnter,
  className,
}) {
  const { query, setQuery, onSearch, loading } = useSearch()

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onEnter?.()
        onSearch()
      }
    },
    [onEnter, onSearch]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
    },
    [setQuery]
  )

  return (
    <Input
      value={query}
      onChange={handleChange}
      onKeyPress={handleKeyPress}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={loading}
      className={className}
    />
  )
})

// Search button component
interface SearchButtonProps extends PropsWithClassName {
  children?: React.ReactNode
}

export const SearchButton = memo<SearchButtonProps>(function SearchButton({
  children = 'Search',
  className,
}) {
  const { onSearch, loading, query } = useSearch()

  const handleClick = useCallback(() => {
    onSearch()
  }, [onSearch])

  return (
    <Button onClick={handleClick} disabled={loading || !query.trim()} className={className}>
      {loading ? 'Searching...' : children}
    </Button>
  )
})

// Clear button component
export const SearchClearButton = memo<PropsWithClassName>(function SearchClearButton({
  className,
}) {
  const { onClear, query, filters } = useSearch()
  const hasContent = query || Object.keys(filters).length > 0

  const handleClick = useCallback(() => {
    onClear()
  }, [onClear])

  if (!hasContent) return null

  return (
    <Button variant="outline" onClick={handleClick} className={className}>
      Clear
    </Button>
  )
})
