/**
 * Performance Monitoring Dashboard
 * Real-time performance metrics and optimization tracking
 */

import type React from 'react'
// Core icons - using our optimized icon system
import { Activity, AlertTriangle, BarChart3, Check, Clock, Zap } from '@/components/icons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Performance metrics interface
interface PerformanceMetrics {
  bundleSize: {
    total: number
    gzipped: number
    score: number
  }
  runtime: {
    fcp: number // First Contentful Paint
    lcp: number // Largest Contentful Paint
    cls: number // Cumulative Layout Shift
    fid: number // First Input Delay
  }
  api: {
    averageResponseTime: number
    cacheHitRate: number
    errorRate: number
  }
  database: {
    averageQueryTime: number
    slowQueriesCount: number
    indexUsage: number
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

// Mock performance data - in production, this would come from real monitoring
const mockMetrics: PerformanceMetrics = {
  bundleSize: {
    total: 1425000, // 1.43MB
    gzipped: 417480, // 417KB
    score: 82,
  },
  runtime: {
    fcp: 1.2,
    lcp: 2.1,
    cls: 0.05,
    fid: 12,
  },
  api: {
    averageResponseTime: 245,
    cacheHitRate: 78,
    errorRate: 0.3,
  },
  database: {
    averageQueryTime: 45,
    slowQueriesCount: 3,
    indexUsage: 92,
  },
}

// Track optimization implementations
const optimizationStatus: OptimizationStatus[] = [
  {
    id: 'icon-optimization',
    title: 'Lucide React Icon Optimization',
    status: 'completed',
    impact: '~250KB reduction',
    priority: 'high',
    estimatedSaving: 250000,
  },
  {
    id: 'motion-lazy-loading',
    title: 'Framer Motion Lazy Loading',
    status: 'completed',
    impact: '~400KB reduction',
    priority: 'high',
    estimatedSaving: 400000,
  },
  {
    id: 'api-caching',
    title: 'Enhanced API Caching',
    status: 'completed',
    impact: 'Faster data access',
    priority: 'medium',
    estimatedSaving: 0,
  },
  {
    id: 'query-optimization',
    title: 'Database Query Optimization',
    status: 'in-progress',
    impact: 'Reduced query time',
    priority: 'medium',
    estimatedSaving: 0,
  },
  {
    id: 'service-worker',
    title: 'Service Worker Caching',
    status: 'pending',
    impact: 'Offline support',
    priority: 'medium',
    estimatedSaving: 0,
  },
]

// Performance score calculation
const calculateOverallScore = (metrics: PerformanceMetrics): number => {
  const bundleScore = metrics.bundleSize.score
  const runtimeScore = calculateRuntimeScore(metrics.runtime)
  const apiScore = calculateApiScore(metrics.api)
  const dbScore = calculateDatabaseScore(metrics.database)

  return Math.round((bundleScore + runtimeScore + apiScore + dbScore) / 4)
}

const calculateRuntimeScore = (runtime: PerformanceMetrics['runtime']): number => {
  let score = 100

  // FCP scoring (good: <1.8s, poor: >3s)
  if (runtime.fcp > 3) score -= 30
  else if (runtime.fcp > 1.8) score -= 15

  // LCP scoring (good: <2.5s, poor: >4s)
  if (runtime.lcp > 4) score -= 30
  else if (runtime.lcp > 2.5) score -= 15

  // CLS scoring (good: <0.1, poor: >0.25)
  if (runtime.cls > 0.25) score -= 20
  else if (runtime.cls > 0.1) score -= 10

  // FID scoring (good: <100ms, poor: >300ms)
  if (runtime.fid > 300) score -= 20
  else if (runtime.fid > 100) score -= 10

  return Math.max(0, score)
}

const calculateApiScore = (api: PerformanceMetrics['api']): number => {
  let score = 100

  // Response time scoring
  if (api.averageResponseTime > 500) score -= 30
  else if (api.averageResponseTime > 200) score -= 15

  // Cache hit rate scoring
  if (api.cacheHitRate < 50) score -= 30
  else if (api.cacheHitRate < 75) score -= 15

  // Error rate scoring
  if (api.errorRate > 2) score -= 40
  else if (api.errorRate > 1) score -= 20

  return Math.max(0, score)
}

const calculateDatabaseScore = (db: PerformanceMetrics['database']): number => {
  let score = 100

  // Query time scoring
  if (db.averageQueryTime > 100) score -= 30
  else if (db.averageQueryTime > 50) score -= 15

  // Slow queries scoring
  if (db.slowQueriesCount > 5) score -= 30
  else if (db.slowQueriesCount > 2) score -= 15

  // Index usage scoring
  if (db.indexUsage < 80) score -= 20
  else if (db.indexUsage < 90) score -= 10

  return Math.max(0, score)
}

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
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Performance grade based on score
const getPerformanceGrade = (score: number): { grade: string; color: string } => {
  if (score >= 90) return { grade: 'A+', color: 'text-chart-2' }
  if (score >= 80) return { grade: 'A', color: 'text-chart-2/80' }
  if (score >= 70) return { grade: 'B+', color: 'text-chart-4' }
  if (score >= 60) return { grade: 'B', color: 'text-chart-4/80' }
  if (score >= 50) return { grade: 'C+', color: 'text-chart-1' }
  return { grade: 'C', color: 'text-destructive' }
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

// Props interface for the PerformanceDashboard component
interface PerformanceDashboardProps {
  initialData?: PerformanceMetrics | null
}

// Main performance dashboard component
export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ initialData }) => {
  // Use initialData if provided, otherwise fall back to mockMetrics
  const metrics = initialData || mockMetrics
  const overallScore = calculateOverallScore(metrics)
  const performanceGrade = getPerformanceGrade(overallScore)

  const completedOptimizations = optimizationStatus.filter(opt => opt.status === 'completed')
  const totalSavings = completedOptimizations.reduce((sum, opt) => sum + opt.estimatedSaving, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl">Performance Dashboard</h2>
          <p className="text-muted-foreground">
            Real-time performance metrics and optimization tracking
          </p>
        </div>
        <div className="text-right">
          <div className={`font-bold text-3xl ${performanceGrade.color}`}>
            {performanceGrade.grade}
          </div>
          <div className="text-muted-foreground text-sm">Overall Score: {overallScore}/100</div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Bundle Size */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Bundle Size</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{formatBytes(metrics.bundleSize.gzipped)}</div>
            <p className="text-muted-foreground text-xs">
              Gzipped • {formatBytes(metrics.bundleSize.total)} total
            </p>
            <div className="mt-2">
              <div className="font-medium text-chart-2 text-sm">
                -{formatBytes(totalSavings)} optimized
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Core Web Vitals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Core Web Vitals</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>LCP:</span>
                <span className={metrics.runtime.lcp <= 2.5 ? 'text-chart-2' : 'text-chart-1'}>
                  {metrics.runtime.lcp}s
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>FID:</span>
                <span className={metrics.runtime.fid <= 100 ? 'text-chart-2' : 'text-chart-1'}>
                  {metrics.runtime.fid}ms
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>CLS:</span>
                <span className={metrics.runtime.cls <= 0.1 ? 'text-chart-2' : 'text-chart-1'}>
                  {metrics.runtime.cls}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">API Performance</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{formatMs(metrics.api.averageResponseTime)}</div>
            <p className="text-muted-foreground text-xs">Average response time</p>
            <div className="mt-2 space-y-1">
              <div className="text-sm">
                Cache hit: <span className="font-medium">{metrics.api.cacheHitRate}%</span>
              </div>
              <div className="text-sm">
                Error rate: <span className="font-medium">{metrics.api.errorRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Database</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{formatMs(metrics.database.averageQueryTime)}</div>
            <p className="text-muted-foreground text-xs">Average query time</p>
            <div className="mt-2 space-y-1">
              <div className="text-sm">
                Slow queries:{' '}
                <span className="font-medium">{metrics.database.slowQueriesCount}</span>
              </div>
              <div className="text-sm">
                Index usage: <span className="font-medium">{metrics.database.indexUsage}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optimization Status */}
      <Card>
        <CardHeader>
          <CardTitle>Optimization Status</CardTitle>
          <CardDescription>
            Track implementation progress of performance optimizations
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

      {/* Performance Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
          <CardDescription>Recommendations for further performance improvements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-chart-1" />
              <div>
                <div className="font-medium">Complete Database Query Optimization</div>
                <div className="text-muted-foreground text-sm">
                  Implement remaining database optimizations for better query performance
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Clock className="mt-0.5 h-5 w-5 text-chart-2" />
              <div>
                <div className="font-medium">Implement Service Worker Caching</div>
                <div className="text-muted-foreground text-sm">
                  Add offline support and improve subsequent page load performance
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Zap className="mt-0.5 h-5 w-5 text-chart-3" />
              <div>
                <div className="font-medium">Monitor Core Web Vitals</div>
                <div className="text-muted-foreground text-sm">
                  Set up continuous monitoring for LCP, FID, and CLS metrics
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
