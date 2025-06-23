# GitHub Result Pattern Integration Guide

This guide provides practical examples and patterns for integrating the Result type system into existing and new GitHub API client code.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Integration Patterns](#core-integration-patterns)
3. [Advanced Usage Examples](#advanced-usage-examples)
4. [Error Handling Strategies](#error-handling-strategies)
5. [Type Safety Best Practices](#type-safety-best-practices)
6. [Performance Optimization](#performance-optimization)
7. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)

## Quick Start

### Basic Result Usage

```typescript
import { Result, AsyncResult, GitHubErrorFactory } from '@/lib/github/result';
import { ErrorMapper } from '@/lib/github/errors/enhanced';

// Simple success case
const success = Result.succeed({ id: 123, name: 'repository' });
console.log(success.unwrap()); // { id: 123, name: 'repository' }

// Simple error case
const error = Result.fail(GitHubErrorFactory.notFoundError('Repository not found'));
console.log(error.unwrapError()); // GitHubError with NotFoundError tag

// Async operations
const asyncResult = AsyncResult.fromPromise(
  fetch('/api/repos/owner/repo'),
  (error) => ErrorMapper.fromNetworkError(error).unwrapError()
);
```

### Converting Existing Code

```typescript
// Before: Traditional Promise-based approach
async function getRepository(owner: string, repo: string): Promise<Repository> {
  const response = await fetch(`/api/repos/${owner}/${repo}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch repository: ${response.status}`);
  }
  return response.json();
}

// After: Result-based approach
async function getRepositoryResult(owner: string, repo: string): AsyncResult<Repository, GitHubError> {
  return AsyncResult.fromPromise(
    fetch(`/api/repos/${owner}/${repo}`),
    (error) => ErrorMapper.fromNetworkError(error).unwrapError()
  ).flatMap(response => {
    if (!response.ok) {
      return Result.fail(GitHubErrorFactory.serverError(
        `Failed to fetch repository: ${response.status}`,
        response.status
      ));
    }
    return AsyncResult.fromPromise(
      response.json(),
      (error) => GitHubErrorFactory.validationError('Invalid JSON response')
    );
  });
}
```

## Core Integration Patterns

### Pattern 1: Chaining Operations

Chain multiple operations with automatic error propagation:

```typescript
async function getRepositoryWithStatistics(
  owner: string, 
  repo: string
): AsyncResult<RepositoryWithStats, GitHubError> {
  return getRepositoryResult(owner, repo)
    .flatMap(repository => 
      getRepositoryStatisticsResult(owner, repo)
        .map(stats => ({
          ...repository,
          statistics: stats
        }))
    );
}

// Usage
const result = await getRepositoryWithStatistics('octocat', 'Hello-World');
result.match({
  success: (repoWithStats) => {
    console.log(`Repository ${repoWithStats.name} has ${repoWithStats.statistics.stars} stars`);
  },
  failure: (error) => {
    console.error(`Failed to fetch repository: ${error.message}`);
  }
});
```

### Pattern 2: Parallel Operations

Execute multiple operations in parallel and combine results:

```typescript
async function getUserProfile(username: string): AsyncResult<UserProfile, GitHubError> {
  const userResult = getUserResult(username);
  const reposResult = getUserRepositoriesResult(username);
  const followersResult = getUserFollowersResult(username);
  
  return AsyncResult.all([userResult, reposResult, followersResult])
    .map(([user, repositories, followers]) => ({
      user,
      repositories,
      followers,
      totalStars: repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0)
    }));
}

// Alternative with error aggregation
async function getUserProfileWithAggregation(
  username: string
): AsyncResult<Partial<UserProfile>, GitHubError> {
  const results = await Promise.all([
    getUserResult(username),
    getUserRepositoriesResult(username),
    getUserFollowersResult(username)
  ]);
  
  const successes = results.filter(r => r.isSuccess());
  const failures = results.filter(r => r.isFailure()).map(r => r.unwrapError());
  
  if (successes.length === 0) {
    return Result.fail(ErrorAggregation.combine(failures, 'getUserProfile'));
  }
  
  // Partial success - return what we could fetch
  const profile: Partial<UserProfile> = {};
  if (results[0].isSuccess()) profile.user = results[0].unwrap();
  if (results[1].isSuccess()) profile.repositories = results[1].unwrap();
  if (results[2].isSuccess()) profile.followers = results[2].unwrap();
  
  return Result.succeed(profile);
}
```

### Pattern 3: Conditional Operations

Execute operations based on previous results:

```typescript
async function getRepositoryOrFork(
  owner: string, 
  repo: string
): AsyncResult<Repository, GitHubError> {
  return getRepositoryResult(owner, repo)
    .flatMapError(error => {
      // If repository not found, try to find and fork it
      if (error._tag === 'NotFoundError') {
        return searchRepositoriesResult(repo)
          .flatMap(repos => {
            if (repos.length > 0) {
              return forkRepositoryResult(repos[0].owner.login, repos[0].name);
            }
            return Result.fail(error); // Original not found error
          });
      }
      return Result.fail(error); // Other errors
    });
}
```

### Pattern 4: Resource Management

Safely manage resources with automatic cleanup:

```typescript
class GitHubResourceManager {
  private resources: Array<{ cleanup: () => Promise<void> }> = [];
  
  async withResource<T>(
    createResource: () => Promise<{ resource: T; cleanup: () => Promise<void> }>,
    operation: (resource: T) => AsyncResult<any, GitHubError>
  ): AsyncResult<any, GitHubError> {
    return AsyncResult.create(async () => {
      const { resource, cleanup } = await createResource();
      this.resources.push({ cleanup });
      
      try {
        const result = await operation(resource);
        return result;
      } finally {
        await cleanup();
        const index = this.resources.findIndex(r => r.cleanup === cleanup);
        if (index >= 0) {
          this.resources.splice(index, 1);
        }
      }
    });
  }
  
  async cleanup(): Promise<void> {
    await Promise.all(this.resources.map(r => r.cleanup()));
    this.resources.length = 0;
  }
}

// Usage
const resourceManager = new GitHubResourceManager();

const result = await resourceManager.withResource(
  async () => {
    const connection = await createDatabaseConnection();
    return {
      resource: connection,
      cleanup: () => connection.close()
    };
  },
  (connection) => performDatabaseOperation(connection)
);
```

## Advanced Usage Examples

### Example 1: Batch Processing with Error Recovery

```typescript
async function processBatchRepositories(
  repositories: Array<{ owner: string; repo: string }>,
  options: {
    maxConcurrency?: number;
    retryFailures?: boolean;
    continueOnError?: boolean;
  } = {}
): AsyncResult<BatchResult<Repository>, GitHubError> {
  const { maxConcurrency = 5, retryFailures = true, continueOnError = true } = options;
  
  // Process in chunks to respect rate limits
  const chunks = chunkArray(repositories, maxConcurrency);
  const results: Array<Result<Repository, GitHubError>> = [];
  
  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async ({ owner, repo }) => {
      let result = await getRepositoryResult(owner, repo);
      
      // Retry on failure if requested
      if (result.isFailure() && retryFailures) {
        const error = result.unwrapError();
        if (error.recovery.canRecover) {
          result = await ErrorRecovery.executeRecovery(
            error,
            () => getRepositoryResult(owner, repo).unwrap(),
            { maxRetries: 2 }
          );
        }
      }
      
      return result;
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    
    // Stop on first error if not continuing on error
    if (!continueOnError && chunkResults.some(r => r.isFailure())) {
      break;
    }
    
    // Rate limiting delay between chunks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const successes = results.filter(r => r.isSuccess()).map(r => r.unwrap());
  const failures = results.filter(r => r.isFailure()).map(r => r.unwrapError());
  
  return Result.succeed({
    successes,
    failures,
    total: repositories.length,
    successRate: successes.length / repositories.length
  });
}

interface BatchResult<T> {
  successes: T[];
  failures: GitHubError[];
  total: number;
  successRate: number;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

### Example 2: Caching with Result Pattern

```typescript
class CachedGitHubClient {
  private cache = new Map<string, {
    result: Result<any, GitHubError>;
    timestamp: number;
    ttl: number;
  }>();
  
  async getCachedRepository(
    owner: string,
    repo: string,
    options: { ttl?: number; forceRefresh?: boolean } = {}
  ): AsyncResult<Repository, GitHubError> {
    const cacheKey = `repo:${owner}/${repo}`;
    const { ttl = 300000, forceRefresh = false } = options; // 5 minutes default TTL
    
    // Check cache first
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
        return AsyncResult.create(async () => cached.result);
      }
    }
    
    // Fetch fresh data
    const result = await getRepositoryResult(owner, repo);
    
    // Cache the result (both success and failure)
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl
    });
    
    // Clean up expired entries periodically
    this.cleanupExpiredEntries();
    
    return AsyncResult.create(async () => result);
  }
  
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
  
  clearCache(): void {
    this.cache.clear();
  }
}
```

### Example 3: Configuration-Driven Error Handling

```typescript
interface GitHubClientConfig {
  retryConfig: {
    maxRetries: number;
    retryableErrors: GitHubErrorTag[];
    retryDelay: number;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
  caching: {
    enabled: boolean;
    defaultTtl: number;
  };
}

class ConfigurableGitHubClient {
  private circuitBreaker?: CircuitBreaker;
  
  constructor(
    private auth: GitHubAuth,
    private config: GitHubClientConfig
  ) {
    if (config.circuitBreaker.enabled) {
      this.circuitBreaker = new CircuitBreaker(
        config.circuitBreaker.failureThreshold,
        config.circuitBreaker.resetTimeout
      );
    }
  }
  
  async getRepository(owner: string, repo: string): AsyncResult<Repository, GitHubError> {
    const operation = () => this.executeGetRepository(owner, repo);
    
    // Apply circuit breaker if enabled
    if (this.circuitBreaker) {
      return AsyncResult.create(() => this.circuitBreaker!.execute(operation));
    }
    
    return operation();
  }
  
  private async executeGetRepository(owner: string, repo: string): AsyncResult<Repository, GitHubError> {
    let result = await this.performGetRepository(owner, repo);
    
    // Apply retry logic if configured
    if (result.isFailure() && this.shouldRetry(result.unwrapError())) {
      for (let attempt = 1; attempt <= this.config.retryConfig.maxRetries; attempt++) {
        await this.delay(this.config.retryConfig.retryDelay * attempt);
        result = await this.performGetRepository(owner, repo);
        
        if (result.isSuccess()) {
          break;
        }
      }
    }
    
    return result;
  }
  
  private shouldRetry(error: GitHubError): boolean {
    return this.config.retryConfig.retryableErrors.includes(error._tag);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private async performGetRepository(owner: string, repo: string): AsyncResult<Repository, GitHubError> {
    // Actual implementation here
    return getRepositoryResult(owner, repo);
  }
}
```

## Error Handling Strategies

### Strategy 1: Layered Error Handling

```typescript
// Application Layer - High-level error handling
async function handleRepositoryOperation(
  operation: () => AsyncResult<Repository, GitHubError>
): Promise<{ repository?: Repository; userMessage: string; shouldRetry: boolean }> {
  const result = await operation();
  
  return result.match({
    success: (repository) => ({
      repository,
      userMessage: 'Operation completed successfully',
      shouldRetry: false
    }),
    failure: (error) => {
      switch (error._tag) {
        case 'NotFoundError':
          return {
            userMessage: 'Repository not found. Please check the owner and repository name.',
            shouldRetry: false
          };
        case 'RateLimitError':
          return {
            userMessage: `Rate limit exceeded. Please try again in ${error.retryAfter} seconds.`,
            shouldRetry: true
          };
        case 'AuthenticationError':
          return {
            userMessage: 'Authentication failed. Please check your credentials.',
            shouldRetry: false
          };
        case 'NetworkError':
          return {
            userMessage: 'Network error occurred. Please check your connection and try again.',
            shouldRetry: true
          };
        default:
          return {
            userMessage: 'An unexpected error occurred. Please try again later.',
            shouldRetry: error.retryable
          };
      }
    }
  });
}
```

### Strategy 2: Error Recovery Pipeline

```typescript
class ErrorRecoveryPipeline {
  private strategies: Array<{
    canHandle: (error: GitHubError) => boolean;
    recover: (error: GitHubError) => AsyncResult<any, GitHubError>;
  }> = [];
  
  addStrategy<T>(
    canHandle: (error: GitHubError) => boolean,
    recover: (error: GitHubError) => AsyncResult<T, GitHubError>
  ): this {
    this.strategies.push({ canHandle, recover });
    return this;
  }
  
  async execute<T>(
    operation: () => AsyncResult<T, GitHubError>
  ): AsyncResult<T, GitHubError> {
    let result = await operation();
    
    if (result.isFailure()) {
      const error = result.unwrapError();
      
      for (const strategy of this.strategies) {
        if (strategy.canHandle(error)) {
          result = await strategy.recover(error);
          if (result.isSuccess()) {
            break;
          }
        }
      }
    }
    
    return result;
  }
}

// Usage
const recoveryPipeline = new ErrorRecoveryPipeline()
  .addStrategy(
    (error) => error._tag === 'TokenExpiredError',
    async (error) => {
      // Attempt to refresh token
      const newToken = await refreshAuthToken();
      if (newToken) {
        // Retry original operation with new token
        return operation();
      }
      return Result.fail(error);
    }
  )
  .addStrategy(
    (error) => error._tag === 'RateLimitError',
    async (error) => {
      // Wait for rate limit reset
      await new Promise(resolve => 
        setTimeout(resolve, (error.retryAfter || 60) * 1000)
      );
      return operation();
    }
  );

const result = await recoveryPipeline.execute(() => 
  getRepositoryResult('owner', 'repo')
);
```

## Type Safety Best Practices

### 1. Explicit Error Types

Define specific error types for different operations:

```typescript
// Define operation-specific error types
type RepositoryError = 
  | GitHubNotFoundError 
  | GitHubAuthenticationError 
  | GitHubRateLimitError;

type UserError = 
  | GitHubNotFoundError 
  | GitHubAuthenticationError 
  | GitHubValidationError;

// Use in function signatures
async function getRepository(
  owner: string, 
  repo: string
): AsyncResult<Repository, RepositoryError> {
  // Implementation
}

async function getUser(username: string): AsyncResult<User, UserError> {
  // Implementation
}
```

### 2. Result Type Guards

Create type guards for safer error handling:

```typescript
function isRateLimitError(error: GitHubError): error is GitHubRateLimitError {
  return error._tag === 'RateLimitError';
}

function isNotFoundError(error: GitHubError): error is GitHubNotFoundError {
  return error._tag === 'NotFoundError';
}

// Usage with type safety
const result = await getRepositoryResult('owner', 'repo');
if (result.isFailure()) {
  const error = result.unwrapError();
  
  if (isRateLimitError(error)) {
    // TypeScript knows this is a RateLimitError
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (isNotFoundError(error)) {
    // TypeScript knows this is a NotFoundError
    console.log('Repository not found');
  }
}
```

### 3. Strongly Typed Operations

Create strongly typed operation builders:

```typescript
class RepositoryOperationBuilder {
  private owner?: string;
  private repo?: string;
  private includeStats = false;
  private includeContributors = false;
  
  setRepository(owner: string, repo: string): this {
    this.owner = owner;
    this.repo = repo;
    return this;
  }
  
  withStatistics(): this {
    this.includeStats = true;
    return this;
  }
  
  withContributors(): this {
    this.includeContributors = true;
    return this;
  }
  
  async execute(): AsyncResult<RepositoryData, GitHubError> {
    if (!this.owner || !this.repo) {
      return Result.fail(GitHubErrorFactory.validationError(
        'Owner and repository name are required'
      ));
    }
    
    return getRepositoryResult(this.owner, this.repo)
      .flatMap(repository => {
        if (this.includeStats || this.includeContributors) {
          return this.enrichRepository(repository);
        }
        return Result.succeed({ repository });
      });
  }
  
  private async enrichRepository(
    repository: Repository
  ): AsyncResult<RepositoryData, GitHubError> {
    const operations: Array<AsyncResult<any, GitHubError>> = [
      Result.succeed(repository)
    ];
    
    if (this.includeStats) {
      operations.push(getRepositoryStatisticsResult(this.owner!, this.repo!));
    }
    
    if (this.includeContributors) {
      operations.push(getRepositoryContributorsResult(this.owner!, this.repo!));
    }
    
    return AsyncResult.all(operations)
      .map(([repo, stats, contributors]) => ({
        repository: repo,
        statistics: stats,
        contributors
      }));
  }
}

// Usage
const result = await new RepositoryOperationBuilder()
  .setRepository('octocat', 'Hello-World')
  .withStatistics()
  .withContributors()
  .execute();
```

## Performance Optimization

### 1. Result Pooling

Reuse Result objects for common cases:

```typescript
class ResultPool {
  private static readonly commonSuccesses = new Map<string, Result<any, never>>();
  private static readonly commonFailures = new Map<string, Result<never, GitHubError>>();
  
  static getSuccess<T>(key: string, value: T): Result<T, never> {
    if (!this.commonSuccesses.has(key)) {
      this.commonSuccesses.set(key, Result.succeed(value));
    }
    return this.commonSuccesses.get(key)!;
  }
  
  static getFailure(key: string, error: GitHubError): Result<never, GitHubError> {
    if (!this.commonFailures.has(key)) {
      this.commonFailures.set(key, Result.fail(error));
    }
    return this.commonFailures.get(key)!;
  }
}

// Usage for common results
const emptyArrayResult = ResultPool.getSuccess('empty-array', []);
const notFoundResult = ResultPool.getFailure('not-found', 
  GitHubErrorFactory.notFoundError('Resource not found')
);
```

### 2. Lazy Error Enhancement

Only enhance errors when needed:

```typescript
class LazyGitHubError implements GitHubError {
  private _enhanced?: EnhancedGitHubError;
  
  constructor(private baseError: GitHubError) {}
  
  get enhanced(): EnhancedGitHubError {
    if (!this._enhanced) {
      this._enhanced = enhanceError(this.baseError);
    }
    return this._enhanced;
  }
  
  // Proxy all GitHubError properties to baseError
  get _tag() { return this.baseError._tag; }
  get message() { return this.baseError.message; }
  get severity() { return this.baseError.severity; }
  get retryable() { return this.baseError.retryable; }
  // ... other properties
}
```

### 3. Batch Operations Optimization

Optimize batch operations to reduce API calls:

```typescript
class BatchOptimizer {
  private pendingRequests = new Map<string, Promise<Result<any, GitHubError>>>();
  
  async getRepository(owner: string, repo: string): AsyncResult<Repository, GitHubError> {
    const key = `repo:${owner}/${repo}`;
    
    // Deduplicate concurrent requests
    if (this.pendingRequests.has(key)) {
      return AsyncResult.create(() => this.pendingRequests.get(key)!);
    }
    
    const promise = getRepositoryResult(owner, repo);
    this.pendingRequests.set(key, promise);
    
    // Clean up after completion
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });
    
    return promise;
  }
}
```

## Common Pitfalls and Solutions

### Pitfall 1: Forgetting to Handle Errors

```typescript
// ❌ Wrong: Not handling potential failures
const result = await getRepositoryResult('owner', 'repo');
const repository = result.unwrap(); // Can throw if result is failure

// ✅ Correct: Always handle both success and failure cases
const result = await getRepositoryResult('owner', 'repo');
const repository = result.match({
  success: (repo) => repo,
  failure: (error) => {
    console.error('Failed to get repository:', error.message);
    return null;
  }
});
```

### Pitfall 2: Not Using Type Guards

```typescript
// ❌ Wrong: Unsafe error handling
const result = await getRepositoryResult('owner', 'repo');
if (result.isFailure()) {
  const error = result.unwrapError();
  console.log(error.retryAfter); // May not exist on all error types
}

// ✅ Correct: Use type guards
const result = await getRepositoryResult('owner', 'repo');
if (result.isFailure()) {
  const error = result.unwrapError();
  if (isRateLimitError(error)) {
    console.log(`Retry after ${error.retryAfter} seconds`);
  }
}
```

### Pitfall 3: Improper Error Chaining

```typescript
// ❌ Wrong: Breaking the error chain
const result = await getRepositoryResult('owner', 'repo')
  .map(repo => {
    if (!repo.permissions?.admin) {
      throw new Error('No admin permissions'); // Throws instead of returning Result
    }
    return repo;
  });

// ✅ Correct: Maintain the Result chain
const result = await getRepositoryResult('owner', 'repo')
  .flatMap(repo => {
    if (!repo.permissions?.admin) {
      return Result.fail(GitHubErrorFactory.authorizationError('No admin permissions'));
    }
    return Result.succeed(repo);
  });
```

### Pitfall 4: Memory Leaks in Long-Running Operations

```typescript
// ❌ Wrong: Potential memory leak with large error objects
const results: Array<Result<Repository, GitHubError>> = [];
for (const repo of largeRepositoryList) {
  const result = await getRepositoryResult(repo.owner, repo.name);
  results.push(result); // Accumulating large error objects
}

// ✅ Correct: Process and extract only needed data
const repositories: Repository[] = [];
const errorSummary: Array<{ repo: string; error: string }> = [];

for (const repo of largeRepositoryList) {
  const result = await getRepositoryResult(repo.owner, repo.name);
  result.match({
    success: (repository) => repositories.push(repository),
    failure: (error) => errorSummary.push({
      repo: `${repo.owner}/${repo.name}`,
      error: error.message
    })
  });
}
```

This integration guide provides comprehensive patterns and examples for successfully implementing the Result pattern in GitHub API client operations. The key is to maintain consistency, handle errors explicitly, and leverage TypeScript's type system for safer code.