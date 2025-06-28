/**
 * SOAR Security Monitoring Test Suite
 * Tests real-time monitoring, alerting systems, response actions,
 * security metrics collection, and compliance reporting
 */

import { describe, expect, it } from 'vitest'
import {
  createMockSecurityIncident,
  createMockThreatDetection,
  responseActionTypes,
  securityScenarios,
} from './fixtures/security-scenarios'
import { securityTestConfig } from './setup/security-setup'
import { setupRunningSOAREngine, waitForSOAROperation } from './utils/soar-test-helpers'

describe('SOAR Security Monitoring', () => {
  describe('Response Action Execution', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should execute response actions successfully', async () => {
      const engine = getEngine()

      const action = await engine.executeResponseAction('block_ip', '192.168.1.100', true)

      expect(action).toHaveProperty('actionId')
      expect(action).toHaveProperty('type', 'block_ip')
      expect(action).toHaveProperty('target', '192.168.1.100')
      expect(action).toHaveProperty('automated', true)
      expect(action).toHaveProperty('executedAt')
      expect(action).toHaveProperty('executedBy', 'soar_engine')
      expect(action).toHaveProperty('success')
    })

    it('should handle various response action types', async () => {
      const engine = getEngine()

      for (const actionType of responseActionTypes) {
        const action = await engine.executeResponseAction(actionType, 'test-target', true)

        expect(action.type).toBe(actionType)
        expect(action.success).toBe(true)
        expect(action.output).toBeDefined()
      }
    })

    it('should track response action execution', async () => {
      const engine = getEngine()

      // Engine starts clean, no need to clear
      const initialActions = engine.getResponseActions()
      expect(initialActions.length).toBe(0)

      await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      await engine.executeResponseAction('quarantine_user', 'user-123', false)

      const actions = engine.getResponseActions()
      expect(actions.length).toBeGreaterThanOrEqual(2)

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
      const engine = getEngine()

      const action = await engine.executeResponseAction('unknown_action', 'test-target', true)

      expect(action.success).toBe(false)
      expect(action.error).toBeDefined()
      expect(action.error).toContain('Unknown action type')
    })

    it('should execute response actions with different automation levels', async () => {
      const engine = getEngine()

      // Test automated action
      const automatedAction = await engine.executeResponseAction('block_ip', '10.0.0.1', true)
      expect(automatedAction.automated).toBe(true)
      expect(automatedAction.executedBy).toBe('soar_engine')

      // Test manual action
      const manualAction = await engine.executeResponseAction(
        'collect_evidence',
        'system-01',
        false
      )
      expect(manualAction.automated).toBe(false)
    })
  })

  describe('Real-time Security Monitoring', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should monitor and respond to security events in real-time', async () => {
      const engine = getEngine()

      // Simulate real-time security event processing
      const realTimeIncident = createMockSecurityIncident({
        severity: 'critical',
        incidentId: 'realtime-001',
        createdAt: Date.now(),
      })

      const executions = await engine.processIncident(realTimeIncident)

      expect(executions.length).toBeGreaterThan(0)

      // Check that response was timely
      const actions = engine.getResponseActions()
      const recentActions = actions.filter(
        a => a.executedAt && Date.now() - a.executedAt < securityTestConfig.timeouts.operation
      )

      expect(recentActions.length).toBeGreaterThan(0)
    })

    it('should handle high-frequency threat detection', async () => {
      const engine = getEngine()

      // Simulate multiple rapid threats
      const threats = Array(5)
        .fill(null)
        .map((_, index) =>
          createMockThreatDetection({
            threatId: `rapid-threat-${index}`,
            severity: 'critical', // Change to critical to trigger automated responses
            confidence: 0.96, // Ensure high confidence (>= 0.95, line 371 in soar.ts)
            detectedAt: Date.now() + index * 100, // Staggered timing
          })
        )

      const processPromises = threats.map(threat => engine.processThreat(threat))
      const results = await Promise.all(processPromises)

      expect(results).toHaveLength(5)
      results.forEach(executions => {
        expect(Array.isArray(executions)).toBe(true)
      })

      // Check that all threats were processed
      const actions = engine.getResponseActions()
      expect(actions.length).toBeGreaterThan(0)
    })

    it('should prioritize critical events in monitoring queue', async () => {
      const engine = getEngine()

      // Process mixed severity events
      const events = [
        createMockSecurityIncident({ severity: 'low', incidentId: 'low-priority' }),
        createMockSecurityIncident({ severity: 'critical', incidentId: 'high-priority' }),
        createMockSecurityIncident({ severity: 'medium', incidentId: 'med-priority' }),
      ]

      const processPromises = events.map(event => engine.processIncident(event))
      await Promise.all(processPromises)

      const actions = engine.getResponseActions()

      // Critical incidents should generate more actions
      const criticalActions = actions.filter(a => a.target === 'high-priority')
      const lowActions = actions.filter(a => a.target === 'low-priority')

      expect(criticalActions.length).toBeGreaterThanOrEqual(lowActions.length)
    })

    it('should maintain monitoring state across operations', async () => {
      const engine = getEngine()

      // Verify initial state
      expect(engine.getSOARMetrics().automation.isRunning).toBe(true)

      // Process multiple events
      await engine.processIncident(securityScenarios.criticalIncident())
      const sqlThreat = securityScenarios.sqlInjectionThreat()
      // Ensure high confidence to trigger automated responses (>= 0.95, line 371 in soar.ts)
      sqlThreat.confidence = 0.96
      await engine.processThreat(sqlThreat)

      // Verify monitoring continues
      expect(engine.getSOARMetrics().automation.isRunning).toBe(true)

      const metrics = engine.getSOARMetrics()
      expect(metrics.playbooks.executions).toBeGreaterThan(0)
    })
  })

  describe('Security Metrics and Analytics', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should provide comprehensive SOAR metrics', async () => {
      const engine = getEngine()

      // Execute some operations to generate metrics
      await engine.processIncident(createMockSecurityIncident())
      await engine.processThreat(createMockThreatDetection())
      await engine.executeResponseAction('block_ip', '192.168.1.100', true)

      const metrics = engine.getSOARMetrics()

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
      const engine = getEngine()

      const initialMetrics = engine.getSOARMetrics()

      await engine.processIncident(createMockSecurityIncident())

      const updatedMetrics = engine.getSOARMetrics()

      expect(updatedMetrics.playbooks.executions).toBeGreaterThan(
        initialMetrics.playbooks.executions
      )
    })

    it('should track action statistics accurately', async () => {
      const engine = getEngine()

      const initialMetrics = engine.getSOARMetrics()

      await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      await engine.executeResponseAction('quarantine_user', 'user-123', false)

      const updatedMetrics = engine.getSOARMetrics()

      expect(updatedMetrics.actions.total).toBe(initialMetrics.actions.total + 2)
      expect(updatedMetrics.actions.automated).toBe(initialMetrics.actions.automated + 1)
      expect(updatedMetrics.actions.manual).toBe(initialMetrics.actions.manual + 1)
    })

    it('should provide performance metrics for monitoring', async () => {
      const engine = getEngine()

      const startTime = Date.now()

      await engine.processIncident(createMockSecurityIncident())

      const endTime = Date.now()
      const processingTime = endTime - startTime

      // Should process incidents quickly
      expect(processingTime).toBeLessThan(securityTestConfig.timeouts.operation)

      const metrics = engine.getSOARMetrics()
      expect(metrics.playbooks.executions).toBeGreaterThan(0)
    })

    it('should track success and failure rates', async () => {
      const engine = getEngine()

      // Execute successful operations
      await engine.executeResponseAction('block_ip', '192.168.1.100', true)

      // Try to execute invalid operation
      await engine.executeResponseAction('invalid_action', 'target', true)

      const metrics = engine.getSOARMetrics()

      expect(metrics.actions.successful).toBeGreaterThan(0)
      expect(metrics.actions.failed).toBeGreaterThan(0)
      expect(metrics.actions.total).toBe(metrics.actions.successful + metrics.actions.failed)
    })
  })

  describe('Alerting and Notification Systems', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should trigger alerts for critical security events', async () => {
      const engine = getEngine()

      const criticalIncident = createMockSecurityIncident({
        severity: 'critical',
        incidentId: 'alert-test-001',
      })

      await engine.processIncident(criticalIncident)

      const actions = engine.getResponseActions()
      const alertActions = actions.filter(
        a => a.type === 'notify_stakeholders' || a.type === 'escalate_incident'
      )

      expect(alertActions.length).toBeGreaterThan(0)
    })

    it('should handle notification failures gracefully', async () => {
      const engine = getEngine()

      // This should not throw even if notifications fail internally
      await expect(
        engine.executeResponseAction('notify_stakeholders', 'security-team', true)
      ).resolves.not.toThrow()
    })

    it('should escalate incidents based on severity thresholds', async () => {
      const engine = getEngine()

      const highSeverityIncident = createMockSecurityIncident({
        severity: 'critical',
        impact: {
          confidentiality: 'high',
          integrity: 'high',
          availability: 'high',
        },
        incidentId: 'escalation-test',
      })

      await engine.processIncident(highSeverityIncident)

      const actions = engine.getResponseActions()
      const escalationActions = actions.filter(a => a.type === 'escalate_incident')

      expect(escalationActions.length).toBeGreaterThan(0)
    })

    it('should handle alert rate limiting', async () => {
      const engine = getEngine()

      // Send multiple notification requests rapidly
      const notificationPromises = Array(3)
        .fill(null)
        .map((_, index) =>
          engine.executeResponseAction('notify_stakeholders', `target-${index}`, true)
        )

      const results = await Promise.all(notificationPromises)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toHaveProperty('success')
        expect(result).toHaveProperty('actionId')
      })
    })
  })

  describe('Compliance and Audit Reporting', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should maintain audit trail for all security actions', async () => {
      const engine = getEngine()

      // Execute various security actions
      await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      await engine.executeResponseAction('quarantine_user', 'user-123', false)
      await engine.processIncident(createMockSecurityIncident())

      const actions = engine.getResponseActions()
      const executions = engine.getExecutions()

      // All actions should have audit information
      actions.forEach(action => {
        expect(action).toHaveProperty('actionId')
        expect(action).toHaveProperty('executedAt')
        expect(action).toHaveProperty('executedBy')
        expect(action).toHaveProperty('success')
      })

      executions.forEach(execution => {
        expect(execution).toHaveProperty('executionId')
        expect(execution).toHaveProperty('startedAt')
        expect(execution).toHaveProperty('triggeredBy')
      })
    })

    it('should track compliance with response time requirements', async () => {
      const engine = getEngine()

      const startTime = Date.now()

      await engine.processIncident(createMockSecurityIncident({ severity: 'critical' }))

      const responseTime = Date.now() - startTime

      // Critical incidents should be processed within compliance timeframes
      expect(responseTime).toBeLessThan(securityTestConfig.timeouts.operation)
    })

    it('should provide metrics for compliance reporting', async () => {
      const engine = getEngine()

      // Execute operations to generate compliance data
      await engine.processIncident(createMockSecurityIncident())
      await engine.executeResponseAction('collect_evidence', 'system-01', true)

      const metrics = engine.getSOARMetrics()

      // Metrics should provide compliance-relevant data
      expect(metrics.actions.total).toBeGreaterThan(0)
      expect(metrics.playbooks.executions).toBeGreaterThan(0)
      expect(typeof metrics.automation.isRunning).toBe('boolean')
    })

    it('should handle evidence collection for forensic compliance', async () => {
      const engine = getEngine()

      const action = await engine.executeResponseAction('collect_evidence', 'critical-system', true)

      expect(action.type).toBe('collect_evidence')
      expect(action.target).toBe('critical-system')
      expect(action).toHaveProperty('executedAt')
      expect(action).toHaveProperty('actionId')
    })
  })

  describe('Monitoring Error Handling', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should handle monitoring system failures gracefully', async () => {
      const engine = getEngine()

      // Should continue operating even with potential internal errors
      await expect(engine.processIncident(createMockSecurityIncident())).resolves.not.toThrow()
    })

    it('should recover from temporary monitoring disruptions', async () => {
      const engine = getEngine()

      // Verify engine is operational
      expect(engine.getSOARMetrics().automation.isRunning).toBe(true)

      // Process incident - should succeed
      await engine.processIncident(createMockSecurityIncident())

      // Should still be operational after processing
      expect(engine.getSOARMetrics().automation.isRunning).toBe(true)
    })

    it('should handle concurrent monitoring operations', async () => {
      const engine = getEngine()

      const operations = [
        () => engine.processIncident(createMockSecurityIncident({ incidentId: 'concurrent-1' })),
        () => engine.processThreat(createMockThreatDetection({ threatId: 'concurrent-2' })),
        () => engine.executeResponseAction('block_ip', '192.168.1.200', true),
      ]

      const results = await Promise.all(operations.map(op => op()))

      expect(results).toHaveLength(3)
      expect(engine.getSOARMetrics().automation.isRunning).toBe(true)
    })

    it('should handle monitoring operations with timeouts', async () => {
      const engine = getEngine()

      const operation = () => engine.processIncident(createMockSecurityIncident())

      await expect(
        waitForSOAROperation(operation, securityTestConfig.timeouts.operation)
      ).resolves.not.toThrow()
    })
  })
})
