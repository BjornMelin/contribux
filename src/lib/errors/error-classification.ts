/**
 * Error Classification System
 * Categorizes errors by type, severity, and recovery strategy
 */

// Error categories for structured handling
export enum ErrorCategory {
  // Network & External Service Errors
  NETWORK_TIMEOUT = 'network_timeout',
  NETWORK_UNAVAILABLE = 'network_unavailable',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  
  // Authentication & Authorization
  AUTH_EXPIRED = 'auth_expired',
  AUTH_INVALID = 'auth_invalid',
  PERMISSION_DENIED = 'permission_denied',
  
  // Data & Validation
  VALIDATION_FAILED = 'validation_failed',
  DATA_INTEGRITY = 'data_integrity',
  RESOURCE_NOT_FOUND = 'resource_not_found',
  
  // Application Errors
  BUSINESS_LOGIC = 'business_logic',
  CONFIGURATION = 'configuration',
  INTERNAL_ERROR = 'internal_error',
  
  // External API Errors
  GITHUB_API_ERROR = 'github_api_error',
  WEBHOOK_VALIDATION = 'webhook_validation',
  THIRD_PARTY_SERVICE = 'third_party_service',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',        // User can continue with minor inconvenience
  MEDIUM = 'medium',  // Feature degraded but app functional
  HIGH = 'high',      // Major feature unavailable
  CRITICAL = 'critical' // App functionality severely impacted
}

// Recovery strategies
export enum RecoveryStrategy {
  RETRY_IMMEDIATE = 'retry_immediate',
  RETRY_BACKOFF = 'retry_backoff',
  REFRESH_AUTH = 'refresh_auth',
  USE_CACHE = 'use_cache',
  FALLBACK_DEFAULT = 'fallback_default',
  USER_INTERVENTION = 'user_intervention',
  CIRCUIT_BREAK = 'circuit_break',
  GRACEFUL_DEGRADE = 'graceful_degrade',
  NO_RECOVERY = 'no_recovery',
}

// Error classification result
export interface ErrorClassification {
  category: ErrorCategory
  severity: ErrorSeverity
  isTransient: boolean
  recoveryStrategies: RecoveryStrategy[]
  userMessage: string
  technicalDetails?: string
  metadata?: Record<string, unknown>
}

/**
 * Classify errors based on type and context
 */
export class ErrorClassifier {
  static classify(error: unknown): ErrorClassification {
    // Handle SecurityError type
    if (this.isSecurityError(error)) {
      return this.classifySecurityError(error)
    }
    
    // Handle standard errors
    if (error instanceof Error) {
      return this.classifyByMessage(error)
    }
    
    // Handle HTTP response errors
    if (this.isHttpError(error)) {
      return this.classifyHttpError(error)
    }
    
    // Default classification
    return {
      category: ErrorCategory.INTERNAL_ERROR,
      severity: ErrorSeverity.HIGH,
      isTransient: false,
      recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
      userMessage: 'An unexpected error occurred. Please try again or contact support.',
      technicalDetails: String(error),
    }
  }
  
  private static isSecurityError(error: unknown): error is { type: string; statusCode: number } {
    return typeof error === 'object' && error !== null && 'type' in error
  }
  
  private static isHttpError(error: unknown): error is { status?: number; statusCode?: number } {
    return typeof error === 'object' && 
           error !== null && 
           ('status' in error || 'statusCode' in error)
  }
  
  private static classifySecurityError(error: any): ErrorClassification {
    const statusCode = error.statusCode || 500
    
    switch (error.type) {
      case 'authentication':
        return {
          category: ErrorCategory.AUTH_INVALID,
          severity: ErrorSeverity.HIGH,
          isTransient: false,
          recoveryStrategies: [RecoveryStrategy.REFRESH_AUTH, RecoveryStrategy.USER_INTERVENTION],
          userMessage: 'Authentication failed. Please sign in again.',
        }
        
      case 'rate_limit':
        return {
          category: ErrorCategory.RATE_LIMIT_EXCEEDED,
          severity: ErrorSeverity.MEDIUM,
          isTransient: true,
          recoveryStrategies: [RecoveryStrategy.RETRY_BACKOFF, RecoveryStrategy.CIRCUIT_BREAK],
          userMessage: 'Too many requests. Please wait a moment before trying again.',
        }
        
      case 'validation':
        return {
          category: ErrorCategory.VALIDATION_FAILED,
          severity: ErrorSeverity.LOW,
          isTransient: false,
          recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
          userMessage: 'Invalid input. Please check your data and try again.',
        }
        
      default:
        return {
          category: ErrorCategory.INTERNAL_ERROR,
          severity: ErrorSeverity.HIGH,
          isTransient: statusCode >= 500,
          recoveryStrategies: statusCode >= 500 
            ? [RecoveryStrategy.RETRY_BACKOFF, RecoveryStrategy.CIRCUIT_BREAK]
            : [RecoveryStrategy.USER_INTERVENTION],
          userMessage: 'A security error occurred. Please try again.',
        }
    }
  }
  
  private static classifyByMessage(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    // Network errors
    if (message.includes('fetch failed') || 
        message.includes('network') || 
        message.includes('econnrefused') ||
        message.includes('etimedout')) {
      return {
        category: ErrorCategory.NETWORK_UNAVAILABLE,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [
          RecoveryStrategy.RETRY_BACKOFF,
          RecoveryStrategy.USE_CACHE,
          RecoveryStrategy.GRACEFUL_DEGRADE
        ],
        userMessage: 'Network connection issue. Please check your internet connection.',
        technicalDetails: error.message,
      }
    }
    
    // GitHub API errors
    if (message.includes('github') || message.includes('octokit')) {
      return {
        category: ErrorCategory.GITHUB_API_ERROR,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [
          RecoveryStrategy.RETRY_BACKOFF,
          RecoveryStrategy.USE_CACHE,
          RecoveryStrategy.FALLBACK_DEFAULT
        ],
        userMessage: 'GitHub service is temporarily unavailable. Some features may be limited.',
        technicalDetails: error.message,
      }
    }
    
    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return {
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [
          RecoveryStrategy.RETRY_BACKOFF,
          RecoveryStrategy.CIRCUIT_BREAK,
          RecoveryStrategy.USE_CACHE
        ],
        userMessage: 'Request limit reached. Please wait a moment before trying again.',
        technicalDetails: error.message,
      }
    }
    
    // Authentication errors
    if (message.includes('unauthorized') || 
        message.includes('authentication') ||
        message.includes('token expired')) {
      return {
        category: ErrorCategory.AUTH_EXPIRED,
        severity: ErrorSeverity.HIGH,
        isTransient: false,
        recoveryStrategies: [RecoveryStrategy.REFRESH_AUTH],
        userMessage: 'Your session has expired. Please sign in again.',
        technicalDetails: error.message,
      }
    }
    
    // Default error classification
    return {
      category: ErrorCategory.INTERNAL_ERROR,
      severity: ErrorSeverity.HIGH,
      isTransient: false,
      recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
      userMessage: 'An error occurred. Please try again.',
      technicalDetails: error.message,
    }
  }
  
  private static classifyHttpError(error: any): ErrorClassification {
    const status = error.status || error.statusCode || 500
    
    // 4xx errors - client errors, generally not transient
    if (status >= 400 && status < 500) {
      switch (status) {
        case 401:
          return {
            category: ErrorCategory.AUTH_INVALID,
            severity: ErrorSeverity.HIGH,
            isTransient: false,
            recoveryStrategies: [RecoveryStrategy.REFRESH_AUTH],
            userMessage: 'Authentication required. Please sign in.',
          }
          
        case 403:
          return {
            category: ErrorCategory.PERMISSION_DENIED,
            severity: ErrorSeverity.HIGH,
            isTransient: false,
            recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
            userMessage: 'Access denied. You don\'t have permission to perform this action.',
          }
          
        case 404:
          return {
            category: ErrorCategory.RESOURCE_NOT_FOUND,
            severity: ErrorSeverity.MEDIUM,
            isTransient: false,
            recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
            userMessage: 'The requested resource was not found.',
          }
          
        case 429:
          return {
            category: ErrorCategory.RATE_LIMIT_EXCEEDED,
            severity: ErrorSeverity.MEDIUM,
            isTransient: true,
            recoveryStrategies: [RecoveryStrategy.RETRY_BACKOFF, RecoveryStrategy.CIRCUIT_BREAK],
            userMessage: 'Too many requests. Please slow down.',
          }
          
        default:
          return {
            category: ErrorCategory.VALIDATION_FAILED,
            severity: ErrorSeverity.MEDIUM,
            isTransient: false,
            recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
            userMessage: 'Invalid request. Please check your input.',
          }
      }
    }
    
    // 5xx errors - server errors, generally transient
    if (status >= 500) {
      return {
        category: ErrorCategory.SERVICE_UNAVAILABLE,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [
          RecoveryStrategy.RETRY_BACKOFF,
          RecoveryStrategy.CIRCUIT_BREAK,
          RecoveryStrategy.GRACEFUL_DEGRADE
        ],
        userMessage: 'Service temporarily unavailable. Please try again later.',
      }
    }
    
    // Default for unknown status codes
    return {
      category: ErrorCategory.INTERNAL_ERROR,
      severity: ErrorSeverity.HIGH,
      isTransient: false,
      recoveryStrategies: [RecoveryStrategy.USER_INTERVENTION],
      userMessage: 'An unexpected error occurred.',
    }
  }
  
  /**
   * Determine if an error should be retried
   */
  static shouldRetry(classification: ErrorClassification): boolean {
    return classification.isTransient && 
           (classification.recoveryStrategies.includes(RecoveryStrategy.RETRY_IMMEDIATE) ||
            classification.recoveryStrategies.includes(RecoveryStrategy.RETRY_BACKOFF))
  }
  
  /**
   * Get retry delay based on attempt number and classification
   */
  static getRetryDelay(classification: ErrorClassification, attempt: number): number {
    if (!this.shouldRetry(classification)) return 0
    
    // Base delays by category
    const baseDelays: Record<ErrorCategory, number> = {
      [ErrorCategory.NETWORK_TIMEOUT]: 1000,
      [ErrorCategory.NETWORK_UNAVAILABLE]: 2000,
      [ErrorCategory.SERVICE_UNAVAILABLE]: 3000,
      [ErrorCategory.RATE_LIMIT_EXCEEDED]: 5000,
      [ErrorCategory.GITHUB_API_ERROR]: 2000,
      // Default for other categories
      [ErrorCategory.AUTH_EXPIRED]: 0,
      [ErrorCategory.AUTH_INVALID]: 0,
      [ErrorCategory.PERMISSION_DENIED]: 0,
      [ErrorCategory.VALIDATION_FAILED]: 0,
      [ErrorCategory.DATA_INTEGRITY]: 0,
      [ErrorCategory.RESOURCE_NOT_FOUND]: 0,
      [ErrorCategory.BUSINESS_LOGIC]: 0,
      [ErrorCategory.CONFIGURATION]: 0,
      [ErrorCategory.INTERNAL_ERROR]: 1000,
      [ErrorCategory.WEBHOOK_VALIDATION]: 0,
      [ErrorCategory.THIRD_PARTY_SERVICE]: 2000,
    }
    
    const baseDelay = baseDelays[classification.category] || 1000
    
    // Exponential backoff with jitter
    const backoffDelay = baseDelay * Math.pow(2, attempt - 1)
    const jitter = Math.random() * 0.3 * backoffDelay // 30% jitter
    
    return Math.min(backoffDelay + jitter, 30000) // Max 30 seconds
  }
}