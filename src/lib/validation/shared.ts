/**
 * Shared Validation Utilities
 * Common validation patterns and utilities used across the application
 */

import { z } from 'zod'

// Common validation schemas
export const EmailSchema = z.string().email('Invalid email address')
export const UUIDSchema = z.string().uuid('Invalid UUID format')
/**
 * Modern Zod 3.x Enterprise Validation Schemas
 * Implementing latest patterns for 2025 best practices
 */

// Advanced string validation with transformation and sanitization
export const AdvancedStringSchema = z
  .string()
  .transform(str => str.trim())
  .pipe(
    z
      .string()
      .min(1, 'String cannot be empty after trimming')
      .transform(str => sanitizeString(str))
      .refine(str => str.length > 0, 'String cannot be empty after sanitization')
  )

// Dynamic length validation with contextual messages
export const createDynamicStringSchema = (
  minLength: number,
  maxLength: number,
  context = 'field'
) =>
  z
    .string()
    .transform(str => str.trim())
    .pipe(
      z
        .string()
        .min(minLength, `${context} must be at least ${minLength} characters`)
        .max(maxLength, `${context} must not exceed ${maxLength} characters`)
        .transform(str => sanitizeString(str))
    )

// Enhanced email validation with domain verification
export const EnhancedEmailSchema = z
  .string()
  .transform(str => str.toLowerCase().trim())
  .pipe(
    z
      .string()
      .email('Invalid email format')
      .refine(email => {
        const domain = email.split('@')[1]
        // Validate common domains and exclude temporary email services
        const suspiciousDomains = ['10minutemail.com', 'tempmail.org', 'guerrillamail.com']
        return !suspiciousDomains.includes(domain)
      }, 'Temporary email addresses are not allowed')
      .refine(email => {
        // Ensure email length constraints
        const [local, domain] = email.split('@')
        return local.length <= 64 && domain.length <= 253
      }, 'Email address format is invalid')
  )

// Advanced password validation with security requirements
export const SecurePasswordSchema = z.string().superRefine((password, ctx) => {
  const checks = [
    { test: password.length >= 12, message: 'Password must be at least 12 characters long' },
    {
      test: /[A-Z]/.test(password),
      message: 'Password must contain at least one uppercase letter',
    },
    {
      test: /[a-z]/.test(password),
      message: 'Password must contain at least one lowercase letter',
    },
    { test: /\d/.test(password), message: 'Password must contain at least one number' },
    {
      test: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      message: 'Password must contain at least one special character',
    },
    {
      test: !/(.)\1{2,}/.test(password),
      message: 'Password cannot contain more than 2 consecutive identical characters',
    },
    {
      test: !/(?:123|abc|qwe|asd)/i.test(password),
      message: 'Password cannot contain common sequences',
    },
  ]

  checks.forEach(({ test, message }) => {
    if (!test) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: [],
      })
    }
  })
})

// Context-aware validation with environment-specific rules
export const createEnvironmentAwareSchema = <T>(
  baseSchema: z.ZodSchema<T>,
  productionRules?: z.ZodSchema<T>,
  developmentRules?: z.ZodSchema<T>
) => {
  const env = process.env.NODE_ENV

  if (env === 'production' && productionRules) {
    return baseSchema.and(productionRules)
  }
  if (env === 'development' && developmentRules) {
    return baseSchema.and(developmentRules)
  }

  return baseSchema
}

// Advanced pagination schema with intelligent defaults
export const AdvancedPaginationSchema = z
  .object({
    page: z.string().optional(),
    per_page: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
  })
  .transform(data => ({
    page: Math.max(1, Number.parseInt(data.page || '1', 10)),
    per_page: Math.min(100, Math.max(1, Number.parseInt(data.per_page || '20', 10))),
    sort: data.sort || 'created_at',
    order: data.order || ('desc' as const),
  }))
  .pipe(
    z
      .object({
        page: z.number().int().min(1),
        per_page: z.number().int().min(1).max(100),
        sort: z.string(),
        order: z.enum(['asc', 'desc']),
      })
      .transform(data => ({
        ...data,
        offset: (data.page - 1) * data.per_page,
        limit: data.per_page,
      }))
  )

// Conditional validation based on other fields
export const createConditionalSchema = <T extends Record<string, unknown>>(
  baseSchema: z.ZodSchema<T>,
  conditions: Array<{
    when: (data: T) => boolean
    then: z.ZodSchema<Partial<T>>
    message?: string
  }>
) =>
  baseSchema.superRefine((data, ctx) => {
    conditions.forEach(({ when, then, message }) => {
      if (when(data)) {
        const result = then.safeParse(data)
        if (!result.success) {
          result.error.issues.forEach(issue => {
            ctx.addIssue({
              ...issue,
              message: message || issue.message,
            })
          })
        }
      }
    })
  })

// Performance-optimized schema with lazy evaluation
export const createLazyValidationSchema = <T>(schemaFactory: () => z.ZodSchema<T>) =>
  z.lazy(() => schemaFactory())

// Schema with custom error formatting
export const createCustomErrorSchema = <T>(
  schema: z.ZodSchema<T>,
  errorFormatter: (issues: z.ZodIssue[]) => Record<string, string[]>
) =>
  schema
    .transform((data, _ctx) => {
      return data
    })
    .catch(error => {
      if (error instanceof z.ZodError) {
        const formattedErrors = errorFormatter(error.issues)
        throw new Error(JSON.stringify(formattedErrors))
      }
      throw error
    })

// Advanced API request validation schema
export const ApiRequestSchema = z
  .object({
    headers: z.record(z.string()).optional(),
    query: z.record(z.string()).optional(),
    body: z.unknown().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string(),
  })
  .superRefine((data, ctx) => {
    // Validate Content-Type for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(data.method)) {
      const contentType = data.headers?.['content-type'] || data.headers?.['Content-Type']
      if (!contentType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Content-Type header is required for POST/PUT/PATCH requests',
          path: ['headers', 'content-type'],
        })
      }
    }

    // Validate request body for non-GET requests
    if (data.method !== 'GET' && data.body === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Request body is required for non-GET requests',
        path: ['body'],
      })
    }
  })

// GitHub-specific validation schemas with enhanced patterns
export const EnhancedGitHubUsernameSchema = z
  .string()
  .transform(str => str.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(1, 'GitHub username is required')
      .max(39, 'GitHub username cannot exceed 39 characters')
      .regex(/^[a-z0-9]([a-z0-9]|-(?=[a-z0-9])){0,38}$/, 'GitHub username format is invalid')
      .refine(username => {
        // Reserved usernames
        const reserved = ['admin', 'api', 'www', 'github', 'support', 'security']
        return !reserved.includes(username)
      }, 'This username is reserved')
  )

export const GitHubRepositoryNameSchema = z
  .string()
  .transform(str => str.trim())
  .pipe(
    z
      .string()
      .min(1, 'Repository name is required')
      .max(100, 'Repository name cannot exceed 100 characters')
      .regex(
        /^[a-zA-Z0-9_.-]+$/,
        'Repository name can only contain letters, numbers, hyphens, underscores, and periods'
      )
      .refine(name => !name.startsWith('.'), 'Repository name cannot start with a period')
      .refine(name => !name.endsWith('.'), 'Repository name cannot end with a period')
      .refine(name => !name.includes('..'), 'Repository name cannot contain consecutive periods')
  )

// API response validation with metadata
export const createApiResponseSchema = <T>(dataSchema: z.ZodSchema<T>) =>
  z
    .object({
      success: z.boolean(),
      data: dataSchema.optional(),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
          details: z.record(z.unknown()).optional(),
        })
        .optional(),
      metadata: z
        .object({
          timestamp: z.string().datetime(),
          requestId: z.string().uuid(),
          version: z.string(),
          responseTime: z.number().positive(),
        })
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.success && !data.data) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Data is required when success is true',
          path: ['data'],
        })
      }

      if (!data.success && !data.error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Error is required when success is false',
          path: ['error'],
        })
      }
    })
/**
 * Enterprise-grade validation utilities for modern Zod 3.x patterns
 * Implements 2025 best practices for schema composition and reusability
 */

// Schema registry for reusable validation patterns
const validationSchemas = new Map<string, z.ZodTypeAny>()

export function registerValidationSchema<T>(name: string, schema: z.ZodSchema<T>): void {
  validationSchemas.set(name, schema)
}

export function getValidationSchema<T>(name: string): z.ZodSchema<T> | undefined {
  return validationSchemas.get(name)
}

export function composeValidationSchemas<T>(...schemaNames: string[]): z.ZodSchema<T> {
  const schemas = schemaNames.map(name => getValidationSchema(name)).filter(Boolean)
  if (schemas.length === 0) {
    throw new Error('No valid schemas found for composition')
  }

  const initialSchema = schemas[0]
  if (!initialSchema) {
    throw new Error('No initial schema available for composition')
  }
  return schemas.slice(1).reduce((acc: z.ZodTypeAny, schema) => {
    if (!acc) throw new Error('Accumulator is undefined in schema composition')
    if (!schema)
      throw new Error('Schema is undefined in composition - this should not happen after filtering')
    return acc.and(schema)
  }, initialSchema) as z.ZodSchema<T>
}

// Performance monitoring for validation
const validationMetrics = new Map<string, { count: number; totalTime: number; avgTime: number }>()

export function trackValidationPerformance<T>(schemaName: string, validationFn: () => T): T {
  const startTime = performance.now()
  try {
    const result = validationFn()
    const endTime = performance.now()
    updateValidationMetrics(schemaName, endTime - startTime)
    return result
  } catch (error) {
    const endTime = performance.now()
    updateValidationMetrics(schemaName, endTime - startTime, true)
    throw error
  }
}

function updateValidationMetrics(schemaName: string, duration: number, _isError = false): void {
  const current = validationMetrics.get(schemaName) || {
    count: 0,
    totalTime: 0,
    avgTime: 0,
  }
  current.count++
  current.totalTime += duration
  current.avgTime = current.totalTime / current.count
  validationMetrics.set(schemaName, current)

  // Log slow validations in development
  if (process.env.NODE_ENV === 'development' && duration > 10) {
    // Would log slow validation performance in development - console removed by linter
    void { duration, schemaName }
  }
}

export function getValidationMetrics(): Record<
  string,
  { count: number; totalTime: number; avgTime: number }
> {
  return Object.fromEntries(validationMetrics.entries())
}

export function resetValidationMetrics(): void {
  validationMetrics.clear()
}

// Advanced error aggregation and reporting
export class ValidationErrorAggregator {
  private errors: Array<{
    path: string
    message: string
    code: string
    severity: 'error' | 'warning'
  }> = []

  addError(
    path: string,
    message: string,
    code = 'VALIDATION_ERROR',
    severity: 'error' | 'warning' = 'error'
  ): void {
    this.errors.push({ path, message, code, severity })
  }

  hasErrors(): boolean {
    return this.errors.some(e => e.severity === 'error')
  }

  hasWarnings(): boolean {
    return this.errors.some(e => e.severity === 'warning')
  }

  getErrors(): Array<{
    path: string
    message: string
    code: string
    severity: 'error' | 'warning'
  }> {
    return [...this.errors]
  }

  getFormattedErrors(): Record<string, string[]> {
    const formatted: Record<string, string[]> = {}
    for (const error of this.errors) {
      if (!formatted[error.path]) {
        formatted[error.path] = []
      }
      formatted[error.path].push(error.message)
    }
    return formatted
  }

  clear(): void {
    this.errors = []
  }

  toZodError(): z.ZodError {
    const issues: z.ZodIssue[] = this.errors.map(error => ({
      code: z.ZodIssueCode.custom,
      path: error.path.split('.').filter(Boolean),
      message: error.message,
    }))

    return new z.ZodError(issues)
  }
}

// Memoized validation for expensive schemas
export function createMemoizedValidator<T>(
  schema: z.ZodSchema<T>,
  keyExtractor: (input: unknown) => string,
  maxCacheSize = 1000
) {
  const cache = new Map<string, { result: T; timestamp: number }>()
  const cacheTimeout = 5 * 60 * 1000 // 5 minutes

  return (input: unknown): T => {
    const key = keyExtractor(input)
    const cached = cache.get(key)

    if (cached && Date.now() - cached.timestamp < cacheTimeout) {
      return cached.result
    }

    const result = schema.parse(input)

    // Manage cache size
    if (cache.size >= maxCacheSize) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) {
        cache.delete(oldestKey)
      }
    }

    cache.set(key, { result, timestamp: Date.now() })
    return result
  }
}

// Validation with retry mechanism for transient failures
export async function validateWithRetry<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  maxRetries = 3,
  retryDelay = 100
): Promise<T> {
  let lastError: z.ZodError | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return schema.parse(input)
    } catch (error) {
      if (error instanceof z.ZodError) {
        lastError = error
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * 2 ** attempt))
        }
      } else {
        throw error
      }
    }
  }

  throw lastError
}

// Batch validation for multiple inputs
export function validateBatch<T>(
  schema: z.ZodSchema<T>,
  inputs: unknown[],
  options: {
    failFast?: boolean
    collectErrors?: boolean
  } = {}
): {
  valid: T[]
  invalid: Array<{ input: unknown; error: z.ZodError; index: number }>
  hasErrors: boolean
} {
  const valid: T[] = []
  const invalid: Array<{ input: unknown; error: z.ZodError; index: number }> = []

  for (let i = 0; i < inputs.length; i++) {
    try {
      const result = schema.parse(inputs[i])
      valid.push(result)
    } catch (error) {
      if (error instanceof z.ZodError) {
        invalid.push({ input: inputs[i], error, index: i })
        if (options.failFast) {
          break
        }
      } else {
        throw error
      }
    }
  }

  return {
    valid,
    invalid,
    hasErrors: invalid.length > 0,
  }
}

// Schema version management for API evolution
export class SchemaVersionManager {
  private versions = new Map<string, Map<string, z.ZodTypeAny>>()

  registerVersion<T>(schemaName: string, version: string, schema: z.ZodSchema<T>): void {
    if (!this.versions.has(schemaName)) {
      this.versions.set(schemaName, new Map())
    }
    this.versions.get(schemaName)?.set(version, schema)
  }

  getSchema<T>(schemaName: string, version: string): z.ZodSchema<T> | undefined {
    return this.versions.get(schemaName)?.get(version)
  }

  getLatestSchema<T>(schemaName: string): z.ZodSchema<T> | undefined {
    const schemas = this.versions.get(schemaName)
    if (!schemas || schemas.size === 0) return undefined

    const versions = Array.from(schemas.keys()).sort((a, b) => {
      // Simple semantic version comparison
      const aParts = a.split('.').map(Number)
      const bParts = b.split('.').map(Number)

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0
        const bPart = bParts[i] || 0
        if (aPart !== bPart) return bPart - aPart
      }
      return 0
    })

    return schemas.get(versions[0])
  }

  validateWithFallback<T>(
    schemaName: string,
    requestedVersion: string,
    input: unknown
  ): { data: T; version: string } {
    // Try requested version first
    const requestedSchema = this.getSchema<T>(schemaName, requestedVersion)
    if (requestedSchema) {
      try {
        return { data: requestedSchema.parse(input), version: requestedVersion }
      } catch {
        // Fall through to try other versions
      }
    }

    // Try latest version
    const latestSchema = this.getLatestSchema<T>(schemaName)
    if (latestSchema) {
      try {
        const latestVersion = Array.from(this.versions.get(schemaName)?.keys() || []).sort((a, b) =>
          b.localeCompare(a)
        )[0]
        return { data: latestSchema.parse(input), version: latestVersion }
      } catch {
        // Continue to try all versions
      }
    }

    // Try all versions as last resort
    const allSchemas = this.versions.get(schemaName)
    if (allSchemas) {
      for (const [version, schema] of allSchemas) {
        try {
          return { data: schema.parse(input), version }
        } catch {
          // Ignore validation errors, continue to next version
        }
      }
    }

    throw new Error(`No compatible schema version found for ${schemaName}`)
  }

  getVersions(): Map<string, Map<string, z.ZodTypeAny>> {
    return this.versions
  }
}
export const URLSchema = z.string().url('Invalid URL format')
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

// Common field validation
export const NonEmptyStringSchema = z.string().min(1, 'Field cannot be empty')
export const PositiveNumberSchema = z.number().positive('Must be a positive number')
export const IPAddressSchema = z.string().ip('Invalid IP address')

// GitHub-specific validation
export const GitHubUsernameSchema = z
  .string()
  .min(1, 'GitHub username cannot be empty')
  .max(39, 'GitHub username too long')
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/, 'Invalid GitHub username format')

export const GitHubRepoNameSchema = z
  .string()
  .min(1, 'Repository name cannot be empty')
  .max(100, 'Repository name too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format')

// Date validation helpers
export const PastDateSchema = z.date().refine(date => date < new Date(), 'Date must be in the past')
export const FutureDateSchema = z
  .date()
  .refine(date => date > new Date(), 'Date must be in the future')

// Pagination validation
export const PaginationSchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(10),
})

// Security validation
export const SafeStringSchema = z
  .string()
  .regex(/^[a-zA-Z0-9\s\-_.@]+$/, 'Contains unsafe characters')
  .max(255, 'String too long')

export const JWTTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/, 'Invalid JWT format')

// Utility functions
export function validateEmail(email: string): boolean {
  return EmailSchema.safeParse(email).success
}

export function validateUUID(uuid: string): boolean {
  return UUIDSchema.safeParse(uuid).success
}

export function validateGitHubUsername(username: string): boolean {
  return GitHubUsernameSchema.safeParse(username).success
}

export function sanitizeString(input: string): string {
  return input.replace(/[<>'"&]/g, '').trim()
}

export function createOptionalSchema<T extends z.ZodTypeAny>(schema: T) {
  return schema.optional().nullable()
}

export function createArraySchema<T extends z.ZodTypeAny>(schema: T, minItems = 0, maxItems = 100) {
  return z.array(schema).min(minItems).max(maxItems)
}

// Error handling utilities
export function formatValidationErrors(errors: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {}

  for (const error of errors.errors) {
    const path = error.path.join('.')
    formatted[path] = error.message
  }

  return formatted
}

export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    const result = schema.safeParse(data)
    if (!result.success) {
      throw new Error(`Validation failed: ${JSON.stringify(formatValidationErrors(result.error))}`)
    }
    return result.data
  }
}

/**
 * Advanced validation middleware with performance caching and custom error handling
 * Modern Zod 3.x enterprise pattern
 */
export function createAdvancedValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  options: {
    cache?: boolean
    errorTransform?: (error: z.ZodError) => Error
    onValidationSuccess?: (data: T) => void
    onValidationError?: (error: z.ZodError) => void
  } = {}
) {
  const schemaCache = new Map<string, z.ZodSchema<T>>()

  return (data: unknown, cacheKey?: string): T => {
    // Use cached schema for performance if enabled
    const cachedSchema =
      options.cache && cacheKey && schemaCache.has(cacheKey) ? schemaCache.get(cacheKey) : null
    const validationSchema = cachedSchema || schema

    if (options.cache && cacheKey && !schemaCache.has(cacheKey)) {
      schemaCache.set(cacheKey, schema)
    }

    const result = validationSchema.safeParse(data)

    if (!result.success) {
      options.onValidationError?.(result.error)
      const customError = options.errorTransform
        ? options.errorTransform(result.error)
        : new Error(`Validation failed: ${JSON.stringify(formatValidationErrors(result.error))}`)
      throw customError
    }

    options.onValidationSuccess?.(result.data)
    return result.data
  }
}

/**
 * Async validation middleware for complex validation scenarios
 * Supports promise-based validation with proper error handling
 */
export function createAsyncValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  asyncValidators: Array<(data: T) => Promise<boolean | string>> = []
) {
  return async (data: unknown): Promise<T> => {
    // First, run synchronous validation
    const result = schema.safeParse(data)
    if (!result.success) {
      throw new Error(`Validation failed: ${JSON.stringify(formatValidationErrors(result.error))}`)
    }

    // Then run async validators
    const validatedData = result.data
    const asyncResults = await Promise.allSettled(
      asyncValidators.map(validator => validator(validatedData))
    )

    const failures = asyncResults
      .map((result, index) => ({ result, index }))
      .filter(
        ({ result }) =>
          result.status === 'rejected' || result.value === false || typeof result.value === 'string'
      )
      .map(({ result, index }) => {
        if (result.status === 'rejected') {
          return `Async validator ${index} failed: ${result.reason}`
        }
        if (result.value === false) {
          return `Async validator ${index} returned false`
        }
        return result.value as string
      })

    if (failures.length > 0) {
      throw new Error(`Async validation failed: ${failures.join(', ')}`)
    }

    return validatedData
  }
}
