/**
 * SOAR (Security Orchestration, Automation and Response) Module
 * Implements automated incident response playbooks, security orchestration,
 * and intelligent response automation
 *
 * This module provides a modular approach to SOAR with focused sub-modules:
 * - schemas: Type definitions and Zod schemas
 * - engine: Main SOAR orchestration engine
 * - playbooks: Playbook management and execution
 * - response-actions: Automated response actions
 */

// Re-export main engine and managers
export { SOAREngine } from './engine'
export { PlaybookManager } from './playbooks'
export { ResponseActionsManager } from './response-actions'
// Re-export all types and schemas
export * from './schemas'

// Import the engine and schemas
import { SOAREngine } from './engine'
import type { SOARConfig } from './schemas'

// Factory function to create SOAR engine
export function createSOAREngine(config?: Partial<SOARConfig>) {
  return new SOAREngine(config)
}
