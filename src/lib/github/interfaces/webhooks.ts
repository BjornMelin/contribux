/**
 * Webhook interfaces and GitHub API types
 *
 * This file contains interfaces for GitHub webhooks,
 * including payload types and event handlers.
 */

export interface WebhookValidationResult {
  isValid: boolean
  error?: string
}

// Re-export webhook types from the existing webhooks module
export type {
  ForkPayload,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
  IssuesPayload,
  PullRequestPayload,
  PushPayload,
  ReleasePayload,
  StarPayload,
  WebhookConfiguration,
  WebhookEvent,
  WebhookHandlers,
  WebhookHeaders,
  WebhookPayload,
  WorkflowRunPayload,
} from '../webhooks/types'
