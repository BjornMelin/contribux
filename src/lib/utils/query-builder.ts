/**
 * Query Builder Utilities
 * Pure functions for building database queries
 */

import { type SQL, asc, desc, eq, gte, inArray, like, lte } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

export interface SortOption {
  field: string
  direction: 'asc' | 'desc'
}

export interface RangeFilter {
  min?: number
  max?: number
}

export interface PaginationOptions {
  page: number
  pageSize: number
}

export interface PaginationResult<T> {
  items: T[]
  total: number
  hasMore: boolean
  page: number
  pageSize: number
}

/**
 * Build WHERE conditions from filters object
 */
export function buildWhereConditions(table: PgTable, filters: Record<string, unknown>): SQL[] {
  const conditions: SQL[] = []

  for (const [key, value] of Object.entries(filters)) {
    const condition = buildSingleWhereCondition(table, key, value)
    if (condition) {
      conditions.push(condition)
    }
  }

  return conditions
}

/**
 * Type-safe helper to get column from table
 */
function getTableColumn(table: PgTable, key: string): PgColumn | null {
  // Safely access table properties using bracket notation
  const tableRecord = table as unknown as Record<string, unknown>
  const column = tableRecord[key]

  // Check if the column has the expected Drizzle column structure
  if (
    column &&
    typeof column === 'object' &&
    column !== null &&
    'dataType' in column &&
    'columnType' in column
  ) {
    return column as PgColumn
  }

  return null
}

/**
 * Build single WHERE condition for a field
 */
function buildSingleWhereCondition(table: PgTable, key: string, value: unknown): SQL | null {
  if (value === undefined || value === null) return null

  const column = getTableColumn(table, key)
  if (!column) return null

  return createConditionForValue(column, value)
}

/**
 * Create condition based on value type
 */
function createConditionForValue(column: unknown, value: unknown): SQL | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? inArray(column as Parameters<typeof inArray>[0], value) : null
  }

  if (typeof value === 'string' && value.includes('%')) {
    return like(column as Parameters<typeof like>[0], value)
  }

  if (isRangeFilter(value)) {
    return createRangeCondition(column, value)
  }

  return eq(column as Parameters<typeof eq>[0], value)
}

/**
 * Create range condition for min/max values
 */
function createRangeCondition(column: unknown, range: RangeFilter): SQL | null {
  const conditions: SQL[] = []
  const typedColumn = column as Parameters<typeof gte>[0]

  if (range.min !== undefined) {
    conditions.push(gte(typedColumn, range.min))
  }
  if (range.max !== undefined) {
    conditions.push(lte(typedColumn, range.max))
  }

  return conditions.length > 0 ? conditions[0] : null
}

/**
 * Build ORDER BY conditions
 */
export function buildOrderBy(
  table: PgTable,
  sort?: SortOption[],
  defaultSort: SortOption = { field: 'createdAt', direction: 'desc' }
): SQL[] {
  const sortOptions = sort && sort.length > 0 ? sort : [defaultSort]

  return sortOptions.map(({ field, direction }) => {
    const column = getTableColumn(table, field)
    if (!column) {
      throw new Error(`Invalid sort field: ${field}`)
    }
    return direction === 'asc'
      ? asc(column as Parameters<typeof asc>[0])
      : desc(column as Parameters<typeof desc>[0])
  })
}

/**
 * Calculate pagination offset
 */
export function calculateOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize)
}

/**
 * Process paginated results
 */
export function processPaginatedResults<T, R>(
  items: T[],
  pageSize: number,
  page: number,
  total: number,
  mapper: (item: T) => R
): PaginationResult<R> {
  const hasMore = items.length > pageSize
  const actualItems = hasMore ? items.slice(0, pageSize) : items

  return {
    items: actualItems.map(mapper),
    total,
    hasMore,
    page,
    pageSize,
  }
}

/**
 * Validate pagination parameters
 */
export function validatePagination(
  page: number,
  pageSize: number,
  maxPageSize = 100
): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Math.floor(page)),
    pageSize: Math.min(Math.max(1, Math.floor(pageSize)), maxPageSize),
  }
}

/**
 * Type guard for range filter
 */
function isRangeFilter(value: unknown): value is RangeFilter {
  return typeof value === 'object' && value !== null && ('min' in value || 'max' in value)
}

/**
 * Sanitize search query for LIKE operations
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/[%_\\]/g, '\\$&') // Escape special LIKE characters
    .trim()
}

/**
 * Build search pattern for LIKE queries
 */
export function buildSearchPattern(
  query: string,
  type: 'contains' | 'starts' | 'ends' = 'contains'
): string {
  const sanitized = sanitizeSearchQuery(query)

  const patterns: Record<string, (q: string) => string> = {
    starts: q => `${q}%`,
    ends: q => `%${q}`,
    contains: q => `%${q}%`,
  }

  return patterns[type]?.(sanitized) ?? `%${sanitized}%`
}

/**
 * Create filter validation rules
 */
export function createFilterValidator<T extends Record<string, unknown>>(
  allowedFields: (keyof T)[],
  fieldTypes: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'array' | 'range'>>
) {
  return (filters: Partial<T>): { valid: Partial<T>; invalid: string[] } => {
    const valid: Partial<T> = {}
    const invalid: string[] = []

    for (const [key, value] of Object.entries(filters)) {
      if (!allowedFields.includes(key as keyof T)) {
        invalid.push(`Field '${key}' is not allowed`)
        continue
      }

      const expectedType = fieldTypes[key as keyof T]
      if (expectedType && !validateFieldType(value, expectedType)) {
        invalid.push(`Field '${key}' has invalid type`)
        continue
      }

      valid[key as keyof T] = value
    }

    return { valid, invalid }
  }
}

/**
 * Validate field type
 */
function validateFieldType(value: unknown, expectedType: string): boolean {
  const validators: Record<string, (val: unknown) => boolean> = {
    string: val => typeof val === 'string',
    number: val => typeof val === 'number' && !Number.isNaN(val),
    boolean: val => typeof val === 'boolean',
    array: val => Array.isArray(val),
    range: val => isRangeFilter(val),
  }

  return validators[expectedType]?.(value) ?? true
}
