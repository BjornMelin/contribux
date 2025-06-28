/**
 * GDPR Constants and Type Definitions
 * Contains all constant values, enums, and type definitions for GDPR compliance
 */

// Enhanced consent types with granular categories
export const CONSENT_TYPES = {
  TERMS_OF_SERVICE: 'terms_of_service',
  PRIVACY_POLICY: 'privacy_policy',
  MARKETING_EMAILS: 'marketing_emails',
  USAGE_ANALYTICS: 'usage_analytics',
  THIRD_PARTY_SHARING: 'third_party_sharing',
  FUNCTIONAL_COOKIES: 'functional_cookies',
  ANALYTICS_COOKIES: 'analytics_cookies',
  ADVERTISING_COOKIES: 'advertising_cookies',
  PERSONALIZATION: 'personalization',
  AI_TRAINING: 'ai_training',
  RESEARCH_PARTICIPATION: 'research_participation',
  LOCATION_TRACKING: 'location_tracking',
  BIOMETRIC_DATA: 'biometric_data',
  BEHAVIORAL_PROFILING: 'behavioral_profiling',
} as const

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES]

// Privacy-by-design data categories
export const DATA_CATEGORIES = {
  IDENTITY: 'identity_data',
  CONTACT: 'contact_data',
  PROFILE: 'profile_data',
  BEHAVIORAL: 'behavioral_data',
  TECHNICAL: 'technical_data',
  LOCATION: 'location_data',
  COMMUNICATION: 'communication_data',
  TRANSACTION: 'transaction_data',
  PREFERENCE: 'preference_data',
  SECURITY: 'security_data',
  USAGE: 'usage_data',
  CONTENT: 'content_data',
  BIOMETRIC_DATA: 'biometric_data',
} as const

export type DataCategory = (typeof DATA_CATEGORIES)[keyof typeof DATA_CATEGORIES]

// Data processing purposes aligned with GDPR Article 6
export const PROCESSING_PURPOSES = {
  SERVICE_PROVISION: 'service_provision',
  CONTRACT_PERFORMANCE: 'contract_performance',
  LEGAL_COMPLIANCE: 'legal_compliance',
  VITAL_INTERESTS: 'vital_interests',
  PUBLIC_TASK: 'public_task',
  LEGITIMATE_INTEREST: 'legitimate_interest',
  CONSENT_BASED: 'consent_based',
  SECURITY_MONITORING: 'security_monitoring',
  FRAUD_PREVENTION: 'fraud_prevention',
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  RESEARCH: 'research',
} as const

export type ProcessingPurpose = (typeof PROCESSING_PURPOSES)[keyof typeof PROCESSING_PURPOSES]

// Enhanced consent versions with GDPR 2.0 compliance
export const CURRENT_VERSIONS = {
  [CONSENT_TYPES.TERMS_OF_SERVICE]: '2.0',
  [CONSENT_TYPES.PRIVACY_POLICY]: '2.0',
  [CONSENT_TYPES.MARKETING_EMAILS]: '2.0',
  [CONSENT_TYPES.USAGE_ANALYTICS]: '2.0',
  [CONSENT_TYPES.THIRD_PARTY_SHARING]: '2.0',
  [CONSENT_TYPES.FUNCTIONAL_COOKIES]: '1.0',
  [CONSENT_TYPES.ANALYTICS_COOKIES]: '1.0',
  [CONSENT_TYPES.ADVERTISING_COOKIES]: '1.0',
  [CONSENT_TYPES.PERSONALIZATION]: '1.0',
  [CONSENT_TYPES.AI_TRAINING]: '1.0',
  [CONSENT_TYPES.RESEARCH_PARTICIPATION]: '1.0',
  [CONSENT_TYPES.LOCATION_TRACKING]: '1.0',
  [CONSENT_TYPES.BIOMETRIC_DATA]: '1.0',
  [CONSENT_TYPES.BEHAVIORAL_PROFILING]: '1.0',
}

// Data retention periods by category (privacy-by-design)
export const DATA_RETENTION_PERIODS = {
  [DATA_CATEGORIES.IDENTITY]: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
  [DATA_CATEGORIES.CONTACT]: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
  [DATA_CATEGORIES.PROFILE]: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
  [DATA_CATEGORIES.BEHAVIORAL]: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
  [DATA_CATEGORIES.TECHNICAL]: 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
  [DATA_CATEGORIES.LOCATION]: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
  [DATA_CATEGORIES.COMMUNICATION]: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
  [DATA_CATEGORIES.TRANSACTION]: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years (legal)
  [DATA_CATEGORIES.PREFERENCE]: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
  [DATA_CATEGORIES.SECURITY]: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years (security)
  [DATA_CATEGORIES.USAGE]: 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
  [DATA_CATEGORIES.CONTENT]: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
} as const

// Data minimization rules
export const DATA_MINIMIZATION_RULES = {
  [DATA_CATEGORIES.IDENTITY]: ['email', 'github_username'],
  [DATA_CATEGORIES.CONTACT]: ['email', 'recovery_email'],
  [DATA_CATEGORIES.PROFILE]: ['email_verified', 'two_factor_enabled'],
  [DATA_CATEGORIES.BEHAVIORAL]: [], // No mandatory fields - collect only if consented
  [DATA_CATEGORIES.TECHNICAL]: ['ip_address', 'user_agent'], // Session essentials only
  [DATA_CATEGORIES.LOCATION]: [], // No mandatory location data
  [DATA_CATEGORIES.COMMUNICATION]: [], // Optional notification preferences
  [DATA_CATEGORIES.TRANSACTION]: [], // Business records only
  [DATA_CATEGORIES.PREFERENCE]: [], // User-controlled preferences
  [DATA_CATEGORIES.SECURITY]: ['failed_login_attempts', 'locked_at'], // Security essentials
  [DATA_CATEGORIES.USAGE]: [], // Analytics only if consented
  [DATA_CATEGORIES.CONTENT]: [], // User-generated content only
} as const

// Lawful basis for processing (aligned with GDPR Article 6)
export const LAWFUL_BASIS = {
  CONSENT: 'consent',
  CONTRACT: 'contract',
  LEGAL_OBLIGATION: 'legal_obligation',
  VITAL_INTERESTS: 'vital_interests',
  PUBLIC_TASK: 'public_task',
  LEGITIMATE_INTEREST: 'legitimate_interest',
} as const

export type LawfulBasis = (typeof LAWFUL_BASIS)[keyof typeof LAWFUL_BASIS]
