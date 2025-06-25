/**
 * Security Module Schemas
 * Contains all Zod schemas and type definitions for security event contexts,
 * playbook triggers, and security automation workflows
 */

import { z } from 'zod'

// Security Event Context Schemas based on SOAR and security automation best practices
export const SecurityEventContextSchema = z.object({
  // Basic event identification
  eventId: z.string(),
  timestamp: z.number(),
  source: z.string(),

  // Event classification
  type: z.enum([
    'vulnerability',
    'threat',
    'incident',
    'compliance_violation',
    'authentication_failure',
    'data_breach',
    'malware_detection',
    'suspicious_activity',
    'system_anomaly',
    'network_intrusion',
    'privilege_escalation',
    'data_exfiltration',
  ]),

  // Severity and confidence scoring
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  riskScore: z.number().min(0).max(100),

  // Affected entities and systems
  affectedSystems: z.array(z.string()).default([]),
  affectedUsers: z.array(z.string()).default([]),
  affectedAssets: z.array(z.string()).default([]),

  // Technical context
  sourceIp: z.string().optional(),
  targetIp: z.string().optional(),
  userAgent: z.string().optional(),
  endpoint: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']).optional(),

  // Geographic and behavioral context
  geolocation: z
    .object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      coordinates: z
        .object({
          latitude: z.number(),
          longitude: z.number(),
        })
        .optional(),
    })
    .optional(),

  // Detection context
  detectionMethod: z
    .enum([
      'signature_based',
      'anomaly_detection',
      'machine_learning',
      'heuristic',
      'behavioral_analysis',
      'threat_intelligence',
      'manual_review',
    ])
    .optional(),

  // Additional context data
  indicators: z.array(z.string()).default([]),
  evidenceFiles: z.array(z.string()).default([]),
  relatedEvents: z.array(z.string()).default([]),

  // Business context
  businessImpact: z.enum(['none', 'low', 'medium', 'high', 'critical']).default('medium'),
  affectedServices: z.array(z.string()).default([]),

  // Compliance and regulatory context
  complianceFrameworks: z
    .array(z.enum(['SOX', 'GDPR', 'HIPAA', 'PCI_DSS', 'ISO_27001', 'NIST', 'CIS', 'SOC2']))
    .default([]),

  // Custom metadata for extensibility
  metadata: z.record(z.unknown()).default({}),
})

export type SecurityEventContext = z.infer<typeof SecurityEventContextSchema>

// Threat Intelligence Context Schema
export const ThreatIntelligenceContextSchema = z.object({
  // Threat identification
  threatId: z.string(),
  threatFamily: z.string().optional(),
  campaignId: z.string().optional(),

  // Threat classification
  category: z.enum([
    'malware',
    'phishing',
    'ransomware',
    'apt',
    'insider_threat',
    'ddos',
    'data_theft',
    'fraud',
    'social_engineering',
    'supply_chain',
  ]),

  // Attribution and actor information
  attribution: z
    .object({
      actor: z.string().optional(),
      motivation: z
        .enum(['financial', 'espionage', 'disruption', 'activism', 'unknown'])
        .optional(),
      sophistication: z.enum(['low', 'medium', 'high', 'state_sponsored']).optional(),
      region: z.string().optional(),
    })
    .optional(),

  // Indicators of Compromise (IoCs)
  iocs: z
    .array(
      z.object({
        type: z.enum(['ip', 'domain', 'url', 'hash', 'email', 'file_path', 'registry_key']),
        value: z.string(),
        confidence: z.number().min(0).max(1),
        firstSeen: z.number(),
        lastSeen: z.number(),
      })
    )
    .default([]),

  // Tactics, Techniques, and Procedures (TTPs)
  ttps: z
    .array(
      z.object({
        technique: z.string(),
        tactic: z.string(),
        mitreId: z.string().optional(),
        description: z.string(),
      })
    )
    .default([]),

  // Threat intelligence sources
  sources: z
    .array(
      z.object({
        name: z.string(),
        reliability: z.enum(['A', 'B', 'C', 'D', 'E', 'F']), // Admiralty Scale
        confidence: z.enum(['1', '2', '3', '4', '5', '6']), // Admiralty Scale
        lastUpdated: z.number(),
      })
    )
    .default([]),
})

export type ThreatIntelligenceContext = z.infer<typeof ThreatIntelligenceContextSchema>

// Incident Response Context Schema
export const IncidentResponseContextSchema = z.object({
  // Incident identification
  incidentId: z.string(),
  parentIncidentId: z.string().optional(),

  // Incident lifecycle
  phase: z.enum([
    'preparation',
    'identification',
    'containment',
    'eradication',
    'recovery',
    'lessons_learned',
  ]),

  // Response team context
  assignedTeam: z.string().optional(),
  primaryResponder: z.string().optional(),
  stakeholders: z.array(z.string()).default([]),

  // Timeline and SLAs
  detectedAt: z.number(),
  reportedAt: z.number().optional(),
  acknowledgedAt: z.number().optional(),
  containedAt: z.number().optional(),
  resolvedAt: z.number().optional(),

  // SLA requirements
  slaRequirements: z
    .object({
      responseTime: z.number(), // minutes
      resolutionTime: z.number(), // minutes
      escalationTime: z.number(), // minutes
    })
    .optional(),

  // Communication and notification context
  communicationPlan: z
    .object({
      internalNotifications: z.array(z.string()).default([]),
      externalNotifications: z.array(z.string()).default([]),
      mediaResponse: z.boolean().default(false),
      customerNotification: z.boolean().default(false),
      regulatoryNotification: z.boolean().default(false),
    })
    .optional(),

  // Legal and compliance context
  legalHold: z.boolean().default(false),
  evidenceChain: z
    .array(
      z.object({
        item: z.string(),
        custodian: z.string(),
        timestamp: z.number(),
        hash: z.string().optional(),
      })
    )
    .default([]),
})

export type IncidentResponseContext = z.infer<typeof IncidentResponseContextSchema>

// Vulnerability Assessment Context Schema
export const VulnerabilityContextSchema = z.object({
  // Vulnerability identification
  vulnerabilityId: z.string(),
  cveId: z.string().optional(),
  cweId: z.string().optional(),

  // CVSS scoring
  cvssScore: z
    .object({
      version: z.enum(['3.1', '3.0', '2.0']),
      baseScore: z.number().min(0).max(10),
      temporalScore: z.number().min(0).max(10).optional(),
      environmentalScore: z.number().min(0).max(10).optional(),
      vector: z.string(),
    })
    .optional(),

  // Vulnerability classification
  category: z.enum([
    'injection',
    'broken_authentication',
    'sensitive_data_exposure',
    'xml_external_entities',
    'broken_access_control',
    'security_misconfiguration',
    'cross_site_scripting',
    'insecure_deserialization',
    'vulnerable_components',
    'insufficient_logging',
    'buffer_overflow',
    'privilege_escalation',
    'information_disclosure',
    'denial_of_service',
  ]),

  // Affected components
  affectedComponents: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        vendor: z.string().optional(),
        location: z.string().optional(),
      })
    )
    .default([]),

  // Exploitability context
  exploitability: z
    .object({
      exploitAvailable: z.boolean(),
      exploitComplexity: z.enum(['low', 'medium', 'high']),
      requiredPrivileges: z.enum(['none', 'low', 'high']),
      userInteraction: z.enum(['none', 'required']),
    })
    .optional(),

  // Remediation context
  remediation: z
    .object({
      patchAvailable: z.boolean(),
      patchUrl: z.string().optional(),
      workaroundAvailable: z.boolean(),
      workaroundDescription: z.string().optional(),
      estimatedFixTime: z.number().optional(), // hours
    })
    .optional(),
})

export type VulnerabilityContext = z.infer<typeof VulnerabilityContextSchema>

// Comprehensive Security Context Schema (union of all contexts)
export const ComprehensiveSecurityContextSchema = z.object({
  event: SecurityEventContextSchema,
  threat: ThreatIntelligenceContextSchema.optional(),
  incident: IncidentResponseContextSchema.optional(),
  vulnerability: VulnerabilityContextSchema.optional(),

  // Cross-cutting concerns
  correlationId: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  timezone: z.string().default('UTC'),

  // Processing metadata
  processedAt: z.number().default(() => Date.now()),
  processingDuration: z.number().optional(), // milliseconds
  automationTriggered: z.boolean().default(false),
})

export type ComprehensiveSecurityContext = z.infer<typeof ComprehensiveSecurityContextSchema>

// Playbook Trigger Context Schema - specifically for SOAR playbook evaluation
export const PlaybookTriggerContextSchema = z.object({
  // Trigger identification
  triggerId: z.string(),
  triggerType: z.enum(['manual', 'automatic', 'scheduled', 'api']),

  // Security context
  securityContext: ComprehensiveSecurityContextSchema,

  // Trigger conditions evaluation context
  conditionEvaluation: z.object({
    evaluatedAt: z.number(),
    evaluationDuration: z.number().optional(), // milliseconds
    conditions: z.array(
      z.object({
        condition: z.string(),
        result: z.boolean(),
        confidence: z.number().min(0).max(1).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    ),
  }),

  // Automation context
  automationLevel: z.enum(['none', 'low', 'medium', 'high', 'full']),
  requiresApproval: z.boolean().default(true),
  approver: z.string().optional(),

  // Context for decision making
  historicalData: z
    .object({
      similarIncidents: z.number().default(0),
      previousPlaybookExecutions: z.number().default(0),
      averageResolutionTime: z.number().optional(), // minutes
      successRate: z.number().min(0).max(1).optional(),
    })
    .optional(),
})

export type PlaybookTriggerContext = z.infer<typeof PlaybookTriggerContextSchema>

// Scanner Configuration Context - for fixing exactOptionalPropertyTypes issues
export const ScannerTimeoutConfigSchema = z.object({
  scanTimeout: z.number().positive().optional(),
  connectionTimeout: z.number().positive().optional(),
  retryTimeout: z.number().positive().optional(),
  globalTimeout: z.number().positive().optional(),
})

export type ScannerTimeoutConfig = z.infer<typeof ScannerTimeoutConfigSchema>

// Enhanced Security Scanner Configuration with proper optional handling
export const EnhancedSecurityScannerConfigSchema = z.object({
  scanner: z.object({
    enableOWASP: z.boolean(),
    enableDependencyScanning: z.boolean(),
    enablePenetrationTesting: z.boolean(),
    enableThreatDetection: z.boolean(),
    scanIntervalMs: z.number().min(60000),
    maxConcurrentScans: z.number().min(1).max(10),
  }),
  owasp: z.object({
    enableInjectionDetection: z.boolean(),
    enableBrokenAuthDetection: z.boolean(),
    enableSensitiveDataDetection: z.boolean(),
    enableXMLExternalEntitiesDetection: z.boolean(),
    enableBrokenAccessControlDetection: z.boolean(),
    enableSecurityMisconfigurationDetection: z.boolean(),
    enableXSSDetection: z.boolean(),
    enableInsecureDeserializationDetection: z.boolean(),
    enableVulnerableComponentsDetection: z.boolean(),
    enableLoggingMonitoringDetection: z.boolean(),
  }),
  threats: z.object({
    enableMLDetection: z.boolean(),
    suspiciousThreshold: z.number().min(0).max(1),
    criticalThreshold: z.number().min(0).max(1),
    enableGeoAnomalyDetection: z.boolean(),
    enableBehaviorAnomalyDetection: z.boolean(),
    enableRateLimitAnomalyDetection: z.boolean(),
  }),
  response: z.object({
    enableAutomatedResponse: z.boolean(),
    enableIncidentCreation: z.boolean(),
    enableNotifications: z.boolean(),
    quarantineSuspiciousRequests: z.boolean(),
    blockCriticalThreats: z.boolean(),
  }),
  timeouts: ScannerTimeoutConfigSchema.optional(),
})

export type EnhancedSecurityScannerConfig = z.infer<typeof EnhancedSecurityScannerConfigSchema>

// Partial configuration schema for constructor - properly handles optional properties
export const PartialSecurityScannerConfigSchema = z
  .object({
    scanner: z
      .object({
        enableOWASP: z.boolean().optional(),
        enableDependencyScanning: z.boolean().optional(),
        enablePenetrationTesting: z.boolean().optional(),
        enableThreatDetection: z.boolean().optional(),
        scanIntervalMs: z.number().min(60000).optional(),
        maxConcurrentScans: z.number().min(1).max(10).optional(),
      })
      .optional(),
    owasp: z
      .object({
        enableInjectionDetection: z.boolean().optional(),
        enableBrokenAuthDetection: z.boolean().optional(),
        enableSensitiveDataDetection: z.boolean().optional(),
        enableXMLExternalEntitiesDetection: z.boolean().optional(),
        enableBrokenAccessControlDetection: z.boolean().optional(),
        enableSecurityMisconfigurationDetection: z.boolean().optional(),
        enableXSSDetection: z.boolean().optional(),
        enableInsecureDeserializationDetection: z.boolean().optional(),
        enableVulnerableComponentsDetection: z.boolean().optional(),
        enableLoggingMonitoringDetection: z.boolean().optional(),
      })
      .optional(),
    threats: z
      .object({
        enableMLDetection: z.boolean().optional(),
        suspiciousThreshold: z.number().min(0).max(1).optional(),
        criticalThreshold: z.number().min(0).max(1).optional(),
        enableGeoAnomalyDetection: z.boolean().optional(),
        enableBehaviorAnomalyDetection: z.boolean().optional(),
        enableRateLimitAnomalyDetection: z.boolean().optional(),
      })
      .optional(),
    response: z
      .object({
        enableAutomatedResponse: z.boolean().optional(),
        enableIncidentCreation: z.boolean().optional(),
        enableNotifications: z.boolean().optional(),
        quarantineSuspiciousRequests: z.boolean().optional(),
        blockCriticalThreats: z.boolean().optional(),
      })
      .optional(),
    timeouts: ScannerTimeoutConfigSchema.optional(),
  })
  .optional()

export type PartialSecurityScannerConfig = z.infer<typeof PartialSecurityScannerConfigSchema>

// Validation helpers
export function validateSecurityEventContext(context: unknown): SecurityEventContext {
  return SecurityEventContextSchema.parse(context)
}

export function validatePlaybookTriggerContext(context: unknown): PlaybookTriggerContext {
  return PlaybookTriggerContextSchema.parse(context)
}

export function validateComprehensiveSecurityContext(
  context: unknown
): ComprehensiveSecurityContext {
  return ComprehensiveSecurityContextSchema.parse(context)
}

// Safe context creation with defaults
export function createSecurityEventContext(
  partial: Partial<SecurityEventContext>
): SecurityEventContext {
  return SecurityEventContextSchema.parse({
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    source: 'automated_scanner',
    type: 'system_anomaly',
    severity: 'medium',
    confidence: 0.5,
    riskScore: 50,
    businessImpact: 'medium',
    metadata: {},
    ...partial,
  })
}

export function createPlaybookTriggerContext(
  securityContext: ComprehensiveSecurityContext,
  partial: Partial<Omit<PlaybookTriggerContext, 'securityContext'>> = {}
): PlaybookTriggerContext {
  return PlaybookTriggerContextSchema.parse({
    triggerId: `trigger_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    triggerType: 'automatic',
    securityContext,
    conditionEvaluation: {
      evaluatedAt: Date.now(),
      conditions: [],
    },
    automationLevel: 'medium',
    requiresApproval: true,
    ...partial,
  })
}
