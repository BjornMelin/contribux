# Rate Limiting System - Contribux

## Overview

The contribux project implements a comprehensive rate limiting system designed to protect against abuse, ensure fair usage, and maintain system stability. The system uses Redis/Upstash for distributed rate limiting in production with automatic fallback to in-memory storage for development.

## Architecture

### Core Components

1. **Rate Limiter** (`src/lib/security/rate-limiter.ts`)
   - Core rate limiting logic with Upstash Redis integration
   - Configurable limits for different endpoint types
   - Automatic fallback to in-memory storage

2. **Rate Limit Middleware** (`src/lib/security/rate-limit-middleware.ts`)
   - Wrapper functions for API routes
   - Integration with Next.js middleware
   - Enhanced request identification

3. **Main Middleware** (`src/middleware.ts`)
   - Automatic rate limiting for all API requests
   - Security headers integration
   - Request preprocessing

## Rate Limit Configurations

### Endpoint Categories

| Category | Window | Limit | Use Case |
|----------|---------|-------|----------|
| `auth` | 15 min | 50 | Authentication endpoints |
| `api` | 1 hour | 1000 | General API endpoints |
| `search` | 1 min | 30 | Search operations |
| `webauthn` | 5 min | 10 | WebAuthn/MFA operations |
| `webhook` | 1 min | 100 | GitHub webhooks |
| `admin` | 1 hour | 100 | Admin operations |
| `public` | 1 min | 100 | Public endpoints |
| `analytics` | 1 min | 20 | Analytics/monitoring |
| `security` | 1 min | 10 | Security reporting |
| `demo` | 1 min | 5 | Demo endpoints |

### Automatic Endpoint Detection

The system automatically detects the appropriate rate limiter based on request paths:

```typescript
// Examples of automatic detection
/api/auth/signin          → auth limiter (50/15min)
/api/search/repositories  → search limiter (30/1min)
/api/security/webauthn/   → webauthn limiter (10/5min)
/api/webhooks/github      → webhook limiter (100/1min)
/api/admin/users          → admin limiter (100/1hour)
/api/health               → public limiter (100/1min)
```

## Usage Examples

### 1. Automatic Middleware (Recommended)

The system automatically applies rate limiting to all API routes through the main middleware:

```typescript
// No additional code needed - automatic protection
export async function GET(request: NextRequest) {
  // Your API logic here
  return NextResponse.json({ data: 'success' })
}
```

### 2. Manual Rate Limiting in API Routes

For custom rate limiting logic:

```typescript
import { checkApiRateLimit } from '@/lib/security/rate-limit-middleware'

export async function POST(request: NextRequest) {
  // Check rate limit manually
  const { allowed, headers } = await checkApiRateLimit(request, 'auth')
  
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers }
    )
  }
  
  // Your API logic here
  return NextResponse.json({ success: true })
}
```

### 3. Higher-Order Component Wrapper

For cleaner API route implementation:

```typescript
import { withRateLimit } from '@/lib/security/rate-limit-middleware'

const handler = withRateLimit(
  async (request: NextRequest) => {
    // Your API logic here
    return NextResponse.json({ data: 'protected' })
  },
  {
    limiterType: 'auth',
    skipRateLimit: (req) => req.headers.get('x-admin-key') === 'admin-secret'
  }
)

export { handler as GET, handler as POST }
```

### 4. Conditional Rate Limiting

For complex logic requiring rate limit checks:

```typescript
import { checkApiRateLimitStatus } from '@/lib/security/rate-limit-middleware'

export async function GET(request: NextRequest) {
  const result = await checkApiRateLimitStatus(request, {
    limiterType: 'search',
    customIdentifier: 'global-search'
  })
  
  if (!result.success) {
    return NextResponse.json(
      { 
        error: 'Search rate limit exceeded',
        retryAfter: result.retryAfter 
      },
      { status: 429, headers: result.headers }
    )
  }
  
  // Your search logic here
  return NextResponse.json({ results: [] })
}
```

## Request Identification

The system uses a sophisticated identification strategy:

### Priority Order

1. **Authenticated User ID** (from JWT token)
2. **API Key** (from headers)
3. **Session Token** (from cookies)
4. **IP Address + User Agent Hash** (fallback)

### Examples

```typescript
// Authenticated user
`user:${userId}`

// API key
`api:${apiKey.substring(0, 16)}`

// Session-based
`session:${sessionToken.substring(0, 16)}`

// IP + User Agent
`ip:${clientIP}:${userAgentHash}`
```

## Environment Configuration

### Production (Upstash Redis)

```bash
# Required environment variables
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

### Development (In-Memory Fallback)

When Redis is not configured, the system automatically falls back to in-memory storage with:

- Automatic cleanup of expired entries
- Same rate limiting logic
- Warning messages in console

## Response Headers

All rate-limited responses include standard headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 2025-01-09T10:00:00.000Z
X-RateLimit-Policy: 1000 requests per 3600000ms
Retry-After: 3600
```

## Error Responses

Rate limit exceeded responses follow this format:

```json
{
  "error": "Rate Limit Exceeded",
  "message": "API rate limit exceeded. Please try again later.",
  "type": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600,
  "limit": 1000,
  "remaining": 0,
  "reset": "2025-01-09T10:00:00.000Z",
  "endpoint": "/api/search/repositories",
  "policy": "1000 requests per 3600000ms"
}
```

## Monitoring and Logging

### Production Logging

```typescript
// Automatic logging includes:
{
  endpoint: '/api/search/repositories',
  method: 'GET',
  identifier: 'user:123',
  status: 'ALLOWED' | 'BLOCKED',
  remaining: 999,
  limit: 1000,
  userAgent: 'Mozilla/5.0...',
  duration: 45 // ms
}
```

### Error Handling

The system includes comprehensive error handling:

- Redis connection failures → automatic fallback
- Invalid requests → graceful degradation
- Rate limit service errors → allow requests with logging

## Security Considerations

### IP Detection

The system checks multiple headers for accurate IP detection:

```typescript
const headers = [
  'x-forwarded-for',      // Standard proxy header
  'x-real-ip',            // Nginx proxy
  'x-client-ip',          // Apache proxy
  'cf-connecting-ip',     // Cloudflare
  'true-client-ip',       // Cloudflare
  'x-vercel-forwarded-for' // Vercel
]
```

### Privacy Protection

- User agents are truncated to 100 characters
- API keys are truncated to 16 characters
- Full identifiers are never logged in production

## Performance Optimization

### Caching

- **Ephemeral Cache**: In-memory caching for frequently accessed identifiers
- **Analytics**: Optional request tracking for monitoring
- **Timeout**: 5-second timeout for Redis operations

### Sliding Window Algorithm

Uses sliding window for more accurate rate limiting:

```typescript
Ratelimit.slidingWindow(maxRequests, `${windowMs}ms`)
```

Benefits:
- Prevents burst attacks at window boundaries
- More accurate request distribution
- Better user experience

## Testing

### Unit Tests

```typescript
import { checkApiRateLimit } from '@/lib/security/rate-limit-middleware'

describe('Rate Limiting', () => {
  it('should allow requests under limit', async () => {
    const mockRequest = new NextRequest('http://localhost/api/test')
    const result = await checkApiRateLimit(mockRequest, 'api')
    
    expect(result.allowed).toBe(true)
    expect(result.headers['X-RateLimit-Remaining']).toBe('999')
  })
})
```

### Integration Tests

```typescript
import { testClient } from '@/test/helpers'

describe('API Rate Limiting', () => {
  it('should block requests after limit', async () => {
    // Make requests up to limit
    for (let i = 0; i < 1000; i++) {
      await testClient.get('/api/test')
    }
    
    // Next request should be blocked
    const response = await testClient.get('/api/test')
    expect(response.status).toBe(429)
  })
})
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failures**
   - Check environment variables
   - Verify Upstash Redis instance is running
   - System automatically falls back to in-memory storage

2. **Rate Limits Too Strict**
   - Adjust configurations in `rateLimitConfigs`
   - Consider user-based vs IP-based identification
   - Review endpoint categorization

3. **Performance Issues**
   - Monitor Redis response times
   - Check ephemeral cache effectiveness
   - Review request identification complexity

### Debug Mode

Enable debug logging by setting:

```bash
NODE_ENV=development
```

This provides detailed logging of:
- Rate limit checks
- Identifier resolution
- Redis operations
- Error conditions

## Future Enhancements

### Planned Features

1. **Dynamic Rate Limits**: Adjust limits based on user tier
2. **Distributed Quotas**: Share quotas across multiple instances
3. **Advanced Analytics**: Detailed usage patterns and abuse detection
4. **Custom Algorithms**: Token bucket, fixed window options
5. **Whitelist/Blacklist**: IP-based allow/deny lists

### Configuration Options

```typescript
// Future configuration example
const rateLimitConfig = {
  algorithm: 'sliding-window' | 'token-bucket' | 'fixed-window',
  adaptive: true, // Adjust based on system load
  quotaSharing: true, // Share quotas across instances
  analytics: {
    enabled: true,
    retention: '30d'
  }
}
```

## Conclusion

The contribux rate limiting system provides comprehensive protection against abuse while maintaining good user experience. The automatic endpoint detection, sophisticated request identification, and graceful fallback mechanisms ensure robust operation in all environments.

For questions or issues, please refer to the troubleshooting section or contact the development team.