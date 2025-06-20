// Base GitHub API object types
export interface GitHubUser {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string | null
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
}

export interface GitHubRepository {
  id: number
  node_id: string
  name: string
  full_name: string
  private: boolean
  owner: GitHubUser
  html_url: string
  description: string | null
  fork: boolean
  url: string
  created_at: string
  updated_at: string
  pushed_at: string
  clone_url: string
  size: number
  stargazers_count: number
  watchers_count: number
  language: string | null
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  has_pages: boolean
  has_downloads: boolean
  archived: boolean
  disabled: boolean
  open_issues_count: number
  license: {
    key: string
    name: string
    spdx_id: string
    url: string
    node_id: string
  } | null
  allow_forking: boolean
  is_template: boolean
  topics: string[]
  visibility: 'public' | 'private' | 'internal'
  forks: number
  open_issues: number
  watchers: number
  default_branch: string
}

export interface GitHubIssue {
  id: number
  node_id: string
  url: string
  repository_url: string
  labels_url: string
  comments_url: string
  events_url: string
  html_url: string
  number: number
  title: string
  user: GitHubUser | null
  labels: Array<{
    id: number
    node_id: string
    url: string
    name: string
    color: string
    default: boolean
    description: string | null
  }>
  state: 'open' | 'closed'
  locked: boolean
  assignee: GitHubUser | null
  assignees: GitHubUser[]
  milestone: {
    id: number
    node_id: string
    url: string
    html_url: string
    labels_url: string
    number: number
    title: string
    description: string | null
    creator: GitHubUser
    open_issues: number
    closed_issues: number
    state: 'open' | 'closed'
    created_at: string
    updated_at: string
    due_on: string | null
    closed_at: string | null
  } | null
  comments: number
  created_at: string
  updated_at: string
  closed_at: string | null
  author_association: string
  active_lock_reason: string | null
  draft?: boolean
  body: string | null
}

export interface GitHubPullRequest {
  id: number
  node_id: string
  url: string
  html_url: string
  diff_url: string
  patch_url: string
  issue_url: string
  number: number
  state: 'open' | 'closed'
  locked: boolean
  title: string
  user: GitHubUser | null
  body: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  merge_commit_sha: string | null
  assignee: GitHubUser | null
  assignees: GitHubUser[]
  requested_reviewers: GitHubUser[]
  requested_teams: Array<{
    id: number
    node_id: string
    url: string
    html_url: string
    name: string
    slug: string
    description: string | null
    privacy: string
    permission: string
    members_url: string
    repositories_url: string
  }>
  labels: Array<{
    id: number
    node_id: string
    url: string
    name: string
    color: string
    default: boolean
    description: string | null
  }>
  milestone: GitHubIssue['milestone']
  draft: boolean
  commits_url: string
  review_comments_url: string
  review_comment_url: string
  comments_url: string
  statuses_url: string
  head: {
    label: string
    ref: string
    sha: string
    user: GitHubUser | null
    repo: GitHubRepository | null
  }
  base: {
    label: string
    ref: string
    sha: string
    user: GitHubUser | null
    repo: GitHubRepository | null
  }
  author_association: string
  auto_merge: unknown | null
  active_lock_reason: string | null
  merged: boolean
  mergeable: boolean | null
  rebaseable: boolean | null
  mergeable_state: string
  merged_by: GitHubUser | null
  comments: number
  review_comments: number
  maintainer_can_modify: boolean
  commits: number
  additions: number
  deletions: number
  changed_files: number
}

// Webhook payload types
export interface IssuesPayload {
  action:
    | 'opened'
    | 'edited'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'unassigned'
    | 'labeled'
    | 'unlabeled'
  issue: GitHubIssue
  repository: GitHubRepository
  sender: GitHubUser
}

export interface PullRequestPayload {
  action:
    | 'opened'
    | 'edited'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'unassigned'
    | 'review_requested'
    | 'review_request_removed'
    | 'labeled'
    | 'unlabeled'
    | 'synchronize'
  number: number
  pull_request: GitHubPullRequest
  repository: GitHubRepository
  sender: GitHubUser
}

export interface PushPayload {
  ref: string
  before: string
  after: string
  created: boolean
  deleted: boolean
  forced: boolean
  base_ref: string | null
  compare: string
  commits: Array<{
    id: string
    tree_id: string
    distinct: boolean
    message: string
    timestamp: string
    url: string
    author: {
      name: string
      email: string
      username?: string
    }
    committer: {
      name: string
      email: string
      username?: string
    }
    added: string[]
    removed: string[]
    modified: string[]
  }>
  head_commit: PushPayload['commits'][0] | null
  repository: GitHubRepository
  pusher: {
    name: string
    email: string
  }
  sender: GitHubUser
}

export interface StarPayload {
  action: 'created' | 'deleted'
  starred_at: string | null
  repository: GitHubRepository
  sender: GitHubUser
}

export interface ForkPayload {
  forkee: GitHubRepository
  repository: GitHubRepository
  sender: GitHubUser
}

export interface ReleasePayload {
  action:
    | 'published'
    | 'unpublished'
    | 'created'
    | 'edited'
    | 'deleted'
    | 'prereleased'
    | 'released'
  release: {
    id: number
    node_id: string
    url: string
    assets_url: string
    upload_url: string
    html_url: string
    tag_name: string
    target_commitish: string
    name: string | null
    draft: boolean
    author: GitHubUser
    prerelease: boolean
    created_at: string
    published_at: string | null
    assets: Array<{
      id: number
      node_id: string
      url: string
      name: string
      label: string | null
      uploader: GitHubUser
      content_type: string
      state: string
      size: number
      download_count: number
      created_at: string
      updated_at: string
      browser_download_url: string
    }>
    tarball_url: string
    zipball_url: string
    body: string | null
  }
  repository: GitHubRepository
  sender: GitHubUser
}

export interface WorkflowRunPayload {
  action: 'requested' | 'completed' | 'in_progress'
  workflow_run: {
    id: number
    name: string | null
    node_id: string
    head_branch: string | null
    head_sha: string
    path: string
    display_title: string
    run_number: number
    event: string
    status: 'queued' | 'in_progress' | 'completed'
    conclusion:
      | 'success'
      | 'failure'
      | 'neutral'
      | 'cancelled'
      | 'skipped'
      | 'timed_out'
      | 'action_required'
      | null
    workflow_id: number
    check_suite_id: number
    check_suite_node_id: string
    url: string
    html_url: string
    pull_requests: Array<{
      id: number
      number: number
      url: string
      head: {
        ref: string
        sha: string
        repo: {
          id: number
          url: string
          name: string
        }
      }
      base: {
        ref: string
        sha: string
        repo: {
          id: number
          url: string
          name: string
        }
      }
    }>
    created_at: string
    updated_at: string
    actor: GitHubUser
    run_attempt: number
    run_started_at: string | null
    triggering_actor: GitHubUser
    jobs_url: string
    logs_url: string
    check_suite_url: string
    artifacts_url: string
    cancel_url: string
    rerun_url: string
    previous_attempt_url: string | null
    workflow_url: string
    head_commit: {
      id: string
      tree_id: string
      message: string
      timestamp: string
      author: {
        name: string
        email: string
      }
      committer: {
        name: string
        email: string
      }
    }
    repository: GitHubRepository
    head_repository: GitHubRepository | null
  }
  workflow: {
    id: number
    node_id: string
    name: string
    path: string
    state: 'active' | 'deleted' | 'disabled_fork' | 'disabled_inactivity' | 'disabled_manually'
    created_at: string
    updated_at: string
    url: string
    html_url: string
    badge_url: string
  }
  repository: GitHubRepository
  sender: GitHubUser
}

// Union type for all webhook payloads
export type WebhookPayload =
  | IssuesPayload
  | PullRequestPayload
  | PushPayload
  | StarPayload
  | ForkPayload
  | ReleasePayload
  | WorkflowRunPayload
  | Record<string, unknown> // Fallback for unknown webhook types

export interface WebhookEvent {
  type: string
  action?: string
  deliveryId: string
  payload: WebhookPayload
}

export interface WebhookHandlers {
  onIssue?: (event: WebhookEvent) => Promise<void> | void
  onPullRequest?: (event: WebhookEvent) => Promise<void> | void
  onPush?: (event: WebhookEvent) => Promise<void> | void
  onStar?: (event: WebhookEvent) => Promise<void> | void
  onFork?: (event: WebhookEvent) => Promise<void> | void
  onRelease?: (event: WebhookEvent) => Promise<void> | void
  onWorkflowRun?: (event: WebhookEvent) => Promise<void> | void
}

export interface WebhookConfiguration {
  supportedEvents: string[]
  secret?: string
  handlers: WebhookHandlers
}

export interface WebhookHeaders {
  'x-hub-signature-256'?: string
  'x-github-event': string
  'x-github-delivery': string
  [key: string]: string | undefined
}
