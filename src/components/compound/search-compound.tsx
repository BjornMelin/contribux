/**
 * Compound Search Component - Optimized Structure
 * Demonstrates compound component pattern for flexible composition
 * Provides a search interface with filters, results, and pagination
 */

'use client'

import { Card } from '@/components/ui/card'
import type { CompoundComponent, SearchCriteria, SearchQuery } from '@/lib/types/advanced'
import type { UUID } from '@/types/base'
import type { Opportunity, Repository } from '@/types/search'
import type React from 'react'
import {
  SearchActiveFilters,
  SearchButton,
  SearchClearButton,
  SearchContainer,
  SearchFilter,
  SearchInput,
  SearchPagination,
  SearchResults,
  SearchStats,
  useSearch,
} from './index'

// Re-export types for backward compatibility
export type { SearchResult } from './search-context'
import type { SearchResult } from './search-context'

// Compose the compound component with optimized sub-components
type SearchCompoundComponent = CompoundComponent<
  React.ComponentProps<typeof SearchContainer>,
  {
    Input: typeof SearchInput
    Button: typeof SearchButton
    ClearButton: typeof SearchClearButton
    Filter: typeof SearchFilter
    ActiveFilters: typeof SearchActiveFilters
    Results: typeof SearchResults
    Pagination: typeof SearchPagination
    Stats: typeof SearchStats
  }
>

const Search = SearchContainer as SearchCompoundComponent

Search.Input = SearchInput
Search.Button = SearchButton
Search.ClearButton = SearchClearButton
Search.Filter = SearchFilter
Search.ActiveFilters = SearchActiveFilters
Search.Results = SearchResults
Search.Pagination = SearchPagination
Search.Stats = SearchStats

export { Search, useSearch }

// Example usage component - optimized for performance
export function SearchExample() {
  const handleSearch = async (
    _query: SearchQuery,
    _filters: SearchCriteria
  ): Promise<SearchResult[]> => {
    // Mock search implementation
    await new Promise(resolve => setTimeout(resolve, 1000))
    return [
      {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' as UUID,
        githubId: 123456,
        name: 'awesome-project',
        fullName: 'user/awesome-project',
        description: 'An awesome open source project',
        language: 'TypeScript',
        topics: ['typescript', 'react', 'web-development'],
        starsCount: 1250,
        forksCount: 85,
        issuesCount: 23,
        url: 'https://github.com/user/awesome-project',
        defaultBranch: 'main',
        lastPushedAt: new Date('2024-01-15'),
        health: {
          score: 0.85,
          status: 'good' as const,
          metrics: {
            commitFrequency: 0.8,
            issueResponseTime: 24,
            prMergeTime: 72,
            maintainerActivity: 0.9,
            communityEngagement: 0.7,
            documentationQuality: 0.8,
            codeQuality: 0.85,
            testCoverage: 0.75,
          },
          lastUpdated: new Date(),
        },
        isArchived: false,
        isFork: false,
        hasIssues: true,
        hasProjects: true,
        hasWiki: false,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date(),
      } as Repository,
    ]
  }

  return (
    <Search onSearch={handleSearch} className="mx-auto max-w-4xl p-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Search.Input placeholder="Search repositories..." className="flex-1" />
            <Search.Button />
            <Search.ClearButton />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Search.Filter
              label="Language"
              filterKey="languages"
              type="multiselect"
              options={[
                { label: 'JavaScript', value: 'javascript' },
                { label: 'TypeScript', value: 'typescript' },
                { label: 'Python', value: 'python' },
                { label: 'Go', value: 'go' },
              ]}
            />

            <Search.Filter label="Stars" filterKey="stars" type="range" min={0} max={10000} />

            <Search.Filter label="Good First Issues" filterKey="hasGoodFirstIssues" type="toggle" />
          </div>

          <Search.ActiveFilters />
          <Search.Stats />

          <Search.Results>
            {results => (
              <div className="space-y-4">
                {results.map((result: Opportunity | Repository) => {
                  const title = 'title' in result ? result.title : result.name
                  return (
                    <Card key={result.id} className="p-4">
                      <h3 className="font-semibold">{title}</h3>
                      <p className="text-gray-600">{result.description}</p>
                    </Card>
                  )
                })}
              </div>
            )}
          </Search.Results>

          <Search.Pagination />
        </div>
      </Card>
    </Search>
  )
}
