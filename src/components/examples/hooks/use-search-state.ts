/**
 * Search State Hook
 * Extracted from optimized-search.tsx for better organization
 */

import { useState } from 'react'

interface SearchFilters {
  query: string
  language?: string
  minStars?: number
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  goodFirstIssue?: boolean
}

export function useSearchState() {
  const [searchType, setSearchType] = useState<'repositories' | 'opportunities'>('repositories')
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    language: '',
    minStars: 0,
    difficulty: 'beginner',
    goodFirstIssue: true,
  })

  return { searchType, setSearchType, filters, setFilters }
}

export type { SearchFilters }
