# DataLoader Implementation

A modern, TypeScript-first implementation of the Facebook DataLoader pattern, optimized for GitHub API interactions with strict type safety and 2025 best practices.

## Features

- **Strict TypeScript Support**: Full generic type safety with proper error handling
- **Efficient Batching**: Configurable batch sizes with intelligent scheduling
- **Memory-Safe Caching**: Per-request isolation with cache management
- **GitHub API Optimized**: Specialized repository data loading with GraphQL batching
- **Error Resilience**: Proper error propagation and partial failure handling
- **Performance Monitoring**: Cache metrics and monitoring capabilities

## Basic Usage

```typescript
import { DataLoader } from '@/lib/github/dataloader'

// Create a simple DataLoader
const userLoader = new DataLoader(async (ids: readonly string[]) => {
  const users = await database.getUsersByIds(ids)
  return ids.map(id => users.find(user => user.id === id) || new Error('User not found'))
})

// Load single values (automatically batched)
const user1 = await userLoader.load('user-1')
const user2 = await userLoader.load('user-2')

// Load multiple values
const users = await userLoader.loadMany(['user-3', 'user-4', 'user-5'])
```

## GitHub Repository DataLoader

Specialized DataLoader for GitHub repository data with GraphQL batching:

```typescript
import { createRepositoryDataLoader } from '@/lib/github/dataloader'
import { graphqlClient, cacheManager } from '@/lib/github'

const repoLoader = createRepositoryDataLoader(graphqlClient, cacheManager)

// Load repository data (automatically batched)
const repo = await repoLoader.load({ owner: 'facebook', repo: 'react' })

// Load multiple repositories efficiently
const repos = await Promise.all([
  repoLoader.load({ owner: 'microsoft', repo: 'typescript' }),
  repoLoader.load({ owner: 'nodejs', repo: 'node' }),
  repoLoader.load({ owner: 'vercel', repo: 'next.js' })
])
```

## Configuration Options

```typescript
const loader = new DataLoader(batchFn, {
  // Enable/disable caching (default: true)
  cache: true,
  
  // Maximum batch size (default: Infinity)
  maxBatchSize: 50,
  
  // Custom cache key function
  cacheKeyFn: (key) => JSON.stringify(key),
  
  // Custom cache map implementation
  cacheMap: new Map(),
  
  // Custom batch scheduling function
  batchScheduleFn: (callback) => process.nextTick(callback)
})
```

## Cache Management

```typescript
// Prime the cache with known values
loader.prime('user-1', userData)

// Clear specific cache entries
loader.clear('user-1')

// Clear all cache entries
loader.clearAll()

// Get cache metrics
const metrics = loader.getCacheMetrics()
console.log(`Cache size: ${metrics.size}`)
```

## Error Handling

The DataLoader handles errors gracefully with proper typing:

```typescript
const results = await loader.loadMany(['valid-key', 'invalid-key'])

results.forEach((result, index) => {
  if (result instanceof Error) {
    console.error(`Error loading key ${index}:`, result.message)
  } else {
    console.log(`Loaded data:`, result)
  }
})
```

## Best Practices

### 1. Per-Request Instances
Create DataLoader instances per request to avoid data leaking between users:

```typescript
// Good: Create per request
function createRequestContext() {
  return {
    repoLoader: createRepositoryDataLoader(graphqlClient, cacheManager)
  }
}

// Bad: Shared instance
const globalRepoLoader = createRepositoryDataLoader(graphqlClient)
```

### 2. Batch Function Guidelines
- Always return an array with the same length as the input keys
- Return `Error` instances for failed items, not `null` or `undefined`
- Handle partial failures gracefully

```typescript
const batchFn = async (keys: readonly string[]) => {
  try {
    const results = await database.findByIds(keys)
    return keys.map(key => {
      const result = results.find(r => r.id === key)
      return result || new Error(`Not found: ${key}`)
    })
  } catch (error) {
    // Return error for all keys on batch failure
    return keys.map(() => error)
  }
}
```

### 3. Custom Cache Keys
Use meaningful cache keys for complex objects:

```typescript
const loader = new DataLoader(batchFn, {
  cacheKeyFn: (key: { userId: string; filter: string }) => 
    `${key.userId}:${key.filter}`
})
```

## GitHub GraphQL Integration

The repository DataLoader automatically:
- Builds efficient GraphQL queries with aliases
- Handles rate limit information
- Manages partial errors and field-level failures
- Integrates with the cache manager for persistence
- Sanitizes repository names for GraphQL safety

Example query generated:
```graphql
query BatchRepositoryLoader {
  repo0: repository(owner: "facebook", name: "react") {
    name
    owner { login }
    description
    stargazerCount
    forkCount
    createdAt
    updatedAt
    isPrivate
    url
    defaultBranchRef { name }
  }
  repo1: repository(owner: "microsoft", name: "typescript") {
    # ... same fields
  }
  rateLimit {
    limit
    remaining
    resetAt
    cost
  }
}
```

## Performance Considerations

- **Batch Size**: GitHub GraphQL has query complexity limits, default is 50 repositories per batch
- **Memory Usage**: Cache is stored in memory, clear when appropriate
- **Network**: Reduces N+1 queries to 1 batch request
- **Rate Limits**: Integrates with GitHub rate limit tracking

## Testing

Comprehensive test suite covers:
- Basic batching and caching functionality
- Error handling and edge cases
- GitHub-specific repository loading
- Cache integration and metrics
- TypeScript strict mode compliance

Run tests:
```bash
pnpm test tests/github/dataloader.test.ts
```

## Migration from Other DataLoaders

If migrating from the original `dataloader` package:

```typescript
// Old way
import DataLoader from 'dataloader'
const loader = new DataLoader(batchFn)

// New way
import { DataLoader } from '@/lib/github/dataloader'
const loader = new DataLoader(batchFn)
```

The API is largely compatible with improved TypeScript support and additional features.