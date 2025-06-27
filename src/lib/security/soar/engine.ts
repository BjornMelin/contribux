/**
 * SOAR Engine
 * Main orchestration engine for Security Orchestration, Automation and Response
 */

import type { SecurityIncident, ThreatDetection, Vulnerability } from '../automated-scanner'
import type { SecurityEventContext } from '../schemas'
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
  }

  /**
   * Stop SOAR engine
   */
  async stop(): Promise<void> {
    this.isRunning = false
  }

  /**
   * Process security incident with automated response
   */
  async processIncident(incident: SecurityIncident): Promise<PlaybookExecution[]> {
    if (!this.isRunning) {
      throw new Error('SOAR engine is not running')
    }

    const executions: PlaybookExecution[] = []
    // Convert SecurityIncident to SecurityEventContext
    const securityEventContext = this.convertIncidentToSecurityEvent(incident)
    const applicablePlaybooks = this.playbookManager.findApplicablePlaybooks(
      'incident',
      securityEventContext
    )

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

    const executions: PlaybookExecution[] = []
    // Convert ThreatDetection to SecurityEventContext
    const securityEventContext = this.convertThreatToSecurityEvent(threat)
    const applicablePlaybooks = this.playbookManager.findApplicablePlaybooks(
      'threat',
      securityEventContext
    )

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

    const executions: PlaybookExecution[] = []
    // Convert Vulnerability to SecurityEventContext
    const securityEventContext = this.convertVulnerabilityToSecurityEvent(vulnerability)
    const applicablePlaybooks = this.playbookManager.findApplicablePlaybooks(
      'vulnerability',
      securityEventContext
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
    const actions = ['escalate_incident', 'notify_stakeholders', 'collect_evidence']

    for (const action of actions) {
      await this.responseActionsManager.executeResponseAction(action, incident.incidentId, true)
    }
  }

  /**
   * Execute immediate threat response
   */
  private async executeImmediateThreatResponse(threat: ThreatDetection): Promise<void> {
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
   * Convert SecurityIncident to SecurityEventContext
   */
  private convertIncidentToSecurityEvent(incident: SecurityIncident): SecurityEventContext {
    return {
      eventId: incident.incidentId,
      timestamp: incident.createdAt,
      source: 'soar_engine',
      type: incident.type === 'security_breach' ? 'incident' : 'incident',
      severity: incident.severity,
      confidence: 0.9, // Default confidence for incidents
      riskScore:
        incident.severity === 'critical'
          ? 95
          : incident.severity === 'high'
            ? 80
            : incident.severity === 'medium'
              ? 60
              : 30,
      affectedSystems: incident.affectedSystems,
      affectedUsers: [],
      affectedAssets: incident.affectedSystems,
      indicators: [],
      evidenceFiles: [],
      relatedEvents: [],
      businessImpact:
        incident.severity === 'critical'
          ? 'critical'
          : incident.severity === 'high'
            ? 'high'
            : 'medium',
      affectedServices: incident.affectedSystems,
      complianceFrameworks: [],
      metadata: {},
    }
  }

  /**
   * Convert ThreatDetection to SecurityEventContext
   */
  private convertThreatToSecurityEvent(threat: ThreatDetection): SecurityEventContext {
    return {
      eventId: threat.threatId,
      timestamp: threat.detectedAt,
      source: threat.source.ip,
      type: 'threat',
      severity: threat.severity,
      confidence: threat.confidence,
      riskScore: threat.mlScore ? threat.mlScore * 100 : threat.severity === 'critical' ? 95 : 80,
      affectedSystems: [threat.target.endpoint],
      affectedUsers: [],
      affectedAssets: [threat.target.endpoint],
      sourceIp: threat.source.ip,
      endpoint: threat.target.endpoint,
      method: threat.target.method as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'DELETE'
        | 'PATCH'
        | 'OPTIONS'
        | 'HEAD'
        | undefined,
      userAgent: threat.source.userAgent,
      geolocation: {
        country: threat.source.location?.country,
        region: threat.source.location?.region,
        city: threat.source.location?.city,
      },
      detectionMethod: 'machine_learning',
      indicators: threat.indicators,
      evidenceFiles: [],
      relatedEvents: [],
      businessImpact: threat.severity === 'critical' ? 'critical' : 'medium',
      affectedServices: [threat.target.endpoint],
      complianceFrameworks: [],
      metadata: {
        threatType: threat.type,
        mlScore: threat.mlScore,
        blocked: threat.blocked,
      },
    }
  }

  /**
   * Convert Vulnerability to SecurityEventContext
   */
  private convertVulnerabilityToSecurityEvent(vulnerability: Vulnerability): SecurityEventContext {
    return {
      eventId: vulnerability.id,
      timestamp: vulnerability.detectedAt,
      source: 'vulnerability_scanner',
      type: 'vulnerability',
      severity: vulnerability.severity,
      confidence: vulnerability.confidence,
      riskScore:
        vulnerability.severity === 'critical' ? 95 : vulnerability.severity === 'high' ? 80 : 60,
      affectedSystems: vulnerability.location.file ? [vulnerability.location.file] : [],
      affectedUsers: [],
      affectedAssets: vulnerability.location.file ? [vulnerability.location.file] : [],
      endpoint: vulnerability.location.endpoint,
      detectionMethod: 'signature_based',
      indicators: [],
      evidenceFiles: vulnerability.evidence,
      relatedEvents: [],
      businessImpact: vulnerability.severity === 'critical' ? 'critical' : 'medium',
      affectedServices: vulnerability.location.endpoint ? [vulnerability.location.endpoint] : [],
      complianceFrameworks: [],
      metadata: {
        vulnerabilityType: vulnerability.type,
        title: vulnerability.title,
        description: vulnerability.description,
        location: vulnerability.location,
        impact: vulnerability.impact,
        recommendation: vulnerability.recommendation,
        mitigated: vulnerability.mitigated,
      },
    }
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
   * Execute a specific playbook by reference
   */
  async executePlaybook(
    playbook: import('./schemas').Playbook,
    trigger: { type: string; id: string }
  ): Promise<import('./schemas').PlaybookExecution> {
    return this.playbookManager.executePlaybook(playbook, trigger)
  }

  /**
   * Execute a response action
   */
  async executeResponseAction(
    actionType: string,
    target: string,
    automated: boolean
  ): Promise<import('./schemas').ResponseAction> {
    return this.responseActionsManager.executeResponseAction(actionType, target, automated)
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    await this.stop()
    this.responseActionsManager.clearResponseActions()
    this.playbookManager.clearExecutions()
    this.playbookManager.clearPlaybooks()
  }
}
