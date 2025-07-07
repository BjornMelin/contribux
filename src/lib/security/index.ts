/**
 * Security Module Index
 * Central export point for all security components
 */

// Rate limiting
export {
  IRateLimiter,
  RateLimitConfig,
  RateLimitResult,
  RateLimitAlgorithm,
  InMemoryRateLimiter,
  RedisRateLimiter,
  rateLimiterFactory,
  createRateLimitMiddleware,
} from './rate-limiting/rate-limiter'

// Request signing
export {
  RequestSigningConfig,
  SignedRequest,
  RequestSigner,
  requestSigner,
  createSigningMiddleware,
  validateSignedRequest,
} from './request-signing'

// IP allowlist
export {
  IPAllowlistConfig,
  IPAllowlistEntry,
  IPAllowlistManager,
  ipAllowlist,
  createIpAllowlistMiddleware,
} from './ip-allowlist'

// Audit logging
export {
  AuditEventType,
  AuditSeverity,
  AuditEventSchema,
  AuditEvent,
  AuditLoggerConfig,
  SecurityAuditLogger,
  auditLogger,
} from './audit-logger'

// Error boundaries
export {
  SecurityErrorType,
  SecurityError,
  ErrorBoundaryConfig,
  withSecurityBoundary,
  createSecureErrorResponse,
  withApiSecurityBoundary,
  withRetryBoundary,
  CircuitBreaker,
} from './error-boundaries'

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
  SecurityHeadersConfig,
  SecurityHeadersManager,
  securityHeaders,
  securityHeadersMiddleware,
  productionSecurityHeaders,
  developmentSecurityHeaders,
} from './security-headers'

// CORS configuration
export {
  CorsConfigSchema,
  CorsConfig,
  CorsPresets,
  CorsManager,
  DynamicCorsConfig,
  CorsSecurityMonitor,
  corsConfig,
  createRouteCorsMiddleware,
} from './cors-config'

// API key rotation
export {
  ApiKeyConfig,
  ApiKeyMetadata,
  KeyValidationResult,
  ApiKeyRotationSchema,
  ApiKeyManager,
  apiKeyManager,
  apiKeyAuthMiddleware,
} from './api-key-rotation'

// Security monitoring
export {
  SecurityMetrics,
  AlertConfig,
  AlertAction,
  SecurityAlert,
  SecurityMonitoringDashboard,
  securityDashboard,
  securityMonitoringApi,
} from './monitoring-dashboard'

// Existing security components
export * from './auth-rate-limiting'
export * from './enhanced-middleware'
export * from './webhook-security'