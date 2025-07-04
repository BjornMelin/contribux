/**
 * Shared Validation Utilities
 * Common validation patterns and utilities used across the application
 */

import { z } from 'zod'

// Common validation schemas
export const EmailSchema = z.string().email('Invalid email address')
export const UUIDSchema = z.string().uuid('Invalid UUID format')
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
