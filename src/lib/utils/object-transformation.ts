/**
 * Object Transformation Utilities
 * Pure functions for converting between different naming conventions
 */

/**
 * Convert snake_case to camelCase for objects recursively
 */
export function toCamelCase<T = unknown>(obj: unknown): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item)) as T
  }

  const camelCased: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    camelCased[camelKey] = toCamelCase(value)
  }

  return camelCased as T
}

/**
 * Convert camelCase to snake_case for objects recursively
 */
export function toSnakeCase<T = unknown>(obj: unknown): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeCase(item)) as T
  }

  const snakeCased: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    snakeCased[snakeKey] = toSnakeCase(value)
  }

  return snakeCased as T
}

/**
 * Estimate the memory size of an object in bytes
 */
export function estimateObjectSize(data: unknown): number {
  try {
    return JSON.stringify(data).length * 2 // Rough estimate (UTF-16)
  } catch {
    return 1000 // Default size for non-serializable data
  }
}

/**
 * Deep clone an object with proper type safety
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T
  }

  const cloned = {} as T
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      cloned[key] = deepClone(obj[key])
    }
  }

  return cloned
}

/**
 * Remove undefined and null values from an object
 */
export function cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      cleaned[key as keyof T] = value as T[keyof T]
    }
  }

  return cleaned
}
