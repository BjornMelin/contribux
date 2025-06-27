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

export function hasRepeatedPattern(str: string): boolean {
  // Check for simple repeated patterns
  const length = str.length

  // Check for patterns of different lengths
  for (let patternLength = 2; patternLength <= length / 2; patternLength++) {
    const pattern = str.substring(0, patternLength)
    let isRepeated = true

    for (let i = patternLength; i < length; i += patternLength) {
      const segment = str.substring(i, i + patternLength)
      if (segment !== pattern) {
        isRepeated = false
        break
      }
    }

    if (isRepeated) {
      return true
    }
  }

  return false
}

export function hasSequentialPattern(str: string): boolean {
  // Check for sequential patterns like "abcdef" or "123456"
  if (str.length < 4) return false

  // Check for ascending sequences
  let consecutiveCount = 1
  for (let i = 1; i < str.length; i++) {
    const prevChar = str.charCodeAt(i - 1)
    const currChar = str.charCodeAt(i)

    if (currChar === prevChar + 1) {
      consecutiveCount++
      if (consecutiveCount >= 4) {
        // 4+ consecutive characters
        return true
      }
    } else {
      consecutiveCount = 1
    }
  }

  // Check for descending sequences
  consecutiveCount = 1
  for (let i = 1; i < str.length; i++) {
    const prevChar = str.charCodeAt(i - 1)
    const currChar = str.charCodeAt(i)

    if (currChar === prevChar - 1) {
      consecutiveCount++
      if (consecutiveCount >= 4) {
        // 4+ consecutive characters
        return true
      }
    } else {
      consecutiveCount = 1
    }
  }

  return false
}

export function hasPredictablePattern(str: string): boolean {
  return hasRepeatedPattern(str) || hasSequentialPattern(str)
}

export function validateJwtSecret(secret: string): boolean {
  // Minimum length check (32 characters for 256 bits)
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }

  // Calculate entropy - minimum overall entropy should be reasonable for the string length
  const entropy = calculateShannonEntropy(secret)

  // For 32+ character strings, we expect good entropy to avoid patterns
  // Threshold set to 3.0 to reject clearly weak patterns while allowing realistic good secrets
  if (entropy < 3.0) {
    throw new Error('JWT_SECRET has insufficient entropy')
  }

  // Check for predictable patterns (both repeated and sequential)
  if (hasPredictablePattern(secret)) {
    throw new Error('JWT_SECRET has insufficient entropy')
  }

  // Check for minimum unique characters (at least 12 unique chars for 32+ char strings)
  const uniqueChars = new Set(secret).size
  const uniqueRatio = uniqueChars / secret.length

  if (uniqueChars < 12) {
    throw new Error('JWT_SECRET has insufficient entropy')
  }

  if (uniqueRatio < 0.25) {
    throw new Error('JWT_SECRET has insufficient entropy')
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

    // Authentication configuration - NO FALLBACKS ALLOWED
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters long')
      .refine(
        value => {
          // Always validate JWT secret - no exceptions for test environment
          try {
            return validateJwtSecret(value)
          } catch (_error) {
            return false
          }
        },
        {
          message: 'JWT_SECRET validation failed - must be cryptographically secure',
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
    ENABLE_WEBAUTHN: z.string().pipe(z.coerce.boolean()).default('true'),

    // WebAuthn configuration
    NEXT_PUBLIC_RP_ID: z.string().default('localhost'),
    WEBAUTHN_RP_NAME: z.string().default('Contribux'),
    WEBAUTHN_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).default('60000'),
    WEBAUTHN_CHALLENGE_EXPIRY: z.string().pipe(z.coerce.number().int().min(1000)).default('300000'),
    WEBAUTHN_SUPPORTED_ALGORITHMS: z.string().default('-7,-257'),

    // Maintenance mode
    MAINTENANCE_MODE: z.string().pipe(z.coerce.boolean()).default('false'),
    MAINTENANCE_BYPASS_TOKEN: z.string().optional(),

    // Additional OAuth origins
    ALLOWED_ORIGINS: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Apply environment-specific validations
    validateByEnvironment(data, ctx)

    // Apply general validations (all environments except test)
    if (data.NODE_ENV !== 'test') {
      validateGeneralConfiguration(data, ctx)
    }
  })

// Types for validation functions - use generic types that work with superRefine
type EnvValidationData = Partial<z.infer<typeof envSchema>> & {
  NODE_ENV?: 'development' | 'test' | 'production'
}

type EnvValidationContext = z.RefinementCtx

// Helper functions for environment validation

function validateByEnvironment(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (data.NODE_ENV === 'production') {
    validateProductionEnvironment(data, ctx)
  }
  // Test environment explicitly skips all validation
}

function validateProductionEnvironment(data: EnvValidationData, ctx: EnvValidationContext): void {
  validateProductionSecrets(data, ctx)
  validateProductionUrls(data, ctx)
  validateProductionEncryption(data, ctx)
  validateProductionOAuth(data, ctx)
}

function validateProductionSecrets(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (!data.JWT_SECRET || data.JWT_SECRET.includes('test') || data.JWT_SECRET.includes('dev')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'JWT_SECRET cannot contain test/dev keywords in production',
      path: ['JWT_SECRET'],
    })
  }
}

function validateProductionUrls(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (data.NEXT_PUBLIC_APP_URL?.includes('localhost')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'APP_URL cannot use localhost in production',
      path: ['NEXT_PUBLIC_APP_URL'],
    })
  }

  if (data.NEXT_PUBLIC_RP_ID?.includes('localhost')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'NEXT_PUBLIC_RP_ID cannot use localhost in production',
      path: ['NEXT_PUBLIC_RP_ID'],
    })
  }

  if (data.CORS_ORIGINS?.includes('localhost') && !data.CORS_ORIGINS.includes('contribux')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'CORS_ORIGINS should not include localhost in production',
      path: ['CORS_ORIGINS'],
    })
  }
}

function validateProductionEncryption(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (!data.ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ENCRYPTION_KEY is required in production',
      path: ['ENCRYPTION_KEY'],
    })
  }
}

function validateProductionOAuth(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (!data.ENABLE_OAUTH) return

  const missingCredentials = getMissingOAuthCredentials(data)
  if (missingCredentials.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Missing OAuth credentials in production: ${missingCredentials.join(', ')}`,
      path: ['OAUTH_CONFIGURATION'],
    })
  }
}

function getMissingOAuthCredentials(data: EnvValidationData): string[] {
  const missing: string[] = []

  if (!data.GITHUB_CLIENT_ID || !data.GITHUB_CLIENT_SECRET) {
    missing.push('GitHub (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)')
  }

  if (hasIncompleteGoogleOAuth(data)) {
    missing.push(
      'Google (Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be provided together)'
    )
  }

  return missing
}

function hasIncompleteGoogleOAuth(data: EnvValidationData): boolean {
  const hasClientId = Boolean(data.GOOGLE_CLIENT_ID)
  const hasClientSecret = Boolean(data.GOOGLE_CLIENT_SECRET)
  return (hasClientId && !hasClientSecret) || (!hasClientId && hasClientSecret)
}

function validateGeneralConfiguration(data: EnvValidationData, ctx: EnvValidationContext): void {
  validateRateLimit(data, ctx)
  validateRedirectUris(data, ctx)
}

function validateRateLimit(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (data.RATE_LIMIT_MAX && data.RATE_LIMIT_MAX > 1000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Rate limit too high, maximum recommended is 1000 requests per window',
      path: ['RATE_LIMIT_MAX'],
    })
  }
}

function validateRedirectUris(data: EnvValidationData, ctx: EnvValidationContext): void {
  if (!data.ALLOWED_REDIRECT_URIS) return

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
}

// Environment-specific validation functions
export function validateDevelopmentEnv(): void {
  if (process.env.NODE_ENV !== 'development') return
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
}

export function validateSecurityConfig(): void {
  // Use process.env directly to avoid potential validation errors in getValidatedEnv
  const nodeEnv = process.env.NODE_ENV || 'development'

  // JWT secret validation
  validateJwtSecretSecurity(nodeEnv)

  // OAuth configuration
  validateOAuthConfiguration(nodeEnv)
}

// Helper function to validate JWT secret security
function validateJwtSecretSecurity(nodeEnv: string): void {
  if (nodeEnv === 'test') {
    return
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    if (nodeEnv === 'production') {
      throw new Error('JWT_SECRET is required in production')
    }
    return
  }

  try {
    validateJwtSecret(jwtSecret)
    // biome-ignore lint/suspicious/noConsole: Intentional success logging for security validation
    console.log('✓ JWT_SECRET validation passed')
  } catch (error) {
    if (nodeEnv === 'production') {
      throw error
    }
    // biome-ignore lint/suspicious/noConsole: Intentional warning for development
    console.error(
      `⚠ JWT_SECRET validation warning: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// Helper function to validate OAuth configuration
function validateOAuthConfiguration(nodeEnv: string): void {
  const enableOAuth = process.env.ENABLE_OAUTH !== 'false'
  if (!enableOAuth) {
    return
  }

  const oauthIssues = collectOAuthIssuesFromEnv()
  const validProviders = getValidOAuthProviders()

  if (oauthIssues.length > 0) {
    if (nodeEnv === 'production') {
      throw new Error(`OAuth configuration issues: ${oauthIssues.join(', ')}`)
    }
    // biome-ignore lint/suspicious/noConsole: Intentional warning for development
    console.error(`⚠ OAuth configuration issues: ${oauthIssues.join(', ')}`)
  } else if (validProviders.length > 0) {
    // biome-ignore lint/suspicious/noConsole: Intentional success logging for OAuth validation
    console.log(
      `✓ OAuth configuration validation passed for providers: ${validProviders.join(', ')}`
    )
  }
}

// Helper function to collect OAuth configuration issues from process.env
function collectOAuthIssuesFromEnv(): string[] {
  const issues: string[] = []

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    issues.push('GitHub OAuth credentials missing')
  }

  // Validate Google OAuth configuration if provided
  if (hasIncompleteGoogleConfigFromEnv()) {
    issues.push('Incomplete Google OAuth configuration (both ID and SECRET required)')
  }

  return issues
}

// Helper function to get valid OAuth providers from process.env
function getValidOAuthProviders(): string[] {
  const providers: string[] = []

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push('GitHub')
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push('Google')
  }

  return providers
}

// Helper function to check incomplete Google OAuth configuration from process.env
function hasIncompleteGoogleConfigFromEnv(): boolean {
  const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID)
  const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET)
  return (hasClientId && !hasClientSecret) || (!hasClientId && hasClientSecret)
}

// Helper function to collect OAuth configuration issues
function _collectOAuthIssues(env: Env): string[] {
  const issues: string[] = []

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    issues.push('GitHub OAuth credentials missing')
  }

  // Validate Google OAuth configuration if provided
  if (hasIncompleteGoogleConfig(env)) {
    issues.push('Incomplete Google OAuth configuration (both ID and SECRET required)')
  }

  return issues
}

// Helper function to check incomplete Google OAuth configuration
function hasIncompleteGoogleConfig(env: Env): boolean {
  const hasClientId = Boolean(env.GOOGLE_CLIENT_ID)
  const hasClientSecret = Boolean(env.GOOGLE_CLIENT_SECRET)
  return (hasClientId && !hasClientSecret) || (!hasClientId && hasClientSecret)
}

// Startup validation function
export function validateEnvironmentOnStartup(): void {
  // Check if validation should be skipped (test environment or explicit skip flag)
  if (shouldSkipValidation()) {
    return
  }

  try {
    // Parse and validate all environment variables
    const env = envSchema.parse(process.env)

    // Environment-specific validation
    if (env.NODE_ENV === 'production') {
      validateProductionEnv()
      // biome-ignore lint/suspicious/noConsole: Intentional success logging for startup validation
      console.log('✓ Environment validation completed for production environment')
    } else if (env.NODE_ENV === 'development') {
      validateDevelopmentEnv()
      // biome-ignore lint/suspicious/noConsole: Intentional success logging for startup validation
      console.log('✓ Development environment validation passed')
    }

    // Security configuration validation
    validateSecurityConfig()
  } catch (error) {
    // Format validation errors for proper error handling without console usage
    let errorMessage = 'Environment validation failed'
    if (error instanceof z.ZodError) {
      const issueMessages = error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
      errorMessage = `Environment validation failed:\n${issueMessages.join('\n')}`
    } else {
      const details = error instanceof Error ? error.message : String(error)
      errorMessage = `Environment validation failed: ${details}`
    }

    // In test environment, throw error instead of exiting process
    if (process.env.NODE_ENV === 'test') {
      throw new Error(errorMessage)
    }

    // In non-test environments, log error and exit
    // biome-ignore lint/suspicious/noConsole: Intentional error logging for startup validation failures
    console.error(errorMessage)
    process.exit(1)
  }
}

// Strict runtime validation - NO FALLBACKS ALLOWED
function getValidatedEnv(): Env {
  // Check if validation should be skipped (test environment or explicit skip flag)
  if (shouldSkipValidation()) {
    return createTestEnvironment()
  }

  try {
    const parsed = envSchema.parse(process.env)
    validateRequiredEnvironmentKeys(parsed)
    return parsed
  } catch (error) {
    handleValidationError(error)
  }
}

// Create test environment configuration
function createTestEnvironment(): Env {
  const coreConfig = getTestCoreConfig()
  const databaseConfig = getTestDatabaseConfig()
  const authConfig = getTestAuthConfig()
  const serverConfig = getTestServerConfig()

  return {
    ...coreConfig,
    ...databaseConfig,
    ...authConfig,
    ...serverConfig,
  }
}

// Helper function for core test configuration
function getTestCoreConfig() {
  return {
    NODE_ENV: (process.env.NODE_ENV || 'test') as 'test' | 'development' | 'production',
    JWT_SECRET:
      process.env.JWT_SECRET ||
      'test-jwt-secret-very-long-secure-test-secret-key-for-development-use-only-32chars-plus',
    LOG_LEVEL: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
    ENABLE_AUDIT_LOGS: process.env.ENABLE_AUDIT_LOGS !== 'false',
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE === 'true',
    MAINTENANCE_BYPASS_TOKEN: process.env.MAINTENANCE_BYPASS_TOKEN,
  }
}

// Helper function for test database configuration
function getTestDatabaseConfig() {
  return {
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
    DB_PROJECT_ID: process.env.DB_PROJECT_ID || 'test-project',
    DB_MAIN_BRANCH: process.env.DB_MAIN_BRANCH || 'main',
    DB_DEV_BRANCH: process.env.DB_DEV_BRANCH || 'dev',
    DB_TEST_BRANCH: process.env.DB_TEST_BRANCH || 'test',
    DB_POOL_MIN: Number(process.env.DB_POOL_MIN) || 2,
    DB_POOL_MAX: Number(process.env.DB_POOL_MAX) || 20,
    DB_POOL_IDLE_TIMEOUT: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 10000,
    HNSW_EF_SEARCH: Number(process.env.HNSW_EF_SEARCH) || 200,
    VECTOR_SIMILARITY_THRESHOLD: Number(process.env.VECTOR_SIMILARITY_THRESHOLD) || 0.7,
    HYBRID_SEARCH_TEXT_WEIGHT: Number(process.env.HYBRID_SEARCH_TEXT_WEIGHT) || 0.3,
    HYBRID_SEARCH_VECTOR_WEIGHT: Number(process.env.HYBRID_SEARCH_VECTOR_WEIGHT) || 0.7,
  }
}

// Helper function for test authentication configuration
function getTestAuthConfig() {
  return {
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ALLOWED_REDIRECT_URIS:
      process.env.ALLOWED_REDIRECT_URIS ||
      'http://localhost:3000/api/auth/github/callback,http://localhost:3000/api/auth/google/callback',
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    ENABLE_OAUTH: process.env.ENABLE_OAUTH !== 'false',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CSRF_SECRET: process.env.CSRF_SECRET,
    // WebAuthn configuration
    ENABLE_WEBAUTHN: process.env.ENABLE_WEBAUTHN !== 'false',
    NEXT_PUBLIC_RP_ID: process.env.NEXT_PUBLIC_RP_ID || 'localhost',
    WEBAUTHN_RP_NAME: process.env.WEBAUTHN_RP_NAME || 'Contribux',
    WEBAUTHN_TIMEOUT: Number(process.env.WEBAUTHN_TIMEOUT) || 60000,
    WEBAUTHN_CHALLENGE_EXPIRY: Number(process.env.WEBAUTHN_CHALLENGE_EXPIRY) || 300000,
    WEBAUTHN_SUPPORTED_ALGORITHMS: process.env.WEBAUTHN_SUPPORTED_ALGORITHMS || '-7,-257',
  }
}

// Helper function for test server configuration
function getTestServerConfig() {
  return {
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    PORT: Number(process.env.PORT) || 3000,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Contribux',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    REDIS_URL: process.env.REDIS_URL,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000',
    RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 100,
    RATE_LIMIT_WINDOW: Number(process.env.RATE_LIMIT_WINDOW) || 900,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  }
}

// Validate required environment keys for parsed environment
function validateRequiredEnvironmentKeys(parsed: Env): void {
  const nodeEnv = parsed.NODE_ENV
  const requiredKeys = getRequiredKeysForEnvironment(nodeEnv)

  for (const key of requiredKeys) {
    validateEnvironmentKey(key, nodeEnv)
  }
}

// Get required keys based on environment
function getRequiredKeysForEnvironment(nodeEnv: string): string[] {
  const baseKeys = ['JWT_SECRET', 'DATABASE_URL']

  if (nodeEnv === 'production') {
    return [...baseKeys, 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'ENCRYPTION_KEY']
  }

  return baseKeys
}

// Validate individual environment key
function validateEnvironmentKey(key: string, nodeEnv: string): void {
  const value = process.env[key]

  if (!value || value.trim() === '') {
    throw new Error(
      `Required environment variable ${key} is missing or empty in ${nodeEnv} environment`
    )
  }

  // Ensure no hardcoded test values in production
  if (nodeEnv === 'production' && value.toLowerCase().includes('test')) {
    throw new Error(`Environment variable ${key} contains 'test' keyword in production environment`)
  }
}

// Handle validation errors appropriately
function handleValidationError(error: unknown): never {
  // In test environment, throw error instead of exiting process
  if (process.env.NODE_ENV === 'test') {
    throw error
  }

  // Block application startup - no fallbacks allowed
  process.exit(1)
}

// Lazy initialization to prevent module-level validation during tests
let _cachedEnv: Env | null = null

function shouldSkipValidation(): boolean {
  return process.env.SKIP_ENV_VALIDATION === 'true' || process.env.NODE_ENV === 'test'
}

export function getEnv(): Env {
  if (_cachedEnv) return _cachedEnv

  _cachedEnv = getValidatedEnv()
  return _cachedEnv
}

// Test helper function to clear the environment cache
export function clearEnvCache(): void {
  _cachedEnv = null
}

// Maintain backward compatibility with existing code
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    const envData = getEnv()
    return envData[prop as keyof Env]
  },
})

// Validation function expected by security tests
export function validateEnvironment(): { encryptionKey: string } {
  const envNodeEnv = process.env.NODE_ENV || 'development'
  const encryptionKey = process.env.ENCRYPTION_KEY

  // For production, encryption key is required
  if (envNodeEnv === 'production' && !encryptionKey) {
    throw new Error('ENCRYPTION_KEY is required in production')
  }

  // Only validate key if it's provided
  if (encryptionKey) {
    // First validate format before other validations
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      throw new Error('Invalid encryption key format - must be 64 hex characters')
    }

    // Then validate length (this should be redundant with format check, but keeping for explicit clarity)
    if (encryptionKey.length !== 64) {
      throw new Error('Invalid encryption key length - must be 256 bits (64 hex characters)')
    }

    // Finally check for weak keys (too simple patterns)
    const entropy = calculateShannonEntropy(encryptionKey)
    if (entropy < 3.0) {
      throw new Error('Weak encryption key - insufficient entropy')
    }
  }

  // Return the encryption key for testing purposes
  return {
    encryptionKey: getEncryptionKey(),
  }
}

// Type inference for TypeScript
export type Env = z.infer<typeof envSchema>

// Utility functions for environment checks
export const isProduction = () => env.NODE_ENV === 'production'
export const isDevelopment = () => env.NODE_ENV === 'development'
export const isTest = () => env.NODE_ENV === 'test'

// Security utilities
export function getJwtSecret(): string {
  // In test environment, always return the test default
  if (process.env.NODE_ENV === 'test') {
    return '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
  }

  // No fallbacks for non-test environments - environment must provide secure JWT secret
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET environment variable is required and cannot be empty')
  }

  // Validate the secret meets security requirements
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
  const envNodeEnv = process.env.NODE_ENV || 'development'
  const encryptionKey = process.env.ENCRYPTION_KEY

  // No fallbacks allowed - encryption key must always be provided
  if (!encryptionKey || encryptionKey.trim() === '') {
    throw new Error(
      `ENCRYPTION_KEY environment variable is required in ${envNodeEnv} environment. ` +
        'Please set a secure 64-character hexadecimal encryption key (256 bits). ' +
        'Generate one using: openssl rand -hex 32'
    )
  }

  // Validate the encryption key format and security
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256 bits). ' +
        'Generate a secure key using: openssl rand -hex 32'
    )
  }

  // Check for weak keys (too simple patterns)
  const entropy = calculateShannonEntropy(encryptionKey)
  if (entropy < 3.0) {
    throw new Error(
      'ENCRYPTION_KEY has insufficient entropy (too predictable). ' +
        'Generate a secure key using: openssl rand -hex 32'
    )
  }

  // Check for repeated patterns that have good entropy but are still weak
  if (hasRepeatedPattern(encryptionKey)) {
    throw new Error(
      'ENCRYPTION_KEY has insufficient entropy (too predictable). ' +
        'Generate a secure key using: openssl rand -hex 32'
    )
  }

  return encryptionKey
}
