/**
 * SOAR test utilities and helpers
 * Provides common setup, teardown, and assertion utilities for security testing
 */

import { afterEach, beforeEach, vi } from 'vitest'
import { type SOARConfig, SOAREngine } from '../../../../src/lib/security/soar'

// Mock crypto module for consistent testing
vi.mock('../../../../src/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

export const createMockSOARConfig = (overrides?: Partial<SOARConfig>): SOARConfig => ({
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
  ...overrides,
})

export const createIsolatedSOAREngine = (config?: Partial<SOARConfig>): SOAREngine => {
  const mockConfig = createMockSOARConfig(config)
  return new SOAREngine(mockConfig)
}

export const setupSOAREngineTest = () => {
  let soarEngine: SOAREngine

  beforeEach(async () => {
    vi.clearAllMocks()
    soarEngine = createIsolatedSOAREngine()
  })

  afterEach(async () => {
    try {
      await soarEngine.shutdown()
    } catch (_error) {
      // Ignore shutdown errors in tests
    }
  })

  return {
    getEngine: () => soarEngine,
    startEngine: () => soarEngine.start(),
    stopEngine: () => soarEngine.stop(),
    shutdownEngine: () => soarEngine.shutdown(),
  }
}

export const setupRunningSOAREngine = () => {
  let soarEngine: SOAREngine

  beforeEach(async () => {
    vi.clearAllMocks()
    soarEngine = createIsolatedSOAREngine()
    await soarEngine.start()
  })

  afterEach(async () => {
    try {
      await soarEngine.shutdown()
    } catch (_error) {
      // Ignore shutdown errors in tests
    }
  })

  return {
    getEngine: () => soarEngine,
    stopEngine: () => soarEngine.stop(),
    shutdownEngine: () => soarEngine.shutdown(),
  }
}

export const assertSOAREngineState = {
  isRunning: (engine: SOAREngine) => {
    const metrics = engine.getSOARMetrics()
    return metrics.automation.isRunning === true
  },

  isStopped: (engine: SOAREngine) => {
    const metrics = engine.getSOARMetrics()
    return metrics.automation.isRunning === false
  },

  hasPlaybooks: (engine: SOAREngine) => {
    const playbooks = engine.getPlaybooks()
    return playbooks.length > 0
  },

  hasExecutions: (engine: SOAREngine, minCount = 1) => {
    const executions = engine.getExecutions()
    return executions.length >= minCount
  },

  hasResponseActions: (engine: SOAREngine, minCount = 1) => {
    const actions = engine.getResponseActions()
    return actions.length >= minCount
  },
}

export const waitForSOAROperation = async (
  operation: () => Promise<unknown>,
  timeoutMs = 5000
): Promise<unknown> => {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    try {
      return await operation()
    } catch (error) {
      if (Date.now() - startTime >= timeoutMs) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  throw new Error(`SOAR operation timed out after ${timeoutMs}ms`)
}

export const validatePlaybookStructure = (playbook: {
  playbookId?: string
  name?: string
  description?: string
  version?: string
  triggers?: Array<{ type?: string; conditions?: unknown[] }>
  steps?: Array<{
    stepId?: string
    name?: string
    type?: string
    description?: string
    automated?: boolean
    conditions?: unknown[]
    actions?: unknown[]
  }>
  priority?: string
  estimatedDuration?: number
  requiredPermissions?: string[]
  createdAt?: number
  updatedAt?: number
  createdBy?: string
}) => {
  // Basic properties
  const requiredProps = [
    'playbookId',
    'name',
    'description',
    'version',
    'triggers',
    'steps',
    'priority',
  ]
  for (const prop of requiredProps) {
    if (!(prop in playbook)) {
      throw new Error(`Playbook missing required property: ${prop}`)
    }
  }

  // Validate triggers
  if (!Array.isArray(playbook.triggers)) {
    throw new Error('Playbook triggers must be an array')
  }

  playbook.triggers.forEach(trigger => {
    if (!trigger.type || !Array.isArray(trigger.conditions)) {
      throw new Error('Invalid trigger structure')
    }
    if (!['incident', 'threat', 'vulnerability', 'manual'].includes(trigger.type)) {
      throw new Error(`Invalid trigger type: ${trigger.type}`)
    }
  })

  // Validate steps
  if (!Array.isArray(playbook.steps)) {
    throw new Error('Playbook steps must be an array')
  }

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

  playbook.steps.forEach(step => {
    const stepProps = [
      'stepId',
      'name',
      'description',
      'type',
      'automated',
      'conditions',
      'actions',
    ]
    for (const prop of stepProps) {
      if (!(prop in step)) {
        throw new Error(`Step missing required property: ${prop}`)
      }
    }

    if (typeof step.automated !== 'boolean') {
      throw new Error('Step automated property must be boolean')
    }

    if (!Array.isArray(step.conditions) || !Array.isArray(step.actions)) {
      throw new Error('Step conditions and actions must be arrays')
    }

    if (!step.type || !validStepTypes.includes(step.type)) {
      throw new Error(`Invalid step type: ${step.type}`)
    }
  })
}

export const validateExecutionResult = (execution: {
  executionId?: string
  playbookId?: string
  status?: string
  startedAt?: number
  executedSteps?: Array<{ stepId?: string; status?: string }>
  metrics?: {
    automatedSteps?: number
    manualSteps?: number
    totalDuration?: number
    successRate?: number
  }
  triggeredBy?: { type?: string; id?: string }
}) => {
  const requiredProps = [
    'executionId',
    'playbookId',
    'status',
    'startedAt',
    'executedSteps',
    'metrics',
  ]
  for (const prop of requiredProps) {
    if (!(prop in execution)) {
      throw new Error(`Execution missing required property: ${prop}`)
    }
  }

  if (
    !execution.status ||
    !['completed', 'failed', 'running', 'pending'].includes(execution.status)
  ) {
    throw new Error(`Invalid execution status: ${execution.status}`)
  }

  if (!Array.isArray(execution.executedSteps)) {
    throw new Error('Execution executedSteps must be an array')
  }

  execution.executedSteps.forEach(step => {
    if (!step.stepId || !step.status) {
      throw new Error('Step must have stepId and status')
    }
    if (!['pending', 'running', 'completed', 'failed', 'skipped'].includes(step.status)) {
      throw new Error(`Invalid step status: ${step.status}`)
    }
  })

  if (execution.metrics) {
    const { automatedSteps, manualSteps, successRate } = execution.metrics
    if (typeof automatedSteps !== 'number' || typeof manualSteps !== 'number') {
      throw new Error('Metrics automatedSteps and manualSteps must be numbers')
    }
    if (successRate !== undefined) {
      if (typeof successRate !== 'number' || successRate < 0 || successRate > 1) {
        throw new Error('Success rate must be a number between 0 and 1')
      }
    }
  }
}
