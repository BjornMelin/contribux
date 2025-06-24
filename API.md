# Contribux API Reference

Complete API documentation for the contribux platform.

## Base URL
```
https://api.contribux.ai/v1
```

## Quick Start

```javascript
// 1. Install SDK (optional)
npm install @contribux/sdk

// 2. Initialize client
import { ContribuxClient } from '@contribux/sdk';

const client = new ContribuxClient({
  accessToken: process.env.CONTRIBUX_TOKEN
});

// 3. Make your first request
const user = await client.users.getMe();
const repos = await client.repositories.getRecommendations();
```

## Authentication

### OAuth 2.0 Flow (Recommended)
```javascript
// 1. Redirect to GitHub OAuth
const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=user:email`;

// 2. Exchange code for token
POST /auth/oauth/github
{
  "code": "github_auth_code",
  "redirect_uri": "https://yourapp.com/auth/callback"
}

// Response
{
  "access_token": "token",
  "refresh_token": "refresh_token",
  "expires_in": 3600
}
```

### API Key (Server-to-Server)
```bash
Authorization: Bearer ${API_KEY}
```

## Endpoints

### Authentication

#### `POST /auth/oauth/github`
Exchange GitHub OAuth code for access token.

#### `POST /auth/refresh`
Refresh access token.
```json
{
  "refresh_token": "your_refresh_token"
}
```

#### `POST /auth/logout`
Invalidate tokens.

---

### Users

#### `GET /users/me`
Get current user profile.

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "github_username": "username",
  "preferences": {
    "languages": ["JavaScript", "Python"],
    "experience_level": "intermediate",
    "interests": ["frontend", "AI"]
  }
}
```

#### `PATCH /users/me`
Update user profile.

#### `PUT /users/me/preferences`
Update user preferences.

#### `DELETE /users/me`
Delete user account.

---

### Repositories

#### `GET /repositories/recommendations`
Get personalized repository recommendations.

**Query Parameters:**
- `limit` (number): Results per page (default: 10, max: 100)
- `page` (number): Page number
- `difficulty` (string): beginner | intermediate | advanced
- `languages` (array): Filter by programming languages

**Response:**
```json
{
  "repositories": [{
    "id": "repo_456",
    "name": "awesome-project",
    "full_name": "org/awesome-project",
    "language": "JavaScript",
    "stars": 1250,
    "contribution_score": 0.85,
    "difficulty_level": "beginner",
    "match_reasons": ["Matches your JavaScript experience"]
  }],
  "total_count": 25,
  "page": 1
}
```

#### `GET /repositories/{id}`
Get repository details.

#### `POST /repositories/scan`
Trigger repository scan for opportunities.

---

### Opportunities

#### `POST /opportunities/search`
Search for contribution opportunities.

**Request Body:**
```json
{
  "languages": ["JavaScript"],
  "difficulty": "beginner",
  "types": ["bug", "feature"],
  "time_commitment": "1-3 hours"
}
```

**Response:**
```json
{
  "opportunities": [{
    "id": "opp_789",
    "title": "Add dark mode toggle",
    "repository": {
      "name": "web-app",
      "full_name": "company/web-app"
    },
    "labels": ["good first issue"],
    "difficulty": "beginner",
    "estimated_effort": "2-3 hours",
    "ai_analysis": {
      "skills_needed": ["React", "CSS"],
      "complexity_score": 0.3
    }
  }],
  "total_count": 42
}
```

#### `GET /opportunities/{id}`
Get opportunity details.

#### `POST /opportunities/{id}/skip`
Skip an opportunity.

---

### Analytics & Tracking

#### `POST /analytics/contributions`
Track contribution activity.

**Request Body:**
```json
{
  "opportunity_id": "opp_789",
  "action": "started|completed|abandoned",
  "pr_url": "https://github.com/...",
  "estimated_time": "3 hours"
}
```

#### `GET /analytics/me`
Get personal analytics.

---

## Error Handling

All errors follow RFC 7807 (Problem Details for HTTP APIs):

```json
{
  "type": "https://api.contribux.ai/errors/rate_limit",
  "title": "Rate limit exceeded",
  "status": 429,
  "detail": "You have exceeded the rate limit of 100 requests per hour",
  "instance": "/api/v1/repositories/recommendations",
  "retry_after": 3600
}
```

### Common Error Codes

| Status | Type | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Invalid request parameters |
| 401 | `unauthorized` | Missing or invalid authentication |
| 403 | `forbidden` | Insufficient permissions |
| 404 | `not_found` | Resource not found |
| 429 | `rate_limit` | Rate limit exceeded |
| 500 | `internal_error` | Server error |

## Rate Limiting

- **Authenticated requests**: 1000/hour
- **Unauthenticated requests**: 60/hour
- **Burst limit**: 100 requests/minute

Headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1704067200
```

## Pagination

All list endpoints support pagination:

```
GET /repositories/recommendations?page=2&limit=20
```

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

## Webhooks

Configure webhooks to receive real-time notifications:

### Events
- `opportunity.created` - New opportunity matching preferences
- `repository.trending` - Repository enters trending
- `contribution.merged` - Your PR was merged

### Webhook Payload
```json
{
  "event": "opportunity.created",
  "data": {...},
  "timestamp": "2024-01-01T00:00:00Z",
  "signature": "sha256=..."
}
```

### Signature Verification
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${hash}` === signature;
}
```

## SDK Examples

### JavaScript/TypeScript
```javascript
import { ContribuxClient } from '@contribux/sdk';

const client = new ContribuxClient({
  accessToken: process.env.CONTRIBUX_TOKEN
});

// Get recommendations
const repos = await client.repositories.getRecommendations({
  difficulty: 'beginner',
  limit: 10
});

// Search opportunities
const opportunities = await client.opportunities.search({
  languages: ['JavaScript'],
  timeCommitment: '1-3 hours'
});
```

### Python
```python
from contribux import Client

client = Client(access_token=os.getenv('CONTRIBUX_TOKEN'))

# Get recommendations
repos = client.repositories.get_recommendations(
    difficulty='beginner',
    limit=10
)

# Search opportunities
opportunities = client.opportunities.search(
    languages=['Python'],
    time_commitment='1-3 hours'
)
```

## API Versioning

The API uses URL versioning: `/v1/`, `/v2/`, etc.

- Breaking changes require new major version
- Deprecation notices given 6 months in advance
- Old versions supported for 12 months minimum

## Support

- **Documentation**: https://docs.contribux.ai
- **Status Page**: https://status.contribux.ai
- **Support**: support@contribux.ai