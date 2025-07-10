/**
 * Production-Ready Logging Service
 * Enhanced with Pino structured logging for high-performance production debugging
 * Addresses OWASP A05 Security Misconfiguration
 */

import {
  compatibilityLogger as logger,
  compatibilitySecurityLogger as securityLogger,
} from '@/lib/logging'

// Re-export types for backward compatibility
export type { LogContext, SecurityEventContext } from '@/lib/logging'

// Export the enhanced logger as default
export default logger
export { logger, securityLogger }
