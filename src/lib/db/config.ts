import { neon } from '@neondatabase/serverless'
// Drizzle ORM Configuration - Modern Database Layer
// Replaces raw SQL patterns with type-safe queries
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from '@/lib/validation/env'

// Create Neon connection
// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is validated at startup
export const sql = neon(env.DATABASE_URL!)

// Branch-specific connections for different environments with type safety
export const getDatabaseUrl = (branch: 'main' | 'dev' | 'test' = 'main'): string => {
  switch (branch) {
    case 'dev':
      return env.DATABASE_URL_DEV || env.DATABASE_URL
    case 'test':
      return env.DATABASE_URL_TEST || env.DATABASE_URL
    default:
      return env.DATABASE_URL
  }
}

// Vector search configuration with validated values
export const vectorConfig = {
  efSearch: env.HNSW_EF_SEARCH || 40,
  similarityThreshold: env.VECTOR_SIMILARITY_THRESHOLD || 0.8,
  textWeight: env.HYBRID_SEARCH_TEXT_WEIGHT || 0.4,
  vectorWeight: env.HYBRID_SEARCH_VECTOR_WEIGHT || 0.6,
} as const

// Create Drizzle database instance with type safety
export const db = drizzle({ client: sql })

// Export database type for dependency injection
export type Database = typeof db

// Core Database Schema (Drizzle ORM)
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

// Users table - Core user management
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name'),
    image: text('image'),
    githubId: integer('github_id').unique(),
    githubUsername: text('github_username'),
    displayName: text('display_name'),
    username: text('username'),
    bio: text('bio'),
    company: text('company'),
    location: text('location'),
    blog: text('blog'),
    twitterUsername: text('twitter_username'),
    publicRepos: integer('public_repos').default(0),
    publicGists: integer('public_gists').default(0),
    followers: integer('followers').default(0),
    following: integer('following').default(0),
    githubCreatedAt: timestamp('github_created_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    githubIdIdx: uniqueIndex('users_github_id_idx').on(table.githubId),
  })
)

// Repositories table - GitHub repository metadata
export const repositories = pgTable(
  'repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: integer('github_id').notNull().unique(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    description: text('description'),
    language: text('language'),
    stargazersCount: integer('stargazers_count').default(0),
    forksCount: integer('forks_count').default(0),
    openIssuesCount: integer('open_issues_count').default(0),
    size: integer('size').default(0),
    defaultBranch: text('default_branch').default('main'),
    topics: jsonb('topics').$type<string[]>(),
    hasIssues: boolean('has_issues').default(true),
    hasProjects: boolean('has_projects').default(true),
    hasWiki: boolean('has_wiki').default(true),
    archived: boolean('archived').default(false),
    disabled: boolean('disabled').default(false),
    visibility: text('visibility').notNull(),
    pushedAt: timestamp('pushed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastAnalyzedAt: timestamp('last_analyzed_at'),
    healthScore: integer('health_score'),
    contributionDifficulty: integer('contribution_difficulty'),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  table => ({
    githubIdIdx: uniqueIndex('repositories_github_id_idx').on(table.githubId),
    fullNameIdx: index('repositories_full_name_idx').on(table.fullName),
    languageIdx: index('repositories_language_idx').on(table.language),
    embeddingIdx: index('repositories_embedding_idx').on(table.embedding),
  })
)

// Opportunities table - AI-powered contribution opportunities
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull(), // 'issue', 'feature', 'bug', 'enhancement'
    skillLevel: text('skill_level').notNull(), // 'beginner', 'intermediate', 'advanced'
    estimatedHours: integer('estimated_hours'),
    technologies: jsonb('technologies').$type<string[]>(),
    labels: jsonb('labels').$type<string[]>(),
    issueUrl: text('issue_url'),
    prUrl: text('pr_url'),
    status: text('status').notNull().default('open'), // 'open', 'in_progress', 'completed', 'closed'
    complexityScore: integer('complexity_score'), // 1-10
    impactScore: integer('impact_score'), // 1-10
    urgency: text('urgency').default('medium'), // 'low', 'medium', 'high'
    mentorshipAvailable: boolean('mentorship_available').default(false),
    goodFirstIssue: boolean('good_first_issue').default(false),
    helpWanted: boolean('help_wanted').default(false),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  table => ({
    repositoryIdIdx: index('opportunities_repository_id_idx').on(table.repositoryId),
    typeIdx: index('opportunities_type_idx').on(table.type),
    skillLevelIdx: index('opportunities_skill_level_idx').on(table.skillLevel),
    statusIdx: index('opportunities_status_idx').on(table.status),
    embeddingIdx: index('opportunities_embedding_idx').on(table.embedding),
  })
)

// OAuth Accounts - NextAuth.js integration
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
    isPrimary: boolean('is_primary').default(false),
    linkedAt: timestamp('linked_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    providerAccountIdx: uniqueIndex('oauth_accounts_provider_account_idx').on(
      table.provider,
      table.providerAccountId
    ),
    userIdIdx: index('oauth_accounts_user_id_idx').on(table.userId),
  })
)

// User Sessions - NextAuth.js integration
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionToken: text('session_token').notNull().unique(),
    expires: timestamp('expires').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sessionTokenIdx: uniqueIndex('user_sessions_session_token_idx').on(table.sessionToken),
    userIdIdx: index('user_sessions_user_id_idx').on(table.userId),
  })
)

// Export schema for Drizzle operations
export const schema = {
  users,
  repositories,
  opportunities,
  oauthAccounts,
  userSessions,
}

// Database branches configuration with validated values
export const dbBranches = {
  main: env.DB_MAIN_BRANCH || 'main',
  dev: env.DB_DEV_BRANCH || 'dev',
  test: env.DB_TEST_BRANCH || 'test',
} as const

// Database configuration with validated values
export const dbConfig = {
  projectId: env.DB_PROJECT_ID || '',
  poolMin: env.DB_POOL_MIN || 5,
  poolMax: env.DB_POOL_MAX || 20,
  poolIdleTimeout: env.DB_POOL_IDLE_TIMEOUT || 30000,
} as const
