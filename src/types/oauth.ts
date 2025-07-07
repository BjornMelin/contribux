/**
 * TypeScript types for OAuth provider responses
 * Based on Auth.js v5 and official OAuth provider documentation
 */

import { z } from 'zod'

// GitHub OAuth Types
export const GitHubProfileSchema = z.object({
  id: z.number(),
  login: z.string(),
  node_id: z.string(),
  avatar_url: z.string(),
  gravatar_id: z.string().nullable(),
  url: z.string(),
  html_url: z.string(),
  followers_url: z.string(),
  following_url: z.string(),
  gists_url: z.string(),
  starred_url: z.string(),
  subscriptions_url: z.string(),
  organizations_url: z.string(),
  repos_url: z.string(),
  events_url: z.string(),
  received_events_url: z.string(),
  type: z.string(),
  site_admin: z.boolean(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  blog: z.string().nullable(),
  location: z.string().nullable(),
  email: z.string().nullable(),
  hireable: z.boolean().nullable(),
  bio: z.string().nullable(),
  twitter_username: z.string().nullable(),
  public_repos: z.number(),
  public_gists: z.number(),
  followers: z.number(),
  following: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  private_gists: z.number().optional(),
  total_private_repos: z.number().optional(),
  owned_private_repos: z.number().optional(),
  disk_usage: z.number().optional(),
  collaborators: z.number().optional(),
  two_factor_authentication: z.boolean().optional(),
  plan: z
    .object({
      name: z.string(),
      space: z.number(),
      private_repos: z.number(),
      collaborators: z.number(),
    })
    .optional(),
})

export type GitHubProfile = z.infer<typeof GitHubProfileSchema>

// Google OAuth Types
export const GoogleProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  verified_email: z.boolean(),
  name: z.string(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().optional(),
  locale: z.string().optional(),
  hd: z.string().optional(), // Hosted domain for G Suite users
  link: z.string().optional(),
})

export type GoogleProfile = z.infer<typeof GoogleProfileSchema>

// Discord OAuth Types
export const DiscordProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  discriminator: z.string(),
  global_name: z.string().nullable(),
  avatar: z.string().nullable(),
  bot: z.boolean().optional(),
  system: z.boolean().optional(),
  mfa_enabled: z.boolean().optional(),
  banner: z.string().nullable().optional(),
  accent_color: z.number().nullable().optional(),
  locale: z.string().optional(),
  verified: z.boolean().optional(),
  email: z.string().nullable().optional(),
  flags: z.number().optional(),
  premium_type: z.number().optional(),
  public_flags: z.number().optional(),
  avatar_decoration: z.string().nullable().optional(),
})

export type DiscordProfile = z.infer<typeof DiscordProfileSchema>

// LinkedIn OAuth Types
export const LinkedInEmailSchema = z.object({
  elements: z.array(
    z.object({
      'handle~': z.object({
        emailAddress: z.string(),
      }),
      handle: z.string(),
      primary: z.boolean().optional(),
      type: z.string().optional(),
    })
  ),
})

export const LinkedInProfileSchema = z.object({
  id: z.string(),
  localizedFirstName: z.string().optional(),
  localizedLastName: z.string().optional(),
  firstName: z
    .object({
      localized: z.record(z.string()),
      preferredLocale: z.object({
        country: z.string(),
        language: z.string(),
      }),
    })
    .optional(),
  lastName: z
    .object({
      localized: z.record(z.string()),
      preferredLocale: z.object({
        country: z.string(),
        language: z.string(),
      }),
    })
    .optional(),
  profilePicture: z
    .object({
      'displayImage~': z.object({
        elements: z.array(
          z.object({
            identifiers: z.array(
              z.object({
                identifier: z.string(),
                identifierType: z.string(),
                identifierExpiresInSeconds: z.number().optional(),
              })
            ),
            data: z.object({
              'com.linkedin.digitalmedia.mediaartifact.StillImage': z.object({
                storageSize: z.object({
                  width: z.number(),
                  height: z.number(),
                }),
                storageAspectRatio: z.object({
                  widthAspect: z.number(),
                  heightAspect: z.number(),
                  formatted: z.string(),
                }),
                mediaType: z.string(),
              }),
            }),
          })
        ),
        paging: z.object({
          count: z.number(),
          start: z.number(),
        }),
      }),
      displayImage: z.string(),
    })
    .optional(),
})

export type LinkedInProfile = z.infer<typeof LinkedInProfileSchema>

// Microsoft OAuth Types
export const MicrosoftProfileSchema = z.object({
  '@odata.context': z.string().optional(),
  id: z.string(),
  businessPhones: z.array(z.string()).optional(),
  displayName: z.string().optional(),
  givenName: z.string().optional(),
  jobTitle: z.string().nullable().optional(),
  mail: z.string().nullable().optional(),
  mobilePhone: z.string().nullable().optional(),
  officeLocation: z.string().nullable().optional(),
  preferredLanguage: z.string().nullable().optional(),
  surname: z.string().optional(),
  userPrincipalName: z.string().optional(),
  photo: z
    .object({
      '@odata.mediaContentType': z.string(),
    })
    .and(z.string())
    .optional(), // Base64 photo data
})

export type MicrosoftProfile = z.infer<typeof MicrosoftProfileSchema>

// Union type for all OAuth profiles
export type OAuthProfile =
  | GitHubProfile
  | GoogleProfile
  | DiscordProfile
  | LinkedInProfile
  | MicrosoftProfile

// Enhanced Auth.js types with proper generics
export interface EnhancedAccount {
  provider: string
  type: string
  providerAccountId: string
  access_token?: string
  expires_at?: number
  id_token?: string
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
  token_type?: string
  session_state?: string
}

export interface EnhancedUser {
  id?: string
  name?: string | null
  email?: string | null
  image?: string | null
  [key: string]: unknown
}

export interface EnhancedSignInParams {
  user: EnhancedUser
  account: EnhancedAccount
  profile?: OAuthProfile
}

// Provider-specific token types
export interface GitHubTokenResponse {
  access_token: string
  token_type: string
  scope: string
  refresh_token?: string
  refresh_token_expires_in?: number
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
  id_token?: string
}

export interface DiscordTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

// Token refresh types
export interface TokenRefreshRequest {
  provider: string
  refreshToken: string
  clientId: string
  clientSecret: string
}

export interface TokenRefreshResponse {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  error?: string
}

// Enhanced JWT token interface
export interface EnhancedJWTToken {
  sub?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  provider?: string
  error?: string
  iat?: number
  exp?: number
  jti?: string
}

// Profile extraction utilities with proper typing
export const extractGitHubUserData = (profile: GitHubProfile) => ({
  providerId: profile.id.toString(),
  email: profile.email,
  name: profile.name || profile.login,
  username: profile.login,
  avatarUrl: profile.avatar_url,
  profileUrl: profile.html_url,
  githubUsername: profile.login,
  emailVerified: profile.email !== null,
})

export const extractGoogleUserData = (profile: GoogleProfile) => ({
  providerId: profile.id,
  email: profile.email,
  name: profile.name,
  username: profile.email.split('@')[0],
  avatarUrl: profile.picture,
  profileUrl: profile.link,
  githubUsername: null,
  emailVerified: profile.verified_email,
})

export const extractDiscordUserData = (profile: DiscordProfile) => ({
  providerId: profile.id,
  email: profile.email,
  name: profile.global_name || profile.username,
  username: profile.username,
  avatarUrl: profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
    : null,
  profileUrl: null,
  githubUsername: null,
  emailVerified: profile.verified ?? false,
})

// Type guards for profile validation
export const isGitHubProfile = (profile: unknown): profile is GitHubProfile => {
  const result = GitHubProfileSchema.safeParse(profile)
  return result.success
}

export const isGoogleProfile = (profile: unknown): profile is GoogleProfile => {
  const result = GoogleProfileSchema.safeParse(profile)
  return result.success
}

export const isDiscordProfile = (profile: unknown): profile is DiscordProfile => {
  const result = DiscordProfileSchema.safeParse(profile)
  return result.success
}

export const isLinkedInProfile = (profile: unknown): profile is LinkedInProfile => {
  const result = LinkedInProfileSchema.safeParse(profile)
  return result.success
}

export const isMicrosoftProfile = (profile: unknown): profile is MicrosoftProfile => {
  const result = MicrosoftProfileSchema.safeParse(profile)
  return result.success
}

// Utility for safe profile parsing
export const parseOAuthProfile = (provider: string, profile: unknown): OAuthProfile | null => {
  switch (provider) {
    case 'github':
      return isGitHubProfile(profile) ? profile : null
    case 'google':
      return isGoogleProfile(profile) ? profile : null
    case 'discord':
      return isDiscordProfile(profile) ? profile : null
    case 'linkedin':
      return isLinkedInProfile(profile) ? profile : null
    case 'microsoft':
      return isMicrosoftProfile(profile) ? profile : null
    default:
      return null
  }
}
