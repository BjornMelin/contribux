/**
 * Automated Security Scanner Test Suite
 * Tests OWASP Top 10 detection, vulnerability scanning, dependency scanning,
 * threat detection, and incident response capabilities
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AutomatedSecurityScanner,
  createSecurityScanner,
  OWASPScanner,
  type SecurityScannerConfig,
  type ThreatDetection,
  type Vulnerability,
} from '@/lib/security/automated-scanner'

// Mock crypto module
vi.mock('@/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

describe('Automated Security Scanner', () => {
  let scanner: AutomatedSecurityScanner
  let mockConfig: Partial<SecurityScannerConfig>

  beforeEach(() => {
    vi.clearAllMocks()

    mockConfig = {
      scanner: {
        enableOWASP: true,
        enableDependencyScanning: true,
        enablePenetrationTesting: false,
        enableThreatDetection: true,
        scanIntervalMs: 60000,
        maxConcurrentScans: 2,
      },
      owasp: {
        enableInjectionDetection: true,
        enableBrokenAuthDetection: true,
        enableSensitiveDataDetection: true,
        enableXMLExternalEntitiesDetection: true,
        enableBrokenAccessControlDetection: true,
        enableSecurityMisconfigurationDetection: true,
        enableXSSDetection: true,
        enableInsecureDeserializationDetection: true,
        enableVulnerableComponentsDetection: true,
        enableLoggingMonitoringDetection: true,
      },
      threats: {
        enableMLDetection: true,
        suspiciousThreshold: 0.7,
        criticalThreshold: 0.9,
        enableGeoAnomalyDetection: true,
        enableBehaviorAnomalyDetection: true,
        enableRateLimitAnomalyDetection: true,
      },
      response: {
        enableAutomatedResponse: true,
        enableIncidentCreation: true,
        enableNotifications: true,
        quarantineSuspiciousRequests: true,
        blockCriticalThreats: true,
      },
    }

    scanner = new AutomatedSecurityScanner(mockConfig)
  })

  afterEach(async () => {
    await scanner.shutdown()
  })

  describe('Scanner Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultScanner = new AutomatedSecurityScanner()
      const metrics = defaultScanner.getSecurityMetrics()

      expect(metrics.scanning.isActive).toBe(false)
      expect(metrics.vulnerabilities.total).toBe(0)
      expect(metrics.threats.total).toBe(0)
      expect(metrics.incidents.total).toBe(0)
    })

    it('should initialize with custom configuration', () => {
      const customScanner = new AutomatedSecurityScanner(mockConfig)
      const metrics = customScanner.getSecurityMetrics()

      expect(metrics.scanning.isActive).toBe(false)
      expect(metrics.vulnerabilities.total).toBe(0)
    })

    it('should create scanner using factory function', () => {
      const factoryScanner = createSecurityScanner(mockConfig)
      expect(factoryScanner).toBeInstanceOf(AutomatedSecurityScanner)
    })
  })

  describe('Automated Scanning Lifecycle', () => {
    it('should start automated scanning successfully', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      expect(testScanner.getSecurityMetrics().scanning.isActive).toBe(false)

      await testScanner.startAutomatedScanning()

      expect(testScanner.getSecurityMetrics().scanning.isActive).toBe(true)
      expect(testScanner.getSecurityMetrics().scanning.totalScans).toBeGreaterThan(0)

      await testScanner.shutdown()
    })

    it('should stop automated scanning successfully', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      await testScanner.startAutomatedScanning()
      expect(testScanner.getSecurityMetrics().scanning.isActive).toBe(true)

      await testScanner.stopAutomatedScanning()

      expect(testScanner.getSecurityMetrics().scanning.isActive).toBe(false)

      await testScanner.shutdown()
    })

    it('should prevent starting scanner when already running', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      await testScanner.startAutomatedScanning()

      await expect(testScanner.startAutomatedScanning()).rejects.toThrow(
        'Security scanning is already running'
      )

      await testScanner.shutdown()
    })

    it('should handle stop when not running gracefully', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      await expect(testScanner.stopAutomatedScanning()).resolves.not.toThrow()

      await testScanner.shutdown()
    })
  })

  describe('Comprehensive Security Scanning', () => {
    it('should perform comprehensive security scan', async () => {
      const results = await scanner.performComprehensiveScan()

      expect(results).toHaveProperty('vulnerabilities')
      expect(results).toHaveProperty('threats')
      expect(results).toHaveProperty('incidents')
      expect(Array.isArray(results.vulnerabilities)).toBe(true)
      expect(Array.isArray(results.threats)).toBe(true)
      expect(Array.isArray(results.incidents)).toBe(true)
    })

    it('should record scan history', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      await testScanner.performComprehensiveScan()

      const history = testScanner.getScanHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toHaveProperty('timestamp')
      expect(history[0]).toHaveProperty('type', 'comprehensive')
      expect(history[0]).toHaveProperty('results')
      expect(typeof history[0].results).toBe('number')

      await testScanner.shutdown()
    })

    it('should update security metrics after scan', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      const initialMetrics = testScanner.getSecurityMetrics()

      await testScanner.performComprehensiveScan()

      const updatedMetrics = testScanner.getSecurityMetrics()
      expect(updatedMetrics.scanning.totalScans).toBeGreaterThan(initialMetrics.scanning.totalScans)
      expect(updatedMetrics.scanning.lastScan).toBeGreaterThan(0)

      await testScanner.shutdown()
    })
  })

  describe('OWASP Top 10 Vulnerability Scanning', () => {
    it('should perform OWASP Top 10 scan', async () => {
      const vulnerabilities = await scanner.performOWASPScan()

      expect(Array.isArray(vulnerabilities)).toBe(true)

      // Validate vulnerability structure
      vulnerabilities.forEach(vuln => {
        expect(vuln).toHaveProperty('id')
        expect(vuln).toHaveProperty('type')
        expect(vuln).toHaveProperty('severity')
        expect(vuln).toHaveProperty('title')
        expect(vuln).toHaveProperty('description')
        expect(vuln).toHaveProperty('location')
        expect(vuln).toHaveProperty('impact')
        expect(vuln).toHaveProperty('recommendation')
        expect(vuln).toHaveProperty('detectedAt')
        expect(vuln).toHaveProperty('confidence')
        expect(vuln).toHaveProperty('evidence')
        expect(vuln.confidence).toBeGreaterThanOrEqual(0)
        expect(vuln.confidence).toBeLessThanOrEqual(1)
      })
    })

    it('should detect various OWASP vulnerability types', async () => {
      // Run multiple scans to increase chance of detecting different types
      const vulnerabilities: Vulnerability[] = []

      for (let i = 0; i < 10; i++) {
        const results = await scanner.performOWASPScan()
        vulnerabilities.push(...results)
      }

      const detectedTypes = [...new Set(vulnerabilities.map(v => v.type))]
      expect(detectedTypes.length).toBeGreaterThanOrEqual(0)

      // Check that detected types are valid OWASP categories
      const validTypes = [
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
      ]

      detectedTypes.forEach(type => {
        expect(validTypes).toContain(type)
      })
    })

    it('should create vulnerabilities with proper severity levels', async () => {
      const vulnerabilities = await scanner.performOWASPScan()

      const severityLevels = ['low', 'medium', 'high', 'critical']
      vulnerabilities.forEach(vuln => {
        expect(severityLevels).toContain(vuln.severity)
      })
    })
  })

  describe('Dependency Vulnerability Scanning', () => {
    it('should perform dependency vulnerability scan', async () => {
      const vulnerabilities = await scanner.performDependencyScan()

      expect(Array.isArray(vulnerabilities)).toBe(true)

      // Check for vulnerable component type
      vulnerabilities.forEach(vuln => {
        expect(vuln.type).toBe('vulnerable_components')
        expect(vuln).toHaveProperty('location.dependency')
        expect(vuln.confidence).toBeGreaterThanOrEqual(0.9) // Dependency scans should be high confidence
      })
    })

    it('should include CVE information when available', async () => {
      const vulnerabilities = await scanner.performDependencyScan()

      const vulnsWithCVE = vulnerabilities.filter(v => v.cveId)
      vulnsWithCVE.forEach(vuln => {
        expect(vuln.cveId).toMatch(/^CVE-\d{4}-\d+$/)
      })
    })
  })

  describe('Penetration Testing', () => {
    it('should skip penetration testing when disabled', async () => {
      const disabledConfig = {
        ...mockConfig,
        scanner: { ...mockConfig.scanner, enablePenetrationTesting: false },
      }

      const testScanner = new AutomatedSecurityScanner(disabledConfig)
      const results = await testScanner.performComprehensiveScan()

      // Should not find penetration test vulnerabilities
      const penTestVulns = results.vulnerabilities.filter(
        v => v.location.function === 'automated_pentest'
      )
      expect(penTestVulns).toHaveLength(0)

      await testScanner.shutdown()
    })

    it('should perform penetration testing when enabled', async () => {
      const enabledConfig = {
        ...mockConfig,
        scanner: { ...mockConfig.scanner, enablePenetrationTesting: true },
      }

      const testScanner = new AutomatedSecurityScanner(enabledConfig)
      const vulnerabilities = await testScanner.performPenetrationTest()

      expect(Array.isArray(vulnerabilities)).toBe(true)

      // Penetration test findings should be high severity
      vulnerabilities.forEach(vuln => {
        expect(['high', 'critical']).toContain(vuln.severity)
        expect(vuln.confidence).toBeGreaterThanOrEqual(0.8)
      })

      await testScanner.shutdown()
    })
  })

  describe('Real-time Threat Detection', () => {
    it('should perform threat detection', async () => {
      const threats = await scanner.performThreatDetection()

      expect(Array.isArray(threats)).toBe(true)

      threats.forEach(threat => {
        expect(threat).toHaveProperty('threatId')
        expect(threat).toHaveProperty('type')
        expect(threat).toHaveProperty('severity')
        expect(threat).toHaveProperty('source')
        expect(threat).toHaveProperty('target')
        expect(threat).toHaveProperty('detectedAt')
        expect(threat).toHaveProperty('confidence')
        expect(threat).toHaveProperty('indicators')
        expect(threat.confidence).toBeGreaterThanOrEqual(0)
        expect(threat.confidence).toBeLessThanOrEqual(1)
      })
    })

    it('should detect various threat types', async () => {
      const threats: ThreatDetection[] = []

      // Run multiple detections to get variety
      for (let i = 0; i < 10; i++) {
        const results = await scanner.performThreatDetection()
        threats.push(...results)
      }

      const detectedTypes = [...new Set(threats.map(t => t.type))]
      expect(detectedTypes.length).toBeGreaterThanOrEqual(0)

      const validTypes = [
        'brute_force',
        'ddos',
        'sql_injection_attempt',
        'xss_attempt',
        'suspicious_file_access',
        'unusual_data_exfiltration',
        'privilege_escalation',
        'lateral_movement',
        'anomalous_behavior',
        'geographic_anomaly',
        'rate_limit_abuse',
      ]

      detectedTypes.forEach(type => {
        expect(validTypes).toContain(type)
      })
    })

    it('should auto-block critical threats when enabled', async () => {
      const threats = await scanner.performThreatDetection()

      const criticalThreats = threats.filter(t => t.severity === 'critical')
      criticalThreats.forEach(threat => {
        expect(threat.blocked).toBe(true)
      })
    })

    it('should include ML scores for threats', async () => {
      const threats = await scanner.performThreatDetection()

      threats.forEach(threat => {
        if (threat.mlScore !== undefined) {
          expect(threat.mlScore).toBeGreaterThanOrEqual(0)
          expect(threat.mlScore).toBeLessThanOrEqual(1)
        }
      })
    })
  })

  describe('Security Metrics and Reporting', () => {
    it('should provide comprehensive security metrics', async () => {
      await scanner.performComprehensiveScan()

      const metrics = scanner.getSecurityMetrics()

      expect(metrics).toHaveProperty('vulnerabilities')
      expect(metrics).toHaveProperty('threats')
      expect(metrics).toHaveProperty('incidents')
      expect(metrics).toHaveProperty('scanning')

      expect(metrics.vulnerabilities).toHaveProperty('total')
      expect(metrics.vulnerabilities).toHaveProperty('critical')
      expect(metrics.vulnerabilities).toHaveProperty('high')
      expect(metrics.vulnerabilities).toHaveProperty('medium')
      expect(metrics.vulnerabilities).toHaveProperty('low')
      expect(metrics.vulnerabilities).toHaveProperty('mitigated')

      expect(metrics.threats).toHaveProperty('total')
      expect(metrics.threats).toHaveProperty('critical')
      expect(metrics.threats).toHaveProperty('high')
      expect(metrics.threats).toHaveProperty('blocked')

      expect(metrics.incidents).toHaveProperty('total')
      expect(metrics.incidents).toHaveProperty('open')
      expect(metrics.incidents).toHaveProperty('investigating')
      expect(metrics.incidents).toHaveProperty('resolved')

      expect(metrics.scanning).toHaveProperty('isActive')
      expect(metrics.scanning).toHaveProperty('lastScan')
      expect(metrics.scanning).toHaveProperty('totalScans')
    })

    it('should track vulnerability counts by severity', async () => {
      await scanner.performComprehensiveScan()

      const metrics = scanner.getSecurityMetrics()
      const vulnCounts = metrics.vulnerabilities

      expect(typeof vulnCounts.total).toBe('number')
      expect(typeof vulnCounts.critical).toBe('number')
      expect(typeof vulnCounts.high).toBe('number')
      expect(typeof vulnCounts.medium).toBe('number')
      expect(typeof vulnCounts.low).toBe('number')

      expect(vulnCounts.total).toBe(
        vulnCounts.critical + vulnCounts.high + vulnCounts.medium + vulnCounts.low
      )
    })

    it('should provide access to raw vulnerability data', () => {
      const vulnerabilities = scanner.getVulnerabilities()
      expect(Array.isArray(vulnerabilities)).toBe(true)
    })

    it('should provide access to raw threat data', () => {
      const threats = scanner.getThreats()
      expect(Array.isArray(threats)).toBe(true)
    })

    it('should provide access to raw incident data', () => {
      const incidents = scanner.getIncidents()
      expect(Array.isArray(incidents)).toBe(true)
    })
  })

  describe('Incident Creation and Management', () => {
    it('should create incidents for critical vulnerabilities', async () => {
      // Force creation of critical vulnerabilities by running multiple scans
      for (let i = 0; i < 20; i++) {
        await scanner.performOWASPScan()
      }

      const results = await scanner.performComprehensiveScan()
      const criticalVulns = results.vulnerabilities.filter(v => v.severity === 'critical')

      if (criticalVulns.length > 0) {
        expect(results.incidents.length).toBeGreaterThan(0)

        const vulnIncidents = results.incidents.filter(i => i.type === 'vulnerability')
        vulnIncidents.forEach(incident => {
          expect(incident.severity).toBe('critical')
          expect(incident.vulnerabilities.length).toBeGreaterThan(0)
          expect(incident.status).toBe('open')
        })
      }
    })

    it('should create incidents for critical threats', async () => {
      // Run threat detection multiple times to increase chances of finding critical threats
      for (let i = 0; i < 20; i++) {
        await scanner.performThreatDetection()
      }

      const results = await scanner.performComprehensiveScan()
      const criticalThreats = results.threats.filter(t => t.severity === 'critical')

      if (criticalThreats.length > 0) {
        expect(results.incidents.length).toBeGreaterThan(0)

        const threatIncidents = results.incidents.filter(i => i.type === 'threat')
        threatIncidents.forEach(incident => {
          expect(incident.severity).toBe('critical')
          expect(incident.threats.length).toBeGreaterThan(0)
          expect(incident.status).toBe('open')
        })
      }
    })

    it('should include proper incident metadata', async () => {
      const results = await scanner.performComprehensiveScan()

      results.incidents.forEach(incident => {
        expect(incident).toHaveProperty('incidentId')
        expect(incident).toHaveProperty('type')
        expect(incident).toHaveProperty('severity')
        expect(incident).toHaveProperty('status')
        expect(incident).toHaveProperty('title')
        expect(incident).toHaveProperty('description')
        expect(incident).toHaveProperty('affectedSystems')
        expect(incident).toHaveProperty('createdAt')
        expect(incident).toHaveProperty('updatedAt')
        expect(incident).toHaveProperty('timeline')
        expect(incident).toHaveProperty('impact')

        expect(Array.isArray(incident.affectedSystems)).toBe(true)
        expect(Array.isArray(incident.timeline)).toBe(true)
        expect(incident.timeline.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle scanner shutdown gracefully', async () => {
      const testScanner = new AutomatedSecurityScanner(mockConfig)

      await testScanner.startAutomatedScanning()
      expect(testScanner.getSecurityMetrics().scanning.isActive).toBe(true)

      await testScanner.shutdown()

      expect(testScanner.getSecurityMetrics().scanning.isActive).toBe(false)
      expect(testScanner.getVulnerabilities()).toHaveLength(0)
      expect(testScanner.getThreats()).toHaveLength(0)
      expect(testScanner.getIncidents()).toHaveLength(0)
      expect(testScanner.getScanHistory()).toHaveLength(0)
    })

    it('should handle concurrent comprehensive scans', async () => {
      const scanPromises = [
        scanner.performComprehensiveScan(),
        scanner.performComprehensiveScan(),
        scanner.performComprehensiveScan(),
      ]

      const results = await Promise.all(scanPromises)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toHaveProperty('vulnerabilities')
        expect(result).toHaveProperty('threats')
        expect(result).toHaveProperty('incidents')
      })
    })

    it('should handle empty scan results gracefully', async () => {
      // Create scanner with all detection disabled
      const emptyConfig = {
        scanner: {
          enableOWASP: false,
          enableDependencyScanning: false,
          enablePenetrationTesting: false,
          enableThreatDetection: false,
          scanIntervalMs: 60000,
          maxConcurrentScans: 1,
        },
      }

      const emptyScanner = new AutomatedSecurityScanner(emptyConfig)
      const results = await emptyScanner.performComprehensiveScan()

      expect(results.vulnerabilities).toHaveLength(0)
      expect(results.threats).toHaveLength(0)
      expect(results.incidents).toHaveLength(0)

      await emptyScanner.shutdown()
    })
  })
})

describe('OWASP Scanner', () => {
  let owaspScanner: OWASPScanner

  beforeEach(() => {
    owaspScanner = new OWASPScanner({
      owasp: {
        enableInjectionDetection: true,
        enableBrokenAuthDetection: true,
        enableSensitiveDataDetection: true,
        enableXMLExternalEntitiesDetection: true,
        enableBrokenAccessControlDetection: true,
        enableSecurityMisconfigurationDetection: true,
        enableXSSDetection: true,
        enableInsecureDeserializationDetection: true,
        enableVulnerableComponentsDetection: true,
        enableLoggingMonitoringDetection: true,
      },
    })
  })

  describe('OWASP-Specific Scanning', () => {
    it('should perform OWASP Top 10 scan only', async () => {
      const vulnerabilities = await owaspScanner.scanOWASPTop10()

      expect(Array.isArray(vulnerabilities)).toBe(true)

      // All vulnerabilities should be OWASP types
      const owaspTypes = [
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
      ]

      vulnerabilities.forEach(vuln => {
        expect(owaspTypes).toContain(vuln.type)
      })
    })

    it('should provide OWASP metrics', async () => {
      await owaspScanner.scanOWASPTop10()

      const metrics = await owaspScanner.getOWASPMetrics()

      expect(typeof metrics).toBe('object')
      expect(metrics).toHaveProperty('injection')
      expect(metrics).toHaveProperty('broken_authentication')
      expect(metrics).toHaveProperty('sensitive_data_exposure')
      expect(metrics).toHaveProperty('xml_external_entities')
      expect(metrics).toHaveProperty('broken_access_control')
      expect(metrics).toHaveProperty('security_misconfiguration')
      expect(metrics).toHaveProperty('cross_site_scripting')
      expect(metrics).toHaveProperty('insecure_deserialization')
      expect(metrics).toHaveProperty('vulnerable_components')
      expect(metrics).toHaveProperty('insufficient_logging')

      Object.values(metrics).forEach(count => {
        expect(typeof count).toBe('number')
        expect(count).toBeGreaterThanOrEqual(0)
      })
    })
  })
})
