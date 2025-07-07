'use client'

/**
 * Observability Dashboard
 * 
 * Displays system health, metrics, and monitoring information
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

  const fetchHealth = async () => {
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
  }

  useEffect(() => {
    fetchHealth()
    
    // Refresh health data every 30 seconds
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200'
      case 'degraded': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'unhealthy': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅'
      case 'degraded': return '⚠️'
      case 'unhealthy': return '❌'
      default: return '❓'
    }
  }

  if (loading && !health) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Observability Dashboard</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading health data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Observability Dashboard</h1>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
            <button
              onClick={fetchHealth}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Observability Dashboard</h1>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
            Last updated: {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'Unknown'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Component Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {health?.components.map((component) => (
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
              {component.message && (
                <p className="text-sm mb-2">{component.message}</p>
              )}
              {component.details && Object.keys(component.details).length > 0 && (
                <div className="text-xs space-y-1">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="font-medium">Health API</div>
              <div className="text-sm text-gray-600">Raw health check data</div>
            </a>
            <a
              href="/api/metrics"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="font-medium">Metrics API</div>
              <div className="text-sm text-gray-600">Prometheus metrics</div>
            </a>
            <a
              href="/api/health?format=prometheus"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="font-medium">Health Metrics</div>
              <div className="text-sm text-gray-600">Health in Prometheus format</div>
            </a>
            <div className="p-4 border rounded-lg bg-gray-50">
              <div className="font-medium">Jaeger Tracing</div>
              <div className="text-sm text-gray-600">
                {process.env.NODE_ENV === 'production' ? 'Production only' : 'http://localhost:16686'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}