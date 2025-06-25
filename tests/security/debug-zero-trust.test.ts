/**
 * Debug test for zero-trust logic
 */

import { describe, expect, it, vi } from 'vitest'
import {
  type AccessContext,
  type DeviceTrust,
  evaluateZeroTrustAccess,
  type TrustScore,
} from '../../src/lib/security/zero-trust'

// Mock crypto module
vi.mock('../../src/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

describe('Debug Zero-Trust Logic', () => {
  it('should debug access evaluation', async () => {
    const mockTrustScore: TrustScore = {
      overall: 0.9, // High trust
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

    // Debug manually to understand the discrepancy
    const calculateRiskScore = async (
      context: Record<string, unknown>,
      deviceTrust: { isQuarantined?: boolean; isCompromised?: boolean; trustScore?: number }
    ) => {
      const riskFactors: string[] = []
      let riskScore = 0

      if (deviceTrust.isQuarantined) {
        riskFactors.push('quarantined_device')
        riskScore += 0.5
      }

      if (deviceTrust.isCompromised) {
        riskFactors.push('compromised_device')
        riskScore += 0.9
      }

      if (context.trustScore.identity < 0.7) {
        riskFactors.push('low_identity_trust')
        riskScore += 0.3
      }

      if (context.trustScore.device < 0.6) {
        riskFactors.push('low_device_trust')
        riskScore += 0.4
      }

      if (context.trustScore.behavior < 0.5) {
        riskFactors.push('suspicious_behavior')
        riskScore += 0.6
      }

      const hour = new Date().getHours()
      if (hour < 6 || hour > 22) {
        riskFactors.push('unusual_hours')
        riskScore += 0.2
      }

      return {
        riskScore: Math.min(1, riskScore),
        factors: riskFactors,
      }
    }

    const riskAssessment = await calculateRiskScore(mockAccessContext, mockDeviceTrust)

    // Simulate determineTrustLevel
    const adjustedScore = mockTrustScore.overall - riskAssessment.riskScore
    let trustLevel: string
    if (adjustedScore >= 0.8) {
      trustLevel = 'low' // Low risk
    } else if (adjustedScore >= 0.6) {
      trustLevel = 'medium'
    } else if (adjustedScore >= 0.3) {
      trustLevel = 'high'
    } else {
      trustLevel = 'critical'
    }

    // Simulate mapToRiskLevel
    let mappedRiskLevel: string
    if (riskAssessment.riskScore >= 0.8) mappedRiskLevel = 'critical'
    else if (riskAssessment.riskScore >= 0.6) mappedRiskLevel = 'high'
    else if (riskAssessment.riskScore >= 0.3) mappedRiskLevel = 'medium'
    else mappedRiskLevel = 'low'

    const decision = await evaluateZeroTrustAccess(mockAccessContext, mockDeviceTrust)

    console.log('Debug output:', {
      trustScore: mockTrustScore.overall,
      riskScore: riskAssessment.riskScore,
      adjustedScore,
      trustLevel, // Used for access decisions
      mappedRiskLevel, // Used for returned riskLevel
      riskFactors: riskAssessment.factors,
      decision: {
        allowed: decision.allowed,
        riskLevel: decision.riskLevel,
        requiredVerifications: decision.requiredVerifications,
        confidence: decision.confidence,
      },
    })

    expect(decision).toBeDefined()
  })
})
