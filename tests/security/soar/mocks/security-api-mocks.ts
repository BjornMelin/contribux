/**
 * Security API mocks for SOAR testing
 * Provides mock responses for external security services and APIs
 */

import { vi } from 'vitest'

export const mockSecurityAPIs = {
  // Mock IP blocking service
  ipBlockingAPI: {
    blockIP: vi.fn().mockImplementation((ip: string) => 
      Promise.resolve({
        success: true,
        blockedIP: ip,
        timestamp: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour
      })
    ),
    
    unblockIP: vi.fn().mockImplementation((ip: string) =>
      Promise.resolve({
        success: true,
        unblockedIP: ip,
        timestamp: Date.now(),
      })
    ),
    
    checkIPStatus: vi.fn().mockImplementation((ip: string) =>
      Promise.resolve({
        ip,
        blocked: false,
        reason: null,
      })
    ),
  },

  // Mock user management service
  userManagementAPI: {
    quarantineUser: vi.fn().mockImplementation((userId: string) =>
      Promise.resolve({
        success: true,
        userId,
        quarantined: true,
        timestamp: Date.now(),
      })
    ),

    disableAccount: vi.fn().mockImplementation((userId: string) =>
      Promise.resolve({
        success: true,
        userId,
        disabled: true,
        timestamp: Date.now(),
      })
    ),

    enableAccount: vi.fn().mockImplementation((userId: string) =>
      Promise.resolve({
        success: true,
        userId,
        enabled: true,
        timestamp: Date.now(),
      })
    ),
  },

  // Mock system isolation service
  systemIsolationAPI: {
    isolateSystem: vi.fn().mockImplementation((systemId: string) =>
      Promise.resolve({
        success: true,
        systemId,
        isolated: true,
        timestamp: Date.now(),
      })
    ),

    restoreSystem: vi.fn().mockImplementation((systemId: string) =>
      Promise.resolve({
        success: true,
        systemId,
        restored: true,
        timestamp: Date.now(),
      })
    ),
  },

  // Mock evidence collection service
  evidenceCollectionAPI: {
    collectEvidence: vi.fn().mockImplementation((target: string) =>
      Promise.resolve({
        success: true,
        evidenceId: `evidence-${Date.now()}`,
        target,
        artifacts: ['memory-dump', 'network-logs', 'file-hashes'],
        timestamp: Date.now(),
      })
    ),
  },

  // Mock notification service
  notificationAPI: {
    sendAlert: vi.fn().mockImplementation((alert: { type: string; message: string; recipients: string[] }) =>
      Promise.resolve({
        success: true,
        alertId: `alert-${Date.now()}`,
        sent: alert.recipients.length,
        timestamp: Date.now(),
      })
    ),

    escalateIncident: vi.fn().mockImplementation((incidentId: string) =>
      Promise.resolve({
        success: true,
        incidentId,
        escalatedTo: 'security-team',
        timestamp: Date.now(),
      })
    ),
  },

  // Mock external security tools integration
  externalToolsAPI: {
    siem: {
      queryLogs: vi.fn().mockImplementation((query: string) =>
        Promise.resolve({
          success: true,
          query,
          results: [
            { timestamp: Date.now(), event: 'test-event', severity: 'medium' },
          ],
        })
      ),
    },

    threatIntel: {
      lookupIP: vi.fn().mockImplementation((ip: string) =>
        Promise.resolve({
          ip,
          reputation: 'neutral',
          threats: [],
          confidence: 0.5,
        })
      ),
      
      lookupDomain: vi.fn().mockImplementation((domain: string) =>
        Promise.resolve({
          domain,
          reputation: 'clean',
          threats: [],
          confidence: 0.8,
        })
      ),
    },

    vulnerabilityScanner: {
      scanSystem: vi.fn().mockImplementation((systemId: string) =>
        Promise.resolve({
          systemId,
          vulnerabilities: [],
          riskScore: 0.2,
          timestamp: Date.now(),
        })
      ),
    },
  },
}

export const mockFailureScenarios = {
  // Simulate API failures
  blockIPFailure: () => {
    mockSecurityAPIs.ipBlockingAPI.blockIP.mockRejectedValueOnce(
      new Error('IP blocking service unavailable')
    )
  },

  quarantineUserFailure: () => {
    mockSecurityAPIs.userManagementAPI.quarantineUser.mockRejectedValueOnce(
      new Error('User management service timeout')
    )
  },

  isolateSystemFailure: () => {
    mockSecurityAPIs.systemIsolationAPI.isolateSystem.mockRejectedValueOnce(
      new Error('System isolation failed: insufficient permissions')
    )
  },

  notificationFailure: () => {
    mockSecurityAPIs.notificationAPI.sendAlert.mockRejectedValueOnce(
      new Error('Notification service unavailable')
    )
  },

  // Simulate partial failures
  partialNotificationFailure: () => {
    mockSecurityAPIs.notificationAPI.sendAlert.mockResolvedValueOnce({
      success: false,
      error: 'Some recipients unreachable',
      sent: 2,
      failed: 1,
      timestamp: Date.now(),
    })
  },
}

export const resetSecurityMocks = () => {
  Object.values(mockSecurityAPIs).forEach(api => {
    Object.values(api).forEach(method => {
      if (vi.isMockFunction(method)) {
        method.mockClear()
      } else if (typeof method === 'object') {
        Object.values(method).forEach(subMethod => {
          if (vi.isMockFunction(subMethod)) {
            subMethod.mockClear()
          }
        })
      }
    })
  })
}

export const getSecurityMockCallCounts = () => ({
  ipBlocking: {
    blockIP: mockSecurityAPIs.ipBlockingAPI.blockIP.mock.calls.length,
    unblockIP: mockSecurityAPIs.ipBlockingAPI.unblockIP.mock.calls.length,
  },
  userManagement: {
    quarantine: mockSecurityAPIs.userManagementAPI.quarantineUser.mock.calls.length,
    disable: mockSecurityAPIs.userManagementAPI.disableAccount.mock.calls.length,
  },
  systemIsolation: {
    isolate: mockSecurityAPIs.systemIsolationAPI.isolateSystem.mock.calls.length,
    restore: mockSecurityAPIs.systemIsolationAPI.restoreSystem.mock.calls.length,
  },
  notifications: {
    alerts: mockSecurityAPIs.notificationAPI.sendAlert.mock.calls.length,
    escalations: mockSecurityAPIs.notificationAPI.escalateIncident.mock.calls.length,
  },
})