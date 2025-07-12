/**
 * Comprehensive Input Validation and Sanitization System
 * Provides centralized validation using Zod schemas with security-focused sanitization
 * Implements OWASP best practices for input validation and data integrity
 */

import { type ZodError, type ZodSchema, z } from 'zod'
import { SecurityError, SecurityErrorType } from './error-boundaries'

// Common validation patterns
export const ValidationPatterns = {
  // Alphanumeric with limited special characters
  SAFE_STRING: /^[a-zA-Z0-9\s\-_.,!?@#$%&*()+=[\]{}|;:'"<>/\\]+$/,

  // GitHub username pattern
  GITHUB_USERNAME: /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,

  // Repository name pattern
  REPO_NAME: /^[a-zA-Z0-9_.-]+$/,

  // Semantic version pattern
  SEMVER:
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,

  // URL slug pattern
  URL_SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

  // Safe filename pattern
  SAFE_FILENAME: /^[a-zA-Z0-9_.-]+$/,

  // API key pattern
  API_KEY: /^[a-zA-Z0-9_-]{32,64}$/,

  // JWT pattern
  JWT: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
}

// Common sanitizers
export const Sanitizers = {
  /**
   * Remove dangerous HTML and script tags
   */
  stripHtml: (input: string): string => {
    return input
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '') // Remove all remaining HTML tags
  },

  /**
   * Escape HTML entities
   */
  escapeHtml: (input: string): string => {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
    }
    return input.replace(/[&<>"'/]/g, char => htmlEntities[char] || char)
  },

  /**
   * Normalize whitespace
   */
  normalizeWhitespace: (input: string): string => {
    return input.trim().replace(/\s+/g, ' ')
  },

  /**
   * Remove null bytes
   */
  removeNullBytes: (input: string): string => {
    return input.replace(/\0/g, '')
  },

  /**
   * Truncate string to maximum length
   */
  truncate: (input: string, maxLength: number): string => {
    return input.length > maxLength ? input.slice(0, maxLength) : input
  },

  /**
   * Sanitize for use in URLs
   */
  urlSafe: (input: string): string => {
    return encodeURIComponent(input)
  },

  /**
   * Sanitize for use in SQL (basic - use parameterized queries!)
   */
  sqlSafe: (input: string): string => {
    return input.replace(/['";\\]/g, '')
  },

  /**
   * Sanitize for shell commands (basic - avoid shell commands!)
   */
  shellSafe: (input: string): string => {
    return input.replace(/[`$&|;()<>\\]/g, '')
  },
}

// Common Zod schemas with built-in sanitization
export const CommonSchemas = {
  // Email with normalization
  email: z.string().email('Invalid email format').toLowerCase().trim().max(255),

  // Username with sanitization
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(39, 'Username must be at most 39 characters')
    .regex(ValidationPatterns.GITHUB_USERNAME, 'Invalid username format')
    .transform(val => Sanitizers.normalizeWhitespace(val)),

  // Repository name
  repoName: z
    .string()
    .min(1, 'Repository name is required')
    .max(100, 'Repository name too long')
    .regex(ValidationPatterns.REPO_NAME, 'Invalid repository name')
    .transform(val => Sanitizers.removeNullBytes(val)),

  // Safe text input
  safeText: z
    .string()
    .min(1, 'Text is required')
    .max(1000, 'Text too long')
    .transform(val => Sanitizers.stripHtml(val))
    .transform(val => Sanitizers.normalizeWhitespace(val))
    .transform(val => Sanitizers.removeNullBytes(val)),

  // URL
  url: z
    .string()
    .url('Invalid URL format')
    .max(2048, 'URL too long')
    .refine(val => {
      const url = new URL(val)
      return ['http:', 'https:'].includes(url.protocol)
    }, 'Only HTTP(S) URLs are allowed'),

  // API key
  apiKey: z
    .string()
    .regex(ValidationPatterns.API_KEY, 'Invalid API key format')
    .transform(val => val.trim()),

  // JWT token
  jwtToken: z.string().regex(ValidationPatterns.JWT, 'Invalid JWT format'),

  // Pagination
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    sort: z.enum(['asc', 'desc']).default('desc'),
    sortBy: z.string().optional(),
  }),

  // Date range
  dateRange: z
    .object({
      start: z.date().or(z.string().datetime()),
      end: z.date().or(z.string().datetime()),
    })
    .refine(data => {
      const start = typeof data.start === 'string' ? new Date(data.start) : data.start
      const end = typeof data.end === 'string' ? new Date(data.end) : data.end
      return start <= end
    }, 'Start date must be before end date'),

  // Search query
  searchQuery: z
    .string()
    .min(1, 'Search query is required')
    .max(200, 'Search query too long')
    .transform(val => Sanitizers.stripHtml(val))
    .transform(val => Sanitizers.normalizeWhitespace(val))
    .transform(val => Sanitizers.sqlSafe(val)),
}

// GitHub-specific schemas
export const GitHubSchemas = {
  // Repository input
  repository: z.object({
    owner: CommonSchemas.username,
    name: CommonSchemas.repoName,
    description: z
      .string()
      .max(1000)
      .optional()
      .transform(val => (val ? Sanitizers.stripHtml(val) : val)),
    private: z.boolean().default(false),
    topics: z.array(z.string().max(50)).max(20).optional(),
  }),

  // Issue input
  issue: z.object({
    title: z
      .string()
      .min(1)
      .max(256)
      .transform(val => Sanitizers.stripHtml(val)),
    body: z
      .string()
      .max(65536)
      .transform(val => Sanitizers.stripHtml(val))
      .optional(),
    labels: z.array(z.string().max(50)).max(100).optional(),
    assignees: z.array(CommonSchemas.username).max(10).optional(),
  }),

  // Pull request input
  pullRequest: z.object({
    title: z
      .string()
      .min(1)
      .max(256)
      .transform(val => Sanitizers.stripHtml(val)),
    body: z
      .string()
      .max(65536)
      .transform(val => Sanitizers.stripHtml(val))
      .optional(),
    base: z.string().max(255),
    head: z.string().max(255),
    draft: z.boolean().default(false),
  }),

  // Webhook payload (strict validation)
  webhookPayload: z
    .object({
      action: z.string().max(50),
      repository: z.object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        owner: z.object({
          login: z.string(),
          id: z.number(),
        }),
      }),
      sender: z.object({
        login: z.string(),
        id: z.number(),
      }),
    })
    .passthrough(), // Allow additional fields but validate core structure
}

// API endpoint schemas
export const ApiSchemas = {
  // Search repositories
  searchRepos: z.object({
    query: CommonSchemas.searchQuery,
    language: z.string().max(50).optional(),
    topic: z.string().max(50).optional(),
    sort: z.enum(['stars', 'forks', 'updated']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
  }),

  // Create API key
  createApiKey: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .transform(val => Sanitizers.stripHtml(val)),
    permissions: z.array(z.string()).min(1).max(50),
    expiresAt: z.date().or(z.string().datetime()).optional(),
  }),

  // Update user profile
  updateProfile: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .transform(val => Sanitizers.stripHtml(val))
      .optional(),
    email: CommonSchemas.email.optional(),
    bio: z
      .string()
      .max(500)
      .transform(val => Sanitizers.stripHtml(val))
      .optional(),
    avatar: CommonSchemas.url.optional(),
  }),
}

/**
 * Input validator with security features
 */
export class InputValidator {
  private static instance: InputValidator

  static getInstance(): InputValidator {
    if (!InputValidator.instance) {
      InputValidator.instance = new InputValidator()
    }
    return InputValidator.instance
  }

  /**
   * Validate input against schema with security checks
   */
  async validate<T>(
    schema: ZodSchema<T>,
    input: unknown,
    options?: {
      throwOnError?: boolean
      sanitize?: boolean
      context?: Record<string, unknown>
    }
  ): Promise<{ success: boolean; data?: T; errors?: ZodError }> {
    try {
      // Pre-validation security checks
      this.performSecurityChecks(input)

      // Validate with schema
      const result = await schema.safeParseAsync(input)

      if (result.success) {
        return { success: true, data: result.data }
      }
      if (options?.throwOnError) {
        throw new SecurityError(
          SecurityErrorType.VALIDATION,
          'Input validation failed',
          400,
          result.error.errors,
          'Invalid input data'
        )
      }
      return { success: false, errors: result.error }
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error
      }

      throw new SecurityError(
        SecurityErrorType.VALIDATION,
        'Validation error',
        400,
        error,
        'Input validation failed'
      )
    }
  }

  /**
   * Validate multiple inputs
   */
  async validateBatch<T extends Record<string, ZodSchema>>(
    schemas: T,
    inputs: Record<keyof T, unknown>
  ): Promise<{
    success: boolean
    data?: { [K in keyof T]: z.infer<T[K]> }
    errors?: Record<keyof T, ZodError>
  }> {
    const results: Partial<{ [K in keyof T]: z.infer<T[K]> }> = {}
    const errors: Partial<Record<keyof T, ZodError>> = {}
    let hasErrors = false

    for (const [key, schema] of Object.entries(schemas)) {
      const result = await this.validate(schema as ZodSchema, inputs[key])

      if (result.success) {
        // Safe assignment using type assertion with proper key type
        Object.assign(results, { [key]: result.data })
      } else {
        // Safe assignment using type assertion with proper key type
        Object.assign(errors, { [key]: result.errors })
        hasErrors = true
      }
    }

    return hasErrors
      ? { success: false, errors: errors as Record<keyof T, ZodError> }
      : { success: true, data: results as { [K in keyof T]: z.infer<T[K]> } }
  }

  /**
   * Create a validated API handler
   */
  createValidatedHandler<TInput, TOutput>(
    inputSchema: ZodSchema<TInput>,
    handler: (input: TInput, context: unknown) => Promise<TOutput>
  ) {
    return async (rawInput: unknown, context: unknown): Promise<TOutput> => {
      const validation = await this.validate(inputSchema, rawInput, {
        throwOnError: true,
      })

      if (!validation.data) {
        throw new Error('Validation failed unexpectedly')
      }

      return handler(validation.data, context)
    }
  }

  /**
   * Perform security checks on input
   */
  private performSecurityChecks(input: unknown): void {
    // Check for potential injection patterns
    if (typeof input === 'string') {
      this.checkForInjection(input)
    } else if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
      this.checkObjectForInjection(input as Record<string, unknown>)
    }

    // Check input size
    const size = JSON.stringify(input).length
    if (size > 1048576) {
      // 1MB limit
      throw new SecurityError(
        SecurityErrorType.VALIDATION,
        'Input too large',
        413,
        { size },
        'Request payload too large'
      )
    }
  }

  /**
   * Check string for injection patterns
   */
  private checkForInjection(input: string): void {
    const injectionPatterns = [
      // SQL injection patterns
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b.*\b(FROM|INTO|WHERE|TABLE)\b)/i,

      // NoSQL injection patterns
      /\$\{|\$where:|\.constructor\(|process\.|require\(/,

      // Command injection patterns
      /[;&|`]|\$\(|\${|<<|>>|\|\|/,

      // XXE patterns
      /<!ENTITY|SYSTEM|PUBLIC|file:\/\/|expect:\/\//i,

      // Directory traversal
      /\.\.[/\\]|\.\.[/\\]\.\./,
    ]

    for (const pattern of injectionPatterns) {
      if (pattern.test(input)) {
        throw new SecurityError(
          SecurityErrorType.VALIDATION,
          'Potential injection detected',
          400,
          { pattern: pattern.toString() },
          'Invalid input detected'
        )
      }
    }
  }

  /**
   * Check object for injection patterns
   */
  private checkObjectForInjection(obj: Record<string, unknown>, depth = 0): void {
    if (depth > 10) return // Prevent deep recursion

    for (const [key, value] of Object.entries(obj)) {
      // Check key
      if (typeof key === 'string') {
        this.checkForInjection(key)
      }

      // Check value
      if (typeof value === 'string') {
        this.checkForInjection(value)
      } else if (typeof value === 'object' && value !== null) {
        this.checkObjectForInjection(value as Record<string, unknown>, depth + 1)
      }
    }
  }
}

// Export singleton instance
export const validator = InputValidator.getInstance()

// Validation middleware factory
export function createValidationMiddleware<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return async (req: Request): Promise<T> => {
    let input: unknown

    switch (source) {
      case 'body':
        input = await req.json()
        break
      case 'query':
        input = Object.fromEntries(new URL(req.url).searchParams)
        break
      case 'params':
        // This would need to be extracted from the route pattern
        input = {}
        break
    }

    const result = await validator.validate(schema, input, {
      throwOnError: true,
    })

    if (!result.data) {
      throw new Error('Validation failed unexpectedly')
    }

    return result.data
  }
}
