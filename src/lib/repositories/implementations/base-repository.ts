/**
 * Base Repository Implementation
 * Provides common functionality for all repository implementations
 */

import { and, asc, desc, eq, gte, like, lte, or } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import type { Optional, Repository, Result } from '@/lib/types/advanced'
import { Failure, Success } from '@/lib/types/advanced'

export abstract class BaseRepository<T, ID = string> implements Repository<T, ID> {
  protected readonly db = db
  protected abstract table: PgTable
  protected abstract idColumn: any

  /**
   * Find entity by ID
   */
  async findById(id: ID): Promise<Optional<T>> {
    try {
      const [result] = await this.db.select().from(this.table).where(eq(this.idColumn, id)).limit(1)

      return result ? this.mapToEntity(result) : null
    } catch (error) {
      this.handleError('findById', error)
      return null
    }
  }

  /**
   * Find all entities
   */
  async findAll(): Promise<T[]> {
    try {
      const results = await this.db.select().from(this.table)

      return results.map(result => this.mapToEntity(result))
    } catch (error) {
      this.handleError('findAll', error)
      return []
    }
  }

  /**
   * Create new entity
   */
  async create(entity: Omit<T, 'id'>): Promise<T> {
    try {
      const data = this.mapFromEntity(entity)
      const [result] = await this.db.insert(this.table).values(data).returning()

      return this.mapToEntity(result)
    } catch (error) {
      this.handleError('create', error)
      throw error
    }
  }

  /**
   * Update entity by ID
   */
  async update(id: ID, updates: Partial<T>): Promise<Optional<T>> {
    try {
      const data = this.mapFromEntity(updates as Partial<T>)
      const [result] = await this.db
        .update(this.table)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(this.idColumn, id))
        .returning()

      return result ? this.mapToEntity(result) : null
    } catch (error) {
      this.handleError('update', error)
      return null
    }
  }

  /**
   * Delete entity by ID
   */
  async delete(id: ID): Promise<boolean> {
    try {
      const result = await this.db.delete(this.table).where(eq(this.idColumn, id))

      return result.rowCount > 0
    } catch (error) {
      this.handleError('delete', error)
      return false
    }
  }

  /**
   * Execute operation with error handling and return Result
   */
  protected async executeWithResult<R>(
    operation: string,
    fn: () => Promise<R>
  ): Promise<Result<R, Error>> {
    try {
      const result = await fn()
      return Success(result)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.handleError(operation, err)
      return Failure(err)
    }
  }

  /**
   * Execute paginated query
   */
  protected async executePaginated<R>(
    query: any,
    page = 1,
    pageSize = 20
  ): Promise<{
    items: R[]
    total: number
    hasMore: boolean
    page: number
    pageSize: number
  }> {
    const offset = (page - 1) * pageSize

    // Execute query with pagination
    const items = await query
      .limit(pageSize + 1) // Get one extra to check if there are more
      .offset(offset)

    const hasMore = items.length > pageSize
    const actualItems = hasMore ? items.slice(0, pageSize) : items

    // Get total count (this could be cached for performance)
    const totalQuery = await this.db.select({ count: 'count(*)' }).from(this.table)

    const total = Number(totalQuery[0]?.count || 0)

    return {
      items: actualItems.map(item => this.mapToEntity(item)),
      total,
      hasMore,
      page,
      pageSize,
    }
  }

  /**
   * Build dynamic where conditions
   */
  protected buildWhereConditions(filters: Record<string, any>): any[] {
    const conditions: any[] = []

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue

      if (Array.isArray(value)) {
        // Handle array filters (IN clause)
        if (value.length > 0) {
          conditions.push(this.table[key].in(value))
        }
      } else if (typeof value === 'string' && value.includes('%')) {
        // Handle LIKE queries
        conditions.push(like(this.table[key], value))
      } else if (typeof value === 'object' && value.min !== undefined) {
        // Handle range queries
        if (value.min !== undefined) {
          conditions.push(gte(this.table[key], value.min))
        }
        if (value.max !== undefined) {
          conditions.push(lte(this.table[key], value.max))
        }
      } else {
        // Handle exact matches
        conditions.push(eq(this.table[key], value))
      }
    }

    return conditions
  }

  /**
   * Build order by conditions
   */
  protected buildOrderBy(sort?: Array<{ field: string; direction: 'asc' | 'desc' }>): any[] {
    if (!sort || sort.length === 0) {
      return [desc(this.table.createdAt)] // Default sort
    }

    return sort.map(({ field, direction }) => {
      const column = this.table[field]
      return direction === 'asc' ? asc(column) : desc(column)
    })
  }

  /**
   * Execute transaction
   */
  protected async executeInTransaction<R>(
    fn: (trx: typeof this.db) => Promise<R>
  ): Promise<Result<R, Error>> {
    try {
      const result = await this.db.transaction(async trx => {
        return await fn(trx)
      })
      return Success(result)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.handleError('transaction', err)
      return Failure(err)
    }
  }

  /**
   * Batch operations helper
   */
  protected async executeBatch<R>(
    operations: Array<() => Promise<R>>
  ): Promise<Result<R[], Error>> {
    try {
      const results = await Promise.all(operations.map(op => op()))
      return Success(results)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.handleError('batch', err)
      return Failure(err)
    }
  }

  /**
   * Map database row to entity
   */
  protected abstract mapToEntity(row: any): T

  /**
   * Map entity to database row
   */
  protected abstract mapFromEntity(entity: Partial<T>): any

  /**
   * Handle errors consistently
   */
  protected handleError(operation: string, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error))

    // Log error (using logger service if available)
    console.error(`Repository error in ${this.constructor.name}.${operation}:`, {
      message: err.message,
      stack: err.stack,
      operation,
    })

    // Could integrate with monitoring service here
    // this.monitoringService?.recordError(err, { operation, repository: this.constructor.name })
  }

  /**
   * Cache helper (to be overridden if caching is needed)
   */
  protected async withCache<R>(key: string, fn: () => Promise<R>, ttlSeconds = 300): Promise<R> {
    // Simple in-memory cache implementation
    // In production, this would use Redis or similar
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as R
    }

    const result = await fn()
    this.cache.set(key, {
      value: result,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })

    return result
  }

  private cache = new Map<string, { value: any; expiresAt: number }>()

  /**
   * Clear cache entries
   */
  protected clearCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Validation helper
   */
  protected validateEntity(entity: Partial<T>): Result<void, Error> {
    // Override in subclasses for specific validation
    return Success(void 0)
  }

  /**
   * Generate UUID for new entities
   */
  protected generateId(): string {
    return crypto.randomUUID()
  }

  /**
   * Convert snake_case to camelCase
   */
  protected toCamelCase(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.toCamelCase(item))
    }

    const camelCased: any = {}
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      camelCased[camelKey] = this.toCamelCase(value)
    }

    return camelCased
  }

  /**
   * Convert camelCase to snake_case
   */
  protected toSnakeCase(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.toSnakeCase(item))
    }

    const snakeCased: any = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
      snakeCased[snakeKey] = this.toSnakeCase(value)
    }

    return snakeCased
  }

  /**
   * Get repository metrics
   */
  public getMetrics(): {
    cacheSize: number
    cacheHitRate: number
    operationCounts: Record<string, number>
  } {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: this.calculateCacheHitRate(),
      operationCounts: this.operationCounts,
    }
  }

  private operationCounts: Record<string, number> = {}
  private cacheHits = 0
  private cacheMisses = 0

  private calculateCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses
    return total > 0 ? this.cacheHits / total : 0
  }

  /**
   * Record operation for metrics
   */
  protected recordOperation(operation: string): void {
    this.operationCounts[operation] = (this.operationCounts[operation] || 0) + 1
  }
}
