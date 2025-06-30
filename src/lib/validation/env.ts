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

    // GitHub OAuth configuration
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),

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
    VECTOR_SIMILARITY_THRESHOLD: z.string().pipe(z.coerce.number().min(0).max(1)).optional(),
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
    VECTOR_SIMILARITY_THRESHOLD: process.env.VECTOR_SIMILARITY_THRESHOLD,
    HYBRID_SEARCH_TEXT_WEIGHT: process.env.HYBRID_SEARCH_TEXT_WEIGHT,
    HYBRID_SEARCH_VECTOR_WEIGHT: process.env.HYBRID_SEARCH_VECTOR_WEIGHT,
    DB_MAIN_BRANCH: process.env.DB_MAIN_BRANCH,
    DB_DEV_BRANCH: process.env.DB_DEV_BRANCH,
    DB_TEST_BRANCH: process.env.DB_TEST_BRANCH,
    DB_PROJECT_ID: process.env.DB_PROJECT_ID,
    DB_POOL_MIN: process.env.DB_POOL_MIN,
    DB_POOL_MAX: process.env.DB_POOL_MAX,
    DB_POOL_IDLE_TIMEOUT: process.env.DB_POOL_IDLE_TIMEOUT,
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

// Legacy compatibility exports for existing code
export const isDevelopment = env.NODE_ENV === 'development'
export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

/**
 * Validates basic required environment variables
 */
function validateBasicEnvironmentVariables(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is required')
  }
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub OAuth configuration is required')
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
  ]

  for (const url of urlsToCheck) {
    if (url.value && /localhost|127\.0\.0\.1/i.test(url.value)) {
      throw new Error(`${url.name} contains localhost in production environment`)
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
      throw new Error(`${secret.name} contains test keywords in production environment`)
    }
  }
}

/**
 * Validates environment configuration on startup
 * Used during application initialization
 */
export function validateEnvironmentOnStartup(): void {
  try {
    // Basic validation for all environments
    validateBasicEnvironmentVariables()

    // Production-specific validations
    const nodeEnv = process.env.NODE_ENV || 'development'
    if (nodeEnv === 'production') {
      validateEncryptionKeyInProduction()
      validateProductionUrls()
      validateProductionSecrets()
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // biome-ignore lint/suspicious/noConsole: Required for security error logging during startup validation
    console.error(`Environment validation failed: ${errorMessage}`)
    process.exit(1)
  }
}

/**
 * Gets JWT secret for token signing
 * Falls back to NEXTAUTH_SECRET if no specific JWT secret is provided
 */
export function getJwtSecret(): string {
  const nodeEnv = process.env.NODE_ENV || 'development'

  // In test environment, allow fallback to NEXTAUTH_SECRET or test default
  if (nodeEnv === 'test') {
    return (
      process.env.JWT_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      'test-secret-with-sufficient-length-for-testing'
    )
  }

  // In production and development, require JWT_SECRET specifically when this function is called
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET is required and cannot be empty')
  }

  // Validate minimum length (32 characters for security)
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET validation failed: must be at least 32 characters long')
  }

  // In production, perform entropy validation
  if (nodeEnv === 'production') {
    // Check for test/dev keywords
    if (/test|dev|development|demo|sample|example/i.test(jwtSecret)) {
      throw new Error('JWT_SECRET contains test/dev keywords in production environment')
    }

    // Basic entropy check: require reasonable number of unique characters
    const uniqueChars = new Set(jwtSecret).size
    const entropyRatio = uniqueChars / jwtSecret.length

    if (uniqueChars < 8 || entropyRatio < 0.2) {
      throw new Error('JWT_SECRET has insufficient entropy (too repetitive or predictable)')
    }
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
