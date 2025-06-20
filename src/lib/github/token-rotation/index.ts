import type { TokenInfo, TokenRotationConfig } from '../types'

export interface TokenUsageStats {
  token: string
  usageCount: number
  lastUsed: Date
  errors: number
}

export class TokenRotationManager {
  private tokens: TokenInfo[]
  private currentIndex: number = 0
  private usageStats: Map<string, TokenUsageStats> = new Map()
  private rotationStrategy: TokenRotationConfig['rotationStrategy']
  private refreshBeforeExpiry: number
  private tokenLock: Promise<void> = Promise.resolve()

  constructor(config: TokenRotationConfig) {
    this.tokens = [...config.tokens]
    this.rotationStrategy = config.rotationStrategy
    this.refreshBeforeExpiry = (config.refreshBeforeExpiry || 5) * 60 * 1000 // Convert to ms
    
    // Initialize usage stats
    this.tokens.forEach(token => {
      this.usageStats.set(token.token, {
        token: token.token,
        usageCount: 0,
        lastUsed: new Date(0),
        errors: 0
      })
    })
  }

  async getNextToken(): Promise<TokenInfo | null> {
    // Ensure thread safety
    await this.tokenLock
    
    // Filter out expired tokens
    const validTokens = this.tokens.filter(token => {
      if (!token.expiresAt) return true
      return new Date(token.expiresAt) > new Date()
    })

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
      
      default:
        selectedToken = validTokens[0]
    }

    // Update usage stats
    const stats = this.usageStats.get(selectedToken.token)!
    stats.usageCount++
    stats.lastUsed = new Date()

    return selectedToken
  }

  private getRoundRobinToken(tokens: TokenInfo[]): TokenInfo {
    // Find the current token in the valid tokens list
    const currentTokenIndex = tokens.findIndex(t => 
      this.tokens[this.currentIndex] && t.token === this.tokens[this.currentIndex].token
    )

    let nextIndex: number
    if (currentTokenIndex === -1) {
      // Current token is no longer valid, start from beginning
      nextIndex = 0
    } else {
      // Move to next token
      nextIndex = (currentTokenIndex + 1) % tokens.length
    }

    // Update the global index
    this.currentIndex = this.tokens.findIndex(t => t.token === tokens[nextIndex].token)
    
    return tokens[nextIndex]
  }

  private getLeastUsedToken(tokens: TokenInfo[]): TokenInfo {
    let leastUsedToken = tokens[0]
    let minUsage = this.usageStats.get(leastUsedToken.token)?.usageCount || 0

    for (const token of tokens) {
      const usage = this.usageStats.get(token.token)?.usageCount || 0
      if (usage < minUsage) {
        minUsage = usage
        leastUsedToken = token
      }
    }

    return leastUsedToken
  }

  private getRandomToken(tokens: TokenInfo[]): TokenInfo {
    const randomIndex = Math.floor(Math.random() * tokens.length)
    return tokens[randomIndex]
  }

  async getTokenForScopes(requiredScopes: string[]): Promise<TokenInfo | null> {
    const validTokens = this.tokens.filter(token => {
      // Check expiration
      if (token.expiresAt && new Date(token.expiresAt) <= new Date()) {
        return false
      }

      // Check scopes
      if (!token.scopes || requiredScopes.length === 0) {
        return true
      }

      // Check if token has all required scopes
      return requiredScopes.every(required => 
        token.scopes!.some(scope => 
          scope === required || scope.startsWith(required + ':')
        )
      )
    })

    if (validTokens.length === 0) {
      return null
    }

    // Use the rotation strategy to select from valid tokens
    return this.getNextTokenFromList(validTokens)
  }

  private async getNextTokenFromList(tokens: TokenInfo[]): Promise<TokenInfo> {
    switch (this.rotationStrategy) {
      case 'round-robin':
        // Find first valid token in round-robin order
        for (let i = 0; i < this.tokens.length; i++) {
          const index = (this.currentIndex + i) % this.tokens.length
          const token = this.tokens[index]
          if (tokens.some(t => t.token === token.token)) {
            this.currentIndex = (index + 1) % this.tokens.length
            return token
          }
        }
        return tokens[0]
      
      case 'least-used':
        return this.getLeastUsedToken(tokens)
      
      case 'random':
        return this.getRandomToken(tokens)
      
      default:
        return tokens[0]
    }
  }

  needsRefresh(token: TokenInfo): boolean {
    if (!token.expiresAt) return false
    
    const expiresAt = new Date(token.expiresAt).getTime()
    const now = Date.now()
    
    return now >= expiresAt - this.refreshBeforeExpiry
  }

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
        errors: 0
      })
    }
  }

  removeToken(tokenString: string): void {
    this.tokens = this.tokens.filter(t => t.token !== tokenString)
    this.usageStats.delete(tokenString)
  }

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
          token: newToken.token
        })
      }
    }
  }

  getTokens(): TokenInfo[] {
    return [...this.tokens]
  }

  getStats(): TokenUsageStats[] {
    return Array.from(this.usageStats.values())
  }

  recordError(token: string): void {
    const stats = this.usageStats.get(token)
    if (stats) {
      stats.errors++
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const currentLock = this.tokenLock
    let resolveLock: () => void
    
    this.tokenLock = new Promise(resolve => {
      resolveLock = resolve
    })

    try {
      await currentLock
      return await fn()
    } finally {
      resolveLock!()
    }
  }
}