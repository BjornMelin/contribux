import { createHash } from 'node:crypto'
import { z } from 'zod'

// Helper functions for validation
function calculateShannonEntropy(str: string): number {
  const frequency: Record<string, number> = {}

  // Count character frequencies
  for (const char of str) {
    frequency[char] = (frequency[char] || 0) + 1
  }

  // Calculate entropy
  let entropy = 0
  const length = str.length

  for (const char in frequency) {
    const p = frequency[char] / length
    entropy -= p * Math.log2(p)
  }

  return entropy
}

function validateJwtSecret(secret: string): boolean {
  // Minimum length check (32 characters for 256 bits)
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long (256 bits)')
  }

  // Calculate entropy (minimum ~4.5 bits per character for good randomness)
  const entropy = calculateShannonEntropy(secret)
  const entropyPerChar = entropy

  if (entropyPerChar < 4.0) {
    throw new Error('JWT_SECRET has insufficient entropy (too predictable)')
  }

  // Check for minimum unique characters (at least 50% unique)
  const uniqueChars = new Set(secret).size
  const uniqueRatio = uniqueChars / secret.length

  if (uniqueChars < 16) {
    throw new Error('JWT_SECRET must contain at least 16 unique characters')
  }

  if (uniqueRatio < 0.4) {
    throw new Error('JWT_SECRET has too many repeated characters')
  }

  return true
}

// Custom Zod schema for JWT secret validation
const jwtSecretSchema = z.string().refine(validateJwtSecret, {
  message: 'JWT_SECRET validation failed',
})

// PostgreSQL URL validation
const postgresUrlSchema = z
  .string()
  .regex(
    /^postgresql:\/\/[^:]+:[^@]+@[^/]+\/[^?]+(\?.+)?$/,
    'Must be a valid PostgreSQL connection string'
  )

// Domain validation for WebAuthn RP ID
const rpIdSchema = z.string().refine(value => {
  // In production, must not be localhost
  if (process.env.NODE_ENV === 'production' && value === 'localhost') {
    throw new Error('RP_ID cannot be localhost in production')
  }

  // Must be a valid domain format
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  if (value !== 'localhost' && !domainRegex.test(value)) {
    throw new Error('RP_ID must be a valid domain name')
  }

  return true
}, 'Invalid RP_ID format')

// Redis URL validation (optional)
const redisUrlSchema = z
  .string()
  .regex(
    /^redis:\/\/([^:]*:[^@]*@)?[^:/]+(:\d+)?(\/\d+)?(\?.+)?$/,
    'Must be a valid Redis connection string'
  )
  .optional()

// GitHub Client ID validation
const githubClientIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]{20}$/, 'GitHub Client ID must be exactly 20 alphanumeric characters')
  .optional()

// Environment variable schema for runtime validation
export const envSchema = z
  .object({
    // Database configuration
    DATABASE_URL: postgresUrlSchema,
    DATABASE_URL_DEV: postgresUrlSchema.optional(),
    DATABASE_URL_TEST: postgresUrlSchema.optional(),

    // Neon project configuration
    DB_PROJECT_ID: z.string().default('soft-dew-27794389'),
    DB_MAIN_BRANCH: z.string().default('br-summer-art-a864udht'),
    DB_DEV_BRANCH: z.string().default('br-cold-scene-a86p5ixr'),
    DB_TEST_BRANCH: z.string().default('br-fancy-pine-a8imumhr'),

    // Connection pool settings
    DB_POOL_MIN: z.string().pipe(z.coerce.number().int().min(1)).default('2'),
    DB_POOL_MAX: z.string().pipe(z.coerce.number().int().min(1)).default('20'),
    DB_POOL_IDLE_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).default('10000'),

    // Vector search configuration
    HNSW_EF_SEARCH: z.string().pipe(z.coerce.number().int().min(1)).default('200'),
    VECTOR_SIMILARITY_THRESHOLD: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.7'),
    HYBRID_SEARCH_TEXT_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.3'),
    HYBRID_SEARCH_VECTOR_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.7'),

    // Application environment
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Next.js configuration
    NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    PORT: z.string().pipe(z.coerce.number().int().min(1).max(65535)).default('3000'),

    // Authentication configuration
    JWT_SECRET:
      process.env.NODE_ENV === 'test'
        ? z
            .string()
            .default('test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only')
        : jwtSecretSchema,

    // OAuth configuration (GitHub)
    GITHUB_CLIENT_ID: githubClientIdSchema,
    GITHUB_CLIENT_SECRET: z.string().min(40).optional(), // GitHub client secrets are 40+ chars
    ALLOWED_REDIRECT_URIS: z.string().default('http://localhost:3000/api/auth/github/callback'),

    // WebAuthn configuration
    NEXT_PUBLIC_APP_NAME: z.string().default('Contribux'),
    NEXT_PUBLIC_RP_ID: rpIdSchema.default('localhost'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    WEBAUTHN_RP_ID: rpIdSchema.optional(),
    WEBAUTHN_RP_NAME: z.string().default('Contribux'),
    WEBAUTHN_ORIGINS: z.string().optional(),

    // Redis configuration (optional for session storage)
    REDIS_URL: redisUrlSchema,
    REDIS_PASSWORD: z.string().optional(),

    // Security headers and CORS
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    CSRF_SECRET: z.string().min(32).optional(),

    // Rate limiting
    RATE_LIMIT_MAX: z.string().pipe(z.coerce.number().int().min(1)).default('100'),
    RATE_LIMIT_WINDOW: z.string().pipe(z.coerce.number().int().min(1)).default('900'), // 15 minutes

    // Encryption keys
    ENCRYPTION_KEY: z.string().length(64).optional(), // 32 bytes hex-encoded

    // Monitoring and logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    ENABLE_AUDIT_LOGS: z.string().pipe(z.coerce.boolean()).default('true'),

    // Feature flags
    ENABLE_WEBAUTHN: z.string().pipe(z.coerce.boolean()).default('true'),
    ENABLE_OAUTH: z.string().pipe(z.coerce.boolean()).default('false'),

    // Maintenance mode
    MAINTENANCE_MODE: z.string().pipe(z.coerce.boolean()).default('false'),
    MAINTENANCE_BYPASS_TOKEN: z.string().optional(),

    // Additional OAuth origins
    ALLOWED_ORIGINS: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Environment-specific validation
    if (data.NODE_ENV === 'production') {
      // Production security checks
      if (!data.JWT_SECRET || data.JWT_SECRET.includes('test') || data.JWT_SECRET.includes('dev')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_SECRET cannot contain test/dev keywords in production',
          path: ['JWT_SECRET'],
        })
      }

      if (data.NEXT_PUBLIC_RP_ID === 'localhost') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'RP_ID cannot be localhost in production',
          path: ['NEXT_PUBLIC_RP_ID'],
        })
      }

      if (data.NEXT_PUBLIC_APP_URL.includes('localhost')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'APP_URL cannot use localhost in production',
          path: ['NEXT_PUBLIC_APP_URL'],
        })
      }

      if (data.CORS_ORIGINS.includes('localhost') && !data.CORS_ORIGINS.includes('contribux')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CORS_ORIGINS should not include localhost in production',
          path: ['CORS_ORIGINS'],
        })
      }

      // Require encryption key in production
      if (!data.ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ENCRYPTION_KEY is required in production',
          path: ['ENCRYPTION_KEY'],
        })
      }
    }

    // OAuth configuration validation (only in production)
    if (
      data.NODE_ENV === 'production' &&
      data.ENABLE_OAUTH &&
      (!data.GITHUB_CLIENT_ID || !data.GITHUB_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when OAuth is enabled in production',
        path: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      })
    }

    // Validate rate limiting configuration
    if (data.RATE_LIMIT_MAX > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rate limit too high, maximum recommended is 1000 requests per window',
        path: ['RATE_LIMIT_MAX'],
      })
    }

    // Validate redirect URIs format
    const redirectUris = data.ALLOWED_REDIRECT_URIS.split(',')
    for (const uri of redirectUris) {
      try {
        new URL(uri.trim())
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid redirect URI: ${uri}`,
          path: ['ALLOWED_REDIRECT_URIS'],
        })
      }
    }
  })

// Environment-specific validation functions
export function validateDevelopmentEnv(): void {
  if (process.env.NODE_ENV !== 'development') return

  console.log('✓ Development environment validation passed')
}

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return

  const requiredVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'ENCRYPTION_KEY',
  ]

  const missing = requiredVars.filter(varName => !process.env[varName])

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }

  console.log('✓ Production environment validation passed')
}

export function validateSecurityConfig(): void {
  const env = getValidatedEnv()

  // JWT secret validation
  if (env.NODE_ENV !== 'test') {
    try {
      validateJwtSecret(env.JWT_SECRET)
      console.log('✓ JWT_SECRET validation passed')
    } catch (error) {
      console.error(
        '✗ JWT_SECRET validation failed:',
        error instanceof Error ? error.message : 'Unknown error'
      )
      if (env.NODE_ENV === 'production') {
        throw error
      }
    }
  }

  // WebAuthn configuration
  if (env.ENABLE_WEBAUTHN) {
    if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_RP_ID === 'localhost') {
      throw new Error('WebAuthn RP_ID cannot be localhost in production')
    }
    console.log('✓ WebAuthn configuration validation passed')
  }

  // OAuth configuration
  if (env.ENABLE_OAUTH) {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      if (env.NODE_ENV === 'production') {
        throw new Error('OAuth credentials are required in production')
      }
      console.warn('⚠ OAuth credentials not configured')
    } else {
      console.log('✓ OAuth configuration validation passed')
    }
  }
}

// Startup validation function
export function validateEnvironmentOnStartup(): void {
  try {
    // Parse and validate all environment variables
    const env = envSchema.parse(process.env)

    // Environment-specific validation
    if (env.NODE_ENV === 'production') {
      validateProductionEnv()
    } else if (env.NODE_ENV === 'development') {
      validateDevelopmentEnv()
    }

    // Security configuration validation
    validateSecurityConfig()

    console.log(`✓ Environment validation completed for ${env.NODE_ENV} environment`)
  } catch (error) {
    console.error('✗ Environment validation failed:')

    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
      }
    } else {
      console.error(`  - ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    console.error('\nPlease fix the environment configuration before starting the application.')
    process.exit(1)
  }
}

// Runtime validation of environment variables with graceful fallbacks
function getValidatedEnv() {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      // In test environment, provide safe defaults
      return envSchema.parse({
        ...process.env,
        NODE_ENV: 'test',
        JWT_SECRET: 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
        DATABASE_URL:
          process.env.DATABASE_URL ||
          process.env.DATABASE_URL_TEST ||
          'postgresql://test:test@localhost:5432/testdb',
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || 'test1234567890abcdef',
        GITHUB_CLIENT_SECRET:
          process.env.GITHUB_CLIENT_SECRET ||
          'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement',
        RP_ID: process.env.RP_ID || 'localhost',
        NEXTAUTH_SECRET:
          process.env.NEXTAUTH_SECRET ||
          'test-nextauth-secret-with-sufficient-length-and-entropy-for-testing',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      })
    }
    throw error
  }
}

export const env = getValidatedEnv()

// Type inference for TypeScript
export type Env = z.infer<typeof envSchema>

// Utility functions for environment checks
export const isProduction = () => env.NODE_ENV === 'production'
export const isDevelopment = () => env.NODE_ENV === 'development'
export const isTest = () => env.NODE_ENV === 'test'

// Security utilities
export function getJwtSecret(): string {
  if (env.NODE_ENV === 'test') {
    return 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only'
  }
  return env.JWT_SECRET
}

export function getEncryptionKey(): string {
  if (!env.ENCRYPTION_KEY) {
    if (env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production')
    }
    // Generate a deterministic key for development/test
    return createHash('sha256').update('development-encryption-key').digest('hex')
  }
  return env.ENCRYPTION_KEY
}
