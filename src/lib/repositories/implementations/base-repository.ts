/**
 * Base Repository Implementation
 * Provides common functionality for all repository implementations
 */

import { asc, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm'
import type { PgColumn, PgTable, PgTransaction } from 'drizzle-orm/pg-core'

import { db } from '@/lib/db'
import type { Optional, Repository, Result } from '@/lib/types/advanced'
import { Failure, Success } from '@/lib/types/advanced'

// Type definitions for repository operations
interface FilterValue {
  min?: unknown
  max?: unknown
}

interface DatabaseRow {
  [key: string]: unknown
}

// Fix PaginatedQuery interface to match Drizzle's query builder pattern
interface PaginatedQuery {
  limit(count: number): PaginatedQuery
  offset(count: number): PaginatedQuery
  execute(): Promise<DatabaseRow[]>
}

interface OrderByOption {
  field: string
  direction: 'asc' | 'desc'
}

interface CacheEntry {
  value: unknown
  expiresAt: number
  hitCount: number
  createdAt: number
}

export abstract class BaseRepository<T, ID = string> implements Repository<T, ID> {
  protected readonly db = db
  protected abstract table: PgTable
  protected abstract idColumn: PgColumn

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
      const data = this.mapFromEntity(entity as Partial<T>)
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
  protected async executePaginated(
    query: PaginatedQuery,
    page = 1,
    pageSize = 20
  ): Promise<{
    items: T[]
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
      .execute()

    const hasMore = items.length > pageSize
    const actualItems = hasMore ? items.slice(0, pageSize) : items

    // Get total count (this could be cached for performance)
    const totalQuery = await this.db.select({ count: sql<number>`count(*)` }).from(this.table)

    const total = Number(totalQuery[0]?.count || 0)

    return {
      items: actualItems.map((item: DatabaseRow) => this.mapToEntity(item)),
      total,
      hasMore,
      page,
      pageSize,
    }
  }

  /**
   * Build dynamic where conditions (optimized for low cognitive complexity)
   */
  protected buildWhereConditions(filters: Record<string, unknown>): unknown[] {
    const conditions: unknown[] = []

    for (const [key, value] of Object.entries(filters)) {
      const condition = this.buildSingleCondition(key, value)
      if (condition) {
        conditions.push(condition)
      }
    }

    return conditions
  }

  /**
   * Build single condition (extracted for clarity and reusability)
   */
  private buildSingleCondition(key: string, value: unknown): unknown | null {
    if (value === undefined || value === null) return null

    const column = this.getTableColumn(key)
    if (!column) return null

    // Early return pattern for better readability
    if (Array.isArray(value)) {
      return this.buildArrayCondition(column, value)
    }

    if (typeof value === 'string' && value.includes('%')) {
      return this.buildLikeCondition(column, value)
    }

    if (typeof value === 'object' && value !== null && ('min' in value || 'max' in value)) {
      return this.buildRangeCondition(column, value as FilterValue)
    }

    return this.buildExactCondition(column, value)
  }

  /**
   * Build array condition (IN clause)
   */
  private buildArrayCondition(column: PgColumn, values: unknown[]): unknown | null {
    return values.length > 0 ? inArray(column, values) : null
  }

  /**
   * Build LIKE condition for pattern matching
   */
  private buildLikeCondition(column: PgColumn, value: string): unknown {
    return like(column, value)
  }

  /**
   * Build range condition (between min/max)
   */
  private buildRangeCondition(column: PgColumn, range: FilterValue): unknown {
    const conditions = []

    if (range.min !== undefined) conditions.push(gte(column, range.min))
    if (range.max !== undefined) conditions.push(lte(column, range.max))

    return conditions.length === 1 ? conditions[0] : sql`${conditions.join(' AND ')}`
  }

  /**
   * Build exact match condition
   */
  private buildExactCondition(column: PgColumn, value: unknown): unknown {
    return eq(column, value)
  }

  /**
   * Get table column by name safely
   */
  protected abstract getTableColumn(columnName: string): PgColumn | null

  /**
   * Build order by conditions
   */
  protected buildOrderBy(sort?: OrderByOption[]): unknown[] {
    if (!sort || sort.length === 0) {
      const createdAtColumn = this.getTableColumn('createdAt')
      return createdAtColumn ? [desc(createdAtColumn)] : []
    }

    return sort
      .map(({ field, direction }) => {
        const column = this.getTableColumn(field)
        return column ? (direction === 'asc' ? asc(column) : desc(column)) : null
      })
      .filter(Boolean) as unknown[]
  }

  /**
   * Execute transaction
   */
  protected async executeInTransaction<R>(
    fn: (trx: PgTransaction<any, any, any>) => Promise<R>
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
  protected abstract mapToEntity(row: DatabaseRow): T

  /**
   * Map entity to database row
   */
  protected abstract mapFromEntity(entity: Partial<T>): DatabaseRow

  /**
   * Handle errors consistently
   */
  protected handleError(_operation: string, error: unknown): void {
    const _err = error instanceof Error ? error : new Error(String(error))

    // Could integrate with monitoring service here
    // this.monitoringService?.recordError(err, { operation, repository: this.constructor.name })
  }

  /**
   * Cache helper with memory optimization
   */
  protected async withCache<R>(key: string, fn: () => Promise<R>, ttlSeconds = 300): Promise<R> {
    this.cleanupExpiredCache()

    const cached = this.getCachedValue<R>(key)
    if (cached) return cached

    return this.setCachedValue(key, await fn(), ttlSeconds)
  }

  /**
   * Get cached value if valid
   */
  private getCachedValue<R>(key: string): R | null {
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      cached.hitCount++
      this.cacheHits++
      return cached.value as R
    }

    this.cacheMisses++
    return null
  }

  /**
   * Set cached value with size management
   */
  private setCachedValue<R>(key: string, value: R, ttlSeconds: number): R {
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRUCacheEntry()
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      hitCount: 0,
      createdAt: Date.now(),
    })

    return value
  }

  private cache = new Map<string, CacheEntry>()
  private maxCacheSize = 500
  private lastCleanup = Date.now()

  /**
   * Cleanup expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now()

    // Only cleanup every 5 minutes to avoid overhead
    if (now - this.lastCleanup < 300000) return

    this.lastCleanup = now

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Evict least recently used cache entry
   */
  private evictLRUCacheEntry(): void {
    const lruEntry = this.findLRUEntry()
    if (lruEntry) {
      this.cache.delete(lruEntry.key)
    }
  }

  /**
   * Find the least recently used cache entry
   */
  private findLRUEntry(): { key: string; score: number } | null {
    let lruKey = ''
    let lruScore = Number.POSITIVE_INFINITY

    for (const [key, entry] of this.cache.entries()) {
      const score = this.calculateLRUScore(entry)
      if (score < lruScore) {
        lruScore = score
        lruKey = key
      }
    }

    return lruKey ? { key: lruKey, score: lruScore } : null
  }

  /**
   * Calculate LRU score for cache entry
   */
  private calculateLRUScore(entry: { hitCount: number; createdAt: number }): number {
    return entry.hitCount > 0 ? entry.createdAt / entry.hitCount : entry.createdAt
  }

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
  protected validateEntity(_entity: Partial<T>): Result<void, Error> {
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
    return total === 0 ? 0 : this.cacheHits / total
  }

  /**
   * Record operation for metrics
   */
  protected recordOperation(operation: string): void {
    this.operationCounts[operation] = (this.operationCounts[operation] || 0) + 1
  }
}
