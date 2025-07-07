/**
 * Environment Variables Validation - Simplified T3 Stack Integration
 *
 * Library Modernization Phase 3: Consolidation (27→2 files)
 * Using @t3-oss/env-nextjs for type-safe environment validation
 * Replaces complex custom validation system with proven library
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
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),

    // GitHub OAuth configuration (optional in development)
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

    // Google OAuth configuration
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Redis configuration
    REDIS_URL: z.string().url().optional(),

    // Security configuration
    ALLOWED_REDIRECT_URIS: z.string().optional(),

    // OpenAI API configuration
    OPENAI_API_KEY: z.string().min(1).optional(),

    // Vector database configuration
    HNSW_EF_SEARCH: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    HNSW_EF_CONSTRUCTION: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    HNSW_M_CONNECTIONS: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    VECTOR_SIMILARITY_THRESHOLD: z.string().pipe(z.coerce.number().min(0).max(1)).optional(),
    VECTOR_MAX_RESULTS: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    VECTOR_BATCH_SIZE: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    VECTOR_CACHE_SIZE: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    VECTOR_CACHE_TTL: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    HYBRID_SEARCH_TEXT_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).optional(),
    HYBRID_SEARCH_VECTOR_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).optional(),

    // Database branch configuration
    DB_MAIN_BRANCH: z.string().optional(),
    DB_DEV_BRANCH: z.string().optional(),
    DB_TEST_BRANCH: z.string().optional(),

    // Database connection pool configuration
    DB_PROJECT_ID: z.string().optional(),
    DB_POOL_MIN: z.string().pipe(z.coerce.number().int().min(0)).optional(),
    DB_POOL_MAX: z.string().pipe(z.coerce.number().int().min(1)).optional(),
    DB_POOL_IDLE_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).optional(),

    // Database connection and query timeouts
    DB_CONNECTION_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).optional(),
    DB_QUERY_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).optional(),
    DB_HEALTH_CHECK_INTERVAL: z.string().pipe(z.coerce.number().int().min(1000)).optional(),
    DB_MAX_RETRIES: z.string().pipe(z.coerce.number().int().min(0)).optional(),
    DB_RETRY_DELAY: z.string().pipe(z.coerce.number().int().min(100)).optional(),

    // Optional integrations
    SENTRY_DSN: z.string().url().optional(),
  },

  /**
   * Client-side environment variables
   * These are exposed to the browser and must be prefixed with NEXT_PUBLIC_
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
  },

  /**
   * Runtime environment variables
   * These will be validated at runtime instead of build time
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_DEV: process.env.DATABASE_URL_DEV,
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    ALLOWED_REDIRECT_URIS: process.env.ALLOWED_REDIRECT_URIS,
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
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
  },

  /**
   * Skip validation during build time for certain environments
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})

// Type-safe environment access
export type Env = typeof env

// Helper function for environment-specific URLs
export function getDatabaseUrl(): string {
  if (env.NODE_ENV === 'test' && env.DATABASE_URL_TEST) {
    return env.DATABASE_URL_TEST
  }
  if (env.NODE_ENV === 'development' && env.DATABASE_URL_DEV) {
    return env.DATABASE_URL_DEV
  }
  return env.DATABASE_URL
}

// Helper function for app URL
export function getAppUrl(): string {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL
  }
  if (env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${env.NEXT_PUBLIC_VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

// Legacy compatibility exports for existing code (function-based to avoid T3 Stack issues in tests)
export const isDevelopment = () => env.NODE_ENV === 'development'
export const isProduction = () => env.NODE_ENV === 'production'
export const isTest = () => env.NODE_ENV === 'test'

/**
 * Validates basic required environment variables
 */
export function validateBasicEnvironmentVariables(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }
  // Check for either JWT_SECRET or NEXTAUTH_SECRET
  if (!process.env.JWT_SECRET && !process.env.NEXTAUTH_SECRET) {
    throw new Error('JWT_SECRET or NEXTAUTH_SECRET is required')
  }
  // GitHub OAuth is optional in development for testing
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
  ) {
    throw new Error('GitHub OAuth configuration is required in production')
  }
}

/**
 * Validates encryption key format and strength
 */
function validateEncryptionKeyInProduction(): void {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required in production')
  }

  const encKey = process.env.ENCRYPTION_KEY
  if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
    throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters (256 bits)')
  }

  // Check for weak keys (all zeros, repeated patterns)
  if (/^0+$/.test(encKey) || /^(.)\1{63}$/.test(encKey)) {
    throw new Error('ENCRYPTION_KEY has insufficient entropy (weak or predictable key)')
  }
}

/**
 * Validates URLs don't contain localhost in production
 */
function validateProductionUrls(): void {
  const urlsToCheck = [
    { name: 'NEXT_PUBLIC_APP_URL', value: process.env.NEXT_PUBLIC_APP_URL },
    { name: 'DATABASE_URL', value: process.env.DATABASE_URL },
    { name: 'NEXTAUTH_URL', value: process.env.NEXTAUTH_URL },
    { name: 'ALLOWED_REDIRECT_URIS', value: process.env.ALLOWED_REDIRECT_URIS },
  ]

  for (const url of urlsToCheck) {
    if (url.value && /localhost|127\.0\.0\.1/i.test(url.value)) {
      throw new Error(`${url.name} contains localhost in production environment`)
    }

    // Check for dev/test database names in production
    if (
      url.name === 'DATABASE_URL' &&
      url.value &&
      /_dev|_test|\/dev|http:\/\/dev\./i.test(url.value)
    ) {
      throw new Error(`${url.name} contains development/test patterns in production environment`)
    }

    // Check for non-HTTPS URLs in production (except for DATABASE_URL)
    if (
      url.name === 'NEXTAUTH_URL' &&
      url.value &&
      /^http:\/\//i.test(url.value) &&
      !/^http:\/\/localhost/i.test(url.value)
    ) {
      throw new Error(`${url.name} must use HTTPS in production environment`)
    }
  }
}

/**
 * Validates secrets don't contain test keywords in production
 */
function validateProductionSecrets(): void {
  const secretsToCheck = [
    { name: 'NEXTAUTH_SECRET', value: process.env.NEXTAUTH_SECRET },
    { name: 'GITHUB_CLIENT_SECRET', value: process.env.GITHUB_CLIENT_SECRET },
    { name: 'JWT_SECRET', value: process.env.JWT_SECRET },
  ]

  for (const secret of secretsToCheck) {
    if (secret.value && /test|dev|development|demo|sample|example/i.test(secret.value)) {
      throw new Error(`${secret.name} contains test/dev keywords in production environment`)
    }
  }
}

/**
 * Validates security configuration across all environments
 */
export function validateSecurityConfiguration(): void {
  // Only validate test patterns in production
  if (process.env.NODE_ENV !== 'production') return

  // Validate that critical environment variables don't contain test values
  const criticalEnvVars = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'NEXTAUTH_SECRET',
    'JWT_SECRET',
    'DATABASE_URL',
  ]

  for (const envVar of criticalEnvVars) {
    const value = process.env[envVar]
    if (value && /test-|demo-|sample-|example-/i.test(value)) {
      throw new Error(
        `🚨 SECURITY: ${envVar} contains test/demo values: ${value.substring(0, 10)}...`
      )
    }
  }
}

/**
 * Enhanced production security validation
 */
export function validateProductionSecuritySettings(): void {
  const nodeEnv = process.env.NODE_ENV
  if (nodeEnv !== 'production') return

  // Validate OAuth configuration
  const githubClientId = process.env.GITHUB_CLIENT_ID
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!githubClientId || githubClientId.length < 10) {
    throw new Error('🚨 PRODUCTION SECURITY: GITHUB_CLIENT_ID must be properly configured')
  }

  if (!githubClientSecret || githubClientSecret.length < 20) {
    throw new Error('🚨 PRODUCTION SECURITY: GITHUB_CLIENT_SECRET must be properly configured')
  }

  // Validate database URLs don't contain localhost or test patterns
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl && (dbUrl.includes('localhost') || dbUrl.includes('test'))) {
    throw new Error('🚨 PRODUCTION SECURITY: DATABASE_URL cannot contain localhost or test values')
  }

  // Validate redirect URIs for production
  const redirectUris = process.env.ALLOWED_REDIRECT_URIS
  if (redirectUris?.includes('localhost')) {
    throw new Error(
      '🚨 PRODUCTION SECURITY: ALLOWED_REDIRECT_URIS cannot contain localhost in production'
    )
  }

  // Ensure NEXTAUTH_URL is set for production
  const nextAuthUrl = process.env.NEXTAUTH_URL
  if (!nextAuthUrl || nextAuthUrl.includes('localhost')) {
    throw new Error('🚨 PRODUCTION SECURITY: NEXTAUTH_URL must be set to production domain')
  }
}

/**
 * Secure configuration utilities - no test fallback patterns
 */

/**
 * Safe environment variable getter with no insecure fallbacks
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value || value.trim() === '') {
    throw new Error(`🚨 REQUIRED: Environment variable ${key} is missing or empty`)
  }

  // Check for test patterns in production
  if (
    process.env.NODE_ENV === 'production' &&
    /test|demo|sample|fallback|default|changeme|password123|secret123|development|placeholder/i.test(
      value
    )
  ) {
    throw new Error(`🚨 SECURITY: ${key} contains test patterns in production`)
  }

  return value
}

/**
 * Safe environment variable getter with validation
 */
export function getOptionalEnv(
  key: string,
  validator?: (value: string) => boolean
): string | undefined {
  const value = process.env[key]
  if (!value) return undefined

  if (validator && !validator(value)) {
    throw new Error(`🚨 VALIDATION: Environment variable ${key} failed validation`)
  }

  return value
}

/**
 * Validates secret entropy for production security
 */
export function validateSecretEntropy(secret: string, minEntropy = 0.2): boolean {
  if (secret.length < 32) return false

  const uniqueChars = new Set(secret).size
  const entropyRatio = uniqueChars / secret.length

  return uniqueChars >= 8 && entropyRatio >= minEntropy
}

/**
 * Production-safe configuration getter
 */
export function getSecureConfigValue(
  key: string,
  options: {
    required?: boolean
    minLength?: number
    allowTestInProduction?: boolean
  } = {}
): string | undefined {
  const { required = false, minLength = 1, allowTestInProduction = false } = options

  const value = process.env[key]

  if (required && (!value || value.trim() === '')) {
    throw new Error(`🚨 REQUIRED: ${key} is missing or empty`)
  }

  if (!value) return undefined

  if (value.length < minLength) {
    throw new Error(`🚨 VALIDATION: ${key} must be at least ${minLength} characters`)
  }

  // Security check for production
  if (process.env.NODE_ENV === 'production' && !allowTestInProduction) {
    if (/test-|demo-|sample-|localhost/i.test(value)) {
      throw new Error(`🚨 SECURITY: ${key} contains test/demo patterns in production`)
    }
  }

  return value
}

/**
 * Validates environment configuration on startup
 * Used during application initialization
 */
export function validateEnvironmentOnStartup(): void {
  // Basic validation for all environments
  validateBasicEnvironmentVariables()

  // Validate JWT secret (length, entropy, etc.)
  getJwtSecret()

  // Security configuration validation
  validateSecurityConfiguration()

  // Production-specific validations
  const nodeEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'development'
  if (nodeEnv === 'production') {
    validateEncryptionKeyInProduction()
    validateProductionUrls()
    validateProductionSecrets()
    validateProductionSecuritySettings()
  }
}

// Helper function to validate JWT secret exists and get it
function validateJwtSecretExists(nodeEnv: string): string {
  const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

  if (!jwtSecret || jwtSecret.trim() === '') {
    if (nodeEnv === 'test') {
      throw new Error(
        'JWT_SECRET or NEXTAUTH_SECRET is required even in test environment. Set JWT_SECRET in your test configuration.'
      )
    }
    throw new Error('JWT_SECRET or NEXTAUTH_SECRET is required and cannot be empty')
  }

  return jwtSecret
}

// Helper function to validate JWT secret length
function validateJwtSecretLength(jwtSecret: string): void {
  if (jwtSecret.length < 32) {
    throw new Error('JWT secret validation failed: must be at least 32 characters long')
  }
}

// Helper function to validate JWT secret doesn't contain test/dev keywords
function validateJwtSecretKeywords(jwtSecret: string): void {
  if (/test|dev|development|demo|sample|example/i.test(jwtSecret)) {
    throw new Error('🚨 SECURITY: JWT_SECRET contains test/dev keywords in production environment')
  }
}

// Helper function to validate JWT secret entropy
function validateJwtSecretEntropy(jwtSecret: string): void {
  const uniqueChars = new Set(jwtSecret).size
  const entropyRatio = uniqueChars / jwtSecret.length

  if (uniqueChars < 8 || entropyRatio < 0.2) {
    throw new Error(
      '🚨 SECURITY: JWT_SECRET has insufficient entropy (too repetitive or predictable)'
    )
  }
}

// Helper function to validate JWT secret length limits
function validateJwtSecretLengthLimits(jwtSecret: string): void {
  if (jwtSecret.length > 256) {
    throw new Error('🚨 SECURITY: JWT_SECRET is too long (maximum 256 characters)')
  }
}

// Helper function to validate JWT secret doesn't contain weak patterns
function validateJwtSecretPatterns(jwtSecret: string): void {
  if (/^(.)\\1+$/.test(jwtSecret) || /123456|password|secret123/i.test(jwtSecret)) {
    throw new Error('🚨 SECURITY: JWT_SECRET contains weak patterns')
  }
}

// Helper function to perform all production validations
function validateJwtSecretForProduction(jwtSecret: string): void {
  validateJwtSecretKeywords(jwtSecret)
  validateJwtSecretEntropy(jwtSecret)
  validateJwtSecretLengthLimits(jwtSecret)
  validateJwtSecretPatterns(jwtSecret)
}

/**
 * Gets JWT secret for token signing
 * Falls back to NEXTAUTH_SECRET if no specific JWT secret is provided
 */
export function getJwtSecret(): string {
  const nodeEnv = process.env.NODE_ENV || 'development'

  // Get the secret from available sources - no insecure fallbacks
  const jwtSecret = validateJwtSecretExists(nodeEnv)

  // Validate minimum length (32 characters for security)
  validateJwtSecretLength(jwtSecret)

  // In production, perform strict security validation
  if (nodeEnv === 'production') {
    validateJwtSecretForProduction(jwtSecret)
  }

  return jwtSecret
}

/**
 * Gets encryption key with comprehensive validation
 * Validates format, length, and entropy requirements
 */
export function getEncryptionKey(): string {
  const encryptionKey = process.env.ENCRYPTION_KEY

  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY is required in all environments. Must be 64-character hexadecimal (256 bits). Generate one with: openssl rand -hex 32'
    )
  }

  // Validate format: must be 64-character hexadecimal (256 bits)
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256 bits). Generate one with: openssl rand -hex 32'
    )
  }

  // Validate entropy: reject weak/predictable keys
  if (/^0+$/.test(encryptionKey) || /^(.)\1{63}$/.test(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY has insufficient entropy (weak or predictable key). Generate a secure one with: openssl rand -hex 32'
    )
  }

  return encryptionKey
}

/**
 * Validates production environment configuration
 */
export function validateProductionEnv(): void {
  const requiredProdVars = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'ENCRYPTION_KEY',
  ]

  const missingVars = requiredProdVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    throw new Error(`Missing required production environment variables: ${missingVars.join(', ')}`)
  }
}

/**
 * General environment validation with entropy and format checks
 */
export function validateEnvironment(): void {
  // Validate encryption key if present
  if (process.env.ENCRYPTION_KEY) {
    const encKey = process.env.ENCRYPTION_KEY

    // Format validation
    if (!/^[0-9a-fA-F]+$/.test(encKey)) {
      throw new Error('ENCRYPTION_KEY has invalid format - must be hexadecimal')
    }

    if (encKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters')
    }

    // Entropy validation
    if (/^0+$/.test(encKey) || /^(.)\1+$/.test(encKey)) {
      throw new Error('ENCRYPTION_KEY is weak - has insufficient entropy or predictable pattern')
    }
  }
}
