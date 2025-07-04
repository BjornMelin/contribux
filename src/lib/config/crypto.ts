/**
 * Cryptography Configuration
 * Extracted from main config to resolve import issues
 */

export const cryptoConfig = {
  keyRotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
  keyLength: 256, // 256 bits
  ivLength: 12, // 12 bytes for GCM
  tagLength: 16, // 16 bytes
  algorithm: 'AES-GCM',
} as const
