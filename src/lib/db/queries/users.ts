// User Queries - Drizzle ORM
// Phase 3: Type-safe queries replacing raw SQL patterns

import { and, count, desc, eq, sql } from 'drizzle-orm'
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
    // Security: Validate GitHub ID parameter
    if (typeof githubId !== 'number' || !Number.isInteger(githubId) || githubId <= 0) {
      throw new Error('Invalid GitHub ID: must be a positive integer')
    }

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
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()

    // Security: Validate and clamp numeric parameters
    const {
      includeBookmarks = false,
      includeActivity = false,
      bookmarkLimit = 20,
      activityLimit = 50,
    } = options

    const safeBookmarkLimit = Math.min(Math.max(1, Math.floor(Number(bookmarkLimit) || 20)), 100)
    const safeActivityLimit = Math.min(Math.max(1, Math.floor(Number(activityLimit) || 50)), 100)

    return timedDb.select(async () => {
      const result = await db.query.users.findFirst({
        where: eq(schema.users.id, sanitizedUserId),
        with: {
          bookmarks: includeBookmarks
            ? {
                limit: safeBookmarkLimit,
                orderBy: [desc(schema.bookmarks.createdAt)],
                with: {
                  repository: true,
                },
              }
            : undefined,
          activities: includeActivity
            ? {
                limit: safeActivityLimit,
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
    githubLogin: string
    email?: string
    name?: string
    avatarUrl?: string
    profile?: UserProfile
    preferences?: UserPreferences
  }) {
    // Security: Validate required parameters
    if (
      typeof data.githubId !== 'number' ||
      !Number.isInteger(data.githubId) ||
      data.githubId <= 0
    ) {
      throw new Error('Invalid GitHub ID: must be a positive integer')
    }

    if (typeof data.username !== 'string' || !data.username.trim()) {
      throw new Error('Invalid username: must be a non-empty string')
    }

    if (typeof data.githubLogin !== 'string' || !data.githubLogin.trim()) {
      throw new Error('Invalid githubLogin: must be a non-empty string')
    }

    // Security: Sanitize string inputs
    const sanitizedData = {
      ...data,
      username: data.username.trim().substring(0, 100),
      githubLogin: data.githubLogin.trim().substring(0, 100),
      email: data.email?.trim().substring(0, 255),
      name: data.name?.trim().substring(0, 255),
      avatarUrl: data.avatarUrl?.trim().substring(0, 500),
    }

    // Security: Validate email format if provided
    if (sanitizedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedData.email)) {
      throw new Error('Invalid email format')
    }

    return timedDb.upsert(async () => {
      const results = await db
        .insert(schema.users)
        .values({
          ...sanitizedData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.users.githubId,
          set: {
            username: sanitizedData.username,
            email: sanitizedData.email,
            name: sanitizedData.name,
            avatarUrl: sanitizedData.avatarUrl,
            profile: sanitizedData.profile,
            preferences: sanitizedData.preferences,
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
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()

    // Security: Validate preferences object
    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Invalid preferences: must be an object')
    }

    return timedDb.update(async () => {
      const results = await db
        .update(schema.users)
        .set({
          preferences,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.users.id, sanitizedUserId))
        .returning()

      return results[0] || null
    })
  }

  /**
   * Update user profile
   */
  export async function updateProfile(userId: string, profile: UserProfile) {
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()

    // Security: Validate profile object
    if (!profile || typeof profile !== 'object') {
      throw new Error('Invalid profile: must be an object')
    }

    return timedDb.update(async () => {
      const results = await db
        .update(schema.users)
        .set({
          profile,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.users.id, sanitizedUserId))
        .returning()

      return results[0] || null
    })
  }

  // Helper function to validate bookmark parameters
  function validateBookmarkParameters(userId: string, repositoryId: string) {
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    if (typeof repositoryId !== 'string' || !repositoryId.trim()) {
      throw new Error('Invalid repository ID: must be a non-empty string')
    }

    return {
      sanitizedUserId: userId.trim(),
      sanitizedRepositoryId: repositoryId.trim(),
    }
  }

  // Helper function to validate priority enum
  function validatePriority(priority?: 'low' | 'medium' | 'high') {
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      throw new Error('Invalid priority: must be low, medium, or high')
    }
  }

  // Helper function to sanitize string fields
  function sanitizeStringFields(metadata: {
    notes?: string
    folder?: string
    tags?: string[]
    priority?: 'low' | 'medium' | 'high'
  }) {
    const sanitized = { ...metadata }

    if (sanitized.notes) {
      sanitized.notes = sanitized.notes.trim().substring(0, 1000)
    }

    if (sanitized.folder) {
      sanitized.folder = sanitized.folder.trim().substring(0, 100)
    }

    return sanitized
  }

  // Helper function to validate and sanitize tags
  function validateAndSanitizeTags(tags?: string[]) {
    if (!tags) return undefined

    if (!Array.isArray(tags)) {
      throw new Error('Invalid tags: must be an array')
    }

    return tags
      .slice(0, 20) // Limit to 20 tags
      .map(tag => (typeof tag === 'string' ? tag.trim().substring(0, 50) : ''))
      .filter(tag => tag.length > 0)
  }

  // Helper function to validate and sanitize metadata
  function validateAndSanitizeMetadata(metadata?: {
    notes?: string
    tags?: string[]
    priority?: 'low' | 'medium' | 'high'
    folder?: string
  }) {
    if (!metadata) return undefined

    if (typeof metadata !== 'object') {
      throw new Error('Invalid metadata: must be an object')
    }

    validatePriority(metadata.priority)
    const sanitizedMetadata = sanitizeStringFields(metadata)
    // Handle tags assignment for exactOptionalPropertyTypes compatibility
    const validatedTags = validateAndSanitizeTags(metadata.tags)
    if (validatedTags !== undefined) {
      sanitizedMetadata.tags = validatedTags
    }

    return sanitizedMetadata
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
    // Security: Validate and sanitize parameters
    const { sanitizedUserId, sanitizedRepositoryId } = validateBookmarkParameters(
      userId,
      repositoryId
    )
    const sanitizedMetadata = validateAndSanitizeMetadata(metadata)

    return timedDb.insert(async () => {
      const results = await db
        .insert(schema.bookmarks)
        .values({
          userId: sanitizedUserId,
          repositoryId: sanitizedRepositoryId,
          metadata: sanitizedMetadata,
        })
        .onConflictDoUpdate({
          target: [schema.bookmarks.userId, schema.bookmarks.repositoryId],
          set: {
            metadata: sanitizedMetadata,
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
    // Security: Validate required parameters
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    if (typeof repositoryId !== 'string' || !repositoryId.trim()) {
      throw new Error('Invalid repository ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()
    const sanitizedRepositoryId = repositoryId.trim()

    return timedDb.delete(async () => {
      const results = await db
        .delete(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.userId, sanitizedUserId),
            eq(schema.bookmarks.repositoryId, sanitizedRepositoryId)
          )
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
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()

    // Security: Validate and clamp numeric parameters
    const { limit = 20, offset = 0, folder, tags } = options

    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 100)
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))

    // Security: Sanitize optional filters
    const _sanitizedFolder = folder?.trim().substring(0, 100)
    const _sanitizedTags = Array.isArray(tags)
      ? tags
          .slice(0, 10) // Limit to 10 tags for filtering
          .map(tag => (typeof tag === 'string' ? tag.trim().substring(0, 50) : ''))
          .filter(tag => tag.length > 0)
      : undefined

    return timedDb.select(async () => {
      const query = db.query.bookmarks.findMany({
        where: eq(schema.bookmarks.userId, sanitizedUserId),
        with: {
          repository: true,
        },
        orderBy: [desc(schema.bookmarks.createdAt)],
        limit: safeLimit,
        offset: safeOffset,
      })

      // Apply filters if provided
      // Note: More complex JSONB filtering would require raw SQL with proper parameterization

      return await query
    })
  }

  /**
   * Log user activity
   */
  export async function logActivity(userId: string, activity: UserActivityInput) {
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    // Security: Validate activity object
    if (!activity || typeof activity !== 'object') {
      throw new Error('Invalid activity: must be an object')
    }

    const sanitizedUserId = userId.trim()

    return timedDb.insert(async () => {
      const results = await db
        .insert(schema.userActivity)
        .values({
          userId: sanitizedUserId,
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
    // Security: Validate user ID parameter
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Invalid user ID: must be a non-empty string')
    }

    const sanitizedUserId = userId.trim()

    // Security: Validate and clamp days parameter
    const { days = 30, activityTypes } = options
    const safeDays = Math.min(Math.max(1, Math.floor(Number(days) || 30)), 365) // Max 1 year

    // Security: Validate activity types array
    const _sanitizedActivityTypes = Array.isArray(activityTypes)
      ? activityTypes
          .slice(0, 10) // Limit to 10 activity types
          .map(type => (typeof type === 'string' ? type.trim().substring(0, 50) : ''))
          .filter(type => type.length > 0 && /^[a-zA-Z0-9_-]+$/.test(type)) // Only alphanumeric, underscore, hyphen
      : undefined

    return timedDb.select(async () => {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - safeDays)

      // Security: Properly parameterized JSONB queries
      // Activity count by type
      const activityByType = await db
        .select({
          type: sql<string>`${schema.userActivity.activity}->>'type'`,
          count: count(),
        })
        .from(schema.userActivity)
        .where(
          and(
            eq(schema.userActivity.userId, sanitizedUserId),
            sql`${schema.userActivity.createdAt} >= ${cutoffDate}`
          )
        )
        .groupBy(sql`${schema.userActivity.activity}->>'type'`)

      // Recent searches with proper parameterization
      const recentSearches = await db
        .select({
          query: sql<string>`${schema.userActivity.activity}->'metadata'->>'query'`,
          createdAt: schema.userActivity.createdAt,
        })
        .from(schema.userActivity)
        .where(
          and(
            eq(schema.userActivity.userId, sanitizedUserId),
            sql`${schema.userActivity.activity}->>'type' = 'search'`,
            sql`${schema.userActivity.createdAt} >= ${cutoffDate}`
          )
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

      // Security: Properly parameterized subquery
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
    // Security: Validate retention days parameter
    const safeRetentionDays = Math.min(Math.max(1, Math.floor(Number(retentionDays) || 90)), 365)

    return timedDb.delete(async () => {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - safeRetentionDays)

      // Security: Properly parameterized date comparison
      const results = await db
        .delete(schema.userActivity)
        .where(sql`${schema.userActivity.createdAt} < ${cutoffDate}`)
        .returning()

      return results.length
    })
  }
}
