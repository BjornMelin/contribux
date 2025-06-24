/**
 * SOAR Engine
 * Main orchestration engine for Security Orchestration, Automation and Response
 */

import type { SecurityIncident, ThreatDetection, Vulnerability } from '../automated-scanner'
import { PlaybookManager } from './playbooks'
import { ResponseActionsManager } from './response-actions'
import { type PlaybookExecution, type SOARConfig, SOARConfigSchema } from './schemas'

export class SOAREngine {
  private config: SOARConfig
  private playbookManager: PlaybookManager
  private responseActionsManager: ResponseActionsManager
  private isRunning = false

  constructor(config: Partial<SOARConfig> = {}) {
    this.config = SOARConfigSchema.parse(config)
    this.playbookManager = new PlaybookManager(this.config)
    this.responseActionsManager = new ResponseActionsManager()
  }

  /**
   * Start SOAR engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('SOAR engine is already running')
    }

    this.isRunning = true
    console.log('🤖 SOAR engine started')
  }

  /**
   * Stop SOAR engine
   */
  async stop(): Promise<void> {
    this.isRunning = false
    console.log('🛑 SOAR engine stopped')
  }

  /**
   * Process security incident with automated response
   */
  async processIncident(incident: SecurityIncident): Promise<PlaybookExecution[]> {
    if (!this.isRunning) {
      throw new Error('SOAR engine is not running')
    }

    console.log(`🚨 Processing security incident: ${incident.incidentId}`)

    const executions: PlaybookExecution[] = []
    const applicablePlaybooks = this.playbookManager.findApplicablePlaybooks('incident', incident)

    for (const playbook of applicablePlaybooks) {
      const execution = await this.playbookManager.executePlaybook(playbook, {
        type: 'incident',
        id: incident.incidentId,
      })
      executions.push(execution)
    }

    // Execute automated response actions based on incident severity
    if (incident.severity === 'critical' && this.config.automation.enableAutomatedResponse) {
      await this.executeCriticalIncidentResponse(incident)
    }

    return executions
  }

  /**
   * Process threat detection with automated response
   */
  async processThreat(threat: ThreatDetection): Promise<PlaybookExecution[]> {
    if (!this.isRunning) {
      throw new Error('SOAR engine is not running')
    }

    console.log(`🎯 Processing threat detection: ${threat.threatId}`)

    const executions: PlaybookExecution[] = []
    const applicablePlaybooks = this.playbookManager.findApplicablePlaybooks('threat', threat)

    for (const playbook of applicablePlaybooks) {
      const execution = await this.playbookManager.executePlaybook(playbook, {
        type: 'threat',
        id: threat.threatId,
      })
      executions.push(execution)
    }

    // Execute immediate threat response actions
    if (
      threat.severity === 'critical' ||
      threat.confidence >= this.config.thresholds.automatedResponseThreshold
    ) {
      await this.executeImmediateThreatResponse(threat)
    }

    return executions
  }

  /**
   * Process vulnerability with automated remediation
   */
  async processVulnerability(vulnerability: Vulnerability): Promise<PlaybookExecution[]> {
    if (!this.isRunning) {
      throw new Error('SOAR engine is not running')
    }

    console.log(`🔍 Processing vulnerability: ${vulnerability.id}`)

    const executions: PlaybookExecution[] = []
    const applicablePlaybooks = this.playbookManager.findApplicablePlaybooks(
      'vulnerability',
      vulnerability
    )

    for (const playbook of applicablePlaybooks) {
      const execution = await this.playbookManager.executePlaybook(playbook, {
        type: 'vulnerability',
        id: vulnerability.id,
      })
      executions.push(execution)
    }

    return executions
  }

  /**
   * Execute critical incident response
   */
  private async executeCriticalIncidentResponse(incident: SecurityIncident): Promise<void> {
    console.log(`🚨 Executing critical incident response for: ${incident.incidentId}`)

    const actions = ['escalate_incident', 'notify_stakeholders', 'collect_evidence']

    for (const action of actions) {
      await this.responseActionsManager.executeResponseAction(action, incident.incidentId, true)
    }
  }

  /**
   * Execute immediate threat response
   */
  private async executeImmediateThreatResponse(threat: ThreatDetection): Promise<void> {
    console.log(`⚡ Executing immediate threat response for: ${threat.threatId}`)

    const actions: string[] = []

    // Determine response actions based on threat type
    switch (threat.type) {
      case 'brute_force':
      case 'rate_limit_abuse':
        actions.push('block_ip')
        break
      case 'sql_injection_attempt':
      case 'xss_attempt':
        actions.push('block_ip', 'collect_evidence')
        break
      case 'privilege_escalation':
        actions.push('quarantine_user', 'collect_evidence', 'escalate_incident')
        break
      default:
        actions.push('collect_evidence')
    }

    for (const action of actions) {
      await this.responseActionsManager.executeResponseAction(action, threat.source.ip, true)
    }
  }

  /**
   * Get SOAR metrics
   */
  getSOARMetrics() {
    const executions = this.playbookManager.getExecutions()
    const actions = this.responseActionsManager.getResponseActions()

    return {
      playbooks: {
        total: this.playbookManager.getPlaybooks().length,
        executions: executions.length,
        successful: executions.filter(e => e.status === 'completed').length,
        failed: executions.filter(e => e.status === 'failed').length,
        running: executions.filter(e => e.status === 'running').length,
      },
      actions: {
        total: actions.length,
        successful: actions.filter(a => a.success).length,
        failed: actions.filter(a => !a.success).length,
        automated: actions.filter(a => a.automated).length,
        manual: actions.filter(a => !a.automated).length,
      },
      automation: {
        isRunning: this.isRunning,
        level: this.config.automation.maxAutomationLevel,
        enabled: this.config.automation.enableAutomatedResponse,
      },
    }
  }

  /**
   * Get all playbooks
   */
  getPlaybooks() {
    return this.playbookManager.getPlaybooks()
  }

  /**
   * Get all executions
   */
  getExecutions() {
    return this.playbookManager.getExecutions()
  }

  /**
   * Get all response actions
   */
  getResponseActions() {
    return this.responseActionsManager.getResponseActions()
  }

  /**
   * Clear response actions (for testing)
   */
  clearResponseActions(): void {
    this.responseActionsManager.clearResponseActions()
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    await this.stop()
    this.responseActionsManager.clearResponseActions()
  }
}
