# Quick Start Guide

Get up and running with the Contribux API in under 10 minutes.

## Prerequisites

- GitHub account
- Basic knowledge of REST APIs
- Development environment with your preferred language

## Step 1: Authentication Setup

### Option A: OAuth Integration (Recommended for User-Facing Apps)

1. **Get GitHub OAuth Credentials**

   ```bash
   # Set up GitHub OAuth app at https://github.com/settings/applications/new
   # Authorization callback URL: https://yourapp.com/auth/callback
   ```

2. **Create OAuth Flow**

   ```javascript
   // Frontend: Redirect to GitHub
   const authUrl = new URL("https://github.com/login/oauth/authorize");
   authUrl.searchParams.set("client_id", "your_github_client_id");
   authUrl.searchParams.set(
     "redirect_uri",
     "https://yourapp.com/auth/callback"
   );
   authUrl.searchParams.set("scope", "user:email");

   window.location.href = authUrl.toString();
   ```

3. **Exchange Code for Contribux Token**

   ```javascript
   // Backend: Handle callback
   const response = await fetch(
     "https://contribux.ai/api/v1/auth/oauth/github",
     {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         code: req.query.code,
         redirect_uri: "https://yourapp.com/auth/callback",
       }),
     }
   );

   const { access_token } = await response.json();
   ```

### Option B: API Key (For Server-to-Server)

1. **Get API Key** from [Developer Dashboard](https://contribux.ai/dashboard/developers)
2. **Set Environment Variable**

   ```bash
   export CONTRIBUX_API_KEY="ck_live_your_api_key_here"
   ```

## Step 2: Make Your First API Call

### Get User Profile

```javascript
const response = await fetch("https://contribux.ai/api/v1/users/me", {
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
  },
});

const user = await response.json();
console.log("User:", user);
```

**Expected Response:**

```json
{
  "id": "user_123",
  "email": "user@example.com",
  "github_username": "username",
  "preferences": {
    "languages": ["JavaScript", "Python"],
    "experience_level": "intermediate",
    "interests": ["frontend", "open-source"]
  },
  "created_at": "2024-01-01T00:00:00Z"
}
```

## Step 3: Discover Repositories

### Get Personalized Recommendations

```javascript
const response = await fetch(
  "https://contribux.ai/api/v1/repositories/recommendations",
  {
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
  }
);

const recommendations = await response.json();
console.log("Recommended repositories:", recommendations);
```

**Expected Response:**

```json
{
  "repositories": [
    {
      "id": "repo_456",
      "name": "awesome-project",
      "full_name": "org/awesome-project",
      "description": "An awesome open source project",
      "language": "JavaScript",
      "stars": 1250,
      "contribution_score": 0.85,
      "difficulty_level": "beginner",
      "estimated_time": "2-4 hours",
      "match_reasons": [
        "Matches your JavaScript experience",
        "Good for intermediate developers",
        "Active maintainer community"
      ]
    }
  ],
  "total_count": 25,
  "page": 1,
  "per_page": 10
}
```

## Step 4: Find Contribution Opportunities

### Search for Specific Opportunities

```javascript
const response = await fetch(
  "https://contribux.ai/api/v1/opportunities/search",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      languages: ["JavaScript"],
      difficulty: "beginner",
      types: ["bug", "feature"],
      time_commitment: "1-3 hours",
    }),
  }
);

const opportunities = await response.json();
console.log("Opportunities:", opportunities);
```

**Expected Response:**

```json
{
  "opportunities": [
    {
      "id": "opp_789",
      "title": "Add dark mode toggle to settings page",
      "description": "Users have requested a dark mode option...",
      "repository": {
        "name": "web-app",
        "full_name": "company/web-app",
        "language": "JavaScript"
      },
      "labels": ["good first issue", "frontend"],
      "estimated_effort": "2-3 hours",
      "difficulty": "beginner",
      "ai_analysis": {
        "skills_needed": ["React", "CSS"],
        "complexity_score": 0.3,
        "learning_potential": 0.7
      },
      "url": "https://github.com/company/web-app/issues/123"
    }
  ],
  "total_count": 42,
  "page": 1
}
```

## Step 5: Track Contributions

### Submit Contribution Event

```javascript
const response = await fetch(
  "https://contribux.ai/api/v1/analytics/contributions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      opportunity_id: "opp_789",
      action: "started",
      repository: "company/web-app",
      pr_url: "https://github.com/company/web-app/pull/456",
      estimated_time: "3 hours",
    }),
  }
);

const result = await response.json();
console.log("Contribution tracked:", result);
```

## Complete Example

Here's a complete example that puts it all together:

```javascript
class ContribuxClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = "https://contribux.ai/api/v1";
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.message}`);
    }

    return response.json();
  }

  // Get user profile
  async getProfile() {
    return this.request("/users/me");
  }

  // Get personalized repository recommendations
  async getRecommendations(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/repositories/recommendations?${query}`);
  }

  // Search for contribution opportunities
  async searchOpportunities(criteria) {
    return this.request("/opportunities/search", {
      method: "POST",
      body: JSON.stringify(criteria),
    });
  }

  // Track contribution activity
  async trackContribution(data) {
    return this.request("/analytics/contributions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

// Usage example
async function main() {
  try {
    const client = new ContribuxClient(process.env.CONTRIBUX_ACCESS_TOKEN);

    // Get user profile
    const user = await client.getProfile();
    console.log("👤 User:", user.github_username);

    // Get recommendations
    const recommendations = await client.getRecommendations({
      limit: 5,
      difficulty: "beginner",
    });
    console.log(
      "📁 Found",
      recommendations.repositories.length,
      "recommendations"
    );

    // Search for specific opportunities
    const opportunities = await client.searchOpportunities({
      languages: user.preferences.languages,
      difficulty: "beginner",
      time_commitment: "1-3 hours",
    });
    console.log("🎯 Found", opportunities.total_count, "opportunities");

    // Show first opportunity
    if (opportunities.opportunities.length > 0) {
      const opp = opportunities.opportunities[0];
      console.log("💡 First opportunity:", opp.title);
      console.log("📊 Difficulty:", opp.difficulty);
      console.log("⏱️  Estimated time:", opp.estimated_effort);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
```

## Next Steps

1. **Explore the API**: Check out the [full API reference](./endpoints/)
2. **Handle Errors**: Learn about [error handling](./errors.md)
3. **Set Up Webhooks**: Get notified about new opportunities
4. **Rate Limiting**: Understand [request limits](./rate-limiting.md)
5. **Production Setup**: Review [security best practices](./authentication.md#security-best-practices)

## Common Patterns

### Pagination

```javascript
async function getAllRecommendations(client) {
  let page = 1;
  let allRepos = [];

  while (true) {
    const response = await client.getRecommendations({
      page,
      per_page: 50,
    });

    allRepos.push(...response.repositories);

    if (response.repositories.length < 50) break;
    page++;
  }

  return allRepos;
}
```

### Error Handling with Retry

```javascript
async function makeRequestWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        // Rate limited
        const retryAfter = parseInt(error.headers["retry-after"]) || 60;
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

### Token Refresh

```javascript
class AuthenticatedClient {
  constructor(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  async request(endpoint, options = {}) {
    try {
      return await this.makeRequest(endpoint, options);
    } catch (error) {
      if (error.status === 401) {
        await this.refreshAccessToken();
        return this.makeRequest(endpoint, options);
      }
      throw error;
    }
  }

  async refreshAccessToken() {
    const response = await fetch("https://contribux.ai/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
  }
}
```

## Need Help?

- 📖 **Documentation**: [Full API Reference](./endpoints/)
- 💬 **Community**: [Discord Server](https://discord.gg/contribux)
- 📧 **Support**: [support@contribux.ai](mailto:support@contribux.ai)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/contribux/contribux/issues)
