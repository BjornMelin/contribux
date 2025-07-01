// Repository Queries - Drizzle ORM
// Phase 3: Type-safe queries replacing raw SQL patterns (90% code reduction)

import { and, count, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm'
import { appConfig } from '@/lib/config'
import { db, schema, timedDb, vectorUtils } from '@/lib/db'

export interface RepositorySearchOptions {
  limit?: number
  offset?: number
  sortBy?: 'stars' | 'updated' | 'created' | 'name' | 'relevance'
  order?: 'asc' | 'desc'
  minStars?: number
  maxStars?: number
  languages?: string[]
  topics?: string[]
  hasIssues?: boolean
  isArchived?: boolean
  license?: string
  afterDate?: Date
  beforeDate?: Date
}

export interface VectorSearchOptions {
  embedding: number[]
  threshold?: number
  limit?: number
  includeMetadata?: boolean
}

export interface HybridSearchOptions {
  textWeight?: number
  vectorWeight?: number
}

export namespace RepositoryQueries {
  // Helper function to build text search conditions
  function buildTextSearchConditions(query: string) {
    // Security: Sanitize search query to prevent SQL injection
    const sanitizedQuery = query
      .replace(/[%_\\]/g, '\\$&') // Escape LIKE special characters
      .replace(/'/g, "''") // Escape single quotes
      .trim()
      .substring(0, 100) // Limit length to prevent DoS

    if (!sanitizedQuery) {
      // Return a condition that matches nothing for empty queries
      return sql`FALSE`
    }

    const searchPattern = `%${sanitizedQuery}%`

    return or(
      ilike(schema.repositories.name, searchPattern),
      ilike(schema.repositories.description, searchPattern),
      ilike(schema.repositories.fullName, searchPattern),
      // Secure metadata search with proper parameterization
      sql`${schema.repositories.metadata}->>'language' ILIKE ${searchPattern}`,
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.repositories.metadata}->'topics') AS topic
        WHERE topic ILIKE ${searchPattern}
      )`
    )
  }

  // Helper function to build basic score filters
  function buildScoreFilters(minStars: number, maxStars?: number) {
    const conditions = [
      sql`COALESCE(CAST(${schema.repositories.metadata}->>'stars' AS INTEGER), 0) >= ${minStars}`,
    ]

    if (maxStars !== undefined) {
      conditions.push(
        sql`COALESCE(CAST(${schema.repositories.metadata}->>'stars' AS INTEGER), 0) <= ${maxStars}`
      )
    }

    return conditions
  }

  // Helper function to build optional filters
  function buildOptionalFilters(options: RepositorySearchOptions) {
    const conditions = []
    const {
      languages = [],
      topics = [],
      hasIssues,
      isArchived,
      license,
      afterDate,
      beforeDate,
    } = options

    // Security: Validate and sanitize language filters
    if (languages.length > 0) {
      // Limit to reasonable number of languages to prevent DoS
      const sanitizedLanguages = languages
        .slice(0, 10)
        .map(lang =>
          lang
            .replace(/[%_\\]/g, '\\$&')
            .replace(/'/g, "''")
            .trim()
        )
        .filter(lang => lang.length > 0 && lang.length <= 50)

      if (sanitizedLanguages.length > 0) {
        conditions.push(
          or(
            ...sanitizedLanguages.map(
              lang => sql`${schema.repositories.metadata}->>'language' ILIKE ${`%${lang}%`}`
            )
          )
        )
      }
    }

    // Security: Validate and sanitize topic filters
    if (topics.length > 0) {
      // Limit to reasonable number of topics and validate format
      const sanitizedTopics = topics
        .slice(0, 20)
        .map(topic => topic.replace(/'/g, "''").trim())
        .filter(topic => topic.length > 0 && topic.length <= 50 && /^[a-zA-Z0-9\-_.]+$/.test(topic))

      if (sanitizedTopics.length > 0) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${schema.repositories.metadata}->'topics') AS topic
            WHERE topic = ANY(${sanitizedTopics})
          )`
        )
      }
    }

    if (hasIssues !== undefined) {
      conditions.push(
        sql`COALESCE(CAST(${schema.repositories.metadata}->>'hasIssues' AS BOOLEAN), true) = ${hasIssues}`
      )
    }

    if (isArchived !== undefined) {
      conditions.push(
        sql`COALESCE(CAST(${schema.repositories.metadata}->>'archived' AS BOOLEAN), false) = ${isArchived}`
      )
    }

    // Security: Sanitize license filter
    if (license) {
      const sanitizedLicense = license
        .replace(/[%_\\]/g, '\\$&')
        .replace(/'/g, "''")
        .trim()
        .substring(0, 50)

      if (sanitizedLicense) {
        conditions.push(
          sql`${schema.repositories.metadata}->>'license' ILIKE ${`%${sanitizedLicense}%`}`
        )
      }
    }

    // Security: Validate date ranges to prevent injection
    if (afterDate && afterDate instanceof Date && !Number.isNaN(afterDate.getTime())) {
      conditions.push(sql`${schema.repositories.createdAt} >= ${afterDate}`)
    }

    if (beforeDate && beforeDate instanceof Date && !Number.isNaN(beforeDate.getTime())) {
      conditions.push(sql`${schema.repositories.createdAt} <= ${beforeDate}`)
    }

    return conditions
  }

  // Helper function to build order by clause
  function buildOrderBy(sortBy: string, order: string) {
    const _direction = order === 'desc' ? desc : <T>(col: T) => col

    // Security: Whitelist allowed sort columns to prevent SQL injection
    const allowedSortColumns = ['stars', 'updated', 'created', 'name', 'relevance']
    const allowedOrders = ['asc', 'desc']

    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'stars'
    const safeOrder = allowedOrders.includes(order) ? order : 'desc'

    const directionFunc = safeOrder === 'desc' ? desc : <T>(col: T) => col

    switch (safeSortBy) {
      case 'stars':
        return directionFunc(
          sql`COALESCE(CAST(${schema.repositories.metadata}->>'stars' AS INTEGER), 0)`
        )
      case 'updated':
        return directionFunc(schema.repositories.updatedAt)
      case 'created':
        return directionFunc(schema.repositories.createdAt)
      case 'name':
        return directionFunc(schema.repositories.name)
      case 'relevance':
        // Default to stars for relevance sorting (can be enhanced with actual relevance scoring)
        return directionFunc(
          sql`COALESCE(CAST(${schema.repositories.metadata}->>'stars' AS INTEGER), 0)`
        )
      default:
        return directionFunc(
          sql`COALESCE(CAST(${schema.repositories.metadata}->>'stars' AS INTEGER), 0)`
        )
    }
  }

  /**
   * Search repositories with text and metadata (replacing 50+ lines of raw SQL)
   */
  export async function search(query: string, options: RepositorySearchOptions = {}) {
    // Security: Input validation and sanitization
    if (typeof query !== 'string') {
      throw new Error('Search query must be a string')
    }

    // Trim and limit query length to prevent DoS attacks
    const sanitizedQuery = query.trim().substring(0, 200)

    if (!sanitizedQuery) {
      return []
    }

    // Security: Validate numeric options to prevent injection
    const {
      limit = 30,
      offset = 0,
      sortBy = 'stars',
      order = 'desc',
      minStars = 0,
      maxStars,
    } = options

    // Security: Validate and clamp numeric parameters
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100)
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))
    const safeMinStars = Math.max(0, Math.floor(Number(minStars) || 0))
    const safeMaxStars =
      maxStars !== undefined ? Math.max(safeMinStars, Math.floor(Number(maxStars))) : undefined

    return timedDb.select(async () => {
      // Build dynamic WHERE conditions with sanitized inputs
      const conditions = [
        // Basic text search with sanitized query
        buildTextSearchConditions(sanitizedQuery),
        // Score filters with validated numbers
        ...buildScoreFilters(safeMinStars, safeMaxStars),
        // Optional filters (already sanitized in buildOptionalFilters)
        ...buildOptionalFilters(options),
      ]

      // Build ORDER BY clause with whitelisted columns
      const orderByClause = buildOrderBy(sortBy, order)

      return await db
        .select()
        .from(schema.repositories)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(safeLimit)
        .offset(safeOffset)
    })
  }

  /**
   * Vector similarity search for repositories
   */
  export async function vectorSearch(options: VectorSearchOptions) {
    // Security: Validate vector search options
    const {
      embedding,
      threshold = appConfig.vectorSearch.similarityThreshold,
      limit = 30,
      includeMetadata = true,
    } = options

    // Security: Validate embedding vector
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array')
    }

    if (embedding.length === 0 || embedding.length > 2048) {
      throw new Error('Embedding vector length must be between 1 and 2048')
    }

    // Security: Validate all embedding values are numbers
    if (
      !embedding.every(val => typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val))
    ) {
      throw new Error('All embedding values must be finite numbers')
    }

    // Security: Validate and clamp parameters
    const safeThreshold = Math.min(Math.max(0, Number(threshold) || 0), 1)
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100)

    return timedDb.select(async () => {
      // Security: Use serialized embedding for safe parameterization
      const embeddingText = vectorUtils.serializeEmbedding(embedding)

      // Use optimized vector search with HNSW index
      const results = await db
        .select({
          repository: schema.repositories,
          similarity:
            sql<number>`1 - (${schema.repositories.embedding}::vector <=> ${embeddingText}::vector)`.as(
              'similarity'
            ),
        })
        .from(schema.repositories)
        .where(
          and(
            isNotNull(schema.repositories.embedding),
            sql`1 - (${schema.repositories.embedding}::vector <=> ${embeddingText}::vector) >= ${safeThreshold}`
          )
        )
        .orderBy(
          desc(sql`1 - (${schema.repositories.embedding}::vector <=> ${embeddingText}::vector)`)
        )
        .limit(safeLimit)

      return results.map(row => ({
        ...row.repository,
        similarity: row.similarity,
        metadata: includeMetadata ? row.repository.metadata : undefined,
      }))
    })
  }

  /**
   * Hybrid search combining text and vector search
   */
  export async function hybridSearch(
    query: string,
    embedding: number[],
    options: RepositorySearchOptions & HybridSearchOptions = {}
  ) {
    // Security: Validate search query
    if (typeof query !== 'string') {
      throw new Error('Search query must be a string')
    }

    const sanitizedQuery = query.trim().substring(0, 200)
    if (!sanitizedQuery) {
      return []
    }

    // Security: Validate embedding vector (same as vectorSearch)
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array')
    }

    if (embedding.length === 0 || embedding.length > 2048) {
      throw new Error('Embedding vector length must be between 1 and 2048')
    }

    if (
      !embedding.every(val => typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val))
    ) {
      throw new Error('All embedding values must be finite numbers')
    }

    const {
      limit = 30,
      textWeight = appConfig.vectorSearch.textWeight,
      vectorWeight = appConfig.vectorSearch.vectorWeight,
    } = options

    // Security: Validate and clamp parameters
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100)
    const safeTextWeight = Math.min(Math.max(0, Number(textWeight) || 0.3), 1)
    const safeVectorWeight = Math.min(Math.max(0, Number(vectorWeight) || 0.7), 1)

    return timedDb.select(async () => {
      // Security: Use serialized embedding for safe parameterization
      const embeddingText = vectorUtils.serializeEmbedding(embedding)
      const searchPattern = `%${sanitizedQuery.replace(/[%_\\]/g, '\\$&').replace(/'/g, "''")}%`

      // Hybrid search query combining text relevance and vector similarity
      const results = await db
        .select({
          repository: schema.repositories,
          textScore: sql<number>`
            CASE 
              WHEN ${schema.repositories.name} ILIKE ${searchPattern} THEN 1.0
              WHEN ${schema.repositories.description} ILIKE ${searchPattern} THEN 0.8
              WHEN ${schema.repositories.metadata}->>'language' ILIKE ${searchPattern} THEN 0.6
              ELSE 0.0
            END
          `.as('text_score'),
          vectorScore: sql<number>`
            CASE 
              WHEN ${schema.repositories.embedding} IS NOT NULL 
              THEN 1 - (${schema.repositories.embedding}::vector <=> ${embeddingText}::vector)
              ELSE 0.0
            END
          `.as('vector_score'),
          hybridScore: sql<number>`
            (
              CASE 
                WHEN ${schema.repositories.name} ILIKE ${searchPattern} THEN 1.0
                WHEN ${schema.repositories.description} ILIKE ${searchPattern} THEN 0.8
                WHEN ${schema.repositories.metadata}->>'language' ILIKE ${searchPattern} THEN 0.6
                ELSE 0.0
              END * ${safeTextWeight}
            ) + (
              CASE 
                WHEN ${schema.repositories.embedding} IS NOT NULL 
                THEN (1 - (${schema.repositories.embedding}::vector <=> ${embeddingText}::vector)) * ${safeVectorWeight}
                ELSE 0.0
              END
            )
          `.as('hybrid_score'),
        })
        .from(schema.repositories)
        .where(
          or(
            ilike(schema.repositories.name, searchPattern),
            ilike(schema.repositories.description, searchPattern),
            sql`${schema.repositories.metadata}->>'language' ILIKE ${searchPattern}`,
            and(
              isNotNull(schema.repositories.embedding),
              sql`1 - (${schema.repositories.embedding}::vector <=> ${embeddingText}::vector) >= ${appConfig.vectorSearch.similarityThreshold}`
            )
          )
        )
        .orderBy(desc(sql`hybrid_score`))
        .limit(safeLimit)

      return results.map(row => ({
        ...row.repository,
        scores: {
          text: row.textScore,
          vector: row.vectorScore,
          hybrid: row.hybridScore,
        },
      }))
    })
  }

  /**
   * Get repository by GitHub ID
   */
  export async function getByGithubId(githubId: number) {
    return timedDb.select(async () => {
      const results = await db
        .select()
        .from(schema.repositories)
        .where(eq(schema.repositories.githubId, githubId))
        .limit(1)

      return results[0] || null
    })
  }

  /**
   * Get repository with opportunities (type-safe join)
   */
  export async function getWithOpportunities(repositoryId: string) {
    return timedDb.select(async () => {
      const result = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, repositoryId),
        with: {
          opportunities: {
            orderBy: [
              desc(schema.opportunities.impactScore),
              desc(schema.opportunities.matchScore),
            ],
            limit: 20,
          },
        },
      })

      return result || null
    })
  }

  /**
   * Upsert repository data (insert or update)
   */
  export async function upsert(data: {
    githubId: number
    fullName: string
    name: string
    owner: string
    description?: string
    metadata?: Record<string, unknown>
    healthMetrics?: Record<string, unknown>
    embedding?: string
  }) {
    return timedDb.upsert(async () => {
      const results = await db
        .insert(schema.repositories)
        .values({
          ...data,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.repositories.githubId,
          set: {
            fullName: data.fullName,
            name: data.name,
            owner: data.owner,
            description: data.description,
            metadata: data.metadata,
            healthMetrics: data.healthMetrics,
            embedding: data.embedding,
            updatedAt: sql`now()`,
          },
        })
        .returning()

      return results[0]
    })
  }

  /**
   * Get repository statistics
   */
  export async function getStats() {
    return timedDb.select(async () => {
      const [totalRepos] = await db.select({ count: count() }).from(schema.repositories)

      const [withEmbeddings] = await db
        .select({ count: count() })
        .from(schema.repositories)
        .where(isNotNull(schema.repositories.embedding))

      const [recentlyUpdated] = await db
        .select({ count: count() })
        .from(schema.repositories)
        .where(sql`${schema.repositories.updatedAt} >= NOW() - INTERVAL '7 days'`)

      // Add null safety checks for count queries
      const totalCount = totalRepos?.count ?? 0
      const withEmbeddingsCount = withEmbeddings?.count ?? 0
      const recentlyUpdatedCount = recentlyUpdated?.count ?? 0

      return {
        total: totalCount,
        withEmbeddings: withEmbeddingsCount,
        recentlyUpdated: recentlyUpdatedCount,
        embeddingCoverage: totalCount > 0 ? (withEmbeddingsCount / totalCount) * 100 : 0,
      }
    })
  }

  /**
   * Batch update embeddings
   */
  export async function updateEmbeddings(updates: Array<{ id: string; embedding: string }>) {
    return timedDb.update(async () => {
      const results = []

      // Process in batches of 10 for optimal performance
      for (let i = 0; i < updates.length; i += 10) {
        const batch = updates.slice(i, i + 10)

        const batchPromises = batch.map(update =>
          db
            .update(schema.repositories)
            .set({
              embedding: update.embedding,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.repositories.id, update.id))
            .returning({ id: schema.repositories.id })
        )

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults.flat())
      }

      return results
    })
  }
}
