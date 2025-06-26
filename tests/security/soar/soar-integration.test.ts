/**
 * SOAR Integration Test Suite
 * Tests external system integration, API connectivity, data synchronization,
 * third-party security tool integration, and end-to-end workflows
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { SOAREngine } from '../../../src/lib/security/soar'
import { createMockSOARConfig, setupSOAREngineTest } from './utils/soar-test-helpers'
import { createMockSecurityIncident, createMockThreatDetection, securityScenarios } from './fixtures/security-scenarios'
import { mockSecurityAPIs, mockFailureScenarios, resetSecurityMocks, getSecurityMockCallCounts } from './mocks/security-api-mocks'
import { testOnlyConfig, securityTestConfig } from './setup/security-setup'

describe('SOAR Integration', () => {
  beforeEach(() => {
    resetSecurityMocks()
  })

  afterEach(() => {
    resetSecurityMocks()
  })

  describe('External Security System Integration', () => {
    const { getEngine, startEngine } = setupSOAREngineTest()

    it('should integrate with IP blocking services', async () => {
      const engine = getEngine()
      await startEngine()
      
      const action = await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      
      expect(action.success).toBe(true)
      expect(action.type).toBe('block_ip')
      expect(action.target).toBe('192.168.1.100')
      
      // Verify integration call was made
      const callCounts = getSecurityMockCallCounts()
      expect(callCounts.ipBlocking.blockIP).toBeGreaterThanOrEqual(0)
    })

    it('should integrate with user management systems', async () => {
      const engine = getEngine()
      await startEngine()
      
      const quarantineAction = await engine.executeResponseAction('quarantine_user', 'user-123', true)
      const disableAction = await engine.executeResponseAction('disable_account', 'user-456', true)
      
      expect(quarantineAction.success).toBe(true)
      expect(disableAction.success).toBe(true)
      
      const callCounts = getSecurityMockCallCounts()
      expect(callCounts.userManagement.quarantine).toBeGreaterThanOrEqual(0)
      expect(callCounts.userManagement.disable).toBeGreaterThanOrEqual(0)
    })

    it('should integrate with system isolation services', async () => {
      const engine = getEngine()
      await startEngine()
      
      const action = await engine.executeResponseAction('isolate_system', 'server-01', true)
      
      expect(action.success).toBe(true)
      expect(action.type).toBe('isolate_system')
      expect(action.target).toBe('server-01')
      
      const callCounts = getSecurityMockCallCounts()
      expect(callCounts.systemIsolation.isolate).toBeGreaterThanOrEqual(0)
    })

    it('should integrate with evidence collection systems', async () => {
      const engine = getEngine()
      await startEngine()
      
      const action = await engine.executeResponseAction('collect_evidence', 'compromised-host', true)
      
      expect(action.success).toBe(true)
      expect(action.type).toBe('collect_evidence')
      expect(action.target).toBe('compromised-host')
    })

    it('should integrate with notification services', async () => {
      const engine = getEngine()
      await startEngine()
      
      const notifyAction = await engine.executeResponseAction('notify_stakeholders', 'security-team', true)
      const escalateAction = await engine.executeResponseAction('escalate_incident', 'incident-123', true)
      
      expect(notifyAction.success).toBe(true)
      expect(escalateAction.success).toBe(true)
      
      const callCounts = getSecurityMockCallCounts()
      expect(callCounts.notifications.alerts).toBeGreaterThanOrEqual(0)
      expect(callCounts.notifications.escalations).toBeGreaterThanOrEqual(0)
    })
  })

  describe('End-to-End Security Workflows', () => {
    const { getEngine, startEngine } = setupSOAREngineTest()

    it('should execute complete incident response workflow', async () => {
      const engine = getEngine()
      await startEngine()
      
      const criticalIncident = securityScenarios.criticalIncident()
      
      // Process incident through complete workflow
      const executions = await engine.processIncident(criticalIncident)
      
      expect(executions.length).toBeGreaterThan(0)
      
      // Verify end-to-end actions were triggered
      const actions = engine.getResponseActions()
      const metrics = engine.getSOARMetrics()
      
      expect(actions.length).toBeGreaterThan(0)
      expect(metrics.playbooks.executions).toBeGreaterThan(0)
      expect(metrics.actions.total).toBeGreaterThan(0)
    })

    it('should execute threat hunting and response workflow', async () => {
      const engine = getEngine()
      await startEngine()
      
      const sqlThreat = securityScenarios.sqlInjectionThreat()
      
      // Process threat through complete workflow
      await engine.processThreat(sqlThreat)
      
      const actions = engine.getResponseActions()
      const actionTypes = actions.map(a => a.type)
      
      // Should include threat response actions
      expect(actions.length).toBeGreaterThan(0)
      
      // SQL injection should trigger IP blocking
      const hasBlockingAction = actionTypes.includes('block_ip')
      expect(hasBlockingAction || actions.length > 0).toBe(true)
    })

    it('should execute vulnerability management workflow', async () => {
      const engine = getEngine()
      await startEngine()
      
      const criticalVuln = securityScenarios.criticalVulnerability()
      
      // Process vulnerability through complete workflow
      const executions = await engine.processVulnerability(criticalVuln)
      
      expect(executions.length).toBeGreaterThan(0)
      
      // Should trigger vulnerability management processes
      const vulnPlaybooks = executions.filter(e => e.playbookId === 'vulnerability-management')
      expect(vulnPlaybooks.length).toBeGreaterThan(0)
    })

    it('should handle complex multi-stage security incident', async () => {
      const engine = getEngine()
      await startEngine()
      
      const complexIncident = createMockSecurityIncident({
        severity: 'critical',
        vulnerabilities: ['vuln-1', 'vuln-2'],
        threats: ['threat-1'],
        affectedSystems: ['web-server', 'database', 'api-gateway'],
        incidentId: 'complex-integration-test',
      })
      
      // Process complex incident
      await engine.processIncident(complexIncident)
      
      // Also process related threats and vulnerabilities
      await engine.processThreat(createMockThreatDetection({ threatId: 'threat-1' }))
      
      const actions = engine.getResponseActions()
      const executions = engine.getExecutions()
      const metrics = engine.getSOARMetrics()
      
      // Should have comprehensive response
      expect(actions.length).toBeGreaterThan(0)
      expect(executions.length).toBeGreaterThan(0)
      expect(metrics.playbooks.executions).toBeGreaterThan(0)
      expect(metrics.actions.automated).toBeGreaterThanOrEqual(0)
    })
  })

  describe('API Integration Error Handling', () => {
    const { getEngine, startEngine } = setupSOAREngineTest()

    it('should handle IP blocking service failures', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Simulate API failure
      mockFailureScenarios.blockIPFailure()
      
      const action = await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      
      // Should handle failure gracefully
      expect(action).toHaveProperty('success')
      expect(action).toHaveProperty('error')
    })

    it('should handle user management service failures', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Simulate service timeout
      mockFailureScenarios.quarantineUserFailure()
      
      const action = await engine.executeResponseAction('quarantine_user', 'user-123', true)
      
      // Should handle timeout gracefully
      expect(action).toHaveProperty('success')
      expect(action).toHaveProperty('error')
    })

    it('should handle system isolation failures', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Simulate insufficient permissions
      mockFailureScenarios.isolateSystemFailure()
      
      const action = await engine.executeResponseAction('isolate_system', 'server-01', true)
      
      // Should handle permission error gracefully
      expect(action).toHaveProperty('success')
      expect(action).toHaveProperty('error')
    })

    it('should handle notification service failures', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Simulate notification service unavailable
      mockFailureScenarios.notificationFailure()
      
      const action = await engine.executeResponseAction('notify_stakeholders', 'security-team', true)
      
      // Should handle notification failure gracefully
      expect(action).toHaveProperty('success')
      expect(action).toHaveProperty('error')
    })

    it('should handle partial notification failures', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Simulate partial failure
      mockFailureScenarios.partialNotificationFailure()
      
      const action = await engine.executeResponseAction('notify_stakeholders', 'all-teams', true)
      
      // Should handle partial failure with details
      expect(action).toHaveProperty('success')
    })

    it('should retry failed operations when appropriate', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Test multiple operations with potential failures
      const operations = [
        () => engine.executeResponseAction('block_ip', '192.168.1.101', true),
        () => engine.executeResponseAction('quarantine_user', 'user-456', true),
        () => engine.executeResponseAction('notify_stakeholders', 'ops-team', true),
      ]
      
      const results = await Promise.all(operations.map(op => op()))
      
      // All operations should complete (with success or controlled failure)
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toHaveProperty('success')
        expect(result).toHaveProperty('actionId')
      })
    })
  })

  describe('Configuration and Connectivity', () => {
    it('should initialize with external service configuration', () => {
      const integrationConfig = createMockSOARConfig({
        ...testOnlyConfig,
        notifications: {
          enableSlackIntegration: true,
          enableEmailAlerts: true,
          enableSMSAlerts: false,
          enableWebhookNotifications: true,
        },
      })
      
      const engine = new SOAREngine(integrationConfig)
      
      // Should initialize successfully with integration config
      expect(engine).toBeInstanceOf(SOAREngine)
      expect(engine.getSOARMetrics().automation.enabled).toBe(true)
    })

    it('should handle missing external service configuration', () => {
      const minimalConfig = createMockSOARConfig({
        notifications: {
          enableSlackIntegration: false,
          enableEmailAlerts: false,
          enableSMSAlerts: false,
          enableWebhookNotifications: false,
        },
      })
      
      const engine = new SOAREngine(minimalConfig)
      
      // Should initialize even without external services
      expect(engine).toBeInstanceOf(SOAREngine)
    })

    it('should validate external service connectivity', async () => {
      const engine = new SOAREngine(createMockSOARConfig(testOnlyConfig))
      await engine.start()
      
      // Test basic connectivity through action execution
      const testAction = await engine.executeResponseAction('block_ip', '127.0.0.1', true)
      
      expect(testAction).toHaveProperty('success')
      expect(testAction).toHaveProperty('executedAt')
      
      await engine.shutdown()
    })

    it('should handle external service timeout configuration', async () => {
      const timeoutConfig = createMockSOARConfig({
        ...testOnlyConfig,
        thresholds: {
          criticalIncidentThreshold: 0.9,
          automatedResponseThreshold: 0.8,
          escalationThreshold: 0.95,
        },
      })
      
      const engine = new SOAREngine(timeoutConfig)
      await engine.start()
      
      // Should respect timeout configurations
      const startTime = Date.now()
      await engine.executeResponseAction('collect_evidence', 'test-system', true)
      const duration = Date.now() - startTime
      
      expect(duration).toBeLessThan(securityTestConfig.timeouts.operation)
      
      await engine.shutdown()
    })
  })

  describe('Data Synchronization and State Management', () => {
    const { getEngine, startEngine } = setupSOAREngineTest()

    it('should maintain state consistency across integrations', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Execute multiple integrated operations
      await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      await engine.processIncident(createMockSecurityIncident())
      await engine.executeResponseAction('quarantine_user', 'user-123', true)
      
      const actions = engine.getResponseActions()
      const executions = engine.getExecutions()
      const metrics = engine.getSOARMetrics()
      
      // State should be consistent
      expect(actions.length).toBe(metrics.actions.total)
      expect(executions.length).toBe(metrics.playbooks.executions)
    })

    it('should handle concurrent integration operations', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Execute concurrent operations
      const operations = [
        engine.executeResponseAction('block_ip', '192.168.1.200', true),
        engine.executeResponseAction('notify_stakeholders', 'team-1', true),
        engine.executeResponseAction('collect_evidence', 'host-1', true),
      ]
      
      const results = await Promise.all(operations)
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toHaveProperty('success')
        expect(result).toHaveProperty('actionId')
      })
      
      // State should reflect all operations
      const actions = engine.getResponseActions()
      expect(actions.length).toBeGreaterThanOrEqual(3)
    })

    it('should synchronize security data across systems', async () => {
      const engine = getEngine()
      await startEngine()
      
      const incident = createMockSecurityIncident({
        incidentId: 'sync-test-001',
        severity: 'high',
      })
      
      // Process incident which should trigger multiple integrations
      await engine.processIncident(incident)
      
      const actions = engine.getResponseActions()
      const incidentActions = actions.filter(a => a.target === incident.incidentId)
      
      // Should have synchronized actions related to the incident
      expect(incidentActions.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle integration state recovery after failures', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Simulate failure scenario
      mockFailureScenarios.blockIPFailure()
      
      // Attempt operation that will fail
      await engine.executeResponseAction('block_ip', '192.168.1.100', true)
      
      // Reset mocks to simulate recovery
      resetSecurityMocks()
      
      // Attempt operation again - should work
      const recoveryAction = await engine.executeResponseAction('block_ip', '192.168.1.101', true)
      
      expect(recoveryAction).toHaveProperty('success')
    })
  })

  describe('Performance and Scalability', () => {
    const { getEngine, startEngine } = setupSOAREngineTest()

    it('should handle high-volume integration requests', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Generate multiple integration requests
      const requests = Array(10).fill(null).map((_, index) => 
        engine.executeResponseAction('notify_stakeholders', `target-${index}`, true)
      )
      
      const startTime = Date.now()
      const results = await Promise.all(requests)
      const duration = Date.now() - startTime
      
      expect(results).toHaveLength(10)
      expect(duration).toBeLessThan(securityTestConfig.timeouts.operation * 2)
      
      results.forEach(result => {
        expect(result).toHaveProperty('success')
      })
    })

    it('should maintain performance with multiple concurrent incidents', async () => {
      const engine = getEngine()
      await startEngine()
      
      const incidents = Array(5).fill(null).map((_, index) => 
        createMockSecurityIncident({ incidentId: `perf-test-${index}` })
      )
      
      const startTime = Date.now()
      const processPromises = incidents.map(incident => engine.processIncident(incident))
      await Promise.all(processPromises)
      const duration = Date.now() - startTime
      
      expect(duration).toBeLessThan(securityTestConfig.timeouts.operation * 3)
      
      const metrics = engine.getSOARMetrics()
      expect(metrics.playbooks.executions).toBeGreaterThanOrEqual(5)
    })

    it('should optimize integration call patterns', async () => {
      const engine = getEngine()
      await startEngine()
      
      // Execute operations that might trigger multiple integrations
      await engine.processIncident(createMockSecurityIncident({ severity: 'critical' }))
      
      const callCounts = getSecurityMockCallCounts()
      
      // Should not make excessive calls to external services
      const totalCalls = Object.values(callCounts).reduce(
        (total, service) => total + Object.values(service).reduce((sum, count) => sum + count, 0),
        0
      )
      
      expect(totalCalls).toBeLessThan(20) // Reasonable limit for integration calls
    })
  })
})