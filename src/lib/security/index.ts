/**
 * Security Module Index
 * Central export point for all security components
 */

export type {
  ApiKeyConfig,
  ApiKeyMetadata,
  KeyValidationResult,
} from './api-key-rotation'
// API key rotation
export {
  ApiKeyManager,
  apiKeyAuthMiddleware,
  apiKeyManager,
} from './api-key-rotation'
export type {
  AuditEvent,
  AuditLoggerConfig,
} from './audit-logger'
// Audit logging
export {
  AuditEventType,
  AuditSeverity,
  auditLogger,
  SecurityAuditLogger,
} from './audit-logger'
// Existing security components
export * from './auth-rate-limiting'
export type { CorsConfig } from './cors-config'
// CORS configuration
export {
  CorsManager,
  CorsPresets,
  checkSuspiciousCorsPatterns,
  corsConfig,
  createRouteCorsMiddleware,
  DynamicCorsConfig,
  logCorsViolation,
} from './cors-config'
export * from './enhanced-middleware'
export type { ErrorBoundaryConfig } from './error-boundaries'
// Error boundaries
export {
  CircuitBreaker,
  createSecureErrorResponse,
  SecurityError,
  SecurityErrorType,
  withApiSecurityBoundary,
  withRetryBoundary,
  withSecurityBoundary,
} from './error-boundaries'

// Input validation
export {
  ApiSchemas,
  CommonSchemas,
  createValidationMiddleware,
  GitHubSchemas,
  InputValidator,
  Sanitizers,
  ValidationPatterns,
  validator,
} from './input-validation'
// IP allowlist
export type {
  IPAllowlistConfig,
  IPEntry as IPAllowlistEntry,
} from './ip-allowlist'
export {
  createIPAllowlistMiddleware,
  IPAllowlistManager,
} from './ip-allowlist'
export type {
  AlertAction,
  AlertConfig,
  SecurityAlert,
  SecurityMetrics,
} from './monitoring-dashboard'
// Security monitoring
export {
  SecurityMonitoringDashboard,
  securityDashboard,
  securityMonitoringApi,
} from './monitoring-dashboard'
// Rate limiting
export type {
  IRateLimiter,
  RateLimitConfig,
  RateLimitResult,
} from './rate-limiting/rate-limiter'
export {
  RateLimitAlgorithm,
  RedisRateLimiter,
} from './rate-limiting/rate-limiter'
// Request signing
export type {
  RequestSigningConfig,
  SignedRequest,
} from './request-signing'
export {
  createSigningMiddleware,
  RequestSigner,
} from './request-signing'
export type { SecurityHeadersConfig } from './security-headers'
// Security headers
export {
  developmentSecurityHeaders,
  productionSecurityHeaders,
  SecurityHeadersManager,
  securityHeaders,
  securityHeadersMiddleware,
} from './security-headers'
export * from './webhook-security'
