/**
 * GDPR Consent Management
 * Handles user consent recording, validation, and withdrawal
 */

import { sql } from '@/lib/db/config'
import type { UserConsent } from '@/types/auth'
import { logSecurityEvent } from '../audit'
import { CONSENT_TYPES, CURRENT_VERSIONS, DATA_CATEGORIES, PROCESSING_PURPOSES } from './constants'
import { logDataProcessing } from './processing'
import type { ConsentRequest, ConsentType } from './types'

// Enhanced GDPR 2.0 consent recording with granular choices
export async function recordUserConsent(params: ConsentRequest): Promise<UserConsent> {
  const result = await sql`
    INSERT INTO user_consents (
      user_id,
      consent_type,
      granted,
      version,
      timestamp,
      ip_address,
      user_agent,
      granular_choices,
      consent_source
    )
    VALUES (
      ${params.userId},
      ${params.consentType},
      ${params.granted},
      ${params.version},
      ${params.context?.timestamp || new Date()},
      ${params.context?.ip_address || null},
      ${params.context?.user_agent || null},
      ${JSON.stringify(params.granularChoices || {})},
      ${params.context?.source || 'api'}
    )
    RETURNING *
  `

  // Log consent for data processing record
  await logDataProcessing({
    userId: params.userId,
    purpose: PROCESSING_PURPOSES.CONSENT_BASED,
    lawfulBasis: 'consent',
    dataCategories: [DATA_CATEGORIES.PREFERENCE],
    processingType: 'collection',
    retention: '3 years after withdrawal',
    safeguards: ['encrypted_storage', 'access_logging', 'integrity_verification'],
  })

  if (!result || result.length === 0) {
    throw new Error('Failed to record user consent')
  }

  // Log security event for audit trail
  const logEvent: Parameters<typeof logSecurityEvent>[0] = {
    event_type: 'user_consent_recorded',
    user_id: params.userId,
    event_data: {
      consentType: params.consentType,
      granted: params.granted,
      version: params.version,
    },
    success: true,
  }

  // Only add optional properties if they have values (exactOptionalPropertyTypes compliance)
  if (params.context?.ip_address) {
    logEvent.ip_address = params.context.ip_address
  }
  if (params.context?.user_agent) {
    logEvent.user_agent = params.context.user_agent
  }

  await logSecurityEvent(logEvent)

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
  const consentParams: Parameters<typeof recordUserConsent>[0] = {
    userId: params.userId,
    consentType: params.consentType as ConsentType,
    granted: false,
    version: CURRENT_VERSIONS[params.consentType as ConsentType] || '1.0',
  }
  if (params.context) {
    consentParams.context = params.context
  }
  await recordUserConsent(consentParams)
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

  // Transform database result to match expected interface (camelCase consentType)
  return result.map(row => ({
    ...row,
    consentType: row.consent_type, // Add camelCase property for test compatibility
  })) as UserConsent[]
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
  if (!consent) {
    return true // No consent found
  }

  // Check if version is outdated
  if (consent.version !== requiredVersion) {
    return true
  }

  return false
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
    safeguards: ['secure_deletion', 'audit_trail', 'verification'],
  })
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
