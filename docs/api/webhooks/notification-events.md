# Notification Event Webhooks

Notification webhooks enable real-time delivery of user-relevant events to external systems like Slack, Discord, email services, and custom applications.

## Overview

Contribux can send webhook notifications for various user events:

- New opportunity matches based on user preferences
- Contribution milestone achievements
- Repository health changes for tracked repos
- Community activity and engagement updates
- Learning progress and skill development insights

## Webhook Configuration

### Setting Up Notification Webhooks

```http
POST /api/v1/users/me/webhooks
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "url": "https://your-app.com/webhooks/contribux",
  "events": [
    "opportunity.matched",
    "contribution.milestone",
    "contribution.completed",
    "achievement.earned",
    "repository.health_changed"
  ],
  "active": true,
  "secret": "your_webhook_secret",
  "filters": {
    "min_match_score": 0.8,
    "difficulty_levels": ["intermediate", "advanced"],
    "languages": ["JavaScript", "Python"]
  }
}
```

**Response:**

```json
{
  "webhook_id": "webhook_user_123",
  "url": "https://your-app.com/webhooks/contribux",
  "events": [
    "opportunity.matched",
    "contribution.milestone",
    "contribution.completed",
    "achievement.earned",
    "repository.health_changed"
  ],
  "active": true,
  "secret_configured": true,
  "created_at": "2024-01-15T12:00:00Z",
  "test_delivery": {
    "status": "success",
    "response_time_ms": 145
  }
}
```

### Managing Webhooks

```http
GET /api/v1/users/me/webhooks
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "webhooks": [
    {
      "webhook_id": "webhook_user_123",
      "url": "https://your-app.com/webhooks/contribux",
      "events": ["opportunity.matched", "contribution.completed"],
      "active": true,
      "created_at": "2024-01-15T12:00:00Z",
      "last_delivery": "2024-01-20T10:30:00Z",
      "stats": {
        "total_deliveries": 47,
        "successful_deliveries": 45,
        "failed_deliveries": 2,
        "success_rate": 0.957
      }
    }
  ]
}
```

## Event Types

### Opportunity Events

#### opportunity.matched

Triggered when a new opportunity matches the user's skills and preferences.

**Webhook Payload:**

```json
{
  "event": "opportunity.matched",
  "timestamp": "2024-01-20T10:30:00Z",
  "user_id": "user_123",
  "data": {
    "opportunity": {
      "id": "opp_456",
      "title": "Add TypeScript support to React components",
      "description": "Convert existing JavaScript components to TypeScript with proper type definitions",
      "type": "feature",
      "difficulty": "intermediate",
      "estimated_hours": 6,
      "repository": {
        "id": "repo_789",
        "full_name": "awesome/ui-library",
        "name": "ui-library",
        "language": "JavaScript",
        "stars_count": 1547,
        "health_score": 85.5
      },
      "github_issue": {
        "number": 234,
        "url": "https://github.com/awesome/ui-library/issues/234",
        "labels": ["enhancement", "help-wanted", "typescript"]
      },
      "tags": ["typescript", "react", "components"]
    },
    "match_analysis": {
      "overall_score": 0.89,
      "skill_alignment": 0.92,
      "learning_potential": 0.85,
      "time_fit": 0.91,
      "reasons": [
        "Perfect match for your TypeScript and React skills",
        "Opportunity to learn advanced type patterns",
        "Active community with good mentorship"
      ]
    },
    "personalization": {
      "learning_goals_met": ["TypeScript", "Component Architecture"],
      "similar_completed": 2,
      "estimated_completion_probability": 0.87
    }
  },
  "action_urls": {
    "view_opportunity": "https://contribux.ai/opportunities/opp_456",
    "start_tracking": "https://contribux.ai/opportunities/opp_456/start"
  }
}
```

#### opportunity.updated

Triggered when a tracked opportunity is updated (status change, new information, etc.).

**Webhook Payload:**

```json
{
  "event": "opportunity.updated",
  "timestamp": "2024-01-20T14:15:00Z",
  "user_id": "user_123",
  "data": {
    "opportunity_id": "opp_456",
    "changes": {
      "status": {
        "from": "open",
        "to": "in_progress"
      },
      "assignee": {
        "from": null,
        "to": "contributor_xyz"
      }
    },
    "impact": "Someone else started working on this opportunity",
    "suggested_actions": [
      "Find similar opportunities",
      "Add to watchlist for future reference"
    ]
  }
}
```

### Contribution Events

#### contribution.started

Triggered when a user starts tracking a contribution.

**Webhook Payload:**

```json
{
  "event": "contribution.started",
  "timestamp": "2024-01-20T15:00:00Z",
  "user_id": "user_123",
  "data": {
    "tracking_id": "track_789",
    "opportunity": {
      "id": "opp_456",
      "title": "Add TypeScript support to React components",
      "repository": {
        "full_name": "awesome/ui-library"
      }
    },
    "estimated_completion": "2024-01-30T00:00:00Z",
    "milestones": [
      {
        "name": "Setup development environment",
        "due_date": "2024-01-22T00:00:00Z"
      },
      {
        "name": "Convert core components",
        "due_date": "2024-01-28T00:00:00Z"
      }
    ]
  }
}
```

#### contribution.milestone

Triggered when a user reaches a milestone in their contribution.

**Webhook Payload:**

```json
{
  "event": "contribution.milestone",
  "timestamp": "2024-01-22T16:30:00Z",
  "user_id": "user_123",
  "data": {
    "tracking_id": "track_789",
    "milestone": {
      "name": "Setup development environment",
      "completed_at": "2024-01-22T16:30:00Z",
      "time_spent_hours": 1.5,
      "notes": "Successfully set up TypeScript config and converted first component"
    },
    "progress": {
      "percentage": 25,
      "milestones_completed": 1,
      "milestones_remaining": 2,
      "on_schedule": true
    },
    "encouragement": "Great progress! You're ahead of schedule on this contribution."
  }
}
```

#### contribution.completed

Triggered when a user completes a contribution.

**Webhook Payload:**

```json
{
  "event": "contribution.completed",
  "timestamp": "2024-01-30T10:45:00Z",
  "user_id": "user_123",
  "data": {
    "tracking_id": "track_789",
    "opportunity": {
      "id": "opp_456",
      "title": "Add TypeScript support to React components",
      "repository": {
        "full_name": "awesome/ui-library"
      }
    },
    "completion": {
      "pull_request": {
        "number": 245,
        "url": "https://github.com/awesome/ui-library/pull/245",
        "status": "merged",
        "merged_at": "2024-01-30T10:45:00Z"
      },
      "total_time_hours": 6.5,
      "estimated_hours": 6,
      "accuracy_score": 0.92
    },
    "impact": {
      "files_changed": 12,
      "lines_added": 234,
      "lines_removed": 89,
      "components_converted": 8
    },
    "feedback": {
      "maintainer_rating": 5,
      "code_quality_score": 4.8,
      "documentation_score": 4.9
    },
    "learning": {
      "new_skills": ["Advanced TypeScript Generics", "Component Type Safety"],
      "confidence_gained": ["TypeScript", "React Patterns"],
      "next_recommendations": [
        "Advanced TypeScript patterns",
        "React performance optimization"
      ]
    }
  }
}
```

### Achievement Events

#### achievement.earned

Triggered when a user earns an achievement or badge.

**Webhook Payload:**

```json
{
  "event": "achievement.earned",
  "timestamp": "2024-01-30T10:50:00Z",
  "user_id": "user_123",
  "data": {
    "achievement": {
      "id": "typescript_contributor",
      "name": "TypeScript Contributor",
      "description": "Made 5 TypeScript-related contributions",
      "category": "skill_mastery",
      "rarity": "uncommon",
      "badge_url": "https://contribux.ai/badges/typescript-contributor.png"
    },
    "progress": {
      "previous_count": 4,
      "current_count": 5,
      "next_milestone": {
        "name": "TypeScript Expert",
        "requirement": "10 TypeScript contributions",
        "progress": 0.5
      }
    },
    "celebration": {
      "message": "🎉 Congratulations! You've earned the TypeScript Contributor badge!",
      "share_text": "Just earned my TypeScript Contributor badge on @contribux! 🚀"
    }
  }
}
```

### Repository Events

#### repository.health_changed

Triggered when a tracked repository's health score changes significantly.

**Webhook Payload:**

```json
{
  "event": "repository.health_changed",
  "timestamp": "2024-01-25T09:00:00Z",
  "user_id": "user_123",
  "data": {
    "repository": {
      "id": "repo_789",
      "full_name": "awesome/ui-library",
      "name": "ui-library"
    },
    "health_change": {
      "previous_score": 82.3,
      "current_score": 87.1,
      "change": 4.8,
      "trend": "improving"
    },
    "factors": {
      "activity_score": {
        "change": 3.2,
        "reason": "Increased PR merge rate and issue resolution"
      },
      "community_score": {
        "change": 6.1,
        "reason": "New contributors joining, improved responsiveness"
      }
    },
    "impact": "This repository is becoming more contributor-friendly",
    "opportunities_affected": 5
  }
}
```

### Learning Events

#### skill.progress

Triggered when significant skill development is detected.

**Webhook Payload:**

```json
{
  "event": "skill.progress",
  "timestamp": "2024-01-30T12:00:00Z",
  "user_id": "user_123",
  "data": {
    "skill": "TypeScript",
    "progress": {
      "previous_level": "intermediate",
      "current_level": "advanced",
      "confidence_score": 0.87,
      "evidence": [
        "Completed 5 TypeScript contributions",
        "Demonstrated advanced generic usage",
        "Helped other contributors with TypeScript questions"
      ]
    },
    "unlocked_opportunities": [
      "TypeScript library development",
      "Advanced React patterns",
      "Developer tooling contributions"
    ],
    "recommended_next_steps": [
      "Explore TypeScript compiler contributions",
      "Try building a TypeScript plugin",
      "Mentor other TypeScript learners"
    ]
  }
}
```

## Webhook Security

### Signature Verification

All webhook payloads are signed with HMAC-SHA256 using your configured secret.

**Verification Example:**

```javascript
const crypto = require("crypto");

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express.js webhook handler
app.post(
  "/webhooks/contribux",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const signature = req.headers["x-contribux-signature"];
    const isValid = verifyWebhookSignature(
      req.body,
      signature,
      process.env.CONTRIBUX_WEBHOOK_SECRET
    );

    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body);
    handleContribuxEvent(event);

    res.status(200).send("OK");
  }
);
```

### Headers

All webhook requests include these headers:

```text
Content-Type: application/json
X-Contribux-Event: opportunity.matched
X-Contribux-Signature: sha256=...
X-Contribux-Delivery: 12345678-1234-1234-1234-123456789012
User-Agent: Contribux-Webhooks/1.0
```

## Integration Examples

### Slack Integration

Send opportunity notifications to Slack:

```javascript
function handleOpportunityMatched(event) {
  const opportunity = event.data.opportunity;
  const match = event.data.match_analysis;

  const slackPayload = {
    text: "🎯 New Opportunity Match!",
    attachments: [
      {
        color: "good",
        title: opportunity.title,
        title_link: event.action_urls.view_opportunity,
        fields: [
          {
            title: "Repository",
            value: opportunity.repository.full_name,
            short: true,
          },
          {
            title: "Match Score",
            value: `${Math.round(match.overall_score * 100)}%`,
            short: true,
          },
          {
            title: "Difficulty",
            value: opportunity.difficulty,
            short: true,
          },
          {
            title: "Estimated Time",
            value: `${opportunity.estimated_hours} hours`,
            short: true,
          },
        ],
        text: match.reasons.join("\n"),
        actions: [
          {
            type: "button",
            text: "View Opportunity",
            url: event.action_urls.view_opportunity,
            style: "primary",
          },
          {
            type: "button",
            text: "Start Working",
            url: event.action_urls.start_tracking,
          },
        ],
      },
    ],
  };

  // Send to Slack webhook
  sendToSlack(slackPayload);
}
```

### Discord Integration

Send achievement notifications to Discord:

```javascript
function handleAchievementEarned(event) {
  const achievement = event.data.achievement;
  const celebration = event.data.celebration;

  const discordPayload = {
    embeds: [
      {
        title: "🏆 Achievement Unlocked!",
        description: celebration.message,
        color: 0x00ff00,
        fields: [
          {
            name: achievement.name,
            value: achievement.description,
            inline: false,
          },
          {
            name: "Rarity",
            value: achievement.rarity,
            inline: true,
          },
          {
            name: "Category",
            value: achievement.category,
            inline: true,
          },
        ],
        thumbnail: {
          url: achievement.badge_url,
        },
        timestamp: event.timestamp,
      },
    ],
  };

  // Send to Discord webhook
  sendToDiscord(discordPayload);
}
```

### Email Integration

Send digest emails using notification data:

```javascript
function handleContributionCompleted(event) {
  const completion = event.data.completion;
  const impact = event.data.impact;
  const learning = event.data.learning;

  const emailData = {
    to: getUserEmail(event.user_id),
    subject: `🎉 Contribution Merged: ${event.data.opportunity.title}`,
    template: "contribution-completed",
    data: {
      opportunityTitle: event.data.opportunity.title,
      repositoryName: event.data.opportunity.repository.full_name,
      pullRequestUrl: completion.pull_request.url,
      timeSpent: completion.total_time_hours,
      filesChanged: impact.files_changed,
      newSkills: learning.new_skills,
      nextRecommendations: learning.next_recommendations,
    },
  };

  sendEmail(emailData);
}
```

### Custom Application Integration

Track user progress in your own app:

```javascript
class ContribuxWebhookHandler {
  constructor(database) {
    this.db = database;
  }

  async handleEvent(event) {
    switch (event.event) {
      case "opportunity.matched":
        await this.trackOpportunityMatch(event);
        break;
      case "contribution.completed":
        await this.updateUserProgress(event);
        break;
      case "achievement.earned":
        await this.recordAchievement(event);
        break;
      case "skill.progress":
        await this.updateSkillProfile(event);
        break;
    }
  }

  async trackOpportunityMatch(event) {
    const match = event.data;

    await this.db.opportunities.create({
      userId: event.user_id,
      opportunityId: match.opportunity.id,
      matchScore: match.match_analysis.overall_score,
      repository: match.opportunity.repository.full_name,
      difficulty: match.opportunity.difficulty,
      estimatedHours: match.opportunity.estimated_hours,
      matchedAt: event.timestamp,
    });
  }

  async updateUserProgress(event) {
    const completion = event.data;

    await this.db.contributions.create({
      userId: event.user_id,
      opportunityId: completion.opportunity.id,
      pullRequestUrl: completion.completion.pull_request.url,
      timeSpent: completion.completion.total_time_hours,
      skillsLearned: completion.learning.new_skills,
      completedAt: event.timestamp,
    });

    // Update user's skill levels
    for (const skill of completion.learning.confidence_gained) {
      await this.db.userSkills.upsert({
        userId: event.user_id,
        skill: skill,
        confidenceLevel: "increased",
        lastUpdated: event.timestamp,
      });
    }
  }
}
```

## Testing Webhooks

### Test Delivery

```http
POST /api/v1/users/me/webhooks/{webhook_id}/test
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "event_type": "opportunity.matched"
}
```

**Response:**

```json
{
  "test_delivery_id": "test_123",
  "status": "success",
  "response_code": 200,
  "response_time_ms": 145,
  "payload_sent": {
    "event": "opportunity.matched",
    "timestamp": "2024-01-20T16:00:00Z",
    "user_id": "user_123",
    "data": {
      "test": true
    }
  }
}
```

### Webhook Logs

```http
GET /api/v1/users/me/webhooks/{webhook_id}/deliveries
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "deliveries": [
    {
      "delivery_id": "del_123",
      "event_type": "opportunity.matched",
      "delivered_at": "2024-01-20T10:30:00Z",
      "status": "success",
      "response_code": 200,
      "response_time_ms": 145,
      "retry_count": 0
    },
    {
      "delivery_id": "del_124",
      "event_type": "contribution.completed",
      "delivered_at": "2024-01-20T11:00:00Z",
      "status": "failed",
      "response_code": 500,
      "response_time_ms": 5000,
      "retry_count": 2,
      "error_message": "Connection timeout",
      "next_retry": "2024-01-20T11:15:00Z"
    }
  ],
  "stats": {
    "total_deliveries": 47,
    "success_rate": 0.957,
    "average_response_time": 185
  }
}
```

## Rate Limits

| Operation           | Limit         | Window   |
| ------------------- | ------------- | -------- |
| Webhook management  | 20 operations | Per hour |
| Test deliveries     | 10 tests      | Per hour |
| Delivery log access | 100 requests  | Per hour |

## Best Practices

### Webhook Implementation

- Always verify webhook signatures
- Respond with 200 status quickly (< 10 seconds)
- Process webhook data asynchronously
- Implement idempotency to handle duplicate deliveries
- Log webhook events for debugging

### Event Filtering

- Configure specific events you need to avoid noise
- Use filters to receive only relevant notifications
- Set appropriate match score thresholds
- Consider user preferences and notification settings

### Error Handling

- Implement graceful error handling for failed deliveries
- Monitor webhook delivery success rates
- Set up alerts for webhook failures
- Test webhook endpoints regularly

### Security

- Keep webhook secrets secure and rotate regularly
- Validate webhook signatures before processing
- Use HTTPS endpoints for webhook URLs
- Monitor for unusual webhook activity
