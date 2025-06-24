/**
 * SOAR Playbook Management
 * Handles playbook creation, execution, and management
 */

import { generateSecureToken } from '../crypto'
import type { Playbook, PlaybookExecution, PlaybookStep, SOARConfig } from './schemas'

export class PlaybookManager {
  private playbooks = new Map<string, Playbook>()
  private executions = new Map<string, PlaybookExecution>()
  private config: SOARConfig

  constructor(config: SOARConfig) {
    this.config = config
    this.initializeDefaultPlaybooks()
  }

  /**
   * Execute a specific playbook
   */
  async executePlaybook(
    playbook: Playbook,
    trigger: { type: string; id: string }
  ): Promise<PlaybookExecution> {
    const executionId = await generateSecureToken(16)
    const execution: PlaybookExecution = {
      executionId,
      playbookId: playbook.playbookId,
      triggeredBy: trigger as PlaybookExecution['triggeredBy'],
      status: 'queued',
      startedAt: Date.now(),
      currentStep: playbook.steps[0]?.stepId,
      executedSteps: [],
      results: {},
      metrics: {
        automatedSteps: playbook.steps.filter(s => s.automated).length,
        manualSteps: playbook.steps.filter(s => !s.automated).length,
      },
    }

    this.executions.set(executionId, execution)

    try {
      console.log(`📝 Executing playbook: ${playbook.name} (${playbook.playbookId})`)
      execution.status = 'running'

      // Execute each step in order
      for (const step of playbook.steps) {
        await this.executePlaybookStep(execution, step)

        // Check if execution was cancelled or failed
        if (execution.status === 'cancelled' || execution.status === 'failed') {
          break
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed'
        execution.completedAt = Date.now()
        execution.metrics.totalDuration = execution.completedAt - execution.startedAt
        execution.metrics.successRate =
          execution.executedSteps.filter(s => s.status === 'completed').length /
          execution.executedSteps.length
      }

      console.log(`✅ Playbook execution completed: ${executionId}`)
    } catch (error) {
      execution.status = 'failed'
      execution.completedAt = Date.now()
      console.error(`❌ Playbook execution failed: ${executionId}`, error)
    }

    return execution
  }

  /**
   * Execute a single playbook step
   */
  private async executePlaybookStep(
    execution: PlaybookExecution,
    step: PlaybookStep
  ): Promise<void> {
    const stepExecution = {
      stepId: step.stepId,
      status: 'running' as const,
      startedAt: Date.now(),
    }

    execution.executedSteps.push(stepExecution)
    execution.currentStep = step.stepId

    try {
      console.log(`🔄 Executing step: ${step.name} (${step.stepId})`)

      // Check step conditions
      if (!this.evaluateStepConditions(step.conditions)) {
        stepExecution.status = 'skipped'
        stepExecution.output = 'Step conditions not met'
        stepExecution.completedAt = Date.now()
        return
      }

      // Execute step actions
      if (step.automated && this.config.automation.enableAutomatedResponse) {
        await this.executeAutomatedStepActions(step, execution)
      } else {
        await this.executeManualStepActions(step, execution)
      }

      stepExecution.status = 'completed'
      stepExecution.completedAt = Date.now()
      stepExecution.output = 'Step completed successfully'

      console.log(`✅ Step completed: ${step.name}`)
    } catch (error) {
      stepExecution.status = 'failed'
      stepExecution.completedAt = Date.now()
      stepExecution.error = error instanceof Error ? error.message : 'Unknown error'

      console.error(`❌ Step failed: ${step.name}`, error)

      // Retry logic
      if (step.retries > 0) {
        console.log(`🔄 Retrying step: ${step.name} (${step.retries} retries remaining)`)
        step.retries--
        await this.executePlaybookStep(execution, step)
      } else {
        // Mark entire execution as failed if critical step fails
        if (step.type === 'containment' || step.type === 'eradication') {
          execution.status = 'failed'
        }
      }
    }
  }

  /**
   * Execute automated step actions
   */
  private async executeAutomatedStepActions(
    step: PlaybookStep,
    _execution: PlaybookExecution
  ): Promise<void> {
    for (const action of step.actions) {
      try {
        // This would call the response actions module
        console.log(`🤖 Executing automated action: ${action}`)
        await this.simulateActionExecution(action)
      } catch (error) {
        console.error(`Failed to execute automated action: ${action}`, error)
        throw error
      }
    }
  }

  /**
   * Execute manual step actions (log for human operator)
   */
  private async executeManualStepActions(
    step: PlaybookStep,
    _execution: PlaybookExecution
  ): Promise<void> {
    console.log(`📋 Manual step requires human intervention: ${step.name}`)
    console.log(`📝 Actions required: ${step.actions.join(', ')}`)

    // In a real implementation, this would create tasks for human operators
    // For now, we'll simulate manual execution
    await this.simulateManualExecution(step)
  }

  /**
   * Find applicable playbooks for a trigger
   */
  findApplicablePlaybooks(triggerType: string, context: any): Playbook[] {
    const applicable: Playbook[] = []

    for (const playbook of this.playbooks.values()) {
      for (const trigger of playbook.triggers) {
        if (trigger.type === triggerType) {
          // Check if trigger conditions are met
          if (this.evaluatePlaybookTriggerConditions(trigger.conditions, context)) {
            applicable.push(playbook)
            break
          }
        }
      }
    }

    // Sort by priority
    return applicable.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }

  /**
   * Evaluate playbook trigger conditions
   */
  private evaluatePlaybookTriggerConditions(conditions: string[], context: any): boolean {
    // Simple condition evaluation - in production, this would be more sophisticated
    for (const condition of conditions) {
      if (condition.includes('severity=critical') && context.severity !== 'critical') {
        return false
      }
      if (condition.includes('severity=high') && !['critical', 'high'].includes(context.severity)) {
        return false
      }
      if (condition.includes('confidence>0.8') && context.confidence <= 0.8) {
        return false
      }
    }
    return true
  }

  /**
   * Evaluate step conditions
   */
  private evaluateStepConditions(conditions: string[]): boolean {
    // Simple condition evaluation - in production, this would check actual system state
    return conditions.length === 0 || Math.random() > 0.1 // 90% success rate
  }

  private async simulateActionExecution(_action: string): Promise<void> {
    // Simulate action execution
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  private async simulateManualExecution(step: PlaybookStep): Promise<void> {
    console.log(`⏳ Simulating manual execution of: ${step.name}`)
    await new Promise(resolve => setTimeout(resolve, step.timeout || 100))
  }

  /**
   * Initialize default playbooks
   */
  private initializeDefaultPlaybooks(): void {
    // Critical Incident Response Playbook
    this.playbooks.set('critical-incident-response', {
      playbookId: 'critical-incident-response',
      name: 'Critical Incident Response',
      description: 'Automated response for critical security incidents',
      version: '1.0.0',
      triggers: [
        {
          type: 'incident',
          conditions: ['severity=critical'],
        },
      ],
      steps: [
        {
          stepId: 'detect-critical',
          name: 'Detect Critical Incident',
          description: 'Validate critical incident detection',
          type: 'detection',
          automated: true,
          conditions: [],
          actions: ['validate_detection', 'collect_initial_evidence'],
        },
        {
          stepId: 'immediate-containment',
          name: 'Immediate Containment',
          description: 'Execute immediate containment actions',
          type: 'containment',
          automated: true,
          conditions: [],
          actions: ['isolate_system', 'block_ip', 'quarantine_user'],
        },
        {
          stepId: 'stakeholder-notification',
          name: 'Notify Stakeholders',
          description: 'Notify relevant stakeholders immediately',
          type: 'notification',
          automated: true,
          conditions: [],
          actions: ['notify_stakeholders', 'escalate_incident'],
        },
      ],
      priority: 'critical',
      estimatedDuration: 30,
      requiredPermissions: ['incident_response', 'system_admin'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'soar_engine',
    })

    // Add more default playbooks...
  }

  getPlaybooks(): Playbook[] {
    return Array.from(this.playbooks.values())
  }

  getExecutions(): PlaybookExecution[] {
    return Array.from(this.executions.values())
  }
}
