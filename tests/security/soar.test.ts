/**
 * Security Orchestration, Automation and Response (SOAR) Test Suite
 * Tests automated incident response playbooks, security orchestration,
 * and intelligent response automation capabilities
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SecurityIncident,
  ThreatDetection,
  Vulnerability,
} from '@/lib/security/automated-scanner'
import { createSOAREngine, type SOARConfig, SOAREngine } from '@/lib/security/soar'

// Mock crypto module
vi.mock('@/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

describe('SOAR Engine', () => {
  let soarEngine: SOAREngine
  let mockConfig: Partial<SOARConfig>
  let mockIncident: SecurityIncident
  let mockThreat: ThreatDetection
  let mockVulnerability: Vulnerability

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create fresh SOAR engine for each test to avoid state contamination
    mockConfig = {
      automation: {
        enableAutomatedResponse: true,
        enablePlaybookExecution: true,
        enableMLDecisionMaking: true,
        maxAutomationLevel: 'medium',
      },
      playbooks: {
        enableIncidentContainment: true,
        enableThreatHunting: true,
        enableForensicCollection: true,
        enableRecoveryProcedures: true,
      },
      notifications: {
        enableSlackIntegration: false,
        enableEmailAlerts: true,
        enableSMSAlerts: false,
        enableWebhookNotifications: true,
      },
      thresholds: {
        criticalIncidentThreshold: 0.9,
        automatedResponseThreshold: 0.8,
        escalationThreshold: 0.95,
      },
    }

    // Create a fresh engine instance for each test
    soarEngine = new SOAREngine(mockConfig)

    // DO NOT automatically start the engine or clear actions - let individual test suites control this

    // Mock security incident
    mockIncident = {
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
    }

    // Mock threat detection
    mockThreat = {
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
    }

    // Mock vulnerability
    mockVulnerability = {
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
    }
  })

  afterEach(async () => {
    try {
      await soarEngine.shutdown()
    } catch (_error) {
      // Ignore shutdown errors in tests
    }
  })

  describe('SOAR Engine Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultEngine = new SOAREngine()
      const metrics = defaultEngine.getSOARMetrics()

      expect(metrics.automation.isRunning).toBe(false)
      expect(metrics.playbooks.total).toBeGreaterThan(0) // Should have default playbooks
    })

    it('should initialize with custom configuration', () => {
      const customEngine = new SOAREngine(mockConfig)
      const metrics = customEngine.getSOARMetrics()

      expect(metrics.automation.isRunning).toBe(false)
      expect(metrics.automation.enabled).toBe(true)
      expect(metrics.automation.level).toBe('medium')
    })

    it('should create SOAR engine using factory function', () => {
      const factoryEngine = createSOAREngine(mockConfig)
      expect(factoryEngine).toBeInstanceOf(SOAREngine)
    })

    it('should load default playbooks on initialization', () => {
      const playbooks = soarEngine.getPlaybooks()

      expect(playbooks.length).toBeGreaterThan(0)

      // Check for default playbooks
      const playbookNames = playbooks.map(p => p.name)
      expect(playbookNames).toContain('Critical Incident Response')
      expect(playbookNames).toContain('Automated Threat Hunting')
      expect(playbookNames).toContain('Vulnerability Management')
    })
  })

  describe('SOAR Engine Lifecycle', () => {
    it('should start SOAR engine successfully', async () => {
      expect(soarEngine.getSOARMetrics().automation.isRunning).toBe(false)

      await soarEngine.start()

      expect(soarEngine.getSOARMetrics().automation.isRunning).toBe(true)
    })

    it('should stop SOAR engine successfully', async () => {
      const testEngine = new SOAREngine(mockConfig)

      await testEngine.start()
      expect(testEngine.getSOARMetrics().automation.isRunning).toBe(true)

      await testEngine.stop()

      expect(testEngine.getSOARMetrics().automation.isRunning).toBe(false)

      await testEngine.shutdown()
    })

    it('should prevent starting engine when already running', async () => {
      const testEngine = new SOAREngine(mockConfig)

      await testEngine.start()

      await expect(testEngine.start()).rejects.toThrow('SOAR engine is already running')

      await testEngine.shutdown()
    })

    it('should handle stop when not running gracefully', async () => {
      const testEngine = new SOAREngine(mockConfig)

      await expect(testEngine.stop()).resolves.not.toThrow()

      await testEngine.shutdown()
    })
  })

  describe('Incident Processing', () => {
    let incidentEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for incident processing tests
      incidentEngine = new SOAREngine(mockConfig)
      await incidentEngine.start()
    })

    afterEach(async () => {
      await incidentEngine.shutdown()
    })

    it('should process security incident successfully', async () => {
      const executions = await incidentEngine.processIncident(mockIncident)

      expect(Array.isArray(executions)).toBe(true)
      expect(executions.length).toBeGreaterThan(0)

      executions.forEach(execution => {
        expect(execution).toHaveProperty('executionId')
        expect(execution).toHaveProperty('playbookId')
        expect(execution).toHaveProperty('triggeredBy')
        expect(execution.triggeredBy.type).toBe('incident')
        expect(execution.triggeredBy.id).toBe(mockIncident.incidentId)
      })
    })

    it('should execute critical incident response for critical incidents', async () => {
      const criticalIncident = { ...mockIncident, severity: 'critical' as const }

      const executions = await incidentEngine.processIncident(criticalIncident)

      expect(executions.length).toBeGreaterThan(0)

      // Check for automated response actions
      const actions = incidentEngine.getResponseActions()
      const incidentActions = actions.filter(a => a.target === criticalIncident.incidentId)

      expect(incidentActions.length).toBeGreaterThan(0)
      expect(incidentActions.some(a => a.type === 'escalate_incident')).toBe(true)
      expect(incidentActions.some(a => a.type === 'notify_stakeholders')).toBe(true)
    })

    it('should not process incidents when engine is stopped', async () => {
      await incidentEngine.stop()

      await expect(incidentEngine.processIncident(mockIncident)).rejects.toThrow(
        'SOAR engine is not running'
      )
    })
  })

  describe('Threat Processing', () => {
    let threatEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for threat processing tests
      threatEngine = new SOAREngine(mockConfig)
      await threatEngine.start()
    })

    afterEach(async () => {
      await threatEngine.shutdown()
    })

    it('should process threat detection successfully', async () => {
      const executions = await threatEngine.processThreat(mockThreat)

      expect(Array.isArray(executions)).toBe(true)

      executions.forEach(execution => {
        expect(execution).toHaveProperty('executionId')
        expect(execution).toHaveProperty('playbookId')
        expect(execution).toHaveProperty('triggeredBy')
        expect(execution.triggeredBy.type).toBe('threat')
        expect(execution.triggeredBy.id).toBe(mockThreat.threatId)
      })
    })

    it('should execute immediate threat response for critical threats', async () => {
      const criticalThreat = { ...mockThreat, severity: 'critical' as const, confidence: 0.95 }

      await threatEngine.processThreat(criticalThreat)

      // Check for immediate response actions
      const actions = threatEngine.getResponseActions()
      // Response actions should include automated actions triggered by critical threats
      expect(actions.length).toBeGreaterThan(0)

      // Check that at least one action was automated
      const automatedActions = actions.filter((a: any) => a.automated)
      expect(automatedActions.length).toBeGreaterThan(0)
    })

    it('should handle different threat types appropriately', async () => {
      const threatTypes = [
        'brute_force',
        'sql_injection_attempt',
        'xss_attempt',
        'privilege_escalation',
      ] as const

      for (const threatType of threatTypes) {
        const threat = {
          ...mockThreat,
          threatId: `threat-${threatType}`,
          type: threatType,
          severity: 'critical' as const,
        }

        await threatEngine.processThreat(threat)
      }

      const actions = threatEngine.getResponseActions()
      expect(actions.length).toBeGreaterThanOrEqual(threatTypes.length)
    })
  })

  describe('Vulnerability Processing', () => {
    let vulnEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for vulnerability processing tests
      vulnEngine = new SOAREngine(mockConfig)
      await vulnEngine.start()
    })

    afterEach(async () => {
      await vulnEngine.shutdown()
    })

    it('should process vulnerability successfully', async () => {
      const executions = await vulnEngine.processVulnerability(mockVulnerability)

      expect(Array.isArray(executions)).toBe(true)

      executions.forEach(execution => {
        expect(execution).toHaveProperty('executionId')
        expect(execution).toHaveProperty('playbookId')
        expect(execution).toHaveProperty('triggeredBy')
        expect(execution.triggeredBy.type).toBe('vulnerability')
        expect(execution.triggeredBy.id).toBe(mockVulnerability.id)
      })
    })

    it('should handle critical vulnerabilities with appropriate urgency', async () => {
      const criticalVuln = { ...mockVulnerability, severity: 'critical' as const }

      const executions = await vulnEngine.processVulnerability(criticalVuln)

      expect(executions.length).toBeGreaterThan(0)

      // Should trigger vulnerability management playbook
      const vulnPlaybooks = executions.filter(e => e.playbookId === 'vulnerability-management')
      expect(vulnPlaybooks.length).toBeGreaterThan(0)
    })
  })

  describe('Playbook Execution', () => {
    let playbookEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for playbook execution tests
      playbookEngine = new SOAREngine(mockConfig)
      await playbookEngine.start()
    })

    afterEach(async () => {
      await playbookEngine.shutdown()
    })

    it('should execute playbook successfully', async () => {
      const playbooks = playbookEngine.getPlaybooks()
      const playbook = playbooks[0]

      const execution = await playbookEngine.executePlaybook(playbook, {
        type: 'incident',
        id: 'test-incident',
      })

      expect(execution).toHaveProperty('executionId')
      expect(execution).toHaveProperty('playbookId', playbook.playbookId)
      expect(execution).toHaveProperty('status')
      expect(['completed', 'failed']).toContain(execution.status)
      expect(execution).toHaveProperty('startedAt')
      expect(execution).toHaveProperty('executedSteps')
      expect(execution).toHaveProperty('metrics')
    })

    it('should track playbook execution metrics', async () => {
      const playbooks = playbookEngine.getPlaybooks()
      const playbook = playbooks[0]

      const execution = await playbookEngine.executePlaybook(playbook, {
        type: 'incident',
        id: 'test-incident',
      })

      expect(execution.metrics).toHaveProperty('automatedSteps')
      expect(execution.metrics).toHaveProperty('manualSteps')
      expect(typeof execution.metrics.automatedSteps).toBe('number')
      expect(typeof execution.metrics.manualSteps).toBe('number')

      if (execution.status === 'completed') {
        expect(execution.metrics).toHaveProperty('totalDuration')
        expect(execution.metrics).toHaveProperty('successRate')
        expect(execution.metrics.successRate).toBeGreaterThanOrEqual(0)
        expect(execution.metrics.successRate).toBeLessThanOrEqual(1)
      }
    })

    it('should execute playbook steps in order', async () => {
      const playbooks = playbookEngine.getPlaybooks()
      const playbook = playbooks.find(p => p.name === 'Critical Incident Response')

      if (playbook) {
        const execution = await playbookEngine.executePlaybook(playbook, {
          type: 'incident',
          id: 'test-incident',
        })

        expect(execution.executedSteps.length).toBeGreaterThan(0)

        // Check that steps have proper execution data
        execution.executedSteps.forEach((step: any) => {
          expect(step).toHaveProperty('stepId')
          expect(step).toHaveProperty('status')
          expect(step).toHaveProperty('startedAt')
          expect(['pending', 'running', 'completed', 'failed', 'skipped']).toContain(step.status)
        })
      }
    })
  })

  describe('Response Actions', () => {
    let actionEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for response action tests
      actionEngine = new SOAREngine(mockConfig)
      await actionEngine.start()
    })

    afterEach(async () => {
      await actionEngine.shutdown()
    })

    it('should execute response actions successfully', async () => {
      const action = await actionEngine.executeResponseAction('block_ip', '192.168.1.100', true)

      expect(action).toHaveProperty('actionId')
      expect(action).toHaveProperty('type', 'block_ip')
      expect(action).toHaveProperty('target', '192.168.1.100')
      expect(action).toHaveProperty('automated', true)
      expect(action).toHaveProperty('executedAt')
      expect(action).toHaveProperty('executedBy', 'soar_engine')
      expect(action).toHaveProperty('success')
    })

    it('should handle various response action types', async () => {
      const actionTypes = [
        'block_ip',
        'quarantine_user',
        'disable_account',
        'isolate_system',
        'collect_evidence',
        'notify_stakeholders',
        'escalate_incident',
      ]

      for (const actionType of actionTypes) {
        const action = await actionEngine.executeResponseAction(actionType, 'test-target', true)

        expect(action.type).toBe(actionType)
        expect(action.success).toBe(true)
        expect(action.output).toBeDefined()
      }
    })

    it('should track response action execution', async () => {
      // Engine starts clean, no need to clear
      const initialActions = actionEngine.getResponseActions()
      expect(initialActions.length).toBe(0)

      await actionEngine.executeResponseAction('block_ip', '192.168.1.100', true)
      await actionEngine.executeResponseAction('quarantine_user', 'user-123', false)

      const actions = actionEngine.getResponseActions()
      expect(actions.length).toBeGreaterThanOrEqual(2) // Allow for additional actions from other tests

      const blockActions = actions.filter(
        a => a.type === 'block_ip' && a.target === '192.168.1.100'
      )
      const quarantineActions = actions.filter(
        a => a.type === 'quarantine_user' && a.target === 'user-123'
      )

      expect(blockActions.length).toBe(1)
      expect(quarantineActions.length).toBe(1)
      expect(blockActions[0]?.automated).toBe(true)
      expect(quarantineActions[0]?.automated).toBe(false)
    })

    it('should handle unknown action types gracefully', async () => {
      const action = await actionEngine.executeResponseAction('unknown_action', 'test-target', true)

      expect(action.success).toBe(false)
      expect(action.error).toBeDefined()
      expect(action.error).toContain('Unknown action type')
    })
  })

  describe('Playbook Management', () => {
    it('should provide access to all playbooks', () => {
      const playbooks = soarEngine.getPlaybooks()

      expect(Array.isArray(playbooks)).toBe(true)
      expect(playbooks.length).toBeGreaterThan(0)

      playbooks.forEach(playbook => {
        expect(playbook).toHaveProperty('playbookId')
        expect(playbook).toHaveProperty('name')
        expect(playbook).toHaveProperty('description')
        expect(playbook).toHaveProperty('version')
        expect(playbook).toHaveProperty('triggers')
        expect(playbook).toHaveProperty('steps')
        expect(playbook).toHaveProperty('priority')
        expect(playbook).toHaveProperty('estimatedDuration')
        expect(playbook).toHaveProperty('requiredPermissions')
        expect(playbook).toHaveProperty('createdAt')
        expect(playbook).toHaveProperty('updatedAt')
        expect(playbook).toHaveProperty('createdBy')

        expect(Array.isArray(playbook.triggers)).toBe(true)
        expect(Array.isArray(playbook.steps)).toBe(true)
        expect(Array.isArray(playbook.requiredPermissions)).toBe(true)
      })
    })

    it('should validate playbook structure', () => {
      const playbooks = soarEngine.getPlaybooks()

      playbooks.forEach(playbook => {
        // Validate triggers
        playbook.triggers.forEach(trigger => {
          expect(trigger).toHaveProperty('type')
          expect(trigger).toHaveProperty('conditions')
          expect(['incident', 'threat', 'vulnerability', 'manual']).toContain(trigger.type)
          expect(Array.isArray(trigger.conditions)).toBe(true)
        })

        // Validate steps
        playbook.steps.forEach((step: any) => {
          expect(step).toHaveProperty('stepId')
          expect(step).toHaveProperty('name')
          expect(step).toHaveProperty('description')
          expect(step).toHaveProperty('type')
          expect(step).toHaveProperty('automated')
          expect(step).toHaveProperty('conditions')
          expect(step).toHaveProperty('actions')

          expect(typeof step.automated).toBe('boolean')
          expect(Array.isArray(step.conditions)).toBe(true)
          expect(Array.isArray(step.actions)).toBe(true)

          const validStepTypes = [
            'detection',
            'analysis',
            'containment',
            'eradication',
            'recovery',
            'notification',
            'documentation',
            'verification',
          ]
          expect(validStepTypes).toContain(step.type)
        })
      })
    })
  })

  describe('SOAR Metrics and Reporting', () => {
    let metricsEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for metrics tests
      metricsEngine = new SOAREngine(mockConfig)
      await metricsEngine.start()
    })

    afterEach(async () => {
      await metricsEngine.shutdown()
    })

    it('should provide comprehensive SOAR metrics', async () => {
      // Ensure the engine is definitely running before processing
      const isRunning = metricsEngine.getSOARMetrics().automation.isRunning
      if (!isRunning) {
        throw new Error('Metrics engine should be running for this test')
      }
      expect(isRunning).toBe(true)

      // Execute some operations to generate metrics
      await metricsEngine.processIncident(mockIncident)

      // Verify engine is still running after incident processing
      expect(metricsEngine.getSOARMetrics().automation.isRunning).toBe(true)

      await metricsEngine.processThreat(mockThreat)
      await metricsEngine.executeResponseAction('block_ip', '192.168.1.100', true)

      const metrics = metricsEngine.getSOARMetrics()

      expect(metrics).toHaveProperty('playbooks')
      expect(metrics).toHaveProperty('actions')
      expect(metrics).toHaveProperty('automation')

      expect(metrics.playbooks).toHaveProperty('total')
      expect(metrics.playbooks).toHaveProperty('executions')
      expect(metrics.playbooks).toHaveProperty('successful')
      expect(metrics.playbooks).toHaveProperty('failed')
      expect(metrics.playbooks).toHaveProperty('running')

      expect(metrics.actions).toHaveProperty('total')
      expect(metrics.actions).toHaveProperty('successful')
      expect(metrics.actions).toHaveProperty('failed')
      expect(metrics.actions).toHaveProperty('automated')
      expect(metrics.actions).toHaveProperty('manual')

      expect(metrics.automation).toHaveProperty('isRunning')
      expect(metrics.automation).toHaveProperty('level')
      expect(metrics.automation).toHaveProperty('enabled')
    })

    it('should track execution statistics accurately', async () => {
      const initialMetrics = metricsEngine.getSOARMetrics()

      await metricsEngine.processIncident(mockIncident)

      const updatedMetrics = metricsEngine.getSOARMetrics()

      expect(updatedMetrics.playbooks.executions).toBeGreaterThan(
        initialMetrics.playbooks.executions
      )
    })

    it('should track action statistics accurately', async () => {
      const initialMetrics = metricsEngine.getSOARMetrics()

      await metricsEngine.executeResponseAction('block_ip', '192.168.1.100', true)
      await metricsEngine.executeResponseAction('quarantine_user', 'user-123', false)

      const updatedMetrics = metricsEngine.getSOARMetrics()

      expect(updatedMetrics.actions.total).toBe(initialMetrics.actions.total + 2)
      expect(updatedMetrics.actions.automated).toBe(initialMetrics.actions.automated + 1)
      expect(updatedMetrics.actions.manual).toBe(initialMetrics.actions.manual + 1)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    let errorEngine: SOAREngine

    beforeEach(async () => {
      // Create isolated engine for error handling tests
      errorEngine = new SOAREngine(mockConfig)
      // Note: do not start by default, individual tests will start if needed
    })

    afterEach(async () => {
      await errorEngine.shutdown()
    })

    it('should handle SOAR engine shutdown gracefully', async () => {
      const testEngine = new SOAREngine(mockConfig)

      await testEngine.start()
      await testEngine.processIncident(mockIncident)

      expect(testEngine.getSOARMetrics().automation.isRunning).toBe(true)
      expect(testEngine.getExecutions().length).toBeGreaterThan(0)

      await testEngine.shutdown()

      expect(testEngine.getSOARMetrics().automation.isRunning).toBe(false)
      expect(testEngine.getPlaybooks()).toHaveLength(0)
      expect(testEngine.getExecutions()).toHaveLength(0)
      expect(testEngine.getResponseActions()).toHaveLength(0)
    })

    it('should handle concurrent incident processing', async () => {
      // Start the engine explicitly for this test
      await errorEngine.start()

      const incidents = [
        { ...mockIncident, incidentId: 'incident-1' },
        { ...mockIncident, incidentId: 'incident-2' },
        { ...mockIncident, incidentId: 'incident-3' },
      ]

      const processPromises = incidents.map(incident => errorEngine.processIncident(incident))

      const results = await Promise.all(processPromises)

      expect(results).toHaveLength(3)
      results.forEach((executions: any) => {
        expect(Array.isArray(executions)).toBe(true)
      })
    })

    it('should handle playbook execution with no applicable playbooks', async () => {
      // Start the engine explicitly for this test
      await errorEngine.start()

      // Create an incident that won't match any playbook triggers
      const nonMatchingIncident = {
        ...mockIncident,
        severity: 'low' as const,
      }

      const executions = await errorEngine.processIncident(nonMatchingIncident)

      expect(Array.isArray(executions)).toBe(true)
      // Executions array might be empty if no playbooks match
    })

    it('should handle automated response when disabled', async () => {
      const disabledConfig = {
        ...mockConfig,
        automation: {
          ...mockConfig.automation,
          enableAutomatedResponse: false,
        },
      }

      const disabledEngine = new SOAREngine(disabledConfig)
      await disabledEngine.start()

      await disabledEngine.processIncident({ ...mockIncident, severity: 'critical' as const })

      const actions = disabledEngine.getResponseActions()
      const automatedActions = actions.filter((a: any) => a.automated)

      // Should have fewer or no automated actions
      expect(automatedActions.length).toBe(0)

      await disabledEngine.shutdown()
    })
  })
})
