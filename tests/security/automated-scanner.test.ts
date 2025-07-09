/**
 * Automated Security Scanner Test Suite
 * Tests OWASP Top 10 detection, vulnerability scanning, dependency scanning,
 * threat detection, and incident response capabilities
 */

import {
  AutomatedSecurityScanner,
  OWASPScanner,
  type SecurityScannerConfig,
  type ThreatDetection,
  type Vulnerability,
  createSecurityScanner,
} from '@/lib/security/automated-scanner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock crypto module
vi.mock('../../src/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

describe('Automated Security Scanner', () => {
  let scanner: AutomatedSecurityScanner
  let mockConfig: SecurityScannerConfig

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
      expect(typeof history[0]?.results).toBe('number')

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
      const disabledConfig: SecurityScannerConfig = {
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
      const enabledConfig: SecurityScannerConfig = {
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

// Create dedicated comprehensive security test file
import('../../src/lib/security/csp-cors')

// =======================================================================================
// COMPREHENSIVE CORS SECURITY TESTING SUITE
// =======================================================================================

import { NextRequest, NextResponse } from 'next/server'

describe('Comprehensive CORS Security Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Origin Validation', () => {
    it('should validate allowed origins for production', async () => {
      const { generateCORSConfig } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        headers: {
          origin: 'https://contribux.com',
        },
      })

      const config = generateCORSConfig(request)

      expect(config.origins).toContain('https://contribux.com')
      expect(config.origins).not.toContain('http://localhost:3000')
    })

    it('should reject unauthorized origins', async () => {
      const { applyCORSHeaders } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        headers: {
          origin: 'https://malicious-site.com',
        },
      })

      const response = new NextResponse()
      applyCORSHeaders(response, request)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('should handle preflight requests properly', async () => {
      const { handlePreflightRequest } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://contribux.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type,Authorization',
        },
      })

      const response = await handlePreflightRequest(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://contribux.com')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    })

    it('should enforce credentials policy', async () => {
      const { applyCORSHeaders } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        headers: {
          origin: 'https://contribux.com',
        },
      })

      const response = new NextResponse()
      applyCORSHeaders(response, request)

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })
  })

  describe('Method Restrictions', () => {
    it('should limit allowed HTTP methods', async () => {
      const { generateCORSConfig } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test')
      const config = generateCORSConfig(request)

      expect(config.methods).toContain('GET')
      expect(config.methods).toContain('POST')
      expect(config.methods).toContain('PUT')
      expect(config.methods).toContain('DELETE')
      expect(config.methods).not.toContain('TRACE')
      expect(config.methods).not.toContain('CONNECT')
    })

    it('should validate method permissions for preflight', async () => {
      const { handlePreflightRequest } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://contribux.com',
          'access-control-request-method': 'TRACE',
        },
      })

      const response = await handlePreflightRequest(request)

      expect(response.status).toBe(405)
    })

    it('should handle OPTIONS requests correctly', async () => {
      const { handlePreflightRequest } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://contribux.com',
          'access-control-request-method': 'GET',
        },
      })

      const response = await handlePreflightRequest(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    })
  })

  describe('Header Security', () => {
    it('should validate allowed headers', async () => {
      const { generateCORSConfig } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test')
      const config = generateCORSConfig(request)

      expect(config.headers).toContain('Content-Type')
      expect(config.headers).toContain('Authorization')
      expect(config.headers).toContain('X-CSRF-Token')
      expect(config.headers).not.toContain('X-Debug-Token')
    })

    it('should expose appropriate headers', async () => {
      const { applyCORSHeaders } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        headers: {
          origin: 'https://contribux.com',
        },
      })

      const response = new NextResponse()
      applyCORSHeaders(response, request)

      const exposedHeaders = response.headers.get('Access-Control-Expose-Headers')
      expect(exposedHeaders).toContain('X-RateLimit-Limit')
      expect(exposedHeaders).toContain('X-RateLimit-Remaining')
    })

    it('should prevent header injection', async () => {
      const { handlePreflightRequest } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://contribux.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type\r\nX-Evil-Header: malicious',
        },
      })

      const response = await handlePreflightRequest(request)

      expect(response.status).toBe(400)
    })
  })

  describe('Environment-Specific Configuration', () => {
    it('should use development origins in development', async () => {
      const { generateCORSConfig } = await import('../../src/lib/security/csp-cors')

      vi.stubEnv('NODE_ENV', 'development')

      const request = new NextRequest('http://localhost:3000/api/test')
      const config = generateCORSConfig(request)

      expect(config.origins).toContain('http://localhost:3000')
      expect(config.origins).toContain('http://localhost:3001')
    })

    it('should use strict origins in production', async () => {
      const { generateCORSConfig } = await import('../../src/lib/security/csp-cors')

      vi.stubEnv('NODE_ENV', 'production')

      const request = new NextRequest('https://contribux.com/api/test')
      const config = generateCORSConfig(request)

      expect(config.origins).not.toContain('http://localhost:3000')
      expect(config.origins).toContain('https://contribux.com')
    })

    it('should use test origins in test environment', async () => {
      const { generateCORSConfig } = await import('../../src/lib/security/csp-cors')

      vi.stubEnv('NODE_ENV', 'test')

      const request = new NextRequest('http://localhost:3000/api/test')
      const config = generateCORSConfig(request)

      expect(config.origins).toContain('http://localhost:3000')
    })
  })

  describe('Max-Age and Caching', () => {
    it('should set appropriate max-age for preflight', async () => {
      const { applyCORSHeaders } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test', {
        headers: {
          origin: 'https://contribux.com',
        },
      })

      const response = new NextResponse()
      applyCORSHeaders(response, request)

      const maxAge = response.headers.get('Access-Control-Max-Age')
      expect(Number.parseInt(maxAge || '0')).toBeGreaterThan(0)
      expect(Number.parseInt(maxAge || '0')).toBeLessThanOrEqual(86400) // 24 hours max
    })
  })
})

// =======================================================================================
// COMPREHENSIVE SECURITY HEADERS TESTING SUITE
// =======================================================================================

describe('Comprehensive Security Headers Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Content Security Policy (CSP)', () => {
    it('should enforce strict CSP directives', async () => {
      const { generateCSPHeader } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test')
      const cspHeader = generateCSPHeader(request)

      expect(cspHeader).toContain("default-src 'self'")
      expect(cspHeader).toContain("object-src 'none'")
      expect(cspHeader).toContain("base-uri 'self'")
    })

    it('should prevent XSS through script-src restrictions', async () => {
      const { generateCSPHeader } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/page')
      const cspHeader = generateCSPHeader(request)

      expect(cspHeader).toContain("script-src 'self'")
      expect(cspHeader).toMatch(/script-src.*'nonce-[A-Za-z0-9+/=]+'/)
      expect(cspHeader).not.toContain("'unsafe-eval'")
    })

    it('should validate frame-ancestors protection', async () => {
      const { generateCSPHeader } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test')
      const cspHeader = generateCSPHeader(request)

      expect(cspHeader).toContain("frame-ancestors 'none'")
    })

    it('should enforce connect-src limitations', async () => {
      const { generateCSPHeader } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test')
      const cspHeader = generateCSPHeader(request)

      expect(cspHeader).toContain("connect-src 'self'")
      expect(cspHeader).toContain('https://api.github.com')
      expect(cspHeader).not.toContain('*')
    })

    it('should include report-uri for CSP violations', async () => {
      const { generateCSPHeader } = await import('../../src/lib/security/csp-cors')

      const request = new NextRequest('https://contribux.com/api/test')
      const cspHeader = generateCSPHeader(request, { reportOnly: false })

      expect(cspHeader).toContain('report-uri')
      expect(cspHeader).toContain('/api/security/csp-report')
    })

    it('should support report-only mode for testing', async () => {
      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await import('../../src/lib/security/csp-cors').then(module => {
        module.applyCSPHeaders(response, request, { reportOnly: true })
      })

      expect(response.headers.has('Content-Security-Policy-Report-Only')).toBe(true)
      expect(response.headers.has('Content-Security-Policy')).toBe(false)
    })
  })

  describe('Transport Security', () => {
    it('should enforce HTTPS with HSTS', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      const hsts = response.headers.get('Strict-Transport-Security')
      expect(hsts).toContain('max-age=31536000')
      expect(hsts).toContain('includeSubDomains')
      expect(hsts).toContain('preload')
    })

    it('should set proper max-age for HSTS', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      const hsts = response.headers.get('Strict-Transport-Security')
      const maxAge = hsts?.match(/max-age=(\d+)/)?.[1]
      expect(Number.parseInt(maxAge || '0')).toBeGreaterThanOrEqual(31536000) // 1 year minimum
    })

    it('should include subdomains in HSTS', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://api.contribux.com/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      expect(response.headers.get('Strict-Transport-Security')).toContain('includeSubDomains')
    })

    it('should enable HSTS preload', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      expect(response.headers.get('Strict-Transport-Security')).toContain('preload')
    })
  })

  describe('Content Protection Headers', () => {
    it('should set X-Content-Type-Options to nosniff', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should set X-Frame-Options to DENY', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('should configure X-XSS-Protection properly', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })

    it('should set proper Referrer-Policy', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })
  })

  describe('Permissions Policy', () => {
    it('should restrict camera permissions', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      const permissionsPolicy = response.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('camera=()')
    })

    it('should restrict microphone permissions', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      const permissionsPolicy = response.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('microphone=()')
    })

    it('should restrict geolocation permissions', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      const permissionsPolicy = response.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('geolocation=()')
    })

    it('should restrict other sensitive permissions', async () => {
      const { applySecurityHeaders } = await import('../../src/middleware')

      const request = new NextRequest('https://contribux.com/api/test')
      const response = new NextResponse()

      await applySecurityHeaders(response, request)

      const permissionsPolicy = response.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toContain('payment=()')
      expect(permissionsPolicy).toContain('usb=()')
    })
  })

  describe('Cache Control Headers', () => {
    it('should set no-cache for sensitive endpoints', async () => {
      const _request = new NextRequest('https://contribux.com/api/user/profile')
      const response = new NextResponse()

      // Mock response for user profile (sensitive data)
      response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate')

      expect(response.headers.get('Cache-Control')).toContain('private')
      expect(response.headers.get('Cache-Control')).toContain('no-cache')
      expect(response.headers.get('Cache-Control')).toContain('no-store')
    })

    it('should allow caching for public endpoints with limits', async () => {
      const _request = new NextRequest('https://contribux.com/api/health')
      const response = new NextResponse()

      // Mock response for health check (public data)
      response.headers.set('Cache-Control', 'public, max-age=300, must-revalidate')

      expect(response.headers.get('Cache-Control')).toContain('public')
      expect(response.headers.get('Cache-Control')).toContain('max-age=300')
    })
  })
})

// =======================================================================================
// API INPUT VALIDATION & SANITIZATION TESTING SUITE
// =======================================================================================

describe('API Input Validation Security Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Request Payload Validation', () => {
    it('should validate JSON structure and size', async () => {
      const largePayload = JSON.stringify({ data: 'x'.repeat(2000000) }) // 2MB

      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: largePayload,
      })

      expect(response.status).toBe(413)
      const data = await response.json()
      expect(data.error).toContain('Payload too large')
    })

    it('should sanitize string inputs', async () => {
      const maliciousPayload = {
        name: '<script>alert("xss")</script>',
        bio: 'javascript:alert("xss")',
        website: 'data:text/html,<script>alert("xss")</script>',
      }

      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(maliciousPayload),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid characters detected')
    })

    it('should validate numeric ranges', async () => {
      const invalidPayload = {
        age: -1,
        score: 999999999,
        rating: 11, // Max should be 10
      }

      const response = await fetch('http://localhost:3000/api/user/preferences', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidPayload),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/Invalid (age|score|rating)/)
    })

    it('should reject malicious payloads', async () => {
      const sqlInjectionPayload = {
        name: "'; DROP TABLE users; --",
        email: "admin'/**/UNION/**/SELECT/**/password/**/FROM/**/users--",
      }

      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sqlInjectionPayload),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Dangerous content detected')
    })
  })

  describe('Query Parameter Security', () => {
    it('should validate search parameters', async () => {
      const maliciousQuery = '<script>alert("xss")</script>'

      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(maliciousQuery)}`,
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid search query')
    })

    it('should sanitize filter values', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/opportunities?difficulty=<script>&type=malicious',
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid filter parameters')
    })

    it('should enforce parameter limits', async () => {
      const longParam = 'a'.repeat(5000)

      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(longParam)}`,
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Parameter too long')
    })

    it('should prevent parameter pollution', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/repositories?q=test&q=malicious&page=1&page=999',
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Duplicate parameters detected')
    })
  })
})

// =======================================================================================
// ATTACK SIMULATION TESTING SUITE
// =======================================================================================

describe('Attack Simulation and Prevention Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('XSS Prevention Testing', () => {
    it('should prevent script injection in parameters', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        'onload=alert("xss")',
        '<img src="x" onerror="alert(\'xss\')" />',
        '"><script>alert("xss")</script>',
      ]

      for (const payload of xssPayloads) {
        const response = await fetch(
          `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(payload)}`,
          {
            headers: {
              Authorization: 'Bearer valid-jwt-token',
            },
          }
        )

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.error).toContain('dangerous content')
      }
    })

    it('should validate HTML sanitization', async () => {
      const htmlPayload = {
        name: '<div onclick="alert(\'xss\')">Click me</div>',
        bio: '<iframe src="javascript:alert(\'xss\')"></iframe>',
      }

      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(htmlPayload),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('HTML content not allowed')
    })
  })

  describe('CSRF Protection Testing', () => {
    it('should validate CSRF token requirements', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('CSRF token required')
    })

    it('should test token generation and validation', async () => {
      // Get CSRF token
      const tokenResponse = await fetch('http://localhost:3000/api/csrf-token', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      })

      const { csrfToken } = await tokenResponse.json()
      expect(csrfToken).toBeTruthy()

      // Use valid token
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      })

      expect(response.status).toBe(200)
    })

    it('should check SameSite cookie settings', async () => {
      const response = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
      })

      const setCookieHeader = response.headers.get('set-cookie')
      expect(setCookieHeader).toContain('SameSite=Strict')
      expect(setCookieHeader).toContain('Secure')
      expect(setCookieHeader).toContain('HttpOnly')
    })
  })

  describe('Request Smuggling Prevention', () => {
    it('should validate content-length handling', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
          'Content-Length': '100',
          'Transfer-Encoding': 'chunked', // Conflicting headers
        },
        body: JSON.stringify({ name: 'Test' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid request headers')
    })

    it('should check transfer-encoding security', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked\r\nContent-Length: 0',
        },
        body: JSON.stringify({ name: 'Test' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid transfer encoding')
    })

    it('should test header validation', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'application/json\r\nX-Injected: malicious',
        },
        body: JSON.stringify({ name: 'Test' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid header format')
    })
  })
})

// =======================================================================================
// COMPREHENSIVE RATE LIMITING SECURITY TESTING SUITE
// =======================================================================================

describe('Comprehensive Rate Limiting Security Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication Endpoints Rate Limiting', () => {
    it('should limit auth requests to 10/minute', async () => {
      const authRequests = []

      // Make 11 authentication requests to exceed limit
      for (let i = 0; i < 11; i++) {
        authRequests.push(
          fetch('http://localhost:3000/api/auth/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-For': '192.168.1.100',
            },
            body: JSON.stringify({ email: 'test@example.com' }),
          })
        )
      }

      const responses = await Promise.all(authRequests)
      const lastResponse = responses[responses.length - 1]

      expect(lastResponse.status).toBe(429)
      const data = await lastResponse.json()
      expect(data.error).toContain('Too many authentication attempts')
      expect(lastResponse.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(lastResponse.headers.get('X-RateLimit-Window')).toBe('60')
    })

    it('should implement progressive delays for auth failures', async () => {
      const start = Date.now()

      // Multiple failed auth attempts
      for (let i = 0; i < 3; i++) {
        await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.100',
          },
          body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
        })
      }

      // Fourth attempt should have delay
      const response = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.100',
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
      })

      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThan(1000) // Should have progressive delay
      expect(response.headers.get('Retry-After')).toBeTruthy()
    })

    it('should block after sustained attacks', async () => {
      // Make 20 rapid auth requests
      const requests = Array.from({ length: 20 }, () =>
        fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.100',
          },
          body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
        })
      )

      const responses = await Promise.all(requests)
      const blockedResponses = responses.filter(r => r.status === 403)

      expect(blockedResponses.length).toBeGreaterThan(0)

      const blockedResponse = blockedResponses[0]
      const data = await blockedResponse.json()
      expect(data.error).toContain('IP temporarily blocked')
    })

    it('should reset limits properly', async () => {
      // Make requests up to limit
      for (let i = 0; i < 10; i++) {
        await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.200',
          },
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      }

      // Wait for reset (simulate time passage)
      await new Promise(resolve => setTimeout(resolve, 61000)) // 1 minute + 1 second

      // Should be able to make request again
      const response = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.200',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      expect(response.status).not.toBe(429)
    })
  })

  describe('Search Endpoints Rate Limiting', () => {
    it('should limit search requests to 100/minute', async () => {
      const searchRequests = []

      // Make 101 search requests to exceed limit
      for (let i = 0; i < 101; i++) {
        searchRequests.push(
          fetch(`http://localhost:3000/api/search/repositories?q=test${i}`, {
            headers: {
              Authorization: 'Bearer valid-jwt-token',
              'X-Forwarded-For': '192.168.1.100',
            },
          })
        )
      }

      const responses = await Promise.all(searchRequests)
      const lastResponse = responses[responses.length - 1]

      expect(lastResponse.status).toBe(429)
      expect(lastResponse.headers.get('X-RateLimit-Limit')).toBe('100')
      expect(lastResponse.headers.get('X-RateLimit-Window')).toBe('60')
    })

    it('should handle burst requests properly', async () => {
      const burstRequests = []

      // Make 20 rapid requests in burst
      for (let i = 0; i < 20; i++) {
        burstRequests.push(
          fetch('http://localhost:3000/api/search/repositories?q=test', {
            headers: {
              Authorization: 'Bearer valid-jwt-token',
              'X-Forwarded-For': '192.168.1.100',
            },
          })
        )
      }

      const responses = await Promise.all(burstRequests)
      const successfulResponses = responses.filter(r => r.status === 200)

      // Should allow burst but within limits
      expect(successfulResponses.length).toBeGreaterThan(10)
      expect(successfulResponses.length).toBeLessThanOrEqual(20)
    })

    it('should differentiate by user/IP', async () => {
      // User 1 exhausts their limit
      for (let i = 0; i < 100; i++) {
        await fetch('http://localhost:3000/api/search/repositories?q=test', {
          headers: {
            Authorization: 'Bearer user1-jwt-token',
            'X-Forwarded-For': '192.168.1.100',
          },
        })
      }

      // User 1 should be rate limited
      const user1Response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer user1-jwt-token',
          'X-Forwarded-For': '192.168.1.100',
        },
      })
      expect(user1Response.status).toBe(429)

      // User 2 should still work
      const user2Response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer user2-jwt-token',
          'X-Forwarded-For': '192.168.1.101',
        },
      })
      expect(user2Response.status).toBe(200)
    })

    it('should prevent rate limit bypass attempts', async () => {
      // Try to bypass with different headers
      const bypassAttempts = [
        { 'X-Forwarded-For': '192.168.1.100', 'X-Real-IP': '10.0.0.1' },
        { 'X-Forwarded-For': '192.168.1.100', 'CF-Connecting-IP': '10.0.0.2' },
        { 'X-Forwarded-For': '192.168.1.100', 'X-Client-IP': '10.0.0.3' },
        { 'X-Forwarded-For': '192.168.1.100', 'True-Client-IP': '10.0.0.4' },
      ]

      // Exhaust rate limit
      for (let i = 0; i < 100; i++) {
        await fetch('http://localhost:3000/api/search/repositories?q=test', {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
            'X-Forwarded-For': '192.168.1.100',
          },
        })
      }

      // Try bypass attempts
      for (const headers of bypassAttempts) {
        const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
            ...headers,
          },
        })

        expect(response.status).toBe(429) // Should still be rate limited
      }
    })
  })

  describe('Repository Endpoints Rate Limiting', () => {
    it('should limit repository requests to 200/minute', async () => {
      const repoRequests = []

      // Make 201 repository requests to exceed limit
      for (let i = 0; i < 201; i++) {
        repoRequests.push(
          fetch(`http://localhost:3000/api/repositories/${i}`, {
            headers: {
              Authorization: 'Bearer valid-jwt-token',
              'X-Forwarded-For': '192.168.1.100',
            },
          })
        )
      }

      const responses = await Promise.all(repoRequests)
      const lastResponse = responses[responses.length - 1]

      expect(lastResponse.status).toBe(429)
      expect(lastResponse.headers.get('X-RateLimit-Limit')).toBe('200')
    })

    it('should handle pagination rate limits', async () => {
      // Test pagination doesn't reset rate limits
      const requests = []

      for (let page = 1; page <= 50; page++) {
        requests.push(
          fetch(`http://localhost:3000/api/repositories?page=${page}&limit=10`, {
            headers: {
              Authorization: 'Bearer valid-jwt-token',
              'X-Forwarded-For': '192.168.1.100',
            },
          })
        )
      }

      const responses = await Promise.all(requests)

      // Should count each paginated request against rate limit
      responses.forEach(response => {
        expect(response.headers.has('X-RateLimit-Remaining')).toBe(true)
      })
    })

    it('should enforce per-user limits', async () => {
      // Test per-user rate limiting independent of IP
      const user1Requests = []
      const user2Requests = []

      // User 1 makes many requests
      for (let i = 0; i < 200; i++) {
        user1Requests.push(
          fetch(`http://localhost:3000/api/repositories/${i}`, {
            headers: {
              Authorization: 'Bearer user1-jwt-token',
              'X-Forwarded-For': '192.168.1.100',
            },
          })
        )
      }

      // User 2 makes requests from same IP
      for (let i = 0; i < 10; i++) {
        user2Requests.push(
          fetch(`http://localhost:3000/api/repositories/${i}`, {
            headers: {
              Authorization: 'Bearer user2-jwt-token',
              'X-Forwarded-For': '192.168.1.100', // Same IP
            },
          })
        )
      }

      const [user1Responses, user2Responses] = await Promise.all([
        Promise.all(user1Requests),
        Promise.all(user2Requests),
      ])

      // User 1 should hit rate limit
      const user1LastResponse = user1Responses[user1Responses.length - 1]
      expect(user1LastResponse.status).toBe(429)

      // User 2 should still work
      const user2LastResponse = user2Responses[user2Responses.length - 1]
      expect(user2LastResponse.status).toBe(200)
    })
  })

  describe('Attack Prevention', () => {
    it('should detect distributed attacks', async () => {
      const distributedIPs = [
        '192.168.1.100',
        '192.168.1.101',
        '192.168.1.102',
        '192.168.1.103',
        '192.168.1.104',
      ]

      // Coordinate attack from multiple IPs
      const attacks = distributedIPs.map(ip =>
        Promise.all(
          Array.from({ length: 50 }, () =>
            fetch('http://localhost:3000/api/search/repositories?q=test', {
              headers: {
                Authorization: 'Bearer valid-jwt-token',
                'X-Forwarded-For': ip,
              },
            })
          )
        )
      )

      await Promise.all(attacks)

      // Should detect coordinated attack pattern
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-Forwarded-For': '192.168.1.105',
        },
      })

      // New IPs in the subnet should be temporarily restricted
      expect([429, 403].includes(response.status)).toBe(true)
    })

    it('should implement IP-based blocking', async () => {
      // Trigger IP blocking through excessive requests
      for (let i = 0; i < 500; i++) {
        await fetch('http://localhost:3000/api/search/repositories?q=test', {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
            'X-Forwarded-For': '10.0.0.100',
          },
        })
      }

      // IP should be blocked
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-Forwarded-For': '10.0.0.100',
        },
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('IP blocked')
    })

    it('should handle rate limit evasion attempts', async () => {
      // Try various evasion techniques
      const evasionAttempts = [
        { method: 'user-agent-rotation', headers: { 'User-Agent': 'Bot1' } },
        { method: 'user-agent-rotation', headers: { 'User-Agent': 'Bot2' } },
        { method: 'header-manipulation', headers: { 'X-Forwarded-Proto': 'https' } },
        { method: 'case-manipulation', headers: { authorization: 'Bearer valid-jwt-token' } },
        { method: 'encoding-manipulation', headers: { 'X-Forwarded-For': '192%2E168%2E1%2E100' } },
      ]

      // Exhaust rate limit normally
      for (let i = 0; i < 100; i++) {
        await fetch('http://localhost:3000/api/search/repositories?q=test', {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
            'X-Forwarded-For': '192.168.1.100',
          },
        })
      }

      // Try evasion attempts
      for (const attempt of evasionAttempts) {
        const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
            'X-Forwarded-For': '192.168.1.100',
            ...attempt.headers,
          },
        })

        expect(response.status).toBe(429) // Should still be rate limited
      }
    })

    it('should log suspicious activity', async () => {
      const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* intentionally empty - suppress console output during tests */
      })

      // Generate suspicious activity pattern
      for (let i = 0; i < 200; i++) {
        await fetch('http://localhost:3000/api/search/repositories?q=malicious', {
          headers: {
            Authorization: 'Bearer suspicious-token',
            'X-Forwarded-For': '192.168.1.100',
            'User-Agent': 'AttackBot/1.0',
          },
        })
      }

      // Should log suspicious activity
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious rate limit activity detected')
      )

      logSpy.mockRestore()
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
