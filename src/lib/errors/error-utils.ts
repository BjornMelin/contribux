/**
 * Error Utilities for Contribux Application
 * Helper functions for common error scenarios with enhanced messaging
 */

import type { NextRequest } from 'next/server'
import { ErrorHandler, type EnhancedError } from './enhanced-error-handler'

/**
 * Environment validation error with detailed context
 */
export function createEnvironmentError(missingVars: string[], endpoint?: string): EnhancedError {
  return ErrorHandler.createError(
    'ENVIRONMENT_ERROR',
    'Application configuration error. Please contact support.',
    'configuration',
    'critical',
    {
      context: { missingVariables: missingVars },
      endpoint,
      actionableSteps: [
        'Contact support with the correlation ID',
        'This appears to be a server configuration issue',
      ],
      developmentDetails: `Missing required environment variables: ${missingVars.join(', ')}. Check your .env file and ensure all required variables are set.`,
      documentationLinks: ['/docs/deployment#environment-variables'],
      productionMessage: 'A configuration error occurred. Our team has been notified.',
    }
  )
}

/**
 * External API error with retry and fallback guidance
 */
export function createExternalApiError(
  service: string,
  operation: string,
  originalError?: Error | unknown,
  statusCode?: number
): EnhancedError {
  const isRateLimited = statusCode === 429
  const isServiceUnavailable = statusCode === 503 || statusCode === 502
  const isTimeout = statusCode === 504

  let actionableSteps: string[] = []
  let developmentDetails = `${service} API call failed for operation: ${operation}`

  if (isRateLimited) {
    actionableSteps = [
      'Wait a moment before retrying the request',
      'Consider implementing exponential backoff for API calls',
      'Check if you have exceeded the API rate limits',
    ]
    developmentDetails += '. Rate limit exceeded - implement proper backoff strategy.'
  } else if (isServiceUnavailable) {
    actionableSteps = [
      'Try again in a few minutes',
      'Check the service status page for known issues',
      'Contact support if the issue persists',
    ]
    developmentDetails += '. Service temporarily unavailable - check service health.'
  } else if (isTimeout) {
    actionableSteps = [
      'Retry the request',
      'Consider reducing the request size if applicable',
      'Check your network connection',
    ]
    developmentDetails += '. Request timed out - check network connectivity and request size.'
  } else {
    actionableSteps = [
      'Try the request again',
      'If the issue persists, contact support with the correlation ID',
    ]
    developmentDetails += '. Check API credentials and request format.'
  }

  return ErrorHandler.createError(
    'EXTERNAL_API_ERROR',
    `Unable to connect to ${service}. Please try again.`,
    'external_api',
    isServiceUnavailable ? 'high' : 'medium',
    {
      context: {
        service,
        operation,
        statusCode,
        isRateLimited,
        isServiceUnavailable,
        isTimeout,
      },
      originalError,
      actionableSteps,
      developmentDetails,
      documentationLinks: ['/docs/external-apis#troubleshooting'],
      productionMessage: `Unable to connect to ${service}. Please try again in a moment.`,
    }
  )
}

/**
 * GitHub API specific error handling
 */
export function createGitHubApiError(
  operation: string,
  originalError?: Error | unknown,
  statusCode?: number,
  rateLimitRemaining?: number
): EnhancedError {
  if (statusCode === 404) {
    return ErrorHandler.createError(
      'GITHUB_RESOURCE_NOT_FOUND',
      'The requested GitHub resource was not found.',
      'external_api',
      'medium',
      {
        context: { operation, statusCode },
        originalError,
        actionableSteps: [
          'Verify the repository or resource name is correct',
          'Check if the repository is public or if you have access',
          'Ensure the resource has not been deleted or moved',
        ],
        developmentDetails: `GitHub API returned 404 for operation: ${operation}. Verify resource existence and permissions.`,
        documentationLinks: ['/docs/github-integration#troubleshooting'],
        productionMessage:
          'The requested GitHub resource was not found. Please check the repository name and try again.',
      }
    )
  }

  if (statusCode === 403) {
    return ErrorHandler.createError(
      'GITHUB_ACCESS_FORBIDDEN',
      'Access to GitHub resource is forbidden.',
      'external_api',
      'high',
      {
        context: { operation, statusCode, rateLimitRemaining },
        originalError,
        actionableSteps: [
          'Check if you have the necessary permissions for this repository',
          'Verify your GitHub token has the required scopes',
          'Ensure the repository is not private if using public access',
        ],
        developmentDetails: `GitHub API returned 403 for operation: ${operation}. Check token permissions and scopes.`,
        documentationLinks: ['/docs/github-integration#permissions'],
        productionMessage:
          'Access to the GitHub resource is forbidden. Please check your permissions.',
      }
    )
  }

  if (statusCode === 429 || (rateLimitRemaining !== undefined && rateLimitRemaining <= 0)) {
    return ErrorHandler.createError(
      'GITHUB_RATE_LIMIT_EXCEEDED',
      'GitHub API rate limit exceeded. Please wait before making more requests.',
      'external_api',
      'medium',
      {
        context: { operation, statusCode, rateLimitRemaining },
        originalError,
        actionableSteps: [
          'Wait for the rate limit to reset (typically 1 hour)',
          'Consider using GitHub authentication to increase rate limits',
          'Implement request caching to reduce API calls',
        ],
        developmentDetails: `GitHub API rate limit exceeded for operation: ${operation}. Remaining: ${rateLimitRemaining}. Implement authentication and caching.`,
        documentationLinks: ['/docs/github-integration#rate-limits'],
        productionMessage: 'GitHub API rate limit exceeded. Please try again later.',
      }
    )
  }

  return createExternalApiError('GitHub', operation, originalError, statusCode)
}

/**
 * WebAuthn specific error handling
 */
export function createWebAuthnError(
  operation: 'registration' | 'authentication' | 'verification',
  error: string,
  originalError?: Error | unknown
): EnhancedError {
  const errorMap = {
    registration: {
      code: 'WEBAUTHN_REGISTRATION_FAILED',
      message: 'Failed to register security key. Please try again.',
      actionableSteps: [
        'Ensure your security key is properly connected',
        'Try using a different USB port or connection method',
        'Make sure you are using a supported browser (Chrome, Firefox, Safari)',
        'Check that you have touched/activated your security key when prompted',
      ],
      developmentDetails:
        'WebAuthn registration failed. Check browser compatibility and credential creation options.',
    },
    authentication: {
      code: 'WEBAUTHN_AUTHENTICATION_FAILED',
      message: 'Failed to authenticate with security key. Please try again.',
      actionableSteps: [
        'Ensure your security key is properly connected',
        'Try touching/activating your security key',
        'Make sure you are using the same security key used for registration',
        'If you have multiple keys, try a different one',
      ],
      developmentDetails:
        'WebAuthn authentication failed. Check credential verification and allowCredentials list.',
    },
    verification: {
      code: 'WEBAUTHN_VERIFICATION_FAILED',
      message: 'Security key verification failed. Please try again.',
      actionableSteps: [
        'Ensure the security key response is from the same origin',
        'Check that the challenge has not expired',
        'Verify your security key is functioning properly',
      ],
      developmentDetails:
        'WebAuthn verification failed. Check challenge validation and attestation verification.',
    },
  }

  const config = errorMap[operation]

  return ErrorHandler.createError(config.code, config.message, 'security', 'medium', {
    context: { operation, error },
    originalError,
    actionableSteps: config.actionableSteps,
    developmentDetails: `${config.developmentDetails} Error: ${error}`,
    documentationLinks: ['/docs/security/webauthn#troubleshooting'],
    productionMessage: config.message,
  })
}

/**
 * File operation error with detailed context
 */
export function createFileOperationError(
  operation: 'read' | 'write' | 'delete' | 'upload',
  filePath: string,
  originalError?: Error | unknown
): EnhancedError {
  const operationMap = {
    read: {
      code: 'FILE_READ_ERROR',
      message: 'Unable to read the requested file.',
      actionableSteps: [
        'Verify the file exists and is accessible',
        'Check if you have read permissions for this file',
        'Ensure the file is not corrupted or locked by another process',
      ],
    },
    write: {
      code: 'FILE_WRITE_ERROR',
      message: 'Unable to save the file.',
      actionableSteps: [
        'Check if you have write permissions to the destination',
        'Ensure there is enough disk space available',
        'Verify the file is not read-only or locked',
      ],
    },
    delete: {
      code: 'FILE_DELETE_ERROR',
      message: 'Unable to delete the file.',
      actionableSteps: [
        'Check if you have delete permissions for this file',
        'Ensure the file is not currently in use by another process',
        'Verify the file exists at the specified location',
      ],
    },
    upload: {
      code: 'FILE_UPLOAD_ERROR',
      message: 'File upload failed.',
      actionableSteps: [
        'Check if the file size is within allowed limits',
        'Verify the file type is supported',
        'Ensure you have upload permissions',
        'Try uploading the file again',
      ],
    },
  }

  const config = operationMap[operation]

  return ErrorHandler.createError(config.code, config.message, 'internal', 'medium', {
    context: { operation, filePath },
    originalError,
    actionableSteps: config.actionableSteps,
    developmentDetails: `File ${operation} operation failed for path: ${filePath}. Check file permissions and system resources.`,
    documentationLinks: ['/docs/file-operations#troubleshooting'],
    productionMessage: config.message,
  })
}

/**
 * Extract user-friendly error information from a request for debugging
 */
export function extractRequestContext(request: NextRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    referer: request.headers.get('referer'),
    contentType: request.headers.get('content-type'),
    contentLength: request.headers.get('content-length'),
    timestamp: new Date().toISOString(),
  }
}

/**
 * Determine error severity based on HTTP status code
 */
export function getSeverityFromStatus(statusCode: number): 'low' | 'medium' | 'high' | 'critical' {
  if (statusCode >= 500) return 'critical'
  if (statusCode >= 400) return 'medium'
  if (statusCode >= 300) return 'low'
  return 'low'
}

/**
 * Create a user-friendly error message for common HTTP status codes
 */
export function getMessageFromStatus(statusCode: number): string {
  const messages: Record<number, string> = {
    400: 'Invalid request. Please check your input and try again.',
    401: 'Authentication required. Please sign in to access this resource.',
    403: 'Access forbidden. You do not have permission to access this resource.',
    404: 'Resource not found. The requested item could not be located.',
    405: 'Method not allowed. This action is not supported for this resource.',
    409: 'Conflict. The request conflicts with the current state of the resource.',
    429: 'Too many requests. Please wait before trying again.',
    500: 'Internal server error. An unexpected error occurred.',
    502: 'Bad gateway. The server received an invalid response.',
    503: 'Service unavailable. The service is temporarily unavailable.',
    504: 'Gateway timeout. The request timed out.',
  }

  return messages[statusCode] || 'An error occurred while processing your request.'
}

/**
 * Helper to throw enhanced errors in a consistent way
 */
export function throwEnhancedError(error: EnhancedError): never {
  throw error
}

/**
 * Helper to check if an error is an enhanced error
 */
export function isEnhancedError(error: unknown): error is EnhancedError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'correlationId' in error &&
    'code' in error &&
    'message' in error &&
    'category' in error &&
    'severity' in error
  )
}
