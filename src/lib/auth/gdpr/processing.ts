/**
 * GDPR Data Processing and Logging
 * Handles data processing records and compliance logging
 */

import { sql } from '@/lib/db/config'
import type { DataCategory, LawfulBasis, ProcessingPurpose } from './constants'

// Enhanced data processing logging with GDPR 2.0 compliance
export async function logDataProcessing(params: {
  userId: string
  processingType: 'collection' | 'storage' | 'use' | 'sharing' | 'export' | 'deletion'
  purpose: ProcessingPurpose | string
  lawfulBasis: LawfulBasis
  dataCategories: (DataCategory | string)[]
  thirdParty?: string
  retention: string
  safeguards?: string[]
  retentionPeriod?: string // Alias for retention for backwards compatibility
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
      safeguards,
      created_at
    )
    VALUES (
      ${params.userId},
      ${params.processingType},
      ${params.purpose},
      ${params.lawfulBasis},
      ${params.dataCategories},
      ${params.thirdParty || null},
      ${params.retentionPeriod || params.retention},
      ${JSON.stringify(params.safeguards || [])},
      CURRENT_TIMESTAMP
    )
  `
}
