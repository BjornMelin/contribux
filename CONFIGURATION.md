# Centralized Configuration Management System

This document describes the centralized configuration management system that eliminates magic numbers and improves maintainability throughout the authentication and application systems.

## Overview

The configuration system provides:
- **Type-safe configuration** with runtime validation using Zod
- **Environment-specific overrides** (development, test, production)
- **Centralized management** of all timeouts, thresholds, and limits
- **Integration with existing environment validation**

## Configuration Structure

The configuration is organized into logical sections:

### Authentication & JWT (`authConfig`)
- `jwt.accessTokenExpiry`: JWT access token lifetime (default: 15 minutes)
- `jwt.refreshTokenExpiry`: Refresh token lifetime (default: 7 days)
- `jwt.testSecret`: Fallback secret for testing
- `jwt.issuer`: Token issuer (default: "contribux")
- `jwt.audience`: Valid token audiences

### Session Management
- `session.expiry`: Session lifetime (default: 7 days)
- `session.cleanupInterval`: Cleanup frequency for expired sessions

### Rate Limiting (`authConfig.rateLimit`)
- `windowMs`: Rate limit window duration (default: 15 minutes)
- `max`: Maximum requests per window (default: 100)
- `defaultLimit`: Default limit for general endpoints (default: 60)
- `defaultWindow`: Default window for general rate limiting (default: 1 minute)

### Security Settings (`authConfig.security`)
- `failedLoginThreshold`: Failed login attempts before account lock (default: 5)
- `failedLoginWindow`: Time window for counting failed attempts (default: 10 minutes)
- `accountLockDuration`: How long accounts remain locked (default: 30 minutes)
- `anomalyTimeWindow`: Time window for detecting rapid succession (default: 5 seconds)
- `rapidSuccessionThreshold`: Number of events to trigger anomaly (default: 3)
- `typicalHoursStart`: Start of typical activity hours (default: 6 AM)
- `typicalHoursEnd`: End of typical activity hours (default: 10 PM)

### WebAuthn (`webauthnConfig`)
- `timeout`: WebAuthn operation timeout (default: 60 seconds)
- `challengeExpiry`: Challenge validity period (default: 5 minutes)
- `challengeLength`: Challenge byte length (default: 32)
- `supportedAlgorithms`: Supported cryptographic algorithms (default: [-7, -257])

### OAuth (`oauthConfig`)
- `stateExpiry`: OAuth state validity period (default: 10 minutes)
- `allowedProviders`: Permitted OAuth providers (default: ["github"])
- `tokenRefreshBuffer`: Time before expiry to refresh tokens (default: 5 minutes)

### Audit & GDPR (`auditConfig`)
- `retention.standardLogs`: Standard audit log retention (default: 2 years)
- `retention.criticalLogs`: Critical audit log retention (default: 7 years)
- `retention.complianceLogs`: Compliance log retention (default: 3 years)
- `retention.sessionData`: Session data retention (default: 90 days)
- `gdpr.inactiveUserRetention`: Inactive user data retention (default: 3 years)
- `gdpr.deletionGracePeriod`: Grace period before deletion (default: 30 days)
- `gdpr.consentRetention`: Consent record retention (default: 3 years)

### Cryptography (`cryptoConfig`)
- `keyRotationInterval`: Encryption key rotation frequency (default: 90 days)
- `keyLength`: Encryption key length in bits (default: 256)
- `ivLength`: Initialization vector length (default: 12 bytes)
- `tagLength`: Authentication tag length (default: 16 bytes)
- `algorithm`: Encryption algorithm (default: "AES-GCM")

### Database Monitoring (`databaseConfig`)
- `connectionTimeout`: Database connection timeout (default: 30 seconds)
- `slowQueryThreshold`: Threshold for slow query logging (default: 1000ms)
- `healthCheckInterval`: Database health check frequency (default: 1 minute)
- `performanceReportInterval`: Performance report generation (default: 1 hour)
- `maxSlowQueries`: Maximum slow queries to report (default: 10)

## Usage Examples

### Importing Configuration
```typescript
import { authConfig, webauthnConfig, config } from '@/lib/config'
```

### Using in Authentication Code
```typescript
// Before (magic numbers)
const ACCESS_TOKEN_EXPIRY = 15 * 60 // 15 minutes
const FAILED_LOGIN_THRESHOLD = 5

// After (centralized config)
const tokenExpiry = authConfig.jwt.accessTokenExpiry
const loginThreshold = authConfig.security.failedLoginThreshold
```

### Environment-Specific Overrides
The configuration automatically adapts based on `NODE_ENV`:

**Development:**
- Longer token expiry (1 hour for access tokens)
- More lenient rate limiting (1000 requests)
- Additional CORS origins

**Test:**
- Shorter timeouts for faster test execution
- Reduced thresholds for easier testing
- Test-specific secrets

**Production:**
- Stricter rate limiting
- Enhanced security settings
- Production-only validations

## Environment Integration

The configuration system integrates with the existing environment validation in `src/lib/validation/env.ts`. Additional environment variables have been added:

- `MAINTENANCE_MODE`: Enable/disable maintenance mode
- `MAINTENANCE_BYPASS_TOKEN`: Token to bypass maintenance mode
- `ALLOWED_ORIGINS`: Additional CORS origins

## Time and Size Constants

The system provides helpful constants for common operations:

```typescript
import { TIME_CONSTANTS, SIZE_CONSTANTS } from '@/lib/config'

// Time calculations
const oneHour = TIME_CONSTANTS.HOUR
const oneDay = TIME_CONSTANTS.DAY

// Size calculations  
const maxUpload = 10 * SIZE_CONSTANTS.MB
```

## Validation

The configuration is validated at runtime using Zod schemas, ensuring:
- Type safety
- Range validation (min/max values)
- Environment-specific requirements
- Dependency validation

## Migration Impact

### Files Updated
- `src/lib/auth/jwt.ts`: Replaced magic numbers with `authConfig` values
- `src/lib/auth/middleware.ts`: Updated rate limiting with `authConfig.rateLimit`
- `src/lib/auth/webauthn.ts`: Replaced timeouts with `webauthnConfig` values
- `src/lib/auth/oauth.ts`: Updated state expiry with `oauthConfig` values
- `src/lib/auth/audit.ts`: Replaced thresholds with `authConfig.security` values
- `src/lib/auth/gdpr.ts`: Updated retention periods with `auditConfig` values
- `src/lib/auth/crypto.ts`: Replaced constants with `cryptoConfig` values
- `src/lib/monitoring/database-monitor.ts`: Updated thresholds with `databaseConfig` values

### Benefits
1. **Maintainability**: All configuration in one place
2. **Type Safety**: Compile-time validation of configuration usage
3. **Environment Flexibility**: Easy environment-specific overrides
4. **Documentation**: Self-documenting configuration structure
5. **Testing**: Consistent test configurations
6. **Monitoring**: Centralized performance thresholds

## Future Enhancements

The configuration system is designed to be extensible:

1. **Runtime Updates**: Could be extended to support hot-reloading of non-security-critical settings
2. **Database Storage**: Could integrate with database-stored configuration for certain values
3. **Feature Flags**: Natural extension point for feature flag management
4. **Metrics Integration**: Could provide configuration change tracking
5. **Validation Rules**: Could be extended with more sophisticated validation logic

## Security Considerations

- Security-critical values (JWT secrets, encryption keys) remain in environment variables
- Configuration validation happens at startup to fail fast
- Production environment has additional validation rules
- Magic numbers that could impact security are centralized and documented