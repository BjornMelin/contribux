import { TIME, TOKEN_ROTATION_DEFAULTS } from '../constants'
import { GitHubTokenExpiredError } from '../errors'
import type { TokenInfo, TokenRotationConfig } from '../interfaces/token'
import { validateTokenRotationOptions } from '../schemas'

export interface TokenUsageStats {
  token: string
  usageCount: number
  lastUsed: Date
  errors: number
  errorRate: number
  successfulRequests: number
  avgResponseTime?: number
}

export interface TokenHealthMetrics {
  token: string
  isHealthy: boolean
  errorRate: number
  recentErrors: number
  lastSuccessfulUse?: Date
  quarantineUntil?: Date
}

export interface TokenRotationMetrics {
  totalTokens: number
  activeTokens: number
  quarantinedTokens: number
  totalRequests: number
  totalErrors: number
  overallErrorRate: number
  rotationStrategy: TokenRotationConfig['rotationStrategy']
}

/**
 * Advanced token rotation manager for high-volume GitHub API usage
 *
 * The TokenRotationManager provides intelligent token rotation to maximize API throughput
 * while respecting rate limits and maintaining system reliability. Features include:
 * - Multiple rotation strategies (round-robin, least-used, random)
 * - Automatic health monitoring and token quarantine
 * - Scope-based token selection
 * - Proactive token refresh before expiration
 * - Comprehensive usage statistics and metrics
 * - Thread-safe operations with async locking
 *
 * @example
 * ```typescript
 * // Configure token rotation with multiple tokens
 * const tokenManager = new TokenRotationManager({
 *   tokens: [
 *     { token: 'ghp_token1', type: 'token', scopes: ['repo', 'user'] },
 *     { token: 'ghp_token2', type: 'token', scopes: ['repo'] },
 *     { token: 'ghp_token3', type: 'token', scopes: ['repo', 'admin:org'] }
 *   ],
 *   rotationStrategy: 'least-used',
 *   refreshBeforeExpiry: 5 // Refresh 5 minutes before expiry
 * });
 *
 * // Get next available token
 * const token = await tokenManager.getNextToken();
 *
 * // Get token with specific scopes
 * const adminToken = await tokenManager.getTokenForScopes(['admin:org']);
 * ```
 */
export class TokenRotationManager {
  private tokens: TokenInfo[]
  private currentIndex = 0
  private usageStats: Map<string, TokenUsageStats> = new Map()
  private rotationStrategy: TokenRotationConfig['rotationStrategy']
  private refreshBeforeExpiry: number
  private tokenLock: Promise<void> = Promise.resolve()
  private quarantinedTokens: Map<string, number> = new Map() // token -> quarantine until timestamp
  private readonly QUARANTINE_DURATION = 5 * TIME.MINUTE // 5 minutes
  private readonly ERROR_RATE_THRESHOLD = 0.5 // 50% error rate triggers quarantine
  private readonly MIN_REQUESTS_FOR_QUARANTINE = 5 // Minimum requests before quarantine consideration

  /**
   * Creates a new TokenRotationManager with the specified configuration
   *
   * @param config - Token rotation configuration
   * @param config.tokens - Array of tokens to manage
   * @param config.rotationStrategy - Strategy for selecting tokens ('round-robin', 'least-used', 'random')
   * @param config.refreshBeforeExpiry - Minutes before expiry to refresh tokens (default: 5)
   *
   * @example
   * ```typescript
   * const manager = new TokenRotationManager({
   *   tokens: [
   *     { token: 'ghp_xxx', type: 'token' },
   *     { token: 'ghp_yyy', type: 'token' }
   *   ],
   *   rotationStrategy: 'round-robin',
   *   refreshBeforeExpiry: 10
   * });
   * ```
   */
  constructor(config: TokenRotationConfig) {
    // Validate config using Zod schema
    const validatedConfig = validateTokenRotationOptions(config)
    // Use validated tokens directly since config was already validated
    this.tokens = [...validatedConfig.tokens] as TokenInfo[]
    this.rotationStrategy = validatedConfig.rotationStrategy
    this.refreshBeforeExpiry =
      (validatedConfig.refreshBeforeExpiry ??
        TOKEN_ROTATION_DEFAULTS.TOKEN_EXPIRY_WARNING_MS / TIME.MINUTE) * TIME.MINUTE // Convert to ms

    // Initialize usage stats
    this.tokens.forEach(token => {
      this.usageStats.set(token.token, {
        token: token.token,
        usageCount: 0,
        lastUsed: new Date(0),
        errors: 0,
        errorRate: 0,
        successfulRequests: 0,
      })
    })
  }

  /**
   * Get the next available token using the configured rotation strategy
   *
   * This method selects a token based on the rotation strategy while ensuring
   * the token is not expired or quarantined. It automatically updates usage
   * statistics and applies thread-safe locking.
   *
   * @returns Next available token or null if no tokens are available
   *
   * @example
   * ```typescript
   * const token = await tokenManager.getNextToken();
   * if (token) {
   *   console.log(`Using token: ${token.token.substring(0, 8)}...`);
   *   // Use token for API request
   * } else {
   *   console.log('No tokens available');
   * }
   * ```
   */
  async getNextToken(): Promise<TokenInfo | null> {
    return this.withLock(async () => {
      // Filter out expired and quarantined tokens
      const validTokens = this.getValidTokens()

      if (validTokens.length === 0) {
        return null
      }

      let selectedToken: TokenInfo

      switch (this.rotationStrategy) {
        case 'round-robin':
          selectedToken = this.getRoundRobinToken(validTokens)
          break

        case 'least-used':
          selectedToken = this.getLeastUsedToken(validTokens)
          break

        case 'random':
          selectedToken = this.getRandomToken(validTokens)
          break

        default: {
          const defaultToken = validTokens[0]
          if (!defaultToken) {
            throw new GitHubTokenExpiredError('No valid tokens available')
          }
          selectedToken = defaultToken
        }
      }

      // Update usage stats
      this.updateTokenUsage(selectedToken.token)

      return selectedToken
    })
  }

  private getValidTokens(): TokenInfo[] {
    const now = Date.now()

    return this.tokens.filter(token => {
      // Check expiration
      if (token.expiresAt && new Date(token.expiresAt) <= new Date()) {
        return false
      }

      // Check quarantine status
      const quarantineUntil = this.quarantinedTokens.get(token.token)
      if (quarantineUntil && now < quarantineUntil) {
        return false
      }
      if (quarantineUntil && now >= quarantineUntil) {
        // Remove from quarantine
        this.quarantinedTokens.delete(token.token)
      }

      return true
    })
  }

  private getRoundRobinToken(tokens: TokenInfo[]): TokenInfo {
    // Find the current token in the valid tokens list
    const currentToken = this.tokens[this.currentIndex]
    const currentTokenIndex = currentToken
      ? tokens.findIndex(t => t.token === currentToken.token)
      : -1

    let nextIndex: number
    if (currentTokenIndex === -1) {
      // Current token is no longer valid, start from beginning
      nextIndex = 0
    } else {
      // Move to next token
      nextIndex = (currentTokenIndex + 1) % tokens.length
    }

    // Update the global index
    const selectedToken = tokens[nextIndex]
    if (!selectedToken) {
      throw new GitHubTokenExpiredError('No tokens available at index')
    }
    this.currentIndex = this.tokens.findIndex(t => t.token === selectedToken.token)

    return selectedToken
  }

  private getLeastUsedToken(tokens: TokenInfo[]): TokenInfo {
    // Consider both usage count and error rate for selection
    let bestToken = tokens[0]
    if (!bestToken) {
      throw new GitHubTokenExpiredError('No tokens available for least-used selection')
    }
    let bestScore = this.calculateTokenScore(bestToken)

    for (const token of tokens.slice(1)) {
      const score = this.calculateTokenScore(token)
      if (score > bestScore) {
        bestScore = score
        bestToken = token
      }
    }

    return bestToken
  }

  private calculateTokenScore(token: TokenInfo): number {
    const stats = this.usageStats.get(token.token)
    if (!stats) return 100 // New token gets high priority

    // Lower usage count = higher score
    const usageScore = Math.max(0, 100 - stats.usageCount)

    // Lower error rate = higher score
    const errorScore = Math.max(0, 100 - stats.errorRate * 100)

    // Combine scores with weights
    return usageScore * 0.6 + errorScore * 0.4
  }

  private getRandomToken(tokens: TokenInfo[]): TokenInfo {
    // Weighted random selection based on token health
    const weights = tokens.map(token => {
      const stats = this.usageStats.get(token.token)
      if (!stats) return 1

      // Healthy tokens get higher weight
      const healthWeight = Math.max(0.1, 1 - stats.errorRate)
      return healthWeight
    })

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    let random = Math.random() * totalWeight

    for (let i = 0; i < tokens.length; i++) {
      const weight = weights[i]
      if (weight !== undefined) {
        random -= weight
        if (random <= 0) {
          const selectedToken = tokens[i]
          if (selectedToken) {
            return selectedToken
          }
        }
      }
    }

    const fallbackToken = tokens[tokens.length - 1]
    if (!fallbackToken) {
      throw new GitHubTokenExpiredError('No fallback token available for random selection')
    }
    return fallbackToken
  }

  /**
   * Get a token that has the required OAuth scopes
   *
   * This method filters tokens based on required scopes and then applies
   * the rotation strategy to select the best available token.
   *
   * @param requiredScopes - Array of required OAuth scopes (e.g., ['repo', 'admin:org'])
   * @returns Token with required scopes or null if none available
   *
   * @example
   * ```typescript
   * // Get token with admin access
   * const adminToken = await tokenManager.getTokenForScopes(['admin:org']);
   *
   * // Get token for repository operations
   * const repoToken = await tokenManager.getTokenForScopes(['repo']);
   *
   * // Get token for user operations
   * const userToken = await tokenManager.getTokenForScopes(['user:read', 'user:email']);
   * ```
   */
  async getTokenForScopes(requiredScopes: string[]): Promise<TokenInfo | null> {
    return this.withLock(async () => {
      const validTokens = this.getValidTokens().filter(token => {
        // Check scopes
        if (!token.scopes || requiredScopes.length === 0) {
          return true
        }

        // Check if token has all required scopes
        return requiredScopes.every(required =>
          token.scopes?.some(scope => scope === required || scope.startsWith(`${required}:`))
        )
      })

      if (validTokens.length === 0) {
        return null
      }

      // Use the rotation strategy to select from valid tokens
      return this.getNextTokenFromList(validTokens)
    })
  }

  private getNextTokenFromList(tokens: TokenInfo[]): TokenInfo {
    switch (this.rotationStrategy) {
      case 'round-robin': {
        // Find first valid token in round-robin order
        for (let i = 0; i < this.tokens.length; i++) {
          const index = (this.currentIndex + i) % this.tokens.length
          const token = this.tokens[index]
          if (token && tokens.some(t => t.token === token.token)) {
            this.currentIndex = (index + 1) % this.tokens.length
            this.updateTokenUsage(token.token)
            return token
          }
        }
        const fallbackToken = tokens[0]
        if (!fallbackToken) {
          throw new GitHubTokenExpiredError('No fallback token available')
        }
        return fallbackToken
      }

      case 'least-used':
        return this.getLeastUsedToken(tokens)

      case 'random':
        return this.getRandomToken(tokens)

      default: {
        const defaultToken = tokens[0]
        if (!defaultToken) {
          throw new GitHubTokenExpiredError('No default token available')
        }
        return defaultToken
      }
    }
  }

  private updateTokenUsage(tokenString: string): void {
    const stats = this.usageStats.get(tokenString)
    if (stats) {
      stats.usageCount++
      stats.lastUsed = new Date()
    }
  }

  needsRefresh(token: TokenInfo): boolean {
    if (!token.expiresAt) return false

    const expiresAt = new Date(token.expiresAt).getTime()
    const now = Date.now()

    return now >= expiresAt - this.refreshBeforeExpiry
  }

  /**
   * Add a new token to the rotation pool
   *
   * If a token with the same string already exists, it will be updated.
   * Otherwise, it will be added as a new token with initialized statistics.
   *
   * @param token - Token information to add
   *
   * @example
   * ```typescript
   * tokenManager.addToken({
   *   token: 'ghp_newtoken',
   *   type: 'token',
   *   scopes: ['repo', 'user'],
   *   expiresAt: new Date('2024-12-31')
   * });
   * ```
   */
  addToken(token: TokenInfo): void {
    // Prevent duplicates
    const existingIndex = this.tokens.findIndex(t => t.token === token.token)
    if (existingIndex !== -1) {
      this.tokens[existingIndex] = token
    } else {
      this.tokens.push(token)
    }

    // Initialize usage stats
    if (!this.usageStats.has(token.token)) {
      this.usageStats.set(token.token, {
        token: token.token,
        usageCount: 0,
        lastUsed: new Date(0),
        errors: 0,
        errorRate: 0,
        successfulRequests: 0,
      })
    }
  }

  /**
   * Remove a token from the rotation pool
   *
   * This also clears all associated statistics and quarantine status.
   *
   * @param tokenString - Token string to remove
   *
   * @example
   * ```typescript
   * tokenManager.removeToken('ghp_oldtoken');
   * ```
   */
  removeToken(tokenString: string): void {
    this.tokens = this.tokens.filter(t => t.token !== tokenString)
    this.usageStats.delete(tokenString)
    this.quarantinedTokens.delete(tokenString)
  }

  /**
   * Update an existing token with new information
   *
   * This preserves usage statistics and quarantine status by transferring
   * them from the old token to the new one.
   *
   * @param oldToken - Current token string to replace
   * @param newToken - New token information
   *
   * @example
   * ```typescript
   * // Update token after refresh
   * tokenManager.updateToken('ghp_oldtoken', {
   *   token: 'ghp_newtoken',
   *   type: 'token',
   *   expiresAt: new Date('2024-12-31')
   * });
   * ```
   */
  updateToken(oldToken: string, newToken: TokenInfo): void {
    const index = this.tokens.findIndex(t => t.token === oldToken)
    if (index !== -1) {
      this.tokens[index] = newToken

      // Transfer usage stats
      const oldStats = this.usageStats.get(oldToken)
      if (oldStats) {
        this.usageStats.delete(oldToken)
        this.usageStats.set(newToken.token, {
          ...oldStats,
          token: newToken.token,
        })
      }

      // Transfer quarantine status
      const quarantineUntil = this.quarantinedTokens.get(oldToken)
      if (quarantineUntil) {
        this.quarantinedTokens.delete(oldToken)
        this.quarantinedTokens.set(newToken.token, quarantineUntil)
      }
    }
  }

  /**
   * Get all tokens currently in the rotation pool
   *
   * @returns Array of all token information (defensive copy)
   */
  getTokens(): TokenInfo[] {
    return [...this.tokens]
  }

  /**
   * Get usage statistics for all tokens
   *
   * @returns Array of usage statistics for monitoring and analysis
   *
   * @example
   * ```typescript
   * const stats = tokenManager.getStats();
   * stats.forEach(stat => {
   *   console.log(`Token ${stat.token.substring(0, 8)}: ${stat.usageCount} uses, ${(stat.errorRate * 100).toFixed(1)}% error rate`);
   * });
   * ```
   */
  getStats(): TokenUsageStats[] {
    return Array.from(this.usageStats.values())
  }

  /**
   * Record an error for a specific token
   *
   * This updates error statistics and may trigger automatic quarantine
   * if the error rate exceeds thresholds.
   *
   * @param token - Token string that encountered an error
   *
   * @example
   * ```typescript
   * // Record error after failed API call
   * tokenManager.recordError('ghp_token123');
   * ```
   */
  recordError(token: string): void {
    const stats = this.usageStats.get(token)
    if (stats) {
      stats.errors++
      this.updateErrorRate(stats)
      this.checkForQuarantine(token, stats)
    }
  }

  /**
   * Record a successful request for a specific token
   *
   * This updates success statistics and improves the token's health score.
   *
   * @param token - Token string that completed successfully
   *
   * @example
   * ```typescript
   * // Record success after successful API call
   * tokenManager.recordSuccess('ghp_token123');
   * ```
   */
  recordSuccess(token: string): void {
    const stats = this.usageStats.get(token)
    if (stats) {
      stats.successfulRequests++
      this.updateErrorRate(stats)
    }
  }

  private updateErrorRate(stats: TokenUsageStats): void {
    const totalRequests = stats.errors + stats.successfulRequests
    stats.errorRate = totalRequests > 0 ? stats.errors / totalRequests : 0
  }

  private checkForQuarantine(token: string, stats: TokenUsageStats): void {
    const totalRequests = stats.errors + stats.successfulRequests

    if (
      totalRequests >= this.MIN_REQUESTS_FOR_QUARANTINE &&
      stats.errorRate >= this.ERROR_RATE_THRESHOLD
    ) {
      this.quarantineToken(token)
    }
  }

  private quarantineToken(token: string): void {
    const quarantineUntil = Date.now() + this.QUARANTINE_DURATION
    this.quarantinedTokens.set(token, quarantineUntil)
  }

  getTokenHealth(): TokenHealthMetrics[] {
    return this.tokens.map(token => {
      const stats = this.usageStats.get(token.token)
      const quarantineUntil = this.quarantinedTokens.get(token.token)

      const result: TokenHealthMetrics = {
        token: token.token,
        isHealthy: !quarantineUntil && (stats?.errorRate ?? 0) < this.ERROR_RATE_THRESHOLD,
        errorRate: stats?.errorRate ?? 0,
        recentErrors: stats?.errors ?? 0,
      }

      // Only set lastSuccessfulUse if we have valid data
      if (stats && stats.successfulRequests > 0) {
        result.lastSuccessfulUse = stats.lastUsed
      }

      // Only set quarantineUntil if the token is quarantined
      if (quarantineUntil) {
        result.quarantineUntil = new Date(quarantineUntil)
      }

      return result
    })
  }

  getMetrics(): TokenRotationMetrics {
    const now = Date.now()
    const activeTokens = this.getValidTokens().length
    const quarantinedTokens = Array.from(this.quarantinedTokens.values()).filter(
      until => now < until
    ).length

    const allStats = Array.from(this.usageStats.values())
    const totalRequests = allStats.reduce((sum, stats) => sum + stats.usageCount, 0)
    const totalErrors = allStats.reduce((sum, stats) => sum + stats.errors, 0)
    const overallErrorRate = totalRequests > 0 ? totalErrors / totalRequests : 0

    return {
      totalTokens: this.tokens.length,
      activeTokens,
      quarantinedTokens,
      totalRequests,
      totalErrors,
      overallErrorRate,
      rotationStrategy: this.rotationStrategy,
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const currentLock = this.tokenLock
    let resolveLock: (() => void) | undefined

    this.tokenLock = new Promise(resolve => {
      resolveLock = resolve
    })

    try {
      await currentLock
      return await fn()
    } finally {
      resolveLock?.()
    }
  }

  // Manual quarantine management
  quarantineTokenManually(token: string, durationMs?: number): void {
    const duration = durationMs ?? this.QUARANTINE_DURATION
    const quarantineUntil = Date.now() + duration
    this.quarantinedTokens.set(token, quarantineUntil)
  }

  unquarantineToken(token: string): void {
    this.quarantinedTokens.delete(token)
  }

  resetTokenStats(token: string): void {
    const stats = this.usageStats.get(token)
    if (stats) {
      stats.errors = 0
      stats.errorRate = 0
      stats.successfulRequests = 0
      stats.usageCount = 0
    }
    this.quarantinedTokens.delete(token)
  }

  // Cleanup expired quarantines
  cleanupExpiredQuarantines(): void {
    const now = Date.now()
    for (const [token, until] of Array.from(this.quarantinedTokens.entries())) {
      if (now >= until) {
        this.quarantinedTokens.delete(token)
      }
    }
  }
}
