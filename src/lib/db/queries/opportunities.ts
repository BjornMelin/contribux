// Opportunity Queries - Drizzle ORM
// Phase 3: Type-safe queries for contribution opportunities

import { and, count, desc, eq, gte, ilike, isNotNull, lte, or, sql } from 'drizzle-orm'
import { appConfig } from '@/lib/config'
import { db, schema, timedDb, vectorUtils } from '@/lib/db'

export interface OpportunitySearchOptions {
  limit?: number
  offset?: number
  sortBy?: 'difficulty' | 'impact' | 'match' | 'created' | 'updated' | 'relevance'
  order?: 'asc' | 'desc'
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  minDifficultyScore?: number
  maxDifficultyScore?: number
  minImpactScore?: number
  maxImpactScore?: number
  repositoryId?: string
  goodFirstIssue?: boolean
  mentorshipAvailable?: boolean
  hacktoberfest?: boolean
  labels?: string[]
  skillsRequired?: string[]
  afterDate?: Date
  beforeDate?: Date
}

export interface OpportunityVectorSearchOptions {
  embedding: number[]
  threshold?: number
  limit?: number
  includeRepository?: boolean
}

export namespace OpportunityQueries {
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
      ilike(schema.opportunities.title, searchPattern),
      ilike(schema.opportunities.description, searchPattern),
      // Security: Secure metadata search with proper parameterization
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'labels') AS label
        WHERE label ILIKE ${searchPattern}
      )`,
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'skillsRequired') AS skill
        WHERE skill ILIKE ${searchPattern}
      )`
    )
  }

  // Helper function to validate repository ID
  function validateRepositoryId(repositoryId: string | undefined) {
    if (repositoryId) {
      if (typeof repositoryId !== 'string' || !repositoryId.trim()) {
        throw new Error('Invalid repository ID: must be a non-empty string')
      }
      return eq(schema.opportunities.repositoryId, repositoryId.trim())
    }
    return null
  }

  // Helper function to validate difficulty
  function validateDifficulty(difficulty: string | undefined) {
    if (difficulty) {
      const validDifficulties = ['beginner', 'intermediate', 'advanced']
      if (!validDifficulties.includes(difficulty)) {
        throw new Error('Invalid difficulty: must be beginner, intermediate, or advanced')
      }
      return sql`${schema.opportunities.metadata}->>'difficulty' = ${difficulty}`
    }
    return null
  }

  // Helper function to build boolean filters
  function buildBooleanFilters(options: {
    goodFirstIssue?: boolean
    mentorshipAvailable?: boolean
    hacktoberfest?: boolean
  }) {
    const conditions = []
    const { goodFirstIssue, mentorshipAvailable, hacktoberfest } = options

    if (goodFirstIssue !== undefined) {
      conditions.push(
        sql`COALESCE(CAST(${schema.opportunities.metadata}->>'goodFirstIssue' AS BOOLEAN), false) = ${goodFirstIssue}`
      )
    }

    if (mentorshipAvailable !== undefined) {
      conditions.push(
        sql`COALESCE(CAST(${schema.opportunities.metadata}->>'mentorshipAvailable' AS BOOLEAN), false) = ${mentorshipAvailable}`
      )
    }

    if (hacktoberfest !== undefined) {
      conditions.push(
        sql`COALESCE(CAST(${schema.opportunities.metadata}->>'hacktoberfest' AS BOOLEAN), false) = ${hacktoberfest}`
      )
    }

    return conditions
  }

  // Helper function to validate and sanitize labels
  function validateLabels(labels: string[]) {
    if (labels.length === 0) {
      return null
    }

    const sanitizedLabels = labels
      .slice(0, 20) // Limit to 20 labels
      .map(label => (typeof label === 'string' ? label.replace(/'/g, "''").trim() : ''))
      .filter(
        label => label.length > 0 && label.length <= 100 && /^[a-zA-Z0-9\-_.:\s]+$/.test(label)
      )

    if (sanitizedLabels.length > 0) {
      return sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'labels') AS label
        WHERE label = ANY(${sanitizedLabels})
      )`
    }
    return null
  }

  // Helper function to validate and sanitize skills
  function validateSkills(skillsRequired: string[]) {
    if (skillsRequired.length === 0) {
      return null
    }

    const sanitizedSkills = skillsRequired
      .slice(0, 15) // Limit to 15 skills
      .map(skill => (typeof skill === 'string' ? skill.replace(/'/g, "''").trim() : ''))
      .filter(
        skill => skill.length > 0 && skill.length <= 50 && /^[a-zA-Z0-9\-_.+#\s]+$/.test(skill)
      )

    if (sanitizedSkills.length > 0) {
      return sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'skillsRequired') AS skill
        WHERE skill = ANY(${sanitizedSkills})
      )`
    }
    return null
  }

  // Helper function to validate date ranges
  function validateDateRanges(afterDate?: Date, beforeDate?: Date) {
    const conditions = []

    if (afterDate && afterDate instanceof Date && !Number.isNaN(afterDate.getTime())) {
      conditions.push(gte(schema.opportunities.createdAt, afterDate))
    }

    if (beforeDate && beforeDate instanceof Date && !Number.isNaN(beforeDate.getTime())) {
      conditions.push(lte(schema.opportunities.createdAt, beforeDate))
    }

    return conditions
  }

  // Helper function to build optional filters
  function buildOptionalFilters(options: OpportunitySearchOptions) {
    const conditions = []
    const {
      repositoryId,
      difficulty,
      goodFirstIssue,
      mentorshipAvailable,
      hacktoberfest,
      labels = [],
      skillsRequired = [],
      afterDate,
      beforeDate,
    } = options

    // Add repository ID condition
    const repoCondition = validateRepositoryId(repositoryId)
    if (repoCondition) conditions.push(repoCondition)

    // Add difficulty condition
    const difficultyCondition = validateDifficulty(difficulty)
    if (difficultyCondition) conditions.push(difficultyCondition)

    // Add boolean filters - ensure proper type handling for exactOptionalPropertyTypes
    const booleanFilterOptions: {
      goodFirstIssue?: boolean
      mentorshipAvailable?: boolean
      hacktoberfest?: boolean
    } = {}
    if (goodFirstIssue !== undefined) booleanFilterOptions.goodFirstIssue = goodFirstIssue
    if (mentorshipAvailable !== undefined)
      booleanFilterOptions.mentorshipAvailable = mentorshipAvailable
    if (hacktoberfest !== undefined) booleanFilterOptions.hacktoberfest = hacktoberfest
    conditions.push(...buildBooleanFilters(booleanFilterOptions))

    // Add labels condition
    const labelsCondition = validateLabels(labels)
    if (labelsCondition) conditions.push(labelsCondition)

    // Add skills condition
    const skillsCondition = validateSkills(skillsRequired)
    if (skillsCondition) conditions.push(skillsCondition)

    // Add date range conditions
    conditions.push(...validateDateRanges(afterDate, beforeDate))

    return conditions
  }

  // Helper function to build order by clause
  function buildOrderBy(sortBy: string, order: string) {
    // Security: Whitelist allowed sort columns to prevent SQL injection
    const allowedSortColumns = ['difficulty', 'impact', 'match', 'created', 'updated', 'relevance']
    const allowedOrders = ['asc', 'desc']

    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'match'
    const safeOrder = allowedOrders.includes(order) ? order : 'desc'

    const direction = safeOrder === 'desc' ? desc : <T>(col: T) => col

    switch (safeSortBy) {
      case 'difficulty':
        return direction(schema.opportunities.difficultyScore)
      case 'impact':
        return direction(schema.opportunities.impactScore)
      case 'match':
        return direction(schema.opportunities.matchScore)
      case 'created':
        return direction(schema.opportunities.createdAt)
      case 'updated':
        return direction(schema.opportunities.updatedAt)
      default:
        return direction(schema.opportunities.matchScore)
    }
  }

  /**
   * Search opportunities with text and metadata filters
   */
  export async function search(query: string, options: OpportunitySearchOptions = {}) {
    // Security: Input validation and sanitization
    if (typeof query !== 'string') {
      throw new Error('Search query must be a string')
    }

    // Trim and limit query length to prevent DoS attacks
    const sanitizedQuery = query.trim().substring(0, 200)

    if (!sanitizedQuery) {
      return []
    }

    // Security: Validate and clamp numeric parameters
    const {
      limit = 30,
      offset = 0,
      sortBy = 'match',
      order = 'desc',
      minDifficultyScore = 1,
      maxDifficultyScore = 10,
      minImpactScore = 1,
      maxImpactScore = 10,
    } = options

    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100)
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))
    const safeMinDifficultyScore = Math.min(
      Math.max(1, Math.floor(Number(minDifficultyScore) || 1)),
      10
    )
    const safeMaxDifficultyScore = Math.min(
      Math.max(safeMinDifficultyScore, Math.floor(Number(maxDifficultyScore) || 10)),
      10
    )
    const safeMinImpactScore = Math.min(Math.max(1, Math.floor(Number(minImpactScore) || 1)), 10)
    const safeMaxImpactScore = Math.min(
      Math.max(safeMinImpactScore, Math.floor(Number(maxImpactScore) || 10)),
      10
    )

    return timedDb.select(async () => {
      // Build dynamic WHERE conditions with sanitized inputs
      const conditions = [
        // Basic text search with sanitized query
        buildTextSearchConditions(sanitizedQuery),
        // Score filters with validated numbers
        gte(schema.opportunities.difficultyScore, safeMinDifficultyScore),
        lte(schema.opportunities.difficultyScore, safeMaxDifficultyScore),
        gte(schema.opportunities.impactScore, safeMinImpactScore),
        lte(schema.opportunities.impactScore, safeMaxImpactScore),
        // Optional filters (already sanitized in buildOptionalFilters)
        ...buildOptionalFilters(options),
      ]

      // Build ORDER BY clause with whitelisted columns
      const orderByClause = buildOrderBy(sortBy, order)

      return await db
        .select()
        .from(schema.opportunities)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(safeLimit)
        .offset(safeOffset)
    })
  }

  /**
   * Vector similarity search for opportunities
   */
  export async function vectorSearch(options: OpportunityVectorSearchOptions) {
    // Security: Validate vector search options
    const {
      embedding,
      threshold = appConfig.vectorSearch.similarityThreshold,
      limit = 30,
      includeRepository = false,
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

      const baseQuery = db
        .select({
          opportunity: schema.opportunities,
          similarity:
            sql<number>`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector)`.as(
              'similarity'
            ),
          ...(includeRepository && {
            repository: schema.repositories,
          }),
        })
        .from(schema.opportunities)
        .where(
          and(
            isNotNull(schema.opportunities.embedding),
            sql`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector) >= ${safeThreshold}`
          )
        )

      const query = includeRepository
        ? baseQuery.leftJoin(
            schema.repositories,
            eq(schema.opportunities.repositoryId, schema.repositories.id)
          )
        : baseQuery

      const results = await query
        .orderBy(
          desc(sql`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector)`)
        )
        .limit(safeLimit)

      return results.map(row => ({
        ...row.opportunity,
        similarity: row.similarity,
        repository: includeRepository ? row.repository : undefined,
      }))
    })
  }

  /**
   * Get opportunities with repository information
   */
  export async function getWithRepository(opportunityId: string) {
    // Security: Validate opportunity ID parameter
    if (typeof opportunityId !== 'string' || !opportunityId.trim()) {
      throw new Error('Invalid opportunity ID: must be a non-empty string')
    }

    const sanitizedOpportunityId = opportunityId.trim()

    return timedDb.select(async () => {
      const result = await db.query.opportunities.findFirst({
        where: eq(schema.opportunities.id, sanitizedOpportunityId),
        with: {
          repository: true,
        },
      })

      return result || null
    })
  }

  /**
   * Get opportunities by repository
   */
  export async function getByRepository(
    repositoryId: string,
    options: OpportunitySearchOptions = {}
  ) {
    // Security: Validate repository ID parameter
    if (typeof repositoryId !== 'string' || !repositoryId.trim()) {
      throw new Error('Invalid repository ID: must be a non-empty string')
    }

    const sanitizedRepositoryId = repositoryId.trim()

    // Security: Validate and clamp numeric parameters
    const { limit = 50, offset = 0, sortBy = 'impact', order = 'desc' } = options

    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 50)), 100)
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))

    return timedDb.select(async () => {
      // Build ORDER BY clause with whitelisted columns
      const orderByClause = buildOrderBy(sortBy, order)

      return await db
        .select()
        .from(schema.opportunities)
        .where(eq(schema.opportunities.repositoryId, sanitizedRepositoryId))
        .orderBy(orderByClause)
        .limit(safeLimit)
        .offset(safeOffset)
    })
  }

  /**
   * Upsert opportunity data
   */
  export async function upsert(data: {
    repositoryId?: string
    issueNumber?: number
    title: string
    description?: string
    url?: string
    metadata?: Record<string, unknown>
    difficultyScore?: number
    impactScore?: number
    matchScore?: number
    embedding?: string
  }) {
    // Security: Validate required parameters
    if (typeof data.title !== 'string' || !data.title.trim()) {
      throw new Error('Invalid title: must be a non-empty string')
    }

    // Security: Validate repository ID if provided
    if (data.repositoryId && (typeof data.repositoryId !== 'string' || !data.repositoryId.trim())) {
      throw new Error('Invalid repository ID: must be a non-empty string')
    }

    // Security: Validate issue number if provided
    if (
      data.issueNumber !== undefined &&
      (typeof data.issueNumber !== 'number' ||
        !Number.isInteger(data.issueNumber) ||
        data.issueNumber <= 0)
    ) {
      throw new Error('Invalid issue number: must be a positive integer')
    }

    // Security: Sanitize string inputs
    const sanitizedData = {
      ...data,
      repositoryId: data.repositoryId?.trim(),
      title: data.title.trim().substring(0, 255),
      description: data.description?.trim().substring(0, 2000),
      url: data.url?.trim().substring(0, 500),
    }

    // Security: Validate scores if provided
    if (sanitizedData.difficultyScore !== undefined) {
      sanitizedData.difficultyScore = Math.min(
        Math.max(1, Number(sanitizedData.difficultyScore) || 1),
        10
      )
    }

    if (sanitizedData.impactScore !== undefined) {
      sanitizedData.impactScore = Math.min(Math.max(1, Number(sanitizedData.impactScore) || 1), 10)
    }

    if (sanitizedData.matchScore !== undefined) {
      sanitizedData.matchScore = Math.min(Math.max(0, Number(sanitizedData.matchScore) || 0), 100)
    }

    return timedDb.upsert(async () => {
      const results = await db
        .insert(schema.opportunities)
        .values({
          ...sanitizedData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.opportunities.repositoryId, schema.opportunities.issueNumber],
          set: {
            title: sanitizedData.title,
            description: sanitizedData.description,
            url: sanitizedData.url,
            metadata: sanitizedData.metadata,
            difficultyScore: sanitizedData.difficultyScore,
            impactScore: sanitizedData.impactScore,
            matchScore: sanitizedData.matchScore,
            embedding: sanitizedData.embedding,
            updatedAt: sql`now()`,
          },
        })
        .returning()

      return results[0]
    })
  }

  /**
   * Get opportunity statistics
   */
  export async function getStats() {
    return timedDb.select(async () => {
      const [totalOpportunities] = await db.select({ count: count() }).from(schema.opportunities)

      const [withEmbeddings] = await db
        .select({ count: count() })
        .from(schema.opportunities)
        .where(isNotNull(schema.opportunities.embedding))

      // Security: Use parameterized queries for JSONB comparisons
      const [beginnerFriendly] = await db
        .select({ count: count() })
        .from(schema.opportunities)
        .where(sql`${schema.opportunities.metadata}->>'goodFirstIssue' = 'true'`)

      const [withMentorship] = await db
        .select({ count: count() })
        .from(schema.opportunities)
        .where(sql`${schema.opportunities.metadata}->>'mentorshipAvailable' = 'true'`)

      const [recentlyCreated] = await db
        .select({ count: count() })
        .from(schema.opportunities)
        .where(sql`${schema.opportunities.createdAt} >= NOW() - INTERVAL '7 days'`)

      // Add null safety checks for count queries
      const totalCount = totalOpportunities?.count ?? 0
      const withEmbeddingsCount = withEmbeddings?.count ?? 0
      const beginnerFriendlyCount = beginnerFriendly?.count ?? 0
      const withMentorshipCount = withMentorship?.count ?? 0
      const recentlyCreatedCount = recentlyCreated?.count ?? 0

      return {
        total: totalCount,
        withEmbeddings: withEmbeddingsCount,
        beginnerFriendly: beginnerFriendlyCount,
        withMentorship: withMentorshipCount,
        recentlyCreated: recentlyCreatedCount,
        embeddingCoverage: totalCount > 0 ? (withEmbeddingsCount / totalCount) * 100 : 0,
      }
    })
  }

  /**
   * Get personalized opportunity recommendations
   */
  export async function getRecommendations(
    userId: string,
    userEmbedding: number[],
    options: OpportunitySearchOptions = {}
  ) {
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()

    // Security: Validate embedding vector
    if (!Array.isArray(userEmbedding)) {
      throw new Error('User embedding must be an array')
    }

    if (userEmbedding.length === 0 || userEmbedding.length > 2048) {
      throw new Error('User embedding vector length must be between 1 and 2048')
    }

    if (
      !userEmbedding.every(
        val => typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)
      )
    ) {
      throw new Error('All user embedding values must be finite numbers')
    }

    // Security: Validate and sanitize options
    const { limit = 20, difficulty, goodFirstIssue, skillsRequired = [] } = options

    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 50)

    // Validate difficulty if provided
    if (difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      throw new Error('Invalid difficulty: must be beginner, intermediate, or advanced')
    }

    // Validate and sanitize skills required array
    const sanitizedSkills = Array.isArray(skillsRequired)
      ? skillsRequired
          .slice(0, 10) // Limit to 10 skills
          .map(skill => (typeof skill === 'string' ? skill.replace(/'/g, "''").trim() : ''))
          .filter(
            skill => skill.length > 0 && skill.length <= 50 && /^[a-zA-Z0-9\-_.+#\s]+$/.test(skill)
          )
      : []

    return timedDb.select(async () => {
      // Security: Use serialized embedding for safe parameterization
      const embeddingText = vectorUtils.serializeEmbedding(userEmbedding)

      const conditions = [
        isNotNull(schema.opportunities.embedding),
        sql`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector) >= ${appConfig.vectorSearch.similarityThreshold}`,
      ]

      // Apply user preferences with sanitized inputs
      if (difficulty) {
        conditions.push(sql`${schema.opportunities.metadata}->>'difficulty' = ${difficulty}`)
      }

      if (goodFirstIssue !== undefined) {
        conditions.push(
          sql`COALESCE(CAST(${schema.opportunities.metadata}->>'goodFirstIssue' AS BOOLEAN), false) = ${goodFirstIssue}`
        )
      }

      if (sanitizedSkills.length > 0) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'skillsRequired') AS skill
            WHERE skill = ANY(${sanitizedSkills})
          )`
        )
      }

      // Exclude opportunities user has already interacted with (with proper parameterization)
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM ${schema.userActivity} ua
          WHERE ua.user_id = ${sanitizedUserId}
          AND ua.activity->>'type' = 'view'
          AND ua.activity->'target'->>'type' = 'opportunity'
          AND ua.activity->'target'->>'id' = ${schema.opportunities.id}::text
        )`
      )

      const results = await db
        .select({
          opportunity: schema.opportunities,
          repository: schema.repositories,
          similarity:
            sql<number>`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector)`.as(
              'similarity'
            ),
          personalizedScore: sql<number>`
            (1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector)) * 0.6 +
            (${schema.opportunities.matchScore}::float / 100.0) * 0.4
          `.as('personalized_score'),
        })
        .from(schema.opportunities)
        .leftJoin(
          schema.repositories,
          eq(schema.opportunities.repositoryId, schema.repositories.id)
        )
        .where(and(...conditions))
        .orderBy(desc(sql`personalized_score`))
        .limit(safeLimit)

      return results.map(row => ({
        ...row.opportunity,
        repository: row.repository,
        similarity: row.similarity,
        personalizedScore: row.personalizedScore,
      }))
    })
  }

  /**
   * Update match scores for opportunities
   */
  export async function updateMatchScores(updates: Array<{ id: string; matchScore: number }>) {
    // Security: Validate updates array
    if (!Array.isArray(updates)) {
      throw new Error('Updates must be an array')
    }

    if (updates.length === 0) {
      return []
    }

    // Security: Validate and sanitize update entries
    const sanitizedUpdates = updates
      .slice(0, 100) // Limit to 100 updates per batch
      .map(update => {
        if (!update || typeof update !== 'object') {
          throw new Error('Each update must be an object')
        }

        if (typeof update.id !== 'string' || !update.id.trim()) {
          throw new Error('Each update must have a valid ID')
        }

        if (typeof update.matchScore !== 'number' || Number.isNaN(update.matchScore)) {
          throw new Error('Each update must have a valid match score')
        }

        return {
          id: update.id.trim(),
          matchScore: Math.min(Math.max(0, update.matchScore), 100), // Clamp between 0-100
        }
      })

    return timedDb.update(async () => {
      const results = []

      // Process in batches of 10 for optimal performance
      for (let i = 0; i < sanitizedUpdates.length; i += 10) {
        const batch = sanitizedUpdates.slice(i, i + 10)

        const batchPromises = batch.map(update =>
          db
            .update(schema.opportunities)
            .set({
              matchScore: update.matchScore,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.opportunities.id, update.id))
            .returning()
        )

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults.flat())
      }

      return results
    })
  }
}
