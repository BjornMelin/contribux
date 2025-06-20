/**
 * GDPR Compliance Implementation
 * Handles consent management, data portability, and user rights
 */

import { sql } from '@/lib/db/config'
import type { User, UserConsent, UserDataExport } from '@/types/auth'

// Consent types
export const CONSENT_TYPES = {
  TERMS_OF_SERVICE: 'terms_of_service',
  PRIVACY_POLICY: 'privacy_policy',
  MARKETING_EMAILS: 'marketing_emails',
  USAGE_ANALYTICS: 'usage_analytics',
  THIRD_PARTY_SHARING: 'third_party_sharing',
} as const

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES]

// Current versions
const CURRENT_VERSIONS = {
  [CONSENT_TYPES.TERMS_OF_SERVICE]: '1.0',
  [CONSENT_TYPES.PRIVACY_POLICY]: '1.0',
  [CONSENT_TYPES.MARKETING_EMAILS]: '1.0',
  [CONSENT_TYPES.USAGE_ANALYTICS]: '1.0',
  [CONSENT_TYPES.THIRD_PARTY_SHARING]: '1.0',
}

// Lawful basis for processing
export type LawfulBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interest'

// Record user consent
export async function recordUserConsent(params: {
  userId: string
  consentType: ConsentType | string
  granted: boolean
  version: string
  context?: {
    ip_address?: string
    user_agent?: string
  }
}): Promise<UserConsent> {
  const result = await sql`
    INSERT INTO user_consents (
      user_id,
      consent_type,
      granted,
      version,
      timestamp,
      ip_address,
      user_agent
    )
    VALUES (
      ${params.userId},
      ${params.consentType},
      ${params.granted},
      ${params.version},
      CURRENT_TIMESTAMP,
      ${params.context?.ip_address || null},
      ${params.context?.user_agent || null}
    )
    RETURNING *
  `

  return result[0] as UserConsent
}

// Revoke user consent
export async function revokeUserConsent(params: {
  userId: string
  consentType: ConsentType | string
  context?: {
    ip_address?: string
    user_agent?: string
  }
}): Promise<void> {
  await recordUserConsent({
    userId: params.userId,
    consentType: params.consentType,
    granted: false,
    version: CURRENT_VERSIONS[params.consentType as ConsentType] || '1.0',
    context: params.context,
  })
}

// Get user consents
export async function getUserConsents(userId: string): Promise<UserConsent[]> {
  const result = await sql`
    SELECT DISTINCT ON (consent_type)
      consent_type,
      granted,
      version,
      timestamp,
      ip_address,
      user_agent
    FROM user_consents
    WHERE user_id = ${userId}
    ORDER BY consent_type, timestamp DESC
  `

  return result as UserConsent[]
}

// Check if consent is required
export async function checkConsentRequired(
  userId: string,
  consentType: ConsentType | string,
  options?: { requiredVersion?: string }
): Promise<boolean> {
  const requiredVersion =
    options?.requiredVersion || CURRENT_VERSIONS[consentType as ConsentType] || '1.0'

  const result = await sql`
    SELECT granted, version
    FROM user_consents
    WHERE user_id = ${userId}
    AND consent_type = ${consentType}
    AND granted = true
    ORDER BY timestamp DESC
    LIMIT 1
  `

  if (result.length === 0) {
    return true // No consent found
  }

  const consent = result[0]

  // Check if version is outdated
  if (consent.version !== requiredVersion) {
    return true
  }

  return false
}

// Export user data
export async function exportUserData(
  userId: string,
  _options?: { format?: 'json' }
): Promise<
  UserDataExport & { _metadata: { exported_at: Date; export_version: string; user_id: string } }
> {
  // Fetch user data
  const userResult = await sql`
    SELECT * FROM users WHERE id = ${userId} LIMIT 1
  `

  if (userResult.length === 0) {
    throw new Error('User not found')
  }

  const user = userResult[0] as User

  // Fetch related data in parallel
  const [
    oauthAccounts,
    webauthnCredentials,
    sessions,
    consents,
    auditLogs,
    preferences,
    notifications,
    contributions,
    interactions,
  ] = await Promise.all([
    sql`SELECT id, provider, provider_account_id, created_at, updated_at 
        FROM oauth_accounts WHERE user_id = ${userId}`,
    sql`SELECT id, credential_id, name, created_at, last_used_at 
        FROM webauthn_credentials WHERE user_id = ${userId}`,
    sql`SELECT id, auth_method, ip_address, user_agent, created_at, last_active_at 
        FROM user_sessions WHERE user_id = ${userId}`,
    sql`SELECT * FROM user_consents WHERE user_id = ${userId}`,
    sql`SELECT * FROM security_audit_logs WHERE user_id = ${userId}`,
    sql`SELECT * FROM user_preferences WHERE user_id = ${userId} LIMIT 1`,
    sql`SELECT * FROM notifications WHERE user_id = ${userId}`,
    sql`SELECT * FROM contribution_outcomes WHERE user_id = ${userId}`,
    sql`SELECT * FROM user_repository_interactions WHERE user_id = ${userId}`,
  ])

  const exportData: UserDataExport & {
    _metadata: { exported_at: Date; export_version: string; user_id: string }
  } = {
    user,
    oauth_accounts: oauthAccounts,
    webauthn_credentials: webauthnCredentials.map(cred => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { public_key: _publicKey, ...credWithoutKey } = cred as WebAuthnCredential
      return credWithoutKey
    }),
    sessions,
    consents,
    audit_logs: auditLogs,
    preferences: preferences[0] || {},
    notifications,
    contributions,
    interactions,
    _metadata: {
      exported_at: new Date(),
      export_version: '1.0',
      user_id: userId,
    },
  }

  return exportData
}

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
    'webauthn_credentials',
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
  await sql`DELETE FROM webauthn_credentials WHERE user_id = ${userId}`
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
    await sql`DELETE FROM webauthn_credentials WHERE user_id = ${userId}`
    await sql`DELETE FROM user_sessions WHERE user_id = ${userId}`
  }

  return true
}

// Get data retention policy
export async function getDataRetentionPolicy() {
  return {
    user_data: {
      active_retention: 'indefinite',
      inactive_retention: '3 years',
      deletion_grace_period: '30 days',
    },
    audit_logs: {
      retention: '2 years',
      critical_events_retention: '7 years',
    },
    session_data: {
      retention: '90 days',
    },
    consent_records: {
      retention: '3 years after withdrawal',
    },
  }
}

// Identify data for deletion based on retention policy
export async function identifyDataForDeletion() {
  const threeYearsAgo = new Date()
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

  const inactiveUsers = await sql`
    SELECT id, email, last_login_at
    FROM users
    WHERE last_login_at < ${threeYearsAgo}
    OR (last_login_at IS NULL AND created_at < ${threeYearsAgo})
  `

  const oldSessions = await sql`
    SELECT COUNT(*) as count
    FROM user_sessions
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
  `

  const oldAuditLogs = await sql`
    SELECT COUNT(*) as count
    FROM security_audit_logs
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '2 years'
    AND event_severity != 'critical'
  `

  return {
    inactive_users: inactiveUsers,
    old_sessions_count: oldSessions.length > 0 ? Number.parseInt(oldSessions[0].count) : 0,
    old_audit_logs_count: oldAuditLogs.length > 0 ? Number.parseInt(oldAuditLogs[0].count) : 0,
  }
}

// Log data processing activities
export async function logDataProcessing(params: {
  userId: string
  processingType: 'collection' | 'storage' | 'use' | 'sharing' | 'export' | 'deletion'
  purpose: string
  lawfulBasis: LawfulBasis
  dataCategories: string[]
  thirdParty?: string
  retention: string
}): Promise<void> {
  await sql`
    INSERT INTO data_processing_logs (
      user_id,
      processing_type,
      purpose,
      lawful_basis,
      data_categories,
      third_party,
      retention_period,
      created_at
    )
    VALUES (
      ${params.userId},
      ${params.processingType},
      ${params.purpose},
      ${params.lawfulBasis},
      ${params.dataCategories},
      ${params.thirdParty || null},
      ${params.retention},
      CURRENT_TIMESTAMP
    )
  `
}

// Get consent options for UI
export async function getConsentOptions() {
  return {
    required: [
      {
        type: CONSENT_TYPES.TERMS_OF_SERVICE,
        description: 'Terms of service governing use of the platform',
        version: CURRENT_VERSIONS[CONSENT_TYPES.TERMS_OF_SERVICE],
        link: '/legal/terms',
      },
      {
        type: CONSENT_TYPES.PRIVACY_POLICY,
        description: 'How we collect, use, and protect your data',
        version: CURRENT_VERSIONS[CONSENT_TYPES.PRIVACY_POLICY],
        link: '/legal/privacy',
      },
    ],
    optional: [
      {
        type: CONSENT_TYPES.MARKETING_EMAILS,
        description: 'Receive updates about new features and opportunities',
        default: false,
        benefits: ['Early access to features', 'Exclusive content'],
      },
      {
        type: CONSENT_TYPES.USAGE_ANALYTICS,
        description: 'Help us improve by sharing anonymous usage data',
        default: false,
        benefits: ['Better recommendations', 'Improved performance'],
      },
      {
        type: CONSENT_TYPES.THIRD_PARTY_SHARING,
        description: 'Share data with partners for enhanced features',
        default: false,
        partners: ['GitHub', 'Analytics providers'],
      },
    ],
  }
}

// Check GDPR compliance status
export async function checkGDPRCompliance(userId: string) {
  const consents = await getUserConsents(userId)
  const requiredConsents = ['terms_of_service', 'privacy_policy']

  const missingConsents = requiredConsents.filter(type => {
    const consent = consents.find(c => c.consent_type === type)
    return !consent || !consent.granted || consent.version !== CURRENT_VERSIONS[type as ConsentType]
  })

  const hasDataExportRequest = await sql`
    SELECT COUNT(*) as count
    FROM security_audit_logs
    WHERE user_id = ${userId}
    AND event_type = 'data_export_request'
    AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
  `

  return {
    compliant: missingConsents.length === 0,
    missingConsents,
    recentDataRequests: Number.parseInt(hasDataExportRequest[0].count),
    dataRetentionCompliant: true, // Simplified for now
  }
}

// Handle consent withdrawal
export async function handleConsentWithdrawal(userId: string, consentType: ConsentType | string) {
  // Record withdrawal
  await revokeUserConsent({
    userId,
    consentType,
  })

  // Handle specific consent withdrawals
  switch (consentType) {
    case CONSENT_TYPES.MARKETING_EMAILS:
      // Update user preferences
      await sql`
        UPDATE user_preferences
        SET marketing_emails_enabled = false
        WHERE user_id = ${userId}
      `
      break

    case CONSENT_TYPES.USAGE_ANALYTICS:
      // Disable analytics
      await sql`
        UPDATE user_preferences
        SET analytics_enabled = false
        WHERE user_id = ${userId}
      `
      break

    case CONSENT_TYPES.THIRD_PARTY_SHARING:
      // Revoke third-party access
      await sql`
        UPDATE oauth_accounts
        SET third_party_sharing_enabled = false
        WHERE user_id = ${userId}
      `
      break
  }

  // Log withdrawal
  await logDataProcessing({
    userId,
    processingType: 'deletion',
    purpose: 'Consent withdrawal',
    lawfulBasis: 'consent',
    dataCategories: [consentType],
    retention: 'immediate',
  })
}
