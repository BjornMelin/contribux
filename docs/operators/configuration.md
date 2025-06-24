# Operations: Configuration Management

This guide covers the comprehensive configuration management system for operators managing the contribux platform infrastructure.

## Configuration Architecture

### Centralized Configuration System

The platform uses a centralized, type-safe configuration system that eliminates magic numbers and provides environment-specific overrides:

```typescript
import {
  authConfig,
  webauthnConfig,
  databaseConfig,
  config,
} from "@/lib/config";
```

### Configuration Sections

#### Authentication & Security

- **JWT Configuration**: Token lifetimes, secrets, issuer settings
- **Session Management**: Session expiry, cleanup intervals
- **Rate Limiting**: Window duration, request limits, endpoint-specific limits
- **Security Settings**: Failed login thresholds, account lock duration, anomaly detection
- **WebAuthn**: Timeout settings, challenge validity, supported algorithms
- **OAuth**: State expiry, allowed providers, token refresh buffers

#### Database & Infrastructure

- **Connection Settings**: Timeout values, pool configurations
- **Monitoring Thresholds**: Slow query detection, health check intervals
- **Performance Metrics**: Report generation frequency, metrics collection
- **Vector Search**: HNSW index parameters, hybrid search weights

#### Audit & Compliance

- **Retention Policies**: Log retention periods (2-7 years based on type)
- **GDPR Compliance**: User data retention, deletion grace periods
- **Session Data**: 90-day retention for security logs

#### Cryptography

- **Key Management**: Rotation intervals (90 days), key lengths (256-bit)
- **Encryption**: AES-GCM algorithm, IV and tag lengths
- **Security Standards**: FIPS compliance settings

## Environment-Specific Configuration

### Development Environment

```bash
NODE_ENV=development
```

**Characteristics:**

- Longer token expiry (1 hour access tokens)
- More lenient rate limiting (1000 requests/window)
- Additional CORS origins for local development
- Verbose logging enabled

### Testing Environment

```bash
NODE_ENV=test
```

**Characteristics:**

- Shorter timeouts for faster test execution
- Reduced thresholds for easier testing scenarios
- Test-specific secrets and configurations
- Isolated database branch operations

### Production Environment

```bash
NODE_ENV=production
```

**Characteristics:**

- Stricter rate limiting (100 requests/15min window)
- Enhanced security settings
- Production-only validations
- Optimized performance thresholds

## Configuration Validation

### Runtime Validation with Zod

The configuration system uses Zod schemas for comprehensive validation:

```typescript
// Configuration validation happens at startup
const configSchema = z.object({
  auth: authConfigSchema,
  database: databaseConfigSchema,
  webauthn: webauthnConfigSchema,
  // ... other schemas
});

// Validates all configurations on application start
const validatedConfig = configSchema.parse(rawConfig);
```

### Validation Rules

- **Type Safety**: Compile-time TypeScript validation
- **Range Validation**: Min/max values for timeouts and thresholds
- **Environment Requirements**: Environment-specific mandatory fields
- **Dependency Validation**: Cross-configuration dependencies

## Infrastructure Environment Variables

### Core Environment Variables

```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@host/db-pooler
DATABASE_URL_DEV=postgresql://user:pass@dev-host/db-pooler
DATABASE_URL_TEST=postgresql://user:pass@test-host/db-pooler

# Authentication
JWT_SECRET=your-production-jwt-secret
JWT_REFRESH_SECRET=your-refresh-token-secret

# OpenAI Integration
OPENAI_API_KEY=your-openai-api-key

# Maintenance Mode
MAINTENANCE_MODE=false
MAINTENANCE_BYPASS_TOKEN=optional-bypass-token

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
```

### Security Environment Variables

```bash
# Encryption Keys
ENCRYPTION_KEY=256-bit-encryption-key
BACKUP_ENCRYPTION_KEY=backup-encryption-key

# OAuth Providers
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Monitoring & APM
DATADOG_API_KEY=optional-datadog-key
NEW_RELIC_LICENSE_KEY=optional-newrelic-key
```

## Configuration Management Best Practices

### 1. Environment Separation

- Use separate configuration files for each environment
- Never mix development and production configurations
- Validate environment-specific requirements at startup

### 2. Security Configuration

- Store secrets in environment variables, not configuration files
- Use separate encryption keys for each environment
- Implement key rotation procedures (90-day cycle)

### 3. Monitoring Configuration

- Set appropriate thresholds for each environment
- Configure alerting based on criticality levels
- Implement gradual threshold adjustments

### 4. Version Control

- Track configuration changes in version control
- Use semantic versioning for configuration updates
- Document all configuration changes in commit messages

## Constants and Helper Values

### Time Constants

```typescript
import { TIME_CONSTANTS } from "@/lib/config";

// Common time calculations
const oneMinute = TIME_CONSTANTS.MINUTE; // 60 seconds
const oneHour = TIME_CONSTANTS.HOUR; // 3600 seconds
const oneDay = TIME_CONSTANTS.DAY; // 86400 seconds
const oneWeek = TIME_CONSTANTS.WEEK; // 604800 seconds
```

### Size Constants

```typescript
import { SIZE_CONSTANTS } from "@/lib/config";

// File size calculations
const maxUpload = 10 * SIZE_CONSTANTS.MB; // 10 megabytes
const cacheLimit = 100 * SIZE_CONSTANTS.MB; // 100 megabytes
```

## Configuration Deployment

### Deployment Checklist

- [ ] Validate configuration against schema
- [ ] Test environment-specific overrides
- [ ] Verify all required environment variables are set
- [ ] Test application startup with new configuration
- [ ] Monitor application behavior after deployment

### Rollback Procedures

1. **Immediate Rollback**: Revert to previous configuration
2. **Partial Rollback**: Disable specific configuration sections
3. **Emergency Maintenance**: Enable maintenance mode during fixes

### Configuration Change Process

1. **Development**: Test configuration changes in development environment
2. **Staging**: Validate in staging environment with production-like data
3. **Production**: Deploy with monitoring and rollback procedures ready
4. **Monitoring**: Watch key metrics for 24 hours post-deployment

## Troubleshooting Configuration Issues

### Common Issues

#### Configuration Validation Errors

```bash
# Check configuration validation
npm run config:validate

# View current configuration (sanitized)
npm run config:show
```

#### Environment Variable Issues

```bash
# Check environment variable loading
npm run env:check

# Validate database connections
npm run db:test-connection
```

#### Performance Configuration Issues

```bash
# Test current configuration performance impact
npm run config:performance-test

# Generate configuration performance report
npm run config:performance-report
```

### Log Analysis

```bash
# Check configuration-related errors
npm run logs:config-errors

# Monitor configuration change impacts
npm run logs:config-changes
```

## Monitoring Configuration Health

### Configuration Metrics

- Configuration load time
- Validation success/failure rates
- Environment variable availability
- Configuration change frequency

### Alerts and Notifications

- **Critical**: Configuration validation failures
- **Warning**: Deprecated configuration usage
- **Info**: Configuration changes applied successfully

### Health Checks

```bash
# Run comprehensive configuration health check
npm run config:health-check

# Generate configuration audit report
npm run config:audit
```

This configuration management system ensures reliable, secure, and maintainable infrastructure operations across all environments.
