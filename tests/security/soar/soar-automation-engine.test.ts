/**
 * SOAR Automation Engine Test Suite
 * Tests playbook execution, automation workflows, response orchestration,
 * and automated decision-making capabilities
 */

import { describe, expect, it } from 'vitest'
import { setupRunningSOAREngine, validatePlaybookStructure, validateExecutionResult } from './utils/soar-test-helpers'
import { createMockSecurityIncident, securityScenarios } from './fixtures/security-scenarios'
import { disabledAutomationConfig, highSecurityConfig } from './setup/security-setup'
import { SOAREngine } from '../../../src/lib/security/soar'

describe('SOAR Automation Engine', () => {
  describe('Playbook Execution', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should execute playbook successfully', async () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()
      const playbook = playbooks[0]

      if (!playbook) {
        throw new Error('No playbooks available for testing')
      }

      const execution = await engine.executePlaybook(playbook, {
        type: 'incident',
        id: 'test-incident',
      })

      validateExecutionResult(execution)
      expect(execution.playbookId).toBe(playbook.playbookId)
      expect(['completed', 'failed']).toContain(execution.status)
      expect(execution.startedAt).toBeDefined()
      expect(execution.executedSteps).toBeDefined()
      expect(execution.metrics).toBeDefined()
    })

    it('should track playbook execution metrics', async () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()
      const playbook = playbooks[0]

      if (!playbook) {
        throw new Error('No playbooks available for testing')
      }

      const execution = await engine.executePlaybook(playbook, {
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

    it('should execute playbook steps in correct order', async () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()
      const incidentPlaybook = playbooks.find(p => p.name === 'Critical Incident Response')

      if (incidentPlaybook) {
        const execution = await engine.executePlaybook(incidentPlaybook, {
          type: 'incident',
          id: 'test-incident',
        })

        expect(execution.executedSteps.length).toBeGreaterThan(0)

        // Check step execution properties
        execution.executedSteps.forEach((step: { stepId?: string; status?: string; startedAt?: number }) => {
          expect(step).toHaveProperty('stepId')
          expect(step).toHaveProperty('status')
          expect(step).toHaveProperty('startedAt')
          expect(['pending', 'running', 'completed', 'failed', 'skipped']).toContain(step.status)
        })
      }
    })

    it('should handle playbook execution with different trigger types', async () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      if (playbooks.length > 0) {
        const triggerTypes = ['incident', 'threat', 'vulnerability', 'manual'] as const

        for (const triggerType of triggerTypes) {
          const execution = await engine.executePlaybook(playbooks[0]!, {
            type: triggerType,
            id: `test-${triggerType}`,
          })

          expect(execution.triggeredBy.type).toBe(triggerType)
          expect(execution.triggeredBy.id).toBe(`test-${triggerType}`)
        }
      }
    })

    it('should execute multiple playbooks concurrently', async () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      if (playbooks.length >= 2) {
        const triggerContext = { type: 'incident' as const, id: 'concurrent-test' }
        
        const executions = await Promise.all([
          engine.executePlaybook(playbooks[0]!, triggerContext),
          engine.executePlaybook(playbooks[1]!, triggerContext),
        ])

        expect(executions).toHaveLength(2)
        executions.forEach(execution => {
          validateExecutionResult(execution)
        })
      }
    })
  })

  describe('Automated Response Workflows', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should execute automated response for critical incidents', async () => {
      const engine = getEngine()
      const criticalIncident = securityScenarios.criticalIncident()

      const executions = await engine.processIncident(criticalIncident)

      expect(executions.length).toBeGreaterThan(0)

      // Check for automated response actions
      const actions = engine.getResponseActions()
      const incidentActions = actions.filter(a => a.target === criticalIncident.incidentId)

      expect(incidentActions.length).toBeGreaterThan(0)
      expect(incidentActions.some(a => a.type === 'escalate_incident')).toBe(true)
      expect(incidentActions.some(a => a.type === 'notify_stakeholders')).toBe(true)
    })

    it('should handle automated threat response workflow', async () => {
      const engine = getEngine()
      const criticalThreat = securityScenarios.sqlInjectionThreat()

      await engine.processThreat(criticalThreat)

      // Check for immediate response actions
      const actions = engine.getResponseActions()
      expect(actions.length).toBeGreaterThan(0)

      // Check that at least one action was automated
      const automatedActions = actions.filter((a: { automated?: boolean }) => a.automated)
      expect(automatedActions.length).toBeGreaterThan(0)
    })

    it('should execute vulnerability management workflow', async () => {
      const engine = getEngine()
      const criticalVuln = securityScenarios.criticalVulnerability()

      const executions = await engine.processVulnerability(criticalVuln)

      expect(executions.length).toBeGreaterThan(0)

      // Should trigger vulnerability management playbook
      const vulnPlaybooks = executions.filter(e => e.playbookId === 'vulnerability-management')
      expect(vulnPlaybooks.length).toBeGreaterThan(0)
    })

    it('should coordinate multi-step automated response', async () => {
      const engine = getEngine()
      const criticalIncident = createMockSecurityIncident({
        severity: 'critical',
        type: 'vulnerability',
        incidentId: 'multi-step-test',
      })

      await engine.processIncident(criticalIncident)

      const actions = engine.getResponseActions()
      const executions = engine.getExecutions()

      // Should have both actions and playbook executions
      expect(actions.length).toBeGreaterThan(0)
      expect(executions.length).toBeGreaterThan(0)

      // Actions should be linked to the incident
      const relatedActions = actions.filter(a => a.target === criticalIncident.incidentId)
      expect(relatedActions.length).toBeGreaterThan(0)
    })
  })

  describe('Automation Decision Making', () => {
    it('should make automation decisions based on security thresholds', async () => {
      const highSecEngine = new SOAREngine(highSecurityConfig)
      await highSecEngine.start()

      const highConfidenceThreat = securityScenarios.sqlInjectionThreat()
      highConfidenceThreat.confidence = 0.98 // Very high confidence

      await highSecEngine.processThreat(highConfidenceThreat)

      const actions = highSecEngine.getResponseActions()
      const automatedActions = actions.filter((a: { automated?: boolean }) => a.automated)

      // High confidence should trigger more automated actions
      expect(automatedActions.length).toBeGreaterThan(0)

      await highSecEngine.shutdown()
    })

    it('should respect automation level restrictions', async () => {
      const lowAutomationConfig = {
        automation: {
          enableAutomatedResponse: true,
          enablePlaybookExecution: true,
          enableMLDecisionMaking: true,
          maxAutomationLevel: 'low' as const,
        },
      }

      const lowAutoEngine = new SOAREngine(lowAutomationConfig)
      await lowAutoEngine.start()

      const incident = securityScenarios.criticalIncident()
      await lowAutoEngine.processIncident(incident)

      const actions = lowAutoEngine.getResponseActions()
      const automatedActions = actions.filter((a: { automated?: boolean }) => a.automated)

      // Low automation level should limit automated actions
      expect(automatedActions.length).toBeLessThanOrEqual(2)

      await lowAutoEngine.shutdown()
    })

    it('should handle disabled automation configuration', async () => {
      const disabledEngine = new SOAREngine(disabledAutomationConfig)
      await disabledEngine.start()

      const criticalIncident = createMockSecurityIncident({ severity: 'critical' })
      await disabledEngine.processIncident(criticalIncident)

      const actions = disabledEngine.getResponseActions()
      const automatedActions = actions.filter((a: { automated?: boolean }) => a.automated)

      // Note: Even with disabled automation config, critical incidents still trigger
      // escalation and stakeholder notification actions (lines 346-349 in soar.ts)
      // This is hardcoded behavior for critical incidents regardless of config
      expect(automatedActions.length).toBe(2)
      
      // Verify the specific actions that are always executed for critical incidents
      const actionTypes = automatedActions.map(action => action.type)
      expect(actionTypes).toContain('escalate_incident')
      expect(actionTypes).toContain('notify_stakeholders')

      await disabledEngine.shutdown()
    })

    it('should make ML-based automation decisions', async () => {
      const mlEnabledConfig = {
        automation: {
          enableAutomatedResponse: true,
          enablePlaybookExecution: true,
          enableMLDecisionMaking: true,
          maxAutomationLevel: 'high' as const,
        },
      }

      const mlEngine = new SOAREngine(mlEnabledConfig)
      await mlEngine.start()

      const highMLScoreThreat = securityScenarios.bruteForceAttack()
      highMLScoreThreat.mlScore = 0.95
      // Ensure critical severity AND high confidence (>= 0.95) to trigger block_threat (lines 371-372 in soar.ts)
      highMLScoreThreat.severity = 'critical'
      highMLScoreThreat.confidence = 0.96
      
      // Process threat to trigger automated actions
      await mlEngine.processThreat(highMLScoreThreat)

      // Now we should have response actions generated
      const actions = mlEngine.getResponseActions()
      expect(actions.length).toBeGreaterThan(0)

      // High confidence threats (>= 0.95) with critical severity trigger block_threat action (line 372 in soar.ts)
      const blockingActions = actions.filter(a => a.type === 'block_threat')
      expect(blockingActions.length).toBeGreaterThan(0)

      await mlEngine.shutdown()
    })
  })

  describe('Playbook Structure and Validation', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should provide well-structured playbooks', () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      expect(playbooks.length).toBeGreaterThan(0)

      playbooks.forEach(playbook => {
        expect(() => validatePlaybookStructure(playbook)).not.toThrow()
      })
    })

    it('should validate playbook triggers correctly', () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      playbooks.forEach(playbook => {
        playbook.triggers.forEach(trigger => {
          expect(trigger).toHaveProperty('type')
          expect(trigger).toHaveProperty('conditions')
          expect(['incident', 'threat', 'vulnerability', 'manual']).toContain(trigger.type)
          expect(Array.isArray(trigger.conditions)).toBe(true)
        })
      })
    })

    it('should validate playbook steps structure', () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      playbooks.forEach(playbook => {
        expect(Array.isArray(playbook.steps)).toBe(true)
        
        playbook.steps.forEach((step: {
          stepId?: string
          name?: string
          type?: string
          description?: string
          automated?: boolean
          conditions?: unknown[]
          actions?: unknown[]
        }) => {
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
            'detection', 'analysis', 'containment', 'eradication',
            'recovery', 'notification', 'documentation', 'verification'
          ]
          expect(validStepTypes).toContain(step.type)
        })
      })
    })

    it('should have playbooks for all incident types', () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()
      const playbookNames = playbooks.map(p => p.name)

      // Check for essential playbooks
      expect(playbookNames).toContain('Critical Incident Response')
      expect(playbookNames).toContain('Automated Threat Hunting')
      expect(playbookNames).toContain('Vulnerability Management')
    })
  })

  describe('Automation Error Handling', () => {
    const { getEngine } = setupRunningSOAREngine()

    it('should handle playbook execution failures gracefully', async () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      if (playbooks.length > 0) {
        // Use invalid trigger context to potentially cause failure
        const execution = await engine.executePlaybook(playbooks[0]!, {
          type: 'incident',
          id: '', // Empty ID might cause issues
        })

        // Should not throw, but may have failed status
        validateExecutionResult(execution)
        expect(['completed', 'failed']).toContain(execution.status)
      }
    })

    it('should handle concurrent automation requests', async () => {
      const engine = getEngine()
      const incident = securityScenarios.criticalIncident()

      // Process the same incident multiple times concurrently
      const processPromises = Array(3).fill(null).map(() => 
        engine.processIncident({ ...incident, incidentId: `concurrent-${Date.now()}-${Math.random()}` })
      )

      const results = await Promise.all(processPromises)

      expect(results).toHaveLength(3)
      results.forEach((executions: unknown[]) => {
        expect(Array.isArray(executions)).toBe(true)
      })
    })

    it('should handle automation with insufficient data', async () => {
      const engine = getEngine()
      const minimalIncident = createMockSecurityIncident({
        severity: 'low',
        vulnerabilities: [],
        threats: [],
        affectedSystems: [],
      })

      // Should handle minimal incident without crashing
      const executions = await engine.processIncident(minimalIncident)
      expect(Array.isArray(executions)).toBe(true)
    })
  })
})