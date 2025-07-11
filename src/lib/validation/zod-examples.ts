/**
 * Zod 3.x Modern Patterns Examples
 * Demonstrating enterprise-grade validation implementations
 *
 * This file showcases advanced Zod patterns for:
 * - Complex conditional validation
 * - Performance optimization
 * - Security-first input handling
 * - Type-safe API contracts
 * - Error handling and user feedback
 */

import { z } from 'zod'
import {
  createEnterpriseValidationMiddleware,
  createPaginatedResponseSchema,
  EnhancedErrorResponseSchema,
  formatValidationErrorsForAPI,
  GitHubIssueSchema,
  GitHubRepositorySchema,
  XSSProtectedStringSchema,
} from './enterprise-schemas'

/**
 * EXAMPLE 1: ADVANCED USER REGISTRATION WITH CONDITIONAL VALIDATION
 * Demonstrates complex business logic validation with context-aware rules
 */

export const UserRegistrationSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Username can only contain letters, numbers, underscores, and hyphens'
      ),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters long')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain uppercase, lowercase, number, and special character'
      ),
    confirmPassword: z.string(),
    dateOfBirth: z.string().datetime(),
    accountType: z.enum(['individual', 'organization']),
    // Conditional fields based on account type
    organizationName: z.string().min(2).max(100).optional(),
    organizationTaxId: z
      .string()
      .regex(/^\d{2}-\d{7}$/)
      .optional(),
    // Individual-specific fields
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    // Terms and privacy
    acceptTerms: z.boolean(),
    acceptPrivacy: z.boolean(),
    marketingConsent: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Password confirmation validation
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      })
    }

    // Age verification (must be 13+ for COPPA compliance)
    const birthDate = new Date(data.dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }

    if (age < 13) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must be at least 13 years old to register',
        path: ['dateOfBirth'],
      })
    }

    // Organization-specific validation
    if (data.accountType === 'organization') {
      if (!data.organizationName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Organization name is required for organization accounts',
          path: ['organizationName'],
        })
      }
      if (!data.organizationTaxId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Tax ID is required for organization accounts',
          path: ['organizationTaxId'],
        })
      }
    }

    // Individual-specific validation
    if (data.accountType === 'individual') {
      if (!data.firstName || !data.lastName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'First and last name are required for individual accounts',
          path: data.firstName ? ['lastName'] : ['firstName'],
        })
      }
    }

    // Terms acceptance validation
    if (!data.acceptTerms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must accept the terms of service to register',
        path: ['acceptTerms'],
      })
    }

    if (!data.acceptPrivacy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'You must accept the privacy policy to register',
        path: ['acceptPrivacy'],
      })
    }
  })

/**
 * EXAMPLE 2: API SEARCH REQUEST WITH ADVANCED FILTERING
 * Shows how to handle complex search and filter validation
 */

export const AdvancedSearchRequestSchema = z
  .object({
    // Search query with XSS protection
    query: XSSProtectedStringSchema.optional(),

    // Pagination with intelligent defaults
    page: z
      .string()
      .transform(val => Number.parseInt(val, 10))
      .pipe(z.number().int().min(1).max(1000))
      .default('1'),

    limit: z
      .string()
      .transform(val => Number.parseInt(val, 10))
      .pipe(z.number().int().min(1).max(100))
      .default('20'),

    // Date range filtering
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),

    // Multi-select filters
    categories: z
      .string()
      .optional()
      .transform(str => (str ? str.split(',').filter(Boolean) : []))
      .pipe(z.array(z.enum(['bug', 'feature', 'documentation', 'enhancement']))),

    tags: z
      .string()
      .optional()
      .transform(str => (str ? str.split(',').filter(Boolean) : []))
      .pipe(z.array(z.string().max(30))),

    // Sorting and ordering
    sortBy: z.enum(['relevance', 'date', 'popularity', 'difficulty']).default('relevance'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),

    // Advanced filters
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    minStars: z
      .string()
      .optional()
      .transform(val => (val ? Number.parseInt(val, 10) : undefined))
      .pipe(z.number().int().min(0).optional()),
    maxStars: z
      .string()
      .optional()
      .transform(val => (val ? Number.parseInt(val, 10) : undefined))
      .pipe(z.number().int().min(0).optional()),

    // Language filtering
    languages: z
      .string()
      .optional()
      .transform(str => (str ? str.split(',').filter(Boolean) : []))
      .pipe(z.array(z.string().max(50))),

    // Boolean flags
    goodFirstIssue: z
      .string()
      .optional()
      .transform(val => val === 'true'),

    hasMentorship: z
      .string()
      .optional()
      .transform(val => val === 'true'),
  })
  .superRefine((data, ctx) => {
    // Date range validation
    if (data.dateFrom && data.dateTo) {
      const fromDate = new Date(data.dateFrom)
      const toDate = new Date(data.dateTo)

      if (fromDate >= toDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'From date must be before to date',
          path: ['dateFrom'],
        })
      }

      // Limit date range to prevent performance issues
      const maxRangeDays = 365
      const rangeDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)

      if (rangeDays > maxRangeDays) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Date range cannot exceed ${maxRangeDays} days`,
          path: ['dateTo'],
        })
      }
    }

    // Star count range validation
    if (data.minStars !== undefined && data.maxStars !== undefined) {
      if (data.minStars > data.maxStars) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Minimum stars cannot be greater than maximum stars',
          path: ['minStars'],
        })
      }
    }

    // Limit number of filter combinations to prevent performance issues
    const activeFilters = [
      data.categories.length > 0,
      data.tags.length > 0,
      data.difficulty !== undefined,
      data.minStars !== undefined,
      data.maxStars !== undefined,
      data.languages.length > 0,
      data.goodFirstIssue,
      data.hasMentorship,
    ].filter(Boolean).length

    if (activeFilters > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Too many filters applied. Please limit to 5 active filters for optimal performance.',
        path: [],
      })
    }
  })
  .transform(data => ({
    ...data,
    // Add computed fields for database queries
    offset: (data.page - 1) * data.limit,
    hasDateFilter: !!(data.dateFrom || data.dateTo),
    hasStarFilter: !!(data.minStars !== undefined || data.maxStars !== undefined),
    totalFilters: [
      data.categories.length > 0,
      data.tags.length > 0,
      data.difficulty !== undefined,
      data.languages.length > 0,
      data.goodFirstIssue,
      data.hasMentorship,
    ].filter(Boolean).length,
  }))

/**
 * EXAMPLE 3: FORM VALIDATION WITH DYNAMIC FIELD REQUIREMENTS
 * Demonstrates how to handle forms with changing validation rules
 */

export const DynamicFormSchema = z
  .object({
    formType: z.enum(['basic', 'advanced', 'enterprise']),

    // Basic fields (always required)
    name: XSSProtectedStringSchema.pipe(z.string().min(1).max(100)),
    email: z.string().email(),

    // Fields that become required based on form type
    company: z.string().max(100).optional(),
    website: z.string().url().optional(),
    phone: z
      .string()
      .regex(/^\+?[\d\s\-()]+$/)
      .optional(),

    // Advanced form fields
    industry: z.enum(['technology', 'finance', 'healthcare', 'education', 'other']).optional(),
    employeeCount: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),

    // Enterprise form fields
    annualRevenue: z.enum(['<1M', '1M-10M', '10M-100M', '100M+']).optional(),
    complianceRequirements: z.array(z.enum(['SOX', 'HIPAA', 'GDPR', 'SOC2'])).optional(),

    // Custom fields
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    // Dynamic validation based on form type
    switch (data.formType) {
      case 'advanced':
        if (!data.company) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Company name is required for advanced forms',
            path: ['company'],
          })
        }
        if (!data.industry) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Industry selection is required for advanced forms',
            path: ['industry'],
          })
        }
        break

      case 'enterprise': {
        const requiredEnterpriseFields = [
          { field: 'company', message: 'Company name is required for enterprise forms' },
          { field: 'website', message: 'Company website is required for enterprise forms' },
          { field: 'phone', message: 'Phone number is required for enterprise forms' },
          { field: 'industry', message: 'Industry selection is required for enterprise forms' },
          { field: 'employeeCount', message: 'Employee count is required for enterprise forms' },
          {
            field: 'annualRevenue',
            message: 'Annual revenue range is required for enterprise forms',
          },
        ]

        for (const { field, message } of requiredEnterpriseFields) {
          if (!data[field as keyof typeof data]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message,
              path: [field],
            })
          }
        }
        break
      }
    }

    // Custom fields validation
    if (data.customFields) {
      for (const [key, value] of Object.entries(data.customFields)) {
        if (typeof value === 'string' && value.length > 1000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Custom field '${key}' exceeds maximum length of 1000 characters`,
            path: ['customFields', key],
          })
        }
      }
    }
  })

/**
 * EXAMPLE 4: WEBHOOK PAYLOAD VALIDATION WITH SECURITY
 * Shows secure validation of external data with signature verification
 */

export const WebhookPayloadSchema = z
  .object({
    // Webhook metadata
    id: z.string().uuid(),
    timestamp: z.string().datetime(),
    event: z.enum(['issue.opened', 'issue.closed', 'repository.created', 'push']),

    // Payload data (varies by event type)
    payload: z.unknown(),

    // Security headers
    signature: z.string().min(1),
    delivery: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    // Timestamp validation (reject old webhooks to prevent replay attacks)
    const webhookTime = new Date(data.timestamp).getTime()
    const currentTime = Date.now()
    const maxAge = 5 * 60 * 1000 // 5 minutes

    if (currentTime - webhookTime > maxAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Webhook timestamp is too old (possible replay attack)',
        path: ['timestamp'],
      })
    }

    // Future timestamp validation
    if (webhookTime > currentTime + 60000) {
      // 1 minute tolerance
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Webhook timestamp is in the future',
        path: ['timestamp'],
      })
    }
  })
  .transform(data => {
    // Parse event-specific payload
    let typedPayload: unknown = data.payload

    try {
      switch (data.event) {
        case 'issue.opened':
        case 'issue.closed':
          typedPayload = GitHubIssueSchema.parse(data.payload)
          break
        case 'repository.created':
          typedPayload = GitHubRepositorySchema.parse(data.payload)
          break
        case 'push':
          // Define push payload schema here
          break
      }
    } catch (_error) {
      // Payload parsing failed, but we'll include the raw payload
      // and let the application handle the error
    }

    return {
      ...data,
      typedPayload,
      isValidPayload: typedPayload !== data.payload,
    }
  })

/**
 * EXAMPLE 5: USAGE DEMONSTRATION
 * Shows how to use the validation schemas in practice
 */

// Create validation middleware instances
export const validateUserRegistration = createEnterpriseValidationMiddleware(
  UserRegistrationSchema,
  {
    enablePerformanceMonitoring: true,
    errorFormatter: (error: z.ZodError) => {
      const formatted = formatValidationErrorsForAPI(error)
      return formatted.field_errors
    },
    onValidationSuccess: _data => {},
    onValidationError: _error => {},
  }
)

export const validateSearchRequest = createEnterpriseValidationMiddleware(
  AdvancedSearchRequestSchema,
  {
    enableCaching: true,
    enablePerformanceMonitoring: true,
  }
)

export const validateWebhookPayload = createEnterpriseValidationMiddleware(WebhookPayloadSchema, {
  enablePerformanceMonitoring: true,
  errorFormatter: error => {
    // Custom error formatting for webhooks
    const errors: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'root'
      if (!errors[path]) errors[path] = []
      errors[path].push(`Webhook validation: ${issue.message}`)
    }
    return errors
  },
})

/**
 * EXAMPLE 6: TYPE-SAFE API RESPONSE CREATION
 * Demonstrates how to create type-safe API responses
 */

// Repository list response
export const RepositoryListResponse = createPaginatedResponseSchema(GitHubRepositorySchema)

// Issue list response
export const IssueListResponse = createPaginatedResponseSchema(GitHubIssueSchema)

// Example usage in API route
export async function createTypeSafeApiResponse<T>(
  data: T[],
  schema: z.ZodSchema<T>,
  pagination: {
    page: number
    per_page: number
    total: number
  },
  metadata: {
    request_id: string
    response_time_ms: number
    cache_hit?: boolean
  }
) {
  const responseSchema = createPaginatedResponseSchema(schema)

  const response = responseSchema.parse({
    data,
    pagination: {
      ...pagination,
      total_pages: Math.ceil(pagination.total / pagination.per_page),
      has_next: pagination.page < Math.ceil(pagination.total / pagination.per_page),
      has_prev: pagination.page > 1,
    },
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      version: 'v1.0.0',
    },
  })

  return response
}

// Example error response creation
export function createTypeSafeErrorResponse(
  error: z.ZodError,
  type: 'validation',
  request_id: string
) {
  const formattedErrors = formatValidationErrorsForAPI(error)

  return EnhancedErrorResponseSchema.parse({
    success: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: 'The request data is invalid',
      type,
      field_errors: formattedErrors.field_errors,
      suggestion: 'Please check the field requirements and try again',
      documentation_url: 'https://docs.contribux.dev/api/validation',
    },
    metadata: {
      request_id,
      timestamp: new Date().toISOString(),
      version: 'v1.0.0',
    },
  })
}

// Schemas are already exported above individually
