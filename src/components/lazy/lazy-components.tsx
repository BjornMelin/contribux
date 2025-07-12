/**
 * Lazy-loaded Components for Bundle Size Optimization
 * Reduces initial bundle size by loading heavy components only when needed
 */

'use client'

import { type ComponentType, lazy, memo, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { isDevelopment } from '@/lib/validation/env'

// Loading fallback components
const ComponentLoadingFallback = memo(function ComponentLoadingFallback() {
  return (
    <Card className="p-6">
      <div className="animate-pulse">
        <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-1/2 rounded bg-gray-200" />
      </div>
    </Card>
  )
})

const SearchLoadingFallback = memo(function SearchLoadingFallback() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse">
        <div className="mb-4 h-10 w-full rounded bg-gray-200" />
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div className="h-8 rounded bg-gray-200" />
          <div className="h-8 rounded bg-gray-200" />
          <div className="h-8 rounded bg-gray-200" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-${i}-${Math.random()}`} className="h-20 rounded bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  )
})

// Lazy loaded components
export const LazySearchCompound = lazy(() =>
  import('@/components/compound/search-compound').then(module => ({
    default: module.Search,
  }))
)

export const LazyOpportunityList = lazy(() =>
  import('@/components/features/OpportunityList').then(module => ({
    default: module.OpportunityList,
  }))
)

export const LazySearchFilters = lazy(() =>
  import('@/components/features/SearchFilters').then(module => ({
    default: module.SearchFilters,
  }))
)

export const LazyOptimizedSearch = lazy(() =>
  import('@/components/examples/optimized-search').then(module => ({
    default: module.OptimizedSearchExample,
  }))
)

// HOC for lazy component wrapper
function withLazyLoading<P extends object>(
  LazyComponent: ComponentType<P>,
  fallback: ComponentType = ComponentLoadingFallback
) {
  return memo(function LazyWrapper(props: P) {
    const FallbackComponent = fallback
    return (
      <Suspense fallback={<FallbackComponent />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  })
}

// Wrapped components with loading states
export const SearchCompound = withLazyLoading(LazySearchCompound, SearchLoadingFallback)
export const OpportunityList = withLazyLoading(LazyOpportunityList)
export const SearchFilters = withLazyLoading(LazySearchFilters)
export const OptimizedSearch = withLazyLoading(LazyOptimizedSearch, SearchLoadingFallback)

// Dynamic imports for code splitting
export const loadSearchComponents = () => {
  return Promise.all([
    import('@/components/compound/search-compound'),
    import('@/components/features/SearchFilters'),
    import('@/components/features/OpportunityList'),
  ])
}

export const loadFeatureComponents = () => {
  return Promise.all([
    import('@/components/features/SearchBar'),
    import('@/components/features/OpportunityCard'),
  ])
}

// Preload utilities for performance
export const preloadSearchComponents = () => {
  if (typeof window !== 'undefined') {
    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduler =
      (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
        .requestIdleCallback || window.setTimeout
    scheduler(() => {
      loadSearchComponents().catch(() => {
        // Silent error handling - preloading is a performance enhancement
      })
    })
  }
}

export const preloadFeatureComponents = () => {
  if (typeof window !== 'undefined') {
    const scheduler =
      (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
        .requestIdleCallback || window.setTimeout
    scheduler(() => {
      loadFeatureComponents().catch(() => {
        // Silent error handling - preloading is a performance enhancement
      })
    })
  }
}

// Bundle analysis utilities (development only)
export const getBundleInfo = () => {
  if (isDevelopment()) {
    return {
      searchComponentsLoaded: !!window.__SEARCH_COMPONENTS_LOADED__,
      featureComponentsLoaded: !!window.__FEATURE_COMPONENTS_LOADED__,
      timestamp: Date.now(),
    }
  }
  return null
}

// Mark components as loaded for bundle analysis
if (typeof window !== 'undefined') {
  loadSearchComponents().then(() => {
    window.__SEARCH_COMPONENTS_LOADED__ = true
  })

  loadFeatureComponents().then(() => {
    window.__FEATURE_COMPONENTS_LOADED__ = true
  })
}

// Type augmentation for window object
declare global {
  interface Window {
    __SEARCH_COMPONENTS_LOADED__?: boolean
    __FEATURE_COMPONENTS_LOADED__?: boolean
  }
}
