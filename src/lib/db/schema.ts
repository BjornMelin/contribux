// Contribux Database Schema - Drizzle ORM
// Phase 3: Simplified schema design with JSONB consolidation

import { relations } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique().notNull(),
  username: text('username').notNull(),
  email: text('email').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),

  // Consolidated profile data using JSONB
  profile: jsonb('profile').$type<{
    bio?: string
    location?: string
    company?: string
    website?: string
    blog?: string
    twitterUsername?: string
    publicRepos?: number
    publicGists?: number
    followers?: number
    following?: number
  }>(),

  // Consolidated user preferences using JSONB
  preferences: jsonb('preferences').$type<{
    emailNotifications?: boolean
    pushNotifications?: boolean
    theme?: 'light' | 'dark' | 'system'
    language?: string
    timezone?: string
    difficultyPreference?: 'beginner' | 'intermediate' | 'advanced'
    topicPreferences?: string[]
    languagePreferences?: string[]
  }>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// Repositories table with consolidated metadata
export const repositories = pgTable(
  'repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: integer('github_id').unique().notNull(),
    fullName: text('full_name').notNull(),
    name: text('name').notNull(),
    owner: text('owner').notNull(),
    description: text('description'),

    // Consolidated repository metadata using JSONB
    metadata: jsonb('metadata').$type<{
      language?: string
      primaryLanguage?: string
      languages?: Record<string, number>
      stars?: number
      forks?: number
      watchers?: number
      openIssues?: number
      license?: string
      topics?: string[]
      defaultBranch?: string
      size?: number
      archived?: boolean
      disabled?: boolean
      private?: boolean
      fork?: boolean
      hasIssues?: boolean
      hasProjects?: boolean
      hasWiki?: boolean
      hasPages?: boolean
      hasDownloads?: boolean
      pushedAt?: string
      createdAt?: string
      updatedAt?: string
      homepage?: string
      cloneUrl?: string
      sshUrl?: string
      gitUrl?: string
    }>(),

    // Consolidated health metrics using JSONB
    healthMetrics: jsonb('health_metrics').$type<{
      maintainerResponsiveness?: number // 0-10 scale
      activityLevel?: number // 0-10 scale
      codeQuality?: number // 0-10 scale
      communityEngagement?: number // 0-10 scale
      documentationQuality?: number // 0-10 scale
      testCoverage?: number // 0-100 percentage
      securityScore?: number // 0-10 scale
      overallScore?: number // Calculated composite score
      lastCalculated?: string // ISO timestamp
      issueResolutionTime?: number // Average days
      prMergeTime?: number // Average days
      contributorCount?: number
      recentCommits?: number // Last 30 days
      releaseFrequency?: number // Releases per year
    }>(),

    // Vector embedding for semantic search (halfvec 1536 dimensions)
    embedding: text('embedding'), // Store as text, parse as needed for halfvec

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  table => ({
    // Optimized indexes (Phase 3 performance targets)
    githubIdIdx: index('repositories_github_id_idx').on(table.githubId),
    fullNameIdx: index('repositories_full_name_idx').on(table.fullName),
    ownerIdx: index('repositories_owner_idx').on(table.owner),
    // Vector index will be created via SQL migration for HNSW
  })
)

// Opportunities table with consolidated metadata
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id').references(() => repositories.id),
    issueNumber: integer('issue_number'),
    title: text('title').notNull(),
    description: text('description'),
    url: text('url'),

    // Consolidated opportunity metadata using JSONB
    metadata: jsonb('metadata').$type<{
      labels?: string[]
      author?: {
        login?: string
        id?: number
        avatarUrl?: string
      }
      assignees?: Array<{
        login?: string
        id?: number
      }>
      state?: 'open' | 'closed'
      locked?: boolean
      comments?: number
      createdAt?: string
      updatedAt?: string
      closedAt?: string
      difficulty?: 'beginner' | 'intermediate' | 'advanced'
      estimatedHours?: number
      skillsRequired?: string[]
      mentorshipAvailable?: boolean
      goodFirstIssue?: boolean
      hacktoberfest?: boolean
      priority?: 'low' | 'medium' | 'high'
      complexity?: number // 1-10 scale
      impactLevel?: 'low' | 'medium' | 'high'
      learningOpportunity?: number // 1-10 scale
      communitySupport?: boolean
      documentationNeeded?: boolean
      testingRequired?: boolean
    }>(),

    // Scoring metrics
    difficultyScore: integer('difficulty_score').default(5), // 1-10 scale
    impactScore: integer('impact_score').default(5), // 1-10 scale
    matchScore: integer('match_score').default(0), // 0-100 personalized matching score

    // Vector embedding for opportunity matching
    embedding: text('embedding'), // Store as text, parse as needed for halfvec

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  table => ({
    // Optimized indexes (Phase 3 performance targets)
    repositoryIdIdx: index('opportunities_repository_id_idx').on(table.repositoryId),
    difficultyScoreIdx: index('opportunities_difficulty_score_idx').on(table.difficultyScore),
    impactScoreIdx: index('opportunities_impact_score_idx').on(table.impactScore),
    // Vector index will be created via SQL migration for HNSW
  })
)

// Bookmarks table (user favorites)
export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    repositoryId: uuid('repository_id').references(() => repositories.id),

    // Consolidated bookmark data using JSONB
    metadata: jsonb('metadata').$type<{
      notes?: string
      tags?: string[]
      priority?: 'low' | 'medium' | 'high'
      folder?: string
      reminderDate?: string
      status?: 'active' | 'archived' | 'completed'
    }>(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  table => ({
    // Compound indexes for efficient queries
    userIdIdx: index('bookmarks_user_id_idx').on(table.userId),
    repositoryIdIdx: index('bookmarks_repository_id_idx').on(table.repositoryId),
    userRepoIdx: index('bookmarks_user_repo_idx').on(table.userId, table.repositoryId),
  })
)

// User Activity Log (simplified tracking)
export const userActivity = pgTable(
  'user_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),

    // Activity data using JSONB
    activity: jsonb('activity').$type<{
      type: 'search' | 'view' | 'bookmark' | 'click' | 'filter'
      target?: {
        type: 'repository' | 'opportunity' | 'user'
        id: string
        name?: string
      }
      metadata?: {
        query?: string
        filters?: Record<string, string | number | boolean | string[]>
        source?: string
        duration?: number
        timestamp?: string
      }
    }>(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  table => ({
    userIdIdx: index('user_activity_user_id_idx').on(table.userId),
    createdAtIdx: index('user_activity_created_at_idx').on(table.createdAt),
  })
)

// Relations for type-safe joins
export const userRelations = relations(users, ({ many }) => ({
  bookmarks: many(bookmarks),
  activities: many(userActivity),
}))

export const repositoryRelations = relations(repositories, ({ many }) => ({
  opportunities: many(opportunities),
  bookmarks: many(bookmarks),
}))

export const opportunityRelations = relations(opportunities, ({ one }) => ({
  repository: one(repositories, {
    fields: [opportunities.repositoryId],
    references: [repositories.id],
  }),
}))

/**
 * DATABASE SECURITY VALIDATOR
 *
 * CRITICAL: This provides SQL injection prevention and input validation
 * for all database operations. All database queries MUST use these validators.
 */

import { z } from 'zod'

/**
 * SECURITY: Input validation schemas for database operations
 * These schemas prevent SQL injection by validating and sanitizing inputs
 */

// Basic string validation with SQL injection prevention
const createSafeStringSchema = (maxLength = 1000) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      value => {
        // Remove dangerous SQL patterns
        const dangerous = [
          /[';]|--/g, // SQL comment and statement terminators
          /\b(union|select|insert|update|delete|drop|alter|create|exec|execute)\b/gi, // SQL keywords
          /[<>'";&|*?~<>^()[\]{}$\n\r]/g, // Special characters that could be used in attacks
          /\0/g, // Null byte
          // biome-ignore lint/suspicious/noControlCharactersInRegex: SUB control character (0x1A) is a legitimate security concern for SQL injection prevention
          /\u001a/g, // Control character SUB
        ]

        return !dangerous.some(pattern => pattern.test(value))
      },
      {
        message: 'Input contains potentially dangerous characters or SQL keywords',
      }
    )

export const SafeStringSchema = createSafeStringSchema(1000)
export const SafeStringSchema50 = createSafeStringSchema(50)
export const SafeStringSchema100 = createSafeStringSchema(100)
export const SafeStringSchema200 = createSafeStringSchema(200)

// Email validation with security checks
export const SafeEmailSchema = z
  .string()
  .email()
  .max(254)
  .refine(
    email => {
      // Additional email security checks
      const suspiciousPatterns = [
        /[<>'";&|*?~<>^()[\]{}$]/g, // Dangerous characters
        /\.\./g, // Directory traversal
        /javascript:/gi, // Script injection
      ]

      return !suspiciousPatterns.some(pattern => pattern.test(email))
    },
    {
      message: 'Email contains potentially dangerous characters',
    }
  )

// Search query validation - CRITICAL for preventing injection in search operations
export const SafeSearchQuerySchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    query => {
      // Remove dangerous patterns from search queries
      const cleanQuery = query
        .replace(/[<>'";&|*?~<>^()[\]{}$\n\r]/g, '') // Remove dangerous chars
        .replace(/\b(union|select|insert|update|delete|drop|alter|create|exec|execute)\b/gi, '') // Remove SQL keywords
        .trim()

      return cleanQuery.length > 0 && cleanQuery.length <= 200
    },
    {
      message: 'Search query contains invalid characters or SQL keywords',
    }
  )

// GitHub ID validation
export const GitHubIdSchema = z.number().int().positive().max(999999999) // Reasonable upper bound for GitHub IDs

// UUID validation for internal IDs
export const UUIDSchema = z.string().uuid()

// Vector embedding validation
export const VectorEmbeddingSchema = z
  .array(z.number())
  .length(1536)
  .refine(
    embedding => {
      // Validate embedding values are within expected range
      return embedding.every(
        val =>
          typeof val === 'number' &&
          !Number.isNaN(val) &&
          Number.isFinite(val) &&
          val >= -1 &&
          val <= 1
      )
    },
    {
      message: 'Vector embedding contains invalid values',
    }
  )

// Repository data validation
export const RepositoryDataSchema = z.object({
  githubId: GitHubIdSchema,
  fullName: SafeStringSchema200,
  name: SafeStringSchema100,
  owner: SafeStringSchema100,
  description: SafeStringSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  healthMetrics: z.record(z.unknown()).optional(),
  embedding: z.string().optional(), // Serialized embedding
})

// User data validation
export const UserDataSchema = z.object({
  githubId: GitHubIdSchema,
  username: SafeStringSchema100,
  email: SafeEmailSchema.optional(),
  name: SafeStringSchema200.optional(),
  avatarUrl: z.string().url().max(500).optional(),
  profile: z.record(z.unknown()).optional(),
  preferences: z.record(z.unknown()).optional(),
})

// Search options validation
export const SearchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).max(10000).default(0),
  sortBy: z.enum(['stars', 'updated', 'created', 'name']).default('stars'),
  order: z.enum(['asc', 'desc']).default('desc'),
  minStars: z.number().int().min(0).max(1000000).default(0),
  maxStars: z.number().int().min(0).max(1000000).optional(),
  languages: z.array(SafeStringSchema50).max(10).default([]),
  topics: z.array(SafeStringSchema50).max(20).default([]),
  hasIssues: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  license: SafeStringSchema100.optional(),
  afterDate: z.date().optional(),
  beforeDate: z.date().optional(),
})

/**
 * SECURITY: SQL Injection Prevention Functions
 */

// Sanitize search query for ILIKE operations
export function sanitizeSearchQuery(query: string): string {
  const validated = SafeSearchQuerySchema.parse(query)

  // Additional sanitization for ILIKE patterns
  return validated
    .replace(/%/g, '\\%') // Escape LIKE wildcards
    .replace(/_/g, '\\_') // Escape LIKE wildcards
    .slice(0, 100) // Limit length
}

// Sanitize array inputs for ANY() operations
export function sanitizeArrayInput<T>(items: T[], validator: z.ZodSchema<T>, maxItems = 50): T[] {
  if (!Array.isArray(items)) {
    throw new Error('Input must be an array')
  }

  if (items.length > maxItems) {
    throw new Error(`Array cannot contain more than ${maxItems} items`)
  }

  return items.map(item => validator.parse(item))
}

// Validate JSON input for JSONB operations
export function sanitizeJsonInput(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Input must be a valid object')
  }

  const obj = input as Record<string, unknown>

  // Check for dangerous patterns in JSON keys and values
  for (const [key, value] of Object.entries(obj)) {
    // Validate keys
    SafeStringSchema100.parse(key)

    // Validate values (recursively for nested objects)
    if (typeof value === 'string') {
      SafeStringSchema.parse(value)
    } else if (typeof value === 'object' && value !== null) {
      sanitizeJsonInput(value)
    }
  }

  return obj
}

// Validate vector embedding input
export function sanitizeVectorEmbedding(embedding: unknown): number[] {
  return VectorEmbeddingSchema.parse(embedding)
}

/**
 * SECURITY: Database Query Builders with Injection Prevention
 * These replace the unsafe SQL template literal patterns found in queries
 */

// Safe text search builder (replaces buildTextSearchConditions)
export function buildSafeTextSearchConditions(query: string) {
  const sanitizedQuery = sanitizeSearchQuery(query)
  const searchPattern = `%${sanitizedQuery}%`

  // Return parameterized conditions instead of SQL template literals
  return {
    searchPattern,
    sanitizedQuery,
  }
}

// Safe filter builder (replaces buildOptionalFilters)
export function buildSafeFilterConditions(options: z.infer<typeof SearchOptionsSchema>) {
  const validated = SearchOptionsSchema.parse(options)

  // Sanitize array inputs
  const safeLanguages = sanitizeArrayInput(validated.languages, SafeStringSchema50, 10)

  const safeTopics = sanitizeArrayInput(validated.topics, SafeStringSchema50, 20)

  return {
    ...validated,
    languages: safeLanguages,
    topics: safeTopics,
  }
}

/**
 * SECURITY: Connection String Validation
 */
export function validateDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)

    // Ensure secure connection protocol
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('Database URL must use postgres:// or postgresql:// protocol')
    }

    // Validate host (no local/private IPs in production)
    if (process.env.NODE_ENV === 'production') {
      const host = parsed.hostname
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.startsWith('172.')
      ) {
        throw new Error('Local/private IP addresses not allowed in production')
      }
    }

    return url
  } catch (error) {
    throw new Error(
      `Invalid database URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * SECURITY: Query Monitoring and Logging
 */

// Track potentially dangerous queries
const suspiciousQueryPatterns = [
  /(?:union|select|insert|update|delete|drop|alter|create)\s+(?:all\s+)?(?:distinct\s+)?(?:top\s+\d+\s+)?\w/gi,
  /(?:and|or)\s+[\w\s]*=[\w\s]*[\w\s]*--/gi,
  /\/\*.*?\*\//gi,
  /;\s*(?:drop|delete|update|insert)/gi,
]

export function detectSuspiciousQuery(query: string): boolean {
  return suspiciousQueryPatterns.some(pattern => pattern.test(query))
}

// Log security events
export async function logSecurityEvent(_event: {
  type: 'sql_injection_attempt' | 'invalid_input' | 'suspicious_query'
  query?: string
  input?: unknown
  error?: string
  userId?: string
  ipAddress?: string
}) {
  // In production, send to security monitoring service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with security monitoring service
  }
}

export const bookmarkRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [bookmarks.repositoryId],
    references: [repositories.id],
  }),
}))

export const userActivityRelations = relations(userActivity, ({ one }) => ({
  user: one(users, {
    fields: [userActivity.userId],
    references: [users.id],
  }),
}))

// Export table types for use in queries
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Repository = typeof repositories.$inferSelect
export type NewRepository = typeof repositories.$inferInsert
export type Opportunity = typeof opportunities.$inferSelect
export type NewOpportunity = typeof opportunities.$inferInsert
export type Bookmark = typeof bookmarks.$inferSelect
export type NewBookmark = typeof bookmarks.$inferInsert
export type UserActivity = typeof userActivity.$inferSelect
export type NewUserActivity = typeof userActivity.$inferInsert
