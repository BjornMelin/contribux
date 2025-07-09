/**
 * Telemetry Module Exports
 *
 * Central export point for all telemetry functionality
 */

// Instrumented GitHub client
export {
  createInstrumentedGitHubClient,
  InstrumentedGitHubClient,
} from '../github/instrumented-client'
// Health check system
export {
  checkCacheHealth,
  checkDatabaseHealth,
  checkGitHubHealth,
  checkSystemHealth,
  type HealthCheckResult,
  type SystemHealthResult,
} from './health'
// Re-export instrumentation for app initialization
export { default as sdk } from './instrumentation'
// Enhanced logger with tracing
export {
  type TelemetryLogContext,
  telemetryLogger,
  telemetrySecurityLogger,
} from './logger'
// Core telemetry utilities
export {
  cacheHitRatioGauge,
  cacheOperationsCounter,
  createDatabaseSpan,
  createGitHubSpan,
  createSpan,
  createVectorSearchSpan,
  databaseOperationDurationHistogram,
  databaseOperationsCounter,
  getCurrentSpanId,
  getCurrentTraceId,
  getTraceContext,
  githubApiCallsCounter,
  githubApiDurationHistogram,
  githubRateLimitGauge,
  recordCacheHitRatio,
  recordCacheOperation,
  recordGitHubRateLimit,
  vectorSearchCounter,
  vectorSearchDurationHistogram,
} from './utils'
