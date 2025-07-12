/**
 * Enterprise Zod 3.x Validation Schemas
 * Modern 2025 patterns for contribux platform
 *
 * Features:
 * - Advanced error handling with custom messages
 * - Performance optimization with caching
 * - Security-first validation patterns
 * - Comprehensive type safety
 * - Business logic validation
 */

import { z } from 'zod'
import {
  composeValidationSchemas,
  createMemoizedValidator,
  getValidationMetrics,
  getValidationSchema,
  registerValidationSchema,
  resetValidationMetrics,
  SchemaVersionManager,
  trackValidationPerformance,
  ValidationErrorAggregator,
} from './shared'

// Initialize enterprise validation components
const versionManager = new SchemaVersionManager()

/**
 * SECURITY-FIRST INPUT VALIDATION
 * Implements OWASP validation best practices
 */

// Advanced XSS protection schema
export const XSSProtectedStringSchema = z
  .string()
  .transform(str => str.trim())
  .pipe(
    z
      .string()
      .refine(str => {
        // Detect potential XSS patterns
        const xssPatterns = [
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /<iframe[^>]*>.*?<\/iframe>/gi,
          /data:text\/html/gi,
          /vbscript:/gi,
        ]
        return !xssPatterns.some(pattern => pattern.test(str))
      }, 'Input contains potentially malicious content')
      .transform(str => {
        // Basic HTML entity encoding for display safety
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
      })
  )

// SQL injection protection schema
export const SQLInjectionProtectedSchema = z.string().refine(str => {
  // Detect potential SQL injection patterns
  const sqlPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(--|\/\*|\*\/|;|'|"|`)/gi,
    /(\bor\b|\band\b).*?[=<>]/gi,
  ]
  return !sqlPatterns.some(pattern => pattern.test(str))
}, 'Input contains potentially malicious SQL patterns')

// Path traversal protection schema
export const PathTraversalProtectedSchema = z.string().refine(str => {
  const traversalPatterns = [/\.\./g, /~\//g, /\/\.\./g, /\\\.\./g, /%2e%2e/gi, /%2f/gi, /%5c/gi]
  return !traversalPatterns.some(pattern => pattern.test(str))
}, 'Path contains potentially dangerous traversal patterns')

/**
 * BUSINESS DOMAIN SCHEMAS
 * Enterprise validation for core business entities
 */

// GitHub Integration Schemas
export const GitHubRepositorySchema = z
  .object({
    id: z.number().int().positive(),
    node_id: z.string().min(1),
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid repository name format'),
    full_name: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid full repository name format'),
    owner: z.object({
      login: z.string().min(1).max(39),
      id: z.number().int().positive(),
      type: z.enum(['User', 'Organization']),
      avatar_url: z.string().url(),
    }),
    description: z.string().max(500).nullable(),
    html_url: z.string().url(),
    clone_url: z.string().url(),
    ssh_url: z.string().regex(/^git@github\.com:[^/]+\/[^/]+\.git$/, 'Invalid SSH URL format'),
    default_branch: z.string().min(1).max(255).default('main'),
    language: z.string().max(50).nullable(),
    languages_url: z.string().url(),
    topics: z.array(z.string().max(50)).max(20).default([]),
    visibility: z.enum(['public', 'private', 'internal']).default('public'),
    archived: z.boolean().default(false),
    disabled: z.boolean().default(false),
    fork: z.boolean().default(false),
    forks_count: z.number().int().min(0),
    stargazers_count: z.number().int().min(0),
    watchers_count: z.number().int().min(0),
    open_issues_count: z.number().int().min(0),
    size: z.number().int().min(0),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    pushed_at: z.string().datetime().nullable(),
    license: z
      .object({
        key: z.string(),
        name: z.string(),
        spdx_id: z.string().nullable(),
      })
      .nullable(),
  })
  .superRefine((data, ctx) => {
    // Business logic validation
    if (data.archived && data.open_issues_count > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Archived repositories should not have open issues',
        path: ['archived'],
      })
    }

    if (data.fork && data.forks_count > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fork repositories cannot have their own forks in this context',
        path: ['fork'],
      })
    }

    // Security validation
    if (data.visibility === 'private' && !data.owner) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Private repositories must have owner information',
        path: ['owner'],
      })
    }
  })

// Enhanced Issue Schema with AI Analysis
export const GitHubIssueSchema = z
  .object({
    id: z.number().int().positive(),
    node_id: z.string().min(1),
    number: z.number().int().positive(),
    title: XSSProtectedStringSchema.pipe(z.string().min(1).max(255)),
    body: XSSProtectedStringSchema.pipe(z.string().max(65536)).nullable(),
    user: z.object({
      login: z.string().min(1).max(39),
      id: z.number().int().positive(),
      type: z.enum(['User', 'Bot']),
      avatar_url: z.string().url(),
    }),
    labels: z
      .array(
        z.object({
          id: z.number().int().positive(),
          name: z.string().min(1).max(50),
          color: z.string().regex(/^[0-9a-fA-F]{6}$/, 'Invalid color format'),
          description: z.string().max(100).nullable(),
        })
      )
      .max(20),
    state: z.enum(['open', 'closed']),
    state_reason: z.enum(['completed', 'not_planned', 'reopened']).nullable(),
    assignees: z
      .array(
        z.object({
          login: z.string().min(1).max(39),
          id: z.number().int().positive(),
        })
      )
      .max(10),
    milestone: z
      .object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(255),
        state: z.enum(['open', 'closed']),
        due_on: z.string().datetime().nullable(),
      })
      .nullable(),
    comments: z.number().int().min(0),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    closed_at: z.string().datetime().nullable(),
    html_url: z.string().url(),
    repository_url: z.string().url(),
    // AI Analysis fields (our custom additions)
    ai_analysis: z
      .object({
        difficulty_score: z.number().min(1).max(10),
        impact_score: z.number().min(1).max(10),
        confidence_score: z.number().min(0).max(1),
        recommended_skills: z.array(z.string().max(30)).max(10),
        estimated_time_hours: z.number().min(0.5).max(168), // Max 1 week
        complexity_factors: z.array(z.string().max(100)).max(5),
        good_first_issue: z.boolean(),
        mentorship_available: z.boolean(),
        analysis_timestamp: z.string().datetime(),
        model_version: z.string().min(1),
      })
      .optional(),
  })
  .transform(data => ({
    ...data,
    // Add computed fields for easier processing
    label_names: data.labels.map(label => label.name),
    assignee_logins: data.assignees.map(assignee => assignee.login),
    is_good_first_issue: data.labels.some(label => /good.?first.?issue/i.test(label.name)),
    has_help_wanted: data.labels.some(label => /help.?wanted/i.test(label.name)),
    is_beginner_friendly: data.ai_analysis?.difficulty_score
      ? data.ai_analysis.difficulty_score <= 3
      : false,
    age_days: Math.floor(
      (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }))

/**
 * API REQUEST/RESPONSE SCHEMAS
 * Type-safe API validation with versioning support
 */

// Paginated Response Schema Factory
export const createPaginatedResponseSchema = <T>(dataSchema: z.ZodSchema<T>) =>
  z
    .object({
      data: z.array(dataSchema),
      pagination: z.object({
        page: z.number().int().min(1),
        per_page: z.number().int().min(1).max(100),
        total: z.number().int().min(0),
        total_pages: z.number().int().min(0),
        has_next: z.boolean(),
        has_prev: z.boolean(),
      }),
      metadata: z.object({
        request_id: z.string().uuid(),
        timestamp: z.string().datetime(),
        version: z.string(),
        cache_hit: z.boolean().optional(),
        response_time_ms: z.number().min(0),
      }),
    })
    .superRefine((data, ctx) => {
      // Validate pagination consistency
      const expectedTotalPages = Math.ceil(data.pagination.total / data.pagination.per_page) || 1
      if (data.pagination.total_pages !== expectedTotalPages) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Total pages calculation is inconsistent',
          path: ['pagination', 'total_pages'],
        })
      }

      // Validate has_next/has_prev flags
      const expectedHasNext = data.pagination.page < data.pagination.total_pages
      const expectedHasPrev = data.pagination.page > 1

      if (data.pagination.has_next !== expectedHasNext) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'has_next flag is inconsistent with pagination state',
          path: ['pagination', 'has_next'],
        })
      }

      if (data.pagination.has_prev !== expectedHasPrev) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'has_prev flag is inconsistent with pagination state',
          path: ['pagination', 'has_prev'],
        })
      }
    })

// Error Response Schema with Enhanced Context
export const EnhancedErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    type: z.enum([
      'validation',
      'authentication',
      'authorization',
      'not_found',
      'rate_limit',
      'internal',
      'external',
    ]),
    details: z.record(z.unknown()).optional(),
    field_errors: z.record(z.array(z.string())).optional(),
    suggestion: z.string().optional(),
    documentation_url: z.string().url().optional(),
    retry_after: z.number().int().min(0).optional(),
  }),
  metadata: z.object({
    request_id: z.string().uuid(),
    timestamp: z.string().datetime(),
    version: z.string(),
    correlation_id: z.string().optional(),
  }),
})

/**
 * PERFORMANCE-OPTIMIZED VALIDATORS
 * Memoized validation for expensive operations
 */

// Repository validation with caching
export const validateRepositoryWithCache = createMemoizedValidator(
  GitHubRepositorySchema,
  (input: unknown) => {
    const inputObj = input as Record<string, unknown>
    return `repo_${inputObj?.id}_${inputObj?.updated_at}`
  },
  500 // Cache up to 500 repositories
)
/**
 * ENHANCED TYPE-SAFE VALIDATION UTILITIES
 * Provides runtime type safety with comprehensive error handling
 */

// Type-safe schema validation with proper error handling
export function validateWithTypeGuards<TInput, TOutput>(
  schema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>,
  input: unknown,
  options: {
    strict?: boolean
    errorTransform?: (error: z.ZodError) => Error
    fallbackValue?: TOutput
  } = {}
): { success: true; data: TOutput } | { success: false; error: Error; input: unknown } {
  const { strict = true, errorTransform, fallbackValue } = options

  try {
    // First, basic type check
    if (input === null || input === undefined) {
      if (!strict && fallbackValue !== undefined) {
        return { success: true, data: fallbackValue }
      }
      return {
        success: false,
        error: new Error('Input cannot be null or undefined'),
        input,
      }
    }

    // Use safeParse for validation
    const result = schema.safeParse(input)

    if (result.success) {
      return { success: true, data: result.data }
    }

    // Handle validation errors
    const error = errorTransform ? errorTransform(result.error) : result.error
    return { success: false, error, input }
  } catch (error) {
    // Handle unexpected errors
    const finalError = error instanceof Error ? error : new Error('Unexpected validation error')
    return { success: false, error: finalError, input }
  }
}

// Runtime type narrowing utilities
export function createTypeNarrowingValidator<T, U extends T>(
  baseSchema: z.ZodSchema<T>,
  narrowingPredicate: (data: T) => data is U,
  errorMessage = 'Data does not match expected subtype'
) {
  return baseSchema.refine(narrowingPredicate, { message: errorMessage })
}

// Environment-aware validation
export function createEnvironmentAwareValidator<T>(
  schema: z.ZodSchema<T>,
  environmentChecks: {
    development?: (data: T) => boolean | string
    production?: (data: T) => boolean | string
    test?: (data: T) => boolean | string
  }
): z.ZodSchema<T> {
  return schema.superRefine((data, ctx) => {
    const env = process.env.NODE_ENV || 'development'
    const check = environmentChecks[env as keyof typeof environmentChecks]

    if (check) {
      const result = check(data)
      if (result === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Validation failed for ${env} environment`,
        })
      } else if (typeof result === 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result,
        })
      }
    }
  })
}

// Issue validation with caching
export const validateIssueWithCache = createMemoizedValidator(
  GitHubIssueSchema,
  (input: unknown) => {
    const inputObj = input as Record<string, unknown>
    return `issue_${inputObj?.id}_${inputObj?.updated_at}`
  },
  1000 // Cache up to 1000 issues
)

/**
 * SCHEMA REGISTRATION AND VERSIONING
 * Enterprise schema management
 */

// Register schemas with the registry
registerValidationSchema('github-repository', GitHubRepositorySchema)
registerValidationSchema('github-issue', GitHubIssueSchema)
registerValidationSchema('enhanced-error', EnhancedErrorResponseSchema)

// Register schema versions for API evolution
versionManager.registerVersion('repository', 'v1.0.0', GitHubRepositorySchema)
versionManager.registerVersion('issue', 'v1.0.0', GitHubIssueSchema)

// Version 2.0.0 schemas (example of evolution)
const GitHubRepositorySchemaV2 = z
  .object({
    id: z.number().int().positive(),
    node_id: z.string().min(1),
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid repository name format'),
    full_name: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid full repository name format'),
    owner: z.object({
      login: z.string().min(1).max(39),
      id: z.number().int().positive(),
      type: z.enum(['User', 'Organization']),
      avatar_url: z.string().url(),
    }),
    description: z.string().max(500).nullable(),
    html_url: z.string().url(),
    clone_url: z.string().url(),
    ssh_url: z.string().regex(/^git@github\.com:[^/]+\/[^/]+\.git$/, 'Invalid SSH URL format'),
    default_branch: z.string().min(1).max(255).default('main'),
    language: z.string().max(50).nullable(),
    languages_url: z.string().url(),
    topics: z.array(z.string().max(50)).max(20).default([]),
    visibility: z.enum(['public', 'private', 'internal']).default('public'),
    archived: z.boolean().default(false),
    disabled: z.boolean().default(false),
    fork: z.boolean().default(false),
    forks_count: z.number().int().min(0),
    stargazers_count: z.number().int().min(0),
    watchers_count: z.number().int().min(0),
    open_issues_count: z.number().int().min(0),
    size: z.number().int().min(0),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    pushed_at: z.string().datetime().nullable(),
    license: z
      .object({
        key: z.string(),
        name: z.string(),
        spdx_id: z.string().nullable(),
      })
      .nullable(),
    // New fields in v2.0.0
    security_and_analysis: z
      .object({
        secret_scanning: z.object({ status: z.enum(['enabled', 'disabled']) }).optional(),
        secret_scanning_push_protection: z
          .object({ status: z.enum(['enabled', 'disabled']) })
          .optional(),
      })
      .optional(),
    network_count: z.number().int().min(0).optional(),
    subscribers_count: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    // Business logic validation (same as v1)
    if (data.archived && data.open_issues_count > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Archived repositories should not have open issues',
        path: ['archived'],
      })
    }

    if (data.fork && data.forks_count > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fork repositories cannot have their own forks in this context',
        path: ['fork'],
      })
    }

    if (data.visibility === 'private' && !data.owner) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Private repositories must have owner information',
        path: ['owner'],
      })
    }
  })

versionManager.registerVersion('repository', 'v2.0.0', GitHubRepositorySchemaV2)

/**
 * VALIDATION MIDDLEWARE FACTORY
 * Creates type-safe validation middleware for API routes
 */
export function createEnterpriseValidationMiddleware<TInput, TOutput = TInput>(
  schema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>,
  options: {
    enableCaching?: boolean
    enablePerformanceMonitoring?: boolean
    errorFormatter?: (error: z.ZodError) => Record<string, string[]>
    onValidationSuccess?: (data: TOutput) => void
    onValidationError?: (error: z.ZodError) => void
  } = {}
) {
  const {
    enableCaching = false,
    enablePerformanceMonitoring = true,
    errorFormatter,
    onValidationSuccess,
    onValidationError,
  } = options

  return async (input: TInput): Promise<TOutput> => {
    const validationFn = () => {
      if (enableCaching) {
        // Use memoized validation for performance
        const cacheKey = JSON.stringify(input)
        // Create memoized validator with proper typing
        const memoizedValidator = createMemoizedValidator(
          schema as unknown as z.ZodSchema<TOutput>,
          (_: unknown) => cacheKey,
          100 // Default cache size
        )
        return memoizedValidator(input)
      }
      return schema.parse(input)
    }

    try {
      const result = enablePerformanceMonitoring
        ? trackValidationPerformance(schema.constructor.name, validationFn)
        : validationFn()

      onValidationSuccess?.(result)
      return result
    } catch (error) {
      if (error instanceof z.ZodError) {
        onValidationError?.(error)

        if (errorFormatter) {
          const formattedErrors = errorFormatter(error)
          const customError = new Error(JSON.stringify(formattedErrors))
          customError.name = 'ValidationError'
          throw customError
        }
      }
      throw error
    }
  }
}

/**
 * UTILITY FUNCTIONS
 * Helper functions for common validation patterns
 */

// Format validation errors for API responses
export function formatValidationErrorsForAPI(error: z.ZodError): {
  field_errors: Record<string, string[]>
  general_errors: string[]
} {
  const field_errors: Record<string, string[]> = {}
  const general_errors: string[] = []

  for (const issue of error.issues) {
    if (issue.path.length > 0) {
      const fieldPath = issue.path.join('.')
      if (!field_errors[fieldPath]) {
        field_errors[fieldPath] = []
      }
      field_errors[fieldPath].push(issue.message)
    } else {
      general_errors.push(issue.message)
    }
  }

  return { field_errors, general_errors }
}

// Create validation summary for monitoring
export function createValidationSummary() {
  return {
    performance_metrics: getValidationMetrics(),
    registered_schemas: ['github-repository', 'github-issue', 'enhanced-error'], // Static list for now
    schema_versions: Object.fromEntries(
      Array.from(versionManager.getVersions().entries()).map(([name, versions]) => [
        name,
        Array.from(versions.keys()),
      ])
    ),
  }
}

// Export for external usage
export {
  registerValidationSchema,
  getValidationSchema,
  composeValidationSchemas,
  versionManager,
  trackValidationPerformance,
  getValidationMetrics,
  resetValidationMetrics,
  ValidationErrorAggregator,
}
