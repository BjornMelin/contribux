# Rate Limiting

The Contribux API implements rate limiting to ensure fair usage and maintain service quality for all users.

## Rate Limits

### Authentication Type Limits

| Authentication Method | Requests per Hour | Burst Limit |
|----------------------|------------------|-------------|
| **JWT (Personal)** | 1,000 | 100 per minute |
| **API Key (Free)** | 500 | 50 per minute |
| **API Key (Pro)** | 5,000 | 200 per minute |
| **API Key (Enterprise)** | 25,000 | 500 per minute |
| **Unauthenticated** | 100 | 10 per minute |

### Endpoint-Specific Limits

Some endpoints have additional rate limits:

| Endpoint Category | Additional Limit |
|------------------|------------------|
| **Search APIs** | 200 requests per hour |
| **Analytics** | 1,000 events per hour |
| **WebAuthn** | 20 attempts per hour per IP |
| **OAuth** | 50 attempts per hour per IP |

## Rate Limit Headers

Every API response includes rate limit information in the headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
X-RateLimit-Reset-After: 3600
X-RateLimit-Bucket: user:auth:jwt
```

### Header Descriptions

- **X-RateLimit-Limit**: Maximum requests allowed in the current window
- **X-RateLimit-Remaining**: Number of requests remaining in current window
- **X-RateLimit-Reset**: Unix timestamp when the rate limit resets
- **X-RateLimit-Reset-After**: Seconds until the rate limit resets
- **X-RateLimit-Bucket**: The rate limit bucket being applied

## Rate Limit Exceeded Response

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 3600
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995200

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API rate limit exceeded",
    "details": {
      "limit": 1000,
      "remaining": 0,
      "reset_at": "2024-01-01T12:00:00Z",
      "retry_after": 3600
    }
  }
}
```

## Best Practices

### 1. Monitor Rate Limit Headers

Always check the rate limit headers and adjust your request frequency accordingly:

```javascript
class RateLimitAwareClient {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.lastRequestTime = 0
    this.minRequestInterval = 0
  }

  async makeRequest(endpoint, options = {}) {
    // Respect minimum interval between requests
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      )
    }

    const response = await fetch(`https://contribux.ai/api/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    // Update rate limit tracking
    this.updateRateLimit(response.headers)
    this.lastRequestTime = Date.now()

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after'))
      throw new RateLimitError('Rate limit exceeded', retryAfter)
    }

    return response
  }

  updateRateLimit(headers) {
    const remaining = parseInt(headers.get('x-ratelimit-remaining'))
    const resetAfter = parseInt(headers.get('x-ratelimit-reset-after'))
    
    if (remaining < 10) {
      // Slow down when approaching limit
      this.minRequestInterval = Math.max(1000, resetAfter * 1000 / remaining)
    } else {
      this.minRequestInterval = 0
    }
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}
```

### 2. Implement Exponential Backoff

When you hit rate limits, implement exponential backoff:

```javascript
async function makeRequestWithBackoff(requestFn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      if (error instanceof RateLimitError) {
        const backoffTime = Math.min(
          error.retryAfter * 1000,
          Math.pow(2, attempt) * 1000
        )
        
        console.log(`Rate limited. Retrying in ${backoffTime}ms`)
        await new Promise(resolve => setTimeout(resolve, backoffTime))
        continue
      }
      throw error
    }
  }
  throw new Error('Max retries exceeded')
}
```

### 3. Use Request Queuing

Implement a request queue to control the rate of API calls:

```javascript
class RequestQueue {
  constructor(rateLimit = 1000, timeWindow = 3600000) { // 1000 req/hour
    this.rateLimit = rateLimit
    this.timeWindow = timeWindow
    this.queue = []
    this.requestTimes = []
  }

  async enqueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject })
      this.processQueue()
    })
  }

  processQueue() {
    if (this.queue.length === 0) return

    const now = Date.now()
    
    // Remove old request timestamps
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.timeWindow
    )

    // Check if we can make another request
    if (this.requestTimes.length < this.rateLimit) {
      const { requestFn, resolve, reject } = this.queue.shift()
      this.requestTimes.push(now)
      
      requestFn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          // Process next request after a small delay
          setTimeout(() => this.processQueue(), 100)
        })
    } else {
      // Wait until we can make the next request
      const oldestRequest = Math.min(...this.requestTimes)
      const nextAvailableTime = oldestRequest + this.timeWindow
      const waitTime = nextAvailableTime - now
      
      setTimeout(() => this.processQueue(), waitTime)
    }
  }
}

// Usage
const queue = new RequestQueue(1000, 3600000) // 1000 requests per hour

async function queuedRequest(endpoint) {
  return queue.enqueue(() => 
    fetch(`https://contribux.ai/api/v1${endpoint}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
  )
}
```

### 4. Batch Requests When Possible

Some endpoints support batch operations to reduce API calls:

```javascript
// Instead of multiple individual requests
const repos = []
for (const id of repositoryIds) {
  const repo = await client.getRepository(id)
  repos.push(repo)
}

// Use batch endpoint
const repos = await client.getRepositories({
  ids: repositoryIds,
  include: ['issues', 'contributors']
})
```

### 5. Cache Responses

Implement caching to reduce redundant API calls:

```javascript
class CachedClient {
  constructor(apiKey, cacheTTL = 300000) { // 5 minute cache
    this.apiKey = apiKey
    this.cache = new Map()
    this.cacheTTL = cacheTTL
  }

  getCacheKey(endpoint, options) {
    return `${endpoint}:${JSON.stringify(options)}`
  }

  async get(endpoint, options = {}) {
    const cacheKey = this.getCacheKey(endpoint, options)
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data
    }

    const response = await this.makeRequest(endpoint, options)
    const data = await response.json()
    
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    })
    
    return data
  }
}
```

## Increasing Rate Limits

### Upgrade Your Plan

Higher rate limits are available with paid plans:

- **Pro Plan**: 5,000 requests/hour, $29/month
- **Enterprise Plan**: 25,000 requests/hour, custom pricing

### Request Limit Increase

For specific use cases, you can request a rate limit increase:

1. **Email**: [rate-limits@contribux.ai](mailto:rate-limits@contribux.ai)
2. **Include**:
   - Use case description
   - Expected request volume
   - Current plan/authentication method
   - Contact information

## Monitoring Usage

### Dashboard

Monitor your API usage in the [Developer Dashboard](https://contribux.ai/dashboard/developers):

- Current usage statistics
- Rate limit history
- Request patterns
- Error rates

### Programmatic Monitoring

Query your usage statistics via API:

```javascript
const usage = await fetch('https://contribux.ai/api/v1/usage/current', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
})

const stats = await usage.json()
console.log('Current usage:', stats.requests_this_hour)
console.log('Limit:', stats.hourly_limit)
console.log('Usage percentage:', stats.usage_percentage)
```

## Rate Limit Strategies by Use Case

### Real-time Applications

For applications requiring real-time updates:

```javascript
// Use Server-Sent Events for real-time updates
const eventSource = new EventSource(
  'https://contribux.ai/api/v1/stream/opportunities',
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
)

eventSource.onmessage = (event) => {
  const opportunity = JSON.parse(event.data)
  // Handle new opportunity
}
```

### Batch Processing

For batch data processing:

```javascript
// Process in smaller chunks with delays
async function processBatch(items, batchSize = 10) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    
    // Process batch in parallel
    await Promise.all(
      batch.map(item => processItem(item))
    )
    
    // Wait between batches to respect rate limits
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}
```

### Analytics and Reporting

For analytics workloads:

```javascript
// Use background job processing
class AnalyticsProcessor {
  constructor() {
    this.queue = []
    this.processing = false
  }

  addJob(job) {
    this.queue.push(job)
    if (!this.processing) {
      this.processQueue()
    }
  }

  async processQueue() {
    this.processing = true
    
    while (this.queue.length > 0) {
      const job = this.queue.shift()
      
      try {
        await this.processJob(job)
      } catch (error) {
        if (error instanceof RateLimitError) {
          // Re-queue the job and wait
          this.queue.unshift(job)
          await new Promise(resolve => 
            setTimeout(resolve, error.retryAfter * 1000)
          )
        }
      }
    }
    
    this.processing = false
  }
}
```

## Troubleshooting

### Common Issues

**Sudden Rate Limit Increase**
- Check for request loops in your code
- Verify pagination is working correctly
- Monitor for duplicate requests

**Inconsistent Rate Limiting**
- Different endpoints have different limits
- Burst limits vs. sustained limits
- Multiple API keys from same organization share limits

**Rate Limit Resets**
- Limits reset on the hour (UTC)
- Individual endpoint limits may reset differently
- Burst limits reset every minute

### Debug Mode

Enable debug mode to see detailed rate limit information:

```javascript
const client = new ContribuxClient(apiKey, { debug: true })

// Logs will include:
// - Rate limit headers
// - Request timing
// - Cache hit/miss information
```

## Best Practices Summary

1. **Monitor** rate limit headers in every response
2. **Implement** exponential backoff for retries
3. **Use** request queuing for high-volume applications
4. **Cache** responses when data doesn't change frequently
5. **Batch** requests when endpoints support it
6. **Consider** real-time alternatives (webhooks, SSE) for live data
7. **Upgrade** your plan for higher limits when needed
8. **Monitor** usage patterns in the dashboard

Following these practices will help you build robust applications that work efficiently within the API rate limits.