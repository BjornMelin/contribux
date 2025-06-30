/**
 * Centralized MSW (Mock Service Worker) configuration for Vitest 3.2+
 * Modern patterns extracted from setup.ts for better modularity
 *
 * COMPATIBILITY FIX: Uses GitHub-specific MSW server for edge case test compatibility
 */

// MSW polyfill for Node.js environment - ensure TransformStream is globally available
// @ts-ignore - Node.js 22+ has built-in TransformStream, ensure it's always accessible for MSW
if (typeof TransformStream !== 'undefined') {
  globalThis.TransformStream = TransformStream
}

import { afterEach } from 'vitest'

// Import GitHub-specific MSW setup for edge case compatibility
import { mswServer, setupMSW as setupGitHubMSW } from '../github/msw-setup'
// Import generic utilities for fallback compatibility
import { mockGitHubAPI, resetGitHubMocks } from '../helpers/msw-setup'

/**
 * Central MSW server instance for test environment
 * Uses GitHub-specific server for edge case test compatibility
 */
export { mswServer, resetGitHubMocks, mockGitHubAPI }

/**
 * Enhanced MSW setup with automatic cleanup for Vitest 3.2+
 * Uses GitHub-specific MSW server for full compatibility with edge case tests
 */
export function setupEnhancedMSW() {
  // Use GitHub-specific MSW setup for edge case compatibility
  setupGitHubMSW()

  // Enhanced cleanup for Vitest 3.2+ memory optimization
  afterEach(() => {
    resetGitHubMocks()
  })
}

/**
 * Legacy setupMSW export for backward compatibility
 * Routes to GitHub-specific setup to ensure consistent MSW server instance
 */
export function setupMSW() {
  setupGitHubMSW()
}

/**
 * Quick MSW setup for individual test files
 * Modern pattern for focused test isolation
 */
export function useMSW() {
  setupEnhancedMSW()
}
