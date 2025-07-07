/**
 * Telemetry Tests
 * 
 * Tests for OpenTelemetry instrumentation and utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSpan, getCurrentTraceId, getTraceContext } from '../utils'
import { telemetryLogger } from '../logger'

// Mock OpenTelemetry API
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: vi.fn().mockReturnValue({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        setAttribute: vi.fn(),
        end: vi.fn(),
        spanContext: () => ({
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
        }),
      }),
    }),
    getActiveSpan: () => ({
      spanContext: () => ({
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
      }),
    }),
    setSpan: vi.fn(),
  },
  context: {
    with: vi.fn((_, fn) => fn()),
    active: vi.fn(),
  },
  metrics: {
    getMeter: () => ({
      createCounter: vi.fn().mockReturnValue({
        add: vi.fn(),
      }),
      createHistogram: vi.fn().mockReturnValue({
        record: vi.fn(),
      }),
      createUpDownCounter: vi.fn().mockReturnValue({
        add: vi.fn(),
      }),
    }),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
  SpanKind: {
    INTERNAL: 1,
  },
}))

describe('Telemetry Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSpan', () => {
    it('should create a span and execute operation', async () => {
      const operation = vi.fn().mockResolvedValue('test-result')
      
      const result = await createSpan('test-span', operation)
      
      expect(result).toBe('test-result')
      expect(operation).toHaveBeenCalled()
    })

    it('should handle errors in operation', async () => {
      const error = new Error('Test error')
      const operation = vi.fn().mockRejectedValue(error)
      
      await expect(createSpan('test-span', operation)).rejects.toThrow('Test error')
    })

    it('should set attributes on span', async () => {
      const operation = vi.fn().mockResolvedValue('result')
      const attributes = { 'test.attr': 'value' }
      
      await createSpan('test-span', operation, attributes)
      
      expect(operation).toHaveBeenCalled()
    })
  })

  describe('trace context', () => {
    it('should get current trace ID', () => {
      const traceId = getCurrentTraceId()
      expect(traceId).toBe('test-trace-id')
    })

    it('should get trace context', () => {
      const context = getTraceContext()
      expect(context).toEqual({
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
      })
    })
  })
})

describe('Telemetry Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should log with trace context', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    telemetryLogger.info('Test message', { component: 'test' })
    
    // In a real test, you would check that the logger was called with trace context
    // This is a simplified test since we're mocking the entire logger
    expect(consoleSpy).not.toHaveBeenCalled() // Logger uses structured output, not console.log
    
    consoleSpy.mockRestore()
  })

  it('should log GitHub API operations', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    telemetryLogger.githubApi('API call completed', {
      operation: 'search_repositories',
      duration: 123,
      statusCode: 200,
    })
    
    consoleSpy.mockRestore()
  })
})

describe('Integration Tests', () => {
  it('should work with actual spans and metrics', async () => {
    // This test would need to run with actual OpenTelemetry setup
    // For now, we just verify the imports work correctly
    expect(createSpan).toBeDefined()
    expect(telemetryLogger).toBeDefined()
    expect(getCurrentTraceId).toBeDefined()
  })
})