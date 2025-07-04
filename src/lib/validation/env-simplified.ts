import { z } from 'zod'

// Simplified entropy validation for secrets
export function isWeakSecret(secret: string): boolean {
  const lowerSecret = secret.toLowerCase()

  // Check for common weak patterns
  const weakPatterns = [
    'test',
    'demo',
    'example',
    'password',
    'secret',
    'key',
    '12345',
    'abcde',
    'qwerty',
    'admin',
    'default',
  ]

  for (const pattern of weakPatterns) {
    if (lowerSecret.includes(pattern)) {
      return true
    }
  }

  // Check for very simple repeated characters
  const uniqueChars = new Set(secret).size
  return uniqueChars < 8
}

export function validateJwtSecret(secret: string): boolean {
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }

  if (isWeakSecret(secret)) {
    throw new Error('JWT_SECRET appears to be a weak or test value')
  }

  return true
}

// Basic validation schemas
const postgresUrlSchema = z
  .string()
  .regex(/^postgresql:\/\/[^:/]+:[^@/]*@[^/]+\/[^?/]+(\?.+)?$/, 'Invalid PostgreSQL URL')

const githubClientIdSchema = z
  .string()
  .regex(/^(Iv1\.[a-zA-Z0-9]{16}|[a-zA-Z0-9]{20})$/, 'Invalid GitHub Client ID')
  .optional()

// Main environment schema
export const envSchema = z
  .object({
    // Core configuration
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Database
    DATABASE_URL: postgresUrlSchema,
    DATABASE_URL_DEV: postgresUrlSchema.optional(),
    DATABASE_URL_TEST: postgresUrlSchema.optional(),

    // Authentication
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters long')
      .refine(validateJwtSecret, 'JWT_SECRET validation failed'),

    // OAuth
    GITHUB_CLIENT_ID: githubClientIdSchema,
    GITHUB_CLIENT_SECRET: z.string().min(40).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    ENABLE_OAUTH: z.string().pipe(z.coerce.boolean()).default('true'),

    // Security
    ENCRYPTION_KEY: z.string().length(64).optional(),

    // Application
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    PORT: z.string().pipe(z.coerce.number().int().min(1).max(65535)).default('3000'),

    // Feature flags
    ENABLE_WEBAUTHN: z.string().pipe(z.coerce.boolean()).default('true'),
    MAINTENANCE_MODE: z.string().pipe(z.coerce.boolean()).default('false'),

    // Database configuration with sensible defaults
    DB_PROJECT_ID: z.string().default('soft-dew-27794389'),
    DB_MAIN_BRANCH: z.string().default('br-summer-art-a864udht'),
    DB_DEV_BRANCH: z.string().default('br-cold-scene-a86p5ixr'),
    DB_TEST_BRANCH: z.string().default('br-fancy-pine-a8imumhr'),
    DB_POOL_MIN: z.string().pipe(z.coerce.number().int().min(1)).default('2'),
    DB_POOL_MAX: z.string().pipe(z.coerce.number().int().min(1)).default('20'),
    DB_POOL_IDLE_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).default('10000'),

    // Vector search defaults
    HNSW_EF_SEARCH: z.string().pipe(z.coerce.number().int().min(1)).default('200'),
    VECTOR_SIMILARITY_THRESHOLD: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.7'),
    HYBRID_SEARCH_TEXT_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.3'),
    HYBRID_SEARCH_VECTOR_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.7'),

    // Optional configuration
    NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(32).optional(),
    REDIS_URL: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    ENABLE_AUDIT_LOGS: z.string().pipe(z.coerce.boolean()).default('true'),
    RATE_LIMIT_MAX: z.string().pipe(z.coerce.number().int().min(1)).default('100'),
    RATE_LIMIT_WINDOW: z.string().pipe(z.coerce.number().int().min(1)).default('900'),

    // WebAuthn
    NEXT_PUBLIC_RP_ID: z.string().default('localhost'),
    WEBAUTHN_RP_NAME: z.string().default('Contribux'),
    WEBAUTHN_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).default('60000'),
    WEBAUTHN_CHALLENGE_EXPIRY: z.string().pipe(z.coerce.number().int().min(1000)).default('300000'),
    WEBAUTHN_SUPPORTED_ALGORITHMS: z.string().default('-7,-257'),

    // Misc
    NEXT_PUBLIC_APP_NAME: z.string().default('Contribux'),
    ALLOWED_REDIRECT_URIS: z
      .string()
      .default(
        'http://localhost:3000/api/auth/github/callback,http://localhost:3000/api/auth/google/callback'
      ),
    CSRF_SECRET: z.string().min(32).optional(),
    MAINTENANCE_BYPASS_TOKEN: z.string().optional(),
    ALLOWED_ORIGINS: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Production-only validations
    if (data.NODE_ENV === 'production') {
      // Required production variables
      const requiredProdVars = ['JWT_SECRET', 'DATABASE_URL', 'ENCRYPTION_KEY']

      for (const varName of requiredProdVars) {
        const value = data[varName as keyof typeof data] as string
        if (!value || value.includes('test') || value.includes('localhost')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${varName} must be properly configured for production`,
            path: [varName],
          })
        }
      }

      // OAuth validation if enabled
      if (data.ENABLE_OAUTH && (!data.GITHUB_CLIENT_ID || !data.GITHUB_CLIENT_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'GitHub OAuth credentials required when OAuth is enabled',
          path: ['GITHUB_CLIENT_ID'],
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

// Environment validation functions
function shouldSkipValidation(): boolean {
  return process.env.SKIP_ENV_VALIDATION === 'true' || process.env.NODE_ENV === 'test'
}

function createTestEnvironment(): Env {
  return {
    NODE_ENV: 'test' as const,
    JWT_SECRET:
      'test-jwt-secret-very-long-secure-test-secret-key-for-development-use-only-32chars-plus',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    DATABASE_URL_DEV: undefined,
    DATABASE_URL_TEST: undefined,
    DB_PROJECT_ID: 'test-project',
    DB_MAIN_BRANCH: 'main',
    DB_DEV_BRANCH: 'dev',
    DB_TEST_BRANCH: 'test',
    DB_POOL_MIN: 2,
    DB_POOL_MAX: 20,
    DB_POOL_IDLE_TIMEOUT: 10000,
    HNSW_EF_SEARCH: 200,
    VECTOR_SIMILARITY_THRESHOLD: 0.7,
    HYBRID_SEARCH_TEXT_WEIGHT: 0.3,
    HYBRID_SEARCH_VECTOR_WEIGHT: 0.7,
    GITHUB_CLIENT_ID: undefined,
    GITHUB_CLIENT_SECRET: undefined,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    ENABLE_OAUTH: true,
    ENCRYPTION_KEY: undefined,
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    PORT: 3000,
    ENABLE_WEBAUTHN: true,
    MAINTENANCE_MODE: false,
    NEXT_PUBLIC_VERCEL_URL: undefined,
    VERCEL_URL: undefined,
    NEXTAUTH_URL: undefined,
    NEXTAUTH_SECRET: undefined,
    REDIS_URL: undefined,
    REDIS_PASSWORD: undefined,
    CORS_ORIGINS: 'http://localhost:3000',
    LOG_LEVEL: 'info' as const,
    ENABLE_AUDIT_LOGS: true,
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW: 900,
    NEXT_PUBLIC_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'Contribux',
    WEBAUTHN_TIMEOUT: 60000,
    WEBAUTHN_CHALLENGE_EXPIRY: 300000,
    WEBAUTHN_SUPPORTED_ALGORITHMS: '-7,-257',
    NEXT_PUBLIC_APP_NAME: 'Contribux',
    ALLOWED_REDIRECT_URIS:
      'http://localhost:3000/api/auth/github/callback,http://localhost:3000/api/auth/google/callback',
    CSRF_SECRET: undefined,
    MAINTENANCE_BYPASS_TOKEN: undefined,
    ALLOWED_ORIGINS: undefined,
  }
}

function getValidatedEnv(): Env {
  if (shouldSkipValidation()) {
    return createTestEnvironment()
  }

  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      throw error
    }
    // biome-ignore lint/suspicious/noConsole: Environment validation error logging
    console.error('Environment validation failed:', error)
    process.exit(1)
  }
}

// Cached environment
let _cachedEnv: Env | null = null

export function getEnv(): Env {
  if (_cachedEnv) return _cachedEnv
  _cachedEnv = getValidatedEnv()
  return _cachedEnv
}

export function clearEnvCache(): void {
  _cachedEnv = null
}

// Startup validation
export function validateEnvironmentOnStartup(): void {
  if (shouldSkipValidation()) {
    return
  }

  try {
    const env = envSchema.parse(process.env)

    if (env.NODE_ENV === 'production') {
      // biome-ignore lint/suspicious/noConsole: Environment validation success logging
      console.log('✓ Production environment validation passed')
    } else {
      // biome-ignore lint/suspicious/noConsole: Environment validation success logging
      console.log('✓ Development environment validation passed')
    }
  } catch (error) {
    const errorMessage =
      error instanceof z.ZodError
        ? `Environment validation failed:\n${error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}`
        : `Environment validation failed: ${error instanceof Error ? error.message : String(error)}`

    if (process.env.NODE_ENV === 'test') {
      throw new Error(errorMessage)
    }

    // biome-ignore lint/suspicious/noConsole: Environment validation error logging
    console.error(errorMessage)
    process.exit(1)
  }
}

// Utility functions
export const isProduction = () => getEnv().NODE_ENV === 'production'
export const isDevelopment = () => getEnv().NODE_ENV === 'development'
export const isTest = () => getEnv().NODE_ENV === 'test'

export function getJwtSecret(): string {
  if (process.env.NODE_ENV === 'test') {
    return '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET environment variable is required and cannot be empty')
  }

  try {
    validateJwtSecret(jwtSecret)
    return jwtSecret
  } catch (error) {
    throw new Error(
      `JWT_SECRET validation failed: ${error instanceof Error ? error.message : 'Invalid secret'}`
    )
  }
}

export function getEncryptionKey(): string {
  const encryptionKey = process.env.ENCRYPTION_KEY

  if (!encryptionKey || encryptionKey.trim() === '') {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
        'Generate one using: openssl rand -hex 32'
    )
  }

  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256 bits). ' +
        'Generate a secure key using: openssl rand -hex 32'
    )
  }

  if (isWeakSecret(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY appears to be weak. ' + 'Generate a secure key using: openssl rand -hex 32'
    )
  }

  return encryptionKey
}

// Simple validation for security tests
export function validateEnvironment(): { encryptionKey: string } {
  const envNodeEnv = process.env.NODE_ENV || 'development'

  if (envNodeEnv === 'production' && !process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required in production')
  }

  return {
    encryptionKey: getEncryptionKey(),
  }
}

// Backward compatibility
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return getEnv()[prop as keyof Env]
  },
})

// Legacy function exports for compatibility
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
}

export function validateDevelopmentEnv(): void {
  // Development environment has minimal requirements
}

/**
 * Helper function to validate JWT secret configuration
 */
function validateJwtConfiguration(nodeEnv: string): void {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) return

  try {
    validateJwtSecret(jwtSecret)
    // biome-ignore lint/suspicious/noConsole: JWT validation success logging
    console.log('✓ JWT_SECRET validation passed')
  } catch (error) {
    if (nodeEnv === 'production') {
      throw error
    }
    // biome-ignore lint/suspicious/noConsole: JWT validation warning logging
    console.warn(
      `⚠ JWT_SECRET validation warning: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Helper function to validate OAuth configuration
 */
function validateOAuthConfiguration(nodeEnv: string): void {
  if (process.env.ENABLE_OAUTH === 'false') return

  const hasGitHubOAuth = process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET

  if (hasGitHubOAuth) {
    // biome-ignore lint/suspicious/noConsole: OAuth validation success logging
    console.log('✓ OAuth configuration validation passed for GitHub')
  } else if (nodeEnv === 'production') {
    throw new Error('OAuth configuration issues: GitHub OAuth credentials missing')
  }
}

export function validateSecurityConfig(): void {
  const nodeEnv = process.env.NODE_ENV || 'development'

  if (nodeEnv === 'test') {
    return
  }

  validateJwtConfiguration(nodeEnv)
  validateOAuthConfiguration(nodeEnv)
}
