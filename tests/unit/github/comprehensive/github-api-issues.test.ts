/**
 * GitHub API Issues & Pull Requests Test Suite
 * Tests for GitHub Client issues, PRs, and project management operations
 */

import { GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockGitHubAPI, setupMSW } from '../msw-setup'
import { setupGitHubTestIsolation } from '../test-helpers'
import {
  expectedIssueFields,
  testClientConfigs,
  testIssueParams,
  testPRParams,
} from '../utils/github-test-helpers'

// Setup MSW for HTTP mocking
setupMSW()

// Setup test isolation
setupGitHubTestIsolation()

describe('GitHubClient - Issues & Pull Requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Issue Operations', () => {
    it('should list repository issues', async () => {
      const client = new GitHubClient({ accessToken: 'ghp_test_token' })

      const issues = await client.listIssues(
        testIssueParams.repository.owner,
        testIssueParams.repository.repo,
        {
          state: 'open',
          perPage: 10,
        }
      )

      expect(Array.isArray(issues)).toBe(true)
      expect(issues.length).toBeLessThanOrEqual(10)

      if (issues.length > 0) {
        // Verify required fields are present
        for (const field of expectedIssueFields) {
          expect(issues[0]).toHaveProperty(field)
        }
      }
    })

    it('should get single issue', async () => {
      const client = new GitHubClient({ accessToken: 'ghp_test_token' })

      const issue = await client.getIssue(
        testIssueParams.singleIssue.owner,
        testIssueParams.singleIssue.repo,
        testIssueParams.singleIssue.issueNumber
      )

      expect(issue).toMatchObject({
        id: expect.any(Number),
        number: testIssueParams.singleIssue.issueNumber,
        title: expect.any(String),
        state: expect.any(String),
      })

      // Verify required fields are present
      for (const field of expectedIssueFields) {
        expect(issue).toHaveProperty(field)
      }
    })

    it('should handle issue not found', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(client.getIssue(testIssueParams.notFound)).rejects.toThrow(GitHubError)
    })

    it('should validate issue response schema', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const issue = await client.getIssue(testIssueParams.singleIssue)

      // Should have required fields
      for (const field of expectedIssueFields) {
        expect(issue).toHaveProperty(field)
      }

      // Should have proper types
      expect(typeof issue.id).toBe('number')
      expect(typeof issue.number).toBe('number')
      expect(typeof issue.title).toBe('string')
      expect(typeof issue.state).toBe('string')
    })

    it('should handle issues with null values', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const issue = await client.getIssue(testIssueParams.nullValues)

      expect(issue).toMatchObject({
        id: expect.any(Number),
        number: testIssueParams.nullValues.issueNumber,
        title: expect.any(String),
        body: null,
        assignee: null,
      })
    })

    it('should list issues with different states', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      // Test open issues
      const openIssues = await client.listIssues(testIssueParams.repository, {
        state: 'open',
        per_page: 5,
      })

      // Test closed issues
      const closedIssues = await client.listIssues(testIssueParams.repository, {
        state: 'closed',
        per_page: 5,
      })

      // Test all issues
      const allIssues = await client.listIssues(testIssueParams.repository, {
        state: 'all',
        per_page: 5,
      })

      expect(Array.isArray(openIssues)).toBe(true)
      expect(Array.isArray(closedIssues)).toBe(true)
      expect(Array.isArray(allIssues)).toBe(true)
    })

    it('should handle issues with labels and assignees', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const issue = await client.getIssue(testIssueParams.withLabels)

      expect(issue).toMatchObject({
        id: expect.any(Number),
        number: testIssueParams.withLabels.issueNumber,
        labels: expect.any(Array),
        assignees: expect.any(Array),
      })
    })
  })

  describe('Pull Request Operations', () => {
    it('should list repository pull requests', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const prs = await client.listPullRequests(testPRParams.repository, {
        state: 'open',
        per_page: 10,
      })

      expect(Array.isArray(prs)).toBe(true)
      expect(prs.length).toBeLessThanOrEqual(10)
    })

    it('should get single pull request', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const pr = await client.getPullRequest(testPRParams.singlePR)

      expect(pr).toMatchObject({
        id: expect.any(Number),
        number: testPRParams.singlePR.pullNumber,
        title: expect.any(String),
        state: expect.any(String),
        head: expect.any(Object),
        base: expect.any(Object),
      })
    })

    it('should handle pull request not found', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(client.getPullRequest(testPRParams.notFound)).rejects.toThrow(GitHubError)
    })

    it('should validate pull request response schema', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const pr = await client.getPullRequest(testPRParams.singlePR)

      // Should have required PR-specific fields
      expect(pr).toHaveProperty('head')
      expect(pr).toHaveProperty('base')
      expect(pr).toHaveProperty('mergeable')
      expect(pr).toHaveProperty('merged')

      // Head and base should have proper structure
      expect(pr.head).toHaveProperty('ref')
      expect(pr.head).toHaveProperty('sha')
      expect(pr.base).toHaveProperty('ref')
      expect(pr.base).toHaveProperty('sha')
    })

    it('should handle pull requests with different states', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      // Test open PRs
      const openPRs = await client.listPullRequests(testPRParams.repository, {
        state: 'open',
        per_page: 5,
      })

      // Test closed PRs
      const closedPRs = await client.listPullRequests(testPRParams.repository, {
        state: 'closed',
        per_page: 5,
      })

      expect(Array.isArray(openPRs)).toBe(true)
      expect(Array.isArray(closedPRs)).toBe(true)
    })

    it('should handle merged pull requests', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const pr = await client.getPullRequest(testPRParams.merged)

      expect(pr).toMatchObject({
        id: expect.any(Number),
        number: testPRParams.merged.pullNumber,
        state: 'closed',
        merged: true,
        merge_commit_sha: expect.any(String),
      })
    })
  })

  describe('Comments Operations', () => {
    it('should list issue comments', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const comments = await client.listIssueComments(testIssueParams.withComments, {
        per_page: 10,
      })

      expect(Array.isArray(comments)).toBe(true)
      expect(comments.length).toBeLessThanOrEqual(10)

      if (comments.length > 0) {
        expect(comments[0]).toMatchObject({
          id: expect.any(Number),
          body: expect.any(String),
          user: expect.any(Object),
          created_at: expect.any(String),
        })
      }
    })

    it('should get single comment', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const comment = await client.getComment(testIssueParams.singleComment)

      expect(comment).toMatchObject({
        id: testIssueParams.singleComment.commentId,
        body: expect.any(String),
        user: expect.any(Object),
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })
    })

    it('should handle comment not found', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(client.getComment(testIssueParams.commentNotFound)).rejects.toThrow(GitHubError)
    })
  })

  describe('Issues & PRs Error Handling', () => {
    it('should handle malformed issue JSON', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(
        client.getIssue({ owner: 'malformed-test', repo: 'malformed-issue', issueNumber: 999 })
      ).rejects.toThrow()
    })

    it('should handle server errors for issues', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(
        client.getIssue({
          owner: 'server-error-test',
          repo: 'server-error-issue',
          issueNumber: 500,
        })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle validation errors for pull requests', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(
        client.getPullRequest({ owner: 'validation-test', repo: 'validation-pr', pullNumber: -1 })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle rate limiting for issue operations', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(
        client.listIssues({ owner: 'test', repo: 'rate-limited-issues' }, { per_page: 100 })
      ).rejects.toThrow(GitHubError)
    })

    it('should handle unauthorized access to private repositories', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(
        client.getIssue({ owner: 'private', repo: 'private-repo', issueNumber: 1 })
      ).rejects.toThrow(GitHubError)
    })
  })

  describe('Issues & PRs Data Validation', () => {
    it('should handle issues with wrong data types', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      await expect(client.getIssue(testIssueParams.badTypes)).rejects.toThrow()
    })

    it('should handle pull requests with extra unexpected fields', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const pr = await client.getPullRequest(testPRParams.singlePR)

      expect(pr).toMatchObject({
        id: expect.any(Number),
        number: testPRParams.singlePR.pullNumber,
      })
      // Extra fields should be filtered out by Zod validation
      expect(pr).not.toHaveProperty('extra_field')
      expect(pr).not.toHaveProperty('another_field')
    })

    it('should validate comment timestamps', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const comment = await client.getComment(testIssueParams.singleComment)

      // Should be valid ISO 8601 timestamps
      expect(() => new Date(comment.created_at)).not.toThrow()
      expect(() => new Date(comment.updated_at)).not.toThrow()
      expect(new Date(comment.created_at).getTime()).not.toBeNaN()
      expect(new Date(comment.updated_at).getTime()).not.toBeNaN()
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle issue to PR workflow', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      // Get an issue
      const issue = await client.getIssue(testIssueParams.singleIssue)
      expect(issue.number).toBe(testIssueParams.singleIssue.issueNumber)

      // List PRs that might reference this issue
      const prs = await client.listPullRequests(testPRParams.repository, {
        state: 'all',
        per_page: 5,
      })

      expect(Array.isArray(prs)).toBe(true)
    })

    it('should handle cached issue requests', async () => {
      const client = new GitHubClient(testClientConfigs.tokenWithCache)

      // First request
      const issue1 = await client.getIssue(testIssueParams.singleIssue)
      const stats1 = client.getCacheStats()

      // Second request (should hit cache)
      const issue2 = await client.getIssue(testIssueParams.singleIssue)
      const stats2 = client.getCacheStats()

      expect(issue1).toEqual(issue2)
      expect(stats2.hits).toBeGreaterThan(stats1.hits)
    })

    it('should handle concurrent issue and PR requests', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      const requests = [
        client.getIssue(testIssueParams.singleIssue),
        client.getPullRequest(testPRParams.singlePR),
        client.listIssues(testIssueParams.repository, { per_page: 5 }),
        client.listPullRequests(testPRParams.repository, { per_page: 5 }),
      ]

      const results = await Promise.allSettled(requests)

      // All should succeed
      expect(results.every(r => r.status === 'fulfilled')).toBe(true)
    })

    it('should handle complex filtering scenarios', async () => {
      const client = new GitHubClient(testClientConfigs.basicToken)

      // Filter by labels
      const labeledIssues = await client.listIssues(testIssueParams.repository, {
        labels: 'bug,help-wanted',
        state: 'open',
        per_page: 10,
      })

      // Filter by assignee
      const assignedIssues = await client.listIssues(testIssueParams.repository, {
        assignee: 'testuser',
        state: 'open',
        per_page: 10,
      })

      expect(Array.isArray(labeledIssues)).toBe(true)
      expect(Array.isArray(assignedIssues)).toBe(true)
    })
  })

  describe('Issues & PRs Caching Behavior', () => {
    it('should cache issue responses with deterministic keys', async () => {
      const client = new GitHubClient(testClientConfigs.tokenWithCache)

      // Test with issue parameters - different ordering
      const issueParams1 = { owner: 'testowner', repo: 'testrepo', issueNumber: 1 }
      const issueParams2 = { issueNumber: 1, repo: 'testrepo', owner: 'testowner' }

      const issue1 = await client.getIssue(issueParams1)
      const stats1 = client.getCacheStats()

      const issue2 = await client.getIssue(issueParams2)
      const stats2 = client.getCacheStats()

      // Should be the same issue and should hit cache
      expect(issue1).toEqual(issue2)
      expect(stats2.hits).toBe(stats1.hits + 1)
    })

    it('should cache PR list responses consistently', async () => {
      const client = new GitHubClient(testClientConfigs.tokenWithCache)

      // Test with PR list parameters - different ordering
      const listParams1 = { state: 'open' as const, per_page: 10, page: 1 }
      const listParams2 = { page: 1, per_page: 10, state: 'open' as const }

      const prs1 = await client.listPullRequests(testPRParams.repository, listParams1)
      const stats1 = client.getCacheStats()

      const prs2 = await client.listPullRequests(testPRParams.repository, listParams2)
      const stats2 = client.getCacheStats()

      // Should hit cache for identical parameters (different order)
      expect(prs1).toEqual(prs2)
      expect(stats2.hits).toBe(stats1.hits + 1)
    })

    it('should handle comment caching properly', async () => {
      const client = new GitHubClient(testClientConfigs.tokenWithCache)

      // First comment request
      const comment1 = await client.getComment(testIssueParams.singleComment)
      const stats1 = client.getCacheStats()

      // Second comment request (should hit cache)
      const comment2 = await client.getComment(testIssueParams.singleComment)
      const stats2 = client.getCacheStats()

      expect(comment1).toEqual(comment2)
      expect(stats2.hits).toBe(stats1.hits + 1)
    })
  })
})
