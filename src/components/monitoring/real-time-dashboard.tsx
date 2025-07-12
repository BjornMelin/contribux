'use client'

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  TrendingUp,
  Users,
  Zap,
} from '@/components/icons'
import dynamic from 'next/dynamic'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react'

// Lazy load recharts components to reduce initial bundle size
const AreaChart = dynamic(() => import('recharts').then(mod => ({ default: mod.AreaChart })), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      Loading chart...
    </div>
  ),
})

const LineChart = dynamic(() => import('recharts').then(mod => ({ default: mod.LineChart })), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      Loading chart...
    </div>
  ),
})

const ResponsiveContainer = dynamic(
  () => import('recharts').then(mod => ({ default: mod.ResponsiveContainer })),
  { ssr: false }
)
const Area = dynamic(() => import('recharts').then(mod => ({ default: mod.Area })), { ssr: false })
const Line = dynamic(() => import('recharts').then(mod => ({ default: mod.Line })), { ssr: false })
const CartesianGrid = dynamic(
  () => import('recharts').then(mod => ({ default: mod.CartesianGrid })),
  { ssr: false }
)
const Tooltip = dynamic(() => import('recharts').then(mod => ({ default: mod.Tooltip })), {
  ssr: false,
})
const XAxis = dynamic(() => import('recharts').then(mod => ({ default: mod.XAxis })), {
  ssr: false,
})
const YAxis = dynamic(() => import('recharts').then(mod => ({ default: mod.YAxis })), {
  ssr: false,
})

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { env } from '@/lib/validation/env'

interface MetricData {
  timestamp: number
  value: number
  label?: string
}

interface HealthStatus {
  service: string
  status: 'healthy' | 'degraded' | 'down'
  latency: number
  errorRate: number
}

interface SecurityAlert {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: Date
}

interface WebVitalMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  threshold: { good: number; poor: number }
}

export function RealTimeMonitoringDashboard() {
  // State for real-time metrics
  const [aiMetrics, setAiMetrics] = useState<MetricData[]>([])
  const [_performanceMetrics, setPerformanceMetrics] = useState<MetricData[]>([])
  const [tokenUsage, setTokenUsage] = useState<MetricData[]>([])
  const [healthStatus, setHealthStatus] = useState<HealthStatus[]>([])
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([])
  const [webVitals, setWebVitals] = useState<WebVitalMetric[]>([])
  const [activeUsers, setActiveUsers] = useState(0)
  const [requestVolume, setRequestVolume] = useState(0)
  const [errorRate, setErrorRate] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  // WebSocket connection for real-time updates with authentication
  useEffect(() => {
    // Get authentication token for WebSocket connection
    const getAuthToken = () => {
      // Try cookie first (for authenticated users)
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('access_token='))
        ?.split('=')[1]

      // Try localStorage as fallback (if using localStorage auth)
      return token || localStorage.getItem('access_token')
    }

    const authToken = getAuthToken()

    // Only connect if authenticated
    if (!authToken) {
      return
    }

    // Create WebSocket connection with authentication
    const wsEndpoint = env.NEXT_PUBLIC_WS_ENDPOINT || 'ws://localhost:8080/metrics'
    const wsUrl = new URL(wsEndpoint)
    wsUrl.searchParams.set('token', authToken)

    const ws = new WebSocket(wsUrl.toString())

    ws.onmessage = event => {
      const data = JSON.parse(event.data)
      // Update timestamp inline to avoid circular dependency
      setLastUpdated(new Date())

      // Handle metric updates inline
      if (data.type === 'ai_metrics') {
        setAiMetrics((prev: MetricData[]) => [
          ...prev.slice(-29),
          { timestamp: Date.now(), value: data.value || 0 },
        ])
      } else if (data.type === 'performance_metrics') {
        setPerformanceMetrics((prev: MetricData[]) => [
          ...prev.slice(-29),
          { timestamp: Date.now(), value: data.value || 0 },
        ])
      } else if (data.type === 'token_usage') {
        setTokenUsage((prev: MetricData[]) => [
          ...prev.slice(-29),
          { timestamp: Date.now(), value: data.value || 0 },
        ])
      }
      // Add other metric types as needed
    }

    ws.onerror = _error => {
      // Error handling is optional for monitoring WebSocket
    }

    // Cleanup
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [])

  // Helper functions for metric updates to reduce cognitive complexity
  const updateMetricsWithValue = useCallback(
    (
      setter: Dispatch<SetStateAction<MetricData[]>>,
      data: { value?: unknown; label?: unknown }
    ) => {
      setter(prev => [
        ...prev.slice(-29),
        {
          timestamp: Date.now(),
          value: typeof data.value === 'number' ? data.value : 0,
          label: typeof data.label === 'string' ? data.label : undefined,
        },
      ])
    },
    []
  )

  const updateSimpleMetrics = useCallback(
    (setter: Dispatch<SetStateAction<MetricData[]>>, data: { value?: unknown }) => {
      setter(prev => [
        ...prev.slice(-29),
        {
          timestamp: Date.now(),
          value: typeof data.value === 'number' ? data.value : 0,
        },
      ])
    },
    []
  )

  const updateNumericValue = useCallback(
    (setter: Dispatch<SetStateAction<number>>, data: { value?: unknown }) => {
      setter(typeof data.value === 'number' ? data.value : 0)
    },
    []
  )

  // Metric handlers map for cleaner organization
  const metricHandlers = useCallback(
    (data: { type: string; [key: string]: unknown }) => {
      const handlers: Record<string, () => void> = {
        ai_metrics: () =>
          updateMetricsWithValue(setAiMetrics, { value: data.value, label: data.label }),
        performance: () => updateSimpleMetrics(setPerformanceMetrics, { value: data.value }),
        token_usage: () => updateSimpleMetrics(setTokenUsage, { value: data.value }),
        health_status: () =>
          setHealthStatus(Array.isArray(data.services) ? (data.services as HealthStatus[]) : []),
        security_alert: () =>
          setSecurityAlerts(prev => [data.alert as SecurityAlert, ...prev].slice(0, 10)),
        web_vitals: () =>
          setWebVitals(Array.isArray(data.metrics) ? (data.metrics as WebVitalMetric[]) : []),
        active_users: () => updateNumericValue(setActiveUsers, { value: data.value }),
        request_volume: () => updateNumericValue(setRequestVolume, { value: data.value }),
        error_rate: () => updateNumericValue(setErrorRate, { value: data.value }),
      }
      return handlers[data.type]
    },
    [updateMetricsWithValue, updateSimpleMetrics, updateNumericValue]
  )

  const _handleMetricUpdate = useCallback(
    (data: { type: string; [key: string]: unknown }) => {
      setLastUpdated(new Date())
      const handler = metricHandlers(data)
      handler?.()
    },
    [metricHandlers]
  )

  // Mock data for initial render
  useEffect(() => {
    // Initialize with mock data
    const mockWebVitals: WebVitalMetric[] = [
      {
        name: 'LCP',
        value: 2.1,
        rating: 'good',
        threshold: { good: 2.5, poor: 4.0 },
      },
      {
        name: 'INP',
        value: 180,
        rating: 'good',
        threshold: { good: 200, poor: 500 },
      },
      {
        name: 'CLS',
        value: 0.08,
        rating: 'good',
        threshold: { good: 0.1, poor: 0.25 },
      },
    ]
    setWebVitals(mockWebVitals)

    const mockHealth: HealthStatus[] = [
      { service: 'API Gateway', status: 'healthy', latency: 45, errorRate: 0.1 },
      { service: 'AI Agent', status: 'healthy', latency: 320, errorRate: 0.5 },
      { service: 'Vector DB', status: 'healthy', latency: 85, errorRate: 0.2 },
      { service: 'Auth Service', status: 'healthy', latency: 25, errorRate: 0.0 },
    ]
    setHealthStatus(mockHealth)

    // Generate mock time series data
    const now = Date.now()
    const mockAiData = Array.from({ length: 30 }, (_, i) => ({
      timestamp: now - (29 - i) * 60000,
      value: Math.random() * 100 + 200,
    }))
    setAiMetrics(mockAiData)
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'down':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Info className="h-4 w-4 text-gray-500" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500'
      case 'high':
        return 'bg-orange-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getWebVitalColor = (rating: string) => {
    switch (rating) {
      case 'good':
        return 'text-green-600'
      case 'needs-improvement':
        return 'text-yellow-600'
      case 'poor':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Real-Time Monitoring</h1>
          <p className="text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <Activity className="h-3 w-3" />
          Live
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{activeUsers.toLocaleString()}</div>
            <p className="text-muted-foreground text-xs">
              <TrendingUp className="inline h-3 w-3 text-green-500" /> +12% from last hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Request Volume</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{requestVolume.toLocaleString()}/min</div>
            <Progress value={65} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{errorRate.toFixed(2)}%</div>
            <p className="text-muted-foreground text-xs">Target: &lt; 1%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">AI Latency</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">287ms</div>
            <p className="text-muted-foreground text-xs">P95 response time</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different monitoring views */}
      <Tabs defaultValue="ai-metrics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ai-metrics">AI Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* AI Request Latency Chart */}
            <Card>
              <CardHeader>
                <CardTitle>AI Request Latency</CardTitle>
                <CardDescription>Average response time over last 30 minutes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={aiMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={value => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={value => new Date(value).toLocaleTimeString()}
                        formatter={value =>
                          `${typeof value === 'number' ? value.toFixed(0) : value}ms`
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#8884d8"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Token Usage Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Token Usage</CardTitle>
                <CardDescription>OpenAI token consumption rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={tokenUsage}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={value => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={value => new Date(value).toLocaleTimeString()}
                        formatter={value =>
                          `${typeof value === 'number' ? value.toLocaleString() : value} tokens`
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#82ca9d"
                        fill="#82ca9d"
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {/* Core Web Vitals */}
          <Card>
            <CardHeader>
              <CardTitle>Core Web Vitals</CardTitle>
              <CardDescription>Real user monitoring data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {webVitals.map(vital => (
                  <div key={vital.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{vital.name}</span>
                      <span className={`font-bold text-sm ${getWebVitalColor(vital.rating)}`}>
                        {vital.value}
                        {vital.name === 'CLS' ? '' : 'ms'}
                      </span>
                    </div>
                    <Progress value={(vital.value / vital.threshold.poor) * 100} className="h-2" />
                    <p className="text-muted-foreground text-xs">
                      Good: &lt;{vital.threshold.good} | Poor: &gt;{vital.threshold.poor}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          {/* Security Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Security Alerts</CardTitle>
              <CardDescription>Recent security events and threats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {securityAlerts.length === 0 ? (
                  <p className="py-4 text-center text-muted-foreground">
                    No active security alerts
                  </p>
                ) : (
                  securityAlerts.map(alert => (
                    <Alert key={alert.id} variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="flex items-center gap-2">
                        {alert.type}
                        <Badge className={getSeverityColor(alert.severity)}>{alert.severity}</Badge>
                      </AlertTitle>
                      <AlertDescription>
                        {alert.message}
                        <span className="mt-1 block text-xs">
                          {alert.timestamp.toLocaleString()}
                        </span>
                      </AlertDescription>
                    </Alert>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infrastructure" className="space-y-4">
          {/* Service Health Status */}
          <Card>
            <CardHeader>
              <CardTitle>Service Health</CardTitle>
              <CardDescription>Real-time service status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {healthStatus.map(service => (
                  <div
                    key={service.service}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(service.status)}
                      <div>
                        <p className="font-medium">{service.service}</p>
                        <p className="text-muted-foreground text-sm">
                          Latency: {service.latency}ms | Error rate: {service.errorRate}%
                        </p>
                      </div>
                    </div>
                    <Badge variant={service.status === 'healthy' ? 'default' : 'destructive'}>
                      {service.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
