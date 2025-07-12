# Rate Limiting Implementation

This document describes the distributed rate limiting implementation using Upstash Redis.

## Configuration

Add the following environment variables to your `.env.local`:

```env
# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL="https://your-redis-endpoint.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-redis-rest-token"
```

## Rate Limits

The system implements three rate limit tiers:

- **Authentication endpoints** (`/api/auth/*`): 100 requests per 15 minutes
- **API endpoints** (`/api/github/*`, etc.): 1000 requests per hour  
- **Search endpoints** (`/api/search/*`): 60 requests per minute

## Usage

### API Routes

Use the `withRateLimit` wrapper for your API routes:

```typescript
import { withRateLimit } from '@/lib/security/rate-limit-middleware';

export const GET = withRateLimit(async (req) => {
  // Your API logic here
  return NextResponse.json({ data: 'response' });
}, 'api'); // 'auth', 'api', or 'search'
```

### Direct Usage

For custom rate limiting logic:

```typescript
import { checkApiRateLimit } from '@/lib/security/rate-limit-middleware';

export async function GET(req: NextRequest) {
  const { allowed, headers } = await checkApiRateLimit(req, 'api');
  
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers }
    );
  }
  
  // Your logic here
}
```

## Health Monitoring

Check Redis and rate limiter health at:

```text
GET /api/health/redis
```

## Rate Limit Headers

All rate-limited endpoints return the following headers:

- `X-RateLimit-Limit`: Total requests allowed in the window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Time when the limit resets (ISO 8601)
- `Retry-After`: Seconds to wait before retrying (only on 429 responses)

## Development Mode

When Upstash credentials are not configured, the system falls back to a mock implementation that allows
all requests. This enables local development without Redis setup.

## Algorithm

The implementation uses a sliding window algorithm via Upstash's `@upstash/ratelimit` library, providing
accurate rate limiting without the issues of fixed windows.
