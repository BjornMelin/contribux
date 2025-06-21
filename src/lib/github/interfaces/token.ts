/**
 * Token management interfaces
 *
 * This file contains interfaces for token rotation,
 * token information, and authentication token management.
 */

export interface TokenInfo {
  token: string
  type: 'personal' | 'app' | 'installation'
  expiresAt?: Date | undefined
  scopes?: string[] | undefined
}

export interface TokenRotationConfig {
  tokens: TokenInfo[]
  rotationStrategy: 'round-robin' | 'least-used' | 'random'
  refreshBeforeExpiry?: number | undefined // minutes
}
