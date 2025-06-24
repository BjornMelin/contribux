# Users Endpoints

User endpoints handle user profile management, preferences, and account settings.

## User Profile

### Get Current User

```http
GET /api/v1/users/me
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "github_username": "username",
  "email_verified": true,
  "profile": {
    "display_name": "User Name",
    "bio": "Software engineer passionate about open source",
    "avatar_url": "https://avatars.githubusercontent.com/u/123456",
    "location": "San Francisco, CA",
    "website": "https://userwebsite.com",
    "twitter": "username"
  },
  "preferences": {
    "languages": ["JavaScript", "Python", "Go"],
    "experience_level": "intermediate",
    "interests": ["frontend", "backend", "devops"],
    "time_commitment": "5-10 hours/week",
    "notification_settings": {
      "email_opportunities": true,
      "email_updates": false,
      "push_notifications": true
    }
  },
  "stats": {
    "contributions_count": 42,
    "repositories_starred": 15,
    "success_rate": 0.85
  },
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Update User Profile

```http
PATCH /api/v1/users/me
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "profile": {
    "display_name": "New Display Name",
    "bio": "Updated bio description",
    "location": "New Location",
    "website": "https://newwebsite.com"
  }
}
```

**Response:**
```json
{
  "id": "user_123",
  "profile": {
    "display_name": "New Display Name",
    "bio": "Updated bio description",
    "location": "New Location",
    "website": "https://newwebsite.com",
    "avatar_url": "https://avatars.githubusercontent.com/u/123456"
  },
  "updated_at": "2024-01-15T11:00:00Z"
}
```

### Get User by ID

```http
GET /api/v1/users/{user_id}
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "id": "user_123",
  "github_username": "username",
  "profile": {
    "display_name": "User Name",
    "bio": "Software engineer passionate about open source",
    "avatar_url": "https://avatars.githubusercontent.com/u/123456",
    "location": "San Francisco, CA"
  },
  "public_stats": {
    "contributions_count": 42,
    "repositories_starred": 15,
    "joined_at": "2024-01-01T00:00:00Z"
  }
}
```

## User Preferences

### Get Preferences

```http
GET /api/v1/users/me/preferences
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "languages": ["JavaScript", "Python", "Go"],
  "experience_level": "intermediate",
  "interests": ["frontend", "backend", "devops"],
  "time_commitment": "5-10 hours/week",
  "difficulty_preference": "intermediate",
  "project_types": ["web", "cli", "library"],
  "contribution_types": ["bug-fix", "feature", "documentation"],
  "notification_settings": {
    "email_opportunities": true,
    "email_digest": "weekly",
    "email_updates": false,
    "push_notifications": true,
    "push_opportunities": true,
    "push_reminders": false
  },
  "matching_criteria": {
    "min_stars": 10,
    "max_contributors": 100,
    "active_within_days": 30,
    "good_first_issue_required": false
  },
  "privacy": {
    "profile_visibility": "public",
    "contribution_history_public": true,
    "email_visible": false
  },
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Update Preferences

```http
PUT /api/v1/users/me/preferences
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "languages": ["JavaScript", "TypeScript", "Python"],
  "experience_level": "advanced",
  "interests": ["frontend", "full-stack"],
  "time_commitment": "10-15 hours/week",
  "notification_settings": {
    "email_opportunities": true,
    "email_digest": "daily",
    "push_notifications": false
  },
  "matching_criteria": {
    "min_stars": 50,
    "max_contributors": 50,
    "active_within_days": 14
  }
}
```

**Response:**
```json
{
  "updated": true,
  "preferences": {
    "languages": ["JavaScript", "TypeScript", "Python"],
    "experience_level": "advanced",
    "interests": ["frontend", "full-stack"],
    "time_commitment": "10-15 hours/week",
    "notification_settings": {
      "email_opportunities": true,
      "email_digest": "daily",
      "email_updates": false,
      "push_notifications": false,
      "push_opportunities": true,
      "push_reminders": false
    },
    "matching_criteria": {
      "min_stars": 50,
      "max_contributors": 50,
      "active_within_days": 14,
      "good_first_issue_required": false
    },
    "updated_at": "2024-01-15T11:15:00Z"
  }
}
```

## User Activity

### Get Activity Feed

```http
GET /api/v1/users/me/activity
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `type`: Activity type filter (`contribution`, `star`, `follow`, `comment`)
- `limit`: Number of activities (default: 20, max: 100)
- `offset`: Pagination offset
- `since`: ISO 8601 datetime to filter activities after

**Response:**
```json
{
  "activities": [
    {
      "id": "activity_123",
      "type": "contribution",
      "action": "pull_request_merged",
      "repository": {
        "id": "repo_456",
        "name": "awesome-project",
        "full_name": "org/awesome-project"
      },
      "opportunity": {
        "id": "opp_789",
        "title": "Add dark mode support"
      },
      "metadata": {
        "pr_number": 42,
        "pr_url": "https://github.com/org/awesome-project/pull/42",
        "lines_added": 150,
        "lines_removed": 25
      },
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "activity_124",
      "type": "star",
      "action": "repository_starred",
      "repository": {
        "id": "repo_457",
        "name": "useful-library",
        "full_name": "dev/useful-library"
      },
      "created_at": "2024-01-14T15:30:00Z"
    }
  ],
  "pagination": {
    "total_count": 85,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

### Get Contribution History

```http
GET /api/v1/users/me/contributions
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `status`: Filter by status (`started`, `submitted`, `merged`, `closed`)
- `timeframe`: Time period (`week`, `month`, `quarter`, `year`)
- `repository`: Filter by repository ID
- `limit`: Number of contributions (default: 50, max: 100)

**Response:**
```json
{
  "contributions": [
    {
      "id": "contrib_123",
      "opportunity": {
        "id": "opp_789",
        "title": "Add dark mode support",
        "repository": {
          "name": "awesome-project",
          "full_name": "org/awesome-project"
        }
      },
      "status": "merged",
      "pull_request": {
        "number": 42,
        "url": "https://github.com/org/awesome-project/pull/42",
        "title": "feat: implement dark mode toggle",
        "merged_at": "2024-01-15T10:00:00Z"
      },
      "effort": {
        "estimated_hours": 3,
        "actual_hours": 4,
        "difficulty": "intermediate"
      },
      "impact": {
        "lines_added": 150,
        "lines_removed": 25,
        "files_changed": 8
      },
      "started_at": "2024-01-14T09:00:00Z",
      "completed_at": "2024-01-15T10:00:00Z"
    }
  ],
  "summary": {
    "total_contributions": 42,
    "merged_count": 38,
    "total_lines_added": 5420,
    "total_lines_removed": 1230,
    "average_completion_time": "2.5 days",
    "success_rate": 0.90
  },
  "pagination": {
    "total_count": 42,
    "limit": 50,
    "offset": 0
  }
}
```

## User Statistics

### Get User Statistics

```http
GET /api/v1/users/me/stats
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `period`: Time period (`week`, `month`, `quarter`, `year`, `all`)

**Response:**
```json
{
  "period": "month",
  "contributions": {
    "total": 12,
    "merged": 10,
    "in_progress": 2,
    "success_rate": 0.83
  },
  "repositories": {
    "contributed_to": 8,
    "starred": 3,
    "watching": 15
  },
  "languages": {
    "JavaScript": {
      "contributions": 8,
      "percentage": 67
    },
    "Python": {
      "contributions": 3,
      "percentage": 25
    },
    "Go": {
      "contributions": 1,
      "percentage": 8
    }
  },
  "effort": {
    "total_hours": 45,
    "average_per_contribution": 3.8,
    "total_lines_changed": 2150
  },
  "achievements": [
    {
      "id": "first_contribution",
      "name": "First Contribution",
      "description": "Made your first open source contribution",
      "earned_at": "2024-01-01T12:00:00Z",
      "badge_url": "https://contribux.ai/badges/first-contribution.png"
    },
    {
      "id": "streak_7",
      "name": "Weekly Streak",
      "description": "Contributed for 7 consecutive days",
      "earned_at": "2024-01-10T08:00:00Z",
      "badge_url": "https://contribux.ai/badges/streak-7.png"
    }
  ],
  "trends": {
    "contributions_trend": 15, // percentage change from previous period
    "languages_trend": {
      "JavaScript": 10,
      "Python": -5,
      "Go": 200
    }
  }
}
```

### Get Public User Statistics

```http
GET /api/v1/users/{user_id}/stats
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "github_username": "username",
    "display_name": "User Name"
  },
  "public_stats": {
    "total_contributions": 42,
    "repositories_contributed": 15,
    "joined_at": "2024-01-01T00:00:00Z",
    "most_used_languages": ["JavaScript", "Python", "Go"],
    "achievement_count": 8
  }
}
```

## User Search

### Search Users

```http
GET /api/v1/users/search
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `q`: Search query (username, display name, or bio)
- `languages`: Comma-separated programming languages
- `location`: User location
- `experience`: Experience level (`beginner`, `intermediate`, `advanced`)
- `limit`: Number of users (default: 20, max: 100)
- `sort`: Sort order (`relevance`, `contributions`, `joined`)

**Response:**
```json
{
  "users": [
    {
      "id": "user_123",
      "github_username": "username",
      "profile": {
        "display_name": "User Name",
        "bio": "Software engineer passionate about open source",
        "avatar_url": "https://avatars.githubusercontent.com/u/123456",
        "location": "San Francisco, CA"
      },
      "public_stats": {
        "contributions_count": 42,
        "repositories_starred": 15,
        "most_used_languages": ["JavaScript", "Python"]
      },
      "match_score": 0.95
    }
  ],
  "total_count": 150,
  "pagination": {
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

## Account Management

### Update Email

```http
PUT /api/v1/users/me/email
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "email": "newemail@example.com"
}
```

**Response:**
```json
{
  "email": "newemail@example.com",
  "email_verified": false,
  "verification_sent": true,
  "message": "Verification email sent to newemail@example.com"
}
```

### Verify Email

```http
POST /api/v1/users/me/email/verify
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "email_verification_token"
}
```

**Response:**
```json
{
  "email_verified": true,
  "message": "Email verified successfully"
}
```

### Delete Account

```http
DELETE /api/v1/users/me
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "confirmation": "DELETE",
  "reason": "No longer using the service"
}
```

**Response:**
```json
{
  "deleted": true,
  "message": "Account deletion initiated",
  "data_retention": {
    "contribution_history": "30 days",
    "personal_data": "immediately"
  }
}
```

## User Followers

### Get Followers

```http
GET /api/v1/users/{user_id}/followers
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "followers": [
    {
      "id": "user_456",
      "github_username": "follower1",
      "profile": {
        "display_name": "Follower Name",
        "avatar_url": "https://avatars.githubusercontent.com/u/456789"
      },
      "followed_at": "2024-01-10T12:00:00Z"
    }
  ],
  "total_count": 25
}
```

### Get Following

```http
GET /api/v1/users/{user_id}/following
Authorization: Bearer {access_token}
```

### Follow User

```http
POST /api/v1/users/{user_id}/follow
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "following": true,
  "user": {
    "id": "user_456",
    "github_username": "target_user"
  }
}
```

### Unfollow User

```http
DELETE /api/v1/users/{user_id}/follow
Authorization: Bearer {access_token}
```

## Error Responses

### User Not Found (404)
```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "details": {
      "user_id": "user_123"
    }
  }
}
```

### Invalid Preferences (422)
```json
{
  "error": {
    "code": "INVALID_PREFERENCES",
    "message": "Invalid preference values",
    "details": {
      "field_errors": {
        "experience_level": "Must be one of: beginner, intermediate, advanced",
        "languages": "Must contain at least one programming language"
      }
    }
  }
}
```

## Rate Limits

| Endpoint Category | Limit | Window |
|------------------|-------|--------|
| Profile operations | 100 requests | Per hour |
| Search operations | 200 requests | Per hour |
| Follow operations | 50 requests | Per hour |
| Statistics | 500 requests | Per hour |

## Field Validation

### Profile Fields
- `display_name`: 1-50 characters
- `bio`: Up to 500 characters
- `location`: Up to 100 characters
- `website`: Valid URL format

### Preference Fields
- `languages`: Array of valid programming language names
- `experience_level`: `beginner`, `intermediate`, or `advanced`
- `time_commitment`: Valid time range format
- `interests`: Array of predefined interest categories

### Privacy Levels
- `public`: Visible to all users
- `followers`: Visible to followers only
- `private`: Visible to user only