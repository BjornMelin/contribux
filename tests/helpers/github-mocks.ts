/**
 * GitHub API Mock Factories
 * Provides realistic mock data for GitHub API responses
 */

export interface GitHubUserMock {
  id: number
  login: string
  avatar_url: string
  html_url: string
  type: 'User' | 'Organization'
  site_admin: boolean
  name?: string
  email?: string
  bio?: string
  company?: string
  location?: string
  blog?: string
  twitter_username?: string
  public_repos?: number
  public_gists?: number
  followers?: number
  following?: number
  created_at?: string
  updated_at?: string
}

export interface GitHubRepositoryMock {
  id: number
  name: string
  full_name: string
  description?: string
  html_url: string
  clone_url: string
  git_url: string
  ssh_url: string
  language?: string
  stargazers_count: number
  watchers_count: number
  forks_count: number
  open_issues_count: number
  default_branch: string
  topics: string[]
  archived: boolean
  disabled: boolean
  private: boolean
  fork: boolean
  created_at: string
  updated_at: string
  pushed_at: string
  owner: GitHubUserMock
  license?: {
    key: string
    name: string
    spdx_id: string
  }
}

export interface GitHubIssueMock {
  id: number
  number: number
  title: string
  body?: string
  state: 'open' | 'closed'
  labels: Array<{
    id: number
    name: string
    color: string
    description?: string
  }>
  user: GitHubUserMock
  assignee?: GitHubUserMock
  assignees: GitHubUserMock[]
  milestone?: {
    id: number
    title: string
    state: 'open' | 'closed'
  }
  created_at: string
  updated_at: string
  closed_at?: string
  html_url: string
  comments: number
}

/**
 * Factory for creating GitHub user mock data
 */
let userMockCounter = 1

export function createGitHubUserMock(overrides: Partial<GitHubUserMock> = {}): GitHubUserMock {
  const id = userMockCounter++

  return {
    id: overrides.id ?? 1000000 + id,
    login: overrides.login ?? `testuser${id}`,
    avatar_url: overrides.avatar_url ?? `https://github.com/images/error/testuser${id}_happy.gif`,
    html_url: overrides.html_url ?? `https://github.com/${overrides.login ?? `testuser${id}`}`,
    type: overrides.type ?? 'User',
    site_admin: overrides.site_admin ?? false,
    name: overrides.name ?? `Test User ${id}`,
    email: overrides.email ?? `test${id}@example.com`,
    bio: overrides.bio ?? `Bio for test user ${id}`,
    company: overrides.company ?? `Test Company ${id}`,
    location: overrides.location ?? `Test City ${id}`,
    blog: overrides.blog ?? `https://testuser${id}.dev`,
    twitter_username: overrides.twitter_username ?? `testuser${id}`,
    public_repos: overrides.public_repos ?? Math.floor(Math.random() * 50),
    public_gists: overrides.public_gists ?? Math.floor(Math.random() * 20),
    followers: overrides.followers ?? Math.floor(Math.random() * 1000),
    following: overrides.following ?? Math.floor(Math.random() * 500),
    created_at:
      overrides.created_at ??
      new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    ...overrides,
  }
}

export function createManyGitHubUserMocks(
  count: number,
  overrides: Partial<GitHubUserMock> = {}
): GitHubUserMock[] {
  return Array.from({ length: count }, () => createGitHubUserMock(overrides))
}

export function resetGitHubUserMockCounter(): void {
  userMockCounter = 1
}

/**
 * Factory for creating GitHub repository mock data
 */
let repositoryMockCounter = 1

export function createGitHubRepositoryMock(
  overrides: Partial<GitHubRepositoryMock> = {}
): GitHubRepositoryMock {
  const id = repositoryMockCounter++
  const owner = overrides.owner ?? createGitHubUserMock()
  const name = overrides.name ?? `test-repo-${id}`
  const fullName = `${owner.login}/${name}`

  return {
    id: overrides.id ?? 2000000 + id,
    name,
    full_name: overrides.full_name ?? fullName,
    description: overrides.description ?? `Test repository ${id} description`,
    html_url: overrides.html_url ?? `https://github.com/${fullName}`,
    clone_url: overrides.clone_url ?? `https://github.com/${fullName}.git`,
    git_url: overrides.git_url ?? `git://github.com/${fullName}.git`,
    ssh_url: overrides.ssh_url ?? `git@github.com:${fullName}.git`,
    language: overrides.language ?? 'TypeScript',
    stargazers_count: overrides.stargazers_count ?? Math.floor(Math.random() * 5000),
    watchers_count: overrides.watchers_count ?? Math.floor(Math.random() * 100),
    forks_count: overrides.forks_count ?? Math.floor(Math.random() * 500),
    open_issues_count: overrides.open_issues_count ?? Math.floor(Math.random() * 50),
    default_branch: overrides.default_branch ?? 'main',
    topics: overrides.topics ?? ['test', 'example', 'javascript'],
    archived: overrides.archived ?? false,
    disabled: overrides.disabled ?? false,
    private: overrides.private ?? false,
    fork: overrides.fork ?? false,
    created_at:
      overrides.created_at ??
      new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    pushed_at: overrides.pushed_at ?? new Date().toISOString(),
    owner,
    license: overrides.license ?? {
      key: 'mit',
      name: 'MIT License',
      spdx_id: 'MIT',
    },
    ...overrides,
  }
}

export function createManyGitHubRepositoryMocks(
  count: number,
  overrides: Partial<GitHubRepositoryMock> = {}
): GitHubRepositoryMock[] {
  return Array.from({ length: count }, () => createGitHubRepositoryMock(overrides))
}

export function resetGitHubRepositoryMockCounter(): void {
  repositoryMockCounter = 1
}

/**
 * Factory for creating GitHub issue mock data
 */
let issueMockCounter = 1

export function createGitHubIssueMock(overrides: Partial<GitHubIssueMock> = {}): GitHubIssueMock {
  const id = issueMockCounter++
  const user = overrides.user ?? createGitHubUserMock()

  const baseIssue: GitHubIssueMock = {
    id: overrides.id ?? 3000000 + id,
    number: overrides.number ?? id,
    title: overrides.title ?? `Test Issue ${id}`,
    body: overrides.body ?? `Test issue ${id} description with details`,
    state: overrides.state ?? 'open',
    labels: overrides.labels ?? [
      {
        id: 1,
        name: 'bug',
        color: 'd73a4a',
        description: "Something isn't working",
      },
      {
        id: 2,
        name: 'good first issue',
        color: '7057ff',
        description: 'Good for newcomers',
      },
    ],
    user,
    assignees: overrides.assignees ?? [],
    created_at:
      overrides.created_at ??
      new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    html_url: overrides.html_url ?? `https://github.com/testowner/test-repo/issues/${id}`,
    comments: overrides.comments ?? Math.floor(Math.random() * 10),
  }

  return {
    ...baseIssue,
    ...overrides,
  }
}

export function createManyGitHubIssueMocks(
  count: number,
  overrides: Partial<GitHubIssueMock> = {}
): GitHubIssueMock[] {
  return Array.from({ length: count }, () => createGitHubIssueMock(overrides))
}

export function resetGitHubIssueMockCounter(): void {
  issueMockCounter = 1
}

/**
 * Reset all factory counters
 */
export function resetAllGitHubMockCounters(): void {
  resetGitHubUserMockCounter()
  resetGitHubRepositoryMockCounter()
  resetGitHubIssueMockCounter()
}
