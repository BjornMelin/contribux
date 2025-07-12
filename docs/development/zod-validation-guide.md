# Zod 3.x Enterprise Validation Guide

## Overview

This guide documents the modern Zod 3.x validation patterns implemented in the contribux project, following 2025 enterprise best practices for type-safe validation, security, and performance.

## Table of Contents

- [Quick Start](#quick-start)
- [Core Patterns](#core-patterns)
- [Security-First Validation](#security-first-validation)
- [Performance Optimization](#performance-optimization)
- [API Validation](#api-validation)
- [Error Handling](#error-handling)
- [Schema Management](#schema-management)
- [Testing Strategies](#testing-strategies)
- [Migration Guide](#migration-guide)

## Quick Start

### Basic Usage

```typescript
import { z } from 'zod'
import { 
  XSSProtectedStringSchema,
  createEnterpriseValidationMiddleware,
  formatValidationErrorsForAPI 
} from '@/lib/validation/enterprise-schemas'

// Simple validation
const userSchema = z.object({
  name: XSSProtectedStringSchema.pipe(z.string().min(1).max(100)),
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
})

// Use in API route
const validateUser = createEnterpriseValidationMiddleware(userSchema, {
  enablePerformanceMonitoring: true,
  errorFormatter: formatValidationErrorsForAPI,
})

// Usage
try {
  const validatedUser = await validateUser(requestData)
  // ... handle valid data
} catch (error) {
  // ... handle validation error
}
```

### Advanced Example

```typescript
import { 
  AdvancedSearchRequestSchema,
  createTypeSafeApiResponse 
} from '@/lib/validation/zod-examples'

// In API route
export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URL(request.url).searchParams)
    const validatedParams = AdvancedSearchRequestSchema.parse(searchParams)
    
    // Use validated params safely
    const results = await searchDatabase(validatedParams)
    
    return NextResponse.json(
      await createTypeSafeApiResponse(results, ResultSchema, {
        page: validatedParams.page,
        per_page: validatedParams.limit,
        total: results.total,
      }, {
        request_id: generateRequestId(),
        response_time_ms: Date.now() - startTime,
      })
    )
  } catch (error) {
    return handleValidationError(error)
  }
}
```

## Core Patterns

### 1. Modern Transformation Chains

```typescript
// ✅ Modern pattern with .pipe() and .transform()
const ProcessedStringSchema = z
  .string()
  .transform(str => str.trim())
  .pipe(
    z.string()
      .min(1, 'String cannot be empty after trimming')
      .transform(str => sanitizeString(str))
      .refine(str => str.length > 0, 'String cannot be empty after sanitization')
  )

// ❌ Old pattern
const oldSchema = z.string().min(1).transform(str => str.trim())
```

### 2. Conditional Validation with superRefine

```typescript
const UserRegistrationSchema = z
  .object({
    accountType: z.enum(['individual', 'organization']),
    email: z.string().email(),
    organizationName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accountType === 'organization' && !data.organizationName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Organization name is required for organization accounts',
        path: ['organizationName'],
      })
    }
    
    if (data.accountType === 'individual' && (!data.firstName || !data.lastName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'First and last name are required for individual accounts',
        path: data.firstName ? ['lastName'] : ['firstName'],
      })
    }
  })
```

### 3. Schema Composition and Reusability

```typescript
// Base schemas
const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const TimestampedSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

// Compose schemas
const UserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

const RepositorySchema = BaseEntitySchema.merge(
  z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullable(),
    stars: z.number().int().min(0),
  })
)
```

### 4. Advanced Error Context

```typescript
const createValidatedSchema = <T>(
  baseSchema: z.ZodSchema<T>,
  context: string
) => baseSchema.superRefine((data, ctx) => {
  // Add context to all validation errors
  if (ctx.path.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Validation failed in ${context}`,
      path: [],
    })
  }
})
```

## Security-First Validation

### XSS Protection

```typescript
import { XSSProtectedStringSchema } from '@/lib/validation/enterprise-schemas'

// Automatically sanitizes HTML and prevents XSS
const safeUserInput = XSSProtectedStringSchema.parse(userInput)
// Input: '<script>alert("xss")</script>'
// Output: ValidationError

// Safe HTML encoding for display
const displayText = XSSProtectedStringSchema.parse('User & <Company>')
// Output: 'User &amp; &lt;Company&gt;'
```

### SQL Injection Prevention

```typescript
import { SQLInjectionProtectedSchema } from '@/lib/validation/enterprise-schemas'

const searchQuery = SQLInjectionProtectedSchema.parse(userSearchTerm)
// Rejects: "'; DROP TABLE users; --"
// Accepts: "normal search term"
```

### Path Traversal Protection

```typescript
import { PathTraversalProtectedSchema } from '@/lib/validation/enterprise-schemas'

const filePath = PathTraversalProtectedSchema.parse(userProvidedPath)
// Rejects: "../../../etc/passwd"
// Accepts: "documents/file.txt"
```

### Input Sanitization

```typescript
import { Sanitizers } from '@/lib/security/input-validation'

const cleanData = z
  .string()
  .transform(Sanitizers.stripHtml)
  .transform(Sanitizers.normalizeWhitespace)
  .transform(Sanitizers.removeNullBytes)
  .pipe(z.string().min(1))
```

## Performance Optimization

### 1. Memoized Validation

```typescript
import { createMemoizedValidator } from '@/lib/validation/shared'

const expensiveSchema = z.object({
  // Complex validation logic
}).superRefine(/* expensive validation */)

const memoizedValidator = createMemoizedValidator(
  expensiveSchema,
  (input: any) => `cache_key_${input.id}_${input.version}`,
  1000 // Max cache size
)

// Subsequent validations with same cache key are instant
const result = memoizedValidator(data)
```

### 2. Performance Monitoring

```typescript
import { ValidationPerformanceMonitor } from '@/lib/validation/enterprise-schemas'

// Automatic performance tracking
const result = ValidationPerformanceMonitor.track('user-validation', () => {
  return userSchema.parse(userData)
})

// Get performance metrics
const metrics = ValidationPerformanceMonitor.getMetrics()
console.log(metrics['user-validation'].avgTime) // Average validation time
```

### 3. Lazy Evaluation

```typescript
import { createLazyValidationSchema } from '@/lib/validation/shared'

// Schema is only created when first used
const lazySchema = createLazyValidationSchema(() => 
  z.object({
    // Expensive schema definition
  })
)
```

### 4. Batch Validation

```typescript
import { validateBatch } from '@/lib/validation/shared'

const results = validateBatch(userSchema, userDataArray, {
  failFast: false, // Continue validation even if some fail
  collectErrors: true,
})

console.log(`Valid: ${results.valid.length}, Invalid: ${results.invalid.length}`)
```

## API Validation

### Request Validation

```typescript
// In API route (e.g., app/api/users/route.ts)
const CreateUserRequestSchema = z.object({
  name: XSSProtectedStringSchema.pipe(z.string().min(1).max(100)),
  email: z.string().email(),
  preferences: z.object({
    notifications: z.boolean().default(true),
    theme: z.enum(['light', 'dark']).default('light'),
  }).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = CreateUserRequestSchema.parse(body)
    
    // Use validated data safely
    const user = await createUser(validatedData)
    
    return NextResponse.json({ success: true, user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        formatValidationErrorsForAPI(error),
        { status: 400 }
      )
    }
    throw error
  }
}
```

### Response Validation

```typescript
import { createPaginatedResponseSchema } from '@/lib/validation/enterprise-schemas'

const UserListResponse = createPaginatedResponseSchema(UserSchema)

export async function GET(request: NextRequest) {
  const users = await getUsers()
  
  // Validate response before sending
  const response = UserListResponse.parse({
    data: users,
    pagination: {
      page: 1,
      per_page: 20,
      total: users.length,
      total_pages: Math.ceil(users.length / 20),
      has_next: false,
      has_prev: false,
    },
    metadata: {
      request_id: generateId(),
      timestamp: new Date().toISOString(),
      version: 'v1.0.0',
      response_time_ms: 150,
    },
  })
  
  return NextResponse.json(response)
}
```

### Query Parameter Validation

```typescript
const SearchQuerySchema = z
  .object({
    q: z.string().optional(),
    page: z.string().pipe(z.coerce.number().int().min(1)).default('1'),
    limit: z.string().pipe(z.coerce.number().int().min(1).max(100)).default('20'),
    sort: z.enum(['name', 'date', 'popularity']).default('name'),
    filter: z.string().optional(),
  })
  .transform(data => ({
    ...data,
    offset: (data.page - 1) * data.limit,
    hasFilter: !!data.filter,
  }))
  .superRefine((data, ctx) => {
    // Prevent deep pagination for performance
    if (data.offset > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maximum pagination depth exceeded',
        path: ['page'],
      })
    }
  })

// Usage in API route
const url = new URL(request.url)
const params = Object.fromEntries(url.searchParams)
const validatedQuery = SearchQuerySchema.parse(params)
```

## Error Handling

### 1. Structured Error Responses

```typescript
import { createTypeSafeErrorResponse } from '@/lib/validation/zod-examples'

export function handleValidationError(error: unknown, requestId: string) {
  if (error instanceof z.ZodError) {
    const errorResponse = createTypeSafeErrorResponse(error, 'validation', requestId)
    return NextResponse.json(errorResponse, { status: 400 })
  }
  
  // Handle other errors...
  return NextResponse.json(
    { success: false, error: { message: 'Internal server error' } },
    { status: 500 }
  )
}
```

### 2. Custom Error Messages

```typescript
const UserSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  age: z.number()
    .int('Age must be a whole number')
    .min(13, 'You must be at least 13 years old')
    .max(120, 'Please enter a valid age'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    ),
})
```

### 3. Error Aggregation

```typescript
import { ValidationErrorAggregator } from '@/lib/validation/shared'

const aggregator = new ValidationErrorAggregator()

// Collect errors from multiple sources
aggregator.addError('email', 'Invalid email format')
aggregator.addError('username', 'Username is already taken', 'DUPLICATE_USERNAME')

// Check for errors
if (aggregator.hasErrors()) {
  const formattedErrors = aggregator.getFormattedErrors()
  return NextResponse.json({ errors: formattedErrors }, { status: 400 })
}
```

## Schema Management

### 1. Schema Registry

```typescript
import { schemaRegistry } from '@/lib/validation/enterprise-schemas'

// Register reusable schemas
schemaRegistry.register('user', UserSchema)
schemaRegistry.register('repository', RepositorySchema)

// Use registered schemas
const userSchema = schemaRegistry.get('user')
const composedSchema = schemaRegistry.compose('user', 'repository')
```

### 2. Schema Versioning

```typescript
import { versionManager } from '@/lib/validation/enterprise-schemas'

// Register different versions
versionManager.registerVersion('user', 'v1.0.0', UserSchemaV1)
versionManager.registerVersion('user', 'v1.1.0', UserSchemaV11)
versionManager.registerVersion('user', 'v2.0.0', UserSchemaV2)

// Use specific version
const v1Schema = versionManager.getSchema('user', 'v1.0.0')

// Get latest version
const latestSchema = versionManager.getLatestSchema('user')

// Validate with fallback
const result = versionManager.validateWithFallback('user', 'v1.0.0', userData)
```

### 3. Environment-Aware Schemas

```typescript
import { createEnvironmentAwareSchema } from '@/lib/validation/shared'

const configSchema = createEnvironmentAwareSchema(
  baseConfigSchema,
  // Production-specific validations
  z.object({
    apiKey: z.string().min(32, 'Production API key must be at least 32 characters'),
    debug: z.literal(false, 'Debug mode must be disabled in production'),
  }),
  // Development-specific validations
  z.object({
    apiKey: z.string().min(1, 'API key is required in development'),
  })
)
```

## Testing Strategies

### 1. Schema Testing

```typescript
// tests/validation/user-schema.test.ts
import { describe, it, expect } from 'vitest'
import { UserSchema } from '@/lib/validation/schemas'

describe('UserSchema', () => {
  it('should validate correct user data', () => {
    const validUser = {
      email: 'user@example.com',
      username: 'testuser',
      age: 25,
    }
    
    expect(() => UserSchema.parse(validUser)).not.toThrow()
  })
  
  it('should reject invalid email', () => {
    const invalidUser = {
      email: 'invalid-email',
      username: 'testuser',
      age: 25,
    }
    
    expect(() => UserSchema.parse(invalidUser)).toThrow(/valid email/)
  })
  
  it('should enforce age restrictions', () => {
    const underageUser = {
      email: 'user@example.com',
      username: 'testuser',
      age: 12,
    }
    
    expect(() => UserSchema.parse(underageUser)).toThrow(/13 years old/)
  })
})
```

### 2. Security Testing

```typescript
describe('XSS Protection', () => {
  it('should prevent XSS attacks', () => {
    const xssAttempts = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<iframe src="evil.com"></iframe>',
    ]
    
    for (const attempt of xssAttempts) {
      expect(() => XSSProtectedStringSchema.parse(attempt)).toThrow()
    }
  })
  
  it('should HTML encode safe content', () => {
    const input = 'Safe content with & symbols'
    const result = XSSProtectedStringSchema.parse(input)
    expect(result).toBe('Safe content with &amp; symbols')
  })
})
```

### 3. Performance Testing

```typescript
describe('Performance', () => {
  it('should validate within acceptable time limits', () => {
    const startTime = performance.now()
    
    for (let i = 0; i < 1000; i++) {
      UserSchema.parse({
        email: `user${i}@example.com`,
        username: `user${i}`,
        age: 25,
      })
    }
    
    const endTime = performance.now()
    const duration = endTime - startTime
    
    expect(duration).toBeLessThan(100) // Should complete in under 100ms
  })
})
```

## Migration Guide

### From Basic Zod to Enterprise Patterns

#### Before (Basic Pattern)
```typescript
// ❌ Old pattern
const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

try {
  const user = userSchema.parse(data)
} catch (error) {
  console.error('Validation failed:', error)
}
```

#### After (Enterprise Pattern)
```typescript
// ✅ New pattern
import { 
  XSSProtectedStringSchema,
  createEnterpriseValidationMiddleware,
  formatValidationErrorsForAPI 
} from '@/lib/validation/enterprise-schemas'

const userSchema = z.object({
  name: XSSProtectedStringSchema.pipe(z.string().min(1).max(100)),
  email: z.string().email('Please enter a valid email address'),
})

const validateUser = createEnterpriseValidationMiddleware(userSchema, {
  enablePerformanceMonitoring: true,
  errorFormatter: formatValidationErrorsForAPI,
  onValidationSuccess: (data) => console.log('User validated:', data.email),
  onValidationError: (error) => console.warn('Validation failed:', error.issues),
})

try {
  const user = await validateUser(data)
} catch (error) {
  // Structured error handling
  return handleValidationError(error, requestId)
}
```

### API Route Migration

#### Before
```typescript
// ❌ Basic API validation
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  if (!body.email || !body.name) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  
  // Unsafe: no sanitization or type checking
  const user = await createUser(body)
  return NextResponse.json(user)
}
```

#### After
```typescript
// ✅ Enterprise API validation
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = generateRequestId()
  
  try {
    const body = await request.json()
    const validatedData = await validateUser(body)
    
    const user = await createUser(validatedData)
    
    return NextResponse.json(
      await createTypeSafeApiResponse(
        [user],
        UserSchema,
        { page: 1, per_page: 1, total: 1 },
        { request_id: requestId, response_time_ms: Date.now() - startTime }
      )
    )
  } catch (error) {
    return handleValidationError(error, requestId)
  }
}
```

## Best Practices

### 1. Always Use Security-First Schemas
```typescript
// ✅ Use security-protected schemas for user input
const userInputSchema = XSSProtectedStringSchema.pipe(
  z.string().min(1).max(1000)
)

// ❌ Don't use raw string validation for user input
const unsafeSchema = z.string()
```

### 2. Implement Progressive Validation
```typescript
// ✅ Layer validations from basic to complex
const emailSchema = z
  .string('Email is required')
  .email('Please enter a valid email address')
  .transform(email => email.toLowerCase().trim())
  .refine(email => {
    const domain = email.split('@')[1]
    return !blockedDomains.includes(domain)
  }, 'This email domain is not allowed')
```

### 3. Use Descriptive Error Messages
```typescript
// ✅ Provide helpful, actionable error messages
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    'Password must contain uppercase, lowercase, number, and special character'
  )

// ❌ Avoid generic or unhelpful messages
const badPasswordSchema = z.string().min(8, 'Invalid password')
```

### 4. Monitor Performance
```typescript
// ✅ Track validation performance in production
const heavyValidation = ValidationPerformanceMonitor.track(
  'complex-validation',
  () => complexSchema.parse(data)
)

// Check metrics periodically
const metrics = ValidationPerformanceMonitor.getMetrics()
if (metrics['complex-validation']?.avgTime > 50) {
  console.warn('Validation performance degraded')
}
```

### 5. Implement Caching for Expensive Validations
```typescript
// ✅ Cache expensive validations
const cachedValidator = createMemoizedValidator(
  expensiveSchema,
  (input: any) => `${input.type}_${input.id}_${input.version}`,
  1000
)

// ❌ Don't repeatedly validate the same expensive data
```

## Common Patterns

### 1. File Upload Validation
```typescript
const fileUploadSchema = z.object({
  file: z.object({
    name: z.string()
      .min(1, 'Filename is required')
      .max(255, 'Filename too long')
      .refine(name => /\.(jpg|jpeg|png|gif|pdf)$/i.test(name), 'Invalid file type'),
    size: z.number()
      .min(1, 'File cannot be empty')
      .max(10 * 1024 * 1024, 'File size cannot exceed 10MB'),
    type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'application/pdf']),
  }),
})
```

### 2. Configuration Validation
```typescript
const configSchema = z.object({
  database: z.object({
    url: z.string().url('Invalid database URL'),
    poolSize: z.number().int().min(1).max(100),
    timeout: z.number().int().min(1000).max(60000),
  }),
  redis: z.object({
    url: z.string().url().optional(),
    ttl: z.number().int().min(60).default(3600),
  }).optional(),
  features: z.object({
    enableAuth: z.boolean().default(true),
    enableWebauthn: z.boolean().default(false),
    rateLimit: z.number().int().min(10).max(10000).default(100),
  }),
}).superRefine((config, ctx) => {
  if (config.features.enableWebauthn && !config.features.enableAuth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'WebAuthn requires authentication to be enabled',
      path: ['features', 'enableWebauthn'],
    })
  }
})
```

### 3. Webhook Signature Validation
```typescript
const webhookSchema = z.object({
  payload: z.unknown(),
  signature: z.string().min(1),
  timestamp: z.string().datetime(),
}).superRefine((data, ctx) => {
  // Verify timestamp is recent (prevent replay attacks)
  const webhookTime = new Date(data.timestamp).getTime()
  const now = Date.now()
  const maxAge = 5 * 60 * 1000 // 5 minutes
  
  if (now - webhookTime > maxAge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Webhook timestamp too old',
      path: ['timestamp'],
    })
  }
  
  // Verify signature (implement your signature verification logic)
  const expectedSignature = calculateSignature(data.payload, data.timestamp)
  if (data.signature !== expectedSignature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid webhook signature',
      path: ['signature'],
    })
  }
})
```

## Troubleshooting

### Common Issues

1. **Performance Degradation**
   ```typescript
   // Check validation metrics
   const metrics = ValidationPerformanceMonitor.getMetrics()
   console.log('Slow validations:', 
     Object.entries(metrics)
       .filter(([_, m]) => m.avgTime > 10)
       .sort((a, b) => b[1].avgTime - a[1].avgTime)
   )
   ```

2. **Memory Leaks in Caching**
   ```typescript
   // Implement cache size limits
   const validator = createMemoizedValidator(schema, keyFn, 500) // Limit cache size
   
   // Or use time-based expiration
   const timeBasedCache = new Map()
   setInterval(() => {
     timeBasedCache.clear() // Clear cache periodically
   }, 5 * 60 * 1000) // Every 5 minutes
   ```

3. **Schema Registration Conflicts**
   ```typescript
   // Use namespaced schema names
   schemaRegistry.register('api.v1.user', UserV1Schema)
   schemaRegistry.register('api.v2.user', UserV2Schema)
   
   // Or check before registering
   if (!schemaRegistry.get('user')) {
     schemaRegistry.register('user', UserSchema)
   }
   ```

### Debugging Tips

1. **Enable Debug Mode**
   ```typescript
   // In development, log all validation errors
   if (process.env.NODE_ENV === 'development') {
     const originalParse = z.ZodSchema.prototype.parse
     z.ZodSchema.prototype.parse = function(data) {
       try {
         return originalParse.call(this, data)
       } catch (error) {
         console.debug('Validation failed:', error, 'Data:', data)
         throw error
       }
     }
   }
   ```

2. **Performance Profiling**
   ```typescript
   // Profile specific validations
   const profiledValidation = (data: unknown) => {
     const start = performance.now()
     try {
       const result = complexSchema.parse(data)
       const end = performance.now()
       console.log(`Validation took ${end - start}ms`)
       return result
     } catch (error) {
       const end = performance.now()
       console.log(`Failed validation took ${end - start}ms`)
       throw error
     }
   }
   ```

## Resources

- [Zod Official Documentation](https://zod.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Next.js API Route Best Practices](https://nextjs.org/docs/api-routes/introduction)

## Contributing

When adding new validation schemas:

1. Follow the security-first approach
2. Include comprehensive tests
3. Add performance monitoring
4. Document the schema purpose and usage
5. Consider backward compatibility
6. Update this guide with new patterns

For questions or suggestions, please refer to the project's contribution guidelines.