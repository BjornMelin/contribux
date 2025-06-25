import { z } from 'zod'

// Helper functions for validation
export function calculateShannonEntropy(str: string): number {
  const frequency: Record<string, number> = {}

  // Count character frequencies
  for (const char of str) {
    frequency[char] = (frequency[char] || 0) + 1
  }

  // Calculate entropy
  let entropy = 0
  const length = str.length

  for (const char in frequency) {
    if (frequency[char] !== undefined) {
      const p = frequency[char] / length
      entropy -= p * Math.log2(p)
    }
  }

  return entropy
}

export function validateJwtSecret(secret: string): boolean {
  // Minimum length check (32 characters for 256 bits)
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long (256 bits)')
  }

  // Calculate entropy (minimum ~3.5 bits per character for reasonable randomness)
  const entropy = calculateShannonEntropy(secret)
  const entropyPerChar = entropy

  if (entropyPerChar < 3.5) {
    throw new Error('JWT_SECRET has insufficient entropy (too predictable)')
  }

  // Check for minimum unique characters (at least 12 unique chars for 32+ char strings)
  const uniqueChars = new Set(secret).size
  const uniqueRatio = uniqueChars / secret.length

  if (uniqueChars < 12) {
    throw new Error('JWT_SECRET has insufficient entropy (too predictable)')
  }

  if (uniqueRatio < 0.3) {
    throw new Error('JWT_SECRET has insufficient entropy (too predictable)')
  }

  return true
}

// Custom Zod schema for JWT secret validation
const _jwtSecretSchema = z.string().refine(validateJwtSecret, {
  message: 'JWT_SECRET validation failed',
})

// PostgreSQL URL validation
const postgresUrlSchema = z
  .string()
  .regex(
    /^postgresql:\/\/[^:/]+:[^@/]*@[^/]+\/[^?/]+(\?.+)?$/,
    'Must be a valid PostgreSQL connection string'
  )

// Redis URL validation (optional)
const redisUrlSchema = z
  .string()
  .regex(
    /^redis:\/\/([^:]*:[^@]*@)?[^:/]+(:\d+)?(\/\d+)?(\?.+)?$/,
    'Must be a valid Redis connection string'
  )
  .optional()

// GitHub Client ID validation (supports both OAuth and GitHub App format)
const githubClientIdSchema = z
  .string()
  .regex(
    /^(Iv1\.[a-zA-Z0-9]{16}|[a-zA-Z0-9]{20})$/,
    'GitHub Client ID must be either OAuth App format (Iv1.xxx) or GitHub App format (20 chars)'
  )
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
    JWT_SECRET: z
      .string()
      .optional()
      .transform(value => {
        // Get the actual NODE_ENV from process.env at runtime
        const nodeEnv = process.env.NODE_ENV

        // In test environment, provide default if not set
        if (nodeEnv === 'test' && !value) {
          return 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only'
        }

        return value || ''
      })
      .refine(
        value => {
          const nodeEnv = process.env.NODE_ENV

          // Skip validation in test environment
          if (nodeEnv === 'test') {
            return true
          }

          // For non-test environments, validate the JWT secret
          try {
            return validateJwtSecret(value)
          } catch (_error) {
            return false
          }
        },
        {
          message: 'JWT_SECRET validation failed',
        }
      ),

    // OAuth configuration (GitHub)
    GITHUB_CLIENT_ID: githubClientIdSchema,
    GITHUB_CLIENT_SECRET: z.string().min(40).optional(), // GitHub client secrets are 40+ chars

    // OAuth configuration (Google)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    ALLOWED_REDIRECT_URIS: z
      .string()
      .default(
        'http://localhost:3000/api/auth/github/callback,http://localhost:3000/api/auth/google/callback'
      ),

    // NextAuth configuration
    NEXT_PUBLIC_APP_NAME: z.string().default('Contribux'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(32).optional(),

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
    ENABLE_OAUTH: z.string().pipe(z.coerce.boolean()).default('true'),

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

      // OAuth configuration validation (only in production)
      if (data.ENABLE_OAUTH) {
        const missingOAuthCredentials = []

        if (!data.GITHUB_CLIENT_ID || !data.GITHUB_CLIENT_SECRET) {
          missingOAuthCredentials.push('GitHub (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)')
        }

        // Google OAuth is optional but if one is provided, both should be provided
        if (
          (data.GOOGLE_CLIENT_ID && !data.GOOGLE_CLIENT_SECRET) ||
          (!data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET)
        ) {
          missingOAuthCredentials.push(
            'Google (Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be provided together)'
          )
        }

        if (missingOAuthCredentials.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Missing OAuth credentials in production: ${missingOAuthCredentials.join(', ')}`,
            path: ['OAUTH_CONFIGURATION'],
          })
        }
      }
    }

    // Validate rate limiting configuration (all environments)
    if (data.RATE_LIMIT_MAX > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rate limit too high, maximum recommended is 1000 requests per window',
        path: ['RATE_LIMIT_MAX'],
      })
    }

    // Validate redirect URIs format (all environments)
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

  // Note: Google OAuth credentials are optional but recommended for multi-provider support

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

  // OAuth configuration
  if (env.ENABLE_OAUTH) {
    const oauthIssues = []

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      oauthIssues.push('GitHub OAuth credentials missing')
    }

    // Validate Google OAuth configuration if provided
    if (
      (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) ||
      (!env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    ) {
      oauthIssues.push('Incomplete Google OAuth configuration (both ID and SECRET required)')
    }

    if (oauthIssues.length > 0) {
      if (env.NODE_ENV === 'production') {
        throw new Error(`OAuth configuration issues: ${oauthIssues.join(', ')}`)
      }
      console.warn(`⚠ OAuth configuration issues: ${oauthIssues.join(', ')}`)
    } else {
      const configuredProviders = ['GitHub']
      if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
        configuredProviders.push('Google')
      }
      console.log(
        `✓ OAuth configuration validation passed for providers: ${configuredProviders.join(', ')}`
      )
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
      // In test environment, provide safe defaults with fallbacks
      const testDefaults = {
        ...process.env,
        NODE_ENV: 'test',
        JWT_SECRET: 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
        DATABASE_URL:
          process.env.DATABASE_URL ||
          process.env.DATABASE_URL_TEST ||
          'postgresql://test:test@localhost:5432/testdb',
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || 'Iv1.a1b2c3d4e5f6g7h8',
        GITHUB_CLIENT_SECRET:
          process.env.GITHUB_CLIENT_SECRET ||
          'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement',
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'test-google-client-id',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000',
        ALLOWED_REDIRECT_URIS:
          process.env.ALLOWED_REDIRECT_URIS || 'http://localhost:3000/api/auth/github/callback',
      }

      try {
        return envSchema.parse(testDefaults)
      } catch (_testError) {
        // If test defaults still fail, provide minimal working config
        console.warn('Test environment validation failed, using minimal config')
        return envSchema.parse({
          NODE_ENV: 'test',
          JWT_SECRET:
            'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
          DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
          GITHUB_CLIENT_ID: 'Iv1.a1b2c3d4e5f6g7h8',
          GITHUB_CLIENT_SECRET:
            'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement',
          NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
          CORS_ORIGINS: 'http://localhost:3000',
          ALLOWED_REDIRECT_URIS: 'http://localhost:3000/api/auth/github/callback',
          // Include all required defaults for test environment
          DB_PROJECT_ID: 'test-project',
          DB_MAIN_BRANCH: 'test-main',
          DB_DEV_BRANCH: 'test-dev',
          DB_TEST_BRANCH: 'test-test',
          DB_POOL_MIN: '2',
          DB_POOL_MAX: '20',
          DB_POOL_IDLE_TIMEOUT: '10000',
          HNSW_EF_SEARCH: '200',
          VECTOR_SIMILARITY_THRESHOLD: '0.7',
          HYBRID_SEARCH_TEXT_WEIGHT: '0.3',
          HYBRID_SEARCH_VECTOR_WEIGHT: '0.7',
          PORT: '3000',
          RATE_LIMIT_MAX: '100',
          RATE_LIMIT_WINDOW: '900',
          LOG_LEVEL: 'error',
          ENABLE_AUDIT_LOGS: 'false',
          ENABLE_OAUTH: 'false',
          MAINTENANCE_MODE: 'false',
        })
      }
    }
    throw error
  }
}

// Export env only if not in validation test mode
export const env = process.env.SKIP_ENV_VALIDATION ? ({} as Env) : getValidatedEnv()

// Type inference for TypeScript
export type Env = z.infer<typeof envSchema>

// Utility functions for environment checks
export const isProduction = () => env.NODE_ENV === 'production'
export const isDevelopment = () => env.NODE_ENV === 'development'
export const isTest = () => env.NODE_ENV === 'test'

// Security utilities
export function getJwtSecret(): string {
  if (process.env.NODE_ENV === 'test') {
    return 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only'
  }

  // For non-test environments, try to get from env first, then from process.env
  try {
    return (
      env.JWT_SECRET ||
      process.env.JWT_SECRET ||
      (() => {
        throw new Error('JWT_SECRET is required')
      })()
    )
  } catch (_error) {
    // Fallback if env is not available
    if (process.env.JWT_SECRET) {
      return process.env.JWT_SECRET
    }
    throw new Error('JWT_SECRET is required')
  }
}

export function getEncryptionKey(): string {
  const envNodeEnv = process.env.NODE_ENV || 'development'

  // Try to get from env first, then from process.env
  let encryptionKey: string | undefined
  try {
    encryptionKey = env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY
  } catch (_error) {
    encryptionKey = process.env.ENCRYPTION_KEY
  }

  if (!encryptionKey) {
    if (envNodeEnv === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production')
    }
    // Generate a deterministic key for development/test
    // Return a fixed key instead of using crypto
    return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  }
  return encryptionKey
}
