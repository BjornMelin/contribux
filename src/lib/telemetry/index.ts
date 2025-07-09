/**
 * Telemetry Module Exports
 *
 * Central export point for all telemetry functionality
 */

// Core telemetry utilities
export {
  createSpan,
  createGitHubSpan,
  createDatabaseSpan,
  createVectorSearchSpan,
  getCurrentTraceId,
  getCurrentSpanId,
  getTraceContext,
  recordGitHubRateLimit,
  recordCacheOperation,
  recordCacheHitRatio,
  githubApiCallsCounter,
  githubApiDurationHistogram,
  githubRateLimitGauge,
  databaseOperationsCounter,
  databaseOperationDurationHistogram,
  vectorSearchCounter,
  vectorSearchDurationHistogram,
  cacheOperationsCounter,
  cacheHitRatioGauge,
} from './utils'

// Enhanced logger with tracing
export {
  telemetryLogger,
  telemetrySecurityLogger,
  type TelemetryLogContext,
} from './logger'

// Health check system
export {
  checkSystemHealth,
  checkGitHubHealth,
  checkDatabaseHealth,
  checkCacheHealth,
  type HealthCheckResult,
  type SystemHealthResult,
} from './health'

// Instrumented GitHub client
export {
  InstrumentedGitHubClient,
  createInstrumentedGitHubClient,
} from '../github/instrumented-client'

// Re-export instrumentation for app initialization
export { default as sdk } from './instrumentation'
