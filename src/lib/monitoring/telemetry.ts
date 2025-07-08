/**
 * Telemetry Service for Contribux AI Application
 * Provides comprehensive monitoring with OpenTelemetry integration
 */

import {
  type Counter,
  type Histogram,
  type Meter,
  SpanKind,
  SpanStatusCode,
  context,
  diag,
  trace,
} from '@opentelemetry/api'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

// Custom AI metrics
interface AIMetrics {
  tokenUsage: number
  inferenceLatency: number
  modelProvider: string
  operationType: string
  promptLength: number
  responseLength: number
  vectorSearchLatency?: number
  embeddingDimensions?: number
}

// Security event types
interface SecurityEvent {
  type: 'prompt_injection' | 'data_leakage' | 'unauthorized_access' | 'jailbreak_attempt'
  severity: 'low' | 'medium' | 'high' | 'critical'
  sourceIp?: string
  userId?: string
  details: Record<string, unknown>
}

class TelemetryService {
  private static instance: TelemetryService
  private sdk: NodeSDK | null = null
  private tracer = trace.getTracer('contribux-ai', '1.0.0')
  private meter: Meter | null = null

  // Metric instruments
  private aiRequestCounter: Counter | null = null
  private aiLatencyHistogram: Histogram | null = null
  private tokenUsageCounter: Counter | null = null
  private vectorSearchHistogram: Histogram | null = null
  private securityEventCounter: Counter | null = null
  private errorCounter: Counter | null = null
  private webVitalsHistogram: Histogram | null = null

  private constructor() {}

  static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService()
    }
    return TelemetryService.instance
  }

  async initialize() {
    // Resource configuration
    const resource = resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'contribux-ai',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.VERCEL_ENV || 'development',
      'ai.enabled': true,
      'serverless.platform': 'vercel',
    })

    // Trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
      headers: {
        Authorization: `Bearer ${process.env.OTEL_AUTH_TOKEN}`,
      },
    })

    // Metric exporters
    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
      headers: {
        Authorization: `Bearer ${process.env.OTEL_AUTH_TOKEN}`,
      },
    })

    // Prometheus exporter for local scraping
    const _prometheusExporter = new PrometheusExporter(
      {
        port: 9090,
        endpoint: '/metrics',
      },
      () => {
        // Prometheus exporter started
      }
    )

    // Initialize SDK
    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30000,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Disable for serverless
          },
        }),
        new HttpInstrumentation({
          requestHook: (span, request) => {
            if ('headers' in request && request.headers) {
              span.setAttribute('http.request.body.size', request.headers['content-length'] || 0)
            }
          },
          responseHook: (span, response) => {
            if ('headers' in response && response.headers) {
              span.setAttribute('http.response.body.size', response.headers['content-length'] || 0)
            }
          },
        }),
      ],
    })

    await this.sdk.start()

    // Initialize meter and instruments
    const { MeterProvider } = await import('@opentelemetry/sdk-metrics')
    const meterProvider = new MeterProvider({ resource })
    this.meter = meterProvider.getMeter('contribux-ai-metrics', '1.0.0')

    this.initializeMetrics()
  }

  private initializeMetrics() {
    if (!this.meter) {
      diag.warn('Meter not initialized, skipping metrics creation')
      return
    }

    // AI-specific metrics
    this.aiRequestCounter = this.meter.createCounter('ai.agent.requests', {
      description: 'Number of AI agent requests',
      unit: '1',
    })

    this.aiLatencyHistogram = this.meter.createHistogram('ai.agent.request.duration', {
      description: 'AI agent request duration',
      unit: 'ms',
    })

    this.tokenUsageCounter = this.meter.createCounter('ai.model.tokens.used', {
      description: 'Number of tokens used by AI models',
      unit: '1',
    })

    this.vectorSearchHistogram = this.meter.createHistogram('vector.search.latency', {
      description: 'Vector search operation latency',
      unit: 'ms',
    })

    this.securityEventCounter = this.meter.createCounter('security.events', {
      description: 'Security events detected',
      unit: '1',
    })

    this.errorCounter = this.meter.createCounter('errors.total', {
      description: 'Total errors by type',
      unit: '1',
    })

    this.webVitalsHistogram = this.meter.createHistogram('web.vitals', {
      description: 'Core Web Vitals measurements',
      unit: 'ms',
    })
  }

  // Trace AI operations
  async traceAIOperation<T>(
    operationName: string,
    operationType: 'inference' | 'embedding' | 'search' | 'analysis',
    fn: () => Promise<T>,
    metrics?: Partial<AIMetrics>
  ): Promise<T> {
    const span = this.tracer.startSpan(`ai.${operationType}.${operationName}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'ai.operation.name': operationName,
        'ai.operation.type': operationType,
        'ai.model.provider': metrics?.modelProvider || 'openai',
      },
    })

    const startTime = Date.now()

    try {
      const result = await context.with(trace.setSpan(context.active(), span), fn)

      const duration = Date.now() - startTime

      // Record metrics
      this.aiRequestCounter?.add(1, {
        operation: operationName,
        type: operationType,
        status: 'success',
      })

      this.aiLatencyHistogram?.record(duration, {
        operation: operationName,
        type: operationType,
      })

      if (metrics?.tokenUsage) {
        this.tokenUsageCounter?.add(metrics.tokenUsage, {
          model: metrics.modelProvider,
          operation: operationName,
        })
      }

      // Set span attributes
      span.setAttributes({
        'ai.request.duration': duration,
        'ai.tokens.used': metrics?.tokenUsage || 0,
        'ai.prompt.length': metrics?.promptLength || 0,
        'ai.response.length': metrics?.responseLength || 0,
      })

      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      this.aiRequestCounter?.add(1, {
        operation: operationName,
        type: operationType,
        status: 'error',
      })

      this.errorCounter?.add(1, {
        type: 'ai_operation',
        operation: operationName,
        error_type: error instanceof Error ? error.constructor.name : 'unknown',
      })

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    } finally {
      span.end()
    }
  }

  // Record vector search metrics
  recordVectorSearch(indexName: string, latency: number, resultCount: number) {
    this.vectorSearchHistogram?.record(latency, {
      index: indexName,
      result_count_bucket: this.getResultCountBucket(resultCount),
    })

    const span = trace.getActiveSpan()
    if (span) {
      span.setAttributes({
        'vector.search.index': indexName,
        'vector.search.latency': latency,
        'vector.search.results': resultCount,
      })
    }
  }

  // Record security events
  recordSecurityEvent(event: SecurityEvent) {
    this.securityEventCounter?.add(1, {
      type: event.type,
      severity: event.severity,
    })

    // Create a span for security event
    const span = this.tracer.startSpan('security.event', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'security.event.type': event.type,
        'security.event.severity': event.severity,
        'security.event.source_ip': event.sourceIp || 'unknown',
        'security.event.user_id': event.userId || 'anonymous',
      },
    })

    // Log detailed event information
    span.addEvent('security_incident_detected', {
      ...event.details,
      timestamp: Date.now(),
    })

    span.end()

    // Trigger alerts for critical events
    if (event.severity === 'critical') {
      this.triggerSecurityAlert(event)
    }
  }

  // Record Core Web Vitals
  recordWebVital(metric: 'lcp' | 'inp' | 'cls', value: number, page: string) {
    this.webVitalsHistogram?.record(value, {
      metric,
      page,
      device: this.getDeviceType(),
    })
  }

  // Record custom business metrics
  recordBusinessMetric(
    metricName: string,
    value: number,
    attributes: Record<string, string | number | boolean> = {}
  ) {
    if (!this.meter) {
      diag.warn('Meter not initialized, skipping business metric recording')
      return
    }

    const customMetric = this.meter.createHistogram(`business.${metricName}`, {
      description: `Business metric: ${metricName}`,
    })

    customMetric.record(value, attributes)
  }

  // Helper methods
  private getResultCountBucket(count: number): string {
    if (count === 0) return '0'
    if (count <= 10) return '1-10'
    if (count <= 50) return '11-50'
    if (count <= 100) return '51-100'
    return '100+'
  }

  private getDeviceType(): string {
    // Simplified device detection - in production use a proper user agent parser
    const userAgent = globalThis.navigator?.userAgent || ''
    if (/mobile/i.test(userAgent)) return 'mobile'
    if (/tablet/i.test(userAgent)) return 'tablet'
    return 'desktop'
  }

  private async triggerSecurityAlert(event: SecurityEvent) {
    // Integration with alerting system
    const webhookUrl = process.env.ALERT_WEBHOOK_URL
    if (!webhookUrl) {
      diag.warn('ALERT_WEBHOOK_URL not configured, skipping security alert')
      return
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_type: 'security',
          severity: event.severity,
          event,
          timestamp: new Date().toISOString(),
          environment: process.env.VERCEL_ENV,
        }),
      })
    } catch (error) {
      // Log webhook failure but don't throw to avoid breaking application
      diag.warn('Failed to send security alert webhook:', error)
    }
  }

  // Shutdown
  async shutdown() {
    if (this.sdk) {
      await this.sdk.shutdown()
    }
  }
}

// Export singleton instance
export const telemetry = TelemetryService.getInstance()

// Export types
export type { AIMetrics, SecurityEvent }
