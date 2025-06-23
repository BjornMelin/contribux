/**
 * Webhook interfaces and GitHub API types
 *
 * This file contains interfaces for GitHub webhooks,
 * including payload types and event handlers.
 */

// Import main GitHub types to avoid duplication
import type { GitHubIssue, GitHubPullRequest, GitHubRepository } from '../types'

export interface WebhookValidationResult {
  isValid: boolean
  error?: string
}

// Core webhook types
export interface WebhookPayload {
  action?: string
  sender: {
    login: string
    id: number
    type: string
  }
  repository?: {
    id: number
    name: string
    full_name: string
    owner: {
      login: string
      id: number
    }
  }
}

export interface WebhookEvent {
  id: string
  event: string
  payload: WebhookPayload
}

export interface WebhookConfiguration {
  url: string
  content_type: 'json' | 'form'
  secret?: string
  insecure_ssl?: '0' | '1'
}

export interface WebhookHeaders {
  'x-github-event': string
  'x-github-delivery': string
  'x-hub-signature'?: string
  'x-hub-signature-256'?: string
}

export type WebhookHandlers = Record<string, (payload: WebhookPayload) => void | Promise<void>>

// Webhook payload types
export interface PushPayload extends WebhookPayload {
  ref: string
  before: string
  after: string
  commits: Array<{
    id: string
    message: string
    author: {
      name: string
      email: string
    }
  }>
}

export interface IssuesPayload extends WebhookPayload {
  issue: GitHubIssue
}

export interface PullRequestPayload extends WebhookPayload {
  pull_request: GitHubPullRequest
}

export interface ForkPayload extends WebhookPayload {
  forkee: GitHubRepository
}

export interface StarPayload extends WebhookPayload {
  starred_at?: string
}

export interface ReleasePayload extends WebhookPayload {
  release: {
    id: number
    tag_name: string
    name: string
    body: string
    draft: boolean
    prerelease: boolean
  }
}

export interface WorkflowRunPayload extends WebhookPayload {
  workflow_run: {
    id: number
    name: string
    status: string
    conclusion?: string
    run_number: number
  }
}
