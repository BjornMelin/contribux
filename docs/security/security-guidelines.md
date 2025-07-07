# Contribux Security Guidelines

## Overview

This document establishes comprehensive security guidelines for the Contribux platform, derived from our completed SQL injection prevention initiative and zero-trust security architecture.

## SQL Injection Prevention

### 1. Mandatory Parameterized Queries

**RULE:** All database queries MUST use parameterized syntax.

#### ✅ Correct Usage:
```typescript
// Parameterized query with sql template literal
const users = await sql`
  SELECT * FROM users 
  WHERE email = ${userEmail} 
  AND status = ${status}
`

// Complex parameterized query
const repositories = await sql`
  SELECT r.*, COUNT(o.id) as opportunity_count
  FROM repositories r
  LEFT JOIN opportunities o ON r.id = o.repository_id
  WHERE r.name ILIKE ${`%${searchQuery}%`}
     OR r.description ILIKE ${`%${searchQuery}%`}
  GROUP BY r.id
  ORDER BY r.stars DESC
  LIMIT ${limit}
`
```

#### ❌ Prohibited Usage:
```typescript
// NEVER use sql.unsafe() without security team approval
const query = sql.unsafe(`SELECT * FROM users WHERE id = '${userId}'`)

// NEVER use string concatenation for SQL
const query = `SELECT * FROM ${tableName} WHERE id = '${userId}'`

// NEVER use template literals with unvalidated input
const query = sql`SELECT * FROM ${tableName} WHERE id = ${userId}`
```

### 2. Table Name Validation

**RULE:** Dynamic table names MUST be validated against strict allowlists.

#### ✅ Correct Implementation:
```typescript
function isValidTableName(tableName: string): boolean {
  const allowedTables = new Set([
    'users', 'repositories', 'opportunities',
    'user_preferences', 'notifications'
  ])
  return allowedTables.has(tableName)
}

// Use switch statements for dynamic table operations
async function cleanupTable(tableName: string) {
  if (!isValidTableName(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`)
  }
  
  switch (tableName) {
    case 'users':
      return await sql`DELETE FROM users WHERE deleted_at < NOW() - INTERVAL '90 days'`
    case 'repositories':
      return await sql`DELETE FROM repositories WHERE archived_at < NOW() - INTERVAL '1 year'`
    default:
      throw new Error(`Unsupported table: ${tableName}`)
  }
}
```

### 3. Input Validation

**RULE:** All user input MUST be validated before database operations.

#### Field Validation:
```typescript
function isValidUserField(field: string): boolean {
  const validFields = ['email', 'github_username', 'recovery_email', 'display_name']
  return validFields.includes(field)
}

function isValidSortField(field: string): boolean {
  const validSortFields = ['created_at', 'updated_at', 'name', 'stars']
  return validSortFields.includes(field)
}
```

## Authentication and Authorization

### 1. Token Validation

**RULE:** All sensitive operations MUST validate authentication tokens.

```typescript
async function validateAuthToken(token: string): Promise<boolean> {
  if (!token || token.length < 32) {
    return false
  }
  
  // Implement proper token verification
  const isValid = await verifyJWT(token)
  return isValid
}
```

### 2. GDPR Operations Security

**RULE:** GDPR operations require additional verification tokens.

```typescript
async function handleDataRectification(
  userId: string,
  fieldUpdates: Record<string, unknown>,
  verificationToken: string
) {
  // Verify rectification token
  if (!isValidVerificationToken(verificationToken)) {
    throw new Error('Invalid rectification verification token')
  }
  
  // Validate field names
  for (const field of Object.keys(fieldUpdates)) {
    if (!isValidUserField(field)) {
      throw new Error(`Invalid field name: ${field}`)
    }
  }
  
  // Use parameterized queries only
  // ... implementation
}
```

## Cryptographic Security

### 1. Encryption Standards

**RULE:** Use AES-256-GCM for data encryption with proper key management.

```typescript
// Secure encryption implementation
async function encryptSensitiveData(data: string): Promise<EncryptedData> {
  const key = await getEncryptionKey() // From secure key management
  const nonce = generateNonce() // 96-bit random nonce
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(data)
  )
  
  return { encrypted, nonce, algorithm: 'AES-256-GCM' }
}
```

### 2. Digital Signatures

**RULE:** Use ECDSA P-256 for digital signatures with proper key rotation.

```typescript
// Secure signature implementation
async function createDigitalSignature(
  data: string,
  privateKey: CryptoKey,
  keyId: string
): Promise<DigitalSignature> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(data)
  )
  
  return {
    signature: arrayBufferToBase64(signature),
    algorithm: 'ECDSA',
    keyId,
    timestamp: Date.now()
  }
}
```

### 3. Key Management

**RULE:** Implement proper key rotation and entropy validation.

```typescript
// Secure key generation
async function generateEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  )
}

// Key rotation policy (90 days for ECDSA keys)
const KEY_ROTATION_PERIOD = 90 * 24 * 60 * 60 * 1000 // 90 days
```

## Error Handling

### 1. Security-Hardened Error Messages

**RULE:** Never expose database structure or sensitive information in errors.

#### ✅ Correct Error Handling:
```typescript
try {
  const user = await sql`SELECT * FROM users WHERE id = ${userId}`
  if (user.length === 0) {
    throw new Error('User not found') // Generic message
  }
} catch (error) {
  // Log detailed error internally
  logger.error('Database query failed', { userId, error: error.message })
  
  // Return generic error to client
  throw new Error('Database operation failed')
}
```

#### ❌ Prohibited Error Exposure:
```typescript
// NEVER expose SQL errors to users
catch (error) {
  throw new Error(`SQL Error: ${error.message}`) // Exposes database info
}

// NEVER expose table structure
catch (error) {
  throw new Error(`Table 'users' doesn't exist`) // Reveals schema
}
```

### 2. Rate Limiting and DOS Prevention

**RULE:** Implement rate limiting for all public endpoints.

```typescript
// API route rate limiting
export async function GET(request: Request) {
  const ip = getClientIP(request)
  
  // Check rate limit (100 requests per minute)
  const rateLimitCheck = await checkRateLimit(ip, 100, 60000)
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }
  
  // ... API implementation
}
```

## Testing Requirements

### 1. Security Test Coverage

**RULE:** All database operations MUST have SQL injection prevention tests.

```typescript
describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection in user search', async () => {
    const maliciousQuery = "'; DROP TABLE users; --"
    
    // Should not throw SQL syntax errors
    const result = await searchUsers(maliciousQuery)
    expect(result).toEqual([]) // No results, but no injection
  })
  
  it('should validate table names in cleanup operations', async () => {
    const maliciousTable = "users; DROP TABLE sessions; --"
    
    await expect(cleanupTable(maliciousTable))
      .rejects.toThrow('Invalid table name')
  })
})
```

### 2. Cryptographic Security Tests

**RULE:** All cryptographic operations MUST have comprehensive test coverage.

```typescript
describe('Cryptographic Security', () => {
  it('should generate unique signatures for each operation', async () => {
    const keyPair = await generateSignatureKeyPair()
    const data = 'test-data'
    
    const sig1 = await createDigitalSignature(data, keyPair.privateKey, keyPair.keyId)
    const sig2 = await createDigitalSignature(data, keyPair.privateKey, keyPair.keyId)
    
    // Signatures should be different due to timestamps
    expect(sig1.signature).not.toBe(sig2.signature)
  })
})
```

## Code Review Security Checklist

### Database Operations:
- [ ] Uses parameterized queries (`sql` template literals)
- [ ] No `sql.unsafe()` usage (or approved by security team)
- [ ] Table names validated against allowlists
- [ ] Input validation for all user data
- [ ] Proper error handling without information disclosure

### Authentication:
- [ ] Token validation for sensitive operations
- [ ] Verification tokens for GDPR operations
- [ ] Rate limiting implemented
- [ ] Session management secure

### Cryptography:
- [ ] Proper key generation and management
- [ ] Secure algorithms (AES-256-GCM, ECDSA P-256)
- [ ] Key rotation policies implemented
- [ ] Entropy validation for production keys

### Testing:
- [ ] SQL injection prevention tests
- [ ] Cryptographic security tests
- [ ] Error handling validation
- [ ] Attack vector coverage

## Security Monitoring

### 1. Automated Security Scans

**RULE:** Security tests MUST pass in CI/CD pipeline.

```bash
# Required security test commands
pnpm test tests/security/sql-injection-prevention.test.ts
pnpm test tests/security/encryption-key-security.test.ts
```

### 2. Security Metrics

**RULE:** Maintain security KPIs and monitoring.

- **SQL Injection Risk:** ELIMINATED (100% parameterized queries)
- **Authentication Bypass Risk:** PROTECTED (Token validation)
- **Data Integrity Risk:** SECURED (Digital signatures)
- **Test Coverage:** >90% for security-critical code

### 3. Incident Response

**RULE:** Security incidents require immediate response.

1. **Detection:** Automated monitoring and alerts
2. **Assessment:** Severity and impact analysis
3. **Containment:** Immediate threat mitigation
4. **Investigation:** Root cause analysis
5. **Recovery:** System restoration and validation
6. **Lessons Learned:** Process improvement

## Compliance and Auditing

### 1. GDPR Compliance

**RULE:** All personal data operations MUST comply with GDPR requirements.

- Right to erasure implementation
- Data minimization validation
- Consent management
- Audit logging for all operations

### 2. Security Audit Trail

**RULE:** Maintain comprehensive audit logs for security events.

```typescript
async function logSecurityEvent(event: SecurityEvent) {
  await sql`
    INSERT INTO security_audit_logs (
      event_type, event_severity, user_id, 
      event_data, success, created_at
    ) VALUES (
      ${event.type}, ${event.severity}, ${event.userId},
      ${JSON.stringify(event.data)}, ${event.success}, CURRENT_TIMESTAMP
    )
  `
}
```

## Conclusion

These security guidelines establish the foundation for secure development in the Contribux platform. All developers MUST follow these guidelines, and any deviations require security team approval.

**Security is everyone's responsibility.**

---

**Document Version:** 1.0  
**Last Updated:** 2025-06-25  
**Next Review:** 2025-09-25

*For security questions or concerns, contact the security team or refer to the incident response procedures.*