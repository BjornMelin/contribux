/**
 * GDPR Data Validation and Minimization
 * Handles data minimization validation and right to rectification
 */

import { sql } from '@/lib/db/config'
import { getUserConsents } from './consent'
import { DATA_CATEGORIES, DATA_MINIMIZATION_RULES } from './constants'
import { logDataProcessing } from './processing'
import type { DataCategory } from './types'

// Data minimization checker
export async function validateDataMinimization(
  userId: string,
  dataToCollect: Record<string, unknown>
): Promise<{
  compliant: boolean
  violations: string[]
  recommendations: string[]
}> {
  const violations: string[] = []
  const recommendations: string[] = []

  // Check against minimization rules
  for (const [category, allowedFields] of Object.entries(DATA_MINIMIZATION_RULES)) {
    const categoryFields = Object.keys(dataToCollect).filter(field =>
      fieldBelongsToCategory(field, category as DataCategory)
    )

    for (const field of categoryFields) {
      if (!allowedFields.includes(field as never)) {
        // Check if user has consented to this data collection
        const hasConsent = await checkConsentForDataCategory(userId, category as DataCategory)

        if (!hasConsent) {
          violations.push(`Field '${field}' in category '${category}' requires explicit consent`)
          recommendations.push(`Obtain user consent for ${category} data collection`)
        }
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    recommendations,
  }
}

// Right to rectification
export async function handleDataRectification(
  userId: string,
  fieldUpdates: Record<string, unknown>,
  verificationToken: string
): Promise<{ success: boolean; updatedFields: string[] }> {
  // Verify rectification request (simplified - implement proper verification)
  if (verificationToken !== 'valid-rectification-token') {
    throw new Error('Invalid rectification verification token')
  }

  const updatedFields: string[] = []

  // Validate and update user data
  for (const [field, value] of Object.entries(fieldUpdates)) {
    if (isValidUserField(field)) {
      await sql.unsafe(
        `
        UPDATE users 
        SET ${field} = '${value}', updated_at = CURRENT_TIMESTAMP
        WHERE id = '${userId}'
      `
      )
      updatedFields.push(field)
    }
  }

  // Log rectification
  await logDataProcessing({
    userId,
    purpose: 'LEGAL_COMPLIANCE',
    lawfulBasis: 'legal_obligation',
    dataCategories: [DATA_CATEGORIES.IDENTITY],
    processingType: 'use',
    retention: 'audit_record_only',
    retentionPeriod: 'audit_record_only',
    safeguards: ['verification_token', 'audit_logging', 'field_validation'],
  })

  return { success: true, updatedFields }
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

// Helper functions
function fieldBelongsToCategory(field: string, category: DataCategory): boolean {
  // Implement field categorization logic
  const allowedFields = DATA_MINIMIZATION_RULES[category as keyof typeof DATA_MINIMIZATION_RULES]
  return allowedFields ? (allowedFields as string[]).includes(field) : false
}

async function checkConsentForDataCategory(
  userId: string,
  category: DataCategory
): Promise<boolean> {
  // Map data categories to consent types
  const categoryConsentMap = {
    [DATA_CATEGORIES.BEHAVIORAL]: 'behavioral_profiling',
    [DATA_CATEGORIES.LOCATION]: 'location_tracking',
    [DATA_CATEGORIES.USAGE]: 'usage_analytics',
    // Add other mappings as needed
  } as Record<DataCategory, string>

  const consentType = categoryConsentMap[category]
  if (!consentType) {
    return true // No consent required for this category
  }

  const consents = await getUserConsents(userId)
  const relevantConsent = consents.find(c => c.consent_type === consentType)

  return relevantConsent?.granted === true
}

function isValidUserField(field: string): boolean {
  const validFields = ['email', 'github_username', 'recovery_email']
  return validFields.includes(field)
}
