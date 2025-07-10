/**
 * Error Recovery System
 * Provides recovery workflows and user guidance for different error scenarios
 */

import { signIn } from 'next-auth/react'
import {
  classifyError,
  ErrorCategory,
  type ErrorClassification,
  RecoveryStrategy,
} from './error-classification'

// Recovery action types
export interface RecoveryAction {
  type: 'button' | 'link' | 'info' | 'automatic'
  label: string
  description?: string
  action?: () => void | Promise<void>
  href?: string
  automatic?: boolean
  delay?: number
}

// Recovery workflow definition
export interface RecoveryWorkflow {
  title: string
  description: string
  actions: RecoveryAction[]
  showTechnicalDetails?: boolean
  allowDismiss?: boolean
}

/**
 * Calculate retry delay based on error classification and attempt number
 */
function getRetryDelay(_classification: ErrorClassification, attempt: number): number {
  // Base delay of 5 seconds, with exponential backoff
  const baseDelay = 5000
  const maxDelay = 60000 // Max 1 minute

  const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay)
  return delay
}

/**
 * Get recovery workflow for an error
 */
export function getRecoveryWorkflow(
  error: unknown,
  context?: {
    retryAction?: () => Promise<void>
    fallbackAction?: () => void
    customActions?: RecoveryAction[]
  }
): RecoveryWorkflow {
  const classification = classifyError(error)

  // Build workflow based on classification
  const workflow = buildWorkflow(classification, context)

  // Add custom actions if provided
  if (context?.customActions) {
    workflow.actions.push(...context.customActions)
  }

  return workflow
}

function buildWorkflow(
  classification: ErrorClassification,
  context?: {
    retryAction?: () => Promise<void>
    fallbackAction?: () => void
  }
): RecoveryWorkflow {
  const workflowBuilder = getWorkflowBuilder(classification.category)
  return workflowBuilder(classification, context)
}

function getWorkflowBuilder(
  category: ErrorCategory
): (
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
) => RecoveryWorkflow {
  const builders = {
    [ErrorCategory.NETWORK_TIMEOUT]: buildNetworkTimeoutWorkflow,
    [ErrorCategory.NETWORK_UNAVAILABLE]: buildNetworkUnavailableWorkflow,
    [ErrorCategory.AUTH_EXPIRED]: buildAuthExpiredWorkflow,
    [ErrorCategory.AUTH_INVALID]: buildAuthInvalidWorkflow,
    [ErrorCategory.RATE_LIMIT_EXCEEDED]: buildRateLimitWorkflow,
    [ErrorCategory.GITHUB_API_ERROR]: buildGithubApiWorkflow,
    [ErrorCategory.SERVICE_UNAVAILABLE]: buildServiceUnavailableWorkflow,
    [ErrorCategory.VALIDATION_FAILED]: buildValidationFailedWorkflow,
    [ErrorCategory.PERMISSION_DENIED]: buildPermissionDeniedWorkflow,
    [ErrorCategory.RESOURCE_NOT_FOUND]: buildResourceNotFoundWorkflow,
    [ErrorCategory.WEBHOOK_VALIDATION]: buildWebhookValidationWorkflow,
    [ErrorCategory.THIRD_PARTY_SERVICE]: buildThirdPartyServiceWorkflow,
    [ErrorCategory.DATA_INTEGRITY]: buildDataIntegrityWorkflow,
    [ErrorCategory.BUSINESS_LOGIC]: buildBusinessLogicWorkflow,
    [ErrorCategory.CONFIGURATION]: buildConfigurationWorkflow,
    [ErrorCategory.INTERNAL_ERROR]: buildInternalErrorWorkflow,
    [ErrorCategory.DATABASE_CONNECTION]: buildDatabaseConnectionWorkflow,
    [ErrorCategory.DATABASE_TRANSACTION]: buildDatabaseTransactionWorkflow,
    [ErrorCategory.DATABASE_QUERY]: buildDatabaseQueryWorkflow,
  }

  return builders[category] || builders[ErrorCategory.INTERNAL_ERROR]
}

function buildNetworkTimeoutWorkflow(
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Connection Timeout',
    description: classification.userMessage,
    actions: [
      {
        type: 'button',
        label: 'Retry',
        description: 'Try the request again',
        action: context?.retryAction,
      },
      {
        type: 'link',
        label: 'Check Status',
        description: 'View system status',
        href: '/status',
      },
    ],
    allowDismiss: true,
  }
}

function buildNetworkUnavailableWorkflow(
  _classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Connection Error',
    description: 'Unable to connect to our servers. Please check your internet connection.',
    actions: [
      {
        type: 'button',
        label: 'Try Again',
        action: context?.retryAction,
      },
      {
        type: 'info',
        label: 'Offline Mode',
        description: 'Some features are available offline',
      },
    ],
    allowDismiss: false,
  }
}

function buildAuthExpiredWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again to continue.',
    actions: [
      {
        type: 'button',
        label: 'Sign In',
        description: 'Sign in to continue',
        action: () => {
          signIn('github')
        },
      },
    ],
    allowDismiss: false,
  }
}

function buildAuthInvalidWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Authentication Failed',
    description: "We couldn't verify your credentials. Please try signing in again.",
    actions: [
      {
        type: 'button',
        label: 'Sign In Again',
        action: () => {
          signIn('github')
        },
      },
      {
        type: 'link',
        label: 'Get Help',
        href: '/help/authentication',
      },
    ],
    allowDismiss: false,
  }
}

function buildRateLimitWorkflow(
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  const retryDelay = getRetryDelay(classification, 1)
  return {
    title: 'Rate Limit Reached',
    description: `You've made too many requests. Please wait ${Math.ceil(retryDelay / 1000)} seconds before trying again.`,
    actions: [
      {
        type: 'automatic',
        label: 'Auto-retry',
        description: `Will retry in ${Math.ceil(retryDelay / 1000)} seconds`,
        automatic: true,
        delay: retryDelay,
        action: context?.retryAction,
      },
      {
        type: 'info',
        label: 'Why this happens',
        description: 'We limit requests to ensure service quality for all users',
      },
    ],
    allowDismiss: true,
  }
}

function buildGithubApiWorkflow(
  _classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'GitHub Service Issue',
    description: 'GitHub is experiencing issues. Some features may be limited.',
    actions: [
      {
        type: 'button',
        label: 'Use Cached Data',
        description: 'View previously loaded information',
        action: context?.fallbackAction,
      },
      {
        type: 'link',
        label: 'GitHub Status',
        description: "Check GitHub's service status",
        href: 'https://www.githubstatus.com',
      },
      {
        type: 'button',
        label: 'Retry',
        action: context?.retryAction,
      },
    ],
    allowDismiss: true,
    showTechnicalDetails: true,
  }
}

function buildServiceUnavailableWorkflow(
  _classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Service Temporarily Unavailable',
    description:
      'Our service is temporarily down for maintenance. Please try again in a few minutes.',
    actions: [
      {
        type: 'automatic',
        label: 'Auto-retry',
        description: 'Will retry automatically',
        automatic: true,
        delay: 5000,
        action: context?.retryAction,
      },
      {
        type: 'link',
        label: 'Status Page',
        href: '/status',
      },
    ],
    allowDismiss: false,
  }
}

function buildValidationFailedWorkflow(
  classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Invalid Input',
    description: classification.userMessage,
    actions: [
      {
        type: 'info',
        label: 'Review Input',
        description: 'Check your input and try again',
      },
    ],
    allowDismiss: true,
    showTechnicalDetails: true,
  }
}

function buildPermissionDeniedWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Access Denied',
    description: "You don't have permission to perform this action.",
    actions: [
      {
        type: 'link',
        label: 'Request Access',
        description: 'Contact an administrator',
        href: '/help/permissions',
      },
      {
        type: 'button',
        label: 'Go Back',
        action: () => window.history.back(),
      },
    ],
    allowDismiss: true,
  }
}

function buildResourceNotFoundWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Not Found',
    description: 'The requested resource could not be found.',
    actions: [
      {
        type: 'button',
        label: 'Go to Home',
        action: () => {
          window.location.href = '/'
        },
      },
      {
        type: 'link',
        label: 'Search',
        description: "Search for what you're looking for",
        href: '/search',
      },
    ],
    allowDismiss: true,
  }
}

function buildWebhookValidationWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Webhook Validation Failed',
    description: 'The webhook signature could not be verified.',
    actions: [
      {
        type: 'info',
        label: 'Security Notice',
        description: 'This request was blocked for security reasons',
      },
      {
        type: 'link',
        label: 'Webhook Setup Guide',
        href: '/docs/webhooks',
      },
    ],
    allowDismiss: true,
    showTechnicalDetails: true,
  }
}

function buildThirdPartyServiceWorkflow(
  _classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'External Service Error',
    description: 'An external service is not responding correctly.',
    actions: [
      {
        type: 'button',
        label: 'Try Alternative',
        description: 'Use fallback service',
        action: context?.fallbackAction,
      },
      {
        type: 'button',
        label: 'Retry',
        action: context?.retryAction,
      },
    ],
    allowDismiss: true,
  }
}

function buildDataIntegrityWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Data Error',
    description: 'There was an issue with the data. Please try again.',
    actions: [
      {
        type: 'button',
        label: 'Refresh',
        action: () => window.location.reload(),
      },
    ],
    allowDismiss: true,
  }
}

function buildBusinessLogicWorkflow(
  classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Operation Failed',
    description: classification.userMessage,
    actions: [
      {
        type: 'info',
        label: 'What to do',
        description: 'Please check the requirements and try again',
      },
    ],
    allowDismiss: true,
  }
}

function buildConfigurationWorkflow(
  _classification: ErrorClassification,
  _context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Configuration Error',
    description: "There's an issue with the system configuration.",
    actions: [
      {
        type: 'link',
        label: 'Contact Admin',
        href: '/help/contact',
      },
    ],
    allowDismiss: false,
  }
}

function buildInternalErrorWorkflow(
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Something Went Wrong',
    description: classification.userMessage,
    actions: [
      {
        type: 'button',
        label: 'Try Again',
        action: context?.retryAction || (() => window.location.reload()),
      },
      {
        type: 'link',
        label: 'Contact Support',
        href: '/help/contact',
      },
    ],
    allowDismiss: true,
    showTechnicalDetails: true,
  }
}

/**
 * Execute USE_CACHE recovery strategy
 */
async function executeUseCacheStrategy(context: {
  fallbackToCache?: () => void
}): Promise<boolean> {
  if (context.fallbackToCache) {
    context.fallbackToCache()
    return true
  }
  return false
}

/**
 * Execute REFRESH_AUTH recovery strategy
 */
async function executeRefreshAuthStrategy(context: {
  refreshAuth?: () => Promise<void>
}): Promise<boolean> {
  if (context.refreshAuth) {
    try {
      await context.refreshAuth()
      return true
    } catch {
      // Auth refresh failed
      return false
    }
  }
  return false
}

/**
 * Execute RETRY_IMMEDIATE recovery strategy
 */
async function executeRetryImmediateStrategy(context: {
  retryAction?: () => Promise<void>
}): Promise<boolean> {
  if (context.retryAction) {
    try {
      await context.retryAction()
      return true
    } catch {
      // Retry failed
      return false
    }
  }
  return false
}

/**
 * Execute automatic recovery strategies
 */
export async function executeAutomaticRecovery(
  classification: ErrorClassification,
  context: {
    retryAction?: () => Promise<void>
    fallbackToCache?: () => void
    refreshAuth?: () => Promise<void>
  }
): Promise<boolean> {
  for (const strategy of classification.recoveryStrategies) {
    let recovered = false

    switch (strategy) {
      case RecoveryStrategy.USE_CACHE:
        recovered = await executeUseCacheStrategy(context)
        break

      case RecoveryStrategy.REFRESH_AUTH:
        recovered = await executeRefreshAuthStrategy(context)
        break

      case RecoveryStrategy.RETRY_IMMEDIATE:
        recovered = await executeRetryImmediateStrategy(context)
        break

      default:
        continue
    }

    if (recovered) {
      return true
    }
  }

  return false
}

/**
 * Format error for logging
 */
export function formatForLogging(
  error: unknown,
  classification: ErrorClassification
): Record<string, unknown> {
  const baseInfo = {
    category: classification.category,
    severity: classification.severity,
    isTransient: classification.isTransient,
    recoveryStrategies: classification.recoveryStrategies,
    userMessage: classification.userMessage,
    timestamp: new Date().toISOString(),
  }

  if (error instanceof Error) {
    return {
      ...baseInfo,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    }
  }

  return {
    ...baseInfo,
    error: String(error),
  }
}

/**
 * Database Connection Error Workflow
 */
function buildDatabaseConnectionWorkflow(
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Database Connection Issue',
    description: classification.userMessage,
    actions: [
      {
        type: 'button',
        label: 'Retry Connection',
        action: async () => {
          if (context?.retryAction) {
            await context.retryAction()
          }
        },
      },
      {
        type: 'button',
        label: 'Use Cached Data',
        action: () => {
          if (context?.fallbackAction) {
            context.fallbackAction()
          }
        },
      },
    ],
  }
}

/**
 * Database Transaction Error Workflow
 */
function buildDatabaseTransactionWorkflow(
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Database Transaction Error',
    description: classification.userMessage,
    actions: [
      {
        type: 'button',
        label: 'Retry Transaction',
        action: async () => {
          if (context?.retryAction) {
            await context.retryAction()
          }
        },
      },
      {
        type: 'button',
        label: 'Cancel',
        action: () => {
          if (context?.fallbackAction) {
            context.fallbackAction()
          }
        },
      },
    ],
  }
}

/**
 * Database Query Error Workflow
 */
function buildDatabaseQueryWorkflow(
  classification: ErrorClassification,
  context?: { retryAction?: () => Promise<void>; fallbackAction?: () => void }
): RecoveryWorkflow {
  return {
    title: 'Database Query Error',
    description: classification.userMessage,
    actions: [
      {
        type: 'button',
        label: 'Retry Query',
        action: async () => {
          if (context?.retryAction) {
            await context.retryAction()
          }
        },
      },
      {
        type: 'button',
        label: 'Try Alternative Query',
        action: () => {
          if (context?.fallbackAction) {
            context.fallbackAction()
          }
        },
      },
    ],
  }
}

/**
 * @deprecated Use individual functions instead: getRecoveryWorkflow, executeAutomaticRecovery, formatForLogging
 * Legacy exports for backward compatibility
 */
export const ErrorRecoveryManager = {
  getRecoveryWorkflow,
  executeAutomaticRecovery,
  formatForLogging,
} as const
