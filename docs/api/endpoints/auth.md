# Authentication Endpoints

Authentication endpoints handle user authentication, session management, and token operations.

## OAuth Authentication

### GitHub OAuth Flow

#### Initiate OAuth Flow

```http
POST /api/v1/auth/oauth/github/url
Content-Type: application/json
```

**Request Body:**

```json
{
  "redirect_uri": "https://yourapp.com/auth/callback",
  "scopes": ["user:email"],
  "allow_signup": true
}
```

**Response:**

```json
{
  "authorization_url": "https://github.com/login/oauth/authorize?...",
  "state": "random_state_string",
  "code_verifier": "pkce_code_verifier"
}
```

#### Complete OAuth Flow

```http
POST /api/v1/auth/oauth/github
Content-Type: application/json
```

**Request Body:**

```json
{
  "code": "authorization_code_from_github",
  "redirect_uri": "https://yourapp.com/auth/callback",
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
    "github_username": "username",
    "email_verified": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

## WebAuthn Authentication

### Registration Options

Generate options for WebAuthn credential registration.

```http
POST /api/v1/auth/webauthn/registration/options
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "user_id": "user_123",
  "username": "user@example.com",
  "display_name": "User Name"
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
  "pubKeyCredParams": [
    {
      "type": "public-key",
      "alg": -7
    },
    {
      "type": "public-key",
      "alg": -257
    }
  ],
  "timeout": 60000,
  "attestation": "none",
  "authenticatorSelection": {
    "authenticatorAttachment": "platform",
    "userVerification": "required"
  }
}
```

### Complete Registration

```http
POST /api/v1/auth/webauthn/registration/verify
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "user_id": "user_123",
  "expected_challenge": "base64url_encoded_challenge",
  "credential": {
    "id": "credential_id",
    "rawId": "base64_credential_id",
    "response": {
      "attestationObject": "base64_attestation_object",
      "clientDataJSON": "base64_client_data"
    },
    "type": "public-key"
  }
}
```

**Response:**

```json
{
  "verified": true,
  "credential_id": "cred_456",
  "message": "WebAuthn credential registered successfully"
}
```

### Authentication Options

Generate options for WebAuthn authentication.

```http
POST /api/v1/auth/webauthn/authentication/options
Content-Type: application/json
```

**Request Body:**

```json
{
  "username": "user@example.com",
  "user_verification": "preferred"
}
```

**Response:**

```json
{
  "challenge": "base64url_encoded_challenge",
  "timeout": 60000,
  "rpId": "contribux.ai",
  "allowCredentials": [
    {
      "id": "credential_id",
      "type": "public-key",
      "transports": ["internal", "usb"]
    }
  ],
  "userVerification": "preferred"
}
```

### Complete Authentication

```http
POST /api/v1/auth/webauthn/authentication/verify
Content-Type: application/json
```

**Request Body:**

```json
{
  "expected_challenge": "base64url_encoded_challenge",
  "credential": {
    "id": "credential_id",
    "rawId": "base64_credential_id",
    "response": {
      "authenticatorData": "base64_authenticator_data",
      "clientDataJSON": "base64_client_data",
      "signature": "base64_signature",
      "userHandle": "base64_user_handle"
    },
    "type": "public-key"
  }
}
```

**Response:**

```json
{
  "verified": true,
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 900,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "github_username": "username"
  }
}
```

## Token Management

### Refresh Access Token

```http
POST /api/v1/auth/refresh
Content-Type: application/json
```

**Request Body:**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

### Revoke Tokens

Revoke specific refresh token:

```http
POST /api/v1/auth/revoke
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Revoke all user tokens:

```http
POST /api/v1/auth/revoke-all
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "terminate_sessions": true
}
```

**Response:**

```json
{
  "revoked": true,
  "message": "All tokens revoked successfully"
}
```

### Validate Token

Check if an access token is valid:

```http
GET /api/v1/auth/validate
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "valid": true,
  "user_id": "user_123",
  "expires_at": "2024-01-15T10:15:00Z",
  "scopes": ["read:user", "read:repositories"]
}
```

## Session Management

### Get Current Session

```http
GET /api/v1/auth/session
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "id": "session_789",
  "user_id": "user_123",
  "auth_method": "webauthn",
  "created_at": "2024-01-15T10:00:00Z",
  "last_active_at": "2024-01-15T10:30:00Z",
  "expires_at": "2024-01-22T10:00:00Z",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "location": {
    "country": "US",
    "region": "CA",
    "city": "San Francisco"
  }
}
```

### List User Sessions

```http
GET /api/v1/auth/sessions
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "sessions": [
    {
      "id": "session_789",
      "auth_method": "webauthn",
      "created_at": "2024-01-15T10:00:00Z",
      "last_active_at": "2024-01-15T10:30:00Z",
      "expires_at": "2024-01-22T10:00:00Z",
      "current": true,
      "device_info": {
        "browser": "Chrome",
        "os": "macOS",
        "device_type": "desktop"
      },
      "location": {
        "country": "US",
        "city": "San Francisco"
      }
    }
  ],
  "total_count": 3
}
```

### Terminate Session

```http
DELETE /api/v1/auth/sessions/{session_id}
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "terminated": true,
  "message": "Session terminated successfully"
}
```

## Security Events

### List Security Events

```http
GET /api/v1/auth/security-events
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `event_type`: Filter by event type (optional)
- `limit`: Number of events to return (default: 50, max: 100)
- `offset`: Pagination offset

**Response:**

```json
{
  "events": [
    {
      "id": "event_123",
      "event_type": "login_success",
      "event_severity": "info",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "location": {
        "country": "US",
        "city": "San Francisco"
      },
      "event_data": {
        "auth_method": "webauthn",
        "session_id": "session_789"
      },
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "total_count": 25,
  "has_more": false
}
```

## Account Linking

### Link OAuth Account

```http
POST /api/v1/auth/link/github
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "code": "authorization_code_from_github",
  "redirect_uri": "https://yourapp.com/auth/link/callback"
}
```

**Response:**

```json
{
  "linked": true,
  "provider": "github",
  "account_id": "github_123456",
  "username": "github_username"
}
```

### Unlink OAuth Account

```http
DELETE /api/v1/auth/link/github
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "unlinked": true,
  "provider": "github",
  "message": "GitHub account unlinked successfully"
}
```

### List Linked Accounts

```http
GET /api/v1/auth/linked-accounts
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "accounts": [
    {
      "provider": "github",
      "account_id": "github_123456",
      "username": "github_username",
      "linked_at": "2024-01-01T00:00:00Z",
      "last_used": "2024-01-15T10:00:00Z"
    }
  ],
  "total_count": 1
}
```

## Error Responses

### Common Authentication Errors

#### **Invalid Credentials (401)**

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password",
    "details": {
      "attempts_remaining": 3,
      "lockout_duration": 300
    }
  }
}
```

#### **WebAuthn Error (422)**

```json
{
  "error": {
    "code": "WEBAUTHN_VERIFICATION_FAILED",
    "message": "WebAuthn credential verification failed",
    "details": {
      "reason": "Invalid signature",
      "credential_id": "cred_456"
    }
  }
}
```

#### **OAuth Error (400)**

```json
{
  "error": {
    "code": "OAUTH_ERROR",
    "message": "OAuth authorization failed",
    "details": {
      "oauth_error": "access_denied",
      "description": "User denied authorization"
    }
  }
}
```

## Rate Limits

Authentication endpoints have specific rate limits:

| Endpoint            | Limit        | Window            |
| ------------------- | ------------ | ----------------- |
| OAuth flows         | 50 requests  | Per hour per IP   |
| WebAuthn operations | 20 attempts  | Per hour per IP   |
| Token refresh       | 100 requests | Per hour per user |
| Session operations  | 200 requests | Per hour per user |

## Security Best Practices

### Token Storage

- Store access tokens in memory only
- Use secure HttpOnly cookies for refresh tokens
- Never expose tokens in URLs or logs

### PKCE Implementation

```javascript
// Generate PKCE parameters
function generatePKCE() {
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  return { codeVerifier, codeChallenge };
}
```

### WebAuthn Integration

```javascript
// Browser-side WebAuthn registration
async function registerWebAuthn(options) {
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: base64URLDecode(options.challenge),
      user: {
        ...options.user,
        id: base64URLDecode(options.user.id),
      },
    },
  });

  return {
    id: credential.id,
    rawId: base64URLEncode(credential.rawId),
    response: {
      attestationObject: base64URLEncode(credential.response.attestationObject),
      clientDataJSON: base64URLEncode(credential.response.clientDataJSON),
    },
    type: credential.type,
  };
}
```

### Session Security

- Implement session timeout
- Monitor for concurrent sessions
- Log security events
- Use secure session identifiers
