/**
 * GDPR Compliance 2.0 Implementation
 * Enhanced privacy-by-design architecture with automated compliance workflows
 *
 * This module provides a modular approach to GDPR compliance with focused sub-modules:
 * - constants: Type definitions and constants
 * - consent: Consent management and validation
 * - processing: Data processing logging
 * - data-export: Data portability and export
 * - data-deletion: Right to erasure and retention
 * - compliance: Compliance monitoring and reporting
 * - validation: Data minimization and rectification
 */

export * from './compliance'
// Re-export all functions
export * from './consent'
// Re-export all types and constants
export * from './constants'
export * from './data-deletion'
export * from './data-export'
export * from './processing'
export * from './types'
export * from './validation'
