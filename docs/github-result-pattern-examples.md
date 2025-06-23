# GitHub Result Pattern Usage Examples

This document provides practical, real-world examples of using the Result pattern with the GitHub API client. These examples demonstrate common scenarios and best practices.

## Table of Contents

1. [Basic Operations](#basic-operations)
2. [Complex Workflows](#complex-workflows)
3. [Error Recovery Scenarios](#error-recovery-scenarios)
4. [Testing Patterns](#testing-patterns)
5. [Integration with React/Next.js](#integration-with-reactnextjs)
6. [Background Jobs and Workers](#background-jobs-and-workers)

## Basic Operations

### Example 1: Repository Information Retrieval

```typescript
import { Result, AsyncResult } from "@/lib/github/result";
import { GitHubClient } from "@/lib/github/client";

class RepositoryService {
  constructor(private github: GitHubClient) {}

  /**
   * Get repository with enhanced error handling
   */
  async getRepositoryInfo(owner: string, repo: string) {
    const result = await this.github.getRepositoryResult(owner, repo);

    return result.match({
      success: (repository) => ({
        success: true,
        data: {
          id: repository.id,
          name: repository.name,
          description: repository.description,
          language: repository.language,
          stars: repository.stargazers_count,
          forks: repository.forks_count,
          isPrivate: repository.private,
          lastUpdated: repository.updated_at,
        },
      }),
      failure: (error) => ({
        success: false,
        error: {
          type: error._tag,
          message: error.message,
          retryable: error.retryable,
          suggestions: error.classification?.suggestedActions || [],
        },
      }),
    });
  }

  /**
   * Get multiple repositories with partial success handling
   */
  async getMultipleRepositories(repos: Array<{ owner: string; repo: string }>) {
    const promises = repos.map(({ owner, repo }) =>
      this.github.getRepositoryResult(owner, repo)
    );

    const results = await Promise.all(promises);

    const successful = results
      .filter((r) => r.isSuccess())
      .map((r) => r.unwrap());

    const failed = results
      .filter((r) => r.isFailure())
      .map((r, index) => ({
        repository: `${repos[index].owner}/${repos[index].repo}`,
        error: r.unwrapError(),
      }));

    return {
      successful,
      failed,
      totalRequested: repos.length,
      successRate: successful.length / repos.length,
    };
  }
}
```

### Example 2: User Profile Operations

```typescript
class UserProfileService {
  constructor(private github: GitHubClient) {}

  /**
   * Get comprehensive user profile with fallback strategies
   */
  async getUserProfile(username: string) {
    // Primary data (required)
    const userResult = await this.github.getUserResult(username);

    if (userResult.isFailure()) {
      return userResult; // Early return if user doesn't exist
    }

    const user = userResult.unwrap();

    // Secondary data (optional, with fallbacks)
    const [reposResult, followersResult, orgsResult] = await Promise.all([
      this.github.getUserRepositoriesResult(username),
      this.github.getUserFollowersResult(username),
      this.github.getUserOrganizationsResult(username),
    ]);

    return Result.succeed({
      user,
      repositories: reposResult.unwrapOr([]),
      followers: followersResult.unwrapOr([]),
      organizations: orgsResult.unwrapOr([]),
      // Derived metrics
      totalStars: reposResult
        .unwrapOr([])
        .reduce((sum, repo) => sum + repo.stargazers_count, 0),
      profileCompleteness: this.calculateProfileCompleteness(user),
      lastActivity: this.findLastActivity(reposResult.unwrapOr([])),
    });
  }

  private calculateProfileCompleteness(user: any): number {
    const fields = ["name", "bio", "location", "company", "blog"];
    const filledFields = fields.filter((field) => user[field]);
    return filledFields.length / fields.length;
  }

  private findLastActivity(repositories: any[]): Date | null {
    if (repositories.length === 0) return null;

    const lastPush = repositories
      .map((repo) => new Date(repo.pushed_at))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return lastPush;
  }
}
```

## Complex Workflows

### Example 3: Repository Analysis Pipeline

```typescript
interface RepositoryAnalysis {
  repository: Repository;
  languages: LanguageStats;
  contributors: Contributor[];
  issues: IssueStats;
  pullRequests: PullRequestStats;
  healthScore: number;
}

class RepositoryAnalyzer {
  constructor(private github: GitHubClient) {}

  /**
   * Comprehensive repository analysis with staged error handling
   */
  async analyzeRepository(
    owner: string,
    repo: string
  ): AsyncResult<RepositoryAnalysis, GitHubError> {
    // Stage 1: Get basic repository information
    const repoResult = await this.github.getRepositoryResult(owner, repo);
    if (repoResult.isFailure()) {
      return repoResult;
    }

    const repository = repoResult.unwrap();

    // Stage 2: Gather supplementary data in parallel
    const [
      languagesResult,
      contributorsResult,
      issuesResult,
      pullRequestsResult,
    ] = await Promise.all([
      this.getLanguageStats(owner, repo),
      this.getContributorStats(owner, repo),
      this.getIssueStats(owner, repo),
      this.getPullRequestStats(owner, repo),
    ]);

    // Stage 3: Combine results with partial success handling
    return Result.succeed({
      repository,
      languages: languagesResult.unwrapOr({}),
      contributors: contributorsResult.unwrapOr([]),
      issues: issuesResult.unwrapOr({ open: 0, closed: 0 }),
      pullRequests: pullRequestsResult.unwrapOr({
        open: 0,
        closed: 0,
        merged: 0,
      }),
      healthScore: this.calculateHealthScore({
        repository,
        hasLanguages: languagesResult.isSuccess(),
        hasContributors: contributorsResult.isSuccess(),
        hasIssueData: issuesResult.isSuccess(),
        hasPRData: pullRequestsResult.isSuccess(),
      }),
    });
  }

  private async getLanguageStats(
    owner: string,
    repo: string
  ): AsyncResult<LanguageStats, GitHubError> {
    return this.github
      .getRepositoryLanguagesResult(owner, repo)
      .map((languages) => {
        const total = Object.values(languages).reduce(
          (sum, bytes) => sum + bytes,
          0
        );
        return Object.entries(languages).reduce(
          (stats, [lang, bytes]) => ({
            ...stats,
            [lang]: {
              bytes,
              percentage: (bytes / total) * 100,
            },
          }),
          {}
        );
      });
  }

  private async getContributorStats(
    owner: string,
    repo: string
  ): AsyncResult<Contributor[], GitHubError> {
    return this.github
      .getRepositoryContributorsResult(owner, repo)
      .map((contributors) =>
        contributors.map((contributor) => ({
          ...contributor,
          contributionLevel: this.categorizeContributor(
            contributor.contributions
          ),
        }))
      );
  }

  private async getIssueStats(
    owner: string,
    repo: string
  ): AsyncResult<IssueStats, GitHubError> {
    const openIssues = await this.github.getRepositoryIssuesResult(
      owner,
      repo,
      { state: "open" }
    );
    const closedIssues = await this.github.getRepositoryIssuesResult(
      owner,
      repo,
      { state: "closed" }
    );

    if (openIssues.isFailure() && closedIssues.isFailure()) {
      return openIssues; // Return first error
    }

    return Result.succeed({
      open: openIssues.unwrapOr([]).length,
      closed: closedIssues.unwrapOr([]).length,
      avgCloseTime: this.calculateAverageCloseTime(closedIssues.unwrapOr([])),
    });
  }

  private async getPullRequestStats(
    owner: string,
    repo: string
  ): AsyncResult<PullRequestStats, GitHubError> {
    const allPRs = await this.github.getRepositoryPullRequestsResult(
      owner,
      repo,
      { state: "all" }
    );

    return allPRs.map((prs) => ({
      open: prs.filter((pr) => pr.state === "open").length,
      closed: prs.filter((pr) => pr.state === "closed" && !pr.merged_at).length,
      merged: prs.filter((pr) => pr.merged_at).length,
      avgMergeTime: this.calculateAverageMergeTime(
        prs.filter((pr) => pr.merged_at)
      ),
    }));
  }

  private calculateHealthScore(data: {
    repository: Repository;
    hasLanguages: boolean;
    hasContributors: boolean;
    hasIssueData: boolean;
    hasPRData: boolean;
  }): number {
    let score = 0;

    // Base score from repository data
    if (data.repository.description) score += 10;
    if (data.repository.homepage) score += 5;
    if (data.repository.stargazers_count > 0) score += 10;
    if (data.repository.forks_count > 0) score += 10;

    // Bonus for available supplementary data
    if (data.hasLanguages) score += 15;
    if (data.hasContributors) score += 15;
    if (data.hasIssueData) score += 15;
    if (data.hasPRData) score += 20;

    return Math.min(score, 100);
  }

  private categorizeContributor(contributions: number): string {
    if (contributions >= 100) return "major";
    if (contributions >= 20) return "regular";
    if (contributions >= 5) return "occasional";
    return "minimal";
  }

  private calculateAverageCloseTime(issues: any[]): number {
    // Implementation for calculating average close time
    return 0;
  }

  private calculateAverageMergeTime(prs: any[]): number {
    // Implementation for calculating average merge time
    return 0;
  }
}
```

### Example 4: Batch Operations with Progress Tracking

```typescript
interface BatchProgress {
  completed: number;
  total: number;
  percentage: number;
  currentItem?: string;
  errors: Array<{ item: string; error: string }>;
}

class BatchRepositoryProcessor {
  constructor(private github: GitHubClient) {}

  /**
   * Process multiple repositories with progress tracking and error recovery
   */
  async processBatchRepositories(
    repositories: Array<{ owner: string; repo: string }>,
    onProgress?: (progress: BatchProgress) => void
  ): AsyncResult<BatchProcessingResult, GitHubError> {
    const results: Array<{
      repository: string;
      result: Result<RepositoryAnalysis, GitHubError>;
    }> = [];

    const progress: BatchProgress = {
      completed: 0,
      total: repositories.length,
      percentage: 0,
      errors: [],
    };

    for (const [index, { owner, repo }] of repositories.entries()) {
      const repoName = `${owner}/${repo}`;
      progress.currentItem = repoName;

      if (onProgress) {
        onProgress({ ...progress });
      }

      // Process with retry logic
      const result = await this.processRepositoryWithRetry(owner, repo);

      results.push({ repository: repoName, result });

      if (result.isFailure()) {
        progress.errors.push({
          item: repoName,
          error: result.unwrapError().message,
        });
      }

      progress.completed = index + 1;
      progress.percentage = (progress.completed / progress.total) * 100;

      // Rate limiting - pause between requests
      if (index < repositories.length - 1) {
        await this.delay(1000); // 1 second between requests
      }
    }

    progress.currentItem = undefined;
    if (onProgress) {
      onProgress({ ...progress });
    }

    const successful = results
      .filter(({ result }) => result.isSuccess())
      .map(({ repository, result }) => ({
        repository,
        analysis: result.unwrap(),
      }));

    const failed = results
      .filter(({ result }) => result.isFailure())
      .map(({ repository, result }) => ({
        repository,
        error: result.unwrapError(),
      }));

    return Result.succeed({
      successful,
      failed,
      summary: {
        total: repositories.length,
        successful: successful.length,
        failed: failed.length,
        successRate: successful.length / repositories.length,
      },
    });
  }

  private async processRepositoryWithRetry(
    owner: string,
    repo: string,
    maxRetries = 2
  ): AsyncResult<RepositoryAnalysis, GitHubError> {
    const analyzer = new RepositoryAnalyzer(this.github);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await analyzer.analyzeRepository(owner, repo);

      if (result.isSuccess()) {
        return result;
      }

      const error = result.unwrapError();

      // Don't retry on non-retryable errors
      if (!error.retryable || attempt === maxRetries) {
        return result;
      }

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await this.delay(delay);
    }

    // This should never be reached, but TypeScript requires it
    return Result.fail(GitHubErrorFactory.serverError("Max retries exceeded"));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

interface BatchProcessingResult {
  successful: Array<{ repository: string; analysis: RepositoryAnalysis }>;
  failed: Array<{ repository: string; error: GitHubError }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
}
```

## Error Recovery Scenarios

### Example 5: Token Rotation and Fallback

```typescript
class ResilientGitHubClient {
  private tokens: string[];
  private currentTokenIndex = 0;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  /**
   * Get repository with automatic token rotation on rate limit
   */
  async getRepositoryWithFallback(
    owner: string,
    repo: string
  ): AsyncResult<Repository, GitHubError> {
    return this.executeWithFallback(
      () => this.github.getRepositoryResult(owner, repo),
      `getRepository:${owner}/${repo}`
    );
  }

  private async executeWithFallback<T>(
    operation: () => AsyncResult<T, GitHubError>,
    operationKey: string
  ): AsyncResult<T, GitHubError> {
    // Check circuit breaker
    const circuitBreaker = this.getCircuitBreaker(operationKey);
    if (circuitBreaker.isOpen()) {
      return Result.fail(
        GitHubErrorFactory.circuitBreakerError(
          "Circuit breaker is open for this operation"
        )
      );
    }

    let lastError: GitHubError | null = null;

    // Try with each available token
    for (
      let tokenAttempt = 0;
      tokenAttempt < this.tokens.length;
      tokenAttempt++
    ) {
      try {
        const result = await operation();

        if (result.isSuccess()) {
          circuitBreaker.recordSuccess();
          return result;
        }

        const error = result.unwrapError();
        lastError = error;

        // If rate limited, try next token
        if (error._tag === "RateLimitError") {
          this.rotateToken();
          continue;
        }

        // For other errors, don't try other tokens
        circuitBreaker.recordFailure();
        return result;
      } catch (error) {
        lastError = GitHubErrorFactory.networkError(
          error instanceof Error ? error.message : String(error)
        );
        circuitBreaker.recordFailure();
      }
    }

    // All tokens exhausted
    return Result.fail(
      lastError ||
        GitHubErrorFactory.serverError("All authentication tokens exhausted")
    );
  }

  private rotateToken(): void {
    this.currentTokenIndex = (this.currentTokenIndex + 1) % this.tokens.length;
    // Update the GitHub client with the new token
    this.github.updateToken(this.tokens[this.currentTokenIndex]);
  }

  private getCircuitBreaker(key: string): CircuitBreaker {
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(
        key,
        new CircuitBreaker({
          failureThreshold: 5,
          resetTimeout: 60000, // 1 minute
        })
      );
    }
    return this.circuitBreakers.get(key)!;
  }
}
```

### Example 6: Cached Results with Stale-While-Revalidate

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
}

class CachedGitHubService {
  private cache = new Map<string, CacheEntry<any>>();

  constructor(
    private github: GitHubClient,
    private defaultTTL = 300000 // 5 minutes
  ) {}

  /**
   * Get repository with stale-while-revalidate caching
   */
  async getRepositoryWithCache(
    owner: string,
    repo: string,
    options: { forceFresh?: boolean; staleWhileRevalidate?: boolean } = {}
  ): AsyncResult<Repository, GitHubError> {
    const cacheKey = `repo:${owner}/${repo}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // Force fresh data
    if (options.forceFresh) {
      return this.fetchAndCache(cacheKey, owner, repo);
    }

    // No cached data
    if (!cached) {
      return this.fetchAndCache(cacheKey, owner, repo);
    }

    // Fresh cached data
    const age = now - cached.timestamp;
    if (age < this.defaultTTL) {
      return Result.succeed(cached.data);
    }

    // Stale data with background revalidation
    if (options.staleWhileRevalidate) {
      // Return stale data immediately
      setImmediate(() => {
        this.fetchAndCache(cacheKey, owner, repo, cached.etag);
      });
      return Result.succeed(cached.data);
    }

    // Stale data, fetch fresh
    return this.fetchAndCache(cacheKey, owner, repo, cached.etag);
  }

  private async fetchAndCache(
    cacheKey: string,
    owner: string,
    repo: string,
    etag?: string
  ): AsyncResult<Repository, GitHubError> {
    const headers = etag ? { "If-None-Match": etag } : {};

    const result = await this.github.getRepositoryResult(owner, repo, {
      headers,
    });

    return result.match({
      success: (repository) => {
        // Cache the successful result
        this.cache.set(cacheKey, {
          data: repository,
          timestamp: Date.now(),
          etag: this.extractEtag(repository),
        });
        return Result.succeed(repository);
      },
      failure: (error) => {
        // If 304 Not Modified, return cached data
        if (error._tag === "NotModifiedError") {
          const cached = this.cache.get(cacheKey);
          if (cached) {
            // Update timestamp but keep data
            cached.timestamp = Date.now();
            return Result.succeed(cached.data);
          }
        }

        // For other errors, check if we have stale data to fallback to
        const cached = this.cache.get(cacheKey);
        if (cached && this.shouldUseCachedOnError(error)) {
          return Result.succeed(cached.data);
        }

        return Result.fail(error);
      },
    });
  }

  private extractEtag(data: any): string | undefined {
    // Extract ETag from response headers if available
    return undefined;
  }

  private shouldUseCachedOnError(error: GitHubError): boolean {
    // Use cached data for network errors, rate limits, but not for auth errors
    return ["NetworkError", "RateLimitError", "ServerError"].includes(
      error._tag
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

## Testing Patterns

### Example 7: Testing Result Pattern Code

```typescript
import { describe, it, expect, vi } from "vitest";
import { Result } from "@/lib/github/result";
import { GitHubErrorFactory } from "@/lib/github/result";

describe("RepositoryService", () => {
  let mockGitHubClient: {
    getRepositoryResult: vi.Mock;
    getUserRepositoriesResult: vi.Mock;
  };

  let repositoryService: RepositoryService;

  beforeEach(() => {
    mockGitHubClient = {
      getRepositoryResult: vi.fn(),
      getUserRepositoriesResult: vi.fn(),
    };

    repositoryService = new RepositoryService(mockGitHubClient as any);
  });

  describe("getRepositoryInfo", () => {
    it("should return formatted repository data on success", async () => {
      // Arrange
      const mockRepo = {
        id: 123,
        name: "test-repo",
        description: "A test repository",
        language: "TypeScript",
        stargazers_count: 42,
        forks_count: 7,
        private: false,
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGitHubClient.getRepositoryResult.mockResolvedValue(
        Result.succeed(mockRepo)
      );

      // Act
      const result = await repositoryService.getRepositoryInfo("owner", "repo");

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 123,
        name: "test-repo",
        description: "A test repository",
        language: "TypeScript",
        stars: 42,
        forks: 7,
        isPrivate: false,
        lastUpdated: "2024-01-01T00:00:00Z",
      });
    });

    it("should return error information on failure", async () => {
      // Arrange
      const mockError = GitHubErrorFactory.notFoundError(
        "Repository not found"
      );
      mockGitHubClient.getRepositoryResult.mockResolvedValue(
        Result.fail(mockError)
      );

      // Act
      const result = await repositoryService.getRepositoryInfo(
        "owner",
        "nonexistent"
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        type: "NotFoundError",
        message: "Repository not found",
        retryable: false,
        suggestions: expect.any(Array),
      });
    });
  });

  describe("getMultipleRepositories", () => {
    it("should handle partial success correctly", async () => {
      // Arrange
      const repos = [
        { owner: "owner1", repo: "repo1" },
        { owner: "owner2", repo: "repo2" },
        { owner: "owner3", repo: "repo3" },
      ];

      const mockRepo1 = { id: 1, name: "repo1" };
      const mockRepo3 = { id: 3, name: "repo3" };
      const mockError = GitHubErrorFactory.notFoundError(
        "Repository not found"
      );

      mockGitHubClient.getRepositoryResult
        .mockResolvedValueOnce(Result.succeed(mockRepo1))
        .mockResolvedValueOnce(Result.fail(mockError))
        .mockResolvedValueOnce(Result.succeed(mockRepo3));

      // Act
      const result = await repositoryService.getMultipleRepositories(repos);

      // Assert
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.successRate).toBe(2 / 3);
      expect(result.failed[0].repository).toBe("owner2/repo2");
    });
  });
});

describe("Result pattern utilities", () => {
  describe("Result.succeed", () => {
    it("should create a successful result", () => {
      const result = Result.succeed("test data");

      expect(result.isSuccess()).toBe(true);
      expect(result.isFailure()).toBe(false);
      expect(result.unwrap()).toBe("test data");
    });
  });

  describe("Result.fail", () => {
    it("should create a failed result", () => {
      const error = GitHubErrorFactory.validationError("Invalid input");
      const result = Result.fail(error);

      expect(result.isSuccess()).toBe(false);
      expect(result.isFailure()).toBe(true);
      expect(result.unwrapError()).toBe(error);
    });
  });

  describe("Result chaining", () => {
    it("should chain successful operations", async () => {
      const result = Result.succeed(5)
        .map((x) => x * 2)
        .map((x) => x.toString());

      expect(result.unwrap()).toBe("10");
    });

    it("should short-circuit on first error", async () => {
      const error = GitHubErrorFactory.serverError("Server error");

      const result = Result.succeed(5)
        .flatMap((x) => Result.fail(error))
        .map((x) => x * 2); // This should not execute

      expect(result.isFailure()).toBe(true);
      expect(result.unwrapError()).toBe(error);
    });
  });
});
```

## Integration with React/Next.js

### Example 8: React Hook for Repository Data

```typescript
import { useState, useEffect } from "react";
import { Result } from "@/lib/github/result";
import type { GitHubError } from "@/lib/github/result";

interface UseRepositoryResult {
  data: Repository | null;
  loading: boolean;
  error: GitHubError | null;
  retry: () => void;
  refresh: () => void;
}

export function useRepository(
  owner: string | null,
  repo: string | null,
  options: {
    enabled?: boolean;
    retryOnMount?: boolean;
    cacheTime?: number;
  } = {}
): UseRepositoryResult {
  const [data, setData] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GitHubError | null>(null);

  const { enabled = true, retryOnMount = true, cacheTime = 300000 } = options;

  const fetchRepository = async (force = false) => {
    if (!owner || !repo || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const repositoryService = new RepositoryService(githubClient);
      const result = await repositoryService.getRepositoryInfo(owner, repo);

      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
        setData(null);
      }
    } catch (err) {
      setError(
        GitHubErrorFactory.networkError(
          err instanceof Error ? err.message : "Unknown error"
        )
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const retry = () => fetchRepository(true);
  const refresh = () => fetchRepository(true);

  useEffect(() => {
    if (owner && repo && enabled) {
      fetchRepository();
    }
  }, [owner, repo, enabled]);

  return {
    data,
    loading,
    error,
    retry,
    refresh,
  };
}

// Usage in component
function RepositoryPage({ owner, repo }: { owner: string; repo: string }) {
  const { data, loading, error, retry } = useRepository(owner, repo);

  if (loading) {
    return <div>Loading repository...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <h3>Failed to load repository</h3>
        <p>{error.message}</p>
        {error.retryable && <button onClick={retry}>Try Again</button>}
        {error.suggestions && error.suggestions.length > 0 && (
          <div>
            <h4>Suggestions:</h4>
            <ul>
              {error.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return <div>No repository data available</div>;
  }

  return (
    <div className="repository">
      <h1>{data.name}</h1>
      <p>{data.description}</p>
      <div className="stats">
        <span>⭐ {data.stars}</span>
        <span>🍴 {data.forks}</span>
        <span>💻 {data.language}</span>
      </div>
    </div>
  );
}
```

### Example 9: Next.js API Route with Result Pattern

```typescript
// pages/api/repositories/[owner]/[repo].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { RepositoryService } from "@/lib/services/repository";
import { createGitHubClient } from "@/lib/github/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { owner, repo } = req.query;

  if (typeof owner !== "string" || typeof repo !== "string") {
    return res.status(400).json({
      error: "Invalid parameters",
      message: "Owner and repo must be strings",
    });
  }

  try {
    const githubClient = createGitHubClient(process.env.GITHUB_TOKEN!);
    const repositoryService = new RepositoryService(githubClient);

    const result = await repositoryService.getRepositoryInfo(owner, repo);

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.data,
      });
    } else {
      const { error } = result;

      // Map GitHub errors to appropriate HTTP status codes
      const statusCode = (() => {
        switch (error.type) {
          case "NotFoundError":
            return 404;
          case "AuthenticationError":
            return 401;
          case "AuthorizationError":
            return 403;
          case "RateLimitError":
            return 429;
          case "ValidationError":
            return 422;
          default:
            return 500;
        }
      })();

      res.status(statusCode).json({
        success: false,
        error: {
          type: error.type,
          message: error.message,
          retryable: error.retryable,
          ...(error.type === "RateLimitError" && {
            retryAfter: error.retryAfter,
          }),
        },
      });
    }
  } catch (err) {
    console.error("Unexpected error in repository API:", err);
    res.status(500).json({
      success: false,
      error: {
        type: "ServerError",
        message: "Internal server error",
        retryable: true,
      },
    });
  }
}
```

## Background Jobs and Workers

### Example 10: Repository Analysis Worker

```typescript
interface AnalysisJob {
  id: string;
  owner: string;
  repo: string;
  priority: "low" | "medium" | "high";
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  scheduledFor?: Date;
}

class RepositoryAnalysisWorker {
  private queue: AnalysisJob[] = [];
  private processing = false;
  private concurrency = 3;

  constructor(
    private github: GitHubClient,
    private onComplete: (
      job: AnalysisJob,
      result: Result<RepositoryAnalysis, GitHubError>
    ) => void,
    private onProgress?: (job: AnalysisJob, progress: number) => void
  ) {}

  async addJob(
    owner: string,
    repo: string,
    options: {
      priority?: "low" | "medium" | "high";
      maxRetries?: number;
      scheduleFor?: Date;
    } = {}
  ): Promise<string> {
    const job: AnalysisJob = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      owner,
      repo,
      priority: options.priority || "medium",
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      createdAt: new Date(),
      scheduledFor: options.scheduleFor,
    };

    this.queue.push(job);
    this.sortQueue();

    if (!this.processing) {
      this.startProcessing();
    }

    return job.id;
  }

  private async startProcessing(): Promise<void> {
    this.processing = true;

    const workers = Array.from({ length: this.concurrency }, (_, index) =>
      this.worker(`worker-${index}`)
    );

    await Promise.all(workers);
    this.processing = false;
  }

  private async worker(workerId: string): Promise<void> {
    while (this.queue.length > 0) {
      const job = this.getNextJob();
      if (!job) {
        await this.delay(1000); // Wait for new jobs
        continue;
      }

      console.log(
        `${workerId} processing job ${job.id} (${job.owner}/${job.repo})`
      );

      const result = await this.processJob(job);

      if (result.isSuccess()) {
        this.onComplete(job, result);
      } else {
        await this.handleJobFailure(job, result.unwrapError());
      }
    }
  }

  private getNextJob(): AnalysisJob | null {
    const now = new Date();

    // Find the highest priority job that's ready to run
    for (let i = 0; i < this.queue.length; i++) {
      const job = this.queue[i];
      if (!job.scheduledFor || job.scheduledFor <= now) {
        return this.queue.splice(i, 1)[0];
      }
    }

    return null;
  }

  private async processJob(
    job: AnalysisJob
  ): AsyncResult<RepositoryAnalysis, GitHubError> {
    const analyzer = new RepositoryAnalyzer(this.github);

    // Report progress
    if (this.onProgress) {
      this.onProgress(job, 0);
    }

    try {
      const result = await analyzer.analyzeRepository(job.owner, job.repo);

      if (this.onProgress) {
        this.onProgress(job, 100);
      }

      return result;
    } catch (error) {
      return Result.fail(
        GitHubErrorFactory.serverError(
          error instanceof Error ? error.message : "Unknown error"
        )
      );
    }
  }

  private async handleJobFailure(
    job: AnalysisJob,
    error: GitHubError
  ): Promise<void> {
    job.retryCount++;

    if (job.retryCount <= job.maxRetries && error.retryable) {
      // Schedule retry with exponential backoff
      const delayMinutes = Math.pow(2, job.retryCount - 1) * 5; // 5, 10, 20 minutes
      job.scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);

      this.queue.push(job);
      this.sortQueue();

      console.log(
        `Job ${job.id} scheduled for retry ${job.retryCount}/${job.maxRetries} in ${delayMinutes} minutes`
      );
    } else {
      // Max retries reached or non-retryable error
      this.onComplete(job, Result.fail(error));
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by scheduled time
      const aTime = a.scheduledFor?.getTime() || 0;
      const bTime = b.scheduledFor?.getTime() || 0;
      if (aTime !== bTime) return aTime - bTime;

      // Then by priority
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getQueueStatus() {
    return {
      total: this.queue.length,
      byPriority: {
        high: this.queue.filter((j) => j.priority === "high").length,
        medium: this.queue.filter((j) => j.priority === "medium").length,
        low: this.queue.filter((j) => j.priority === "low").length,
      },
      processing: this.processing,
    };
  }
}

// Usage
const worker = new RepositoryAnalysisWorker(
  githubClient,
  (job, result) => {
    if (result.isSuccess()) {
      console.log(
        `Analysis complete for ${job.owner}/${job.repo}:`,
        result.unwrap()
      );
    } else {
      console.error(
        `Analysis failed for ${job.owner}/${job.repo}:`,
        result.unwrapError()
      );
    }
  },
  (job, progress) => {
    console.log(`Job ${job.id} progress: ${progress}%`);
  }
);

// Add jobs
await worker.addJob("facebook", "react", { priority: "high" });
await worker.addJob("microsoft", "vscode", { priority: "medium" });
await worker.addJob("google", "tensorflow", {
  priority: "low",
  scheduleFor: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
});
```

These examples demonstrate practical, real-world usage of the Result pattern in various scenarios, from simple API calls to complex batch processing and background workers. The pattern provides consistent error handling while maintaining type safety and composability across different application layers.
