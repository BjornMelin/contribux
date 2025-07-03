/**
 * User Repository Implementation
 * Handles user-related database operations
 */

import { desc, eq, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { schema } from '@/lib/db'
import type { Optional, UserId } from '@/lib/types/advanced'
import { createBrand } from '@/lib/types/advanced'

import type { IUserRepository, User } from '../interfaces'
import { BaseRepository } from './base-repository'

export class UserRepository extends BaseRepository<User, UserId> implements IUserRepository {
  protected table = schema.users
  protected idColumn = schema.users.id

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<Optional<User>> {
    try {
      const [result] = await this.db
        .select()
        .from(this.table)
        .where(eq(this.table.email, email))
        .limit(1)

      return result ? this.mapToEntity(result) : null
    } catch (error) {
      this.handleError('findByEmail', error)
      return null
    }
  }

  /**
   * Find user by GitHub ID
   */
  async findByGitHubId(githubId: number): Promise<Optional<User>> {
    try {
      const [result] = await this.db
        .select()
        .from(this.table)
        .where(eq(this.table.githubId, githubId))
        .limit(1)

      return result ? this.mapToEntity(result) : null
    } catch (error) {
      this.handleError('findByGitHubId', error)
      return null
    }
  }

  /**
   * Find user by GitHub login (username)
   */
  async findByGitHubLogin(login: string): Promise<Optional<User>> {
    try {
      const [result] = await this.db
        .select()
        .from(this.table)
        .where(eq(this.table.username, login))
        .limit(1)

      return result ? this.mapToEntity(result) : null
    } catch (error) {
      this.handleError('findByGitHubLogin', error)
      return null
    }
  }

  /**
   * Update user's last login time
   */
  async updateLastLogin(id: UserId): Promise<void> {
    try {
      await this.db
        .update(this.table)
        .set({
          updatedAt: new Date(),
        })
        .where(eq(this.table.id, id))

      this.recordOperation('updateLastLogin')
    } catch (error) {
      this.handleError('updateLastLogin', error)
    }
  }

  /**
   * Get active users (users who updated recently)
   */
  async getActiveUsers(limit = 50): Promise<User[]> {
    try {
      const results = await this.db
        .select()
        .from(this.table)
        .where(sql`updated_at > NOW() - INTERVAL '30 days'`)
        .orderBy(desc(this.table.updatedAt))
        .limit(limit)

      this.recordOperation('getActiveUsers')
      return results.map(result => this.mapToEntity(result))
    } catch (error) {
      this.handleError('getActiveUsers', error)
      return []
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(id: UserId): Promise<{
    totalRepositories: number
    totalOpportunities: number
    contributionsThisMonth: number
  }> {
    try {
      // This would typically join with other tables
      // For now, returning mock data structure
      const result = await this.db
        .select({
          totalRepositories: sql<number>`COALESCE(
            (SELECT COUNT(*) FROM repositories WHERE created_by = ${id}), 
            0
          )`,
          totalOpportunities: sql<number>`COALESCE(
            (SELECT COUNT(*) FROM opportunities WHERE discovered_by = ${id}), 
            0
          )`,
          contributionsThisMonth: sql<number>`COALESCE(
            (SELECT COUNT(*) FROM user_contributions 
             WHERE user_id = ${id} 
             AND created_at > DATE_TRUNC('month', CURRENT_DATE)), 
            0
          )`,
        })
        .from(this.table)
        .where(eq(this.table.id, id))
        .limit(1)

      this.recordOperation('getUserStats')

      return (
        result[0] || {
          totalRepositories: 0,
          totalOpportunities: 0,
          contributionsThisMonth: 0,
        }
      )
    } catch (error) {
      this.handleError('getUserStats', error)
      return {
        totalRepositories: 0,
        totalOpportunities: 0,
        contributionsThisMonth: 0,
      }
    }
  }

  /**
   * Create user with GitHub data
   */
  async createFromGitHub(githubData: {
    githubId: number
    githubLogin: string
    email: string
    name?: string
    avatarUrl?: string
  }): Promise<User> {
    const user = {
      email: githubData.email,
      name: githubData.name,
      avatarUrl: githubData.avatarUrl,
      githubId: githubData.githubId,
      username: githubData.githubLogin,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return await this.create(user)
  }

  /**
   * Update user profile
   */
  async updateProfile(
    id: UserId,
    updates: {
      name?: string
      avatarUrl?: string
      bio?: string
      location?: string
      website?: string
    }
  ): Promise<Optional<User>> {
    return await this.update(id, updates)
  }

  /**
   * Get user preferences (would be in a separate table in real implementation)
   */
  async getUserPreferences(_id: UserId): Promise<{
    preferredLanguages: string[]
    preferredTopics: string[]
    difficultyPreference: 'beginner' | 'intermediate' | 'advanced'
    emailNotifications: boolean
  }> {
    try {
      // In a real implementation, this would query a user_preferences table
      // For now, returning defaults
      return {
        preferredLanguages: ['JavaScript', 'TypeScript'],
        preferredTopics: ['web-development', 'frontend'],
        difficultyPreference: 'intermediate',
        emailNotifications: true,
      }
    } catch (error) {
      this.handleError('getUserPreferences', error)
      return {
        preferredLanguages: [],
        preferredTopics: [],
        difficultyPreference: 'beginner',
        emailNotifications: false,
      }
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    _id: UserId,
    _preferences: {
      preferredLanguages?: string[]
      preferredTopics?: string[]
      difficultyPreference?: 'beginner' | 'intermediate' | 'advanced'
      emailNotifications?: boolean
    }
  ): Promise<void> {
    try {
      // In a real implementation, this would update a user_preferences table
      this.recordOperation('updateUserPreferences')
    } catch (error) {
      this.handleError('updateUserPreferences', error)
    }
  }

  /**
   * Delete user and all associated data
   */
  async deleteUserData(id: UserId): Promise<boolean> {
    const result = await this.executeInTransaction(async trx => {
      // Delete user preferences
      // await trx.delete(schema.userPreferences).where(eq(schema.userPreferences.userId, id))

      // Delete search history
      // await trx.delete(schema.searchHistory).where(eq(schema.searchHistory.userId, id))

      // Delete analytics events
      // await trx.delete(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, id))

      // Finally delete the user
      const deleteResult = await trx.delete(this.table).where(eq(this.table.id, id))

      return deleteResult.rowCount > 0
    })

    return result.success ? result.data : false
  }

  /**
   * Map database row to User entity
   */
  protected mapToEntity(row: Record<string, unknown>): User {
    return {
      id: createBrand<string, 'UserId'>(String(row.id)),
      email: String(row.email),
      name: row.name ? String(row.name) : undefined,
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : undefined,
      githubId: row.githubId ? Number(row.githubId) : undefined,
      githubLogin: row.username ? String(row.username) : undefined, // Map username from schema to githubLogin in interface
      createdAt: new Date(row.createdAt as string | number | Date),
      updatedAt: new Date(row.updatedAt as string | number | Date),
    }
  }

  /**
   * Map User entity to database row
   */
  protected mapFromEntity(entity: Partial<User>): Record<string, unknown> {
    return {
      id: entity.id,
      email: entity.email,
      name: entity.name,
      avatarUrl: entity.avatarUrl,
      githubId: entity.githubId,
      username: entity.githubLogin, // Map githubLogin from interface to username in schema
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }

  /**
   * Search users (admin functionality)
   */
  async searchUsers(query: {
    email?: string
    name?: string
    githubLogin?: string
    limit?: number
    offset?: number
  }): Promise<{
    users: User[]
    total: number
    hasMore: boolean
  }> {
    try {
      const conditions = this.buildWhereConditions({
        email: query.email ? `%${query.email}%` : undefined,
        name: query.name ? `%${query.name}%` : undefined,
        username: query.githubLogin ? `%${query.githubLogin}%` : undefined,
      })

      const baseQuery = this.db.select().from(this.table)

      const dbQuery =
        conditions.length > 0 ? baseQuery.where(sql`${conditions.join(' AND ')}`) : baseQuery

      // Implement pagination directly
      const limit = query.limit || 20
      const offset = query.offset || 0

      // Get items with one extra to check if there are more
      const items = await dbQuery.limit(limit + 1).offset(offset)

      const hasMore = items.length > limit
      const actualItems = hasMore ? items.slice(0, limit) : items

      // Get total count
      const totalQuery = await this.db.select({ count: sql<number>`count(*)` }).from(this.table)
      const total = Number(totalQuery[0]?.count || 0)

      this.recordOperation('searchUsers')

      return {
        users: actualItems.map(item => this.mapToEntity(item)),
        total,
        hasMore,
      }
    } catch (error) {
      this.handleError('searchUsers', error)
      return {
        users: [],
        total: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Get table column by name safely
   */
  protected getTableColumn(columnName: string): PgColumn | null {
    const table = this.table as any
    return table[columnName] || null
  }
}
