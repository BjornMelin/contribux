/**
 * GDPR Type Definitions
 * Enhanced interfaces for GDPR 2.0 compliance
 */

import type { ConsentType, DataCategory, LawfulBasis, ProcessingPurpose } from './constants'

// Re-export types for easier importing
export type { ConsentType, DataCategory, LawfulBasis, ProcessingPurpose } from './constants'
export { CONSENT_TYPES, DATA_CATEGORIES, LAWFUL_BASIS, PROCESSING_PURPOSES } from './constants'

export interface ConsentRequest {
  userId: string
  consentType: ConsentType
  granted: boolean
  version: string
  granularChoices?: Record<string, boolean>
  context?: {
    ip_address?: string
    user_agent?: string
    timestamp?: Date
    source?: 'registration' | 'settings' | 'banner' | 'api'
  }
}

export interface DataPortabilityRequest {
  userId: string
  format: 'json' | 'csv' | 'xml'
  categories?: DataCategory[]
  dateRange?: {
    from: Date
    to: Date
  }
  includeMetadata?: boolean
  encryptionKey?: string
}

export interface PrivacyImpactAssessment {
  id: string
  purpose: ProcessingPurpose
  dataCategories: DataCategory[]
  lawfulBasis: LawfulBasis
  riskLevel: 'low' | 'medium' | 'high'
  mitigationMeasures: string[]
  approvedBy: string
  approvedAt: Date
  reviewDate: Date
  status: 'draft' | 'approved' | 'rejected' | 'expired'
}

export interface ComplianceReport {
  periodStart: Date
  periodEnd: Date
  consentMetrics: {
    totalRequests: number
    granted: number
    withdrawn: number
    expired: number
  }
  dataRequests: {
    exportRequests: number
    deletionRequests: number
    rectificationRequests: number
    averageResponseTime: number
  }
  breachIncidents: number
  complianceScore: number
  recommendations: string[]
}

export interface DataProcessingRecord {
  id: string
  userId: string
  purpose: ProcessingPurpose
  lawfulBasis: LawfulBasis
  dataCategories: DataCategory[]
  processingType: 'collection' | 'storage' | 'use' | 'sharing' | 'export' | 'deletion'
  thirdParties?: string[]
  retentionPeriod: string
  safeguards: string[]
  createdAt: Date
  expiresAt?: Date
}
