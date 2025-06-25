/**
 * Base Type Definitions
 * Core interfaces and enums that serve as building blocks for other types
 * Follows TypeScript 5.8+ strict mode and exactOptionalPropertyTypes
 */

import { z } from 'zod'

// ==================== CORE PRIMITIVE TYPES ====================

/**
 * Branding utility type for creating tagged types
 */
export const BRAND = Symbol('BRAND')
export type BRAND<T> = { readonly [BRAND]: T }

/**
 * Branded type for UUID strings to prevent mixing with regular strings
 */
export type UUID = string & BRAND<'UUID'>

/**
 * Branded type for email strings with validation
 */
export type Email = string & BRAND<'Email'>

/**
 * Branded type for GitHub usernames
 */
export type GitHubUsername = string & BRAND<'GitHubUsername'>

/**
 * ISO 8601 date string type
 */
export type ISODateString = string & BRAND<'ISODateString'>

/**
 * URL string type for validated URLs
 */
export type URLString = string & BRAND<'URLString'>

/**
 * Type-safe branding utilities
 */
export function brandAsUUID(value: string): UUID {
  return value as UUID
}

export function brandAsEmail(value: string): Email {
  return value as Email
}

export function brandAsGitHubUsername(value: string): GitHubUsername {
  return value as GitHubUsername
}

export function brandAsISODateString(value: string): ISODateString {
  return value as ISODateString
}

export function brandAsURLString(value: string): URLString {
  return value as URLString
}

// ==================== ZOD VALIDATION SCHEMAS ====================

/**
 * UUID schema with strict validation
 */
export const UUIDSchema = z
  .string()
  .uuid()
  .transform(value => value as UUID)

/**
 * Email schema with validation
 */
export const EmailSchema = z
  .string()
  .email()
  .transform(value => value as Email)

/**
 * GitHub username schema (alphanumeric, hyphens, 1-39 chars)
 */
export const GitHubUsernameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9-]+$/, 'GitHub username can only contain alphanumeric characters and hyphens')
  .min(1, 'GitHub username must be at least 1 character')
  .max(39, 'GitHub username must be at most 39 characters')
  .transform(value => value as GitHubUsername)

/**
 * ISO date string schema
 */
export const ISODateStringSchema = z
  .string()
  .datetime({ offset: true })
  .transform(value => value as ISODateString)

/**
 * URL schema with strict validation
 */
export const URLStringSchema = z
  .string()
  .url()
  .transform(value => value as URLString)

// ==================== CORE ENUMS ====================

/**
 * Environment types for the application
 */
export const Environment = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const

export type Environment = (typeof Environment)[keyof typeof Environment]

export const EnvironmentSchema = z.nativeEnum(Environment)

/**
 * Log levels for structured logging
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]

export const LogLevelSchema = z.nativeEnum(LogLevel)

/**
 * HTTP status codes (common ones)
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus]

export const HttpStatusSchema = z.nativeEnum(HttpStatus)

// ==================== CORE INTERFACES ====================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  readonly success: boolean
  readonly data?: T
  readonly error?: ApiError
  readonly metadata?: ResponseMetadata
}

/**
 * API error interface with structured error information
 */
export interface ApiError {
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
  readonly field?: string
  readonly statusCode?: HttpStatus
}

/**
 * Response metadata for pagination and debugging
 */
export interface ResponseMetadata {
  readonly timestamp: ISODateString
  readonly requestId?: UUID
  readonly version?: string
  readonly pagination?: PaginationMetadata
  readonly executionTime?: number
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMetadata {
  readonly page: number
  readonly limit: number
  readonly total: number
  readonly hasNext: boolean
  readonly hasPrevious: boolean
}

/**
 * Base entity interface with common audit fields
 */
export interface BaseEntity {
  readonly id: UUID
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Soft delete capability interface
 */
export interface SoftDeletable {
  readonly deletedAt?: Date
}

/**
 * Versioning capability interface
 */
export interface Versionable {
  readonly version: number
}

// ==================== ZOD SCHEMAS FOR CORE INTERFACES ====================

/**
 * Schema for API error validation
 */
export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  field: z.string().optional(),
  statusCode: HttpStatusSchema.optional(),
})

/**
 * Schema for pagination metadata
 */
export const PaginationMetadataSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrevious: z.boolean(),
})

/**
 * Schema for response metadata
 */
export const ResponseMetadataSchema = z.object({
  timestamp: ISODateStringSchema,
  requestId: UUIDSchema.optional(),
  version: z.string().optional(),
  pagination: PaginationMetadataSchema.optional(),
  executionTime: z.number().optional(),
})

/**
 * Generic API response schema factory
 */
export const createApiResponseSchema = <T>(dataSchema: z.ZodType<T>) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: ApiErrorSchema.optional(),
    metadata: ResponseMetadataSchema.optional(),
  })

/**
 * Base entity schema
 */
export const BaseEntitySchema = z.object({
  id: UUIDSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

// ==================== UTILITY TYPES ====================

/**
 * Make all properties optional except specified keys
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>

/**
 * Make specified properties required
 */
export type RequiredProps<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * Non-empty array type
 */
export type NonEmptyArray<T> = [T, ...T[]]

/**
 * Exact type utility for preventing excess properties
 */
export type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never

// ==================== BRANDED TYPE UTILITIES ====================

/**
 * Create a branded type from a base type and brand
 */
export type Brand<T, B> = T & { readonly __brand: B }

/**
 * Extract the base type from a branded type
 */
export type Unbrand<T> = T extends Brand<infer U, unknown> ? U : T

// ==================== RESULT TYPE PATTERN ====================

/**
 * Result type for error handling without exceptions
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E }

/**
 * Create a success result
 */
export const success = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
})

/**
 * Create an error result
 */
export const failure = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
})

/**
 * Result schema factory
 */
export const createResultSchema = <T, E>(dataSchema: z.ZodType<T>, errorSchema: z.ZodType<E>) =>
  z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
    z.object({
      success: z.literal(false),
      error: errorSchema,
    }),
  ])

// ==================== EXPORTS ====================

/**
 * Re-export utility types and functions for easier consumption
 */
export type { z } from 'zod'

/**
 * Common validation helpers
 */
export const ValidationHelpers = {
  isUUID: (value: string): value is UUID => UUIDSchema.safeParse(value).success,
  isEmail: (value: string): value is Email => EmailSchema.safeParse(value).success,
  isGitHubUsername: (value: string): value is GitHubUsername =>
    GitHubUsernameSchema.safeParse(value).success,
  isISODateString: (value: string): value is ISODateString =>
    ISODateStringSchema.safeParse(value).success,
  isURL: (value: string): value is URLString => URLStringSchema.safeParse(value).success,
} as const
