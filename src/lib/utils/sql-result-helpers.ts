import { z } from 'zod'

/**
 * Type-safe helpers for Neon SQL result handling
 *
 * These utilities provide safe access to SQL query results with proper TypeScript typing
 * and respect for the strict noUncheckedIndexedAccess configuration.
 */

// Common SQL result schemas
export const singleTextResultSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null()])
)

export const singleNumberResultSchema = z.record(z.number())

export const singleVersionResultSchema = z.object({
  version: z.string(),
})

export const extensionVersionResultSchema = z.object({
  extversion: z.string(),
})

export const testResultSchema = z.object({
  test: z.number(),
})

export const safeParamResultSchema = z.object({
  safe_param: z.string(),
})

export const distanceResultSchema = z.object({
  distance: z.number(),
})

export const similarityResultSchema = z.object({
  sim: z.number(),
})

export const cosineResultSchema = z.object({
  cosine_similarity: z.number(),
})

export const matchesResultSchema = z.object({
  matches: z.boolean(),
})

/**
 * Safely get the first row from a SQL result array
 */
export function getFirstRow<T>(result: T[] | unknown, schema: z.ZodSchema<T>): T | null {
  if (!Array.isArray(result) || result.length === 0) {
    return null
  }

  const firstRow = result[0]
  if (!firstRow) {
    return null
  }

  try {
    return schema.parse(firstRow)
  } catch {
    return null
  }
}

/**
 * Safely get a specific property from the first row of a SQL result
 */
export function getFirstRowProperty<T>(
  result: unknown[] | unknown,
  propertyName: string,
  validator: (value: unknown) => value is T
): T | null {
  if (!Array.isArray(result) || result.length === 0) {
    return null
  }

  const firstRow = result[0]
  if (!firstRow || typeof firstRow !== 'object' || firstRow === null) {
    return null
  }

  const value = (firstRow as Record<string, unknown>)[propertyName]
  return validator(value) ? value : null
}

/**
 * Type guard for string values
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Type guard for number values
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

/**
 * Type guard for boolean values
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Safely access array elements with proper type checking
 */
export function safeArrayAccess<T>(
  array: T[] | unknown,
  index: number,
  validator: (value: unknown) => value is T
): T | null {
  if (!Array.isArray(array) || index < 0 || index >= array.length) {
    return null
  }

  const value = array[index]
  return validator(value) ? value : null
}

/**
 * Type-safe SQL result array validator
 */
export function isSqlResultArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(item => typeof item === 'object' && item !== null)
}

/**
 * Extract a property safely from a SQL result object
 */
export function extractProperty<T>(
  obj: unknown,
  propertyName: string,
  validator: (value: unknown) => value is T
): T | null {
  if (typeof obj !== 'object' || obj === null) {
    return null
  }

  const value = (obj as Record<string, unknown>)[propertyName]
  return validator(value) ? value : null
}
