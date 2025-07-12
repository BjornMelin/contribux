# Enhanced Error Handling Guide - Contribux

## Overview

The Contribux application implements a comprehensive error handling system that provides better debugging information, user-friendly messages, and actionable guidance. This system is designed to improve both developer experience and production debugging capabilities.

## Core Features

### 1. Enhanced Error Context
- **Correlation IDs**: Every error gets a unique identifier for tracking
- **Environment-specific details**: Verbose in development, secure in production  
- **Actionable guidance**: Step-by-step instructions for users
- **Documentation links**: Direct links to relevant documentation
- **Rich context**: Request information, operation details, and debugging data

### 2. Error Categories and Severity
- **Categories**: `authentication`, `authorization`, `validation`, `database`, `external_api`, `rate_limiting`, `network`, `configuration`, `security`, `internal`
- **Severity Levels**: `low`, `medium`, `high`, `critical`
- **Automatic HTTP status mapping**: Proper status codes based on error type

### 3. Security Considerations
- **Information disclosure protection**: Sensitive details only in development
- **Production-safe messages**: Generic errors for security in production
- **Stack trace control**: Full traces in development only
- **Context sanitization**: Safe logging of request information

## Usage Examples

### Basic Error Creation

```typescript
import { ErrorHandler } from '@/lib/errors/enhanced-error-handler'

// Simple error with context
const error = ErrorHandler.createError(
  'USER_NOT_FOUND',
  'The requested user could not be found.',
  'database',
  'medium',
  {
    context: { userId: '123', operation: 'user_lookup' },
    actionableSteps: [
      'Verify the user ID is correct',
      'Check if the user account exists'
    ],
    documentationLinks: ['/docs/users#troubleshooting']
  }
)
```

### Authentication Errors

```typescript
// JWT token expired
throw ErrorHandler.createAuthError('token_expired', originalError, {
  requestId: 'req_123',
  endpoint: '/api/protected'
})

// Invalid credentials
throw ErrorHandler.createAuthError('invalid_credentials', null, {
  loginAttempt: attemptNumber,
  userAgent: request.headers.get('user-agent')
})
```

### Database Validation Errors

```typescript
// Connection failure with recovery guidance
throw ErrorHandler.createDatabaseError('connection_failed', error, {
  connectionPool: 'primary',
  retryCount: 3,
  operation: 'user_query'
})

// Validation error with field details
throw ErrorHandler.createDatabaseError('validation_error', null, {
  field: 'email',
  value: invalidEmail,
  expectedFormat: 'valid email address'
})
```

### API Route Error Handling

```typescript
import { withEnhancedErrorHandling } from '@/lib/errors/enhanced-error-handler'

export const POST = withEnhancedErrorHandling(async (request: NextRequest) => {
  try {
    // Your API logic here
    return NextResponse.json({ success: true })
  } catch (error) {
    // Enhanced error handling automatically applied
    throw error
  }
})
```

### External API Errors

```typescript
import { createGitHubApiError } from '@/lib/errors/error-utils'

// GitHub API rate limit
throw createGitHubApiError('repository_search', error, 429, 0)

// GitHub resource not found
throw createGitHubApiError('repository_fetch', error, 404)
```

## Environment Configuration

### Development Environment
- **Full error details**: Complete stack traces and debugging information
- **Verbose logging**: Detailed console output with context
- **All error fields**: Original errors, stack traces, and internal details

### Production Environment  
- **Secure messages**: Generic user-friendly error messages
- **Correlation IDs**: For support ticket tracking
- **Structured logging**: JSON format for monitoring systems
- **Sensitive data protection**: No internal details exposed to users

### Test Environment
- **Deterministic errors**: Consistent error messages for testing
- **Mock-friendly**: Easy to mock enhanced errors in tests
- **Debug information**: Full details for test debugging

## Error Response Format

### Development Response
```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "Your session has expired. Please sign in again.",
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-01-10T12:00:00.000Z",
    "category": "authentication",
    "severity": "medium",
    "actionableSteps": [
      "Click the sign-in button to authenticate again",
      "If the issue persists, clear your browser cookies and try again"
    ],
    "documentationLinks": ["/docs/authentication#token-refresh"],
    "details": {
      "development": "JWT token has expired. Check token expiration time and refresh logic.",
      "production": "Your session has expired. Please sign in again."
    },
    "context": {
      "joseErrorType": "JWTExpired",
      "originalMessage": "\"exp\" claim timestamp check failed"
    },
    "originalError": "\"exp\" claim timestamp check failed",
    "stackTrace": "Error: JWT expired\n    at handleJWTVerificationError..."
  }
}
```

### Production Response
```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED", 
    "message": "Your session has expired. Please sign in again.",
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-01-10T12:00:00.000Z",
    "category": "authentication",
    "severity": "medium",
    "actionableSteps": [
      "Click the sign-in button to authenticate again",
      "If the issue persists, clear your browser cookies and try again"  
    ],
    "documentationLinks": ["/docs/authentication#token-refresh"]
  }
}
```

## Integration Patterns

### API Route Integration

```typescript
// Before: Basic error handling
export async function POST(request: NextRequest) {
  try {
    // API logic
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// After: Enhanced error handling
import { withEnhancedErrorHandling, ErrorHandler } from '@/lib/errors/enhanced-error-handler'
import { extractRequestContext } from '@/lib/errors/error-utils'

export const POST = withEnhancedErrorHandling(async (request: NextRequest) => {
  const context = extractRequestContext(request)
  
  try {
    // API logic with enhanced context
    return NextResponse.json({ success: true })
  } catch (error) {
    // Specific error handling
    if (error instanceof SomeSpecificError) {
      throw ErrorHandler.createError(
        'SPECIFIC_ERROR_CODE',
        'User-friendly message',
        'appropriate_category',
        'medium',
        {
          originalError: error,
          context,
          actionableSteps: ['Step 1', 'Step 2'],
          documentationLinks: ['/docs/specific-error']
        }
      )
    }
    throw error // Let middleware handle other errors
  }
})
```

### Database Query Integration

```typescript
// Before: Basic validation
export async function getUserById(userId: string) {
  if (!userId) {
    throw new Error('User ID is required')
  }
  // Query logic
}

// After: Enhanced validation
import { ErrorHandler } from '@/lib/errors/enhanced-error-handler'

export async function getUserById(userId: string) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw ErrorHandler.createDatabaseError('validation_error', null, {
      field: 'userId',
      value: userId,
      expectedType: 'non-empty string',
      operation: 'user_lookup'
    })
  }
  
  try {
    // Query logic
    return await db.query.users.findFirst({ where: eq(users.id, userId) })
  } catch (error) {
    throw ErrorHandler.createDatabaseError('query_error', error, {
      operation: 'user_lookup',
      userId,
      table: 'users'
    })
  }
}
```

### External API Integration

```typescript
// Before: Basic error handling
async function fetchGitHubRepo(owner: string, repo: string) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    throw new Error('Failed to fetch repository')
  }
}

// After: Enhanced error handling
import { createGitHubApiError } from '@/lib/errors/error-utils'

async function fetchGitHubRepo(owner: string, repo: string) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
    
    if (!response.ok) {
      throw createGitHubApiError(
        'repository_fetch',
        new Error(`HTTP ${response.status}: ${response.statusText}`),
        response.status,
        Number(response.headers.get('x-ratelimit-remaining')) || undefined
      )
    }
    
    return await response.json()
  } catch (error) {
    if (error && typeof error === 'object' && 'correlationId' in error) {
      throw error // Re-throw enhanced errors
    }
    
    throw createGitHubApiError('repository_fetch', error)
  }
}
```

## Monitoring and Logging

### Error Logging

```typescript
// Automatic logging in enhanced error handler
ErrorHandler.logError(enhancedError, request)

// Manual logging for specific scenarios
const error = ErrorHandler.createError(/* ... */)
ErrorHandler.logError(error, request) // Logs to console/monitoring service
```

### Production Monitoring Integration

```typescript
// In production, integrate with monitoring services
if (process.env.NODE_ENV === 'production') {
  // Send to Sentry, DataDog, etc.
  monitoringService.captureError(enhancedError, {
    correlationId: enhancedError.correlationId,
    category: enhancedError.category,
    severity: enhancedError.severity,
    context: enhancedError.context
  })
}
```

## Testing Enhanced Errors

### Unit Tests

```typescript
import { ErrorHandler, isEnhancedError } from '@/lib/errors/enhanced-error-handler'

describe('Enhanced Error Handling', () => {
  it('should create authentication errors with proper context', () => {
    const error = ErrorHandler.createAuthError('token_expired', null, {
      userId: 'test-user'
    })
    
    expect(isEnhancedError(error)).toBe(true)
    expect(error.code).toBe('AUTH_TOKEN_EXPIRED')
    expect(error.category).toBe('authentication')
    expect(error.context?.userId).toBe('test-user')
    expect(error.actionableSteps).toContain('Click the sign-in button to authenticate again')
  })
  
  it('should convert to proper HTTP responses', () => {
    const error = ErrorHandler.createValidationError(zodError)
    const response = ErrorHandler.toHttpResponse(error)
    
    expect(response.status).toBe(400)
    // Test response body contains expected fields
  })
})
```

### Integration Tests

```typescript
describe('API Error Handling', () => {
  it('should return enhanced errors from API routes', async () => {
    const response = await request(app)
      .post('/api/test')
      .send({ invalid: 'data' })
      .expect(400)
    
    const body = response.body
    expect(body.error.correlationId).toBeDefined()
    expect(body.error.actionableSteps).toBeDefined()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

## Best Practices

### 1. Error Code Naming
- Use SCREAMING_SNAKE_CASE
- Include error category prefix (AUTH_, DB_, API_)
- Be specific but not too verbose
- Examples: `AUTH_TOKEN_EXPIRED`, `DB_CONNECTION_FAILED`, `GITHUB_RATE_LIMIT_EXCEEDED`

### 2. Error Messages
- Use user-friendly language
- Be specific about what went wrong
- Avoid technical jargon in user-facing messages
- Include actionable guidance when possible

### 3. Context Information
- Include relevant operation details
- Add user/request identifiers
- Include timing information for performance issues
- Sanitize sensitive data before logging

### 4. Documentation Links
- Link to relevant troubleshooting guides
- Include API documentation references
- Point to configuration guides for setup issues
- Provide links to status pages for service issues

### 5. Security Considerations
- Never expose sensitive data in error messages
- Use generic messages in production for internal errors
- Implement proper error boundaries to prevent information leakage
- Log detailed information securely for debugging

## Migration from Basic Error Handling

### Step 1: Replace Existing Error Throws
```typescript
// Before
throw new Error('Something went wrong')

// After
throw ErrorHandler.createError(
  'OPERATION_FAILED',
  'The operation could not be completed.',
  'internal',
  'medium',
  {
    actionableSteps: ['Try again in a moment'],
    developmentDetails: 'Specific technical details for debugging'
  }
)
```

### Step 2: Update API Routes
```typescript
// Wrap existing API routes with enhanced error handling
export const GET = withEnhancedErrorHandling(existingHandler)
```

### Step 3: Update Error Handling Middleware
```typescript
// Replace basic error responses with enhanced error responses
if (isEnhancedError(error)) {
  return ErrorHandler.toHttpResponse(error)
}
```

### Step 4: Add Error Logging
```typescript
// Add structured error logging throughout the application
ErrorHandler.logError(error, request)
```

This enhanced error handling system provides a comprehensive foundation for better debugging, user experience, and production monitoring in the Contribux application.