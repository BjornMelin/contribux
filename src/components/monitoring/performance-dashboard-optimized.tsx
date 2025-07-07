/**
 * Optimized Performance Monitoring Dashboard
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { MemoryProfiler, MemoryMetrics } from '@/lib/monitoring/memory-profiler'

interface PerformanceMetrics {
  // Test execution metrics
  testExecution: {
    totalTests: number
    passedTests: number
    failedTests: number
    avgExecutionTime: number
    parallelization: number
    memoryUsage: number
  }
  
  // Cache performance
  cache: {
    hitRate: number
    size: number
    maxSize: number
    evictions: number
    memoryUsageMB: number
  }
  
  // API performance
  api: {
    avgResponseTime: number
    throughput: number
    errorRate: number
    concurrentRequests: number
  }
  
  // Database performance
  database: {
    avgQueryTime: number
    poolUtilization: number
    connectionCount: number
    slowQueries: number
  }
  
  // Worker thread performance
  workers: {
    activeWorkers: number
    totalWorkers: number
    queuedTasks: number
    avgTaskDuration: number
  }
  
  // Memory metrics
  memory: MemoryMetrics
}

interface PerformanceAlert {
  id: string
  severity: 'info' | 'warning' | 'error'
  message: string
  metric: string
  value: number
  threshold: number
  timestamp: number
}

export function PerformanceDashboardOptimized() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [profiler] = useState(() => new MemoryProfiler())

  // Performance thresholds
  const thresholds = useMemo(() => ({
    testExecutionTime: 10000, // 10 seconds
    cacheHitRate: 0.7, // 70%
    apiResponseTime: 1000, // 1 second
    memoryUsage: 500 * 1024 * 1024, // 500MB
    errorRate: 0.05, // 5%
    poolUtilization: 0.8, // 80%
  }), [])

  // Mock data for demonstration - in real implementation, this would fetch from monitoring services
  const generateMockMetrics = useCallback((): PerformanceMetrics => {
    const memory = process.memoryUsage?.() || {
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      rss: 80 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    }

    return {
      testExecution: {
        totalTests: 450,
        passedTests: 442,
        failedTests: 8,
        avgExecutionTime: Math.random() * 8000 + 3000, // 3-11 seconds
        parallelization: Math.random() * 0.8 + 0.2, // 20-100%
        memoryUsage: memory.heapUsed,
      },
      cache: {
        hitRate: Math.random() * 0.3 + 0.65, // 65-95%
        size: Math.floor(Math.random() * 400 + 100),
        maxSize: 500,
        evictions: Math.floor(Math.random() * 50),
        memoryUsageMB: Math.random() * 100 + 50,
      },
      api: {
        avgResponseTime: Math.random() * 800 + 200, // 200-1000ms
        throughput: Math.random() * 200 + 50, // 50-250 req/s
        errorRate: Math.random() * 0.08, // 0-8%
        concurrentRequests: Math.floor(Math.random() * 20 + 5),
      },
      database: {
        avgQueryTime: Math.random() * 500 + 100, // 100-600ms
        poolUtilization: Math.random() * 0.4 + 0.4, // 40-80%
        connectionCount: Math.floor(Math.random() * 8 + 2),
        slowQueries: Math.floor(Math.random() * 5),
      },
      workers: {
        activeWorkers: Math.floor(Math.random() * 4 + 1),
        totalWorkers: 4,
        queuedTasks: Math.floor(Math.random() * 10),
        avgTaskDuration: Math.random() * 2000 + 500, // 500-2500ms
      },
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        rss: memory.rss,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
        timestamp: Date.now(),
      },
    }
  }, [])

  // Check for performance alerts
  const checkAlerts = useCallback((metrics: PerformanceMetrics) => {
    const newAlerts: PerformanceAlert[] = []

    // Test execution time alert
    if (metrics.testExecution.avgExecutionTime > thresholds.testExecutionTime) {
      newAlerts.push({
        id: `test-time-${Date.now()}`,
        severity: 'warning',
        message: 'Test execution time is above threshold',
        metric: 'Test Execution Time',
        value: metrics.testExecution.avgExecutionTime,
        threshold: thresholds.testExecutionTime,
        timestamp: Date.now(),
      })
    }

    // Cache hit rate alert
    if (metrics.cache.hitRate < thresholds.cacheHitRate) {
      newAlerts.push({
        id: `cache-hit-${Date.now()}`,
        severity: 'warning',
        message: 'Cache hit rate is below optimal',
        metric: 'Cache Hit Rate',
        value: metrics.cache.hitRate,
        threshold: thresholds.cacheHitRate,
        timestamp: Date.now(),
      })
    }

    // API response time alert
    if (metrics.api.avgResponseTime > thresholds.apiResponseTime) {
      newAlerts.push({
        id: `api-time-${Date.now()}`,
        severity: 'error',
        message: 'API response time is too high',
        metric: 'API Response Time',
        value: metrics.api.avgResponseTime,
        threshold: thresholds.apiResponseTime,
        timestamp: Date.now(),
      })
    }

    // Memory usage alert
    if (metrics.memory.heapUsed > thresholds.memoryUsage) {
      newAlerts.push({
        id: `memory-${Date.now()}`,
        severity: 'error',
        message: 'Memory usage is critically high',
        metric: 'Memory Usage',
        value: metrics.memory.heapUsed,
        threshold: thresholds.memoryUsage,
        timestamp: Date.now(),
      })
    }

    // Error rate alert
    if (metrics.api.errorRate > thresholds.errorRate) {
      newAlerts.push({
        id: `error-rate-${Date.now()}`,
        severity: 'error',
        message: 'API error rate is too high',
        metric: 'Error Rate',
        value: metrics.api.errorRate,
        threshold: thresholds.errorRate,
        timestamp: Date.now(),
      })
    }

    setAlerts(prev => [...prev.slice(-10), ...newAlerts]) // Keep last 10 alerts
  }, [thresholds])

  // Start/stop monitoring
  const toggleMonitoring = useCallback(() => {
    if (isMonitoring) {
      setIsMonitoring(false)
    } else {
      setIsMonitoring(true)
      profiler.startProfiling(2000) // Sample every 2 seconds
    }
  }, [isMonitoring, profiler])

  // Update metrics periodically
  useEffect(() => {
    if (!isMonitoring) return

    const interval = setInterval(() => {
      const newMetrics = generateMockMetrics()
      setMetrics(newMetrics)
      checkAlerts(newMetrics)
    }, 2000)

    return () => clearInterval(interval)
  }, [isMonitoring, generateMockMetrics, checkAlerts])

  // Format values for display
  const formatTime = (ms: number) => `${Math.round(ms)}ms`
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`
  const formatMB = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`

  if (!metrics) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Performance Dashboard</h2>
          <button
            onClick={toggleMonitoring}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Monitoring
          </button>
        </div>
        <p className="text-gray-600">Click &quot;Start Monitoring&quot; to begin performance tracking</p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Performance Dashboard</h2>
        <div className="flex items-center space-x-4">
          <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm">{isMonitoring ? 'Monitoring' : 'Stopped'}</span>
          <button
            onClick={toggleMonitoring}
            className={`px-4 py-2 rounded ${
              isMonitoring 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isMonitoring ? 'Stop' : 'Start'} Monitoring
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Recent Alerts</h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {alerts.slice(-5).map(alert => (
              <div
                key={alert.id}
                className={`p-3 rounded border-l-4 ${
                  alert.severity === 'error' 
                    ? 'bg-red-50 border-red-500' 
                    : alert.severity === 'warning'
                    ? 'bg-yellow-50 border-yellow-500'
                    : 'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-gray-600">
                      {alert.metric}: {
                        alert.metric.includes('Time') ? formatTime(alert.value) :
                        alert.metric.includes('Rate') ? formatPercent(alert.value) :
                        alert.metric.includes('Memory') ? formatMB(alert.value) :
                        alert.value.toFixed(2)
                      } (threshold: {
                        alert.metric.includes('Time') ? formatTime(alert.threshold) :
                        alert.metric.includes('Rate') ? formatPercent(alert.threshold) :
                        alert.metric.includes('Memory') ? formatMB(alert.threshold) :
                        alert.threshold.toFixed(2)
                      })
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Test Execution */}
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Test Execution</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Total Tests:</span>
              <span className="font-medium">{metrics.testExecution.totalTests}</span>
            </div>
            <div className="flex justify-between">
              <span>Passed:</span>
              <span className="font-medium text-green-600">{metrics.testExecution.passedTests}</span>
            </div>
            <div className="flex justify-between">
              <span>Failed:</span>
              <span className="font-medium text-red-600">{metrics.testExecution.failedTests}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Time:</span>
              <span className={`font-medium ${
                metrics.testExecution.avgExecutionTime > thresholds.testExecutionTime ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatTime(metrics.testExecution.avgExecutionTime)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Parallelization:</span>
              <span className="font-medium">{formatPercent(metrics.testExecution.parallelization)}</span>
            </div>
            <div className="flex justify-between">
              <span>Memory:</span>
              <span className="font-medium">{formatMB(metrics.testExecution.memoryUsage)}</span>
            </div>
          </div>
        </div>

        {/* Cache Performance */}
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Cache Performance</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Hit Rate:</span>
              <span className={`font-medium ${
                metrics.cache.hitRate < thresholds.cacheHitRate ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatPercent(metrics.cache.hitRate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Size:</span>
              <span className="font-medium">{metrics.cache.size}/{metrics.cache.maxSize}</span>
            </div>
            <div className="flex justify-between">
              <span>Evictions:</span>
              <span className="font-medium">{metrics.cache.evictions}</span>
            </div>
            <div className="flex justify-between">
              <span>Memory:</span>
              <span className="font-medium">{metrics.cache.memoryUsageMB.toFixed(1)}MB</span>
            </div>
          </div>
        </div>

        {/* API Performance */}
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-3">API Performance</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Avg Response:</span>
              <span className={`font-medium ${
                metrics.api.avgResponseTime > thresholds.apiResponseTime ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatTime(metrics.api.avgResponseTime)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Throughput:</span>
              <span className="font-medium">{metrics.api.throughput.toFixed(1)} req/s</span>
            </div>
            <div className="flex justify-between">
              <span>Error Rate:</span>
              <span className={`font-medium ${
                metrics.api.errorRate > thresholds.errorRate ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatPercent(metrics.api.errorRate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Concurrent:</span>
              <span className="font-medium">{metrics.api.concurrentRequests}</span>
            </div>
          </div>
        </div>

        {/* Database Performance */}
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Database</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Avg Query:</span>
              <span className="font-medium">{formatTime(metrics.database.avgQueryTime)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pool Usage:</span>
              <span className={`font-medium ${
                metrics.database.poolUtilization > thresholds.poolUtilization ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {formatPercent(metrics.database.poolUtilization)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Connections:</span>
              <span className="font-medium">{metrics.database.connectionCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Slow Queries:</span>
              <span className={`font-medium ${metrics.database.slowQueries > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {metrics.database.slowQueries}
              </span>
            </div>
          </div>
        </div>

        {/* Worker Performance */}
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Worker Threads</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Active:</span>
              <span className="font-medium">{metrics.workers.activeWorkers}/{metrics.workers.totalWorkers}</span>
            </div>
            <div className="flex justify-between">
              <span>Queued:</span>
              <span className="font-medium">{metrics.workers.queuedTasks}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Task:</span>
              <span className="font-medium">{formatTime(metrics.workers.avgTaskDuration)}</span>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Memory Usage</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Heap Used:</span>
              <span className={`font-medium ${
                metrics.memory.heapUsed > thresholds.memoryUsage ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatMB(metrics.memory.heapUsed)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Heap Total:</span>
              <span className="font-medium">{formatMB(metrics.memory.heapTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>RSS:</span>
              <span className="font-medium">{formatMB(metrics.memory.rss)}</span>
            </div>
            <div className="flex justify-between">
              <span>External:</span>
              <span className="font-medium">{formatMB(metrics.memory.external)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}