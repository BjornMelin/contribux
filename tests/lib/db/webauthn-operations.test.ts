/**
 * WebAuthn Operations Tests
 *
 * Tests for WebAuthn credential database operations including:
 * - Credential insertion and retrieval
 * - User-credential associations
 * - Counter updates and validation
 * - Credential deletion and cascading
 * - Query performance with indexes
 * - Concurrent operations
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../unit/database/db-client'

// TypeScript interface for WebAuthn credential database results
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

describe('WebAuthn Operations Tests', () => {
  let testUserId: string
  let testCredentials: Array<{ id: string; credentialId: string }>

  beforeEach(async () => {
    // Create a test user for each test
    const user = await sql`
      INSERT INTO users (github_id, username, email)
      VALUES (${Math.floor(Math.random() * 1000000)}, 'webauthn_test_user', 'test@webauthn-ops.example')
      RETURNING id
    `
    testUserId = user[0].id
    testCredentials = []
  })

  afterEach(async () => {
    // Cleanup test data
    if (testUserId) {
      await sql`DELETE FROM users WHERE id = ${testUserId}`
    }
  })

  describe('Credential Insertion', () => {
    it('should insert valid WebAuthn credentials', async () => {
      const credentialData = {
        credentialId: 'test_credential_123_abc',
        publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA',
        counter: 0,
        deviceName: 'Test Device',
      }

      const result = await sql`
        INSERT INTO webauthn_credentials (
          user_id, 
          credential_id, 
          public_key, 
          counter, 
          device_name
        )
        VALUES (
          ${testUserId}, 
          ${credentialData.credentialId}, 
          ${credentialData.publicKey}, 
          ${credentialData.counter}, 
          ${credentialData.deviceName}
        )
        RETURNING id, user_id, credential_id, public_key, counter, device_name, created_at
      `

      expect(result).toHaveLength(1)
      const credential = result[0]

      expect(credential.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
      expect(credential.user_id).toBe(testUserId)
      expect(credential.credential_id).toBe(credentialData.credentialId)
      expect(credential.public_key).toBe(credentialData.publicKey)
      expect(Number(credential.counter)).toBe(credentialData.counter)
      expect(credential.device_name).toBe(credentialData.deviceName)
      expect(credential.created_at).toBeDefined()

      testCredentials.push({ id: credential.id, credentialId: credential.credential_id })
    })

    it('should insert credentials without optional device_name', async () => {
      const result = await sql`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
        VALUES (${testUserId}, 'no_device_name_test', 'public_key_data', 1)
        RETURNING id, device_name
      `

      expect(result).toHaveLength(1)
      expect(result[0].device_name).toBeNull()

      testCredentials.push({ id: result[0].id, credentialId: 'no_device_name_test' })
    })

    it('should handle multiple credentials for the same user', async () => {
      const credentials = [
        { credentialId: 'multi_cred_1', publicKey: 'public_key_1', counter: 0 },
        { credentialId: 'multi_cred_2', publicKey: 'public_key_2', counter: 5 },
        { credentialId: 'multi_cred_3', publicKey: 'public_key_3', counter: 10 },
      ]

      for (const cred of credentials) {
        const result = await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${testUserId}, ${cred.credentialId}, ${cred.publicKey}, ${cred.counter})
          RETURNING id, credential_id
        `
        testCredentials.push({ id: result[0].id, credentialId: result[0].credential_id })
      }

      // Verify all credentials were inserted
      const userCredentials = await sql`
        SELECT credential_id, counter 
        FROM webauthn_credentials 
        WHERE user_id = ${testUserId} 
        ORDER BY credential_id
      `

      expect(userCredentials).toHaveLength(3)
      expect(userCredentials.map((c: WebAuthnCredential) => c.credential_id)).toEqual([
        'multi_cred_1',
        'multi_cred_2',
        'multi_cred_3',
      ])
      expect(userCredentials.map((c: WebAuthnCredential) => Number(c.counter))).toEqual([0, 5, 10])
    })
  })

  describe('Credential Retrieval', () => {
    beforeEach(async () => {
      // Insert test credentials
      const credentials = [
        {
          credentialId: 'retrieve_test_1',
          publicKey: 'pub_key_1',
          counter: 0,
          deviceName: 'Device 1',
        },
        {
          credentialId: 'retrieve_test_2',
          publicKey: 'pub_key_2',
          counter: 3,
          deviceName: 'Device 2',
        },
        { credentialId: 'retrieve_test_3', publicKey: 'pub_key_3', counter: 7, deviceName: null },
      ]

      for (const cred of credentials) {
        const result = await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_name)
          VALUES (${testUserId}, ${cred.credentialId}, ${cred.publicKey}, ${cred.counter}, ${cred.deviceName})
          RETURNING id, credential_id
        `
        testCredentials.push({ id: result[0].id, credentialId: result[0].credential_id })
      }
    })

    it('should retrieve credentials by user_id', async () => {
      const credentials = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE user_id = ${testUserId} 
        ORDER BY credential_id
      `

      expect(credentials).toHaveLength(3)
      expect(credentials.map((c: WebAuthnCredential) => c.credential_id)).toEqual([
        'retrieve_test_1',
        'retrieve_test_2',
        'retrieve_test_3',
      ])
    })

    it('should retrieve specific credential by credential_id', async () => {
      const credential = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE credential_id = 'retrieve_test_2'
      `

      expect(credential).toHaveLength(1)
      expect(credential[0].user_id).toBe(testUserId)
      expect(credential[0].public_key).toBe('pub_key_2')
      expect(Number(credential[0].counter)).toBe(3)
      expect(credential[0].device_name).toBe('Device 2')
    })

    it('should retrieve credential by user_id and credential_id combination', async () => {
      const credential = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE user_id = ${testUserId} AND credential_id = 'retrieve_test_1'
      `

      expect(credential).toHaveLength(1)
      expect(credential[0].device_name).toBe('Device 1')
    })

    it('should return empty result for non-existent credentials', async () => {
      const credential = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE credential_id = 'non_existent_credential'
      `

      expect(credential).toHaveLength(0)
    })

    it('should support credential lookup with joins to users table', async () => {
      const result = await sql`
        SELECT 
          c.credential_id,
          c.device_name,
          c.counter,
          u.username,
          u.email
        FROM webauthn_credentials c
        JOIN users u ON c.user_id = u.id
        WHERE c.credential_id = 'retrieve_test_2'
      `

      expect(result).toHaveLength(1)
      expect(result[0].credential_id).toBe('retrieve_test_2')
      expect(result[0].username).toBe('webauthn_test_user')
      expect(result[0].email).toBe('test@webauthn-ops.example')
    })
  })

  describe('Counter Updates', () => {
    let credentialId: string

    beforeEach(async () => {
      const result = await sql`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
        VALUES (${testUserId}, 'counter_update_test', 'public_key_data', 0)
        RETURNING id, credential_id
      `
      credentialId = result[0].credential_id
      testCredentials.push({ id: result[0].id, credentialId })
    })

    it('should update counter value correctly', async () => {
      const updatedCredential = await sql`
        UPDATE webauthn_credentials 
        SET counter = 5 
        WHERE credential_id = ${credentialId}
        RETURNING counter
      `

      expect(updatedCredential).toHaveLength(1)
      expect(Number(updatedCredential[0].counter)).toBe(5)
    })

    it('should increment counter atomically', async () => {
      // Simulate multiple increments
      await sql`
        UPDATE webauthn_credentials 
        SET counter = counter + 1 
        WHERE credential_id = ${credentialId}
      `

      await sql`
        UPDATE webauthn_credentials 
        SET counter = counter + 3 
        WHERE credential_id = ${credentialId}
      `

      const result = await sql`
        SELECT counter FROM webauthn_credentials WHERE credential_id = ${credentialId}
      `

      expect(Number(result[0].counter)).toBe(4) // 0 + 1 + 3
    })

    it('should update last_used_at when counter is updated', async () => {
      // Get initial timestamp
      const beforeUpdate = await sql`
        SELECT last_used_at FROM webauthn_credentials WHERE credential_id = ${credentialId}
      `
      expect(beforeUpdate[0].last_used_at).toBeNull()

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      // Update counter and last_used_at
      await sql`
        UPDATE webauthn_credentials 
        SET counter = counter + 1, last_used_at = NOW() 
        WHERE credential_id = ${credentialId}
      `

      const afterUpdate = await sql`
        SELECT last_used_at, counter FROM webauthn_credentials WHERE credential_id = ${credentialId}
      `

      expect(afterUpdate[0].last_used_at).not.toBeNull()
      expect(Number(afterUpdate[0].counter)).toBe(1)
    })

    it('should handle large counter values', async () => {
      const largeCounter = 2000000000 // Close to max 32-bit signed int

      await sql`
        UPDATE webauthn_credentials 
        SET counter = ${largeCounter} 
        WHERE credential_id = ${credentialId}
      `

      const result = await sql`
        SELECT counter FROM webauthn_credentials WHERE credential_id = ${credentialId}
      `

      expect(Number(result[0].counter)).toBe(largeCounter)
    })
  })

  describe('Credential Deletion', () => {
    beforeEach(async () => {
      // Insert multiple test credentials
      const credentials = [
        { credentialId: 'delete_test_1', publicKey: 'pub_key_1' },
        { credentialId: 'delete_test_2', publicKey: 'pub_key_2' },
        { credentialId: 'delete_test_3', publicKey: 'pub_key_3' },
      ]

      for (const cred of credentials) {
        const result = await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${testUserId}, ${cred.credentialId}, ${cred.publicKey}, 0)
          RETURNING id, credential_id
        `
        testCredentials.push({ id: result[0].id, credentialId: result[0].credential_id })
      }
    })

    it('should delete specific credential by credential_id', async () => {
      const deletedCount = await sql`
        DELETE FROM webauthn_credentials 
        WHERE credential_id = 'delete_test_2'
      `

      expect(deletedCount.length).toBe(0) // DELETE returns empty array in this setup

      // Verify credential was deleted
      const remaining = await sql`
        SELECT credential_id FROM webauthn_credentials 
        WHERE user_id = ${testUserId} 
        ORDER BY credential_id
      `

      expect(remaining).toHaveLength(2)
      expect(remaining.map((c: WebAuthnCredential) => c.credential_id)).toEqual([
        'delete_test_1',
        'delete_test_3',
      ])
    })

    it('should delete all credentials for a user', async () => {
      await sql`
        DELETE FROM webauthn_credentials WHERE user_id = ${testUserId}
      `

      const remaining = await sql`
        SELECT * FROM webauthn_credentials WHERE user_id = ${testUserId}
      `

      expect(remaining).toHaveLength(0)
    })

    it('should handle deletion of non-existent credential gracefully', async () => {
      // This should not throw an error
      await sql`
        DELETE FROM webauthn_credentials 
        WHERE credential_id = 'non_existent_credential'
      `

      // Verify original credentials still exist
      const remaining = await sql`
        SELECT credential_id FROM webauthn_credentials 
        WHERE user_id = ${testUserId}
      `

      expect(remaining).toHaveLength(3)
    })
  })

  describe('Query Performance', () => {
    beforeEach(async () => {
      // Insert a larger number of credentials to test performance
      const credentialPromises = []

      for (let i = 0; i < 20; i++) {
        credentialPromises.push(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${testUserId}, ${`perf_test_${i}_${Date.now()}`}, ${`public_key_${i}`}, ${i})
            RETURNING id, credential_id
          `
        )
      }

      const results = await Promise.all(credentialPromises)
      testCredentials.push(...results.map(r => ({ id: r[0].id, credentialId: r[0].credential_id })))
    })

    it('should efficiently query credentials by user_id', async () => {
      const startTime = Date.now()

      const credentials = await sql`
        SELECT * FROM webauthn_credentials WHERE user_id = ${testUserId}
      `

      const queryTime = Date.now() - startTime

      expect(credentials).toHaveLength(20)
      expect(queryTime).toBeLessThan(100) // Should be fast with index
    })

    it('should efficiently query single credential by credential_id', async () => {
      const testCredentialId = testCredentials[0].credentialId
      const startTime = Date.now()

      const credential = await sql`
        SELECT * FROM webauthn_credentials WHERE credential_id = ${testCredentialId}
      `

      const queryTime = Date.now() - startTime

      expect(credential).toHaveLength(1)
      expect(queryTime).toBeLessThan(50) // Should be very fast with unique index
    })

    it('should handle batch operations efficiently', async () => {
      const credentialIds = testCredentials.slice(0, 10).map(c => c.credentialId)

      const startTime = Date.now()

      const credentials = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE credential_id = ANY(${credentialIds})
        ORDER BY credential_id
      `

      const queryTime = Date.now() - startTime

      expect(credentials).toHaveLength(10)
      expect(queryTime).toBeLessThan(100) // Batch query should be efficient
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent credential insertions safely', async () => {
      const concurrentInserts = []

      for (let i = 0; i < 5; i++) {
        concurrentInserts.push(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${testUserId}, ${`concurrent_${i}_${Date.now()}_${Math.random()}`}, ${`public_key_${i}`}, 0)
            RETURNING id, credential_id
          `
        )
      }

      const results = await Promise.all(concurrentInserts)

      expect(results).toHaveLength(5)
      results.forEach((result, index) => {
        expect(result).toHaveLength(1)
        expect(result[0].credential_id).toContain(`concurrent_${index}`)
        testCredentials.push({ id: result[0].id, credentialId: result[0].credential_id })
      })
    })

    it('should handle concurrent counter updates safely', async () => {
      // Insert a credential for testing
      const credential = await sql`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
        VALUES (${testUserId}, 'concurrent_counter_test', 'public_key_data', 0)
        RETURNING id, credential_id
      `

      const credentialId = credential[0].credential_id
      testCredentials.push({ id: credential[0].id, credentialId })

      // Perform concurrent counter increments
      const concurrentUpdates = []
      for (let i = 0; i < 10; i++) {
        concurrentUpdates.push(
          sql`
            UPDATE webauthn_credentials 
            SET counter = counter + 1 
            WHERE credential_id = ${credentialId}
          `
        )
      }

      await Promise.all(concurrentUpdates)

      // Verify final counter value
      const finalCounter = await sql`
        SELECT counter FROM webauthn_credentials WHERE credential_id = ${credentialId}
      `

      expect(Number(finalCounter[0].counter)).toBe(10)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain referential integrity during operations', async () => {
      // Insert credential
      const credential = await sql`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
        VALUES (${testUserId}, 'integrity_test', 'public_key_data', 0)
        RETURNING id
      `

      testCredentials.push({ id: credential[0].id, credentialId: 'integrity_test' })

      // Verify user-credential relationship
      const relationship = await sql`
        SELECT u.username, c.credential_id
        FROM users u
        JOIN webauthn_credentials c ON u.id = c.user_id
        WHERE c.credential_id = 'integrity_test'
      `

      expect(relationship).toHaveLength(1)
      expect(relationship[0].username).toBe('webauthn_test_user')
      expect(relationship[0].credential_id).toBe('integrity_test')
    })

    it('should prevent orphaned credentials', async () => {
      // Create a second test user
      const user2 = await sql`
        INSERT INTO users (github_id, username)
        VALUES (${Math.floor(Math.random() * 1000000)}, 'webauthn_test_user_2')
        RETURNING id
      `
      const user2Id = user2[0].id

      try {
        // Insert credential for user2
        await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${user2Id}, 'orphan_test', 'public_key_data', 0)
        `

        // Delete user2 (should cascade delete credential)
        await sql`DELETE FROM users WHERE id = ${user2Id}`

        // Verify credential was deleted
        const orphanCredentials = await sql`
          SELECT * FROM webauthn_credentials WHERE credential_id = 'orphan_test'
        `

        expect(orphanCredentials).toHaveLength(0)
      } finally {
        // Cleanup in case test fails
        await sql`DELETE FROM users WHERE id = ${user2Id}`.catch(() => {
          // Ignore cleanup errors - user may already be deleted
        })
      }
    })

    it('should enforce all constraints during bulk operations', async () => {
      // Try to insert multiple credentials with duplicate credential_id (should fail)
      await expect(async () => {
        const promises = [
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${testUserId}, 'bulk_duplicate', 'public_key_1', 0)
          `,
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${testUserId}, 'bulk_duplicate', 'public_key_2', 0)
          `,
        ]

        await Promise.all(promises)
      }).rejects.toThrow()
    })
  })
})
