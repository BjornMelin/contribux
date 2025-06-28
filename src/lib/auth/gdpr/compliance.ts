/**
 * GDPR Compliance Monitoring and Reporting
 * Handles compliance checks, reporting, and privacy impact assessments
 */

import { auditConfig } from '@/lib/config'
import { sql } from '@/lib/db/config'
import { getUserConsents } from './consent'
import { CURRENT_VERSIONS, DATA_CATEGORIES } from './constants'
import type {
  ComplianceReport,
  ConsentType,
  DataCategory,
  LawfulBasis,
  PrivacyImpactAssessment,
  ProcessingPurpose,
} from './types'

// Check GDPR compliance status
export async function checkGDPRCompliance(userId: string) {
  const consents = await getUserConsents(userId)
  const requiredConsents = ['terms_of_service', 'privacy_policy']

  const missingConsents = requiredConsents.filter(type => {
    const consent = consents.find(c => c.consentType === type)
    return !consent || !consent.granted || consent.version !== CURRENT_VERSIONS[type as ConsentType]
  })

  const hasDataExportRequest = await sql`
    SELECT COUNT(*) as count
    FROM security_audit_logs
    WHERE user_id = ${userId}
    AND event_type = 'data_export_request'
    AND created_at > CURRENT_TIMESTAMP - INTERVAL '${auditConfig.gdpr.deletionGracePeriod / 1000} seconds'
  `

  return {
    compliant: missingConsents.length === 0,
    missingConsents,
    recentDataRequests: Number.parseInt(hasDataExportRequest[0]?.count || '0'),
    dataRetentionCompliant: true, // Simplified for now
  }
}

// Automated compliance monitoring
export async function generateComplianceReport(
  periodStart: Date,
  periodEnd: Date
): Promise<ComplianceReport> {
  // Consent metrics
  const consentMetrics = await sql`
    SELECT 
      COUNT(*) as total_requests,
      COUNT(CASE WHEN granted = true THEN 1 END) as granted,
      COUNT(CASE WHEN granted = false THEN 1 END) as withdrawn,
      COUNT(CASE WHEN timestamp < CURRENT_TIMESTAMP - INTERVAL '2 years' AND granted = true THEN 1 END) as expired
    FROM user_consents
    WHERE timestamp BETWEEN ${periodStart} AND ${periodEnd}
  `

  // Data request metrics
  const dataRequestMetrics = await sql`
    SELECT 
      COUNT(CASE WHEN event_type = 'data_export_request' THEN 1 END) as export_requests,
      COUNT(CASE WHEN event_type = 'data_deletion_request' THEN 1 END) as deletion_requests,
      COUNT(CASE WHEN event_type = 'data_rectification_request' THEN 1 END) as rectification_requests,
      AVG(EXTRACT(EPOCH FROM (created_at - created_at)) / 3600) as avg_response_time
    FROM security_audit_logs
    WHERE event_type IN ('data_export_request', 'data_deletion_request', 'data_rectification_request')
    AND created_at BETWEEN ${periodStart} AND ${periodEnd}
  `

  // Breach incidents
  const breachIncidents = await sql`
    SELECT COUNT(*) as count
    FROM security_audit_logs
    WHERE event_type IN ('data_breach_attempt', 'system_compromise')
    AND created_at BETWEEN ${periodStart} AND ${periodEnd}
  `

  // Calculate compliance score
  const consentMetricsData = consentMetrics?.[0] || {
    total_requests: 0,
    granted: 0,
    withdrawn: 0,
    expired: 0,
  }

  const dataRequestMetricsData = dataRequestMetrics?.[0] || {
    export_requests: 0,
    deletion_requests: 0,
    rectification_requests: 0,
    avg_response_time: 0,
  }

  const complianceScore = calculateComplianceScore({
    consentMetrics: {
      total_requests: consentMetricsData.total_requests,
      granted: consentMetricsData.granted,
    },
    dataRequestMetrics: {
      export_requests: dataRequestMetricsData.export_requests,
    },
    breachIncidents: Number.parseInt(breachIncidents?.[0]?.count || '0'),
  })

  // Generate recommendations
  const recommendations = generateComplianceRecommendations(complianceScore)

  return {
    periodStart,
    periodEnd,
    consentMetrics: {
      totalRequests: Number.parseInt(consentMetrics?.[0]?.total_requests || '0'),
      granted: Number.parseInt(consentMetrics?.[0]?.granted || '0'),
      withdrawn: Number.parseInt(consentMetrics?.[0]?.withdrawn || '0'),
      expired: Number.parseInt(consentMetrics?.[0]?.expired || '0'),
    },
    dataRequests: {
      exportRequests: Number.parseInt(dataRequestMetrics?.[0]?.export_requests || '0'),
      deletionRequests: Number.parseInt(dataRequestMetrics?.[0]?.deletion_requests || '0'),
      rectificationRequests: Number.parseInt(
        dataRequestMetrics?.[0]?.rectification_requests || '0'
      ),
      averageResponseTime: Number.parseFloat(dataRequestMetrics?.[0]?.avg_response_time || '0'),
    },
    breachIncidents: Number.parseInt(breachIncidents?.[0]?.count || '0'),
    complianceScore,
    recommendations,
  }
}

// Privacy Impact Assessment automation
export async function conductPrivacyImpactAssessment(params: {
  purpose: ProcessingPurpose
  dataCategories: DataCategory[]
  lawfulBasis: LawfulBasis
  processingDescription: string
  thirdParties?: string[]
  internationalTransfers?: boolean
  automatedDecisionMaking?: boolean
}): Promise<PrivacyImpactAssessment> {
  // Calculate risk level based on data sensitivity and processing type
  const riskLevel = calculatePrivacyRisk(params)

  // Generate mitigation measures based on risk assessment
  const mitigationMeasures = generateMitigationMeasures(params, riskLevel)

  const pia: PrivacyImpactAssessment = {
    id: `pia_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    purpose: params.purpose,
    dataCategories: params.dataCategories,
    lawfulBasis: params.lawfulBasis,
    riskLevel,
    mitigationMeasures,
    approvedBy: 'system_automated', // In production, require human approval for high-risk
    approvedAt: new Date(),
    reviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    status: riskLevel === 'high' ? 'draft' : 'approved',
  }

  // Store PIA record
  await sql`
    INSERT INTO privacy_impact_assessments (
      id, purpose, data_categories, lawful_basis, risk_level,
      mitigation_measures, approved_by, approved_at, review_date, status
    )
    VALUES (
      ${pia.id}, ${pia.purpose}, ${pia.dataCategories}, ${pia.lawfulBasis},
      ${pia.riskLevel}, ${pia.mitigationMeasures}, ${pia.approvedBy},
      ${pia.approvedAt}, ${pia.reviewDate}, ${pia.status}
    )
  `

  return pia
}

// Helper functions
function calculatePrivacyRisk(params: {
  purpose: ProcessingPurpose
  dataCategories: DataCategory[]
  lawfulBasis: LawfulBasis
}): 'low' | 'medium' | 'high' {
  // Sensitive data categories increase risk
  const sensitiveCategories = [
    DATA_CATEGORIES.BIOMETRIC_DATA,
    DATA_CATEGORIES.LOCATION,
    DATA_CATEGORIES.BEHAVIORAL,
  ]

  const hasSensitiveData = params.dataCategories.some(cat =>
    sensitiveCategories.includes(cat as 'biometric_data' | 'location_data' | 'behavioral_data')
  )

  if (hasSensitiveData && params.lawfulBasis === 'legitimate_interest') {
    return 'high'
  }
  if (hasSensitiveData || params.dataCategories.length > 5) {
    return 'medium'
  }

  return 'low'
}

function generateMitigationMeasures(
  _params: { dataCategories: DataCategory[] },
  riskLevel: 'low' | 'medium' | 'high'
): string[] {
  const measures = ['data_encryption', 'access_logging', 'regular_audits']

  if (riskLevel === 'high') {
    measures.push('additional_safeguards', 'enhanced_monitoring', 'regular_reviews')
  }

  return measures
}

function calculateComplianceScore(metrics: {
  consentMetrics: { total_requests: string; granted: string }
  dataRequestMetrics: { export_requests: string }
  breachIncidents: number
}): number {
  // Simplified compliance scoring
  let score = 100

  if (metrics.breachIncidents > 0) {
    score -= metrics.breachIncidents * 10
  }

  const consentRate =
    Number.parseInt(metrics.consentMetrics.granted) /
    Number.parseInt(metrics.consentMetrics.total_requests)
  if (consentRate < 0.8) {
    score -= 15
  }

  return Math.max(0, score)
}

function generateComplianceRecommendations(score: number): string[] {
  const recommendations: string[] = []

  if (score < 80) {
    recommendations.push('Improve consent collection processes')
    recommendations.push('Enhance security measures')
  }

  if (score < 60) {
    recommendations.push('Conduct security audit')
    recommendations.push('Review data processing activities')
  }

  return recommendations
}
