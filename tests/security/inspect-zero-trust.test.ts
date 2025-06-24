/**
 * Inspect zero-trust function internals
 */

import { describe, expect, it, vi } from 'vitest'
import {
  type AccessContext,
  type DeviceTrust,
  evaluateZeroTrustAccess,
  type TrustScore,
} from '@/lib/security/zero-trust'

// Mock crypto module
vi.mock('@/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

describe('Inspect Zero-Trust Function', () => {
  it('should patch the function to see what trustLevel is calculated', async () => {
    const mockTrustScore: TrustScore = {
      overall: 0.9,
      identity: 0.9,
      device: 0.9,
      behavior: 0.9,
      network: 0.9,
      location: 0.9,
      lastUpdated: Date.now(),
    }

    const mockDeviceTrust: DeviceTrust = {
      deviceId: 'device-123',
      fingerprint: 'mock-fingerprint',
      trustScore: 0.9,
      firstSeen: Date.now() - 86400000,
      lastSeen: Date.now(),
      isQuarantined: false,
      isCompromised: false,
      riskFactors: [],
      verificationHistory: [],
    }

    const mockAccessContext: AccessContext = {
      userId: 'user-123',
      sessionId: 'session-456',
      deviceId: 'device-123',
      requestedResource: '/api/repositories',
      requestedAction: 'read',
      riskLevel: 'low',
      trustScore: mockTrustScore,
      timestamp: Date.now(),
    }

    // Let's spy on the function internals
    console.log('Before calling function...')

    const decision = await evaluateZeroTrustAccess(mockAccessContext, mockDeviceTrust)

    console.log('Function returned:', {
      allowed: decision.allowed,
      riskLevel: decision.riskLevel,
      requiredVerifications: decision.requiredVerifications,
    })

    // Let's also check the module exports to make sure we're testing the right function
    const zeroTrustModule = await import('@/lib/security/zero-trust')
    console.log('Available exports:', Object.keys(zeroTrustModule))

    expect(decision).toBeDefined()
  })
})
