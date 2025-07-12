# Environment Variable Migration Guide

## Overview

This guide documents the migration from custom environment validation to centralized validation using `@t3-oss/env-nextjs` following T3 Stack best practices.

## What Changed

### 1. Centralized Environment Validation

- **Before**: Custom validation scattered across multiple files
- **After**: Single source of truth with `@t3-oss/env-nextjs` in `src/lib/validation/env.ts`

### 2. Type Safety Improvements

- **Before**: Manual type assertions and runtime checks
- **After**: Automatic TypeScript types generated from Zod schemas

### 3. Runtime Validation

- **Before**: Basic string checks with manual validation
- **After**: Comprehensive Zod schema validation with proper error messages

### 4. T3 Stack Best Practices

- **Before**: Manual `process.env` access throughout codebase
- **After**: Centralized `env` object with proper server/client separation

## Key Improvements

### 1. Enhanced Type Safety

```typescript
// Before
const databaseUrl: string = process.env.DATABASE_URL || 'fallback'

// After
import { env } from '@/lib/validation/env'
const databaseUrl: string = env.DATABASE_URL // Type-safe, validated
```

### 2. Better Error Messages

```typescript
// Before
Error: DATABASE_URL is required

// After
❌ Invalid environment variables: {
  "DATABASE_URL": ["Required"]
}
```

### 3. Proper Number Coercion

```typescript
// Before
const maxRetries = Number(process.env.DB_MAX_RETRIES || '3')

// After
const maxRetries = env.DB_MAX_RETRIES // Already coerced to number with default
```

### 4. Boolean Handling

```typescript
// Before
const isProduction = process.env.NODE_ENV === 'production'

// After
const isProduction = env.NODE_ENV === 'production' // Type-safe enum
```

## Migration Steps

### Step 1: Update Direct `process.env` Usage

Replace direct `process.env` access with centralized validation:

```typescript
// Before
if (process.env.NODE_ENV === 'development') {
  // ...
}

// After
import { env, isDevelopment } from '@/lib/validation/env'
if (isDevelopment()) {
  // ...
}
```

### Step 2: Use Configuration Getters

Replace manual configuration objects with provided getters:

```typescript
// Before
const dbConfig = {
  url: process.env.DATABASE_URL,
  poolMin: Number(process.env.DB_POOL_MIN || '2'),
  poolMax: Number(process.env.DB_POOL_MAX || '20'),
}

// After
import { getDatabaseConfig } from '@/lib/validation/env'
const dbConfig = getDatabaseConfig()
```

### Step 3: Update Feature Flag Usage

```typescript
// Before
const enableWebAuthn = process.env.ENABLE_WEBAUTHN === 'true'

// After
import { getFeatureFlags } from '@/lib/validation/env'
const { webauthn } = getFeatureFlags()
```

### Step 4: Use Helper Functions

```typescript
// Before
const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

// After
import { getJwtSecret } from '@/lib/validation/env'
const jwtSecret = getJwtSecret()
```

## Available Configuration Getters

### Database Configuration
```typescript
import { getDatabaseConfig, getDatabaseUrl } from '@/lib/validation/env'

const dbConfig = getDatabaseConfig()
const dbUrl = getDatabaseUrl() // Environment-specific URL
```

### Authentication Configuration
```typescript
import { getJwtSecret, getGitHubConfig, getGoogleConfig } from '@/lib/validation/env'

const jwtSecret = getJwtSecret()
const github = getGitHubConfig()
const google = getGoogleConfig()
```

### Feature Flags
```typescript
import { getFeatureFlags } from '@/lib/validation/env'

const features = getFeatureFlags()
// features.webauthn, features.oauth, etc.
```

### Vector Search Configuration
```typescript
import { getVectorConfig } from '@/lib/validation/env'

const vectorConfig = getVectorConfig()
// vectorConfig.hnswEfSearch, vectorConfig.similarityThreshold, etc.
```

### Cache Configuration
```typescript
import { getCacheConfig, getRedisUrl } from '@/lib/validation/env'

const cacheConfig = getCacheConfig()
const redisUrl = getRedisUrl()
```

### Rate Limiting Configuration
```typescript
import { getRateLimitConfig } from '@/lib/validation/env'

const rateLimitConfig = getRateLimitConfig()
```

### CORS Configuration
```typescript
import { getCorsConfig } from '@/lib/validation/env'

const corsConfig = getCorsConfig()
```

### WebAuthn Configuration
```typescript
import { getWebAuthnConfig } from '@/lib/validation/env'

const webauthnConfig = getWebAuthnConfig()
```

### Notification Configuration
```typescript
import { getNotificationConfig } from '@/lib/validation/env'

const notifications = getNotificationConfig()
```

### Telemetry Configuration
```typescript
import { getTelemetryConfig } from '@/lib/validation/env'

const telemetry = getTelemetryConfig()
```

## Environment Variables Added

### New Variables with Defaults

- `HNSW_EF_SEARCH` (default: 200)
- `HNSW_EF_CONSTRUCTION` (default: 400)
- `HNSW_M_CONNECTIONS` (default: 16)
- `VECTOR_SIMILARITY_THRESHOLD` (default: 0.7)
- `VECTOR_MAX_RESULTS` (default: 100)
- `VECTOR_BATCH_SIZE` (default: 1000)
- `VECTOR_CACHE_SIZE` (default: 10000)
- `VECTOR_CACHE_TTL` (default: 3600)
- `HYBRID_SEARCH_TEXT_WEIGHT` (default: 0.3)
- `HYBRID_SEARCH_VECTOR_WEIGHT` (default: 0.7)
- `DB_MAIN_BRANCH` (default: 'main')
- `DB_DEV_BRANCH` (default: 'dev')
- `DB_TEST_BRANCH` (default: 'test')
- `DB_POOL_MIN` (default: 2)
- `DB_POOL_MAX` (default: 20)
- `DB_POOL_IDLE_TIMEOUT` (default: 10000)
- `DB_CONNECTION_TIMEOUT` (default: 30000)
- `DB_QUERY_TIMEOUT` (default: 30000)
- `DB_HEALTH_CHECK_INTERVAL` (default: 30000)
- `DB_MAX_RETRIES` (default: 3)
- `DB_RETRY_DELAY` (default: 1000)
- `DB_STATEMENT_TIMEOUT` (default: 30000)
- `DB_IDLE_TIMEOUT` (default: 30000)
- `DB_MAX_LIFETIME` (default: 3600000)
- `RATE_LIMIT_MAX` (default: 100)
- `RATE_LIMIT_WINDOW` (default: 900)
- `CACHE_MEMORY_SIZE` (default: 100)
- `CACHE_DEFAULT_TTL` (default: 300)
- `CACHE_EDGE_TTL` (default: 3600)
- `WEBAUTHN_RP_NAME` (default: 'Contribux')
- `WEBAUTHN_TIMEOUT` (default: 60000)
- `WEBAUTHN_CHALLENGE_EXPIRY` (default: 300000)
- `WEBAUTHN_SUPPORTED_ALGORITHMS` (default: '-7,-257')
- `SERVICE_VERSION` (default: '1.0.0')
- `LOG_LEVEL` (default: 'info')
- `NEXT_PUBLIC_APP_NAME` (default: 'Contribux')
- `NEXT_PUBLIC_RP_ID` (default: 'localhost')
- `TEST_DB_STRATEGY` (default: 'neon')

### Boolean Feature Flags (with defaults)

- `ENABLE_WEBAUTHN` (default: false)
- `ENABLE_ADVANCED_SECURITY` (default: false)
- `ENABLE_SECURITY_DASHBOARD` (default: false)
- `ENABLE_DEVICE_FINGERPRINTING` (default: false)
- `ENABLE_DETAILED_AUDIT` (default: false)
- `ENABLE_RATE_LIMITING` (default: true)
- `ENABLE_OAUTH` (default: true)
- `ENABLE_AUDIT_LOGS` (default: true)
- `DEMO_ZERO_TRUST` (default: false)
- `DEMO_ENTERPRISE` (default: false)
- `MAINTENANCE_MODE` (default: false)
- `CI` (default: false)
- `USE_LOCAL_PG` (default: false)
- `VERCEL` (default: false)

## Security Improvements

### 1. Production Validation

Automatic validation of production-specific requirements:

- No localhost URLs in production
- Required secrets present
- OAuth configuration when enabled
- Encryption key format validation

### 2. Type-Safe Secret Access

```typescript
// Before
const encryptionKey = process.env.ENCRYPTION_KEY

// After
import { getEncryptionKey } from '@/lib/validation/env'
const encryptionKey = getEncryptionKey() // Validates format and entropy
```

### 3. Environment-Specific Database URLs

```typescript
// Before
const dbUrl = process.env.DATABASE_URL

// After
import { getDatabaseUrl } from '@/lib/validation/env'
const dbUrl = getDatabaseUrl() // Automatically selects based on NODE_ENV
```

## Error Handling Improvements

### 1. Better Error Messages

```typescript
// Before
Error: Environment variable missing

// After
❌ Invalid environment variables: {
  "DATABASE_URL": ["Required"],
  "NEXTAUTH_SECRET": ["String must contain at least 32 character(s)"]
}
```

### 2. Client-Side Protection

```typescript
// Before
const secret = process.env.NEXTAUTH_SECRET // Undefined on client

// After
const secret = env.NEXTAUTH_SECRET // Throws clear error on client access
```

## Development vs Production

### Development
- More lenient validation
- Optional OAuth configuration
- Localhost URLs allowed
- Detailed error messages

### Production
- Strict validation
- Required security configuration
- No localhost URLs
- Enhanced security checks

## Testing Considerations

### Environment-Specific Testing

```typescript
// Before
process.env.NODE_ENV = 'test'

// After
import { isTest } from '@/lib/validation/env'
if (isTest()) {
  // Test-specific code
}
```

### Test Database Configuration

```typescript
// Before
const testDb = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

// After
import { getDatabaseUrl } from '@/lib/validation/env'
const testDb = getDatabaseUrl() // Automatically uses TEST URL in test env
```

## Performance Improvements

### 1. Validation Caching

Environment variables are validated once at startup, not on every access.

### 2. Type Inference

TypeScript can infer types automatically, reducing runtime overhead.

### 3. Default Values

Default values are applied at validation time, not runtime.

## Backward Compatibility

### Legacy Functions

The following functions are maintained for backward compatibility:

- `validateBasicEnvironmentVariables()`
- `validateSecurityConfiguration()`
- `validateProductionSecuritySettings()`
- `getRequiredEnv(key: string)`
- `getOptionalEnv(key: string)`

### Migration Timeline

1. **Phase 1**: New centralized validation is available
2. **Phase 2**: Update critical paths to use new system
3. **Phase 3**: Deprecate legacy functions
4. **Phase 4**: Remove legacy functions (future release)

## Common Patterns

### 1. Conditional Configuration

```typescript
// Before
const config = {
  redis: process.env.REDIS_URL ? { url: process.env.REDIS_URL } : undefined
}

// After
import { getCacheConfig } from '@/lib/validation/env'
const config = getCacheConfig()
```

### 2. Feature Flag Usage

```typescript
// Before
if (process.env.ENABLE_WEBAUTHN === 'true') {
  // ...
}

// After
import { getFeatureFlags } from '@/lib/validation/env'
const { webauthn } = getFeatureFlags()
if (webauthn) {
  // ...
}
```

### 3. Environment Utilities

```typescript
// Before
const isDev = process.env.NODE_ENV === 'development'

// After
import { isDevelopment } from '@/lib/validation/env'
const isDev = isDevelopment()
```

## Next Steps

1. **Update imports** in files that use direct `process.env` access
2. **Test thoroughly** to ensure all environment variables work correctly
3. **Update documentation** to reflect new configuration patterns
4. **Consider removing** legacy environment validation files once migration is complete

## Support

For questions or issues with the migration:

1. Check the T3 Env documentation: https://env.t3.gg
2. Review the centralized validation schema in `src/lib/validation/env.ts`
3. Use the provided configuration getters for common patterns
4. Maintain backward compatibility during the transition period