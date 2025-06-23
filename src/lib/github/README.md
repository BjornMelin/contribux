# GitHub API Client

A clean GitHub API client for TypeScript/JavaScript applications with essential features including authentication, rate limiting, and error handling.

## Features

- 🔐 **Multiple Authentication Methods**: Personal Access Token, GitHub App, OAuth
- ⚡ **Rate Limiting**: Automatic rate limit detection and reporting
- 🔁 **Error Handling**: Comprehensive error classes for different scenarios
- 📊 **GraphQL Support**: Native GraphQL query execution
- 🚀 **Pagination**: Built-in pagination support for large datasets

## Installation

```bash
# This is part of the contribux project - not a standalone package
import { GitHubClient } from '@/lib/github'
```

## Basic Usage

```typescript
import { GitHubClient } from '@/lib/github'

// Personal Access Token
const client = new GitHubClient({
  auth: {
    type: 'token',
    token: process.env.GITHUB_TOKEN
  }
})

// GitHub App
const appClient = new GitHubClient({
  auth: {
    type: 'app',
    appId: 123456,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: 789012
  }
})
```

## Configuration Options

```typescript
const client = new GitHubClient({
  auth: { type: 'token', token: 'ghp_xxxxxxxxxxxx' },
  baseUrl: 'https://api.github.com', // Custom API URL if needed
  userAgent: 'my-app/1.0.0' // Custom user agent
})
```

## Core Functionality

The client provides these core methods:

- `rest` - Access to GitHub REST API via Octokit
- `graphql()` - Execute GraphQL queries
- `paginate()` - Handle paginated responses
- `getRateLimit()` - Get current rate limit status

## API Examples

### REST API

```typescript
// Get repository
const repo = await client.rest.repos.get({
  owner: 'facebook',
  repo: 'react'
})

// List issues
const issues = await client.rest.issues.listForRepo({
  owner: 'facebook',
  repo: 'react',
  state: 'open'
})

// Create issue
const newIssue = await client.rest.issues.create({
  owner: 'myorg',
  repo: 'myrepo',
  title: 'Bug: Something is broken',
  body: 'Description of the issue...'
})
```

### GraphQL API

```typescript
// Simple query
const result = await client.graphql(`
  query {
    repository(owner: "facebook", name: "react") {
      stargazerCount
      forkCount
    }
  }
`)

// Query with variables
const userRepos = await client.graphql(`
  query($login: String!, $first: Int!) {
    user(login: $login) {
      repositories(first: $first) {
        nodes {
          name
          stargazerCount
        }
      }
    }
  }
`, {
  login: 'octocat',
  first: 10
})
```

## Rate Limiting

The client provides access to rate limit information:

```typescript
// Get current rate limit status
const rateLimit = await client.getRateLimit()
console.log('Remaining requests:', rateLimit.rate.remaining)
console.log('Reset time:', new Date(rateLimit.rate.reset * 1000))
```

## Error Handling

The client provides typed errors for better error handling:

```typescript
import {
  GitHubClientError,
  GitHubAuthenticationError
} from '@/lib/github'

try {
  await client.rest.repos.get({ owner, repo })
} catch (error) {
  if (error instanceof GitHubAuthenticationError) {
    console.log('Authentication failed:', error.message)
  } else if (error instanceof GitHubClientError) {
    console.log('GitHub API error:', error.message)
  }
}
```

## Testing

Example of testing with the GitHub client:

```typescript
import { GitHubClient } from '@/lib/github'

describe('MyService', () => {
  let client: GitHubClient
  
  beforeEach(() => {
    client = new GitHubClient({
      auth: { type: 'token', token: 'test-token' }
    })
  })
  
  it('should fetch repository data', async () => {
    // Your test code
  })
})
```

## Contributing

See the main project README for contribution guidelines.

## License

MIT