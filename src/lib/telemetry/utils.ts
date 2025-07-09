/**
 * Telemetry Utilities
 *
 * Provides helper functions for creating custom spans, metrics, and trace correlation
 */

import { hrtime } from 'node:process'
import { SpanKind, SpanStatusCode, context, metrics, trace } from '@opentelemetry/api'

// Create tracer instance
const tracer = trace.getTracer('contribux', '1.0.0')

// Create meter instance for custom metrics
const meter = metrics.getMeter('contribux', '1.0.0')

// Custom metrics
export const githubApiCallsCounter = meter.createCounter('github_api_calls_total', {
  description: 'Total number of GitHub API calls',
})

export const githubApiDurationHistogram = meter.createHistogram('github_api_duration_ms', {
  description: 'Duration of GitHub API calls in milliseconds',
})

export const githubRateLimitGauge = meter.createUpDownCounter('github_rate_limit_remaining', {
  description: 'Remaining GitHub API rate limit',
})

export const databaseOperationsCounter = meter.createCounter('database_operations_total', {
  description: 'Total number of database operations',
})

export const databaseOperationDurationHistogram = meter.createHistogram(
  'database_operation_duration_ms',
  {
    description: 'Duration of database operations in milliseconds',
  }
)

export const vectorSearchCounter = meter.createCounter('vector_search_operations_total', {
  description: 'Total number of vector search operations',
})

export const vectorSearchDurationHistogram = meter.createHistogram('vector_search_duration_ms', {
  description: 'Duration of vector search operations in milliseconds',
})

export const cacheOperationsCounter = meter.createCounter('cache_operations_total', {
  description: 'Total number of cache operations',
})

export const cacheHitRatioGauge = meter.createUpDownCounter('cache_hit_ratio', {
  description: 'Cache hit ratio',
})

/**
 * Create a custom span with automatic error handling and metrics
 */
export async function createSpan<T>(
  name: string,
  operation: (span: ReturnType<typeof tracer.startSpan>) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  })

  const startTime = hrtime.bigint()

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    } finally {
      const endTime = hrtime.bigint()
      const duration = Number(endTime - startTime) / 1_000_000 // Convert to milliseconds
      span.setAttribute('duration_ms', duration)
      span.end()
    }
  })
}

/**
 * Create a span for GitHub API operations with specific metrics
 */
export async function createGitHubSpan<T>(
  operation: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const startTime = hrtime.bigint()

  return createSpan(
    `github.${operation}`,
    async span => {
      span.setAttributes({
        'github.operation': operation,
        'service.component': 'github-api',
        ...attributes,
      })

      try {
        const result = await fn(span)

        // Record successful API call
        githubApiCallsCounter.add(1, {
          operation,
          status: 'success',
        })

        return result
      } catch (error) {
        // Record failed API call
        githubApiCallsCounter.add(1, {
          operation,
          status: 'error',
          error_type: error instanceof Error ? error.name : 'unknown',
        })
        throw error
      } finally {
        const endTime = hrtime.bigint()
        const duration = Number(endTime - startTime) / 1_000_000
        githubApiDurationHistogram.record(duration, { operation })
      }
    },
    attributes
  )
}

/**
 * Create a span for database operations with specific metrics
 */
export async function createDatabaseSpan<T>(
  operation: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const startTime = hrtime.bigint()

  return createSpan(
    `database.${operation}`,
    async span => {
      span.setAttributes({
        'db.operation': operation,
        'service.component': 'database',
        ...attributes,
      })

      try {
        const result = await fn(span)

        databaseOperationsCounter.add(1, {
          operation,
          status: 'success',
        })

        return result
      } catch (error) {
        databaseOperationsCounter.add(1, {
          operation,
          status: 'error',
          error_type: error instanceof Error ? error.name : 'unknown',
        })
        throw error
      } finally {
        const endTime = hrtime.bigint()
        const duration = Number(endTime - startTime) / 1_000_000
        databaseOperationDurationHistogram.record(duration, { operation })
      }
    },
    attributes
  )
}

/**
 * Create a span for vector search operations
 */
export async function createVectorSearchSpan<T>(
  operation: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const startTime = hrtime.bigint()

  return createSpan(
    `vector_search.${operation}`,
    async span => {
      span.setAttributes({
        'vector.operation': operation,
        'service.component': 'vector-search',
        ...attributes,
      })

      try {
        const result = await fn(span)

        vectorSearchCounter.add(1, {
          operation,
          status: 'success',
        })

        return result
      } catch (error) {
        vectorSearchCounter.add(1, {
          operation,
          status: 'error',
          error_type: error instanceof Error ? error.name : 'unknown',
        })
        throw error
      } finally {
        const endTime = hrtime.bigint()
        const duration = Number(endTime - startTime) / 1_000_000
        vectorSearchDurationHistogram.record(duration, { operation })
      }
    },
    attributes
  )
}

/**
 * Get current trace ID for logging correlation
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  return span?.spanContext().traceId
}

/**
 * Get current span ID for logging correlation
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan()
  return span?.spanContext().spanId
}

/**
 * Add trace context to log context
 */
export function getTraceContext() {
  return {
    traceId: getCurrentTraceId(),
    spanId: getCurrentSpanId(),
  }
}

/**
 * Record GitHub rate limit information
 */
export function recordGitHubRateLimit(remaining: number, limit: number, reset: number) {
  githubRateLimitGauge.add(remaining, {
    limit: limit.toString(),
    reset: reset.toString(),
  })
}

/**
 * Record cache operation metrics
 */
export function recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key?: string) {
  cacheOperationsCounter.add(1, {
    operation,
    ...(key && { cache_key_prefix: key.split(':')[0] }),
  })
}

/**
 * Record cache hit ratio
 */
export function recordCacheHitRatio(ratio: number) {
  cacheHitRatioGauge.add(ratio)
}
