# GitHub API Client

A comprehensive GitHub API client for TypeScript/JavaScript applications with advanced features including rate limiting, caching, token rotation, and memory management.

## Features

- 🔐 **Multiple Authentication Methods**: Personal Access Token, GitHub App, OAuth
- ⚡ **Smart Rate Limiting**: Automatic throttling with warning thresholds
- 💾 **Intelligent Caching**: Memory/Redis support with ETag handling
- 🔄 **Token Rotation**: High-volume support with multiple tokens
- 🔁 **Retry Logic**: Exponential backoff with circuit breaker
- 📊 **GraphQL Optimization**: Query batching and point calculation
- 🧹 **Memory Management**: Comprehensive cleanup and resource disposal

## Installation

```bash
pnpm add @contribux/github-client
```

## Basic Usage

```typescript
import { GitHubClient } from '@contribux/github-client'

// Personal Access Token
const client = new GitHubClient({
  auth: {
    type: 'token',
    token: process.env.GITHUB_TOKEN
  }
})

// GitHub App
const appClient = new GitHubClient({
  auth: {
    type: 'app',
    appId: 123456,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: 789012
  }
})
```

## Advanced Configuration

```typescript
const client = new GitHubClient({
  auth: { type: 'token', token: 'ghp_xxxxxxxxxxxx' },
  
  // Caching configuration
  cache: {
    enabled: true,
    storage: 'memory', // or 'redis'
    ttl: 300, // 5 minutes
    backgroundRefresh: true
  },
  
  // Rate limiting
  throttle: {
    enabled: true,
    onRateLimit: (retryAfter, options) => {
      console.warn(`Rate limited. Retry after ${retryAfter}s`)
    }
  },
  
  // Retry configuration
  retry: {
    enabled: true,
    retries: 3,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 30000
    }
  },
  
  // Token rotation for high-volume usage
  tokenRotation: {
    tokens: [
      { token: 'ghp_token1', type: 'token' },
      { token: 'ghp_token2', type: 'token' }
    ],
    rotationStrategy: 'least-used'
  },
  
  // Automatically include rate limit info in GraphQL
  includeRateLimit: true
})
```

## Memory Management

The client provides comprehensive memory cleanup through the `destroy()` method. This is essential for preventing memory leaks in long-running applications.

### When to Use Cleanup

- Server-side applications that create clients dynamically
- Test suites that create multiple client instances
- Applications with client lifecycle management
- Before recreating clients with new configuration

### Cleanup Example

```typescript
const client = new GitHubClient({
  auth: { type: 'token', token: 'ghp_xxxxxxxxxxxx' },
  cache: { enabled: true, storage: 'memory' },
  tokenRotation: {
    tokens: [/* ... */],
    rotationStrategy: 'round-robin'
  }
})

try {
  // Use the client
  const repo = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
  
  // Perform operations...
} finally {
  // Always cleanup when done
  await client.destroy()
}
```

### What Gets Cleaned Up

The `destroy()` method performs comprehensive cleanup:

1. **Cache Manager**: Clears all cached data and stops background refresh timers
2. **DataLoader**: Clears all batched request caches
3. **Token State**: Clears token caches and rotation state
4. **Rate Limiting**: Resets all rate limit tracking
5. **Retry Logic**: Resets circuit breaker state
6. **Client References**: Nullifies Octokit and GraphQL clients

### Best Practices

1. **Use try/finally blocks** to ensure cleanup happens even on errors:
   ```typescript
   const client = new GitHubClient(config)
   try {
     await doWork(client)
   } finally {
     await client.destroy()
   }
   ```

2. **Cleanup in test suites** to prevent interference between tests:
   ```typescript
   afterEach(async () => {
     if (client) {
       await client.destroy()
       client = undefined
     }
   })
   ```

3. **Implement lifecycle management** for dynamic clients:
   ```typescript
   class GitHubService {
     private clients = new Map<string, GitHubClient>()
     
     async removeClient(id: string) {
       const client = this.clients.get(id)
       if (client) {
         await client.destroy()
         this.clients.delete(id)
       }
     }
     
     async shutdown() {
       for (const client of this.clients.values()) {
         await client.destroy()
       }
       this.clients.clear()
     }
   }
   ```

## API Examples

### REST API

```typescript
// Get repository
const repo = await client.rest.repos.get({
  owner: 'facebook',
  repo: 'react'
})

// List issues
const issues = await client.rest.issues.listForRepo({
  owner: 'facebook',
  repo: 'react',
  state: 'open'
})

// Create issue
const newIssue = await client.rest.issues.create({
  owner: 'myorg',
  repo: 'myrepo',
  title: 'Bug: Something is broken',
  body: 'Description of the issue...'
})
```

### GraphQL API

```typescript
// Simple query
const result = await client.graphql(`
  query {
    repository(owner: "facebook", name: "react") {
      stargazerCount
      forkCount
    }
  }
`)

// Query with variables
const userRepos = await client.graphql(`
  query($login: String!, $first: Int!) {
    user(login: $login) {
      repositories(first: $first) {
        nodes {
          name
          stargazerCount
        }
      }
    }
  }
`, {
  login: 'octocat',
  first: 10
})
```

## Rate Limiting

The client automatically tracks rate limits across all API resources:

```typescript
// Get current rate limit state
const rateLimits = client.getRateLimitState()
console.log('Core API:', rateLimits.core)
console.log('Search API:', rateLimits.search)
console.log('GraphQL API:', rateLimits.graphql)

// Check if rate limited
if (client.isRateLimited('core')) {
  const resetTime = client.getRateLimitResetTime('core')
  console.log('Rate limited until:', resetTime)
}
```

## Caching

The client supports both memory and Redis caching:

```typescript
// Memory cache (default)
const client = new GitHubClient({
  cache: {
    enabled: true,
    storage: 'memory',
    ttl: 300
  }
})

// Redis cache
const client = new GitHubClient({
  cache: {
    enabled: true,
    storage: 'redis',
    redisUrl: 'redis://localhost:6379',
    ttl: 600
  }
})

// Get cache metrics
const metrics = await client.getCacheMetrics()
console.log('Cache hit rate:', metrics.hitRate)
```

## Token Rotation

For high-volume applications, use multiple tokens:

```typescript
const client = new GitHubClient({
  tokenRotation: {
    tokens: [
      { token: 'ghp_token1', type: 'token', scopes: ['repo'] },
      { token: 'ghp_token2', type: 'token', scopes: ['repo', 'user'] },
      { token: 'ghp_token3', type: 'token', scopes: ['repo', 'admin:org'] }
    ],
    rotationStrategy: 'least-used', // or 'round-robin', 'random'
    refreshBeforeExpiry: 5 // minutes
  }
})

// Tokens are automatically rotated based on usage and health
```

## Error Handling

The client provides typed errors for better error handling:

```typescript
import {
  GitHubClientError,
  GitHubAuthenticationError,
  GitHubTokenExpiredError,
  isRateLimitError,
  isSecondaryRateLimitError
} from '@contribux/github-client'

try {
  await client.rest.repos.get({ owner, repo })
} catch (error) {
  if (isRateLimitError(error)) {
    console.log('Primary rate limit hit')
  } else if (isSecondaryRateLimitError(error)) {
    console.log('Secondary rate limit hit')
  } else if (error instanceof GitHubAuthenticationError) {
    console.log('Authentication failed:', error.message)
  } else if (error instanceof GitHubTokenExpiredError) {
    console.log('Token expired:', error.message)
  }
}
```

## Testing

When testing code that uses the GitHub client, ensure proper cleanup:

```typescript
import { GitHubClient } from '@contribux/github-client'

describe('MyService', () => {
  let client: GitHubClient
  
  beforeEach(() => {
    client = new GitHubClient({
      auth: { type: 'token', token: 'test-token' }
    })
  })
  
  afterEach(async () => {
    await client.destroy()
  })
  
  it('should fetch repository data', async () => {
    // Your test code
  })
})
```

## Contributing

See the main project README for contribution guidelines.

## License

MIT