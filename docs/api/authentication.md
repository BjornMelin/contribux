# Authentication

The Contribux API supports multiple authentication methods to provide flexibility for different integration scenarios.

## Authentication Methods

### 1. JWT Bearer Tokens (Recommended)

JWT (JSON Web Token) bearer tokens provide secure, stateless authentication for API access.

#### Request Format

Include the JWT token in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Token Types

**Access Tokens**
- **Lifetime**: 15 minutes
- **Usage**: All API requests
- **Scope**: Full account access

**Refresh Tokens**
- **Lifetime**: 7 days
- **Usage**: Token renewal only
- **Security**: Automatic rotation on use

#### Obtaining Tokens

**OAuth Flow (Recommended)**

```http
POST /api/v1/auth/oauth/github
Content-Type: application/json

{
  "code": "authorization_code_from_github",
  "redirect_uri": "https://yourapp.com/callback",
  "code_verifier": "pkce_code_verifier"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 900,
  "token_type": "Bearer",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "github_username": "username"
  }
}
```

#### Token Refresh

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 2. WebAuthn (Web Applications)

WebAuthn provides passwordless authentication using biometric or hardware security keys.

#### Registration Flow

```http
POST /api/v1/auth/webauthn/registration/options
Content-Type: application/json

{
  "user_id": "user_123",
  "username": "user@example.com"
}
```

**Response:**
```json
{
  "challenge": "base64url_encoded_challenge",
  "rp": {
    "id": "contribux.ai",
    "name": "Contribux"
  },
  "user": {
    "id": "user_123",
    "name": "user@example.com",
    "displayName": "User Name"
  },
  "pubKeyCredParams": [...],
  "timeout": 60000
}
```

#### Authentication Flow

```http
POST /api/v1/auth/webauthn/authentication/options

{
  "userVerification": "preferred"
}
```

### 3. API Keys (Server-to-Server)

For server-to-server integrations, use API keys with specific scopes.

#### Request Format

```http
X-API-Key: ck_live_1234567890abcdef
```

#### Scopes

- `read:repositories` - Read repository data
- `read:opportunities` - Read contribution opportunities
- `write:analytics` - Submit contribution analytics
- `read:users` - Read user profile data

#### Obtaining API Keys

API keys are managed through the [Developer Dashboard](https://contribux.ai/dashboard/developers).

## OAuth Integration

### GitHub OAuth Setup

1. **Create GitHub OAuth App**
   - Navigate to GitHub Settings > Developer settings > OAuth Apps
   - Set Authorization callback URL: `https://yourdomain.com/auth/callback`

2. **Initiate OAuth Flow**

```javascript
// Frontend JavaScript
const params = new URLSearchParams({
  client_id: 'your_github_client_id',
  redirect_uri: 'https://yourdomain.com/auth/callback',
  scope: 'user:email',
  state: 'random_state_string',
  code_challenge: 'base64url_code_challenge',
  code_challenge_method: 'S256'
})

window.location.href = `https://github.com/login/oauth/authorize?${params}`
```

3. **Exchange Code for Token**

```javascript
// Backend handling callback
const response = await fetch('/api/v1/auth/oauth/github', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: authorizationCode,
    redirect_uri: 'https://yourdomain.com/auth/callback',
    code_verifier: pkceCodeVerifier
  })
})

const { access_token, refresh_token } = await response.json()
```

## Security Best Practices

### Token Storage

**Frontend Applications**
- Store access tokens in memory (JavaScript variables)
- Store refresh tokens in secure HttpOnly cookies
- Never store tokens in localStorage for security reasons

**Backend Applications**
- Use secure environment variables
- Implement token encryption at rest
- Rotate API keys regularly

### Token Validation

**Server-Side Validation**
```javascript
// Validate JWT token structure
const payload = jwt.verify(token, process.env.JWT_SECRET)

// Check token expiration
if (payload.exp < Date.now() / 1000) {
  throw new Error('Token expired')
}

// Validate token scope for endpoint
if (!payload.scope.includes('required_scope')) {
  throw new Error('Insufficient permissions')
}
```

### Error Handling

**Common Authentication Errors**

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | `AUTH_REQUIRED` | No authentication provided |
| 401 | `TOKEN_EXPIRED` | Access token has expired |
| 401 | `TOKEN_INVALID` | Token is malformed or invalid |
| 403 | `SCOPE_INSUFFICIENT` | Token lacks required permissions |
| 403 | `RATE_LIMITED` | Authentication rate limit exceeded |

**Error Response Format**
```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "The access token has expired",
    "details": {
      "expired_at": "2024-01-15T12:00:00Z",
      "refresh_endpoint": "/api/v1/auth/refresh"
    }
  }
}
```

## Testing Authentication

### Development Environment

Use the test API key for development:

```bash
export CONTRIBUX_API_KEY="ck_test_1234567890abcdef"
```

### Example Integration

```javascript
class ContribuxClient {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.baseURL = 'https://contribux.ai/api/v1'
  }

  async makeRequest(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`API Error: ${error.message}`)
    }

    return response.json()
  }

  async getCurrentUser() {
    return this.makeRequest('/users/me')
  }
}

// Usage
const client = new ContribuxClient(process.env.CONTRIBUX_API_KEY)
const user = await client.getCurrentUser()
```

## Migration Guide

### From API Keys to JWT

If you're currently using API keys and want to migrate to JWT authentication:

1. **Update Authentication Flow**
   - Implement OAuth or WebAuthn registration
   - Store refresh tokens securely
   - Implement automatic token refresh

2. **Update API Requests**
   - Replace `X-API-Key` header with `Authorization: Bearer`
   - Handle token expiration and refresh

3. **Enhanced Security**
   - Implement PKCE for OAuth flows
   - Use secure token storage
   - Monitor authentication events

## Webhooks Authentication

For webhook endpoints, verify the request signature:

```javascript
const crypto = require('crypto')

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}
```

## Support

For authentication issues:

- **Documentation**: Check this guide and [Error Handling](./errors.md)
- **Support**: [auth-support@contribux.ai](mailto:auth-support@contribux.ai)
- **Security Issues**: [security@contribux.ai](mailto:security@contribux.ai)