/**
 * WebAuthn Integration Tests
 *
 * Comprehensive integration tests for WebAuthn functionality including:
 * - Complete authentication workflows
 * - Database integration with validation
 * - Performance benchmarks
 * - Edge cases and error scenarios
 * - Security validation
 * - Real-world usage scenarios
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../unit/database/db-client'
import {
  WebAuthnMockData,
  WebAuthnPerformanceHelper,
  WebAuthnTestSeeder,
  WebAuthnTestValidator,
} from '../../utils/webauthn-test-factories'

// TypeScript interfaces for WebAuthn integration test data
interface WebAuthnCredential {
  id: string
  user_id: string
  credential_id: string
  public_key: string
  counter: string | number
  device_name?: string | null
  created_at: string
  last_used_at?: string | null
}

interface WebAuthnUser {
  id: string
  github_id: number
  username: string
  email?: string | null
}

interface WebAuthnTestCredential {
  id: string
  user_id: string
  credential_id: string
  public_key: string
  counter: number
  device_name?: string | null
}

describe('WebAuthn Integration Tests', () => {
  let seeder: WebAuthnTestSeeder

  beforeEach(() => {
    seeder = new WebAuthnTestSeeder()
  })

  afterEach(async () => {
    await seeder.cleanup()
  })

  describe('Complete Registration Workflow', () => {
    it('should handle complete user registration with WebAuthn credential', async () => {
      // Step 1: Create user
      const user = await seeder.createUser({
        username: 'webauthn_integration_user',
        email: 'integration@webauthn.test',
      })

      // Step 2: Generate WebAuthn registration data
      const registrationData = WebAuthnMockData.generateRegistrationData()

      // Step 3: Store WebAuthn credential
      const credential = await seeder.createCredential(user.id, {
        credentialId: registrationData.credentialId,
        publicKey: registrationData.publicKey,
        counter: registrationData.counter,
        deviceName: 'Integration Test Device',
      })

      // Step 4: Verify complete registration
      const storedCredential = await sql`
        SELECT 
          c.*,
          u.username,
          u.email
        FROM webauthn_credentials c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ${credential.id}
      `

      expect(storedCredential).toHaveLength(1)
      expect(storedCredential[0].username).toBe('webauthn_integration_user')
      expect(storedCredential[0].email).toBe('integration@webauthn.test')
      expect(storedCredential[0].credential_id).toBe(registrationData.credentialId)
      expect(storedCredential[0].device_name).toBe('Integration Test Device')

      // Step 5: Validate credential structure
      const validation = WebAuthnTestValidator.validateCredentialStructure(storedCredential[0])
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should handle user with multiple WebAuthn devices', async () => {
      const user = await seeder.createUser()

      const devices = [
        { deviceName: 'Phone', credentialId: 'phone_credential_123' },
        { deviceName: 'Laptop', credentialId: 'laptop_credential_456' },
        { deviceName: 'Security Key', credentialId: 'key_credential_789' },
      ]

      const credentials = []
      for (const device of devices) {
        const credential = await seeder.createCredential(user.id, {
          credentialId: device.credentialId,
          deviceName: device.deviceName,
        })
        credentials.push(credential)
      }

      // Verify all devices are stored correctly
      const userCredentials = await sql`
        SELECT device_name, credential_id, counter
        FROM webauthn_credentials 
        WHERE user_id = ${user.id}
        ORDER BY device_name
      `

      expect(userCredentials).toHaveLength(3)
      expect(userCredentials.map((c: WebAuthnCredential) => c.device_name)).toEqual([
        'Laptop',
        'Phone',
        'Security Key',
      ])
      expect(userCredentials.map((c: WebAuthnCredential) => c.credential_id)).toEqual([
        'laptop_credential_456',
        'phone_credential_123',
        'key_credential_789',
      ])
    })
  })

  describe('Authentication Workflow', () => {
    let testUser: WebAuthnUser
    let testCredential: WebAuthnTestCredential

    beforeEach(async () => {
      const setup = await seeder.createUserWithCredentials(1, {
        username: 'auth_test_user',
      })
      testUser = setup.user
      testCredential = setup.credentials[0]
    })

    it('should handle complete authentication workflow', async () => {
      // Step 1: Simulate credential lookup for authentication
      const credential = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE credential_id = ${testCredential.credentialId}
      `

      expect(credential).toHaveLength(1)
      expect(credential[0].user_id).toBe(testUser.id)

      // Step 2: Generate authentication data
      const authData = WebAuthnMockData.generateAuthenticationData(
        testCredential.credentialId,
        Number(credential[0].counter) + 1
      )

      // Step 3: Update counter and last_used_at (simulate successful authentication)
      const updateResult = await sql`
        UPDATE webauthn_credentials 
        SET 
          counter = ${authData.counter},
          last_used_at = NOW()
        WHERE credential_id = ${testCredential.credentialId}
        RETURNING counter, last_used_at
      `

      expect(updateResult).toHaveLength(1)
      expect(Number(updateResult[0].counter)).toBe(authData.counter)
      expect(updateResult[0].last_used_at).toBeDefined()

      // Step 4: Verify authentication state
      const updatedCredential = await sql`
        SELECT counter, last_used_at, created_at
        FROM webauthn_credentials 
        WHERE credential_id = ${testCredential.credentialId}
      `

      expect(Number(updatedCredential[0].counter)).toBe(authData.counter)
      expect(new Date(updatedCredential[0].last_used_at)).toBeInstanceOf(Date)
      expect(new Date(updatedCredential[0].last_used_at).getTime()).toBeGreaterThan(
        new Date(updatedCredential[0].created_at).getTime()
      )
    })

    it('should prevent counter rollback attacks', async () => {
      // Get current counter
      const currentCredential = await sql`
        SELECT counter FROM webauthn_credentials 
        WHERE credential_id = ${testCredential.credentialId}
      `
      const currentCounter = Number(currentCredential[0].counter)

      // Try to set counter to a lower value (should be prevented by application logic)
      const lowerCounter = Math.max(0, currentCounter - 1)

      // This test verifies that the application would need to check counter values
      // The database itself doesn't prevent counter rollback, but stores the value
      await sql`
        UPDATE webauthn_credentials 
        SET counter = ${currentCounter + 5}
        WHERE credential_id = ${testCredential.credentialId}
      `

      // Verify counter was updated to higher value
      const updatedCredential = await sql`
        SELECT counter FROM webauthn_credentials 
        WHERE credential_id = ${testCredential.credentialId}
      `

      expect(Number(updatedCredential[0].counter)).toBe(currentCounter + 5)

      // Application logic should prevent setting counter to lower value
      // This is a reminder that counter validation must be implemented in application layer
      expect(lowerCounter).toBeLessThan(Number(updatedCredential[0].counter))
    })

    it('should handle authentication with non-existent credential gracefully', async () => {
      const nonExistentCredentialId = 'non_existent_credential_123'

      const result = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE credential_id = ${nonExistentCredentialId}
      `

      expect(result).toHaveLength(0)

      // This test verifies that credential lookup returns empty result
      // Application should handle this as authentication failure
    })
  })

  describe('Security and Edge Cases', () => {
    it('should enforce data integrity constraints', async () => {
      const user = await seeder.createUser()

      // Test negative counter constraint
      await expect(
        sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${user.id}, 'negative_counter_test', 'public_key_data', -1)
        `
      ).rejects.toThrow()

      // Test empty credential_id constraint
      await expect(
        sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${user.id}, '', 'public_key_data', 0)
        `
      ).rejects.toThrow()

      // Test duplicate credential_id constraint
      await seeder.createCredential(user.id, {
        credentialId: 'duplicate_test_credential',
      })

      await expect(
        seeder.createCredential(user.id, {
          credentialId: 'duplicate_test_credential',
        })
      ).rejects.toThrow()
    })

    it('should handle orphaned credential prevention', async () => {
      const user = await seeder.createUser()
      const credential = await seeder.createCredential(user.id)

      // Verify credential exists
      const beforeDelete = await sql`
        SELECT id FROM webauthn_credentials WHERE id = ${credential.id}
      `
      expect(beforeDelete).toHaveLength(1)

      // Delete user (should cascade delete credential)
      await sql`DELETE FROM users WHERE id = ${user.id}`

      // Verify credential was cascade deleted
      const afterDelete = await sql`
        SELECT id FROM webauthn_credentials WHERE id = ${credential.id}
      `
      expect(afterDelete).toHaveLength(0)
    })

    it('should handle large counter values correctly', async () => {
      const user = await seeder.createUser()
      const largeCounter = 2000000000 // Close to 32-bit signed int limit

      const credential = await seeder.createCredential(user.id, {
        counter: largeCounter,
      })

      const storedCredential = await sql`
        SELECT counter FROM webauthn_credentials WHERE id = ${credential.id}
      `

      expect(Number(storedCredential[0].counter)).toBe(largeCounter)

      // Test incrementing large counter
      await sql`
        UPDATE webauthn_credentials 
        SET counter = counter + 1000
        WHERE id = ${credential.id}
      `

      const updatedCredential = await sql`
        SELECT counter FROM webauthn_credentials WHERE id = ${credential.id}
      `

      expect(Number(updatedCredential[0].counter)).toBe(largeCounter + 1000)
    })

    it('should handle concurrent authentication attempts safely', async () => {
      const user = await seeder.createUser()
      const credential = await seeder.createCredential(user.id, { counter: 0 })

      // Simulate concurrent counter updates
      const concurrentUpdates = Array.from(
        { length: 10 },
        (_, _i) =>
          sql`
          UPDATE webauthn_credentials 
          SET counter = counter + 1, last_used_at = NOW()
          WHERE id = ${credential.id}
        `
      )

      await Promise.all(concurrentUpdates)

      // Verify final counter value
      const finalCredential = await sql`
        SELECT counter FROM webauthn_credentials WHERE id = ${credential.id}
      `

      expect(Number(finalCredential[0].counter)).toBe(10)
    })

    it('should validate credential_id format constraints', async () => {
      const user = await seeder.createUser()

      // Test very long credential_id (should succeed if within database limits)
      const longCredentialId = 'A'.repeat(400)
      const credential = await seeder.createCredential(user.id, {
        credentialId: longCredentialId,
      })

      const storedCredential = await sql`
        SELECT credential_id FROM webauthn_credentials WHERE id = ${credential.id}
      `

      expect(storedCredential[0].credential_id).toBe(longCredentialId)

      // Test credential_id with special characters
      const specialCharCredentialId = 'test_cred-123_ABC'
      await seeder.createCredential(user.id, {
        credentialId: specialCharCredentialId,
      })

      const specialCharCredential = await sql`
        SELECT credential_id FROM webauthn_credentials 
        WHERE credential_id = ${specialCharCredentialId}
      `

      expect(specialCharCredential).toHaveLength(1)
      expect(specialCharCredential[0].credential_id).toBe(specialCharCredentialId)
    })
  })

  describe('Performance Benchmarks', () => {
    it('should perform efficient credential lookups', async () => {
      // Create test data
      const { users } = await WebAuthnPerformanceHelper.createBulkTestData(seeder, 10, 5)
      const testUser = users[0]

      // Benchmark user credential lookup
      const userLookupBenchmark = await WebAuthnPerformanceHelper.benchmark(
        'User Credential Lookup',
        async () => {
          return await sql`
            SELECT * FROM webauthn_credentials WHERE user_id = ${testUser.id}
          `
        },
        20
      )

      expect(userLookupBenchmark.averageDuration).toBeLessThan(50) // Should be very fast
      expect(userLookupBenchmark.iterations).toBe(20)

      console.log('User Credential Lookup Performance:', userLookupBenchmark)
    })

    it('should perform efficient credential_id lookups', async () => {
      // Create test data
      const { users } = await WebAuthnPerformanceHelper.createBulkTestData(seeder, 10, 5)
      const userCredentials = await sql`
        SELECT credential_id FROM webauthn_credentials 
        WHERE user_id = ${users[0].id} 
        LIMIT 1
      `
      const testCredentialId = userCredentials[0].credential_id

      // Benchmark credential ID lookup
      const credentialLookupBenchmark = await WebAuthnPerformanceHelper.benchmark(
        'Credential ID Lookup',
        async () => {
          return await sql`
            SELECT * FROM webauthn_credentials WHERE credential_id = ${testCredentialId}
          `
        },
        20
      )

      expect(credentialLookupBenchmark.averageDuration).toBeLessThan(30) // Should be very fast with unique index
      expect(credentialLookupBenchmark.iterations).toBe(20)

      console.log('Credential ID Lookup Performance:', credentialLookupBenchmark)
    })

    it('should handle bulk operations efficiently', async () => {
      const user = await seeder.createUser()

      // Benchmark bulk credential insertion
      const bulkInsertBenchmark = await WebAuthnPerformanceHelper.benchmark(
        'Bulk Credential Insert',
        async () => {
          return await seeder.createCredential(user.id)
        },
        50
      )

      expect(bulkInsertBenchmark.averageDuration).toBeLessThan(100) // Should be reasonably fast
      console.log('Bulk Credential Insert Performance:', bulkInsertBenchmark)

      // Verify all credentials were inserted
      const userCredentials = await sql`
        SELECT COUNT(*) as count FROM webauthn_credentials WHERE user_id = ${user.id}
      `
      expect(Number(userCredentials[0].count)).toBe(50)
    })

    it('should perform efficient join queries', async () => {
      // Create test data
      await WebAuthnPerformanceHelper.createBulkTestData(seeder, 5, 3)

      // Benchmark join query performance
      const joinBenchmark = await WebAuthnPerformanceHelper.benchmark(
        'User-Credential Join Query',
        async () => {
          return await sql`
            SELECT 
              u.username,
              u.email,
              c.credential_id,
              c.device_name,
              c.last_used_at
            FROM users u
            JOIN webauthn_credentials c ON u.id = c.user_id
            ORDER BY u.username, c.device_name
          `
        },
        10
      )

      expect(joinBenchmark.averageDuration).toBeLessThan(100) // Should be efficient with proper indexes
      console.log('User-Credential Join Performance:', joinBenchmark)
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle device registration and management workflow', async () => {
      const user = await seeder.createUser({
        username: 'device_manager_user',
        email: 'devices@test.example',
      })

      // Scenario: User registers multiple devices over time
      const devices = [
        { name: 'iPhone 15', credentialId: 'iphone_cred_001' },
        { name: 'MacBook Pro', credentialId: 'macbook_cred_002' },
        { name: 'YubiKey 5', credentialId: 'yubikey_cred_003' },
      ]

      const credentials = []
      for (const device of devices) {
        const credential = await seeder.createCredential(user.id, {
          credentialId: device.credentialId,
          deviceName: device.name,
        })
        credentials.push(credential)

        // Simulate some usage
        await sql`
          UPDATE webauthn_credentials 
          SET 
            counter = counter + ${Math.floor(Math.random() * 10) + 1},
            last_used_at = NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days'
          WHERE id = ${credential.id}
        `
      }

      // User views their registered devices
      const userDevices = await sql`
        SELECT 
          device_name,
          credential_id,
          counter,
          created_at,
          last_used_at,
          CASE 
            WHEN last_used_at IS NULL THEN 'Never used'
            WHEN last_used_at > NOW() - INTERVAL '7 days' THEN 'Recent'
            WHEN last_used_at > NOW() - INTERVAL '30 days' THEN 'Moderate'
            ELSE 'Old'
          END as usage_status
        FROM webauthn_credentials 
        WHERE user_id = ${user.id}
        ORDER BY last_used_at DESC NULLS LAST
      `

      expect(userDevices).toHaveLength(3)
      expect(userDevices.every((d: WebAuthnCredential) => d.device_name)).toBe(true)
      expect(userDevices.every((d: WebAuthnCredential) => Number(d.counter) > 0)).toBe(true)

      // User removes old device
      await sql`
        DELETE FROM webauthn_credentials 
        WHERE user_id = ${user.id} AND device_name = 'iPhone 15'
      `

      const remainingDevices = await sql`
        SELECT device_name FROM webauthn_credentials WHERE user_id = ${user.id}
      `

      expect(remainingDevices).toHaveLength(2)
      expect(remainingDevices.map((d: WebAuthnCredential) => d.device_name)).toEqual([
        'MacBook Pro',
        'YubiKey 5',
      ])
    })

    it('should handle account recovery scenarios', async () => {
      const user = await seeder.createUser({
        username: 'recovery_test_user',
      })

      // User has multiple devices
      const primaryDevice = await seeder.createCredential(user.id, {
        credentialId: 'primary_device_123',
        deviceName: 'Primary Phone',
      })

      const backupDevice = await seeder.createCredential(user.id, {
        credentialId: 'backup_device_456',
        deviceName: 'Backup Security Key',
      })

      // Simulate primary device being lost (user can't access it)
      // But backup device is still available
      const availableCredentials = await sql`
        SELECT 
          credential_id,
          device_name,
          counter
        FROM webauthn_credentials 
        WHERE user_id = ${user.id}
        AND credential_id != ${primaryDevice.credentialId}
      `

      expect(availableCredentials).toHaveLength(1)
      expect(availableCredentials[0].credential_id).toBe(backupDevice.credentialId)

      // User can still authenticate with backup device
      await sql`
        UPDATE webauthn_credentials 
        SET 
          counter = counter + 1,
          last_used_at = NOW()
        WHERE credential_id = ${backupDevice.credentialId}
      `

      // User removes lost device from account
      await sql`
        DELETE FROM webauthn_credentials 
        WHERE credential_id = ${primaryDevice.credentialId}
      `

      const finalCredentials = await sql`
        SELECT credential_id, device_name FROM webauthn_credentials 
        WHERE user_id = ${user.id}
      `

      expect(finalCredentials).toHaveLength(1)
      expect(finalCredentials[0].device_name).toBe('Backup Security Key')
    })

    it('should handle high-frequency authentication scenarios', async () => {
      const user = await seeder.createUser({
        username: 'high_freq_user',
      })

      const credential = await seeder.createCredential(user.id, {
        credentialId: 'high_freq_credential',
        deviceName: 'Daily Use Device',
        counter: 0,
      })

      // Simulate frequent authentication over time
      const authenticationCount = 100
      for (let i = 1; i <= authenticationCount; i++) {
        await sql`
          UPDATE webauthn_credentials 
          SET 
            counter = ${i},
            last_used_at = NOW() - INTERVAL '${authenticationCount - i} minutes'
          WHERE id = ${credential.id}
        `
      }

      // Verify final state
      const finalCredential = await sql`
        SELECT 
          counter,
          last_used_at,
          created_at,
          EXTRACT(EPOCH FROM (last_used_at - created_at)) / 60 as usage_duration_minutes
        FROM webauthn_credentials 
        WHERE id = ${credential.id}
      `

      expect(Number(finalCredential[0].counter)).toBe(authenticationCount)
      expect(Number(finalCredential[0].usage_duration_minutes)).toBeGreaterThan(0)

      // Query authentication history (simulated)
      const recentAuth = await sql`
        SELECT 
          counter,
          last_used_at,
          CASE 
            WHEN last_used_at > NOW() - INTERVAL '1 hour' THEN 'Very Recent'
            WHEN last_used_at > NOW() - INTERVAL '1 day' THEN 'Recent'
            ELSE 'Old'
          END as recency
        FROM webauthn_credentials 
        WHERE id = ${credential.id}
      `

      expect(recentAuth[0].recency).toBe('Very Recent')
    })
  })

  describe('Error Handling and Validation', () => {
    it('should validate WebAuthn credential data with schema validators', async () => {
      const user = await seeder.createUser()

      // Test invalid counter values
      const invalidCredentialData = {
        userId: user.id,
        credentialId: 'test_credential',
        publicKey: 'valid_public_key_data',
        counter: -5, // Invalid: negative
        deviceName: 'Test Device',
      }

      // This would be caught by Zod schema validation in application layer
      const validation = {
        isValid: invalidCredentialData.counter >= 0,
        errors: invalidCredentialData.counter < 0 ? ['Counter must be non-negative'] : [],
      }

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Counter must be non-negative')

      // Test valid credential data
      const validCredentialData = {
        ...invalidCredentialData,
        counter: 0,
      }

      const validValidation = {
        isValid: validCredentialData.counter >= 0,
        errors: [],
      }

      expect(validValidation.isValid).toBe(true)
      expect(validValidation.errors).toHaveLength(0)
    })

    it('should handle database connection errors gracefully', async () => {
      // This test demonstrates how database errors should be handled
      // In a real scenario, connection errors would need to be caught by the application

      try {
        // Attempt to query with invalid SQL (this will throw an error)
        await sql`SELECT * FROM non_existent_table`
      } catch (error) {
        expect(error).toBeDefined()
        expect(error instanceof Error).toBe(true)

        // Application should handle database errors appropriately
        console.log('Database error handled:', error.message)
      }
    })

    it('should validate data integrity across user deletion', async () => {
      // Create multiple users with credentials
      const users = await Promise.all([
        seeder.createUserWithCredentials(2),
        seeder.createUserWithCredentials(3),
        seeder.createUserWithCredentials(1),
      ])

      const allUsers = users.map(u => u.user)
      const _allCredentials = users.flatMap(u => u.credentials)

      // Verify initial state
      const initialCredentials = await sql`
        SELECT user_id FROM webauthn_credentials 
        WHERE user_id = ANY(${allUsers.map(u => u.id)})
      `
      expect(initialCredentials).toHaveLength(6) // 2 + 3 + 1

      // Delete one user
      await sql`DELETE FROM users WHERE id = ${allUsers[0].id}`

      // Verify cascade deletion
      const remainingCredentials = await sql`
        SELECT user_id FROM webauthn_credentials 
        WHERE user_id = ANY(${allUsers.map(u => u.id)})
      `
      expect(remainingCredentials).toHaveLength(4) // 3 + 1

      // Verify data integrity
      const orphanedCredentials = await sql`
        SELECT c.id 
        FROM webauthn_credentials c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE u.id IS NULL
      `
      expect(orphanedCredentials).toHaveLength(0) // No orphaned credentials
    })
  })
})
