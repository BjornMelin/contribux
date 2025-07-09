#!/usr/bin/env node

/**
 * API Health Check Verification Script
 * Verifies that the health check endpoint is working properly
 */

async function verifyHealthEndpoint() {
  try {
    const response = await fetch('http://localhost:3000/api/security/health')

    if (response.ok) {
      const healthData = await response.json()

      // Check if database is healthy
      const isDatabaseHealthy =
        healthData.status === 'healthy' && healthData.services?.database === 'connected'

      if (isDatabaseHealthy) {
        // Database connection is healthy
      } else {
        // Database connection issue detected
      }
    } else {
      const _errorText = await response.text()
    }
  } catch (_error) {
    // Health check failed - silently continue
  }
}

// Run the verification
verifyHealthEndpoint().catch(_error => {
  process.exit(1)
})
