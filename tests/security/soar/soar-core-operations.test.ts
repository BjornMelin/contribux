/**
 * SOAR Core Operations Test Suite
 * Tests basic SOAR engine initialization, configuration, lifecycle management,
 * and foundational security operations functionality
 */

import { describe, expect, it } from 'vitest'
import { createSOAREngine, SOAREngine } from '../../../src/lib/security/soar'
import { securityTestConfig, testOnlyConfig } from './setup/security-setup'
import {
  assertSOAREngineState,
  createMockSOARConfig,
  setupSOAREngineTest,
} from './utils/soar-test-helpers'

describe('SOAR Core Operations', () => {
  describe('Engine Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultEngine = new SOAREngine()
      const metrics = defaultEngine.getSOARMetrics()

      expect(metrics.automation.isRunning).toBe(false)
      expect(metrics.playbooks.total).toBeGreaterThan(0) // Should have default playbooks
    })

    it('should initialize with custom configuration', () => {
      const customConfig = createMockSOARConfig()
      const customEngine = new SOAREngine(customConfig)
      const metrics = customEngine.getSOARMetrics()

      expect(metrics.automation.isRunning).toBe(false)
      expect(metrics.automation.enabled).toBe(true)
      expect(metrics.automation.level).toBe('medium')
    })

    it('should create SOAR engine using factory function', () => {
      const factoryConfig = createMockSOARConfig(testOnlyConfig)
      const factoryEngine = createSOAREngine(factoryConfig)

      expect(factoryEngine).toBeInstanceOf(SOAREngine)
    })

    it('should load default playbooks on initialization', () => {
      const engine = new SOAREngine()
      const playbooks = engine.getPlaybooks()

      expect(playbooks.length).toBeGreaterThan(0)

      // Check for default playbooks
      const playbookNames = playbooks.map(p => p.name)
      expect(playbookNames).toContain('Critical Incident Response')
      expect(playbookNames).toContain('Automated Threat Hunting')
      expect(playbookNames).toContain('Vulnerability Management')
    })

    it('should initialize with test-safe configuration', () => {
      const testConfig = createMockSOARConfig(testOnlyConfig)
      const engine = new SOAREngine(testConfig)
      const metrics = engine.getSOARMetrics()

      // Verify test-safe settings
      expect(metrics.automation.enabled).toBe(true)
      expect(metrics.automation.isRunning).toBe(false)
    })
  })

  describe('Engine Lifecycle Management', () => {
    const { getEngine, startEngine, stopEngine, shutdownEngine } = setupSOAREngineTest()

    it('should start SOAR engine successfully', async () => {
      const engine = getEngine()
      expect(assertSOAREngineState.isStopped(engine)).toBe(true)

      await startEngine()

      expect(assertSOAREngineState.isRunning(engine)).toBe(true)
    })

    it('should stop SOAR engine successfully', async () => {
      const engine = getEngine()

      await startEngine()
      expect(assertSOAREngineState.isRunning(engine)).toBe(true)

      await stopEngine()
      expect(assertSOAREngineState.isStopped(engine)).toBe(true)
    })

    it('should prevent starting engine when already running', async () => {
      const _engine = getEngine()

      await startEngine()

      await expect(startEngine()).rejects.toThrow('SOAR engine is already running')
    })

    it('should handle stop when not running gracefully', async () => {
      const _engine = getEngine()

      // Engine starts stopped, should handle stop gracefully
      await expect(stopEngine()).resolves.not.toThrow()
    })

    it('should handle shutdown gracefully', async () => {
      const engine = getEngine()

      await startEngine()
      expect(assertSOAREngineState.isRunning(engine)).toBe(true)

      await shutdownEngine()
      expect(assertSOAREngineState.isStopped(engine)).toBe(true)
    })

    it('should clean up resources on shutdown', async () => {
      const engine = getEngine()

      await startEngine()

      // Verify engine has resources
      expect(assertSOAREngineState.hasPlaybooks(engine)).toBe(true)

      await shutdownEngine()

      // Verify cleanup
      expect(assertSOAREngineState.isStopped(engine)).toBe(true)
      expect(engine.getPlaybooks()).toHaveLength(0)
      expect(engine.getExecutions()).toHaveLength(0)
      expect(engine.getResponseActions()).toHaveLength(0)
    })
  })

  describe('Configuration Management', () => {
    it('should apply automation configuration correctly', () => {
      const automationConfig = createMockSOARConfig({
        automation: {
          enableAutomatedResponse: true,
          enablePlaybookExecution: true,
          enableMLDecisionMaking: false,
          maxAutomationLevel: 'high',
        },
      })

      const engine = new SOAREngine(automationConfig)
      const metrics = engine.getSOARMetrics()

      expect(metrics.automation.enabled).toBe(true)
      expect(metrics.automation.level).toBe('high')
    })

    it('should apply security thresholds correctly', () => {
      const thresholdConfig = createMockSOARConfig({
        thresholds: {
          criticalIncidentThreshold: 0.95,
          automatedResponseThreshold: 0.85,
          escalationThreshold: 0.98,
        },
      })

      const engine = new SOAREngine(thresholdConfig)
      // Thresholds are internal, but we can verify engine initializes correctly
      expect(engine).toBeInstanceOf(SOAREngine)
    })

    it('should apply notification configuration correctly', () => {
      const notificationConfig = createMockSOARConfig({
        notifications: {
          enableSlackIntegration: true,
          enableEmailAlerts: true,
          enableSMSAlerts: false,
          enableWebhookNotifications: true,
        },
      })

      const engine = new SOAREngine(notificationConfig)
      // Notifications are internal, but we can verify engine initializes correctly
      expect(engine).toBeInstanceOf(SOAREngine)
    })

    it('should handle disabled automation configuration', () => {
      const disabledConfig = createMockSOARConfig({
        automation: {
          enableAutomatedResponse: false,
          enablePlaybookExecution: false,
          enableMLDecisionMaking: false,
          maxAutomationLevel: 'low',
        },
      })

      const engine = new SOAREngine(disabledConfig)
      const metrics = engine.getSOARMetrics()

      expect(metrics.automation.enabled).toBe(false)
      expect(metrics.automation.level).toBe('low')
    })
  })

  describe('Basic Operations Validation', () => {
    const { getEngine, startEngine } = setupSOAREngineTest()

    it('should provide metrics after initialization', async () => {
      const engine = getEngine()
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

    it('should provide access to playbooks', () => {
      const engine = getEngine()
      const playbooks = engine.getPlaybooks()

      expect(Array.isArray(playbooks)).toBe(true)
      expect(playbooks.length).toBeGreaterThan(0)
    })

    it('should provide access to executions', () => {
      const engine = getEngine()
      const executions = engine.getExecutions()

      expect(Array.isArray(executions)).toBe(true)
      // Initially empty
      expect(executions.length).toBe(0)
    })

    it('should provide access to response actions', () => {
      const engine = getEngine()
      const actions = engine.getResponseActions()

      expect(Array.isArray(actions)).toBe(true)
      // Initially empty
      expect(actions.length).toBe(0)
    })

    it('should handle state queries when engine is running', async () => {
      const engine = getEngine()

      await startEngine()
      expect(assertSOAREngineState.isRunning(engine)).toBe(true)

      // Should still provide access to all data
      expect(assertSOAREngineState.hasPlaybooks(engine)).toBe(true)
      expect(Array.isArray(engine.getExecutions())).toBe(true)
      expect(Array.isArray(engine.getResponseActions())).toBe(true)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle initialization with invalid configuration gracefully', () => {
      // Test with minimal config - should not throw
      expect(() => new SOAREngine({})).not.toThrow()
    })

    it('should handle multiple shutdown calls gracefully', async () => {
      const engine = new SOAREngine()

      // Multiple shutdowns should not throw
      await expect(engine.shutdown()).resolves.not.toThrow()
      await expect(engine.shutdown()).resolves.not.toThrow()
    })

    it('should handle operations when engine is not running', async () => {
      const engine = new SOAREngine()

      // Should provide metrics even when not running
      const metrics = engine.getSOARMetrics()
      expect(metrics.automation.isRunning).toBe(false)

      // The SOAR engine initializes default playbooks during construction (line 175 in soar.ts)
      // So even when not running, it has 3 default playbooks available
      expect(engine.getPlaybooks()).toHaveLength(3)
      expect(engine.getExecutions()).toHaveLength(0)
      expect(engine.getResponseActions()).toHaveLength(0)

      // Verify the default playbooks are created
      const playbooks = engine.getPlaybooks()
      const playbookNames = playbooks.map(p => p.name)
      expect(playbookNames).toContain('Critical Incident Response')
      expect(playbookNames).toContain('Automated Threat Hunting')
      expect(playbookNames).toContain('Vulnerability Management')
    })

    it(
      'should handle startup timeout gracefully',
      async () => {
        const engine = new SOAREngine()

        // Should complete within timeout
        const startPromise = engine.start()
        await expect(startPromise).resolves.not.toThrow()

        await engine.shutdown()
      },
      securityTestConfig.timeouts.startup
    )
  })
})
