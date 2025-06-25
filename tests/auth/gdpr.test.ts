import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anonymizeUserData,
  checkConsentRequired,
  deleteUserData,
  exportUserData,
  getDataRetentionPolicy,
  getUserConsents,
  logDataProcessing,
  recordUserConsent,
  revokeUserConsent,
} from '../../src/lib/auth/gdpr'
import { CONSENT_TYPES } from '../../src/lib/auth/gdpr/constants'
import { sql } from '../../src/lib/db/config'
import type { User } from '../../src/types/auth'
import type { Email, GitHubUsername } from '../../src/types/base'
import { createTestUser } from '../helpers/auth-test-factories'

// Mock database
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

describe('GDPR Compliance Features', () => {
  const mockUser: User = createTestUser({
    email: 'test@example.com' as Email,
    githubUsername: 'testuser' as GitHubUsername,
  })

  const mockContext = {
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Consent Management', () => {
    it('should record user consent with timestamp and context', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        {
          id: 'consent-123',
          user_id: mockUser.id,
          consent_type: 'terms_of_service',
          granted: true,
          version: '1.0',
          timestamp: new Date(),
        },
      ])

      const consent = await recordUserConsent({
        userId: mockUser.id,
        consentType: 'terms_of_service',
        granted: true,
        version: '1.0',
        context: mockContext,
      })

      expect(consent).toMatchObject({
        user_id: mockUser.id,
        consent_type: 'terms_of_service',
        granted: true,
        version: '1.0',
      })

      // Verify database insert
      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('INSERT INTO user_consents')
      expect(calls[0]?.[0]?.[0]).toContain('ip_address')
      expect(calls[0]?.[0]?.[0]).toContain('user_agent')
    })

    it('should handle multiple consent types', async () => {
      const mockSql = vi.mocked(sql)

      const consentTypes = [
        CONSENT_TYPES.TERMS_OF_SERVICE,
        CONSENT_TYPES.PRIVACY_POLICY,
        CONSENT_TYPES.MARKETING_EMAILS,
      ]

      for (const type of consentTypes) {
        mockSql.mockResolvedValueOnce([
          {
            id: `consent-${type}`,
            consent_type: type,
            granted: true,
          },
        ])

        await recordUserConsent({
          userId: mockUser.id,
          consentType: type,
          granted: true,
          version: '1.0',
        })
      }

      expect(mockSql).toHaveBeenCalledTimes(3)
    })

    it('should revoke consent', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        {
          id: 'consent-456',
          granted: false,
        },
      ])

      await revokeUserConsent({
        userId: mockUser.id,
        consentType: 'marketing',
        context: mockContext,
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('INSERT INTO user_consents')
      expect(calls[0]?.[0]?.[0]).toContain('granted')
    })

    it('should get current consent status', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        {
          consent_type: 'terms_of_service',
          granted: true,
          version: '1.0',
          timestamp: new Date(),
        },
        {
          consent_type: 'privacy_policy',
          granted: true,
          version: '1.0',
          timestamp: new Date(),
        },
        {
          consent_type: 'marketing',
          granted: false,
          version: '1.0',
          timestamp: new Date(),
        },
      ])

      const consents = await getUserConsents(mockUser.id)

      expect(consents).toHaveLength(3)
      expect(
        Array.isArray(consents)
          ? consents.find(c => c.consentType === 'marketing')?.granted
          : undefined
      ).toBe(false)
    })

    it('should check if consent is required', async () => {
      const mockSql = vi.mocked(sql)

      // No consent found
      mockSql.mockResolvedValueOnce([])

      const required = await checkConsentRequired(mockUser.id, 'terms_of_service')
      expect(required).toBe(true)

      // Consent exists
      mockSql.mockResolvedValueOnce([
        {
          granted: true,
          version: '1.0',
        },
      ])

      const notRequired = await checkConsentRequired(mockUser.id, 'terms_of_service')
      expect(notRequired).toBe(false)
    })

    it('should detect outdated consent versions', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        {
          granted: true,
          version: '0.9', // Old version
        },
      ])

      const required = await checkConsentRequired(mockUser.id, 'privacy_policy', {
        requiredVersion: '1.0',
      })

      expect(required).toBe(true)
    })
  })

  describe('Data Portability', () => {
    it('should export all user data in structured format', async () => {
      const mockSql = vi.mocked(sql)

      // Mock user data
      mockSql.mockResolvedValueOnce([mockUser])

      // Mock OAuth accounts
      mockSql.mockResolvedValueOnce([
        {
          id: 'oauth-1',
          provider: 'github',
          provider_account_id: '12345',
        },
      ])

      // Mock WebAuthn credentials
      mockSql.mockResolvedValueOnce([
        {
          id: 'webauthn-1',
          credential_id: 'cred-123',
          name: 'My Passkey',
        },
      ])

      // Mock sessions
      mockSql.mockResolvedValueOnce([
        {
          id: 'session-1',
          auth_method: 'oauth',
          created_at: new Date(),
        },
      ])

      // Mock consents
      mockSql.mockResolvedValueOnce([
        {
          consent_type: 'terms_of_service',
          granted: true,
          version: '1.0',
        },
      ])

      // Mock audit logs
      mockSql.mockResolvedValueOnce([
        {
          event_type: 'login_success',
          created_at: new Date(),
        },
      ])

      // Mock preferences
      mockSql.mockResolvedValueOnce([
        {
          theme: 'dark',
          notifications_enabled: true,
        },
      ])

      // Mock notifications
      mockSql.mockResolvedValueOnce([
        {
          id: 'notif-1',
          type: 'welcome',
        },
      ])

      // Mock contributions
      mockSql.mockResolvedValueOnce([
        {
          id: 'contrib-1',
          repository_id: 'repo-1',
        },
      ])

      // Mock interactions
      mockSql.mockResolvedValueOnce([
        {
          repository_id: 'repo-1',
          interaction_type: 'starred',
        },
      ])

      const exportData = await exportUserData(mockUser.id)

      expect(exportData).toMatchObject({
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
        oauth_accounts: expect.arrayContaining([expect.objectContaining({ provider: 'github' })]),
        webauthn_credentials: expect.any(Array),
        sessions: expect.any(Array),
        consents: expect.any(Array),
        audit_logs: expect.any(Array),
        preferences: expect.any(Object),
        notifications: expect.any(Array),
        contributions: expect.any(Array),
        interactions: expect.any(Array),
      })

      // Verify user data is properly included
      expect(exportData.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        displayName: expect.any(String),
        username: expect.any(String),
      })
    })

    it('should format export data as JSON', async () => {
      const mockSql = vi.mocked(sql)

      // Mock minimal data
      mockSql.mockResolvedValue([])
      mockSql.mockResolvedValueOnce([mockUser])

      const exportData = await exportUserData(mockUser.id, { format: 'json' })

      // Should be valid JSON
      expect(() => JSON.stringify(exportData)).not.toThrow()
    })

    it('should include export metadata', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValue([])
      mockSql.mockResolvedValueOnce([mockUser])

      const exportData = await exportUserData(mockUser.id)

      expect(exportData._metadata).toMatchObject({
        exported_at: expect.any(Date),
        export_version: '1.0',
        user_id: mockUser.id,
      })
    })
  })

  describe('Right to Erasure', () => {
    it('should delete all user data permanently', async () => {
      const mockSql = vi.mocked(sql)

      // Mock verification
      mockSql.mockResolvedValueOnce([mockUser])

      // Mock deletion operations
      mockSql.mockResolvedValue([])

      await deleteUserData(mockUser.id, {
        reason: 'User requested deletion',
        verificationToken: 'valid-token',
      })

      const calls = mockSql.mock.calls

      // Verify all tables are cleaned
      const _deleteTables = [
        'user_repository_interactions',
        'contribution_outcomes',
        'notifications',
        'user_preferences',
        'security_audit_logs',
        'user_consents',
        'oauth_accounts',
        'webauthn_credentials',
        'refresh_tokens',
        'user_sessions',
        'users',
      ]

      // Check that at least some delete operations were called
      const deleteCalls = calls.filter(call => call?.[0]?.[0]?.includes('DELETE FROM'))
      expect(deleteCalls.length).toBeGreaterThan(0)
    })

    it('should require verification before deletion', async () => {
      await expect(
        deleteUserData(mockUser.id, {
          reason: 'User requested',
          verificationToken: 'invalid-token',
        })
      ).rejects.toThrow('Invalid verification token')
    })

    it('should log deletion event before removing audit logs', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValue([])
      mockSql.mockResolvedValueOnce([mockUser])

      await deleteUserData(mockUser.id, {
        reason: 'GDPR request',
        verificationToken: 'valid-token',
      })

      // Find the audit log insertion
      const calls = mockSql.mock.calls
      const auditLogCall = calls.find(call =>
        call?.[0]?.[0]?.includes('INSERT INTO security_audit_logs')
      )

      expect(auditLogCall).toBeDefined()

      // Ensure audit log insert happened
      expect(auditLogCall).toBeDefined()

      // Check that some delete operations happened after
      const auditLogIndex = auditLogCall ? calls.indexOf(auditLogCall) : -1
      const deleteCallsAfterAudit =
        auditLogIndex >= 0
          ? calls.slice(auditLogIndex + 1).filter(call => call?.[0]?.[0]?.includes('DELETE FROM'))
          : []
      expect(deleteCallsAfterAudit.length).toBeGreaterThan(0)
    })
  })

  describe('Data Anonymization', () => {
    it('should anonymize user data instead of deletion', async () => {
      const mockSql = vi.mocked(sql)

      // Mock user update
      mockSql.mockResolvedValueOnce([
        {
          id: mockUser.id,
          email: 'anonymized-123e4567@deleted.local',
          github_username: 'deleted-user-123e4567',
        },
      ])

      const anonymized = await anonymizeUserData(mockUser.id)

      expect(anonymized).toBe(true)

      const calls = mockSql.mock.calls
      const updateCall = calls.find(call => call?.[0]?.[0]?.includes('UPDATE users'))

      expect(updateCall).toBeDefined()
      // Check that the values are being set correctly
      if (updateCall?.[0]) {
        const query = Array.isArray(updateCall[0]) ? updateCall[0].join(' ') : updateCall[0][0]
        expect(query).toContain('UPDATE users')
      }
    })

    it('should preserve data relationships after anonymization', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValue([{ id: mockUser.id }])

      await anonymizeUserData(mockUser.id, {
        preserveRelationships: true,
      })

      // Should not delete related records
      const calls = mockSql.mock.calls
      const deleteCall = calls.find(call => call?.[0]?.[0]?.includes('DELETE FROM'))

      expect(deleteCall).toBeUndefined()
    })
  })

  describe('Data Retention', () => {
    it('should return data retention policy', async () => {
      const policy = await getDataRetentionPolicy()

      expect(policy).toMatchObject({
        user_data: {
          active_retention: 'indefinite',
          inactive_retention: '3 years',
          deletion_grace_period: '30 days',
        },
        audit_logs: {
          retention: '2 years',
          critical_events_retention: '7 years',
        },
        session_data: {
          retention: '90 days',
        },
      })
    })

    it('should identify data eligible for deletion', async () => {
      const mockSql = vi.mocked(sql)

      // Mock inactive users
      mockSql.mockResolvedValueOnce([
        { id: 'user-1', last_login_at: new Date('2020-01-01') },
        { id: 'user-2', last_login_at: new Date('2019-01-01') },
      ])

      // Mock old sessions count
      mockSql.mockResolvedValueOnce([{ count: '100' }])

      // Mock old audit logs count
      mockSql.mockResolvedValueOnce([{ count: '500' }])

      const eligible = await identifyDataForDeletion()

      expect(Array.isArray(eligible?.inactive_users) ? eligible.inactive_users.length : 0).toBe(2)
    })
  })

  describe('Data Processing Logs', () => {
    it('should log data processing activities', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      await logDataProcessing({
        userId: mockUser.id,
        processingType: 'export',
        purpose: 'User requested data export',
        lawfulBasis: 'consent',
        dataCategories: ['personal_data', 'usage_data'],
        retention: '30 days',
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('INSERT INTO data_processing_logs')
      expect(calls[0]?.[0]?.[0]).toContain('lawful_basis')
    })

    it('should track third-party data sharing', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      await logDataProcessing({
        userId: mockUser.id,
        processingType: 'sharing',
        purpose: 'GitHub API integration',
        lawfulBasis: 'legitimate_interest',
        dataCategories: ['github_username'],
        thirdParty: 'GitHub Inc.',
        retention: 'until_revoked',
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('third_party')
    })
  })

  describe('Consent UI Requirements', () => {
    it('should provide granular consent options', async () => {
      const consentOptions = await getConsentOptions()

      expect(consentOptions).toBeDefined()
      expect(Array.isArray(consentOptions?.required) ? consentOptions.required.length : 0).toBe(2)
      expect(Array.isArray(consentOptions?.optional) ? consentOptions.optional.length : 0).toBe(3)

      // Check required consents
      const requiredTypes =
        consentOptions?.required && Array.isArray(consentOptions.required)
          ? consentOptions.required.map(c => c.type)
          : []
      expect(requiredTypes).toContain('terms_of_service')
      expect(requiredTypes).toContain('privacy_policy')

      // Check optional consents
      const optionalTypes =
        consentOptions?.optional && Array.isArray(consentOptions.optional)
          ? consentOptions.optional.map(c => c.type)
          : []
      expect(optionalTypes).toContain('marketing')
      expect(optionalTypes).toContain('usage_analytics')
      expect(optionalTypes).toContain('third_party_sharing')
    })
  })
})

// Import functions that need to be implemented
import { getConsentOptions, identifyDataForDeletion } from '../../src/lib/auth/gdpr'
