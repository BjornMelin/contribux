/**
 * Optimized Feature Components with Lazy Loading
 * Reduces initial bundle size by loading components only when needed
 */

import dynamic from 'next/dynamic'

// Core components that might be needed immediately
export { OpportunityCard } from './OpportunityCard'
export { RepositoryCard } from './RepositoryCard'
export { SearchBar } from './SearchBar'

// Heavy components that can be lazy loaded
export const OpportunityList = dynamic(
  () => import('./OpportunityList').then(m => ({ default: m.OpportunityList })),
  {
    loading: () => (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={`loading-skeleton-${i}`} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    ),
  }
)

export const SearchFilters = dynamic(
  () => import('./SearchFilters').then(m => ({ default: m.SearchFilters })),
  {
    loading: () => <div className="h-16 animate-pulse rounded bg-muted" />,
  }
)
