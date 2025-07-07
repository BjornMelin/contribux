/**
 * Performance Metrics Component
 * Optimized with React.memo for better performance
 */

'use client'

import { memo } from 'react'
import type { useSearchQueries } from '../hooks/use-search-queries'

interface PerformanceMetricsProps {
  queryMetrics: ReturnType<typeof useSearchQueries>['queryMetrics']
}

export const PerformanceMetrics = memo<PerformanceMetricsProps>(function PerformanceMetrics({
  queryMetrics,
}) {
  return (
    <div className="mb-4 rounded-md bg-muted p-3">
      <h3 className="mb-2 font-medium text-foreground text-sm">Performance Metrics</h3>
      <div className="grid grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-muted-foreground">Avg Duration:</span>
          <span className="ml-1 font-medium text-foreground">
            {queryMetrics.averageDuration.toFixed(0)}ms
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Cache Hit Rate:</span>
          <span className="ml-1 font-medium text-foreground">
            {(queryMetrics.cacheHitRate * 100).toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Error Rate:</span>
          <span className="ml-1 font-medium text-foreground">
            {(queryMetrics.errorRate * 100).toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Total Queries:</span>
          <span className="ml-1 font-medium text-foreground">{queryMetrics.metrics.length}</span>
        </div>
      </div>
    </div>
  )
})
