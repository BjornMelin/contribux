/**
 * Security test fixtures and scenarios for SOAR testing
 * Provides realistic security incidents, threats, and vulnerabilities
 */

import type {
  SecurityIncident,
  ThreatDetection,
  Vulnerability,
} from '../../../../src/lib/security/automated-scanner'

export const createMockSecurityIncident = (
  overrides?: Partial<SecurityIncident>
): SecurityIncident => ({
  incidentId: 'incident-123',
  type: 'vulnerability',
  severity: 'critical',
  status: 'open',
  title: 'Critical Security Vulnerabilities Detected',
  description: 'Multiple critical vulnerabilities found',
  affectedSystems: ['api-server', 'database'],
  vulnerabilities: ['vuln-1', 'vuln-2'],
  threats: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  timeline: [
    {
      timestamp: Date.now(),
      action: 'incident_created',
      details: 'Incident created by automated scanner',
      performedBy: 'automated_scanner',
    },
  ],
  impact: {
    confidentiality: 'high',
    integrity: 'high',
    availability: 'medium',
  },
  containmentActions: [],
  remediationSteps: [],
  preventionMeasures: [],
  ...overrides,
})

export const createMockThreatDetection = (
  overrides?: Partial<ThreatDetection>
): ThreatDetection => ({
  threatId: 'threat-456',
  type: 'sql_injection_attempt',
  severity: 'critical',
  source: {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    location: {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
    },
  },
  target: {
    endpoint: '/api/search',
    method: 'POST',
  },
  detectedAt: Date.now(),
  confidence: 0.95,
  indicators: ['sql_keywords_detected', 'unusual_query_patterns'],
  mlScore: 0.9,
  blocked: false,
  ...overrides,
})

export const createMockVulnerability = (overrides?: Partial<Vulnerability>): Vulnerability => ({
  id: 'vuln-789',
  type: 'injection',
  severity: 'critical',
  title: 'SQL Injection Vulnerability',
  description: 'User input not properly sanitized',
  location: {
    endpoint: '/api/search',
    function: 'searchUsers',
  },
  impact: 'Attackers could access sensitive database information',
  recommendation: 'Use parameterized queries',
  detectedAt: Date.now(),
  confidence: 0.9,
  evidence: ['Unsanitized user input', 'Direct SQL concatenation'],
  mitigated: false,
  ...overrides,
})

export const securityScenarios = {
  criticalIncident: () =>
    createMockSecurityIncident({
      severity: 'critical',
      incidentId: 'critical-incident-001',
      title: 'Critical System Compromise Detected',
    }),

  sqlInjectionThreat: () =>
    createMockThreatDetection({
      type: 'sql_injection_attempt',
      threatId: 'sql-threat-001',
      confidence: 0.98,
    }),

  bruteForceAttack: () =>
    createMockThreatDetection({
      type: 'brute_force',
      threatId: 'brute-force-001',
      severity: 'high',
      source: {
        ip: '10.0.0.1',
        userAgent: 'AttackBot/1.0',
        location: {
          country: 'Unknown',
          region: 'Unknown',
          city: 'Unknown',
        },
      },
    }),

  criticalVulnerability: () =>
    createMockVulnerability({
      severity: 'critical',
      id: 'critical-vuln-001',
      type: 'injection',
    }),

  xssVulnerability: () =>
    createMockVulnerability({
      type: 'xss',
      id: 'xss-vuln-001',
      severity: 'high',
      title: 'Cross-Site Scripting Vulnerability',
      description: 'User input reflected without sanitization',
    }),
}

export const threatTypes = [
  'brute_force',
  'sql_injection_attempt',
  'xss_attempt',
  'privilege_escalation',
] as const

export const responseActionTypes = [
  'block_ip',
  'quarantine_user',
  'disable_account',
  'isolate_system',
  'collect_evidence',
  'notify_stakeholders',
  'escalate_incident',
] as const
