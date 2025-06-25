/**
 * Detailed debug test for zero-trust logic
 */

import { describe, expect, it, vi } from 'vitest'
import {
  type AccessContext,
  type DeviceTrust,
  evaluateZeroTrustAccess,
  type TrustScore,
  ZERO_TRUST_CONFIG,
} from '../../src/lib/security/zero-trust'

// Mock crypto module
vi.mock('../../src/lib/security/crypto', () => ({
  createSecureHash: vi.fn().mockImplementation(() => 'mock-hash'),
  generateDeviceFingerprint: vi.fn().mockImplementation(() => 'mock-fingerprint'),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => 'mock-token'.padEnd(length, '0')),
}))

describe('Detailed Debug Zero-Trust Logic', () => {
  it('should trace the entire decision process step by step', async () => {
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

    console.log('=== ZERO TRUST DEBUG TRACE ===')
    console.log('Input Context:', {
      trustScore: mockTrustScore.overall,
      deviceTrust: {
        isQuarantined: mockDeviceTrust.isQuarantined,
        isCompromised: mockDeviceTrust.isCompromised,
        riskFactors: mockDeviceTrust.riskFactors,
      },
      minTrustScore: ZERO_TRUST_CONFIG.trust.minTrustScore,
      riskThresholds: ZERO_TRUST_CONFIG.trust.riskThresholds,
    })

    // Step 1: Calculate risk score
    let riskScore = 0
    const riskFactors: string[] = []

    if (mockDeviceTrust.isQuarantined) {
      riskFactors.push('quarantined_device')
      riskScore += 0.5
    }

    if (mockDeviceTrust.isCompromised) {
      riskFactors.push('compromised_device')
      riskScore += 0.9
    }

    if (mockAccessContext.trustScore.identity < 0.7) {
      riskFactors.push('low_identity_trust')
      riskScore += 0.3
    }

    if (mockAccessContext.trustScore.device < 0.6) {
      riskFactors.push('low_device_trust')
      riskScore += 0.4
    }

    if (mockAccessContext.trustScore.behavior < 0.5) {
      riskFactors.push('suspicious_behavior')
      riskScore += 0.6
    }

    const hour = new Date().getHours()
    if (hour < 6 || hour > 22) {
      riskFactors.push('unusual_hours')
      riskScore += 0.2
    }

    riskScore = Math.min(1, riskScore)

    console.log('Step 1 - Risk Assessment:', {
      riskScore,
      riskFactors,
      currentHour: hour,
    })

    // Step 2: Determine trust level
    const adjustedScore = mockTrustScore.overall - riskScore
    let trustLevel: string
    if (adjustedScore >= ZERO_TRUST_CONFIG.trust.riskThresholds.high) {
      trustLevel = 'low' // Low risk
    } else if (adjustedScore >= ZERO_TRUST_CONFIG.trust.riskThresholds.medium) {
      trustLevel = 'medium'
    } else if (adjustedScore >= ZERO_TRUST_CONFIG.trust.riskThresholds.low) {
      trustLevel = 'high'
    } else {
      trustLevel = 'critical'
    }

    console.log('Step 2 - Trust Level Determination:', {
      adjustedScore,
      trustLevel,
      thresholds: ZERO_TRUST_CONFIG.trust.riskThresholds,
    })

    // Step 3: Determine required verifications
    const verifications: string[] = []
    switch (trustLevel) {
      case 'critical':
        verifications.push('mfa', 'biometric', 'manager_approval', 'security_review')
        break
      case 'high':
        verifications.push('mfa', 'device_verification')
        break
      case 'medium':
        verifications.push('mfa')
        break
      case 'low':
        // No additional verification required
        break
    }

    console.log('Step 3 - Required Verifications:', {
      trustLevel,
      verifications,
    })

    // Step 4: Make access decision
    let allowed = true

    // Never allow access for critical risk without additional verification
    if (trustLevel === 'critical') {
      allowed = false
      console.log('Step 4a - Access denied due to critical trust level')
    }

    // Check minimum trust threshold
    if (mockAccessContext.trustScore.overall < ZERO_TRUST_CONFIG.trust.minTrustScore) {
      allowed = false
      console.log('Step 4b - Access denied due to low overall trust score')
    }

    // Allow access for low and medium risk levels
    if (trustLevel !== 'low' && trustLevel !== 'medium') {
      allowed = false
      console.log('Step 4c - Access denied due to high/critical trust level')
    }

    console.log('Step 4 - Final Access Decision:', {
      allowed,
      trustLevel,
      overallTrustScore: mockAccessContext.trustScore.overall,
      minTrustScore: ZERO_TRUST_CONFIG.trust.minTrustScore,
    })

    // Now call the actual function
    const decision = await evaluateZeroTrustAccess(mockAccessContext, mockDeviceTrust)

    console.log('=== ACTUAL FUNCTION RESULT ===')
    console.log('Decision:', {
      allowed: decision.allowed,
      riskLevel: decision.riskLevel,
      requiredVerifications: decision.requiredVerifications,
      confidence: decision.confidence,
    })

    // Compare our manual calculation with the function result
    console.log('=== COMPARISON ===')
    console.log('Manual calculation:', { allowed, trustLevel, verifications })
    console.log('Function result:', {
      allowed: decision.allowed,
      riskLevel: decision.riskLevel,
      verifications: decision.requiredVerifications,
    })

    expect(decision).toBeDefined()
  })
})
