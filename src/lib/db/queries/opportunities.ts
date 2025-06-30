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
    return or(
      ilike(schema.opportunities.title, `%${query}%`),
      ilike(schema.opportunities.description, `%${query}%`),
      // Search in metadata
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'labels') AS label
        WHERE label ILIKE ${`%${query}%`}
      )`,
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'skillsRequired') AS skill
        WHERE skill ILIKE ${`%${query}%`}
      )`
    )
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

    if (repositoryId) {
      conditions.push(eq(schema.opportunities.repositoryId, repositoryId))
    }

    if (difficulty) {
      conditions.push(sql`${schema.opportunities.metadata}->>'difficulty' = ${difficulty}`)
    }

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

    if (labels.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'labels') AS label
          WHERE label = ANY(${labels})
        )`
      )
    }

    if (skillsRequired.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'skillsRequired') AS skill
          WHERE skill = ANY(${skillsRequired})
        )`
      )
    }

    if (afterDate) {
      conditions.push(gte(schema.opportunities.createdAt, afterDate))
    }

    if (beforeDate) {
      conditions.push(lte(schema.opportunities.createdAt, beforeDate))
    }

    return conditions
  }

  // Helper function to build order by clause
  function buildOrderBy(sortBy: string, order: string) {
    const direction = order === 'desc' ? desc : <T>(col: T) => col

    switch (sortBy) {
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

    return timedDb.select(async () => {
      // Build dynamic WHERE conditions
      const conditions = [
        // Basic text search
        buildTextSearchConditions(query),
        // Score filters
        gte(schema.opportunities.difficultyScore, minDifficultyScore),
        lte(schema.opportunities.difficultyScore, maxDifficultyScore),
        gte(schema.opportunities.impactScore, minImpactScore),
        lte(schema.opportunities.impactScore, maxImpactScore),
        // Optional filters
        ...buildOptionalFilters(options),
      ]

      // Build ORDER BY clause
      const orderByClause = buildOrderBy(sortBy, order)

      return await db
        .select()
        .from(schema.opportunities)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset)
    })
  }

  /**
   * Vector similarity search for opportunities
   */
  export async function vectorSearch(options: OpportunityVectorSearchOptions) {
    const {
      embedding,
      threshold = appConfig.vectorSearch.similarityThreshold,
      limit = 30,
      includeRepository = false,
    } = options

    return timedDb.select(async () => {
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
            sql`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector) >= ${threshold}`
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
        .limit(limit)

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
    return timedDb.select(async () => {
      const result = await db.query.opportunities.findFirst({
        where: eq(schema.opportunities.id, opportunityId),
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
    const { limit = 50, offset = 0, sortBy = 'impact', order = 'desc' } = options

    return timedDb.select(async () => {
      const orderByClause = buildOrderBy(sortBy, order)

      return await db
        .select()
        .from(schema.opportunities)
        .where(eq(schema.opportunities.repositoryId, repositoryId))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset)
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
    return timedDb.upsert(async () => {
      const results = await db
        .insert(schema.opportunities)
        .values({
          ...data,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.opportunities.repositoryId, schema.opportunities.issueNumber],
          set: {
            title: data.title,
            description: data.description,
            url: data.url,
            metadata: data.metadata,
            difficultyScore: data.difficultyScore,
            impactScore: data.impactScore,
            matchScore: data.matchScore,
            embedding: data.embedding,
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
    const { limit = 20, difficulty, goodFirstIssue, skillsRequired = [] } = options

    return timedDb.select(async () => {
      const embeddingText = vectorUtils.serializeEmbedding(userEmbedding)

      const conditions = [
        isNotNull(schema.opportunities.embedding),
        sql`1 - (${schema.opportunities.embedding}::vector <=> ${embeddingText}::vector) >= ${appConfig.vectorSearch.similarityThreshold}`,
      ]

      // Apply user preferences
      if (difficulty) {
        conditions.push(sql`${schema.opportunities.metadata}->>'difficulty' = ${difficulty}`)
      }

      if (goodFirstIssue !== undefined) {
        conditions.push(
          sql`COALESCE(CAST(${schema.opportunities.metadata}->>'goodFirstIssue' AS BOOLEAN), false) = ${goodFirstIssue}`
        )
      }

      if (skillsRequired.length > 0) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${schema.opportunities.metadata}->'skillsRequired') AS skill
            WHERE skill = ANY(${skillsRequired})
          )`
        )
      }

      // Exclude opportunities user has already interacted with
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM ${schema.userActivity} ua
          WHERE ua.user_id = ${userId}
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
        .limit(limit)

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
    return timedDb.update(async () => {
      const results = []

      // Process in batches of 10 for optimal performance
      for (let i = 0; i < updates.length; i += 10) {
        const batch = updates.slice(i, i + 10)

        const batchPromises = batch.map(update =>
          db
            .update(schema.opportunities)
            .set({
              matchScore: update.matchScore,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.opportunities.id, update.id))
            .returning({ id: schema.opportunities.id })
        )

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults.flat())
      }

      return results
    })
  }
}
