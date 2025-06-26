/**
 * Security test configuration and setup utilities
 * Provides consistent security testing environment setup
 */

import { vi } from 'vitest'
import type { SOARConfig } from '../../../../src/lib/security/soar'

export const securityTestConfig = {
  timeouts: {
    operation: 5000,
    shutdown: 2000,
    startup: 3000,
  },
  
  thresholds: {
    critical: 0.9,
    high: 0.8,
    medium: 0.6,
    low: 0.3,
  },
}

export const disabledAutomationConfig: Partial<SOARConfig> = {
  automation: {
    enableAutomatedResponse: false,
    enablePlaybookExecution: true,
    enableMLDecisionMaking: true,
    maxAutomationLevel: 'medium',
  },
}

export const highSecurityConfig: Partial<SOARConfig> = {
  automation: {
    enableAutomatedResponse: true,
    enablePlaybookExecution: true,
    enableMLDecisionMaking: true,
    maxAutomationLevel: 'high',
  },
  thresholds: {
    criticalIncidentThreshold: 0.95,
    automatedResponseThreshold: 0.9,
    escalationThreshold: 0.98,
  },
}

export const testOnlyConfig: Partial<SOARConfig> = {
  notifications: {
    enableSlackIntegration: false,
    enableEmailAlerts: false,
    enableSMSAlerts: false,
    enableWebhookNotifications: false,
  },
}

export const setupSecurityMocks = () => {
  // Mock external security services
  const mockSecurityService = {
    blockIP: vi.fn().mockResolvedValue({ success: true }),
    quarantineUser: vi.fn().mockResolvedValue({ success: true }),
    disableAccount: vi.fn().mockResolvedValue({ success: true }),
    isolateSystem: vi.fn().mockResolvedValue({ success: true }),
    collectEvidence: vi.fn().mockResolvedValue({ success: true }),
    notifyStakeholders: vi.fn().mockResolvedValue({ success: true }),
    escalateIncident: vi.fn().mockResolvedValue({ success: true }),
  }

  // Mock notification services
  const mockNotificationService = {
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendSlack: vi.fn().mockResolvedValue({ success: true }),
    sendSMS: vi.fn().mockResolvedValue({ success: true }),
    sendWebhook: vi.fn().mockResolvedValue({ success: true }),
  }

  return {
    mockSecurityService,
    mockNotificationService,
  }
}

export const cleanupSecurityMocks = () => {
  vi.clearAllMocks()
}

export const securityTestUtils = {
  generateSecurityEvent: (type: 'incident' | 'threat' | 'vulnerability', severity: string) => ({
    id: `${type}-${Date.now()}`,
    type,
    severity,
    timestamp: Date.now(),
    source: 'test-generator',
  }),

  createTestUser: (role: 'admin' | 'analyst' | 'viewer') => ({
    id: `user-${Date.now()}`,
    role,
    permissions: role === 'admin' ? ['all'] : ['read'],
  }),

  expectSecurityEvent: (event: unknown) => {
    if (!event || typeof event !== 'object') {
      throw new Error('Security event must be an object')
    }
    
    const requiredFields = ['id', 'type', 'severity', 'timestamp']
    for (const field of requiredFields) {
      if (!(field in event)) {
        throw new Error(`Security event missing required field: ${field}`)
      }
    }
  },
}