/**
 * SOAR Schema Definitions
 * Contains all Zod schemas and type definitions for SOAR components
 */

import { z } from 'zod'

// SOAR Configuration
export const SOARConfigSchema = z.object({
  automation: z
    .object({
      enableAutomatedResponse: z.boolean().default(true),
      enablePlaybookExecution: z.boolean().default(true),
      enableMLDecisionMaking: z.boolean().default(true),
      maxAutomationLevel: z.enum(['low', 'medium', 'high']).default('medium'),
    })
    .default({}),
  playbooks: z
    .object({
      enableIncidentContainment: z.boolean().default(true),
      enableThreatHunting: z.boolean().default(true),
      enableForensicCollection: z.boolean().default(true),
      enableRecoveryProcedures: z.boolean().default(true),
    })
    .default({}),
  notifications: z
    .object({
      enableSlackIntegration: z.boolean().default(false),
      enableEmailAlerts: z.boolean().default(true),
      enableSMSAlerts: z.boolean().default(false),
      enableWebhookNotifications: z.boolean().default(true),
    })
    .default({}),
  thresholds: z
    .object({
      criticalIncidentThreshold: z.number().min(0).max(1).default(0.9),
      automatedResponseThreshold: z.number().min(0).max(1).default(0.8),
      escalationThreshold: z.number().min(0).max(1).default(0.95),
    })
    .default({}),
})

export type SOARConfig = z.infer<typeof SOARConfigSchema>

// Playbook schemas
export const PlaybookStepSchema = z.object({
  stepId: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum([
    'detection',
    'analysis',
    'containment',
    'eradication',
    'recovery',
    'notification',
    'documentation',
    'verification',
  ]),
  automated: z.boolean(),
  conditions: z.array(z.string()),
  actions: z.array(z.string()),
  timeout: z.number().optional(),
  retries: z.number().default(3),
  dependencies: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
})

export const PlaybookSchema = z.object({
  playbookId: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  triggers: z.array(
    z.object({
      type: z.enum(['incident', 'threat', 'vulnerability', 'manual']),
      conditions: z.array(z.string()),
    })
  ),
  steps: z.array(PlaybookStepSchema),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedDuration: z.number(), // minutes
  requiredPermissions: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string(),
  approvedBy: z.string().optional(),
})

export const PlaybookExecutionSchema = z.object({
  executionId: z.string(),
  playbookId: z.string(),
  triggeredBy: z.object({
    type: z.enum(['incident', 'threat', 'vulnerability', 'manual']),
    id: z.string(),
  }),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  currentStep: z.string().optional(),
  executedSteps: z.array(
    z.object({
      stepId: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
      startedAt: z.number(),
      completedAt: z.number().optional(),
      output: z.string().optional(),
      error: z.string().optional(),
    })
  ),
  results: z.object({
    containmentSuccessful: z.boolean().optional(),
    threatNeutralized: z.boolean().optional(),
    systemsRestored: z.boolean().optional(),
    evidenceCollected: z.array(z.string()).optional(),
  }),
  metrics: z.object({
    totalDuration: z.number().optional(),
    automatedSteps: z.number(),
    manualSteps: z.number(),
    successRate: z.number().optional(),
  }),
})

export type Playbook = z.infer<typeof PlaybookSchema>
export type PlaybookStep = z.infer<typeof PlaybookStepSchema>
export type PlaybookExecution = z.infer<typeof PlaybookExecutionSchema>

// Response Action schemas
export const ResponseActionSchema = z.object({
  actionId: z.string(),
  type: z.enum([
    'block_ip',
    'quarantine_user',
    'disable_account',
    'isolate_system',
    'collect_evidence',
    'patch_vulnerability',
    'rotate_credentials',
    'notify_stakeholders',
    'escalate_incident',
    'create_ticket',
    // Additional action types for playbook steps
    'validate_detection',
    'collect_initial_evidence',
    'analyze_indicators',
    'correlate_events',
    'scan_network',
    'check_compromised_accounts',
    'assess_impact',
    'check_exploitability',
    'verify_patch',
    'scan_vulnerability',
    'verify_fix',
    'preserve_logs',
    'restore_systems',
    'verify_integrity',
  ]),
  target: z.string(),
  parameters: z.record(z.unknown()),
  automated: z.boolean(),
  executedAt: z.number(),
  executedBy: z.string(),
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
})

export type ResponseAction = z.infer<typeof ResponseActionSchema>
