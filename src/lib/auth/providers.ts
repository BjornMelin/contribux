/**
 * OAuth provider configurations and metadata
 * Centralized configuration for all supported OAuth providers
 */

import { z } from 'zod'
import type { GitHubProfile, GoogleProfile, LinkedInProfile, MicrosoftProfile } from '@/types/oauth'

// Provider metadata interface
export interface ProviderMetadata {
  id: string
  name: string
  displayName: string
  icon: string
  color: string
  authUrl: string
  tokenUrl: string
  userApiUrl: string
  defaultScopes: string[]
  description: string
  supportedFeatures: {
    refreshTokens: boolean
    emailRequired: boolean
    profilePicture: boolean
    publicRepositories?: boolean
    privateRepositories?: boolean
    organizations?: boolean
  }
}

// GitHub provider configuration
export const GITHUB_PROVIDER: ProviderMetadata = {
  id: 'github',
  name: 'github',
  displayName: 'GitHub',
  icon: 'github',
  color: '#24292e',
  authUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userApiUrl: 'https://api.github.com/user',
  defaultScopes: ['user:email', 'read:user'],
  description: 'Connect with GitHub to discover contribution opportunities',
  supportedFeatures: {
    refreshTokens: true,
    emailRequired: true,
    profilePicture: true,
    publicRepositories: true,
    privateRepositories: true,
    organizations: true,
  },
}

// Google provider configuration
export const GOOGLE_PROVIDER: ProviderMetadata = {
  id: 'google',
  name: 'google',
  displayName: 'Google',
  icon: 'google',
  color: '#db4437',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userApiUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  defaultScopes: ['openid', 'email', 'profile'],
  description: 'Sign in with your Google account',
  supportedFeatures: {
    refreshTokens: true,
    emailRequired: true,
    profilePicture: true,
    publicRepositories: false,
    privateRepositories: false,
    organizations: false,
  },
}

// LinkedIn provider configuration
export const LINKEDIN_PROVIDER: ProviderMetadata = {
  id: 'linkedin',
  name: 'linkedin',
  displayName: 'LinkedIn',
  icon: 'linkedin',
  color: '#0077b5',
  authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  userApiUrl: 'https://api.linkedin.com/v2/people/~',
  defaultScopes: ['r_liteprofile', 'r_emailaddress'],
  description: 'Connect with LinkedIn to enhance your professional profile',
  supportedFeatures: {
    refreshTokens: true,
    emailRequired: true,
    profilePicture: true,
    publicRepositories: false,
    privateRepositories: false,
    organizations: false,
  },
}

// Microsoft provider configuration
export const MICROSOFT_PROVIDER: ProviderMetadata = {
  id: 'microsoft',
  name: 'microsoft',
  displayName: 'Microsoft',
  icon: 'microsoft',
  color: '#00a1f1',
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userApiUrl: 'https://graph.microsoft.com/v1.0/me',
  defaultScopes: ['openid', 'profile', 'email', 'User.Read'],
  description: 'Sign in with your Microsoft account',
  supportedFeatures: {
    refreshTokens: true,
    emailRequired: true,
    profilePicture: true,
    publicRepositories: false,
    privateRepositories: false,
    organizations: false,
  },
}

// All supported providers registry
export const OAUTH_PROVIDERS: Record<string, ProviderMetadata> = {
  github: GITHUB_PROVIDER,
  google: GOOGLE_PROVIDER,
  linkedin: LINKEDIN_PROVIDER,
  microsoft: MICROSOFT_PROVIDER,
} as const

// Provider validation schema
export const ProviderSchema = z.enum(['github', 'google', 'linkedin', 'microsoft'])

/**
 * Get provider metadata by ID
 */
export function getProviderMetadata(providerId: string): ProviderMetadata | null {
  return OAUTH_PROVIDERS[providerId] || null
}

/**
 * Get all supported provider IDs
 */
export function getSupportedProviders(): string[] {
  return Object.keys(OAUTH_PROVIDERS)
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(providerId: string): boolean {
  return providerId in OAUTH_PROVIDERS
}

/**
 * Get provider scopes based on requested permissions
 */
export function getProviderScopes(providerId: string, permissions: string[] = []): string[] {
  const provider = getProviderMetadata(providerId)
  if (!provider) {
    throw new Error(`Unsupported provider: ${providerId}`)
  }

  const scopes = [...provider.defaultScopes]

  // Add additional scopes based on permissions
  if (providerId === 'github') {
    if (permissions.includes('public_repos')) {
      scopes.push('public_repo')
    }
    if (permissions.includes('private_repos')) {
      scopes.push('repo')
    }
    if (permissions.includes('organizations')) {
      scopes.push('read:org')
    }
  } else if (providerId === 'google') {
    if (permissions.includes('calendar')) {
      scopes.push('https://www.googleapis.com/auth/calendar.readonly')
    }
    if (permissions.includes('drive')) {
      scopes.push('https://www.googleapis.com/auth/drive.readonly')
    }
  } else if (providerId === 'linkedin') {
    if (permissions.includes('w_member_social')) {
      scopes.push('w_member_social')
    }
  }

  return Array.from(new Set(scopes)) // Remove duplicates
}

/**
 * Get provider display information for UI
 */
export interface ProviderDisplayInfo {
  id: string
  name: string
  displayName: string
  icon: string
  color: string
  description: string
  features: string[]
}

export function getProviderDisplayInfo(providerId: string): ProviderDisplayInfo | null {
  const provider = getProviderMetadata(providerId)
  if (!provider) {
    return null
  }

  const features: string[] = []
  if (provider.supportedFeatures.publicRepositories) {
    features.push('Public repositories')
  }
  if (provider.supportedFeatures.privateRepositories) {
    features.push('Private repositories')
  }
  if (provider.supportedFeatures.organizations) {
    features.push('Organizations')
  }
  if (provider.supportedFeatures.profilePicture) {
    features.push('Profile picture')
  }

  return {
    id: provider.id,
    name: provider.name,
    displayName: provider.displayName,
    icon: provider.icon,
    color: provider.color,
    description: provider.description,
    features,
  }
}

/**
 * Get provider URLs and endpoints
 */
export interface ProviderEndpoints {
  authUrl: string
  tokenUrl: string
  userApiUrl: string
  revokeUrl?: string
}

export function getProviderEndpoints(providerId: string): ProviderEndpoints | null {
  const provider = getProviderMetadata(providerId)
  if (!provider) {
    return null
  }

  const endpoints: ProviderEndpoints = {
    authUrl: provider.authUrl,
    tokenUrl: provider.tokenUrl,
    userApiUrl: provider.userApiUrl,
  }

  // Add revoke URLs for providers that support token revocation
  if (providerId === 'github') {
    endpoints.revokeUrl = 'https://api.github.com/applications/{client_id}/token'
  } else if (providerId === 'google') {
    endpoints.revokeUrl = 'https://oauth2.googleapis.com/revoke'
  } else if (providerId === 'microsoft') {
    endpoints.revokeUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
  }

  return endpoints
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(providerId: string): boolean {
  const provider = getProviderMetadata(providerId)
  if (!provider) {
    return false
  }

  // Check required environment variables based on provider
  const requiredEnvVars: Record<string, string[]> = {
    github: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
  }

  const envVars = requiredEnvVars[providerId] || []
  return envVars.every(envVar => process.env[envVar])
}

/**
 * Get all providers with valid configuration
 */
export function getAvailableProviders(): ProviderMetadata[] {
  return Object.values(OAUTH_PROVIDERS).filter(provider => validateProviderConfig(provider.id))
}

/**
 * Provider-specific user data transformation
 */
export interface NormalizedUserData {
  provider: string
  providerId: string
  email: string
  name: string
  username: string
  avatarUrl?: string | undefined
  profileUrl?: string | undefined
}

export function normalizeUserData(provider: string, userData: unknown): NormalizedUserData {
  // Import the parseOAuthProfile function at runtime to avoid circular dependency
  const { parseOAuthProfile } = require('@/types/oauth')
  const parsedProfile = parseOAuthProfile(provider, userData)

  if (!parsedProfile) {
    throw new Error(`Invalid profile data for provider: ${provider}`)
  }

  switch (provider) {
    case 'github': {
      const profile = parsedProfile as GitHubProfile
      return {
        provider,
        providerId: profile.id.toString(),
        email: profile.email || '',
        name: profile.name || profile.login,
        username: profile.login,
        avatarUrl: profile.avatar_url || undefined,
        profileUrl: profile.html_url || undefined,
      }
    }

    case 'google': {
      const profile = parsedProfile as GoogleProfile
      return {
        provider,
        providerId: profile.id,
        email: profile.email,
        name: profile.name,
        username: profile.email.split('@')[0] || profile.id, // Use email prefix as username, fallback to ID
        avatarUrl: profile.picture || undefined,
        profileUrl: profile.link || undefined,
      }
    }

    case 'linkedin': {
      const profile = parsedProfile as LinkedInProfile
      const firstName = profile.localizedFirstName || ''
      const lastName = profile.localizedLastName || ''
      return {
        provider,
        providerId: profile.id,
        email: '', // LinkedIn email requires separate API call
        name: `${firstName} ${lastName}`.trim(),
        username: firstName.toLowerCase() || profile.id,
        avatarUrl:
          profile.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier ||
          undefined,
        profileUrl: undefined,
      }
    }

    case 'microsoft': {
      const profile = parsedProfile as MicrosoftProfile
      return {
        provider,
        providerId: profile.id,
        email: profile.mail || profile.userPrincipalName || '',
        name: profile.displayName || '',
        username:
          profile.userPrincipalName?.split('@')[0] || profile.displayName?.toLowerCase() || '',
        ...(profile.photo?.['@odata.mediaContentType'] && {
          avatarUrl: `data:${profile.photo['@odata.mediaContentType']};base64,${profile.photo}`,
        }),
      }
    }

    default:
      throw new Error(`Unsupported provider for user data normalization: ${provider}`)
  }
}
