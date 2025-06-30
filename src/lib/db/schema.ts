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
