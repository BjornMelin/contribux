// User Queries - Drizzle ORM
// Phase 3: Type-safe queries replacing raw SQL patterns

import { count, desc, eq, sql } from 'drizzle-orm'
import { db, schema, timedDb } from '@/lib/db'
import type { NewUserActivity } from '@/lib/db/schema'

export interface UserPreferences {
  emailNotifications?: boolean
  pushNotifications?: boolean
  theme?: 'light' | 'dark' | 'system'
  language?: string
  timezone?: string
  difficultyPreference?: 'beginner' | 'intermediate' | 'advanced'
  topicPreferences?: string[]
  languagePreferences?: string[]
}

export interface UserProfile {
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
}

/**
 * Type for user activity logging - matches schema exactly
 */
export type UserActivityInput = NonNullable<NewUserActivity['activity']>

export namespace UserQueries {
  /**
   * Get user by GitHub ID
   */
  export async function getByGithubId(githubId: number) {
    return timedDb.select(async () => {
      const results = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.githubId, githubId))
        .limit(1)

      return results[0] || null
    })
  }

  /**
   * Get user by ID with related data
   */
  export async function getById(
    userId: string,
    options: {
      includeBookmarks?: boolean
      includeActivity?: boolean
      bookmarkLimit?: number
      activityLimit?: number
    } = {}
  ) {
    const {
      includeBookmarks = false,
      includeActivity = false,
      bookmarkLimit = 20,
      activityLimit = 50,
    } = options

    return timedDb.select(async () => {
      const result = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
        with: {
          bookmarks: includeBookmarks
            ? {
                limit: bookmarkLimit,
                orderBy: [desc(schema.bookmarks.createdAt)],
                with: {
                  repository: true,
                },
              }
            : undefined,
          activities: includeActivity
            ? {
                limit: activityLimit,
                orderBy: [desc(schema.userActivity.createdAt)],
              }
            : undefined,
        },
      })

      return result || null
    })
  }

  /**
   * Create or update user (upsert pattern)
   */
  export async function upsert(data: {
    githubId: number
    username: string
    email?: string
    name?: string
    avatarUrl?: string
    profile?: UserProfile
    preferences?: UserPreferences
  }) {
    return timedDb.upsert(async () => {
      const results = await db
        .insert(schema.users)
        .values({
          ...data,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.users.githubId,
          set: {
            username: data.username,
            email: data.email,
            name: data.name,
            avatarUrl: data.avatarUrl,
            profile: data.profile,
            preferences: data.preferences,
            updatedAt: sql`now()`,
          },
        })
        .returning()

      return results[0]
    })
  }

  /**
   * Update user preferences
   */
  export async function updatePreferences(userId: string, preferences: UserPreferences) {
    return timedDb.update(async () => {
      const results = await db
        .update(schema.users)
        .set({
          preferences,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.users.id, userId))
        .returning()

      return results[0] || null
    })
  }

  /**
   * Update user profile
   */
  export async function updateProfile(userId: string, profile: UserProfile) {
    return timedDb.update(async () => {
      const results = await db
        .update(schema.users)
        .set({
          profile,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.users.id, userId))
        .returning()

      return results[0] || null
    })
  }

  /**
   * Add user bookmark
   */
  export async function addBookmark(
    userId: string,
    repositoryId: string,
    metadata?: {
      notes?: string
      tags?: string[]
      priority?: 'low' | 'medium' | 'high'
      folder?: string
    }
  ) {
    return timedDb.insert(async () => {
      const results = await db
        .insert(schema.bookmarks)
        .values({
          userId,
          repositoryId,
          metadata,
        })
        .onConflictDoUpdate({
          target: [schema.bookmarks.userId, schema.bookmarks.repositoryId],
          set: {
            metadata,
            updatedAt: sql`now()`,
          },
        })
        .returning()

      return results[0]
    })
  }

  /**
   * Remove user bookmark
   */
  export async function removeBookmark(userId: string, repositoryId: string) {
    return timedDb.delete(async () => {
      const results = await db
        .delete(schema.bookmarks)
        .where(
          eq(schema.bookmarks.userId, userId) && eq(schema.bookmarks.repositoryId, repositoryId)
        )
        .returning()

      return results[0] || null
    })
  }

  /**
   * Get user bookmarks with repository details
   */
  export async function getBookmarks(
    userId: string,
    options: {
      limit?: number
      offset?: number
      folder?: string
      tags?: string[]
    } = {}
  ) {
    const { limit = 20, offset = 0 } = options

    return timedDb.select(async () => {
      const query = db.query.bookmarks.findMany({
        where: eq(schema.bookmarks.userId, userId),
        with: {
          repository: true,
        },
        orderBy: [desc(schema.bookmarks.createdAt)],
        limit,
        offset,
      })

      // Apply filters if provided
      // Note: More complex JSONB filtering would require raw SQL

      return await query
    })
  }

  /**
   * Log user activity
   */
  export async function logActivity(userId: string, activity: UserActivityInput) {
    return timedDb.insert(async () => {
      const results = await db
        .insert(schema.userActivity)
        .values({
          userId,
          activity: {
            ...activity,
            metadata: {
              ...activity.metadata,
              timestamp: activity.metadata?.timestamp ?? new Date().toISOString(),
            },
          },
        })
        .returning()

      return results[0]
    })
  }

  /**
   * Get user activity analytics
   */
  export async function getActivityAnalytics(
    userId: string,
    options: {
      days?: number
      activityTypes?: string[]
    } = {}
  ) {
    const { days = 30 } = options

    return timedDb.select(async () => {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      // Activity count by type
      const activityByType = await db
        .select({
          type: sql<string>`${schema.userActivity.activity}->>'type'`,
          count: count(),
        })
        .from(schema.userActivity)
        .where(
          eq(schema.userActivity.userId, userId) &&
            sql`${schema.userActivity.createdAt} >= ${cutoffDate}`
        )
        .groupBy(sql`${schema.userActivity.activity}->>'type'`)

      // Recent searches
      const recentSearches = await db
        .select({
          query: sql<string>`${schema.userActivity.activity}->'metadata'->>'query'`,
          createdAt: schema.userActivity.createdAt,
        })
        .from(schema.userActivity)
        .where(
          eq(schema.userActivity.userId, userId) &&
            sql`${schema.userActivity.activity}->>'type' = 'search'` &&
            sql`${schema.userActivity.createdAt} >= ${cutoffDate}`
        )
        .orderBy(desc(schema.userActivity.createdAt))
        .limit(10)

      return {
        activityByType,
        recentSearches: recentSearches.filter(s => s.query),
        totalActivities: activityByType.reduce((sum, item) => sum + item.count, 0),
      }
    })
  }

  /**
   * Get user statistics
   */
  export async function getStats() {
    return timedDb.select(async () => {
      const [totalUsers] = await db.select({ count: count() }).from(schema.users)

      const [activeUsers] = await db
        .select({ count: count() })
        .from(schema.users)
        .where(sql`${schema.users.updatedAt} >= NOW() - INTERVAL '30 days'`)

      const [usersWithBookmarks] = await db
        .select({ count: count() })
        .from(schema.users)
        .where(
          sql`EXISTS (
            SELECT 1 FROM ${schema.bookmarks} 
            WHERE ${schema.bookmarks.userId} = ${schema.users.id}
          )`
        )

      // Add null safety checks for count queries
      const totalCount = totalUsers?.count ?? 0
      const activeCount = activeUsers?.count ?? 0
      const withBookmarksCount = usersWithBookmarks?.count ?? 0

      return {
        total: totalCount,
        active: activeCount,
        withBookmarks: withBookmarksCount,
        bookmarkAdoption: totalCount > 0 ? (withBookmarksCount / totalCount) * 100 : 0,
      }
    })
  }

  /**
   * Clean up old activity logs (data retention)
   */
  export async function cleanupOldActivities(retentionDays = 90) {
    return timedDb.delete(async () => {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      const results = await db
        .delete(schema.userActivity)
        .where(sql`${schema.userActivity.createdAt} < ${cutoffDate}`)
        .returning({ id: schema.userActivity.id })

      return results.length
    })
  }
}
