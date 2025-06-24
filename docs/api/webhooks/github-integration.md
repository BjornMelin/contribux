# GitHub Integration Webhooks

GitHub webhook integration enables real-time synchronization of repository data, issue tracking, and contribution opportunities.

## Overview

Contribux registers webhooks with GitHub repositories to receive real-time notifications about:
- New issues and pull requests that could become opportunities
- Changes to existing tracked opportunities
- Repository metadata updates
- Contributor activity and engagement

## Webhook Configuration

### Automatic Setup

When you add a repository to Contribux, webhooks are automatically configured if you have admin permissions.

```http
POST /api/v1/repositories
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "github_url": "https://github.com/org/repo",
  "auto_sync": true,
  "webhook_events": [
    "issues",
    "pull_request", 
    "push",
    "repository",
    "release"
  ]
}
```

**Response:**
```json
{
  "repository_id": "repo_123",
  "webhook_configured": true,
  "webhook_id": "12345678",
  "webhook_url": "https://api.contribux.ai/webhooks/github",
  "events_subscribed": [
    "issues",
    "pull_request",
    "push", 
    "repository",
    "release"
  ],
  "secret_configured": true
}
```

### Manual Webhook Setup

If automatic setup fails, you can manually configure webhooks in your GitHub repository:

1. Go to `Settings > Webhooks` in your GitHub repository
2. Click "Add webhook"
3. Configure as follows:

```
Payload URL: https://api.contribux.ai/webhooks/github
Content type: application/json
Secret: [Contact support for webhook secret]
Events: Issues, Pull requests, Pushes, Repository
Active: ✓
```

## Webhook Events

### Issues Events

#### Issue Opened
Triggered when a new issue is created.

**GitHub Payload (relevant fields):**
```json
{
  "action": "opened",
  "issue": {
    "id": 123456789,
    "number": 42,
    "title": "Add dark mode support",
    "body": "Would love to see dark mode added to the application...",
    "state": "open",
    "labels": [
      {
        "name": "enhancement",
        "color": "84b6eb"
      },
      {
        "name": "good first issue",
        "color": "7057ff"
      }
    ],
    "assignee": null,
    "created_at": "2024-01-15T10:30:00Z",
    "html_url": "https://github.com/org/repo/issues/42"
  },
  "repository": {
    "id": 456789012,
    "full_name": "org/repo",
    "private": false
  },
  "sender": {
    "login": "contributor",
    "id": 987654321
  }
}
```

**Contribux Processing:**
1. Analyze issue content with AI for opportunity potential
2. Extract technical requirements and difficulty level
3. Create new opportunity record if criteria met
4. Send notifications to matching users

**Opportunity Creation Criteria:**
- Repository is tracked in Contribux
- Issue has help-wanted or good-first-issue labels
- Issue description contains actionable requirements
- Repository health score > 60
- No duplicate opportunities exist

#### Issue Labeled/Unlabeled
Triggered when labels are added or removed from issues.

**Processing:**
- Update opportunity difficulty based on label changes
- Recalculate match scores for affected users
- Send notifications if opportunity becomes more relevant

#### Issue Closed
Triggered when an issue is closed.

**Processing:**
- Mark associated opportunity as completed/closed
- Update contributor tracking records
- Calculate contribution success metrics
- Trigger completion notifications

### Pull Request Events

#### Pull Request Opened
Triggered when a new pull request is created.

**GitHub Payload (relevant fields):**
```json
{
  "action": "opened", 
  "pull_request": {
    "id": 234567890,
    "number": 156,
    "title": "feat: implement dark mode toggle",
    "body": "Closes #42\n\nImplements dark mode support as requested...",
    "state": "open",
    "head": {
      "ref": "feature/dark-mode",
      "sha": "a1b2c3d4"
    },
    "base": {
      "ref": "main"
    },
    "user": {
      "login": "contributor",
      "id": 987654321
    },
    "created_at": "2024-01-22T16:00:00Z",
    "html_url": "https://github.com/org/repo/pull/156"
  }
}
```

**Contribux Processing:**
1. Link PR to existing opportunity if issue referenced
2. Update opportunity status to "in_progress"
3. Start contribution tracking for the user
4. Analyze PR for learning insights and complexity

#### Pull Request Merged
Triggered when a pull request is merged.

**Processing:**
- Mark opportunity as completed
- Update contributor's success metrics
- Calculate actual vs estimated time and difficulty
- Trigger achievement notifications
- Update repository health scores

#### Pull Request Closed (not merged)
Triggered when a pull request is closed without merging.

**Processing:**
- Update opportunity status based on close reason
- Log contribution attempt for learning insights
- Optionally reopen opportunity for other contributors

### Repository Events

#### Repository Updated
Triggered when repository metadata changes.

**Processing:**
- Update repository description and topics
- Recalculate repository health scores
- Refresh AI analysis and matching criteria
- Update search indexes

#### Repository Deleted/Archived
Triggered when repository is deleted or archived.

**Processing:**
- Mark all associated opportunities as closed
- Archive tracking records
- Remove from search results
- Notify affected users

### Push Events

#### Push to Main Branch
Triggered when commits are pushed to the default branch.

**Processing:**
- Update repository activity metrics
- Refresh health scores
- Check for closed issues/PRs in commit messages
- Update opportunity relevance scores

## Webhook Security

### Signature Verification

All webhook payloads are signed with HMAC-SHA256 using a secret key.

**Verification Process:**
```javascript
const crypto = require('crypto')

function verifyGitHubWebhook(payload, signature, secret) {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

// Usage in webhook handler
const isValid = verifyGitHubWebhook(
  req.body,
  req.headers['x-hub-signature-256'],
  process.env.GITHUB_WEBHOOK_SECRET
)
```

### Rate Limiting & Retry Logic

**GitHub Webhook Delivery:**
- GitHub will retry failed deliveries up to 5 times
- Uses exponential backoff (15s, 30s, 60s, 120s, 240s)
- Delivers webhooks within 30 seconds of event occurrence

**Contribux Processing:**
- Implements idempotency keys to handle duplicate deliveries
- Queues webhook processing for high-volume repositories
- Returns 200 status quickly, processes asynchronously

## Real-time Notifications

### User Notifications

When webhook events create or update opportunities that match user preferences:

**Notification Payload:**
```json
{
  "type": "opportunity_matched",
  "user_id": "user_123",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "opportunity": {
      "id": "opp_456",
      "title": "Add dark mode support",
      "repository": "org/repo",
      "match_score": 0.89,
      "difficulty": "intermediate"
    },
    "reason": "New opportunity matches your JavaScript and UI skills",
    "action_url": "https://contribux.ai/opportunities/opp_456"
  }
}
```

**Delivery Channels:**
- In-app notifications
- Email (if enabled in user preferences)
- Slack/Discord (if configured)
- Mobile push notifications (if app installed)

### Repository Notifications

For repository maintainers and contributors:

**Notification Types:**
- New contributors starting work on issues
- Contribution milestones and completions
- Repository health score changes
- Community engagement metrics

## Webhook Management

### List Configured Webhooks

```http
GET /api/v1/repositories/{repository_id}/webhooks
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "webhooks": [
    {
      "id": "webhook_123",
      "github_webhook_id": 12345678,
      "url": "https://api.contribux.ai/webhooks/github",
      "events": ["issues", "pull_request", "push"],
      "active": true,
      "created_at": "2024-01-01T12:00:00Z",
      "last_delivery": "2024-01-15T10:30:00Z",
      "delivery_stats": {
        "total_deliveries": 247,
        "successful_deliveries": 245,
        "failed_deliveries": 2,
        "success_rate": 0.992
      }
    }
  ]
}
```

### Update Webhook Configuration

```http
PATCH /api/v1/repositories/{repository_id}/webhooks/{webhook_id}
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "events": ["issues", "pull_request", "push", "repository"],
  "active": true
}
```

### Webhook Delivery Logs

```http
GET /api/v1/repositories/{repository_id}/webhooks/{webhook_id}/deliveries
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `limit`: Number of deliveries (default: 20, max: 100)
- `status`: Filter by delivery status (`success`, `failed`, `pending`)
- `event_type`: Filter by GitHub event type

**Response:**
```json
{
  "deliveries": [
    {
      "id": "delivery_123",
      "github_delivery_id": "12345678-1234-1234-1234-123456789012",
      "event_type": "issues",
      "action": "opened",
      "delivered_at": "2024-01-15T10:30:15Z",
      "status": "success",
      "response_code": 200,
      "processing_time_ms": 145,
      "payload_size": 2048,
      "opportunity_created": true,
      "notifications_sent": 3
    },
    {
      "id": "delivery_124", 
      "github_delivery_id": "12345678-1234-1234-1234-123456789013",
      "event_type": "pull_request",
      "action": "opened",
      "delivered_at": "2024-01-15T11:00:22Z",
      "status": "failed",
      "response_code": 500,
      "error_message": "Database connection timeout",
      "retry_count": 2,
      "next_retry": "2024-01-15T11:05:22Z"
    }
  ],
  "summary": {
    "total_deliveries": 247,
    "success_rate": 0.992,
    "average_processing_time": 125,
    "last_24h": {
      "deliveries": 15,
      "failures": 0
    }
  }
}
```

### Troubleshooting

#### Common Issues

**Webhook Not Receiving Events:**
1. Check repository permissions (webhooks require admin access)
2. Verify webhook URL and secret configuration
3. Check GitHub webhook delivery logs in repository settings
4. Ensure repository is added to Contribux

**Failed Webhook Deliveries:**
1. Check delivery logs for error details
2. Verify payload signature validation
3. Monitor for rate limiting or timeout issues
4. Check server status and capacity

**Missing Opportunities:**
1. Verify issue meets opportunity creation criteria
2. Check label requirements (help-wanted, good-first-issue)
3. Ensure repository health score > 60
4. Review AI analysis logs for filtering reasons

#### Debug Mode

Enable debug mode for detailed webhook processing logs:

```http
PATCH /api/v1/repositories/{repository_id}
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "webhook_debug": true,
  "debug_duration_hours": 24
}
```

Debug logs include:
- Full webhook payload
- AI analysis decisions
- Opportunity creation logic
- Notification dispatch details
- Performance metrics

## Integration Examples

### Custom Webhook Handler

If you want to receive Contribux webhook events in your own application:

```javascript
const express = require('express')
const crypto = require('crypto')

const app = express()

app.use(express.raw({ type: 'application/json' }))

app.post('/webhooks/contribux', (req, res) => {
  const signature = req.headers['x-contribux-signature']
  const payload = req.body
  
  // Verify signature
  const isValid = verifyWebhookSignature(payload, signature, process.env.CONTRIBUX_WEBHOOK_SECRET)
  
  if (!isValid) {
    return res.status(401).send('Invalid signature')
  }
  
  const event = JSON.parse(payload)
  
  switch (event.type) {
    case 'opportunity.created':
      handleNewOpportunity(event.data)
      break
    case 'contribution.completed':
      handleContributionCompleted(event.data)
      break
    case 'repository.health_updated':
      handleHealthUpdate(event.data)
      break
  }
  
  res.status(200).send('OK')
})

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
```

### Slack Integration

Receive opportunity notifications in Slack:

```javascript
// Slack webhook handler
function sendSlackNotification(opportunity) {
  const payload = {
    text: "New Contribution Opportunity",
    attachments: [
      {
        color: "good",
        fields: [
          {
            title: opportunity.title,
            value: opportunity.description,
            short: false
          },
          {
            title: "Repository",
            value: opportunity.repository.full_name,
            short: true
          },
          {
            title: "Difficulty", 
            value: opportunity.difficulty,
            short: true
          }
        ],
        actions: [
          {
            type: "button",
            text: "View Opportunity",
            url: `https://contribux.ai/opportunities/${opportunity.id}`
          }
        ]
      }
    ]
  }
  
  // Send to Slack webhook URL
  fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}
```

## Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Webhook configuration | 10 operations | Per hour |
| Delivery log access | 100 requests | Per hour |
| Debug mode activation | 5 activations | Per day |

## Best Practices

### Repository Maintainers
- Use meaningful issue labels (help-wanted, good-first-issue)
- Provide detailed issue descriptions with clear requirements
- Respond promptly to new contributors
- Keep repository metadata up to date

### Webhook Integration
- Implement proper signature verification
- Handle webhook deliveries idempotently
- Return 200 status quickly, process asynchronously
- Monitor delivery success rates and debug failures

### Security
- Keep webhook secrets secure and rotate regularly
- Validate all webhook payloads before processing
- Implement rate limiting on webhook endpoints
- Log webhook activity for security monitoring