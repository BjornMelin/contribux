/**
 * Enhanced monitoring logger with Pino structured logging
 * Following KISS principles with high-performance structured logging
 */

import { compatibilityMonitoringLogger as logger } from '@/lib/logging'

// Re-export types for backward compatibility
export type { LogContext } from '@/lib/logging'

// Export the enhanced logger
export { logger }
