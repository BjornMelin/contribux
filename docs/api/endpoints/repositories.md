# Repositories Endpoints

Repository endpoints handle GitHub repository discovery, search, and health analytics with AI-powered semantic matching.

## Repository Discovery

### List Repositories

```http
GET /api/v1/repositories
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `language`: Filter by programming language
- `topic`: Filter by repository topics
- `min_stars`: Minimum star count (default: 1)
- `max_stars`: Maximum star count
- `status`: Repository status (`active`, `archived`, `private`, `fork`, `template`)
- `health_score`: Minimum health score (0-100)
- `limit`: Number of repositories (default: 20, max: 100)
- `offset`: Pagination offset
- `sort`: Sort by (`stars`, `health_score`, `activity`, `created_at`, `updated_at`)
- `order`: Sort order (`asc`, `desc`)

**Response:**

```json
{
  "repositories": [
    {
      "id": "repo_123",
      "github_id": 456789,
      "full_name": "org/awesome-project",
      "name": "awesome-project",
      "description": "An awesome open source project for developers",
      "url": "https://github.com/org/awesome-project",
      "clone_url": "https://github.com/org/awesome-project.git",
      "owner": {
        "login": "org",
        "type": "Organization",
        "avatar_url": "https://avatars.githubusercontent.com/u/12345"
      },
      "language": "JavaScript",
      "languages": {
        "JavaScript": 65.2,
        "TypeScript": 28.1,
        "CSS": 6.7
      },
      "topics": ["javascript", "react", "opensource"],
      "status": "active",
      "metrics": {
        "stars_count": 1547,
        "forks_count": 234,
        "watchers_count": 89,
        "open_issues_count": 23
      },
      "health": {
        "health_score": 85.5,
        "activity_score": 92.3,
        "community_score": 78.9,
        "documentation_score": 88.1
      },
      "ai_analysis": {
        "complexity_level": "intermediate",
        "contributor_friendliness": 85,
        "learning_potential": 78,
        "avg_pr_merge_time": 72,
        "avg_issue_close_time": 168,
        "maintainer_responsiveness": 0.89
      },
      "last_activity": "2024-01-15T10:30:00Z",
      "created_at": "2023-06-01T08:00:00Z",
      "updated_at": "2024-01-15T11:00:00Z"
    }
  ],
  "pagination": {
    "total_count": 1547,
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "filters_applied": {
    "language": "JavaScript",
    "min_stars": 100,
    "health_score": 70
  }
}
```

### Get Repository Details

```http
GET /api/v1/repositories/{repository_id}
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "id": "repo_123",
  "github_id": 456789,
  "full_name": "org/awesome-project",
  "name": "awesome-project",
  "description": "An awesome open source project for developers",
  "url": "https://github.com/org/awesome-project",
  "clone_url": "https://github.com/org/awesome-project.git",
  "owner": {
    "login": "org",
    "type": "Organization",
    "avatar_url": "https://avatars.githubusercontent.com/u/12345",
    "url": "https://github.com/org"
  },
  "language": "JavaScript",
  "languages": {
    "JavaScript": 65.2,
    "TypeScript": 28.1,
    "CSS": 6.7
  },
  "topics": ["javascript", "react", "opensource"],
  "status": "active",
  "metrics": {
    "stars_count": 1547,
    "forks_count": 234,
    "watchers_count": 89,
    "open_issues_count": 23,
    "size": 2048,
    "default_branch": "main"
  },
  "health": {
    "health_score": 85.5,
    "activity_score": 92.3,
    "community_score": 78.9,
    "documentation_score": 88.1,
    "last_calculated": "2024-01-15T09:00:00Z"
  },
  "ai_analysis": {
    "complexity_level": "intermediate",
    "contributor_friendliness": 85,
    "learning_potential": 78,
    "avg_pr_merge_time": 72,
    "avg_issue_close_time": 168,
    "maintainer_responsiveness": 0.89,
    "beginner_friendly": true,
    "has_good_first_issues": true
  },
  "contribution_stats": {
    "total_contributors": 47,
    "active_contributors_30d": 12,
    "commits_30d": 89,
    "prs_opened_30d": 23,
    "prs_merged_30d": 18,
    "issues_opened_30d": 15,
    "issues_closed_30d": 12
  },
  "maintainers": [
    {
      "login": "maintainer1",
      "role": "owner",
      "avatar_url": "https://avatars.githubusercontent.com/u/12345"
    },
    {
      "login": "maintainer2",
      "role": "admin",
      "avatar_url": "https://avatars.githubusercontent.com/u/54321"
    }
  ],
  "license": {
    "key": "mit",
    "name": "MIT License",
    "url": "https://api.github.com/licenses/mit"
  },
  "last_activity": "2024-01-15T10:30:00Z",
  "created_at": "2023-06-01T08:00:00Z",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

## Repository Search

### Semantic Search

Advanced AI-powered search using vector embeddings for semantic similarity matching.

```http
POST /api/v1/repositories/search
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "query": "machine learning python data science",
  "filters": {
    "languages": ["Python", "R"],
    "min_stars": 100,
    "max_contributors": 50,
    "activity": "high",
    "difficulty": "intermediate",
    "topics": ["machine-learning", "data-science"],
    "has_issues": true,
    "good_first_issues": true
  },
  "search_options": {
    "vector_search": true,
    "hybrid_ranking": true,
    "include_ai_insights": true,
    "personalized": true
  },
  "limit": 20,
  "offset": 0
}
```

**Response:**

```json
{
  "repositories": [
    {
      "id": "repo_456",
      "full_name": "scikit-learn/scikit-learn",
      "name": "scikit-learn",
      "description": "Machine learning library for Python",
      "match_score": 0.94,
      "match_reasons": [
        "High semantic similarity to 'machine learning python'",
        "Active community with beginner-friendly issues",
        "Strong documentation and learning resources"
      ],
      "relevance_factors": {
        "semantic_similarity": 0.92,
        "language_match": 1.0,
        "activity_score": 0.88,
        "contributor_friendliness": 0.91
      },
      "ai_recommendation": {
        "confidence": 0.89,
        "learning_value": "high",
        "contribution_difficulty": "intermediate",
        "time_to_first_contribution": "2-3 weeks"
      },
      "opportunities_preview": {
        "good_first_issues": 15,
        "documentation_improvements": 8,
        "bug_fixes": 23
      }
    }
  ],
  "search_metadata": {
    "total_found": 1247,
    "search_time_ms": 45,
    "vector_search_used": true,
    "personalization_applied": true
  },
  "suggestions": {
    "related_queries": [
      "data science visualization python",
      "machine learning frameworks tensorflow",
      "python scientific computing"
    ],
    "filter_suggestions": {
      "popular_languages": ["Python", "R", "Jupyter Notebook"],
      "trending_topics": ["deep-learning", "computer-vision", "nlp"]
    }
  }
}
```

### Text Search

Traditional text-based search for repository names, descriptions, and topics.

```http
GET /api/v1/repositories/search
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `q`: Search query (required)
- `language`: Filter by programming language
- `sort`: Sort by (`stars`, `forks`, `updated`, `relevance`)
- `order`: Sort order (`asc`, `desc`)
- `limit`: Number of results (default: 20, max: 100)

**Response:**

```json
{
  "repositories": [
    {
      "id": "repo_789",
      "full_name": "facebook/react",
      "name": "react",
      "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces",
      "text_match_score": 0.87,
      "highlighted_matches": {
        "description": "A declarative, efficient, and flexible <em>JavaScript</em> library for building user interfaces",
        "topics": ["<em>javascript</em>", "react", "frontend"]
      }
    }
  ],
  "total_count": 89,
  "incomplete_results": false
}
```

## Repository Health & Analytics

### Get Repository Health Score

```http
GET /api/v1/repositories/{repository_id}/health
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "repository_id": "repo_123",
  "health_score": 85.5,
  "components": {
    "activity_score": {
      "score": 92.3,
      "factors": {
        "commit_frequency": 0.89,
        "issue_response_time": 0.94,
        "pr_merge_rate": 0.85,
        "contributor_growth": 0.78
      }
    },
    "community_score": {
      "score": 78.9,
      "factors": {
        "contributor_diversity": 0.82,
        "discussion_engagement": 0.76,
        "maintainer_responsiveness": 0.89,
        "code_review_quality": 0.81
      }
    },
    "documentation_score": {
      "score": 88.1,
      "factors": {
        "readme_quality": 0.92,
        "api_documentation": 0.85,
        "contributing_guidelines": 0.91,
        "code_comments": 0.84
      }
    }
  },
  "trends": {
    "health_trend_30d": 2.3,
    "activity_trend_30d": 5.7,
    "community_trend_30d": -1.2
  },
  "last_calculated": "2024-01-15T09:00:00Z",
  "next_update": "2024-01-16T09:00:00Z"
}
```

### Get Repository Analytics

```http
GET /api/v1/repositories/{repository_id}/analytics
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `period`: Time period (`week`, `month`, `quarter`, `year`)
- `metrics`: Comma-separated metrics to include

**Response:**

```json
{
  "repository_id": "repo_123",
  "period": "month",
  "metrics": {
    "contributions": {
      "commits": 156,
      "pull_requests": 34,
      "issues": 28,
      "contributors": 12
    },
    "activity": {
      "stars_gained": 47,
      "forks_created": 8,
      "watchers_added": 15,
      "traffic_views": 1247,
      "traffic_clones": 89
    },
    "quality": {
      "code_coverage": 87.5,
      "test_pass_rate": 98.2,
      "security_score": 92.1,
      "performance_score": 89.3
    }
  },
  "charts": {
    "contribution_timeline": [
      {
        "date": "2024-01-01",
        "commits": 12,
        "prs": 3,
        "issues": 2
      }
    ],
    "language_distribution": {
      "JavaScript": 65.2,
      "TypeScript": 28.1,
      "CSS": 6.7
    }
  },
  "insights": [
    "Activity increased 15% compared to previous month",
    "New contributor onboarding improved significantly",
    "Documentation quality metrics trending upward"
  ]
}
```

## Repository Management

### Add Repository

```http
POST /api/v1/repositories
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "github_url": "https://github.com/org/new-project",
  "auto_sync": true,
  "track_health": true,
  "notify_changes": false
}
```

**Response:**

```json
{
  "id": "repo_new_123",
  "full_name": "org/new-project",
  "status": "syncing",
  "message": "Repository added and initial sync started",
  "estimated_sync_time": "5-10 minutes",
  "webhook_configured": true,
  "created_at": "2024-01-15T12:00:00Z"
}
```

### Update Repository

```http
PATCH /api/v1/repositories/{repository_id}
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body:**

```json
{
  "auto_sync": false,
  "track_health": true,
  "custom_tags": ["featured", "beginner-friendly"],
  "priority": "high"
}
```

### Force Sync Repository

```http
POST /api/v1/repositories/{repository_id}/sync
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "sync_id": "sync_789",
  "status": "started",
  "estimated_completion": "2024-01-15T12:05:00Z"
}
```

### Get Sync Status

```http
GET /api/v1/repositories/{repository_id}/sync/{sync_id}
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "sync_id": "sync_789",
  "status": "completed",
  "progress": 100,
  "started_at": "2024-01-15T12:00:00Z",
  "completed_at": "2024-01-15T12:04:32Z",
  "changes_detected": {
    "new_issues": 3,
    "closed_issues": 1,
    "new_prs": 2,
    "merged_prs": 1,
    "metadata_changes": 5
  }
}
```

## Repository Recommendations

### Get Personalized Recommendations

```http
GET /api/v1/repositories/recommendations
Authorization: Bearer {access_token}
```

**Query Parameters:**

- `reason`: Recommendation reason (`trending`, `matched_skills`, `similar_interests`, `beginner_friendly`)
- `limit`: Number of recommendations (default: 10, max: 50)

**Response:**

```json
{
  "recommendations": [
    {
      "repository": {
        "id": "repo_rec_123",
        "full_name": "awesome/project",
        "description": "An amazing project perfect for your skills"
      },
      "recommendation": {
        "reason": "matched_skills",
        "confidence": 0.89,
        "explanation": "Matches your JavaScript and React expertise, with beginner-friendly issues",
        "learning_opportunities": ["GraphQL", "TypeScript", "Testing"],
        "contribution_potential": "high",
        "estimated_time_investment": "3-5 hours/week"
      }
    }
  ],
  "personalization": {
    "based_on": ["skill_profile", "contribution_history", "preferences"],
    "updated_at": "2024-01-15T10:00:00Z"
  }
}
```

## Error Responses

### Repository Not Found (404)

```json
{
  "error": {
    "code": "REPOSITORY_NOT_FOUND",
    "message": "Repository not found",
    "details": {
      "repository_id": "repo_123"
    }
  }
}
```

### Invalid Search Query (422)

```json
{
  "error": {
    "code": "INVALID_SEARCH_QUERY",
    "message": "Search query contains invalid parameters",
    "details": {
      "field_errors": {
        "query": "Query must be at least 2 characters long",
        "limit": "Limit must be between 1 and 100"
      }
    }
  }
}
```

### Sync Failed (500)

```json
{
  "error": {
    "code": "SYNC_FAILED",
    "message": "Repository sync failed",
    "details": {
      "sync_id": "sync_789",
      "reason": "GitHub API rate limit exceeded",
      "retry_after": "2024-01-15T13:00:00Z"
    }
  }
}
```

## Rate Limits

| Endpoint Category     | Limit        | Window   |
| --------------------- | ------------ | -------- |
| Repository search     | 100 requests | Per hour |
| Repository details    | 500 requests | Per hour |
| Health & analytics    | 200 requests | Per hour |
| Management operations | 50 requests  | Per hour |
| Sync operations       | 20 requests  | Per hour |

## Best Practices

### Search Optimization

- Use semantic search for discovery and exploration
- Use text search for specific repository names
- Combine filters to narrow results effectively
- Enable personalization for better recommendations

### Health Monitoring

- Monitor health scores for repositories you contribute to
- Use analytics to understand repository trends
- Set up notifications for significant health changes

### Sync Management

- Use auto-sync for active repositories
- Force sync sparingly to avoid rate limits
- Monitor sync status for large repositories
