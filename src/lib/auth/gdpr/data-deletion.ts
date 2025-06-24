/**
 * GDPR Data Deletion and Right to Erasure
 * Handles user data deletion, anonymization, and retention policies
 */

import { auditConfig } from '@/lib/config'
import { sql } from '@/lib/db/config'
import { DATA_CATEGORIES, DATA_RETENTION_PERIODS } from './constants'
import type { DataCategory } from './types'

// Delete user data
export async function deleteUserData(
  userId: string,
  params: {
    reason: string
    verificationToken: string
  }
): Promise<void> {
  // Verify token (in production, implement proper verification)
  if (params.verificationToken !== 'valid-token') {
    throw new Error('Invalid verification token')
  }

  // Verify user exists
  const userResult = await sql`
    SELECT id FROM users WHERE id = ${userId} LIMIT 1
  `

  if (userResult.length === 0) {
    throw new Error('User not found')
  }

  // Log deletion request before deleting audit logs
  await sql`
    INSERT INTO security_audit_logs (
      event_type,
      event_severity,
      user_id,
      event_data,
      success,
      created_at
    )
    VALUES (
      'data_deletion_request',
      'critical',
      ${userId},
      ${JSON.stringify({ reason: params.reason })},
      true,
      CURRENT_TIMESTAMP
    )
  `

  // Delete data in order (respecting foreign key constraints)
  const _deletionOrder = [
    'user_repository_interactions',
    'contribution_outcomes',
    'notifications',
    'user_preferences',
    'security_audit_logs',
    'user_consents',
    'oauth_accounts',
    'refresh_tokens',
    'user_sessions',
    'users',
  ]

  // Delete data using individual queries for each table
  await sql`DELETE FROM user_repository_interactions WHERE user_id = ${userId}`
  await sql`DELETE FROM contribution_outcomes WHERE user_id = ${userId}`
  await sql`DELETE FROM notifications WHERE user_id = ${userId}`
  await sql`DELETE FROM user_preferences WHERE user_id = ${userId}`
  await sql`DELETE FROM security_audit_logs WHERE user_id = ${userId}`
  await sql`DELETE FROM user_consents WHERE user_id = ${userId}`
  await sql`DELETE FROM oauth_accounts WHERE user_id = ${userId}`
  await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`
  await sql`DELETE FROM user_sessions WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id = ${userId}`
}

// Anonymize user data
export async function anonymizeUserData(
  userId: string,
  options?: { preserveRelationships?: boolean }
): Promise<boolean> {
  const anonymizedId = userId.slice(0, 8)
  const anonymizedEmail = `anonymized-${anonymizedId}@deleted.local`
  const anonymizedUsername = `deleted-user-${anonymizedId}`

  // Update user record
  await sql`
    UPDATE users
    SET 
      email = ${anonymizedEmail},
      github_username = ${anonymizedUsername},
      recovery_email = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `

  if (!options?.preserveRelationships) {
    // Optionally delete related sensitive data
    await sql`DELETE FROM oauth_accounts WHERE user_id = ${userId}`
    await sql`DELETE FROM user_sessions WHERE user_id = ${userId}`
  }

  return true
}

// Identify data for deletion based on retention policy
export async function identifyDataForDeletion() {
  const retentionCutoff = new Date(Date.now() - auditConfig.gdpr.inactiveUserRetention)

  const inactiveUsers = await sql`
    SELECT id, email, last_login_at
    FROM users
    WHERE last_login_at < ${retentionCutoff}
    OR (last_login_at IS NULL AND created_at < ${retentionCutoff})
  `

  const oldSessions = await sql`
    SELECT COUNT(*) as count
    FROM user_sessions
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${auditConfig.retention.sessionData / 1000} seconds'
  `

  const oldAuditLogs = await sql`
    SELECT COUNT(*) as count
    FROM security_audit_logs
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${auditConfig.retention.standardLogs / 1000} seconds'
    AND event_severity != 'critical'
  `

  return {
    inactive_users: inactiveUsers,
    old_sessions_count: oldSessions.length > 0 ? Number.parseInt(oldSessions[0]?.count || '0') : 0,
    old_audit_logs_count:
      oldAuditLogs.length > 0 ? Number.parseInt(oldAuditLogs[0]?.count || '0') : 0,
  }
}

// Automated data retention policy enforcement
export async function enforceDataRetentionPolicies(): Promise<{
  deletedRecords: number
  archivedRecords: number
  errors: string[]
}> {
  let deletedRecords = 0
  let archivedRecords = 0
  const errors: string[] = []

  try {
    // Check each data category for expired data
    for (const [category, retentionPeriod] of Object.entries(DATA_RETENTION_PERIODS)) {
      const cutoffDate = new Date(Date.now() - retentionPeriod)

      try {
        const tableName = getTableNameForCategory(category as DataCategory)

        if (tableName) {
          // Archive before deletion (simplified - implement proper archival)
          const archiveResult = await sql.unsafe(
            `
            INSERT INTO archived_data (table_name, data, archived_at)
            SELECT '${tableName}', row_to_json(${tableName}.*), CURRENT_TIMESTAMP
            FROM ${tableName}
            WHERE created_at < '${cutoffDate.toISOString()}'
          `
          )
          archivedRecords += Array.isArray(archiveResult) ? archiveResult.length : 0

          // Delete expired data
          const deleteResult = await sql.unsafe(
            `
            DELETE FROM ${tableName}
            WHERE created_at < '${cutoffDate.toISOString()}'
          `
          )
          deletedRecords += Array.isArray(deleteResult) ? deleteResult.length : 0
        }
      } catch (categoryError) {
        errors.push(`Error processing category ${category}: ${categoryError}`)
      }
    }
  } catch (error) {
    errors.push(`General retention policy enforcement error: ${error}`)
  }

  return { deletedRecords, archivedRecords, errors }
}

function getTableNameForCategory(category: DataCategory): string | null {
  const categoryTableMap: Record<DataCategory, string> = {
    [DATA_CATEGORIES.IDENTITY]: 'users',
    [DATA_CATEGORIES.BEHAVIORAL]: 'user_repository_interactions',
    [DATA_CATEGORIES.USAGE]: 'security_audit_logs',
    // Add other mappings as needed
  } as Record<DataCategory, string>

  return categoryTableMap[category] || null
}
