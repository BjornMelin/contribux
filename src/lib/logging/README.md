# Pino Structured Logging Implementation

This implementation provides high-performance structured logging using Pino for production debugging and monitoring.

## Features

- **High Performance**: Pino is one of the fastest JSON loggers for Node.js
- **Structured Logging**: All logs are structured JSON for easy parsing and analysis
- **Environment Specific**: Different configurations for development, production, and testing
- **Security Focus**: Automatic redaction of sensitive information
- **Request Correlation**: Automatic correlation IDs for tracking requests
- **OpenTelemetry Integration**: Enhanced with existing telemetry infrastructure
- **Backward Compatible**: Drop-in replacement for existing loggers

## Usage

### Basic Logging

```typescript
import { logger } from '@/lib/logging'

// Basic logging
logger.info('User authenticated', { userId: '123' })
logger.warn('Rate limit approaching', { current: 95, limit: 100 })
logger.error('Database connection failed', error, { operation: 'connect' })
```

### Security Logging

```typescript
import { securityLogger } from '@/lib/logging'

securityLogger.authenticationSuccess('user123', { ip: '192.168.1.1' })
securityLogger.rateLimitExceeded('user123', 100, 150)
```

### Request Logging

```typescript
import { withApiLogging } from '@/lib/logging'

// Wrap API handlers
export const GET = withApiLogging(async (request) => {
  // Handler code
  return NextResponse.json({ data: 'response' })
})
```

### Performance Logging

```typescript
import { withPerformanceLogging } from '@/lib/logging'

const result = await withPerformanceLogging('database-query', async () => {
  return await db.query('SELECT * FROM users')
})
```

### Child Loggers

```typescript
import { logger } from '@/lib/logging'

const userLogger = logger.child({ userId: '123', component: 'user-service' })
userLogger.info('User action performed')
```

## Configuration

### Development
- Pretty-printed colored output
- Debug level logging
- Full error stack traces

### Production
- Structured JSON output
- Info level logging
- Sensitive data redaction
- Performance optimized

### Testing
- Silent logging to avoid test output noise
- Only critical errors logged

## Log Levels

- **trace**: Very detailed debugging information
- **debug**: Debugging information (development only)
- **info**: General information
- **warn**: Warning messages
- **error**: Error messages
- **critical/fatal**: Critical errors that may cause application termination
- **security**: Security-related events (custom level)

## Structured Data

All logs include:
- `timestamp`: ISO timestamp
- `level`: Log level
- `message`: Human-readable message
- `service`: Service name (contribux)
- `version`: Application version
- `environment`: NODE_ENV value
- `pid`: Process ID
- `hostname`: Server hostname

Additional context can be added:
- `requestId`: Request correlation ID
- `userId`: User identifier
- `sessionId`: Session identifier
- `traceId`: OpenTelemetry trace ID
- `spanId`: OpenTelemetry span ID
- `component`: Application component
- `operation`: Operation being performed

## Security Features

### Automatic Redaction

The following fields are automatically redacted:
- `authorization` headers
- `cookie` headers
- `password` fields
- `token` fields
- `apiKey` fields
- `secret` fields
- `email` addresses
- `ip` addresses

### Security Event Logging

Special handling for security events:
- Authentication attempts
- Authorization failures
- MFA events
- Rate limiting
- CSRF violations
- Security policy violations

## Performance Considerations

- **Asynchronous Logging**: Non-blocking I/O for better performance
- **Structured JSON**: Efficient serialization
- **Log Level Filtering**: Only logs above configured level are processed
- **Memory Efficient**: Streaming JSON output
- **Minimal Overhead**: < 1% performance impact

## Migration from Existing Loggers

### Drop-in Replacement

```typescript
// Old
import { logger } from '@/lib/logger'

// New
import { logger } from '@/lib/logging'
```

### Compatibility Layer

For gradual migration, use the compatibility layer:

```typescript
import { compatibilityLogger as logger } from '@/lib/logging'
```

## Monitoring Integration

### OpenTelemetry

Automatic trace correlation:
```typescript
// Logs automatically include traceId and spanId
logger.info('Operation completed', { operation: 'user-update' })
```

### Metrics

Performance metrics are automatically logged:
```typescript
// Automatic duration and memory usage tracking
await withPerformanceLogging('operation', async () => {
  // Your code
})
```

## Best Practices

1. **Use Structured Data**: Always include relevant context
2. **Consistent Naming**: Use consistent field names across logs
3. **Avoid Sensitive Data**: Never log passwords, tokens, or PII
4. **Use Appropriate Levels**: Choose correct log levels
5. **Request Context**: Include request correlation IDs
6. **Performance Monitoring**: Log slow operations
7. **Security Events**: Use security logger for auth events

## Production Deployment

### Environment Variables

```bash
NODE_ENV=production
LOG_LEVEL=info
```

### Log Aggregation

JSON logs can be easily ingested by:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Fluentd
- AWS CloudWatch
- Google Cloud Logging
- Datadog
- New Relic

### Example Production Log

```json
{
  "timestamp": "2025-01-09T10:30:00.123Z",
  "level": "info",
  "levelValue": 30,
  "message": "HTTP request completed",
  "service": "contribux",
  "version": "0.1.0",
  "environment": "production",
  "pid": 1234,
  "hostname": "app-server-01",
  "requestId": "req-123e4567-e89b-12d3-a456-426614174000",
  "method": "GET",
  "path": "/api/repositories",
  "statusCode": 200,
  "duration": 45,
  "component": "http-request"
}
```

## Troubleshooting

### Common Issues

1. **Logs not appearing**: Check log level configuration
2. **Performance issues**: Ensure async logging is enabled
3. **Missing context**: Use child loggers for request context
4. **Sensitive data**: Verify redaction configuration

### Debug Mode

Enable debug logging in development:
```typescript
import { logger } from '@/lib/logging'

if (process.env.NODE_ENV === 'development') {
  logger.debug('Debug information', { data: 'value' })
}
```

## Testing

### Mock Logging in Tests

```typescript
import { logger } from '@/lib/logging'

// Mock logger in tests
jest.mock('@/lib/logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))
```

### Test Log Output

```typescript
// Check log calls in tests
expect(logger.info).toHaveBeenCalledWith('Expected message', {
  expectedContext: 'value',
})
```