/**
 * SOAR Playbook Management
 * Handles playbook creation, execution, and management
 */

import { generateSecureToken } from '../crypto'
import type {
  ComprehensiveSecurityContext,
  PlaybookTriggerContext,
  SecurityEventContext,
} from '../schemas'
import { createPlaybookTriggerContext } from '../schemas'
import type { Playbook, PlaybookExecution, PlaybookStep, SOARConfig } from './schemas'

/**
 * Strategy interface for condition evaluation
 */
interface ConditionHandler {
  canHandle(condition: string): boolean
  evaluate(condition: string): boolean
}

/**
 * Handler for severity-based conditions
 */
class SeverityConditionHandler implements ConditionHandler {
  constructor(private eventContext: SecurityEventContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('severity=')
  }

  evaluate(condition: string): boolean {
    const severity = this.eventContext.severity

    if (condition.includes('severity=critical')) {
      return severity === 'critical'
    }
    if (condition.includes('severity=high')) {
      return ['critical', 'high'].includes(severity)
    }
    if (condition.includes('severity=medium')) {
      return ['critical', 'high', 'medium'].includes(severity)
    }

    return true
  }
}

/**
 * Handler for confidence-based conditions
 */
class ConfidenceConditionHandler implements ConditionHandler {
  constructor(private eventContext: SecurityEventContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('confidence>')
  }

  evaluate(condition: string): boolean {
    const confidence = this.eventContext.confidence

    if (condition.includes('confidence>0.9')) {
      return confidence > 0.9
    }
    if (condition.includes('confidence>0.8')) {
      return confidence > 0.8
    }

    return true
  }
}

/**
 * Handler for risk score conditions
 */
class RiskScoreConditionHandler implements ConditionHandler {
  constructor(private eventContext: SecurityEventContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('risk_score>')
  }

  evaluate(condition: string): boolean {
    const riskScore = this.eventContext.riskScore

    if (condition.includes('risk_score>90')) {
      return riskScore > 90
    }
    if (condition.includes('risk_score>80')) {
      return riskScore > 80
    }

    return true
  }
}

/**
 * Handler for event type conditions
 */
class EventTypeConditionHandler implements ConditionHandler {
  constructor(private eventContext: SecurityEventContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('type=')
  }

  evaluate(condition: string): boolean {
    const eventType = this.eventContext.type

    if (condition.includes('type=threat')) {
      return eventType === 'threat'
    }
    if (condition.includes('type=vulnerability')) {
      return eventType === 'vulnerability'
    }
    if (condition.includes('type=incident')) {
      return eventType === 'incident'
    }

    return true
  }
}

/**
 * Handler for business impact conditions
 */
class BusinessImpactConditionHandler implements ConditionHandler {
  constructor(private eventContext: SecurityEventContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('business_impact=')
  }

  evaluate(condition: string): boolean {
    const businessImpact = this.eventContext.businessImpact

    if (condition.includes('business_impact=critical')) {
      return businessImpact === 'critical'
    }
    if (condition.includes('business_impact=high')) {
      return ['critical', 'high'].includes(businessImpact)
    }

    return true
  }
}

/**
 * Handler for automation level conditions
 */
class AutomationLevelConditionHandler implements ConditionHandler {
  constructor(private context: PlaybookTriggerContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('automation_level>=')
  }

  evaluate(condition: string): boolean {
    const automationLevel = this.context.automationLevel

    if (condition.includes('automation_level>=high')) {
      return ['high', 'full'].includes(automationLevel)
    }
    if (condition.includes('automation_level>=medium')) {
      return ['medium', 'high', 'full'].includes(automationLevel)
    }

    return true
  }
}

/**
 * Handler for historical data conditions
 */
class HistoricalDataConditionHandler implements ConditionHandler {
  constructor(private context: PlaybookTriggerContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('similar_incidents>')
  }

  evaluate(condition: string): boolean {
    const similarIncidents = this.context.historicalData?.similarIncidents || 0

    if (condition.includes('similar_incidents>5')) {
      return similarIncidents > 5
    }

    return true
  }
}

/**
 * Handler for affected systems conditions
 */
class AffectedSystemsConditionHandler implements ConditionHandler {
  constructor(private eventContext: SecurityEventContext) {}

  canHandle(condition: string): boolean {
    return condition.includes('multiple_systems')
  }

  evaluate(condition: string): boolean {
    if (condition.includes('multiple_systems')) {
      return this.eventContext.affectedSystems.length > 1
    }

    return true
  }
}

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
      execution.status = 'running'

      // Execute each step in order
      for (const step of playbook.steps) {
        await this.executePlaybookStep(execution, step)

        // Check if execution failed - status can be changed by executePlaybookStep
        if ((execution.status as string) === 'failed') {
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
    } catch (_error) {
      execution.status = 'failed'
      execution.completedAt = Date.now()
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
    // Create step execution record with proper typing
    const stepExecution: PlaybookExecution['executedSteps'][0] = {
      stepId: step.stepId,
      status: 'running',
      startedAt: Date.now(),
    }

    execution.executedSteps.push(stepExecution)
    execution.currentStep = step.stepId

    try {
      // Check step conditions
      if (!this.evaluateStepConditions(step.conditions)) {
        stepExecution.status = 'skipped'
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
    } catch (error) {
      stepExecution.status = 'failed'
      stepExecution.completedAt = Date.now()
      stepExecution.error = error instanceof Error ? error.message : 'Unknown error'

      // Retry logic
      if (step.retries > 0) {
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
      await this.simulateActionExecution(action)
    }
  }

  /**
   * Execute manual step actions (log for human operator)
   */
  private async executeManualStepActions(
    step: PlaybookStep,
    _execution: PlaybookExecution
  ): Promise<void> {
    // In a real implementation, this would create tasks for human operators
    // For now, we'll simulate manual execution
    await this.simulateManualExecution(step)
  }

  /**
   * Find applicable playbooks for a trigger
   */
  findApplicablePlaybooks(
    triggerType: string,
    context: PlaybookTriggerContext | SecurityEventContext | ComprehensiveSecurityContext
  ): Playbook[] {
    const applicable: Playbook[] = []

    // Normalize context to PlaybookTriggerContext
    let triggerContext: PlaybookTriggerContext

    if ('triggerId' in context) {
      // Already a PlaybookTriggerContext
      triggerContext = context as PlaybookTriggerContext
    } else if ('event' in context) {
      // ComprehensiveSecurityContext
      triggerContext = createPlaybookTriggerContext(context as ComprehensiveSecurityContext)
    } else {
      // SecurityEventContext - create comprehensive context first
      const securityEvent = context as SecurityEventContext
      const comprehensiveContext: ComprehensiveSecurityContext = {
        event: securityEvent,
        correlationId: `corr_${Date.now()}`,
        environment: 'production',
        timezone: 'UTC',
        processedAt: Date.now(),
        automationTriggered: false,
      }
      triggerContext = createPlaybookTriggerContext(comprehensiveContext)
    }

    for (const playbook of Array.from(this.playbooks.values())) {
      for (const trigger of playbook.triggers) {
        if (trigger.type === triggerType) {
          // Check if trigger conditions are met
          if (this.evaluatePlaybookTriggerConditions(trigger.conditions, triggerContext)) {
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
   * Evaluate playbook trigger conditions using Strategy pattern
   * Refactored to reduce cognitive complexity from 50+ to <15
   */
  private evaluatePlaybookTriggerConditions(
    conditions: string[],
    context: PlaybookTriggerContext
  ): boolean {
    for (const condition of conditions) {
      if (!this.evaluateSingleCondition(condition, context)) {
        return false
      }
    }
    return true
  }

  /**
   * Evaluate a single condition using strategy pattern handlers
   */
  private evaluateSingleCondition(condition: string, context: PlaybookTriggerContext): boolean {
    const eventContext = context.securityContext.event

    // Initialize condition handlers lazily
    const handlers: ConditionHandler[] = [
      new SeverityConditionHandler(eventContext),
      new ConfidenceConditionHandler(eventContext),
      new RiskScoreConditionHandler(eventContext),
      new EventTypeConditionHandler(eventContext),
      new BusinessImpactConditionHandler(eventContext),
      new AutomationLevelConditionHandler(context),
      new HistoricalDataConditionHandler(context),
      new AffectedSystemsConditionHandler(eventContext),
    ]

    // Find appropriate handler and evaluate
    for (const handler of handlers) {
      if (handler.canHandle(condition)) {
        return handler.evaluate(condition)
      }
    }

    // Default to true for unknown conditions (backward compatibility)
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
    await new Promise(resolve => setTimeout(resolve, step.timeout || 100))
  }

  /**
   * Initialize default playbooks
   */
  private initializeDefaultPlaybooks(): void {
    // Initialize each default playbook type
    this.playbooks.set('critical-incident-response', this.createCriticalIncidentResponsePlaybook())
    this.playbooks.set('automated-threat-hunting', this.createAutomatedThreatHuntingPlaybook())
    this.playbooks.set('vulnerability-management', this.createVulnerabilityManagementPlaybook())
  }

  /**
   * Create critical incident response playbook
   */
  private createCriticalIncidentResponsePlaybook(): Playbook {
    return {
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
          retries: 3,
          dependencies: [],
          outputs: ['detection_validated', 'initial_evidence_collected'],
        },
        {
          stepId: 'immediate-containment',
          name: 'Immediate Containment',
          description: 'Execute immediate containment actions',
          type: 'containment',
          automated: true,
          conditions: [],
          actions: ['isolate_system', 'block_ip', 'quarantine_user'],
          retries: 3,
          dependencies: ['detect-critical'],
          outputs: ['system_isolated', 'ip_blocked', 'user_quarantined'],
        },
        {
          stepId: 'stakeholder-notification',
          name: 'Notify Stakeholders',
          description: 'Notify relevant stakeholders immediately',
          type: 'notification',
          automated: true,
          conditions: [],
          actions: ['notify_stakeholders', 'escalate_incident'],
          retries: 3,
          dependencies: ['immediate-containment'],
          outputs: ['stakeholders_notified', 'incident_escalated'],
        },
      ],
      priority: 'critical',
      estimatedDuration: 30,
      requiredPermissions: ['incident_response', 'system_admin'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'soar_engine',
    }
  }

  /**
   * Create automated threat hunting playbook
   */
  private createAutomatedThreatHuntingPlaybook(): Playbook {
    return {
      playbookId: 'automated-threat-hunting',
      name: 'Automated Threat Hunting',
      description: 'Proactive threat hunting and analysis',
      version: '1.0.0',
      triggers: [
        {
          type: 'threat',
          conditions: ['confidence>0.7'],
        },
      ],
      steps: [
        {
          stepId: 'analyze-threat',
          name: 'Analyze Threat',
          description: 'Analyze threat indicators and patterns',
          type: 'analysis',
          automated: true,
          conditions: [],
          actions: ['analyze_indicators', 'correlate_events'],
          retries: 3,
          dependencies: [],
          outputs: ['threat_analyzed', 'indicators_correlated'],
        },
        {
          stepId: 'hunt-similar',
          name: 'Hunt Similar Threats',
          description: 'Search for similar threat patterns',
          type: 'detection',
          automated: true,
          conditions: [],
          actions: ['scan_network', 'check_compromised_accounts'],
          retries: 3,
          dependencies: ['analyze-threat'],
          outputs: ['similar_threats_found', 'network_scanned'],
        },
      ],
      priority: 'high',
      estimatedDuration: 45,
      requiredPermissions: ['threat_hunting', 'network_scan'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'soar_engine',
    }
  }

  /**
   * Create vulnerability management playbook
   */
  private createVulnerabilityManagementPlaybook(): Playbook {
    return {
      playbookId: 'vulnerability-management',
      name: 'Vulnerability Management',
      description: 'Automated vulnerability assessment and remediation',
      version: '1.0.0',
      triggers: [
        {
          type: 'vulnerability',
          conditions: ['severity=critical', 'severity=high'],
        },
      ],
      steps: [
        {
          stepId: 'assess-vulnerability',
          name: 'Assess Vulnerability',
          description: 'Assess vulnerability impact and exploitability',
          type: 'analysis',
          automated: true,
          conditions: [],
          actions: ['assess_impact', 'check_exploitability'],
          retries: 3,
          dependencies: [],
          outputs: ['impact_assessed', 'exploitability_checked'],
        },
        {
          stepId: 'patch-vulnerability',
          name: 'Patch Vulnerability',
          description: 'Apply security patches',
          type: 'eradication',
          automated: false,
          conditions: [],
          actions: ['patch_vulnerability', 'verify_patch'],
          retries: 3,
          dependencies: ['assess-vulnerability'],
          outputs: ['vulnerability_patched', 'patch_verified'],
        },
        {
          stepId: 'verify-fix',
          name: 'Verify Fix',
          description: 'Verify vulnerability has been remediated',
          type: 'verification',
          automated: true,
          conditions: [],
          actions: ['scan_vulnerability', 'verify_fix'],
          retries: 3,
          dependencies: ['patch-vulnerability'],
          outputs: ['vulnerability_verified', 'fix_confirmed'],
        },
      ],
      priority: 'high',
      estimatedDuration: 120,
      requiredPermissions: ['vulnerability_management', 'system_admin'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'soar_engine',
    }
  }

  getPlaybooks(): Playbook[] {
    return Array.from(this.playbooks.values())
  }

  getExecutions(): PlaybookExecution[] {
    return Array.from(this.executions.values())
  }

  clearExecutions(): void {
    this.executions.clear()
  }

  clearPlaybooks(): void {
    this.playbooks.clear()
  }
}
