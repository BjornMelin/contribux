/**
 * OAuth provider configurations and metadata
 * Centralized configuration for all supported OAuth providers
 */

import { z } from 'zod'
import type { GitHubProfile, GoogleProfile, LinkedInProfile, MicrosoftProfile } from '@/types/oauth'
import { parseOAuthProfile } from '@/types/oauth'

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

// Validation schemas
const GetProviderMetadataSchema = z.object({
  providerId: z.string().min(1, 'Provider ID cannot be empty'),
})

const GetProviderScopesSchema = z.object({
  providerId: z.string().min(1, 'Provider ID cannot be empty'),
  permissions: z.array(z.string()).default([]),
})

const NormalizeUserDataSchema = z.object({
  provider: z.string().min(1, 'Provider cannot be empty'),
  userData: z.unknown(),
})

const GetProviderDisplayInfoSchema = z.object({
  providerId: z.string().min(1, 'Provider ID cannot be empty'),
})

const GetProviderEndpointsSchema = z.object({
  providerId: z.string().min(1, 'Provider ID cannot be empty'),
})

const ValidateProviderConfigSchema = z.object({
  providerId: z.string().min(1, 'Provider ID cannot be empty'),
})

const IsProviderSupportedSchema = z.object({
  providerId: z.string().min(1, 'Provider ID cannot be empty'),
})

/**
 * Get provider metadata by ID
 */
export function getProviderMetadata(providerId: string): ProviderMetadata | null {
  // Validate input parameter
  const validated = GetProviderMetadataSchema.parse({ providerId })
  return OAUTH_PROVIDERS[validated.providerId] || null
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
  // Validate input parameter
  const validated = IsProviderSupportedSchema.parse({ providerId })
  return validated.providerId in OAUTH_PROVIDERS
}

/**
 * Get provider scopes based on requested permissions
 */
export function getProviderScopes(providerId: string, permissions: string[] = []): string[] {
  // Validate input parameters
  const validated = GetProviderScopesSchema.parse({ providerId, permissions })

  const provider = getProviderMetadata(validated.providerId)
  if (!provider) {
    throw new Error(`Unsupported provider: ${validated.providerId}`)
  }

  const scopes = [...provider.defaultScopes]
  const additionalScopes = getAdditionalScopes(validated.providerId, validated.permissions)
  scopes.push(...additionalScopes)

  return Array.from(new Set(scopes)) // Remove duplicates
}

/**
 * Get additional scopes for a provider based on permissions
 */
function getAdditionalScopes(providerId: string, permissions: string[]): string[] {
  const scopeMappers: Record<string, (permissions: string[]) => string[]> = {
    github: getGitHubScopes,
    google: getGoogleScopes,
    linkedin: getLinkedInScopes,
  }

  const mapper = scopeMappers[providerId]
  return mapper ? mapper(permissions) : []
}

function getGitHubScopes(permissions: string[]): string[] {
  const scopes: string[] = []
  if (permissions.includes('public_repos')) scopes.push('public_repo')
  if (permissions.includes('private_repos')) scopes.push('repo')
  if (permissions.includes('organizations')) scopes.push('read:org')
  return scopes
}

function getGoogleScopes(permissions: string[]): string[] {
  const scopes: string[] = []
  if (permissions.includes('calendar'))
    scopes.push('https://www.googleapis.com/auth/calendar.readonly')
  if (permissions.includes('drive')) scopes.push('https://www.googleapis.com/auth/drive.readonly')
  return scopes
}

function getLinkedInScopes(permissions: string[]): string[] {
  const scopes: string[] = []
  if (permissions.includes('w_member_social')) scopes.push('w_member_social')
  return scopes
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
  // Validate input parameter
  const validated = GetProviderDisplayInfoSchema.parse({ providerId })

  const provider = getProviderMetadata(validated.providerId)
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
  // Validate input parameter
  const validated = GetProviderEndpointsSchema.parse({ providerId })

  const provider = getProviderMetadata(validated.providerId)
  if (!provider) {
    return null
  }

  const endpoints: ProviderEndpoints = {
    authUrl: provider.authUrl,
    tokenUrl: provider.tokenUrl,
    userApiUrl: provider.userApiUrl,
  }

  // Add revoke URLs for providers that support token revocation
  if (validated.providerId === 'github') {
    endpoints.revokeUrl = 'https://api.github.com/applications/{client_id}/token'
  } else if (validated.providerId === 'google') {
    endpoints.revokeUrl = 'https://oauth2.googleapis.com/revoke'
  } else if (validated.providerId === 'microsoft') {
    endpoints.revokeUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
  }

  return endpoints
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(providerId: string): boolean {
  // Validate input parameter
  const validated = ValidateProviderConfigSchema.parse({ providerId })

  const provider = getProviderMetadata(validated.providerId)
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

  const envVars = requiredEnvVars[validated.providerId] || []
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
  // Validate input parameters
  const validated = NormalizeUserDataSchema.parse({ provider, userData })

  const parsedProfile = parseOAuthProfile(validated.provider, validated.userData)

  if (!parsedProfile) {
    throw new Error(`Invalid profile data for provider: ${validated.provider}`)
  }

  // Type-safe normalization using switch statement instead of record to avoid union issues
  function normalizeByProvider(
    provider: string,
    profile: GitHubProfile | GoogleProfile | LinkedInProfile | MicrosoftProfile
  ): NormalizedUserData {
    switch (provider) {
      case 'github':
        return normalizeGitHubProfile(profile as GitHubProfile)
      case 'google':
        return normalizeGoogleProfile(profile as GoogleProfile)
      case 'linkedin':
        return normalizeLinkedInProfile(profile as LinkedInProfile)
      case 'microsoft':
        return normalizeMicrosoftProfile(profile as MicrosoftProfile)
      default:
        throw new Error(`Unsupported provider for user data normalization: ${provider}`)
    }
  }

  return normalizeByProvider(validated.provider, parsedProfile)
}

function normalizeGitHubProfile(profile: GitHubProfile): NormalizedUserData {
  return {
    provider: 'github',
    providerId: profile.id.toString(),
    email: profile.email || '',
    name: profile.name || profile.login,
    username: profile.login,
    avatarUrl: profile.avatar_url || undefined,
    profileUrl: profile.html_url || undefined,
  }
}

function normalizeGoogleProfile(profile: GoogleProfile): NormalizedUserData {
  return {
    provider: 'google',
    providerId: profile.id,
    email: profile.email,
    name: profile.name,
    username: profile.email.split('@')[0] || profile.id,
    avatarUrl: profile.picture || undefined,
    profileUrl: profile.link || undefined,
  }
}

function normalizeLinkedInProfile(profile: LinkedInProfile): NormalizedUserData {
  const firstName = profile.localizedFirstName || ''
  const lastName = profile.localizedLastName || ''

  return {
    provider: 'linkedin',
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

function normalizeMicrosoftProfile(profile: MicrosoftProfile): NormalizedUserData {
  const baseData = {
    provider: 'microsoft' as const,
    providerId: profile.id,
    email: profile.mail || profile.userPrincipalName || '',
    name: profile.displayName || '',
    username: profile.userPrincipalName?.split('@')[0] || profile.displayName?.toLowerCase() || '',
  }

  // Add avatar URL if photo data is available
  if (profile.photo?.['@odata.mediaContentType']) {
    return {
      ...baseData,
      avatarUrl: `data:${profile.photo['@odata.mediaContentType']};base64,${profile.photo}`,
    }
  }

  return baseData
}
