/**
 * Error Recovery System
 * Provides recovery workflows and user guidance for different error scenarios
 */

import { signIn } from 'next-auth/react'
import { 
  ErrorClassification, 
  ErrorCategory, 
  RecoveryStrategy,
  ErrorClassifier 
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
 * Error recovery manager
 * Generates appropriate recovery workflows based on error classification
 */
export class ErrorRecoveryManager {
  /**
   * Get recovery workflow for an error
   */
  static getRecoveryWorkflow(
    error: unknown,
    context?: {
      retryAction?: () => Promise<void>
      fallbackAction?: () => void
      customActions?: RecoveryAction[]
    }
  ): RecoveryWorkflow {
    const classification = ErrorClassifier.classify(error)
    
    // Build workflow based on classification
    const workflow = this.buildWorkflow(classification, context)
    
    // Add custom actions if provided
    if (context?.customActions) {
      workflow.actions.push(...context.customActions)
    }
    
    return workflow
  }
  
  private static buildWorkflow(
    classification: ErrorClassification,
    context?: {
      retryAction?: () => Promise<void>
      fallbackAction?: () => void
    }
  ): RecoveryWorkflow {
    const workflows: Record<ErrorCategory, () => RecoveryWorkflow> = {
      // Network errors
      [ErrorCategory.NETWORK_TIMEOUT]: () => ({
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
      }),
      
      [ErrorCategory.NETWORK_UNAVAILABLE]: () => ({
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
      }),
      
      // Authentication errors
      [ErrorCategory.AUTH_EXPIRED]: () => ({
        title: 'Session Expired',
        description: 'Your session has expired. Please sign in again to continue.',
        actions: [
          {
            type: 'button',
            label: 'Sign In',
            description: 'Sign in to continue',
            action: () => { signIn('github') },
          },
        ],
        allowDismiss: false,
      }),
      
      [ErrorCategory.AUTH_INVALID]: () => ({
        title: 'Authentication Failed',
        description: 'We couldn\'t verify your credentials. Please try signing in again.',
        actions: [
          {
            type: 'button',
            label: 'Sign In Again',
            action: () => { signIn('github') },
          },
          {
            type: 'link',
            label: 'Get Help',
            href: '/help/authentication',
          },
        ],
        allowDismiss: false,
      }),
      
      // Rate limiting
      [ErrorCategory.RATE_LIMIT_EXCEEDED]: () => {
        const retryDelay = ErrorClassifier.getRetryDelay(classification, 1)
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
      },
      
      // GitHub API errors
      [ErrorCategory.GITHUB_API_ERROR]: () => ({
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
            description: 'Check GitHub\'s service status',
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
      }),
      
      // Service unavailable
      [ErrorCategory.SERVICE_UNAVAILABLE]: () => ({
        title: 'Service Temporarily Unavailable',
        description: 'Our service is temporarily down for maintenance. Please try again in a few minutes.',
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
      }),
      
      // Validation errors
      [ErrorCategory.VALIDATION_FAILED]: () => ({
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
      }),
      
      // Permission denied
      [ErrorCategory.PERMISSION_DENIED]: () => ({
        title: 'Access Denied',
        description: 'You don\'t have permission to perform this action.',
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
      }),
      
      // Resource not found
      [ErrorCategory.RESOURCE_NOT_FOUND]: () => ({
        title: 'Not Found',
        description: 'The requested resource could not be found.',
        actions: [
          {
            type: 'button',
            label: 'Go to Home',
            action: () => { window.location.href = '/' },
          },
          {
            type: 'link',
            label: 'Search',
            description: 'Search for what you\'re looking for',
            href: '/search',
          },
        ],
        allowDismiss: true,
      }),
      
      // Default workflow
      [ErrorCategory.INTERNAL_ERROR]: () => ({
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
      }),
      
      // Webhook validation
      [ErrorCategory.WEBHOOK_VALIDATION]: () => ({
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
      }),
      
      // Third party service errors
      [ErrorCategory.THIRD_PARTY_SERVICE]: () => ({
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
      }),
      
      // Add missing categories
      [ErrorCategory.DATA_INTEGRITY]: () => ({
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
      }),
      
      [ErrorCategory.BUSINESS_LOGIC]: () => ({
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
      }),
      
      [ErrorCategory.CONFIGURATION]: () => ({
        title: 'Configuration Error',
        description: 'There\'s an issue with the system configuration.',
        actions: [
          {
            type: 'link',
            label: 'Contact Admin',
            href: '/help/contact',
          },
        ],
        allowDismiss: false,
      }),
    }
    
    // Get workflow for category or use default
    const workflowBuilder = workflows[classification.category] || workflows[ErrorCategory.INTERNAL_ERROR]
    return workflowBuilder()
  }
  
  /**
   * Execute automatic recovery strategies
   */
  static async executeAutomaticRecovery(
    classification: ErrorClassification,
    context: {
      retryAction?: () => Promise<void>
      useCache?: () => void
      refreshAuth?: () => Promise<void>
    }
  ): Promise<boolean> {
    for (const strategy of classification.recoveryStrategies) {
      switch (strategy) {
        case RecoveryStrategy.USE_CACHE:
          if (context.useCache) {
            context.useCache()
            return true
          }
          break
          
        case RecoveryStrategy.REFRESH_AUTH:
          if (context.refreshAuth) {
            try {
              await context.refreshAuth()
              return true
            } catch {
              // Auth refresh failed
            }
          }
          break
          
        case RecoveryStrategy.RETRY_IMMEDIATE:
          if (context.retryAction) {
            try {
              await context.retryAction()
              return true
            } catch {
              // Retry failed
            }
          }
          break
      }
    }
    
    return false
  }
  
  /**
   * Format error for logging
   */
  static formatForLogging(error: unknown, classification: ErrorClassification): Record<string, unknown> {
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
}