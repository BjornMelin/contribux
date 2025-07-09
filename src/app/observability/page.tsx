'use client'

/**
 * Observability Dashboard
 *
 * Displays system health, metrics, and monitoring information
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCallback, useEffect, useState } from 'react'

interface HealthComponent {
  component: string
  healthy: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  message?: string
  details?: Record<string, unknown>
  duration: number
  timestamp: string
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  components: HealthComponent[]
  timestamp: string
}

export default function ObservabilityPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/health')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      setHealth(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()

    // Refresh health data every 30 seconds
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'unhealthy':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return '✅'
      case 'degraded':
        return '⚠️'
      case 'unhealthy':
        return '❌'
      default:
        return '❓'
    }
  }

  if (loading && !health) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="mb-6 font-bold text-3xl">Observability Dashboard</h1>
        <div className="flex h-64 items-center justify-center">
          <div className="text-lg">Loading health data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="mb-6 font-bold text-3xl">Observability Dashboard</h1>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
            <button
              type="button"
              onClick={fetchHealth}
              className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-bold text-3xl">Observability Dashboard</h1>
        <button
          type="button"
          onClick={fetchHealth}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Overall System Health */}
      <Card className={`mb-6 border-2 ${getStatusColor(health?.overall || 'unhealthy')}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon(health?.overall || 'unhealthy')}
            Overall System Health: {health?.overall?.toUpperCase()}
          </CardTitle>
          <CardDescription>
            Last updated:{' '}
            {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'Unknown'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Component Health Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {health?.components.map(component => (
          <Card key={component.component} className={`border ${getStatusColor(component.status)}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {getStatusIcon(component.status)}
                {component.component.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </CardTitle>
              <CardDescription className="text-sm">
                Status: {component.status} • {component.duration}ms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {component.message && <p className="mb-2 text-sm">{component.message}</p>}
              {component.details && Object.keys(component.details).length > 0 && (
                <div className="space-y-1 text-xs">
                  {Object.entries(component.details).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="font-medium">{key}:</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Monitoring Links</CardTitle>
          <CardDescription>Access detailed monitoring and metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
            >
              <div className="font-medium">Health API</div>
              <div className="text-gray-600 text-sm">Raw health check data</div>
            </a>
            <a
              href="/api/metrics"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
            >
              <div className="font-medium">Metrics API</div>
              <div className="text-gray-600 text-sm">Prometheus metrics</div>
            </a>
            <a
              href="/api/health?format=prometheus"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
            >
              <div className="font-medium">Health Metrics</div>
              <div className="text-gray-600 text-sm">Health in Prometheus format</div>
            </a>
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="font-medium">Jaeger Tracing</div>
              <div className="text-gray-600 text-sm">
                {process.env.NODE_ENV === 'production'
                  ? 'Production only'
                  : 'http://localhost:16686'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
