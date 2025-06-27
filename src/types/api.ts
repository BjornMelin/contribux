import type { Endpoints } from '@octokit/types'
import { z } from 'zod'
import type { AuthenticationResult, User, UserSession } from './auth'
import { RegistrationDataSchema } from './auth'
import type { ApiResponse, HttpStatus, PaginationMetadata, Result } from './base'
import {
  EmailSchema,
  GitHubUsernameSchema,
  type ISODateString,
  type UUID,
  UUIDSchema,
} from './base'
import type { Opportunity, Repository, SearchResults } from './search'
import { SearchFiltersSchema } from './search'

// ==================== API REQUEST VALIDATION ====================

/**
 * Common API request headers validation
 */
export const ApiRequestHeadersSchema = z.object({
  'content-type': z.string().optional(),
  'user-agent': z.string().optional(),
  authorization: z.string().optional(),
  'x-api-key': z.string().optional(),
  'x-session-id': z.string().uuid().optional(),
  'x-client-version': z.string().optional(),
  'x-platform': z.enum(['web', 'mobile', 'desktop']).optional(),
})

export type ApiRequestHeaders = z.infer<typeof ApiRequestHeadersSchema>

/**
 * Pagination request parameters
 */
export const PaginationRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export type PaginationRequest = z.infer<typeof PaginationRequestSchema>

/**
 * Import the proper API response schema from base types
 */
import { createApiResponseSchema } from './base'

/**
 * Common API response wrapper using base schema
 */
export const ApiResponseSchema = createApiResponseSchema

// ==================== AUTHENTICATION API ====================

/**
 * Login request validation
 */
export const LoginRequestSchema = z.object({
  email: EmailSchema.optional(),
  username: z.string().min(1).max(50).optional(),
  password: z.string().min(8).max(128).optional(),
  provider: z.enum(['github', 'google', 'discord']).optional(),
  remember: z.boolean().default(false),
  captcha: z.string().optional(),
})

export type LoginRequest = z.infer<typeof LoginRequestSchema>

/**
 * Registration request validation
 */
export const RegisterRequestSchema = RegistrationDataSchema.extend({
  password: z.string().min(8).max(128).optional(),
  confirmPassword: z.string().optional(),
  captcha: z.string().optional(),
  termsAccepted: z.boolean().refine(val => val === true, {
    message: 'Terms and conditions must be accepted',
  }),
}).refine(
  data => {
    if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
      return false
    }
    return true
  },
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
)

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

/**
 * Password reset request validation
 */
export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
  captcha: z.string().optional(),
})

export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>

/**
 * Password change request validation
 */
export const PasswordChangeRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string(),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type PasswordChangeRequest = z.infer<typeof PasswordChangeRequestSchema>

/**
 * OAuth callback validation
 */
export const OAuthCallbackRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

export type OAuthCallbackRequest = z.infer<typeof OAuthCallbackRequestSchema>

// ==================== USER MANAGEMENT API ====================

/**
 * User profile update request validation
 */
export const UserProfileUpdateRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  username: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  githubUsername: GitHubUsernameSchema.optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().optional(),
  timezone: z.string().optional(),
  notifications: z
    .object({
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      push: z.boolean().optional(),
      frequency: z.enum(['immediate', 'daily', 'weekly']).optional(),
    })
    .optional(),
})

export type UserProfileUpdateRequest = z.infer<typeof UserProfileUpdateRequestSchema>

/**
 * User preferences update request validation
 */
export const UserPreferencesUpdateRequestSchema = z.object({
  expertiseAreas: z.array(z.string().min(1).max(50)).max(20).optional(),
  programmingLanguages: z.array(z.string().min(1).max(30)).max(15).optional(),
  frameworks: z.array(z.string().min(1).max(50)).max(20).optional(),
  difficultyPreference: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  timeCommitment: z.enum(['casual', 'part-time', 'full-time']).optional(),
  contributionTypes: z
    .array(
      z.enum([
        'bug_fix',
        'feature',
        'documentation',
        'testing',
        'refactoring',
        'performance',
        'security',
        'accessibility',
      ])
    )
    .optional(),
  minImpactScore: z.number().min(0).max(1).optional(),
  maxEstimatedHours: z.number().min(1).max(40).optional(),
  notificationSettings: z
    .object({
      enabled: z.boolean().optional(),
      frequency: z.enum(['immediate', 'daily', 'weekly']).optional(),
      channels: z.array(z.enum(['email', 'sms', 'push'])).optional(),
      quietHours: z
        .object({
          enabled: z.boolean(),
          startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
          endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
          timezone: z.string(),
        })
        .optional(),
    })
    .optional(),
})

export type UserPreferencesUpdateRequest = z.infer<typeof UserPreferencesUpdateRequestSchema>

// ==================== SEARCH API ====================

/**
 * Opportunity search request validation
 */
export const OpportunitySearchRequestSchema = SearchFiltersSchema.extend({
  // Override base filters with API-specific transformations
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Add API-specific fields
  includeAIAnalysis: z.boolean().default(true),
  includeRepository: z.boolean().default(true),
  includeUserMatch: z.boolean().default(false),

  // Vector search options
  semanticSearch: z.boolean().default(false),
  similarityThreshold: z.number().min(0).max(1).default(0.7),

  // Response customization
  fields: z.array(z.string()).optional(),
  expand: z.array(z.enum(['repository', 'aiAnalysis', 'labels', 'assignee'])).optional(),
})

export type OpportunitySearchRequest = z.infer<typeof OpportunitySearchRequestSchema>

/**
 * Repository search request validation
 */
export const RepositorySearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  languages: z.array(z.string()).default([]),
  minStars: z.coerce.number().int().min(0).optional(),
  maxStars: z.coerce.number().int().min(0).optional(),
  minHealth: z.coerce.number().min(0).max(1).optional(),
  hasIssues: z.boolean().optional(),
  isArchived: z.boolean().default(false),
  isFork: z.boolean().optional(),
  pushedAfter: z.coerce.date().optional(),
  createdAfter: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['stars', 'updated', 'created', 'name', 'health']).default('stars'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export type RepositorySearchRequest = z.infer<typeof RepositorySearchRequestSchema>

/**
 * Search suggestions request validation
 */
export const SearchSuggestionsRequestSchema = z.object({
  query: z.string().min(1).max(100),
  type: z.enum(['opportunities', 'repositories', 'languages', 'skills']).default('opportunities'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
})

export type SearchSuggestionsRequest = z.infer<typeof SearchSuggestionsRequestSchema>

// ==================== ANALYTICS API ====================

/**
 * Contribution tracking request validation
 */
export const ContributionTrackingRequestSchema = z.object({
  opportunityId: UUIDSchema,
  action: z.enum(['viewed', 'clicked', 'bookmarked', 'started', 'completed', 'abandoned']),
  metadata: z.record(z.unknown()).optional(),
  sessionId: z.string().uuid().optional(),
  timestamp: z.coerce.date().optional(),
})

export type ContributionTrackingRequest = z.infer<typeof ContributionTrackingRequestSchema>

/**
 * Analytics query request validation
 */
export const AnalyticsQueryRequestSchema = z.object({
  metric: z.enum([
    'contributions',
    'success_rate',
    'time_to_completion',
    'skill_growth',
    'reputation_change',
  ]),
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  groupBy: z.enum(['day', 'week', 'month', 'language', 'difficulty', 'type']).optional(),
  filters: z
    .object({
      languages: z.array(z.string()).optional(),
      difficulties: z.array(z.enum(['beginner', 'intermediate', 'advanced', 'expert'])).optional(),
      types: z.array(z.string()).optional(),
      repositories: z.array(z.string()).optional(),
    })
    .optional(),
})

export type AnalyticsQueryRequest = z.infer<typeof AnalyticsQueryRequestSchema>

// ==================== NOTIFICATION API ====================

/**
 * Notification preferences request validation
 */
export const NotificationPreferencesRequestSchema = z.object({
  email: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(['immediate', 'daily', 'weekly']),
      types: z.array(z.enum(['new_opportunities', 'deadlines', 'updates', 'achievements'])),
    })
    .optional(),
  sms: z
    .object({
      enabled: z.boolean(),
      phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
      frequency: z.enum(['immediate', 'daily']),
      types: z.array(z.enum(['urgent_deadlines', 'high_priority_opportunities'])),
    })
    .optional(),
  push: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(['immediate', 'daily']),
      types: z.array(z.enum(['new_opportunities', 'deadlines', 'updates'])),
    })
    .optional(),
  quietHours: z
    .object({
      enabled: z.boolean(),
      startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
      endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
      timezone: z.string(),
      weekdaysOnly: z.boolean().default(false),
    })
    .optional(),
})

export type NotificationPreferencesRequest = z.infer<typeof NotificationPreferencesRequestSchema>

/**
 * Manual notification request validation
 */
export const SendNotificationRequestSchema = z.object({
  recipients: z
    .array(
      z.object({
        userId: UUIDSchema.optional(),
        email: EmailSchema.optional(),
        phoneNumber: z.string().optional(),
      })
    )
    .min(1),
  channels: z.array(z.enum(['email', 'sms', 'push'])).min(1),
  template: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  scheduleAt: z.coerce.date().optional(),
})

export type SendNotificationRequest = z.infer<typeof SendNotificationRequestSchema>

// ==================== WEBHOOK API ====================

/**
 * Webhook configuration request validation
 */
export const WebhookConfigRequestSchema = z.object({
  url: z.string().url(),
  events: z
    .array(
      z.enum([
        'opportunity.created',
        'opportunity.updated',
        'opportunity.deleted',
        'user.created',
        'user.updated',
        'contribution.started',
        'contribution.completed',
        'notification.sent',
        'notification.failed',
      ])
    )
    .min(1),
  secret: z.string().min(16).max(64).optional(),
  active: z.boolean().default(true),
  metadata: z.record(z.string()).optional(),
})

export type WebhookConfigRequest = z.infer<typeof WebhookConfigRequestSchema>

/**
 * Webhook delivery request validation
 */
export const WebhookDeliveryRequestSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.unknown()),
  timestamp: z.coerce.date().default(() => new Date()),
  id: UUIDSchema.optional(),
  retry: z.boolean().default(false),
})

export type WebhookDeliveryRequest = z.infer<typeof WebhookDeliveryRequestSchema>

// ==================== ERROR HANDLING ====================

/**
 * API error response validation
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  meta: z.object({
    timestamp: z.date(),
    requestId: UUIDSchema,
    version: z.string(),
    executionTime: z.number().min(0),
  }),
})

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>

/**
 * Validation error details
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
  received: z.unknown().optional(),
  expected: z.unknown().optional(),
})

export type ValidationError = z.infer<typeof ValidationErrorSchema>

/**
 * Validation error response
 */
export const ValidationErrorResponseSchema = ApiErrorResponseSchema.extend({
  code: z.literal('VALIDATION_ERROR'),
  details: z.object({
    errors: z.array(ValidationErrorSchema),
    totalErrors: z.number().int().min(0),
  }),
})

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>

// ==================== RATE LIMITING ====================

/**
 * Rate limit info validation
 */
export const RateLimitInfoSchema = z.object({
  limit: z.number().int().positive(),
  remaining: z.number().int().min(0),
  reset: z.date(),
  retryAfter: z.number().int().min(0).optional(),
  policy: z.string().optional(),
})

export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>

/**
 * Rate limit exceeded response
 */
export const RateLimitExceededResponseSchema = ApiErrorResponseSchema.extend({
  code: z.literal('RATE_LIMIT_EXCEEDED'),
  details: z.object({
    rateLimit: RateLimitInfoSchema,
    retryAfter: z.number().int().min(0),
  }),
})

export type RateLimitExceededResponse = z.infer<typeof RateLimitExceededResponseSchema>

// ==================== UTILITY FUNCTIONS ====================

// ==================== GITHUB API TYPES ====================

/**
 * GitHub Repository API response type from Octokit
 */
export type GitHubRepositoryResponse = Endpoints['GET /repos/{owner}/{repo}']['response']['data']

/**
 * Transform GitHub API response to internal types
 */
export function transformGitHubRepository(
  githubRepo: GitHubRepositoryResponse
): Omit<Repository, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    githubId: githubRepo.id,
    name: githubRepo.name,
    fullName: githubRepo.full_name,
    description: githubRepo.description,
    language: githubRepo.language,
    topics: githubRepo.topics || [],
    starsCount: githubRepo.stargazers_count,
    forksCount: githubRepo.forks_count,
    issuesCount: githubRepo.open_issues_count || 0,
    url: githubRepo.html_url,
    defaultBranch: githubRepo.default_branch,
    lastPushedAt: githubRepo.pushed_at ? new Date(githubRepo.pushed_at) : undefined,
    health: {
      score: 0.5, // Default - would be calculated separately
      status: 'fair' as const,
      metrics: {
        commitFrequency: 0,
        issueResponseTime: 0,
        prMergeTime: 0,
        maintainerActivity: 0,
        communityEngagement: 0,
        documentationQuality: 0,
        codeQuality: 0,
        testCoverage: undefined,
      },
      lastUpdated: new Date(),
    },
    isArchived: githubRepo.archived || false,
    isFork: githubRepo.fork || false,
    hasIssues: githubRepo.has_issues || false,
    hasProjects: githubRepo.has_projects || false,
    hasWiki: githubRepo.has_wiki || false,
    createdAt: new Date(githubRepo.created_at),
    updatedAt: new Date(githubRepo.updated_at),
  } as Omit<Repository, 'id' | 'createdAt' | 'updatedAt'> & {
    createdAt: Date
    updatedAt: Date
  }
}

/**
 * Validate API request with enhanced error details
 */
export function validateApiRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  requestId: string = crypto.randomUUID()
): Result<T, ValidationErrorResponse> {
  try {
    const validated = schema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors: ValidationError[] = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
        // Note: received and expected are not guaranteed to exist on ZodIssue
        received: 'received' in err ? err.received : undefined,
        expected: 'expected' in err ? err.expected : undefined,
      }))

      const errorResponse: ValidationErrorResponse = {
        success: false,
        error: 'Request validation failed',
        message: `${validationErrors.length} validation error(s) occurred`,
        code: 'VALIDATION_ERROR',
        details: {
          errors: validationErrors,
          totalErrors: validationErrors.length,
        },
        meta: {
          timestamp: new Date(),
          requestId: requestId as UUID,
          version: '1.0.0',
          executionTime: 0,
        },
      }

      return { success: false, error: errorResponse }
    }

    // Fallback for non-Zod errors
    const errorResponse: ValidationErrorResponse = {
      success: false,
      error: 'Unknown validation error',
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      code: 'VALIDATION_ERROR',
      details: {
        errors: [],
        totalErrors: 0,
      },
      meta: {
        timestamp: new Date(),
        requestId: requestId as UUID,
        version: '1.0.0',
        executionTime: 0,
      },
    }

    return { success: false, error: errorResponse }
  }
}

/**
 * Create standardized API response
 */
export function createApiResponse<T>(
  data: T,
  requestId: string = crypto.randomUUID(),
  executionTime = 0,
  pagination?: PaginationMetadata
): ApiResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString() as ISODateString,
      requestId: requestId as UUID,
      version: '1.0.0',
      executionTime,
      ...(pagination && { pagination }),
    },
  }
}

/**
 * Create standardized API error response
 */
export function createApiErrorResponse(
  _code: string,
  message: string,
  _details?: Record<string, unknown>,
  _field?: string,
  _statusCode?: HttpStatus,
  requestId: string = crypto.randomUUID(),
  executionTime = 0
): ApiErrorResponse {
  return {
    success: false,
    error: message, // Return string for compatibility
    meta: {
      timestamp: new Date(),
      requestId: requestId as UUID,
      version: '1.0.0',
      executionTime,
    },
  }
}

// ==================== EXPORTED RESPONSE TYPES ====================

/**
 * Specific API response types for different endpoints
 */
export type AuthApiResponse = ApiResponse<AuthenticationResult>
export type UserApiResponse = ApiResponse<User>
export type UserSessionApiResponse = ApiResponse<UserSession>
export type OpportunityApiResponse = ApiResponse<Opportunity>
export type OpportunityListApiResponse = ApiResponse<readonly Opportunity[]>
export type RepositoryApiResponse = ApiResponse<Repository>
export type RepositoryListApiResponse = ApiResponse<readonly Repository[]>
export type SearchResultsApiResponse = ApiResponse<SearchResults>

/**
 * Generic API response type aliases
 */
export type SuccessResponse<T> = ApiResponse<T>
export type ErrorResponse = ApiErrorResponse
export type ApiResult<T> = Result<T, ErrorResponse>
