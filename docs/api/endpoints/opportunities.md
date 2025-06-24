# Opportunities Endpoints

Contribution opportunity endpoints handle AI-powered matching, tracking, and management of open source contribution opportunities.

## Opportunity Discovery

### List Opportunities

```http
GET /api/v1/opportunities
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `repository_id`: Filter by repository
- `languages`: Comma-separated programming languages
- `difficulty`: Difficulty level (`beginner`, `intermediate`, `advanced`)
- `type`: Contribution type (`bug_fix`, `feature`, `documentation`, `test`, `refactor`, `security`)
- `status`: Opportunity status (`open`, `in_progress`, `completed`, `stale`, `closed`)
- `estimated_hours`: Maximum estimated hours
- `good_first_issue`: Include only good first issues (true/false)
- `limit`: Number of opportunities (default: 20, max: 100)
- `sort`: Sort by (`created_at`, `updated_at`, `difficulty`, `estimated_hours`, `match_score`)

**Response:**

```json
{
  "opportunities": [
    {
      "id": "opp_123",
      "title": "Add dark mode support to user interface",
      "description": "Implement a toggle for dark mode theme across all UI components. This involves updating CSS variables, theme context, and ensuring accessibility standards are met.",
      "type": "feature",
      "status": "open",
      "difficulty": "intermediate",
      "repository": {
        "id": "repo_456",
        "full_name": "awesome/ui-library",
        "name": "ui-library",
        "language": "JavaScript",
        "stars_count": 1547
      },
      "github_issue": {
        "number": 142,
        "url": "https://github.com/awesome/ui-library/issues/142",
        "labels": ["enhancement", "good-first-issue", "help-wanted"],
        "created_at": "2024-01-10T14:30:00Z",
        "updated_at": "2024-01-15T09:15:00Z"
      },
      "requirements": {
        "languages": ["JavaScript", "CSS"],
        "frameworks": ["React"],
        "estimated_hours": 8,
        "complexity_factors": [
          "CSS theming system",
          "React context management",
          "Accessibility considerations"
        ]
      },
      "ai_analysis": {
        "match_score": 0.89,
        "learning_value": "high",
        "impact_potential": "medium",
        "completion_probability": 0.85,
        "mentorship_available": true
      },
      "tags": ["ui", "theming", "accessibility", "good-first-issue"],
      "created_at": "2024-01-10T14:30:00Z",
      "updated_at": "2024-01-15T09:15:00Z"
    }
  ],
  "pagination": {
    "total_count": 247,
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "filters_applied": {
    "languages": ["JavaScript"],
    "difficulty": "intermediate",
    "good_first_issue": true
  }
}
```

### Get Opportunity Details

```http
GET /api/v1/opportunities/{opportunity_id}
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "id": "opp_123",
  "title": "Add dark mode support to user interface",
  "description": "Implement a toggle for dark mode theme across all UI components. This involves updating CSS variables, theme context, and ensuring accessibility standards are met.",
  "type": "feature",
  "status": "open",
  "difficulty": "intermediate",
  "repository": {
    "id": "repo_456",
    "full_name": "awesome/ui-library",
    "name": "ui-library",
    "description": "A modern React UI component library",
    "language": "JavaScript",
    "languages": {
      "JavaScript": 75.5,
      "CSS": 20.2,
      "TypeScript": 4.3
    },
    "stars_count": 1547,
    "health_score": 85.5,
    "maintainer_responsiveness": 0.89
  },
  "github_issue": {
    "number": 142,
    "url": "https://github.com/awesome/ui-library/issues/142",
    "state": "open",
    "labels": [
      {
        "name": "enhancement",
        "color": "84b6eb"
      },
      {
        "name": "good-first-issue",
        "color": "7057ff"
      },
      {
        "name": "help-wanted",
        "color": "008672"
      }
    ],
    "assignee": null,
    "milestone": null,
    "comments_count": 5,
    "reactions": {
      "thumbs_up": 12,
      "thumbs_down": 0,
      "heart": 3
    },
    "created_at": "2024-01-10T14:30:00Z",
    "updated_at": "2024-01-15T09:15:00Z"
  },
  "requirements": {
    "languages": ["JavaScript", "CSS"],
    "frameworks": ["React"],
    "tools": ["Webpack", "Storybook"],
    "estimated_hours": 8,
    "skill_level": "intermediate",
    "prerequisites": [
      "Experience with React hooks",
      "Understanding of CSS custom properties",
      "Basic accessibility knowledge"
    ],
    "complexity_factors": [
      "CSS theming system",
      "React context management",
      "Accessibility considerations",
      "Component testing"
    ]
  },
  "ai_analysis": {
    "match_score": 0.89,
    "match_reasons": [
      "Skills match: JavaScript, React, CSS",
      "Experience level appropriate",
      "Good learning opportunity for theming"
    ],
    "learning_value": "high",
    "learning_outcomes": [
      "Advanced CSS theming techniques",
      "React context patterns",
      "Accessibility best practices"
    ],
    "impact_potential": "medium",
    "completion_probability": 0.85,
    "time_to_completion": "1-2 weeks",
    "mentorship_available": true,
    "similar_completed": 3
  },
  "contribution_guide": {
    "getting_started": [
      "Fork the repository",
      "Clone your fork locally",
      "Install dependencies with npm install",
      "Run npm start to start development server"
    ],
    "implementation_hints": [
      "Look at existing theme implementation in src/theme/",
      "Update CSS custom properties in theme.css",
      "Add theme toggle component",
      "Test with Storybook examples"
    ],
    "testing_requirements": [
      "Add unit tests for theme toggle",
      "Test accessibility with screen readers",
      "Verify all components work in dark mode"
    ],
    "submission_guidelines": [
      "Follow existing code style",
      "Update documentation",
      "Add changeset entry",
      "Request review from @maintainer"
    ]
  },
  "community": {
    "maintainers": [
      {
        "login": "maintainer1",
        "avatar_url": "https://avatars.githubusercontent.com/u/12345",
        "response_time_avg": "4 hours"
      }
    ],
    "contributors": [
      {
        "login": "contributor1",
        "contributions": 15,
        "last_active": "2024-01-14T16:00:00Z"
      }
    ],
    "discussion_threads": [
      {
        "title": "Dark mode implementation approach",
        "url": "https://github.com/awesome/ui-library/discussions/140",
        "participants": 8
      }
    ]
  },
  "related_opportunities": [
    {
      "id": "opp_124",
      "title": "Improve theme documentation",
      "difficulty": "beginner",
      "estimated_hours": 3
    }
  ],
  "tags": ["ui", "theming", "accessibility", "good-first-issue"],
  "created_at": "2024-01-10T14:30:00Z",
  "updated_at": "2024-01-15T09:15:00Z"
}
```

## Opportunity Matching

### Find Matching Opportunities

AI-powered matching based on user skills, preferences, and contribution history.

```http
POST /api/v1/opportunities/match
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "preferences": {
    "languages": ["JavaScript", "TypeScript", "Python"],
    "frameworks": ["React", "Node.js"],
    "difficulty_range": ["beginner", "intermediate"],
    "time_commitment": "5-10 hours",
    "contribution_types": ["bug_fix", "feature", "documentation"],
    "learning_goals": ["accessibility", "testing", "performance"]
  },
  "filters": {
    "repository_health_min": 70,
    "max_estimated_hours": 12,
    "good_first_issue_only": false,
    "active_maintainers": true
  },
  "matching_options": {
    "personalized": true,
    "include_learning_opportunities": true,
    "diversity_boost": true,
    "limit": 25
  }
}
```

**Response:**

```json
{
  "matches": [
    {
      "opportunity": {
        "id": "opp_456",
        "title": "Add TypeScript support to API client",
        "type": "feature",
        "difficulty": "intermediate",
        "estimated_hours": 6,
        "repository": {
          "full_name": "api/client-library",
          "language": "JavaScript",
          "health_score": 88.2
        }
      },
      "match_analysis": {
        "overall_score": 0.92,
        "skill_alignment": 0.95,
        "learning_potential": 0.88,
        "time_fit": 0.91,
        "community_fit": 0.89
      },
      "personalization": {
        "recommended_because": [
          "Matches your TypeScript learning goal",
          "Similar to your previous API contributions",
          "Great community support for newcomers"
        ],
        "learning_outcomes": [
          "Advanced TypeScript patterns",
          "API design principles",
          "Library development best practices"
        ],
        "effort_estimation": {
          "hours_per_week": 3,
          "total_weeks": 2,
          "confidence": 0.85
        }
      }
    }
  ],
  "matching_summary": {
    "total_evaluated": 1247,
    "matches_found": 25,
    "top_match_score": 0.92,
    "average_match_score": 0.76,
    "matching_time_ms": 156
  },
  "recommendations": {
    "skill_development": [
      "Consider learning Vue.js to expand frontend opportunities",
      "Docker knowledge would unlock DevOps contributions"
    ],
    "repository_suggestions": [
      "awesome/frontend-toolkit - many beginner-friendly issues",
      "tools/dev-utilities - active community, good mentorship"
    ]
  }
}
```

### Get Personalized Recommendations

```http
GET /api/v1/opportunities/recommendations
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `type`: Recommendation type (`trending`, `skill_match`, `learning`, `quick_wins`)
- `limit`: Number of recommendations (default: 10, max: 50)
- `refresh`: Force refresh of recommendations (true/false)

**Response:**

```json
{
  "recommendations": [
    {
      "opportunity": {
        "id": "opp_789",
        "title": "Fix responsive layout bug on mobile",
        "difficulty": "beginner",
        "estimated_hours": 2
      },
      "recommendation": {
        "type": "quick_win",
        "confidence": 0.91,
        "reasoning": "Perfect match for your CSS skills with quick completion time",
        "benefits": [
          "Easy first contribution to build confidence",
          "Learn responsive design patterns",
          "Fast feedback from maintainers"
        ]
      }
    }
  ],
  "personalization": {
    "profile_completeness": 0.85,
    "suggestion": "Add more programming languages to get better matches",
    "last_updated": "2024-01-15T10:00:00Z"
  }
}
```

## Opportunity Tracking

### Start Working on Opportunity

```http
POST /api/v1/opportunities/{opportunity_id}/start
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "estimated_completion": "2024-01-25T00:00:00Z",
  "notes": "Planning to work on this during weekends",
  "approach": "Will implement using CSS custom properties as suggested in the issue"
}
```

**Response:**

```json
{
  "tracking_id": "track_123",
  "opportunity_id": "opp_123",
  "status": "in_progress",
  "started_at": "2024-01-15T12:00:00Z",
  "estimated_completion": "2024-01-25T00:00:00Z",
  "milestones": [
    {
      "name": "Setup development environment",
      "due_date": "2024-01-17T00:00:00Z",
      "completed": false
    },
    {
      "name": "Implement theme toggle component",
      "due_date": "2024-01-22T00:00:00Z",
      "completed": false
    },
    {
      "name": "Add tests and documentation",
      "due_date": "2024-01-24T00:00:00Z",
      "completed": false
    }
  ]
}
```

### Update Progress

```http
PATCH /api/v1/opportunities/{opportunity_id}/progress
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "status": "in_progress",
  "progress_percentage": 45,
  "time_spent_hours": 3.5,
  "notes": "Completed theme toggle component, working on CSS variables",
  "blockers": [
    {
      "description": "Need guidance on accessibility requirements",
      "severity": "medium",
      "created_at": "2024-01-18T10:00:00Z"
    }
  ],
  "milestones_completed": ["Setup development environment"]
}
```

**Response:**

```json
{
  "tracking_id": "track_123",
  "status": "in_progress",
  "progress": {
    "percentage": 45,
    "time_spent_hours": 3.5,
    "estimated_remaining_hours": 4.5,
    "completion_probability": 0.89
  },
  "milestones": [
    {
      "name": "Setup development environment",
      "completed": true,
      "completed_at": "2024-01-17T14:30:00Z"
    },
    {
      "name": "Implement theme toggle component",
      "completed": false,
      "progress": 0.6
    }
  ],
  "insights": [
    "You're ahead of your estimated timeline",
    "Consider asking for help with accessibility in the GitHub discussion"
  ],
  "updated_at": "2024-01-18T15:00:00Z"
}
```

### Submit Contribution

```http
POST /api/v1/opportunities/{opportunity_id}/submit
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "pull_request_url": "https://github.com/awesome/ui-library/pull/156",
  "completion_notes": "Implemented dark mode support with accessibility features",
  "total_time_hours": 8,
  "challenges_faced": [
    "CSS specificity issues with existing styles",
    "Testing with screen readers took longer than expected"
  ],
  "learnings": [
    "Advanced CSS custom properties usage",
    "ARIA attributes for theme switching"
  ]
}
```

**Response:**

```json
{
  "tracking_id": "track_123",
  "status": "submitted",
  "pull_request": {
    "url": "https://github.com/awesome/ui-library/pull/156",
    "number": 156,
    "status": "open",
    "created_at": "2024-01-22T16:00:00Z"
  },
  "contribution_summary": {
    "total_time_hours": 8,
    "estimated_vs_actual": "Matched estimate",
    "completion_rate": 1.0,
    "learning_objectives_met": 3
  },
  "next_steps": [
    "Monitor PR for reviewer feedback",
    "Address any requested changes",
    "Celebrate your contribution!"
  ],
  "submitted_at": "2024-01-22T16:00:00Z"
}
```

### Get Tracking History

```http
GET /api/v1/opportunities/tracking
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `status`: Filter by tracking status
- `repository_id`: Filter by repository
- `time_period`: Time period (`week`, `month`, `quarter`, `year`)
- `limit`: Number of tracking records

**Response:**

```json
{
  "tracking_records": [
    {
      "tracking_id": "track_123",
      "opportunity": {
        "id": "opp_123",
        "title": "Add dark mode support to user interface",
        "repository": {
          "full_name": "awesome/ui-library"
        }
      },
      "status": "completed",
      "timeline": {
        "started_at": "2024-01-15T12:00:00Z",
        "submitted_at": "2024-01-22T16:00:00Z",
        "completed_at": "2024-01-25T10:30:00Z",
        "total_duration_days": 10
      },
      "metrics": {
        "time_spent_hours": 8,
        "estimated_hours": 8,
        "accuracy_score": 1.0,
        "commits_made": 12,
        "files_changed": 15
      },
      "outcome": {
        "status": "merged",
        "feedback_score": 4.8,
        "learning_rating": 5,
        "would_contribute_again": true
      }
    }
  ],
  "summary": {
    "total_tracked": 15,
    "completed": 12,
    "in_progress": 2,
    "abandoned": 1,
    "success_rate": 0.8,
    "average_completion_time": "8.5 days",
    "total_hours_contributed": 96
  }
}
```

## Opportunity Analytics

### Get Contribution Analytics

```http
GET /api/v1/opportunities/analytics
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `period`: Time period (`week`, `month`, `quarter`, `year`, `all`)
- `group_by`: Group results by (`type`, `difficulty`, `repository`, `language`)

**Response:**

```json
{
  "period": "quarter",
  "contribution_stats": {
    "total_opportunities": 15,
    "completed": 12,
    "in_progress": 2,
    "abandoned": 1,
    "success_rate": 0.8
  },
  "time_analysis": {
    "total_hours": 96,
    "average_per_opportunity": 6.4,
    "estimation_accuracy": 0.87,
    "most_productive_day": "Saturday",
    "most_productive_hours": ["09:00", "14:00", "20:00"]
  },
  "skill_development": {
    "languages_used": {
      "JavaScript": 8,
      "Python": 4,
      "TypeScript": 3
    },
    "frameworks_learned": ["React", "Vue.js", "FastAPI"],
    "new_concepts": ["Accessibility", "Performance", "Testing"],
    "skill_progression": {
      "JavaScript": { "from": "intermediate", "to": "advanced" },
      "TypeScript": { "from": "beginner", "to": "intermediate" }
    }
  },
  "impact_metrics": {
    "repositories_contributed": 8,
    "maintainers_helped": 12,
    "lines_of_code": 2847,
    "documentation_improved": 5,
    "bugs_fixed": 7,
    "features_added": 5
  },
  "learning_insights": [
    "You excel at frontend development opportunities",
    "Consider exploring backend Python projects",
    "Your contribution completion rate is above average"
  ]
}
```

## Error Responses

### Opportunity Not Found (404)

```json
{
  "error": {
    "code": "OPPORTUNITY_NOT_FOUND",
    "message": "Opportunity not found",
    "details": {
      "opportunity_id": "opp_123"
    }
  }
}
```

### Already Tracking (409)

```json
{
  "error": {
    "code": "ALREADY_TRACKING",
    "message": "You are already tracking this opportunity",
    "details": {
      "tracking_id": "track_456",
      "started_at": "2024-01-10T12:00:00Z"
    }
  }
}
```

### Invalid Match Criteria (422)

```json
{
  "error": {
    "code": "INVALID_MATCH_CRITERIA",
    "message": "Invalid matching criteria",
    "details": {
      "field_errors": {
        "difficulty_range": "Must be valid difficulty levels",
        "time_commitment": "Invalid time format"
      }
    }
  }
}
```

## Rate Limits

| Endpoint Category     | Limit        | Window   |
| --------------------- | ------------ | -------- |
| Opportunity discovery | 200 requests | Per hour |
| Matching operations   | 50 requests  | Per hour |
| Tracking operations   | 100 requests | Per hour |
| Analytics             | 100 requests | Per hour |

## Best Practices

### Effective Opportunity Discovery

- Use AI matching for personalized recommendations
- Set realistic time commitments based on your schedule
- Filter by repository health to ensure good experiences
- Start with good-first-issue tagged opportunities

### Successful Contribution Tracking

- Start tracking when you begin work, not when you finish
- Update progress regularly to get better insights
- Be honest about time spent for accurate future estimates
- Document blockers and learnings for the community

### Continuous Learning

- Review analytics regularly to understand your growth
- Try different types of contributions to expand skills
- Seek opportunities that stretch your comfort zone
- Share feedback to help improve the matching algorithm
