/**
 * Tests for OAuth provider configuration and utilities
 */
import { describe, expect, it } from 'vitest'
import {
  GITHUB_PROVIDER,
  GOOGLE_PROVIDER,
  getProviderDisplayInfo,
  getProviderEndpoints,
  getProviderMetadata,
  getProviderScopes,
  getSupportedProviders,
  isProviderSupported,
  LINKEDIN_PROVIDER,
  MICROSOFT_PROVIDER,
  normalizeUserData,
} from '../../src/lib/auth/providers'

describe('OAuth Provider Configuration', () => {
  describe('Provider Metadata', () => {
    it('should return GitHub provider metadata', () => {
      const provider = getProviderMetadata('github')

      expect(provider).toBeDefined()
      expect(provider?.id).toBe('github')
      expect(provider?.name).toBe('github')
      expect(provider?.displayName).toBe('GitHub')
      expect(provider?.defaultScopes).toContain('user:email')
      expect(provider?.supportedFeatures.publicRepositories).toBe(true)
    })

    it('should return Google provider metadata', () => {
      const provider = getProviderMetadata('google')

      expect(provider).toBeDefined()
      expect(provider?.id).toBe('google')
      expect(provider?.displayName).toBe('Google')
      expect(provider?.defaultScopes).toContain('email')
      expect(provider?.supportedFeatures.publicRepositories).toBe(false)
    })

    it('should return null for unsupported provider', () => {
      const provider = getProviderMetadata('unsupported')

      expect(provider).toBeNull()
    })
  })

  describe('Provider Support', () => {
    it('should return list of supported providers', () => {
      const providers = getSupportedProviders()

      expect(providers).toContain('github')
      expect(providers).toContain('google')
      expect(providers).toContain('linkedin')
      expect(providers).toContain('microsoft')
    })

    it('should check if provider is supported', () => {
      expect(isProviderSupported('github')).toBe(true)
      expect(isProviderSupported('google')).toBe(true)
      expect(isProviderSupported('unsupported')).toBe(false)
    })
  })

  describe('Provider Scopes', () => {
    it('should return default scopes for GitHub', () => {
      const scopes = getProviderScopes('github')

      expect(scopes).toContain('user:email')
      expect(scopes).toContain('read:user')
    })

    it('should add additional GitHub scopes based on permissions', () => {
      const scopes = getProviderScopes('github', ['public_repos', 'organizations'])

      expect(scopes).toContain('user:email')
      expect(scopes).toContain('public_repo')
      expect(scopes).toContain('read:org')
    })

    it('should return default scopes for Google', () => {
      const scopes = getProviderScopes('google')

      expect(scopes).toContain('openid')
      expect(scopes).toContain('email')
      expect(scopes).toContain('profile')
    })

    it('should throw error for unsupported provider', () => {
      expect(() => getProviderScopes('unsupported')).toThrow('Unsupported provider: unsupported')
    })
  })

  describe('Provider Display Info', () => {
    it('should return display info for GitHub', () => {
      const info = getProviderDisplayInfo('github')

      expect(info).toBeDefined()
      expect(info?.displayName).toBe('GitHub')
      expect(info?.icon).toBe('github')
      expect(info?.features).toContain('Public repositories')
      expect(info?.features).toContain('Private repositories')
    })

    it('should return display info for Google', () => {
      const info = getProviderDisplayInfo('google')

      expect(info).toBeDefined()
      expect(info?.displayName).toBe('Google')
      expect(info?.features).not.toContain('Public repositories')
      expect(info?.features).toContain('Profile picture')
    })

    it('should return null for unsupported provider', () => {
      const info = getProviderDisplayInfo('unsupported')

      expect(info).toBeNull()
    })
  })

  describe('Provider Endpoints', () => {
    it('should return endpoints for GitHub', () => {
      const endpoints = getProviderEndpoints('github')

      expect(endpoints).toBeDefined()
      expect(endpoints?.authUrl).toBe('https://github.com/login/oauth/authorize')
      expect(endpoints?.tokenUrl).toBe('https://github.com/login/oauth/access_token')
      expect(endpoints?.userApiUrl).toBe('https://api.github.com/user')
      expect(endpoints?.revokeUrl).toContain('api.github.com')
    })

    it('should return endpoints for Google', () => {
      const endpoints = getProviderEndpoints('google')

      expect(endpoints).toBeDefined()
      expect(endpoints?.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
      expect(endpoints?.revokeUrl).toBe('https://oauth2.googleapis.com/revoke')
    })
  })

  describe('User Data Normalization', () => {
    it('should normalize GitHub user data', () => {
      const githubUser = {
        id: 12345,
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        html_url: 'https://github.com/testuser',
      }

      const normalized = normalizeUserData('github', githubUser)

      expect(normalized.provider).toBe('github')
      expect(normalized.providerId).toBe('12345')
      expect(normalized.email).toBe('test@example.com')
      expect(normalized.name).toBe('Test User')
      expect(normalized.username).toBe('testuser')
      expect(normalized.avatarUrl).toBe('https://avatars.githubusercontent.com/u/12345')
      expect(normalized.profileUrl).toBe('https://github.com/testuser')
    })

    it('should normalize Google user data', () => {
      const googleUser = {
        id: 'google123',
        name: 'Test User',
        email: 'test@gmail.com',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
        link: 'https://plus.google.com/+TestUser',
      }

      const normalized = normalizeUserData('google', googleUser)

      expect(normalized.provider).toBe('google')
      expect(normalized.providerId).toBe('google123')
      expect(normalized.email).toBe('test@gmail.com')
      expect(normalized.name).toBe('Test User')
      expect(normalized.username).toBe('test')
      expect(normalized.avatarUrl).toBe('https://lh3.googleusercontent.com/photo.jpg')
    })

    it('should throw error for unsupported provider', () => {
      expect(() => normalizeUserData('unsupported', {})).toThrow(
        'Unsupported provider for user data normalization: unsupported'
      )
    })
  })

  describe('Provider Constants', () => {
    it('should have correct GitHub provider configuration', () => {
      expect(GITHUB_PROVIDER.id).toBe('github')
      expect(GITHUB_PROVIDER.supportedFeatures.refreshTokens).toBe(true)
      expect(GITHUB_PROVIDER.supportedFeatures.publicRepositories).toBe(true)
    })

    it('should have correct Google provider configuration', () => {
      expect(GOOGLE_PROVIDER.id).toBe('google')
      expect(GOOGLE_PROVIDER.supportedFeatures.refreshTokens).toBe(true)
      expect(GOOGLE_PROVIDER.supportedFeatures.publicRepositories).toBe(false)
    })

    it('should have correct LinkedIn provider configuration', () => {
      expect(LINKEDIN_PROVIDER.id).toBe('linkedin')
      expect(LINKEDIN_PROVIDER.color).toBe('#0077b5')
    })

    it('should have correct Microsoft provider configuration', () => {
      expect(MICROSOFT_PROVIDER.id).toBe('microsoft')
      expect(MICROSOFT_PROVIDER.color).toBe('#00a1f1')
    })
  })
})
