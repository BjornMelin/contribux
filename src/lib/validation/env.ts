/**
 * Environment Variables Validation - T3 Stack Best Practices
 *
 * Centralized environment validation using @t3-oss/env-nextjs
 * Follows T3 Stack best practices with proper error handling and type safety
 */

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  /**
   * Server-side environment variables
   * These are only available on the server side
   */
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Database configuration
    DATABASE_URL: z.string().url(),
    DATABASE_URL_DEV: z.string().url().optional(),
    DATABASE_URL_TEST: z.string().url().optional(),

    // NextAuth.js configuration
    NEXTAUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url().optional(),

    // JWT configuration (fallback to NEXTAUTH_SECRET)
    JWT_SECRET: z.string().min(32).optional(),

    // GitHub OAuth configuration
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().optional(),

    // Google OAuth configuration
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Redis configuration
    REDIS_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Security configuration
    ALLOWED_REDIRECT_URIS: z.string().optional(),
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
    
    // CSRF and security
    CSRF_SECRET: z.string().min(32).optional(),
    REQUEST_SIGNING_SECRET: z.string().min(32).optional(),

    // OpenAI API configuration
    OPENAI_API_KEY: z.string().min(1).optional(),

    // Vector database configuration with proper number coercion
    HNSW_EF_SEARCH: z.coerce.number().int().min(1).default(200),
    HNSW_EF_CONSTRUCTION: z.coerce.number().int().min(1).default(400),
    HNSW_M_CONNECTIONS: z.coerce.number().int().min(1).default(16),
    VECTOR_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
    VECTOR_MAX_RESULTS: z.coerce.number().int().min(1).default(100),
    VECTOR_BATCH_SIZE: z.coerce.number().int().min(1).default(1000),
    VECTOR_CACHE_SIZE: z.coerce.number().int().min(1).default(10000),
    VECTOR_CACHE_TTL: z.coerce.number().int().min(1).default(3600),
    HYBRID_SEARCH_TEXT_WEIGHT: z.coerce.number().min(0).max(1).default(0.3),
    HYBRID_SEARCH_VECTOR_WEIGHT: z.coerce.number().min(0).max(1).default(0.7),

    // Database branch configuration
    DB_MAIN_BRANCH: z.string().default('main'),
    DB_DEV_BRANCH: z.string().default('dev'),
    DB_TEST_BRANCH: z.string().default('test'),

    // Database connection pool configuration
    DB_PROJECT_ID: z.string().optional(),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(20),
    DB_POOL_IDLE_TIMEOUT: z.coerce.number().int().min(1000).default(10000),

    // Database connection and query timeouts
    DB_CONNECTION_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
    DB_QUERY_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
    DB_HEALTH_CHECK_INTERVAL: z.coerce.number().int().min(1000).default(30000),
    DB_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
    DB_RETRY_DELAY: z.coerce.number().int().min(100).default(1000),
    
    // Enhanced database connection configuration for Neon pooling
    DB_STATEMENT_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
    DB_IDLE_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
    DB_MAX_LIFETIME: z.coerce.number().int().min(10000).default(3600000),

    // Rate limiting configuration
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).default(900),

    // Cache configuration
    CACHE_MEMORY_SIZE: z.coerce.number().int().min(1).default(100),
    CACHE_DEFAULT_TTL: z.coerce.number().int().min(1).default(300),
    CACHE_EDGE_TTL: z.coerce.number().int().min(1).default(3600),

    // Admin configuration
    ADMIN_USER_IDS: z.string().optional(),

    // WebAuthn configuration
    WEBAUTHN_RP_ID: z.string().optional(),
    WEBAUTHN_ORIGIN: z.string().url().optional(),
    WEBAUTHN_RP_NAME: z.string().default('Contribux'),
    WEBAUTHN_TIMEOUT: z.coerce.number().int().min(1000).default(60000),
    WEBAUTHN_CHALLENGE_EXPIRY: z.coerce.number().int().min(1000).default(300000),
    WEBAUTHN_SUPPORTED_ALGORITHMS: z.string().default('-7,-257'),

    // GitHub webhook configuration
    GITHUB_WEBHOOK_SECRET: z.string().optional(),

    // Notification configuration
    SLACK_WEBHOOK_URL: z.string().url().optional(),
    DISCORD_WEBHOOK_URL: z.string().url().optional(),
    PAGERDUTY_API_KEY: z.string().optional(),
    PAGERDUTY_ROUTING_KEY: z.string().optional(),
    SECURITY_WEBHOOK_URL: z.string().url().optional(),
    SECURITY_EMAIL: z.string().email().optional(),
    OPS_WEBHOOK_URL: z.string().url().optional(),
    ALERT_WEBHOOK_URL: z.string().url().optional(),

    // Telemetry configuration
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().url().optional(),
    OTEL_AUTH_TOKEN: z.string().optional(),
    SERVICE_VERSION: z.string().default('1.0.0'),

    // Feature flags
    ENABLE_WEBAUTHN: z.coerce.boolean().default(false),
    ENABLE_ADVANCED_SECURITY: z.coerce.boolean().default(false),
    ENABLE_SECURITY_DASHBOARD: z.coerce.boolean().default(false),
    ENABLE_DEVICE_FINGERPRINTING: z.coerce.boolean().default(false),
    ENABLE_DETAILED_AUDIT: z.coerce.boolean().default(false),
    ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
    ENABLE_OAUTH: z.coerce.boolean().default(true),
    ENABLE_AUDIT_LOGS: z.coerce.boolean().default(true),
    DEMO_ZERO_TRUST: z.coerce.boolean().default(false),
    DEMO_ENTERPRISE: z.coerce.boolean().default(false),

    // Maintenance mode
    MAINTENANCE_MODE: z.coerce.boolean().default(false),
    MAINTENANCE_BYPASS_TOKEN: z.string().optional(),

    // CORS configuration
    CORS_ORIGINS: z.string().optional(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    ALLOWED_ORIGINS: z.string().optional(),

    // Logging configuration
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

    // Optional integrations
    SENTRY_DSN: z.string().url().optional(),
    NEON_API_KEY: z.string().optional(),
    NEON_PROJECT_ID: z.string().optional(),
    NEON_DATABASE_PASSWORD: z.string().optional(),

    // CI/CD configuration
    CI: z.coerce.boolean().default(false),
    USE_LOCAL_PG: z.coerce.boolean().default(false),
    TEST_DB_STRATEGY: z.enum(['neon', 'local']).default('neon'),

    // Vercel environment
    VERCEL: z.coerce.boolean().default(false),
    VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
    VERCEL_URL: z.string().optional(),
  },

  /**
   * Client-side environment variables
   * These are exposed to the browser and must be prefixed with NEXT_PUBLIC_
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
    NEXT_PUBLIC_APP_NAME: z.string().default('Contribux'),
    NEXT_PUBLIC_RP_ID: z.string().default('localhost'),
    NEXT_PUBLIC_WS_ENDPOINT: z.string().url().optional(),
  },

  /**
   * Use experimental runtime environment for cleaner mapping
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_DEV: process.env.DATABASE_URL_DEV,
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    ALLOWED_REDIRECT_URIS: process.env.ALLOWED_REDIRECT_URIS,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CSRF_SECRET: process.env.CSRF_SECRET,
    REQUEST_SIGNING_SECRET: process.env.REQUEST_SIGNING_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    HNSW_EF_SEARCH: process.env.HNSW_EF_SEARCH,
    HNSW_EF_CONSTRUCTION: process.env.HNSW_EF_CONSTRUCTION,
    HNSW_M_CONNECTIONS: process.env.HNSW_M_CONNECTIONS,
    VECTOR_SIMILARITY_THRESHOLD: process.env.VECTOR_SIMILARITY_THRESHOLD,
    VECTOR_MAX_RESULTS: process.env.VECTOR_MAX_RESULTS,
    VECTOR_BATCH_SIZE: process.env.VECTOR_BATCH_SIZE,
    VECTOR_CACHE_SIZE: process.env.VECTOR_CACHE_SIZE,
    VECTOR_CACHE_TTL: process.env.VECTOR_CACHE_TTL,
    HYBRID_SEARCH_TEXT_WEIGHT: process.env.HYBRID_SEARCH_TEXT_WEIGHT,
    HYBRID_SEARCH_VECTOR_WEIGHT: process.env.HYBRID_SEARCH_VECTOR_WEIGHT,
    DB_MAIN_BRANCH: process.env.DB_MAIN_BRANCH,
    DB_DEV_BRANCH: process.env.DB_DEV_BRANCH,
    DB_TEST_BRANCH: process.env.DB_TEST_BRANCH,
    DB_PROJECT_ID: process.env.DB_PROJECT_ID,
    DB_POOL_MIN: process.env.DB_POOL_MIN,
    DB_POOL_MAX: process.env.DB_POOL_MAX,
    DB_POOL_IDLE_TIMEOUT: process.env.DB_POOL_IDLE_TIMEOUT,
    DB_CONNECTION_TIMEOUT: process.env.DB_CONNECTION_TIMEOUT,
    DB_QUERY_TIMEOUT: process.env.DB_QUERY_TIMEOUT,
    DB_HEALTH_CHECK_INTERVAL: process.env.DB_HEALTH_CHECK_INTERVAL,
    DB_MAX_RETRIES: process.env.DB_MAX_RETRIES,
    DB_RETRY_DELAY: process.env.DB_RETRY_DELAY,
    DB_STATEMENT_TIMEOUT: process.env.DB_STATEMENT_TIMEOUT,
    DB_IDLE_TIMEOUT: process.env.DB_IDLE_TIMEOUT,
    DB_MAX_LIFETIME: process.env.DB_MAX_LIFETIME,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW,
    CACHE_MEMORY_SIZE: process.env.CACHE_MEMORY_SIZE,
    CACHE_DEFAULT_TTL: process.env.CACHE_DEFAULT_TTL,
    CACHE_EDGE_TTL: process.env.CACHE_EDGE_TTL,
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
    WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID,
    WEBAUTHN_ORIGIN: process.env.WEBAUTHN_ORIGIN,
    WEBAUTHN_RP_NAME: process.env.WEBAUTHN_RP_NAME,
    WEBAUTHN_TIMEOUT: process.env.WEBAUTHN_TIMEOUT,
    WEBAUTHN_CHALLENGE_EXPIRY: process.env.WEBAUTHN_CHALLENGE_EXPIRY,
    WEBAUTHN_SUPPORTED_ALGORITHMS: process.env.WEBAUTHN_SUPPORTED_ALGORITHMS,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    PAGERDUTY_API_KEY: process.env.PAGERDUTY_API_KEY,
    PAGERDUTY_ROUTING_KEY: process.env.PAGERDUTY_ROUTING_KEY,
    SECURITY_WEBHOOK_URL: process.env.SECURITY_WEBHOOK_URL,
    SECURITY_EMAIL: process.env.SECURITY_EMAIL,
    OPS_WEBHOOK_URL: process.env.OPS_WEBHOOK_URL,
    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    OTEL_AUTH_TOKEN: process.env.OTEL_AUTH_TOKEN,
    SERVICE_VERSION: process.env.SERVICE_VERSION,
    ENABLE_WEBAUTHN: process.env.ENABLE_WEBAUTHN,
    ENABLE_ADVANCED_SECURITY: process.env.ENABLE_ADVANCED_SECURITY,
    ENABLE_SECURITY_DASHBOARD: process.env.ENABLE_SECURITY_DASHBOARD,
    ENABLE_DEVICE_FINGERPRINTING: process.env.ENABLE_DEVICE_FINGERPRINTING,
    ENABLE_DETAILED_AUDIT: process.env.ENABLE_DETAILED_AUDIT,
    ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING,
    ENABLE_OAUTH: process.env.ENABLE_OAUTH,
    ENABLE_AUDIT_LOGS: process.env.ENABLE_AUDIT_LOGS,
    DEMO_ZERO_TRUST: process.env.DEMO_ZERO_TRUST,
    DEMO_ENTERPRISE: process.env.DEMO_ENTERPRISE,
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
    MAINTENANCE_BYPASS_TOKEN: process.env.MAINTENANCE_BYPASS_TOKEN,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEON_API_KEY: process.env.NEON_API_KEY,
    NEON_PROJECT_ID: process.env.NEON_PROJECT_ID,
    NEON_DATABASE_PASSWORD: process.env.NEON_DATABASE_PASSWORD,
    CI: process.env.CI,
    USE_LOCAL_PG: process.env.USE_LOCAL_PG,
    TEST_DB_STRATEGY: process.env.TEST_DB_STRATEGY,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_RP_ID: process.env.NEXT_PUBLIC_RP_ID,
    NEXT_PUBLIC_WS_ENDPOINT: process.env.NEXT_PUBLIC_WS_ENDPOINT,
  },

  /**
   * Treat empty strings as undefined for better validation
   */
  emptyStringAsUndefined: true,

  /**
   * Skip validation during build time for certain environments
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Custom validation error handler
   */
  onValidationError: (error) => {
    console.error('❌ Invalid environment variables:', error)
    throw new Error('Invalid environment variables')
  },

  /**
   * Custom handler for server-side access on client
   */
  onInvalidAccess: (variable) => {
    throw new Error(
      `❌ Attempted to access server-side environment variable "${variable}" on the client`
    )
  },
})

// Type-safe environment access
export type Env = typeof env

// Helper function for environment-specific database URLs
export function getDatabaseUrl(): string {
  if (env.NODE_ENV === 'test' && env.DATABASE_URL_TEST) {
    return env.DATABASE_URL_TEST
  }
  if (env.NODE_ENV === 'development' && env.DATABASE_URL_DEV) {
    return env.DATABASE_URL_DEV
  }
  return env.DATABASE_URL
}

// Helper function for app URL with proper fallback chain
export function getAppUrl(): string {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL
  }
  if (env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${env.NEXT_PUBLIC_VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

// Helper function for JWT secret with fallback
export function getJwtSecret(): string {
  return env.JWT_SECRET || env.NEXTAUTH_SECRET
}

// Helper function for encryption key
export function getEncryptionKey(): string {
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY is required. Generate one with: openssl rand -hex 32'
    )
  }
  return env.ENCRYPTION_KEY
}

// Environment utility functions
export const isDevelopment = () => env.NODE_ENV === 'development'
export const isProduction = () => env.NODE_ENV === 'production'
export const isTest = () => env.NODE_ENV === 'test'

// Configuration getters with proper validation
export const getRedisUrl = () => env.REDIS_URL || env.UPSTASH_REDIS_REST_URL
export const getGitHubConfig = () => ({
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
  token: env.GITHUB_TOKEN,
})
export const getGoogleConfig = () => ({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
})

// Database configuration getter
export const getDatabaseConfig = () => ({
  url: getDatabaseUrl(),
  projectId: env.DB_PROJECT_ID,
  poolMin: env.DB_POOL_MIN,
  poolMax: env.DB_POOL_MAX,
  poolIdleTimeout: env.DB_POOL_IDLE_TIMEOUT,
  connectionTimeout: env.DB_CONNECTION_TIMEOUT,
  queryTimeout: env.DB_QUERY_TIMEOUT,
  healthCheckInterval: env.DB_HEALTH_CHECK_INTERVAL,
  maxRetries: env.DB_MAX_RETRIES,
  retryDelay: env.DB_RETRY_DELAY,
  statementTimeout: env.DB_STATEMENT_TIMEOUT,
  idleTimeout: env.DB_IDLE_TIMEOUT,
  maxLifetime: env.DB_MAX_LIFETIME,
  branches: {
    main: env.DB_MAIN_BRANCH,
    dev: env.DB_DEV_BRANCH,
    test: env.DB_TEST_BRANCH,
  },
})

// Vector search configuration getter
export const getVectorConfig = () => ({
  hnswEfSearch: env.HNSW_EF_SEARCH,
  hnswEfConstruction: env.HNSW_EF_CONSTRUCTION,
  hnswMConnections: env.HNSW_M_CONNECTIONS,
  similarityThreshold: env.VECTOR_SIMILARITY_THRESHOLD,
  maxResults: env.VECTOR_MAX_RESULTS,
  batchSize: env.VECTOR_BATCH_SIZE,
  cacheSize: env.VECTOR_CACHE_SIZE,
  cacheTtl: env.VECTOR_CACHE_TTL,
  hybridSearch: {
    textWeight: env.HYBRID_SEARCH_TEXT_WEIGHT,
    vectorWeight: env.HYBRID_SEARCH_VECTOR_WEIGHT,
  },
})

// Feature flags configuration
export const getFeatureFlags = () => ({
  webauthn: env.ENABLE_WEBAUTHN,
  advancedSecurity: env.ENABLE_ADVANCED_SECURITY,
  securityDashboard: env.ENABLE_SECURITY_DASHBOARD,
  deviceFingerprinting: env.ENABLE_DEVICE_FINGERPRINTING,
  detailedAudit: env.ENABLE_DETAILED_AUDIT,
  rateLimiting: env.ENABLE_RATE_LIMITING,
  oauth: env.ENABLE_OAUTH,
  auditLogs: env.ENABLE_AUDIT_LOGS,
  maintenanceMode: env.MAINTENANCE_MODE,
  demoZeroTrust: env.DEMO_ZERO_TRUST,
  demoEnterprise: env.DEMO_ENTERPRISE,
})

// WebAuthn configuration
export const getWebAuthnConfig = () => ({
  rpId: env.WEBAUTHN_RP_ID || env.NEXT_PUBLIC_RP_ID,
  origin: env.WEBAUTHN_ORIGIN || getAppUrl(),
  rpName: env.WEBAUTHN_RP_NAME,
  timeout: env.WEBAUTHN_TIMEOUT,
  challengeExpiry: env.WEBAUTHN_CHALLENGE_EXPIRY,
  supportedAlgorithms: env.WEBAUTHN_SUPPORTED_ALGORITHMS.split(',').map(Number),
})

// Notification configuration
export const getNotificationConfig = () => ({
  slack: env.SLACK_WEBHOOK_URL,
  discord: env.DISCORD_WEBHOOK_URL,
  pagerDuty: {
    apiKey: env.PAGERDUTY_API_KEY,
    routingKey: env.PAGERDUTY_ROUTING_KEY,
  },
  security: {
    webhook: env.SECURITY_WEBHOOK_URL,
    email: env.SECURITY_EMAIL,
  },
  ops: env.OPS_WEBHOOK_URL,
  alert: env.ALERT_WEBHOOK_URL,
})

// Telemetry configuration
export const getTelemetryConfig = () => ({
  traces: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  metrics: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  authToken: env.OTEL_AUTH_TOKEN,
  serviceVersion: env.SERVICE_VERSION,
  environment: env.VERCEL_ENV || env.NODE_ENV,
})

// Cache configuration
export const getCacheConfig = () => ({
  redis: {
    url: getRedisUrl(),
    enabled: !!getRedisUrl(),
  },
  memory: {
    size: env.CACHE_MEMORY_SIZE,
    ttl: env.CACHE_DEFAULT_TTL,
  },
  edge: {
    ttl: env.CACHE_EDGE_TTL,
  },
})

// Rate limiting configuration
export const getRateLimitConfig = () => ({
  max: env.RATE_LIMIT_MAX,
  window: env.RATE_LIMIT_WINDOW,
  enabled: env.ENABLE_RATE_LIMITING,
})

// CORS configuration
export const getCorsConfig = () => ({
  origins: env.CORS_ORIGINS?.split(',') || env.CORS_ALLOWED_ORIGINS?.split(',') || env.ALLOWED_ORIGINS?.split(',') || [],
})

// GitHub configuration
export const getGitHubWebhookConfig = () => ({
  secret: env.GITHUB_WEBHOOK_SECRET,
})

// Admin configuration
export const getAdminConfig = () => ({
  userIds: env.ADMIN_USER_IDS?.split(',') || [],
})

// Maintenance mode configuration
export const getMaintenanceConfig = () => ({
  enabled: env.MAINTENANCE_MODE,
  bypassToken: env.MAINTENANCE_BYPASS_TOKEN,
})

// Logging configuration
export const getLogConfig = () => ({
  level: env.LOG_LEVEL,
})

// CI/CD configuration
export const getCiConfig = () => ({
  isCI: env.CI,
  useLocalPg: env.USE_LOCAL_PG,
  testDbStrategy: env.TEST_DB_STRATEGY,
})

// Vercel configuration
export const getVercelConfig = () => ({
  isVercel: env.VERCEL,
  environment: env.VERCEL_ENV,
  url: env.VERCEL_URL,
})

/**
 * Production security validation
 * Validates critical security settings for production deployments
 */
export function validateProductionSecurity(): void {
  if (!isProduction()) return

  const requiredProdVars = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'ENCRYPTION_KEY',
  ]

  const missing = requiredProdVars.filter(varName => !process.env[varName])
  if (missing.length > 0) {
    throw new Error(`🚨 Missing required production environment variables: ${missing.join(', ')}`)
  }

  // Validate OAuth is configured if enabled
  if (env.ENABLE_OAUTH && (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)) {
    throw new Error('🚨 OAuth is enabled but GitHub credentials are missing')
  }

  // Validate no localhost URLs in production
  const urls = [
    { name: 'DATABASE_URL', value: env.DATABASE_URL },
    { name: 'NEXTAUTH_URL', value: env.NEXTAUTH_URL },
    { name: 'NEXT_PUBLIC_APP_URL', value: env.NEXT_PUBLIC_APP_URL },
  ]

  for (const url of urls) {
    if (url.value && /localhost|127\.0\.0\.1/i.test(url.value)) {
      throw new Error(`🚨 ${url.name} contains localhost in production`)
    }
  }
}

/**
 * Startup validation
 * Validates environment configuration on application startup
 */
export function validateEnvironmentOnStartup(): void {
  try {
    // Validate production security if applicable
    validateProductionSecurity()
    
    // Log environment info (non-sensitive)
    console.info('✅ Environment validation successful')
    console.info(`📝 NODE_ENV: ${env.NODE_ENV}`)
    console.info(`🔗 Database: ${getDatabaseUrl().includes('localhost') ? 'Local' : 'Remote'}`)
    console.info(`🔐 OAuth: ${env.ENABLE_OAUTH ? 'Enabled' : 'Disabled'}`)
    console.info(`🧪 Environment: ${env.VERCEL_ENV || env.NODE_ENV}`)
    
  } catch (error) {
    console.error('❌ Environment validation failed:', error)
    throw error
  }
}

/**
 * Legacy compatibility functions for existing code
 * These maintain backward compatibility while using the new centralized validation
 */
export function validateBasicEnvironmentVariables(): void {
  // Basic validation is now handled by T3 Env schema
  // This function is kept for backward compatibility
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }
  if (!env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is required')
  }
}

export function validateSecurityConfiguration(): void {
  // Security validation is now handled by T3 Env schema and validateProductionSecurity
  // This function is kept for backward compatibility
  validateProductionSecurity()
}

export function validateProductionSecuritySettings(): void {
  // Production security validation is now handled by validateProductionSecurity
  // This function is kept for backward compatibility
  validateProductionSecurity()
}

export function getRequiredEnv(key: string): string {
  // Use the centralized env object when possible
  const value = process.env[key]
  if (!value || value.trim() === '') {
    throw new Error(`🚨 REQUIRED: Environment variable ${key} is missing or empty`)
  }
  return value
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key]
}