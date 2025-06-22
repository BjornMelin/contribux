const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3002;
const MOCK_RATE_LIMIT = process.env.MOCK_RATE_LIMIT === 'true';
const MOCK_DELAY_MS = parseInt(process.env.MOCK_DELAY_MS || '0', 10);

// Request counters for rate limiting simulation
const requestCounts = new Map();

// Middleware
app.use(bodyParser.json());

// Add delay if configured
app.use((req, res, next) => {
  if (MOCK_DELAY_MS > 0) {
    setTimeout(next, MOCK_DELAY_MS);
  } else {
    next();
  }
});

// Add rate limit headers
app.use((req, res, next) => {
  const key = req.headers.authorization || 'anonymous';
  const count = requestCounts.get(key) || 0;
  requestCounts.set(key, count + 1);
  
  // Simulate rate limits
  const limit = 5000;
  const remaining = Math.max(0, limit - count);
  const reset = Math.floor(Date.now() / 1000) + 3600;
  
  res.set({
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': reset.toString(),
    'X-RateLimit-Used': count.toString(),
    'X-RateLimit-Resource': 'core'
  });
  
  // Simulate rate limit exceeded
  if (MOCK_RATE_LIMIT && remaining === 0) {
    res.status(403).json({
      message: 'API rate limit exceeded',
      documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting'
    });
    return;
  }
  
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', mock: true });
});

// User endpoint
app.get('/user', (req, res) => {
  res.json({
    login: 'test-user',
    id: 12345,
    node_id: 'MDQ6VXNlcjEyMzQ1',
    avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
    type: 'User',
    name: 'Test User',
    company: 'Test Company',
    email: 'test@example.com',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z'
  });
});

// Repository endpoints
app.get('/repos/:owner/:repo', (req, res) => {
  const { owner, repo } = req.params;
  res.json({
    id: 123456,
    node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY=',
    name: repo,
    full_name: `${owner}/${repo}`,
    owner: {
      login: owner,
      id: 12345,
      type: 'User'
    },
    private: false,
    description: 'Test repository',
    fork: false,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    pushed_at: '2023-01-01T00:00:00Z',
    size: 1000,
    stargazers_count: 100,
    watchers_count: 100,
    language: 'TypeScript',
    has_issues: true,
    has_projects: true,
    has_downloads: true,
    has_wiki: true,
    has_pages: false,
    forks_count: 10,
    open_issues_count: 5,
    default_branch: 'main'
  });
});

// Issues endpoints
app.get('/repos/:owner/:repo/issues', (req, res) => {
  const { owner, repo } = req.params;
  const { state = 'open', per_page = 30, page = 1 } = req.query;
  
  const issues = [];
  const total = state === 'open' ? 5 : 10;
  const start = (page - 1) * per_page;
  const end = Math.min(start + per_page, total);
  
  for (let i = start; i < end; i++) {
    issues.push({
      id: 1000 + i,
      node_id: `MDU6SXNzdWUxMDAw${i}`,
      number: i + 1,
      title: `Test Issue ${i + 1}`,
      user: {
        login: 'test-user',
        id: 12345
      },
      state: state,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      body: `This is test issue ${i + 1}`
    });
  }
  
  res.json(issues);
});

app.post('/repos/:owner/:repo/issues', (req, res) => {
  const { owner, repo } = req.params;
  const { title, body, labels = [] } = req.body;
  
  res.status(201).json({
    id: 2000,
    node_id: 'MDU6SXNzdWUyMDAw',
    number: 100,
    title: title,
    user: {
      login: 'test-user',
      id: 12345
    },
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    body: body,
    labels: labels.map(label => ({
      id: 1,
      name: label,
      color: 'ffffff'
    }))
  });
});

// Pull request endpoints
app.get('/repos/:owner/:repo/pulls', (req, res) => {
  const { owner, repo } = req.params;
  res.json([
    {
      id: 3000,
      node_id: 'MDExOlB1bGxSZXF1ZXN0MzAwMA==',
      number: 1,
      state: 'open',
      title: 'Test PR',
      user: {
        login: 'test-user',
        id: 12345
      },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      head: {
        ref: 'feature-branch',
        sha: 'abc123'
      },
      base: {
        ref: 'main',
        sha: 'def456'
      }
    }
  ]);
});

// GraphQL endpoint
app.post('/graphql', (req, res) => {
  const { query, variables } = req.body;
  
  // Simple mock response
  res.json({
    data: {
      viewer: {
        login: 'test-user'
      },
      rateLimit: {
        limit: 5000,
        cost: 1,
        remaining: 4999,
        resetAt: new Date(Date.now() + 3600000).toISOString()
      }
    }
  });
});

// Search endpoints
app.get('/search/repositories', (req, res) => {
  res.json({
    total_count: 1,
    incomplete_results: false,
    items: [
      {
        id: 123456,
        name: 'test-repo',
        full_name: 'test-user/test-repo',
        owner: {
          login: 'test-user',
          id: 12345
        }
      }
    ]
  });
});

// Reset rate limits endpoint (for testing)
app.post('/test/reset-rate-limits', (req, res) => {
  requestCounts.clear();
  res.json({ message: 'Rate limits reset' });
});

// Start server
app.listen(PORT, () => {
  console.log(`GitHub mock server listening on port ${PORT}`);
  console.log(`Mock rate limiting: ${MOCK_RATE_LIMIT}`);
  console.log(`Mock delay: ${MOCK_DELAY_MS}ms`);
});