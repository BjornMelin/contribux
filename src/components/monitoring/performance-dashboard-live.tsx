/**
 * Live Performance Monitoring Dashboard
 * Real-time performance metrics with auto-refresh and live data integration
 */

'use client'

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  RefreshCw,
  Zap,
} from '@/components/icons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Enhanced performance metrics interface matching our API
interface LivePerformanceMetrics {
  timestamp: string
  application: {
    uptime: number
    memory: {
      used: number
      total: number
      percentage: number
      gc_runs?: number
    }
    cpu: {
      usage_percentage: number
    }
    requests: {
      total: number
      per_minute: number
      error_rate: number
    }
  }
  database: {
    connection_pool: {
      active: number
      idle: number
      total: number
    }
    query_performance: {
      avg_query_time: number
      slow_queries: number
      total_queries: number
    }
    health_score: number
  }
  api_endpoints: Array<{
    endpoint: string
    avg_response_time: number
    requests_per_minute: number
    error_rate: number
    p95_response_time: number
  }>
  core_web_vitals: {
    first_contentful_paint: number
    largest_contentful_paint: number
    cumulative_layout_shift: number
    first_input_delay: number
    time_to_interactive: number
  }
  security: {
    failed_auth_attempts: number
    rate_limit_violations: number
    suspicious_requests: number
  }
  deployment: {
    version: string
    build_time: string
    last_deployed: string
    environment: string
  }
}

// Optimization status tracking
interface OptimizationStatus {
  id: string
  title: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  impact: string
  priority: 'high' | 'medium' | 'low'
  estimatedSaving: number
}

// Updated optimization status reflecting GROUP 1 & 2 achievements
const optimizationStatus: OptimizationStatus[] = [
  {
    id: 'icon-optimization',
    title: 'Lucide React Icon Optimization',
    status: 'completed',
    impact: '87% icon size reduction',
    priority: 'high',
    estimatedSaving: 250000,
  },
  {
    id: 'motion-lazy-loading',
    title: 'Framer Motion Lazy Loading',
    status: 'completed',
    impact: 'Dynamic imports implemented',
    priority: 'high',
    estimatedSaving: 400000,
  },
  {
    id: 'bundle-optimization',
    title: 'Bundle Splitting & Code Splitting',
    status: 'completed',
    impact: '71% overall optimization',
    priority: 'high',
    estimatedSaving: 600000,
  },
  {
    id: 'edge-runtime',
    title: 'Edge Runtime Compatibility',
    status: 'completed',
    impact: 'Global distribution optimized',
    priority: 'high',
    estimatedSaving: 0,
  },
  {
    id: 'production-build',
    title: 'Production Build Optimization',
    status: 'completed',
    impact: 'Zero build errors',
    priority: 'high',
    estimatedSaving: 0,
  },
  {
    id: 'real-time-monitoring',
    title: 'Real-Time Performance Monitoring',
    status: 'completed',
    impact: 'Live metrics dashboard',
    priority: 'medium',
    estimatedSaving: 0,
  },
]

// Format bytes for display
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// Format milliseconds for display
const formatMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Format uptime
const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

// Performance grade based on various metrics
// Performance scoring configuration
const PERFORMANCE_THRESHOLDS = {
  coreWebVitals: {
    lcp: { good: 2500, poor: 4000, penalty: { good: 0, fair: 10, poor: 20 } },
    cls: { good: 0.1, poor: 0.25, penalty: { good: 0, fair: 7, poor: 15 } },
    fid: { good: 100, poor: 300, penalty: { good: 0, fair: 7, poor: 15 } },
  },
  database: {
    queryTime: { good: 50, poor: 100, penalty: { good: 0, fair: 7, poor: 15 } },
  },
  memory: {
    usage: { good: 70, poor: 90, penalty: { good: 0, fair: 5, poor: 10 } },
  },
  errors: {
    rate: { good: 1, poor: 2, penalty: { good: 0, fair: 10, poor: 20 } },
  },
} as const

// Score Core Web Vitals performance
const scoreCoreWebVitals = (vitals: LivePerformanceMetrics['core_web_vitals']): number => {
  let penalty = 0
  const { coreWebVitals } = PERFORMANCE_THRESHOLDS

  // LCP scoring
  if (vitals.largest_contentful_paint > coreWebVitals.lcp.poor) {
    penalty += coreWebVitals.lcp.penalty.poor
  } else if (vitals.largest_contentful_paint > coreWebVitals.lcp.good) {
    penalty += coreWebVitals.lcp.penalty.fair
  }

  // CLS scoring
  if (vitals.cumulative_layout_shift > coreWebVitals.cls.poor) {
    penalty += coreWebVitals.cls.penalty.poor
  } else if (vitals.cumulative_layout_shift > coreWebVitals.cls.good) {
    penalty += coreWebVitals.cls.penalty.fair
  }

  // FID scoring
  if (vitals.first_input_delay > coreWebVitals.fid.poor) {
    penalty += coreWebVitals.fid.penalty.poor
  } else if (vitals.first_input_delay > coreWebVitals.fid.good) {
    penalty += coreWebVitals.fid.penalty.fair
  }

  return penalty
}

// Score database performance
const scoreDatabasePerformance = (database: LivePerformanceMetrics['database']): number => {
  const { queryTime } = PERFORMANCE_THRESHOLDS.database

  if (database.query_performance.avg_query_time > queryTime.poor) {
    return queryTime.penalty.poor
  }
  if (database.query_performance.avg_query_time > queryTime.good) {
    return queryTime.penalty.fair
  }
  return queryTime.penalty.good
}

// Score memory usage
const scoreMemoryUsage = (memory: LivePerformanceMetrics['application']['memory']): number => {
  const { usage } = PERFORMANCE_THRESHOLDS.memory

  if (memory.percentage > usage.poor) {
    return usage.penalty.poor
  }
  if (memory.percentage > usage.good) {
    return usage.penalty.fair
  }
  return usage.penalty.good
}

// Score error rates
const scoreErrorRates = (requests: LivePerformanceMetrics['application']['requests']): number => {
  const { rate } = PERFORMANCE_THRESHOLDS.errors

  if (requests.error_rate > rate.poor) {
    return rate.penalty.poor
  }
  if (requests.error_rate > rate.good) {
    return rate.penalty.fair
  }
  return rate.penalty.good
}

// Calculate overall performance score
const calculatePerformanceScore = (metrics: LivePerformanceMetrics): number => {
  let score = 100

  score -= scoreCoreWebVitals(metrics.core_web_vitals)
  score -= scoreDatabasePerformance(metrics.database)
  score -= scoreMemoryUsage(metrics.application.memory)
  score -= scoreErrorRates(metrics.application.requests)

  return Math.max(0, Math.min(100, score))
}

// Get grade and color from score
const getGradeFromScore = (score: number): { grade: string; color: string } => {
  if (score >= 90) return { grade: 'A+', color: 'text-chart-2' }
  if (score >= 80) return { grade: 'A', color: 'text-chart-2/80' }
  if (score >= 70) return { grade: 'B+', color: 'text-chart-4' }
  if (score >= 60) return { grade: 'B', color: 'text-chart-4/80' }
  if (score >= 50) return { grade: 'C+', color: 'text-chart-1' }
  return { grade: 'C', color: 'text-destructive' }
}
const getPerformanceGrade = (
  metrics: LivePerformanceMetrics | null
): { grade: string; color: string; score: number } => {
  if (!metrics) return { grade: 'N/A', color: 'text-muted-foreground', score: 0 }

  const score = calculatePerformanceScore(metrics)
  const { grade, color } = getGradeFromScore(score)

  return { grade, color, score }
}

// Status icon component
const StatusIcon: React.FC<{ status: OptimizationStatus['status'] }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <Check className="h-4 w-4 text-chart-2" />
    case 'in-progress':
      return <Clock className="h-4 w-4 text-chart-4" />
    case 'failed':
      return <AlertTriangle className="h-4 w-4 text-destructive" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}

// Loading state component
const _LoadingState: React.FC = () => (
  <div className="flex items-center justify-center p-8">
    <div className="flex items-center space-x-2">
      <RefreshCw className="h-4 w-4 animate-spin" />
      <span>Loading performance metrics...</span>
    </div>
  </div>
)

// Error state component
const _ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="flex items-center justify-center p-8">
    <div className="text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
      <p className="mt-2 text-muted-foreground">Failed to load performance metrics</p>
      <p className="text-muted-foreground text-sm">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded bg-primary px-3 py-1 text-primary-foreground text-sm hover:bg-primary/80"
      >
        Retry
      </button>
    </div>
  </div>
)

// Performance header component
const _PerformanceHeader: React.FC<{
  lastUpdate: Date | null
  isRefreshing: boolean
  onRefresh: () => void
  performanceGrade: { grade: string; color: string; score: number }
}> = ({ lastUpdate, isRefreshing, onRefresh, performanceGrade }) => (
  <div className="flex items-center justify-between">
    <div>
      <h2 className="font-bold text-2xl">Live Performance Dashboard</h2>
      <p className="text-muted-foreground">
        Real-time performance metrics and optimization tracking
      </p>
      {lastUpdate && (
        <p className="text-muted-foreground text-xs">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </p>
      )}
    </div>
    <div className="flex items-center space-x-4">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center space-x-2 rounded bg-secondary px-3 py-1 text-secondary-foreground text-sm hover:bg-secondary/80 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        <span>Refresh</span>
      </button>
      <div className="text-right">
        <div className={`font-bold text-3xl ${performanceGrade.color}`}>
          {performanceGrade.grade}
        </div>
        <div className="text-muted-foreground text-sm">Score: {performanceGrade.score}/100</div>
      </div>
    </div>
  </div>
)

// Metrics grid component
const MetricsGrid: React.FC<{ metrics: LivePerformanceMetrics | null }> = ({ metrics }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
    {/* Application Health */}
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">Application Health</CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">
          {metrics ? formatUptime(metrics.application.uptime) : 'N/A'}
        </div>
        <p className="text-muted-foreground text-xs">Uptime</p>
        {metrics && (
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              Memory: <span className="font-medium">{metrics.application.memory.percentage}%</span>
            </div>
            <div className="text-sm">
              CPU:{' '}
              <span className="font-medium">
                {Math.round(metrics.application.cpu.usage_percentage)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Core Web Vitals */}
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">Core Web Vitals</CardTitle>
        <Zap className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {metrics ? (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>LCP:</span>
              <span
                className={
                  metrics.core_web_vitals.largest_contentful_paint <= 2500
                    ? 'text-chart-2'
                    : 'text-chart-1'
                }
              >
                {formatMs(metrics.core_web_vitals.largest_contentful_paint)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>FID:</span>
              <span
                className={
                  metrics.core_web_vitals.first_input_delay <= 100 ? 'text-chart-2' : 'text-chart-1'
                }
              >
                {formatMs(metrics.core_web_vitals.first_input_delay)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>CLS:</span>
              <span
                className={
                  metrics.core_web_vitals.cumulative_layout_shift <= 0.1
                    ? 'text-chart-2'
                    : 'text-chart-1'
                }
              >
                {metrics.core_web_vitals.cumulative_layout_shift.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>TTI:</span>
              <span className="text-muted-foreground">
                {formatMs(metrics.core_web_vitals.time_to_interactive)}
              </span>
            </div>
          </div>
        ) : (
          <div className="font-bold text-2xl text-muted-foreground">N/A</div>
        )}
      </CardContent>
    </Card>

    {/* Database Performance */}
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">Database</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">
          {metrics ? formatMs(metrics.database.query_performance.avg_query_time) : 'N/A'}
        </div>
        <p className="text-muted-foreground text-xs">Average query time</p>
        {metrics && (
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              Health:{' '}
              <span className="font-medium">{Math.round(metrics.database.health_score)}%</span>
            </div>
            <div className="text-sm">
              Slow queries:{' '}
              <span className="font-medium">{metrics.database.query_performance.slow_queries}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Security Status */}
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">Security</CardTitle>
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">
          {metrics
            ? metrics.security.failed_auth_attempts + metrics.security.rate_limit_violations
            : 'N/A'}
        </div>
        <p className="text-muted-foreground text-xs">Security events</p>
        {metrics && (
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              Failed auth:{' '}
              <span className="font-medium">{metrics.security.failed_auth_attempts}</span>
            </div>
            <div className="text-sm">
              Suspicious:{' '}
              <span className="font-medium">{metrics.security.suspicious_requests}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  </div>
)

// API endpoints list component
const ApiEndpointsList: React.FC<{ endpoints: LivePerformanceMetrics['api_endpoints'] }> = ({
  endpoints,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>API Endpoint Performance</CardTitle>
      <CardDescription>Real-time endpoint response times and error rates</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {endpoints.map(endpoint => (
          <div
            key={endpoint.endpoint}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div>
              <div className="font-medium text-sm">{endpoint.endpoint}</div>
              <div className="text-muted-foreground text-xs">
                {endpoint.requests_per_minute} req/min • {endpoint.error_rate.toFixed(1)}% errors
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium text-sm">{formatMs(endpoint.avg_response_time)}</div>
              <div className="text-muted-foreground text-xs">
                p95: {formatMs(endpoint.p95_response_time)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Optimization status list component
const OptimizationStatusList: React.FC<{
  completedOptimizations: OptimizationStatus[]
  totalSavings: number
}> = ({ completedOptimizations, totalSavings }) => (
  <Card>
    <CardHeader>
      <CardTitle>Optimization Achievements</CardTitle>
      <CardDescription>
        Portfolio showcase: {completedOptimizations.length} optimizations completed
        {totalSavings > 0 && ` • ${formatBytes(totalSavings)} total savings`}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {optimizationStatus.map(optimization => (
          <div
            key={optimization.id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center space-x-3">
              <StatusIcon status={optimization.status} />
              <div>
                <div className="font-medium">{optimization.title}</div>
                <div className="text-muted-foreground text-sm">
                  {optimization.impact} • Priority: {optimization.priority}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium text-sm capitalize">
                {optimization.status.replace('-', ' ')}
              </div>
              {optimization.estimatedSaving > 0 && (
                <div className="text-chart-2 text-xs">
                  -{formatBytes(optimization.estimatedSaving)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Deployment info component
const DeploymentInfo: React.FC<{ deployment: LivePerformanceMetrics['deployment'] }> = ({
  deployment,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Deployment Information</CardTitle>
      <CardDescription>Current deployment details and environment status</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Version:</span> {deployment.version}
        </div>
        <div>
          <span className="text-muted-foreground">Environment:</span> {deployment.environment}
        </div>
        <div>
          <span className="text-muted-foreground">Last Deployed:</span>{' '}
          {new Date(deployment.last_deployed).toLocaleString()}
        </div>
        <div>
          <span className="text-muted-foreground">Build Time:</span>{' '}
          {new Date(deployment.build_time).toLocaleString()}
        </div>
      </div>
    </CardContent>
  </Card>
)

// Custom hook for performance metrics data fetching
const usePerformanceMetrics = () => {
  const [metrics, setMetrics] = useState<LivePerformanceMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchMetrics = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setIsRefreshing(true)

      const response = await fetch('/api/monitoring/performance', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status}`)
      }

      const data = await response.json()
      setMetrics(data)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch performance metrics')
      // TODO: Implement proper error telemetry for performance dashboard
    } finally {
      setIsLoading(false)
      if (isManualRefresh) setIsRefreshing(false)
    }
  }, []) // Empty dependency array since all setState functions are stable

  // Auto-refresh metrics every 30 seconds
  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(() => {
      fetchMetrics()
    }, 30000) // 30 second refresh

    return () => clearInterval(interval)
  }, [fetchMetrics])

  return {
    metrics,
    isLoading,
    error,
    lastUpdate,
    isRefreshing,
    refresh: fetchMetrics,
  }
}

// Main live performance dashboard component
export const LivePerformanceDashboard: React.FC = () => {
  const { metrics, isLoading, error, lastUpdate, isRefreshing, refresh } = usePerformanceMetrics()

  const performanceGrade = getPerformanceGrade(metrics)
  const completedOptimizations = optimizationStatus.filter(opt => opt.status === 'completed')
  const totalSavings = completedOptimizations.reduce((sum, opt) => sum + opt.estimatedSaving, 0)

  // Early returns for loading and error states
  if (isLoading && !metrics) return <_LoadingState />
  if (error && !metrics) return <_ErrorState error={error} onRetry={() => refresh(true)} />

  return (
    <div className="space-y-6">
      <_PerformanceHeader
        lastUpdate={lastUpdate}
        isRefreshing={isRefreshing}
        onRefresh={() => refresh(true)}
        performanceGrade={performanceGrade}
      />

      <MetricsGrid metrics={metrics} />

      {metrics?.api_endpoints && metrics.api_endpoints.length > 0 && (
        <ApiEndpointsList endpoints={metrics.api_endpoints} />
      )}

      <OptimizationStatusList
        completedOptimizations={completedOptimizations}
        totalSavings={totalSavings}
      />

      {metrics && <DeploymentInfo deployment={metrics.deployment} />}
    </div>
  )
}

export default LivePerformanceDashboard
