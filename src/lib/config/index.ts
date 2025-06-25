/**
 * Centralized Configuration Management System
 * Eliminates magic numbers and provides type-safe configuration
 */

import { z } from 'zod'
import { env } from '../validation/env'

// Configuration schema for runtime validation
const configSchema = z.object({
  // Authentication & JWT configuration
  auth: z.object({
    jwt: z.object({
      accessTokenExpiry: z.number().min(60).max(86400), // 1 minute to 24 hours
      refreshTokenExpiry: z.number().min(3600).max(2592000), // 1 hour to 30 days
      testSecret: z.string().default('test-secret'),
      issuer: z.string().default('contribux'),
      audience: z.array(z.string()).default(['contribux-api']),
    }),
    session: z.object({
      expiry: z.number().min(3600).max(604800), // 1 hour to 7 days
      cleanupInterval: z.number().min(60000).max(3600000), // 1 minute to 1 hour
    }),
    rateLimit: z.object({
      windowMs: z.number().min(60000).max(3600000), // 1 minute to 1 hour
      max: z.number().min(1).max(1000), // 1 to 1000 requests
      defaultLimit: z.number().min(1).max(200),
      defaultWindow: z.number().min(60000).max(900000), // 1 to 15 minutes
    }),
    security: z.object({
      failedLoginThreshold: z.number().min(3).max(10),
      failedLoginWindow: z.number().min(300000).max(1800000), // 5 to 30 minutes
      accountLockDuration: z.number().min(900000).max(86400000), // 15 minutes to 24 hours
      anomalyTimeWindow: z.number().min(1000).max(60000), // 1 second to 1 minute
      rapidSuccessionThreshold: z.number().min(2).max(10),
      typicalHoursStart: z.number().min(0).max(23),
      typicalHoursEnd: z.number().min(0).max(23),
    }),
  }),

  // WebAuthn configuration
  webauthn: z.object({
    timeout: z.number().min(30000).max(300000), // 30 seconds to 5 minutes
    challengeExpiry: z.number().min(60000).max(600000), // 1 to 10 minutes
    challengeLength: z.number().min(16).max(64), // 16 to 64 bytes
    supportedAlgorithms: z.array(z.number()).default([-7, -257]), // ES256, RS256
  }),

  // OAuth configuration
  oauth: z.object({
    stateExpiry: z.number().min(300000).max(1800000), // 5 to 30 minutes
    allowedProviders: z.array(z.string()).default(['github']),
    tokenRefreshBuffer: z.number().min(300000).max(3600000), // 5 minutes to 1 hour
  }),

  // Audit & GDPR configuration
  audit: z.object({
    retention: z.object({
      standardLogs: z.number().min(86400000).max(63072000000), // 1 day to 2 years
      criticalLogs: z.number().min(86400000).max(220752000000), // 1 day to 7 years
      complianceLogs: z.number().min(86400000).max(94608000000), // 1 day to 3 years
      sessionData: z.number().min(86400000).max(7776000000), // 1 day to 90 days
      auditCleanupInterval: z.number().min(86400000).max(604800000), // 1 to 7 days
    }),
    gdpr: z.object({
      inactiveUserRetention: z.number().min(31536000000).max(94608000000), // 1 to 3 years
      deletionGracePeriod: z.number().min(86400000).max(2592000000), // 1 to 30 days
      consentRetention: z.number().min(31536000000).max(94608000000), // 1 to 3 years
      exportTimeout: z.number().min(60000).max(1800000), // 1 to 30 minutes
    }),
  }),

  // Cryptography configuration
  crypto: z.object({
    keyRotationInterval: z.number().min(2592000000).max(31536000000), // 30 days to 1 year
    keyLength: z.number().min(128).max(512), // 128 to 512 bits
    ivLength: z.number().min(8).max(16), // 8 to 16 bytes
    tagLength: z.number().min(12).max(16), // 12 to 16 bytes
    algorithm: z.string().default('AES-GCM'),
  }),

  // Database monitoring configuration
  database: z.object({
    connectionTimeout: z.number().min(5000).max(60000), // 5 to 60 seconds
    slowQueryThreshold: z.number().min(100).max(10000), // 100ms to 10 seconds
    healthCheckInterval: z.number().min(30000).max(300000), // 30 seconds to 5 minutes
    performanceReportInterval: z.number().min(3600000).max(86400000), // 1 to 24 hours
    maxSlowQueries: z.number().min(5).max(100),
    indexUsageThreshold: z.number().min(0).max(1000),
  }),

  // Application-specific configuration
  app: z.object({
    maintenanceMode: z.boolean().default(false),
    apiVersion: z.string().default('v1'),
    corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
    uploadsMaxSize: z.number().min(1048576).max(104857600), // 1MB to 100MB
    requestTimeout: z.number().min(5000).max(120000), // 5 seconds to 2 minutes
  }),
})

// Type inference for configuration
export type Config = z.infer<typeof configSchema>

// Environment-based configuration factory
function createConfig(): Config {
  const nodeEnv = env.NODE_ENV

  // Base configuration
  const baseConfig: Config = {
    auth: {
      jwt: {
        accessTokenExpiry: 15 * 60, // 15 minutes
        refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days
        testSecret: 'test-secret',
        issuer: 'contribux',
        audience: ['contribux-api'],
      },
      session: {
        expiry: 7 * 24 * 60 * 60, // 7 days
        cleanupInterval: 60 * 1000, // 1 minute
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // requests per window
        defaultLimit: 60, // default for general endpoints
        defaultWindow: 60 * 1000, // 1 minute default window
      },
      security: {
        failedLoginThreshold: 5,
        failedLoginWindow: 10 * 60 * 1000, // 10 minutes
        accountLockDuration: 30 * 60 * 1000, // 30 minutes
        anomalyTimeWindow: 5 * 1000, // 5 seconds
        rapidSuccessionThreshold: 3,
        typicalHoursStart: 6, // 6 AM
        typicalHoursEnd: 22, // 10 PM
      },
    },

    webauthn: {
      timeout: 60 * 1000, // 60 seconds
      challengeExpiry: 5 * 60 * 1000, // 5 minutes
      challengeLength: 32, // 32 bytes
      supportedAlgorithms: [-7, -257], // ES256, RS256
    },

    oauth: {
      stateExpiry: 10 * 60 * 1000, // 10 minutes
      allowedProviders: ['github'],
      tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes before expiry
    },

    audit: {
      retention: {
        standardLogs: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
        criticalLogs: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        complianceLogs: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
        sessionData: 90 * 24 * 60 * 60 * 1000, // 90 days
        auditCleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      },
      gdpr: {
        inactiveUserRetention: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
        deletionGracePeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
        consentRetention: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years after withdrawal
        exportTimeout: 5 * 60 * 1000, // 5 minutes
      },
    },

    crypto: {
      keyRotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
      keyLength: 256, // 256 bits
      ivLength: 12, // 12 bytes for GCM
      tagLength: 16, // 16 bytes
      algorithm: 'AES-GCM',
    },

    database: {
      connectionTimeout: 30 * 1000, // 30 seconds
      slowQueryThreshold: 1000, // 1 second
      healthCheckInterval: 60 * 1000, // 1 minute
      performanceReportInterval: 60 * 60 * 1000, // 1 hour
      maxSlowQueries: 10,
      indexUsageThreshold: 100,
    },

    app: {
      maintenanceMode: false,
      apiVersion: 'v1',
      corsOrigins: ['http://localhost:3000'],
      uploadsMaxSize: 10 * 1024 * 1024, // 10MB
      requestTimeout: 30 * 1000, // 30 seconds
    },
  }

  // Environment-specific overrides
  switch (nodeEnv) {
    case 'development':
      return {
        ...baseConfig,
        auth: {
          ...baseConfig.auth,
          jwt: {
            ...baseConfig.auth.jwt,
            accessTokenExpiry: 60 * 60, // 1 hour for development
          },
          rateLimit: {
            ...baseConfig.auth.rateLimit,
            max: 1000, // More lenient rate limiting
          },
        },
        app: {
          ...baseConfig.app,
          corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
        },
      }

    case 'test':
      return {
        ...baseConfig,
        auth: {
          ...baseConfig.auth,
          jwt: {
            ...baseConfig.auth.jwt,
            accessTokenExpiry: 5 * 60, // 5 minutes for testing
            refreshTokenExpiry: 60 * 60, // 1 hour for testing
          },
          security: {
            ...baseConfig.auth.security,
            failedLoginThreshold: 3, // Lower threshold for testing
            failedLoginWindow: 5 * 60 * 1000, // 5 minutes (minimum allowed)
          },
        },
        webauthn: {
          ...baseConfig.webauthn,
          timeout: 30 * 1000, // 30 seconds for testing
          challengeExpiry: 60 * 1000, // 1 minute (minimum allowed)
        },
        oauth: {
          ...baseConfig.oauth,
          stateExpiry: 5 * 60 * 1000, // 5 minutes (minimum allowed)
        },
        database: {
          ...baseConfig.database,
          healthCheckInterval: 30 * 1000, // 30 seconds (minimum allowed)
          slowQueryThreshold: 100, // 100ms for testing
        },
      }

    case 'production':
      return {
        ...baseConfig,
        auth: {
          ...baseConfig.auth,
          rateLimit: {
            ...baseConfig.auth.rateLimit,
            max: 60, // Stricter rate limiting in production
            windowMs: 15 * 60 * 1000, // 15 minutes
          },
          security: {
            ...baseConfig.auth.security,
            accountLockDuration: 60 * 60 * 1000, // 1 hour lock in production
          },
        },
        app: {
          ...baseConfig.app,
          corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['https://contribux.com'],
          requestTimeout: 15 * 1000, // 15 seconds in production
        },
        database: {
          ...baseConfig.database,
          connectionTimeout: 10 * 1000, // 10 seconds in production
          healthCheckInterval: 5 * 60 * 1000, // 5 minutes in production
        },
      }

    default:
      return baseConfig
  }
}

// Create and validate configuration
export const config = configSchema.parse(createConfig())

// Re-export specific configuration sections for convenience
export const {
  auth: authConfig,
  webauthn: webauthnConfig,
  oauth: oauthConfig,
  audit: auditConfig,
  crypto: cryptoConfig,
  database: databaseConfig,
  app: appConfig,
} = config

// Configuration validation utilities
export function validateConfig(): boolean {
  try {
    configSchema.parse(config)
    return true
  } catch (error) {
    console.error('Configuration validation failed:', error)
    return false
  }
}

// Get configuration value with type safety
export function getConfigValue<T extends keyof Config>(section: T): Config[T] {
  return config[section]
}

// Environment-specific configuration getters
export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development'
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production'
}

export function isTest(): boolean {
  return env.NODE_ENV === 'test'
}

// Configuration constants for commonly used values
export const TIME_CONSTANTS = {
  MILLISECOND: 1,
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const

// Size constants for file uploads and memory limits
export const SIZE_CONSTANTS = {
  BYTE: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
} as const

// Security constants
export const SECURITY_CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  TOKEN_LENGTH: 32,
  CHALLENGE_LENGTH: 32,
} as const

// Database operation timeouts
export const DB_TIMEOUTS = {
  QUICK_QUERY: 5 * 1000, // 5 seconds
  STANDARD_QUERY: 30 * 1000, // 30 seconds
  LONG_QUERY: 60 * 1000, // 1 minute
  MIGRATION: 5 * 60 * 1000, // 5 minutes
} as const

// Export type for external usage
export type AuthConfig = typeof authConfig
export type WebAuthnConfig = typeof webauthnConfig
export type OAuthConfig = typeof oauthConfig
export type AuditConfig = typeof auditConfig
export type CryptoConfig = typeof cryptoConfig
export type DatabaseConfig = typeof databaseConfig
export type AppConfig = typeof appConfig
