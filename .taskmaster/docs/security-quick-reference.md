# Security Quick Reference for Developers

## 🚨 Security Essentials Checklist

### Before Writing Code
- [ ] Review security requirements for your feature
- [ ] Understand data flow and trust boundaries
- [ ] Check if external APIs are involved
- [ ] Identify authentication/authorization needs

### During Development

#### ✅ Input Validation
```typescript
// ✅ DO: Use Zod for validation
const userInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100)
})

// ❌ DON'T: Trust user input
const userData = req.body // Dangerous!
```

#### ✅ Authentication
```typescript
// ✅ DO: Check authentication
const session = await getServerSession(authOptions)
if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ❌ DON'T: Skip authentication checks
// Assume user is authenticated
```

#### ✅ API Security
```typescript
// ✅ DO: Configure timeouts
const githubClient = new GitHubClient({
  accessToken: session.accessToken,
  timeout: 30000 // 30 seconds
})

// ❌ DON'T: Use unlimited timeouts
const client = new GitHubClient() // No timeout = potential hang
```

#### ✅ Error Handling
```typescript
// ✅ DO: Generic error messages
return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })

// ❌ DON'T: Leak sensitive information
return NextResponse.json({ error: `Invalid token: ${token}` }) // Exposes token!
```

### Security Configuration

#### Rate Limiting
```typescript
// Use built-in rate limiting for new endpoints
import { rateLimit } from '@/lib/security/rate-limit'

export const POST = rateLimit(async (req: NextRequest) => {
  // Your endpoint logic
})
```

#### CORS Headers
```typescript
// CORS is handled automatically by middleware
// For custom CORS needs, use the configuration
import { corsConfig } from '@/lib/config'
```

#### Security Headers
```typescript
// Security headers applied automatically
// Custom headers only when needed:
import { SecurityHeadersManager } from '@/lib/security/security-headers'

const manager = new SecurityHeadersManager()
return manager.applyHeaders(request, response, {
  frameOptions: 'SAMEORIGIN' // Only if different from default
})
```

## 🔧 Common Security Patterns

### Database Queries
```typescript
// ✅ DO: Use Prisma/ORM with parameterized queries
const user = await db.user.findUnique({
  where: { id: userId }
})

// ❌ DON'T: Raw SQL with string interpolation
const query = `SELECT * FROM users WHERE id = ${userId}` // SQL injection risk!
```

### File Operations
```typescript
// ✅ DO: Validate file paths
import path from 'path'

const safePath = path.join(UPLOAD_DIR, path.basename(filename))
if (!safePath.startsWith(UPLOAD_DIR)) {
  throw new Error('Invalid file path')
}

// ❌ DON'T: Use user input directly in file paths
const filePath = `/uploads/${req.body.filename}` // Path traversal risk!
```

### Environment Variables
```typescript
// ✅ DO: Use env validation
import { env } from '@/lib/validation/env'
const apiKey = env.GITHUB_API_KEY

// ❌ DON'T: Access process.env directly
const key = process.env.GITHUB_API_KEY // No validation!
```

## 🧪 Testing Security

### Required Security Tests
```typescript
// Authentication tests
it('should reject unauthenticated requests', async () => {
  const response = await request(app)
    .get('/api/protected')
    .expect(401)
})

// Input validation tests
it('should reject invalid email format', async () => {
  const response = await request(app)
    .post('/api/users')
    .send({ email: 'invalid-email' })
    .expect(400)
})

// Rate limiting tests
it('should enforce rate limits', async () => {
  // Make multiple requests quickly
  for (let i = 0; i < 10; i++) {
    await request(app).post('/api/auth/login')
  }
  
  const response = await request(app)
    .post('/api/auth/login')
    .expect(429) // Too Many Requests
})
```

### Run Security Tests
```bash
# Before committing
pnpm test:security
pnpm test:integration:security

# Full security validation
pnpm test:e2e:security
```

## 🚨 Security Red Flags

### Immediate Security Review Needed
- [ ] Hardcoded secrets or API keys
- [ ] Raw SQL queries with user input
- [ ] File operations with user-provided paths
- [ ] External API calls without timeouts
- [ ] Authentication bypass logic
- [ ] Custom cryptographic implementations
- [ ] eval() or Function() usage
- [ ] innerHTML with user content

### Code Patterns to Avoid
```typescript
// ❌ Hardcoded secrets
const API_KEY = 'sk-1234567890abcdef'

// ❌ SQL injection risk
const query = `SELECT * FROM users WHERE name = '${userName}'`

// ❌ XSS vulnerability
element.innerHTML = userInput

// ❌ Path traversal
const filePath = `./uploads/${userFileName}`

// ❌ Unlimited external requests
fetch(userProvidedUrl) // No timeout, SSRF risk

// ❌ Weak randomness for security
Math.random() // Use crypto.randomBytes() instead
```

## 📝 Security Review Process

### Self-Review Checklist
- [ ] No hardcoded secrets
- [ ] All user inputs validated
- [ ] Authentication required where needed
- [ ] Error messages don't leak information
- [ ] External requests have timeouts
- [ ] Security tests written and passing

### Security-Sensitive Changes
**Require mandatory security review:**
- Authentication/authorization changes
- New API endpoints
- External service integrations
- File upload/download features
- Database schema changes
- Cryptographic operations

### Getting Security Review
1. **Label PR**: Add `security-review` label
2. **Security Team**: Tag `@security-team` for review
3. **Documentation**: Link to relevant security tests
4. **Staging Tests**: Ensure staging security tests pass

## 🔗 Quick Links

- [Full Security Implementation Guide](./security-implementation-guide.md)
- [Staging Security Testing Plan](./staging-security-testing-plan.md)
- [OWASP Top 10 Checklist](#compliance--standards)
- [Security Configuration Reference](../src/lib/config/index.ts)

## 🆘 Security Incident Response

### If You Find a Security Issue
1. **Stop**: Don't commit the vulnerable code
2. **Report**: Immediately notify security team
3. **Document**: Create detailed issue description
4. **Isolate**: Don't share details publicly

### Emergency Contacts
- **Security Team**: `@security-team` on Slack
- **On-Call**: Use escalation procedures
- **Email**: security@contribux.com (for external reports)

---

**Remember**: When in doubt about security, ask the security team. It's better to be safe than sorry!

**Document Version**: 1.0  
**Last Updated**: 2024-01-XX  
**Next Review**: Monthly