/**
 * Performance Metrics Component
 * Displays API performance analytics
 */

'use client'

import { memo } from 'react'

import type { useQueryMetrics } from '@/components/providers/query-provider'

interface PerformanceMetricsProps {
  queryMetrics: ReturnType<typeof useQueryMetrics>
}

export const PerformanceMetrics = memo<PerformanceMetricsProps>(function PerformanceMetrics({
  queryMetrics,
}) {
  return (
    <div className="mb-4 rounded-md bg-gray-50 p-3">
      <h3 className="mb-2 font-medium text-gray-700 text-sm">Performance Metrics</h3>
      <div className="grid grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-gray-500">Avg Duration:</span>
          <span className="ml-1 font-medium">{queryMetrics.averageDuration.toFixed(0)}ms</span>
        </div>
        <div>
          <span className="text-gray-500">Cache Hit Rate:</span>
          <span className="ml-1 font-medium">{(queryMetrics.cacheHitRate * 100).toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-gray-500">Error Rate:</span>
          <span className="ml-1 font-medium">{(queryMetrics.errorRate * 100).toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-gray-500">Total Queries:</span>
          <span className="ml-1 font-medium">{queryMetrics.metrics.length}</span>
        </div>
      </div>
    </div>
  )
})
