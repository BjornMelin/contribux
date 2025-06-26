/**
 * Authentication Test Scenarios and Fixtures
 *
 * Provides test data and scenarios for authentication flow testing including:
 * - Test user profiles
 * - Authentication configurations
 * - Error scenarios
 * - OAuth provider configurations
 */

import type { TokenInfo } from '../utils/auth-test-helpers'

export interface TestUser {
  login: string
  id: number
  type: 'User' | 'Organization'
  email?: string
  name?: string
}

export interface AuthTestScenario {
  name: string
  description: string
  authConfig: any
  expectedResult: 'success' | 'failure'
  expectedError?: string
}

export interface OAuthProvider {
  name: string
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  userUrl: string
  scopes: string[]
}

/**
 * Mock test users for different scenarios
 */
export const testUsers: Record<string, TestUser> = {
  validUser: {
    login: 'testuser',
    id: 12345,
    type: 'User',
    email: 'test@example.com',
    name: 'Test User',
  },
  
  organizationUser: {
    login: 'testorg',
    id: 67890,
    type: 'Organization',
    email: 'org@example.com',
    name: 'Test Organization',
  },
  
  limitedUser: {
    login: 'limiteduser',
    id: 11111,
    type: 'User',
    email: 'limited@example.com',
    name: 'Limited User',
  },
}

/**
 * Valid authentication test scenarios
 */
export const authScenarios: AuthTestScenario[] = [
  {
    name: 'Valid Personal Access Token',
    description: 'Authentication with a valid PAT token',
    authConfig: {
      type: 'token',
      token: 'ghp_valid_token_123456789',
    },
    expectedResult: 'success',
  },
  
  {
    name: 'Valid GitHub App JWT',
    description: 'Authentication with valid GitHub App credentials',
    authConfig: {
      type: 'app',
      appId: 12345,
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nVALID_KEY\n-----END RSA PRIVATE KEY-----',
    },
    expectedResult: 'success',
  },
  
  {
    name: 'Valid OAuth Configuration',
    description: 'OAuth client configuration setup',
    authConfig: {
      type: 'oauth',
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
    },
    expectedResult: 'success',
  },
]

/**
 * Authentication error test scenarios
 */
export const authErrorScenarios: AuthTestScenario[] = [
  {
    name: 'Invalid Token Format',
    description: 'Token with incorrect format',
    authConfig: {
      type: 'token',
      token: 'invalid_token_format',
    },
    expectedResult: 'failure',
    expectedError: 'Bad credentials',
  },
  
  {
    name: 'Expired Token',
    description: 'Token that has expired',
    authConfig: {
      type: 'token',
      token: 'ghp_expired_token_12345',
    },
    expectedResult: 'failure',
    expectedError: 'Bad credentials',
  },
  
  {
    name: 'Revoked Token',
    description: 'Token that has been revoked',
    authConfig: {
      type: 'token',
      token: 'ghp_revoked_token_12345',
    },
    expectedResult: 'failure',
    expectedError: 'Bad credentials',
  },
  
  {
    name: 'Invalid GitHub App ID',
    description: 'GitHub App with invalid app ID',
    authConfig: {
      type: 'app',
      appId: 999999,
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nINVALID_KEY\n-----END RSA PRIVATE KEY-----',
    },
    expectedResult: 'failure',
    expectedError: 'Authentication failed',
  },
]

/**
 * Token rotation test scenarios
 */
export const tokenRotationScenarios: TokenInfo[] = [
  {
    token: 'ghp_primary_token_123456',
    type: 'personal',
    scopes: ['repo', 'user', 'read:org'],
  },
  {
    token: 'ghp_secondary_token_789012',
    type: 'personal', 
    scopes: ['repo', 'user'],
  },
  {
    token: 'ghp_backup_token_345678',
    type: 'personal',
    scopes: ['repo'],
  },
]

/**
 * OAuth provider configurations for testing
 */
export const oauthProviders: Record<string, OAuthProvider> = {
  github: {
    name: 'GitHub',
    clientId: 'test_github_client_id',
    clientSecret: 'test_github_client_secret',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    scopes: ['user', 'repo', 'read:org'],
  },
  
  githubApp: {
    name: 'GitHub App',
    clientId: 'test_app_client_id',
    clientSecret: 'test_app_client_secret',
    authUrl: 'https://github.com/apps/test-app/installations/new',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    scopes: ['contents', 'metadata', 'pull_requests'],
  },
}

/**
 * Rate limit test scenarios
 */
export const rateLimitScenarios = {
  standard: {
    limit: 5000,
    remaining: 4999,
    reset: Math.floor(Date.now() / 1000) + 3600,
    resource: 'core',
  },
  
  nearLimit: {
    limit: 5000,
    remaining: 10,
    reset: Math.floor(Date.now() / 1000) + 3600,
    resource: 'core',
  },
  
  exhausted: {
    limit: 5000,
    remaining: 0,
    reset: Math.floor(Date.now() / 1000) + 3600,
    resource: 'core',
  },
  
  graphql: {
    limit: 5000,
    remaining: 4990,
    cost: 1,
    resetAt: new Date(Date.now() + 3600000).toISOString(),
  },
}

/**
 * JWT claims for GitHub App testing
 */
export const jwtClaims = {
  valid: {
    iss: 12345,
    exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
    iat: Math.floor(Date.now() / 1000),
  },
  
  expired: {
    iss: 12345,
    exp: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
    iat: Math.floor(Date.now() / 1000) - 1200, // 20 minutes ago
  },
  
  future: {
    iss: 12345,
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000) + 300, // 5 minutes in future (invalid)
  },
}