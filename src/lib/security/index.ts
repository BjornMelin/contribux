/**
 * Security Module Index
 * Central export point for all security components
 */

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
  RequestSigner,
  createSigningMiddleware,
} from './request-signing'

// IP allowlist
export type {
  IPAllowlistConfig,
  IPEntry as IPAllowlistEntry,
} from './ip-allowlist'
export {
  IPAllowlistManager,
  createIPAllowlistMiddleware,
} from './ip-allowlist'

// Audit logging
export {
  AuditEventType,
  AuditSeverity,
  SecurityAuditLogger,
  auditLogger,
} from './audit-logger'
export type {
  AuditEvent,
  AuditLoggerConfig,
} from './audit-logger'

// Error boundaries
export {
  SecurityErrorType,
  SecurityError,
  withSecurityBoundary,
  createSecureErrorResponse,
  withApiSecurityBoundary,
  withRetryBoundary,
  CircuitBreaker,
} from './error-boundaries'
export type { ErrorBoundaryConfig } from './error-boundaries'

// Input validation
export {
  ValidationPatterns,
  Sanitizers,
  CommonSchemas,
  GitHubSchemas,
  ApiSchemas,
  InputValidator,
  validator,
  createValidationMiddleware,
} from './input-validation'

// Security headers
export {
  SecurityHeadersManager,
  securityHeaders,
  securityHeadersMiddleware,
  productionSecurityHeaders,
  developmentSecurityHeaders,
} from './security-headers'
export type { SecurityHeadersConfig } from './security-headers'

// CORS configuration
export {
  CorsPresets,
  CorsManager,
  DynamicCorsConfig,
  corsConfig,
  createRouteCorsMiddleware,
  logCorsViolation,
  checkSuspiciousCorsPatterns,
} from './cors-config'
export type { CorsConfig } from './cors-config'

// API key rotation
export {
  ApiKeyManager,
  apiKeyManager,
  apiKeyAuthMiddleware,
} from './api-key-rotation'
export type {
  ApiKeyConfig,
  ApiKeyMetadata,
  KeyValidationResult,
} from './api-key-rotation'

// Security monitoring
export {
  SecurityMonitoringDashboard,
  securityDashboard,
  securityMonitoringApi,
} from './monitoring-dashboard'
export type {
  SecurityMetrics,
  AlertConfig,
  AlertAction,
  SecurityAlert,
} from './monitoring-dashboard'

// Existing security components
export * from './auth-rate-limiting'
export * from './enhanced-middleware'
export * from './webhook-security'
