import type { Endpoints } from '@octokit/types'
import { z } from 'zod'
import type { GitHubUsername } from './base'
import type {
  DifficultyLevel,
  GitHubLabel,
  Opportunity,
  OpportunityType,
  Repository,
} from './search'

// ==================== GITHUB API TYPES ====================

/**
 * GitHub API types from Octokit
 */
export type GitHubApiRepository = Endpoints['GET /repos/{owner}/{repo}']['response']['data']
export type GitHubApiIssue =
  Endpoints['GET /repos/{owner}/{repo}/issues/{issue_number}']['response']['data']
export type GitHubApiLabel = GitHubApiIssue['labels'][number]
export type GitHubSearchResult = Endpoints['GET /search/repositories']['response']['data']

// ==================== GITHUB API TO INTERNAL TYPE MAPPING ====================

/**
 * Maps GitHub API snake_case properties to internal camelCase
 */
export const GitHubRepositoryTransformSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  full_name: z.string().min(1),
  owner: z.object({
    login: z.string().min(1),
    id: z.number().int().positive(),
    avatar_url: z.string().url(),
    html_url: z.string().url(),
    type: z.string(),
    site_admin: z.boolean(),
  }),
  private: z.boolean(),
  html_url: z.string().url(),
  description: z.string().nullable(),
  fork: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string().optional(),
  stargazers_count: z.number().int().min(0),
  forks_count: z.number().int().min(0),
  open_issues_count: z.number().int().min(0).optional(),
  language: z.string().nullable(),
  topics: z.array(z.string()).default([]),
  default_branch: z.string(),
  archived: z.boolean().default(false),
  has_issues: z.boolean().default(true),
  has_projects: z.boolean().default(true),
  has_wiki: z.boolean().default(true),
})

export type GitHubRepositoryTransform = z.infer<typeof GitHubRepositoryTransformSchema>

/**
 * Maps GitHub API issue to internal opportunity
 */
export const GitHubIssueTransformSchema = z.object({
  id: z.number().int().positive(),
  number: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  user: z
    .object({
      login: z.string().min(1),
      id: z.number().int().positive(),
      avatar_url: z.string().url(),
      html_url: z.string().url(),
      type: z.string(),
      site_admin: z.boolean(),
    })
    .nullable(),
  labels: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      color: z.string().regex(/^[0-9a-fA-F]{6}$/),
      description: z.string().nullable(),
    })
  ),
  assignee: z
    .object({
      login: z.string().min(1),
      id: z.number().int().positive(),
      avatar_url: z.string().url(),
      html_url: z.string().url(),
      type: z.string(),
      site_admin: z.boolean(),
    })
    .nullable(),
  assignees: z.array(
    z.object({
      login: z.string().min(1),
      id: z.number().int().positive(),
      avatar_url: z.string().url(),
      html_url: z.string().url(),
      type: z.string(),
      site_admin: z.boolean(),
    })
  ),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string().url(),
})

export type GitHubIssueTransform = z.infer<typeof GitHubIssueTransformSchema>

// ==================== TRANSFORMATION FUNCTIONS ====================

/**
 * Transform GitHub API repository to internal Repository type
 */
function transformGitHubRepository(
  githubRepo: GitHubApiRepository,
  healthScore = 0.5
): Omit<Repository, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    githubId: githubRepo.id,
    name: githubRepo.name,
    fullName: githubRepo.full_name,
    description: githubRepo.description || undefined,
    language: githubRepo.language || undefined,
    topics: githubRepo.topics || [],
    starsCount: githubRepo.stargazers_count,
    forksCount: githubRepo.forks_count,
    issuesCount: githubRepo.open_issues_count || 0,
    url: githubRepo.html_url,
    defaultBranch: githubRepo.default_branch,
    lastPushedAt: githubRepo.pushed_at ? new Date(githubRepo.pushed_at) : undefined,
    health: {
      score: healthScore,
      status:
        healthScore >= 0.8
          ? 'excellent'
          : healthScore >= 0.6
            ? 'good'
            : healthScore >= 0.4
              ? 'fair'
              : 'poor',
      metrics: {
        commitFrequency: 0,
        issueResponseTime: 0,
        prMergeTime: 0,
        maintainerActivity: 0,
        communityEngagement: 0,
        documentationQuality: 0,
        codeQuality: 0,
        testCoverage: undefined,
      },
      lastUpdated: new Date(),
    },
    isArchived: githubRepo.archived || false,
    isFork: githubRepo.fork,
    hasIssues: githubRepo.has_issues !== false,
    hasProjects: githubRepo.has_projects !== false,
    hasWiki: githubRepo.has_wiki !== false,
  }
}

/**
 * Transform GitHub API issue to internal Opportunity type
 */
function transformGitHubIssue(
  githubIssue: GitHubApiIssue,
  repository: Repository,
  aiAnalysis?: Partial<{
    complexityScore: number
    impactScore: number
    confidenceScore: number
    learningPotential: number
    businessImpact: number
    requiredSkills: string[]
    suggestedApproach: string
    potentialChallenges: string[]
    successProbability: number
    estimatedHours: number
    difficulty: DifficultyLevel
  }>
): Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt' | 'repositoryId'> {
  // Detect opportunity type from labels and title
  const type = detectOpportunityType(githubIssue.labels, githubIssue.title)

  // Detect difficulty from labels and AI analysis
  const difficulty = detectDifficulty(githubIssue.labels, aiAnalysis?.difficulty)

  // Transform labels (handle both string and object labels)
  const labels: GitHubLabel[] = githubIssue.labels.map(label => {
    if (typeof label === 'string') {
      return {
        id: 0,
        name: label,
        color: '#000000',
        description: undefined,
      }
    }
    return {
      id: label.id || 0,
      name: label.name || '',
      color: label.color || '#000000',
      description: label.description || undefined,
    }
  })

  // Detect technologies and skills from issue content
  const technologies = detectTechnologies(
    githubIssue.title,
    githubIssue.body || null,
    repository.language || null
  )
  const requiredSkills =
    aiAnalysis?.requiredSkills ||
    detectSkills(githubIssue.title, githubIssue.body || null, technologies)

  // Check for special labels
  const goodFirstIssue = labels.some(label => {
    const labelName = typeof label === 'string' ? label : label.name || ''
    const labelLower = labelName.toLowerCase()
    return (
      labelLower.includes('good first issue') ||
      labelLower.includes('beginner') ||
      labelLower.includes('newcomer')
    )
  })

  const helpWanted = labels.some(label => {
    const labelName = typeof label === 'string' ? label : label.name || ''
    const labelLower = labelName.toLowerCase()
    return (
      labelLower.includes('help wanted') ||
      labelLower.includes('help-wanted') ||
      labelLower.includes('contributions welcome')
    )
  })

  return {
    githubIssueId: githubIssue.id,
    title: githubIssue.title,
    description: githubIssue.body || undefined,
    type,
    difficulty,
    labels,
    technologies,
    requiredSkills,
    goodFirstIssue,
    helpWanted,
    hasAssignee: githubIssue.assignee !== null,
    assigneeUsername: githubIssue.assignee?.login as GitHubUsername | undefined,
    estimatedHours: aiAnalysis?.estimatedHours,
    relevanceScore: calculateRelevanceScore(githubIssue, repository, aiAnalysis),
    aiAnalysis: {
      complexityScore: aiAnalysis?.complexityScore || 0.5,
      impactScore: aiAnalysis?.impactScore || 0.5,
      confidenceScore: aiAnalysis?.confidenceScore || 0.3,
      learningPotential: aiAnalysis?.learningPotential || 0.5,
      businessImpact: aiAnalysis?.businessImpact || 0.5,
      requiredSkills,
      suggestedApproach: aiAnalysis?.suggestedApproach,
      potentialChallenges: aiAnalysis?.potentialChallenges || [],
      successProbability: aiAnalysis?.successProbability || 0.5,
      estimatedEffort: {
        hours: aiAnalysis?.estimatedHours,
        difficulty,
        confidence: aiAnalysis?.confidenceScore || 0.3,
      },
    },
    repository,
    url: githubIssue.html_url,
    lastActivityAt: new Date(githubIssue.updated_at),
    isActive: githubIssue.state === 'open',
  }
}

// ==================== DETECTION HELPERS ====================

/**
 * Detect opportunity type from GitHub issue labels and title
 */
function detectOpportunityType(labels: GitHubApiLabel[], title: string): OpportunityType {
  // Check labels first for explicit type classification
  const labelType = detectOpportunityTypeFromLabels(labels)
  if (labelType !== 'other') {
    return labelType
  }

  // Fall back to title analysis
  return detectOpportunityTypeFromTitle(title)
}

/**
 * Helper function: Detect opportunity type from GitHub issue labels
 */
function detectOpportunityTypeFromLabels(labels: GitHubApiLabel[]): OpportunityType {
  const labelPatterns = getLabelPatterns()

  for (const label of labels) {
    const labelName = extractLabelName(label)
    const labelLower = labelName.toLowerCase()

    const detectedType = findMatchingOpportunityType(labelLower, labelPatterns)
    if (detectedType !== 'other') {
      return detectedType
    }
  }

  return 'other'
}

function getLabelPatterns(): Record<string, string[]> {
  return {
    bug_fix: ['bug', 'fix', 'error', 'issue', 'broken', 'defect'],
    feature: ['feature', 'enhancement', 'new', 'add', 'implement'],
    documentation: ['docs', 'documentation', 'readme', 'guide', 'tutorial'],
    testing: ['test', 'testing', 'spec', 'coverage', 'unit test', 'integration'],
    refactoring: ['refactor', 'cleanup', 'improvement', 'optimize', 'restructure'],
    performance: ['performance', 'speed', 'optimization', 'fast', 'slow', 'memory'],
    security: ['security', 'vulnerability', 'auth', 'permission', 'crypto'],
    accessibility: ['accessibility', 'a11y', 'screen reader', 'aria', 'wcag'],
  }
}

function extractLabelName(label: GitHubApiLabel): string {
  return typeof label === 'string' ? label : label.name || ''
}

function findMatchingOpportunityType(
  labelLower: string,
  labelPatterns: Record<string, string[]>
): OpportunityType {
  for (const [type, patterns] of Object.entries(labelPatterns)) {
    if (patterns.some(pattern => labelLower.includes(pattern))) {
      return type as OpportunityType
    }
  }
  return 'other'
}

/**
 * Helper function: Detect opportunity type from issue title
 */
function detectOpportunityTypeFromTitle(title: string): OpportunityType {
  const titleLower = title.toLowerCase()

  // Define title patterns for each opportunity type
  const titlePatterns = {
    bug_fix: ['fix', 'bug', 'error', 'broken', 'not working', 'issue with'],
    feature: ['add', 'implement', 'create', 'new', 'feature', 'support for'],
    documentation: ['docs', 'documentation', 'readme', 'guide', 'document'],
    testing: ['test', 'testing', 'coverage', 'spec', 'unit test'],
    refactoring: ['refactor', 'cleanup', 'improve', 'optimize', 'restructure'],
    performance: ['performance', 'slow', 'fast', 'optimize', 'speed up'],
    security: ['security', 'vulnerability', 'auth', 'secure', 'permission'],
    accessibility: ['accessibility', 'a11y', 'screen reader', 'accessible'],
  }

  // Check each opportunity type pattern
  for (const [type, patterns] of Object.entries(titlePatterns)) {
    if (patterns.some(pattern => titleLower.includes(pattern))) {
      return type as OpportunityType
    }
  }

  return 'other'
}

/**
 * Detect difficulty level from GitHub issue labels
 */
function detectDifficulty(
  labels: GitHubApiLabel[],
  aiDifficulty?: DifficultyLevel
): DifficultyLevel {
  // Use AI analysis if available
  if (aiDifficulty) {
    return aiDifficulty
  }

  for (const label of labels) {
    const labelName = typeof label === 'string' ? label : label.name || ''
    const labelLower = labelName.toLowerCase()

    if (
      labelLower.includes('good first issue') ||
      labelLower.includes('beginner') ||
      labelLower.includes('easy') ||
      labelLower.includes('newcomer')
    ) {
      return 'beginner'
    }
    if (
      labelLower.includes('intermediate') ||
      labelLower.includes('medium') ||
      labelLower.includes('moderate')
    ) {
      return 'intermediate'
    }
    if (
      labelLower.includes('advanced') ||
      labelLower.includes('hard') ||
      labelLower.includes('difficult') ||
      labelLower.includes('expert')
    ) {
      return 'expert'
    }
  }

  return 'intermediate' // Default
}

/**
 * Detect technologies from issue title, body, and repository language
 */
function detectTechnologies(
  title: string,
  body: string | null,
  repoLanguage: string | null
): string[] {
  const technologies = new Set<string>()
  const content = `${title} ${body || ''}`.toLowerCase()

  // Add repository language if available
  if (repoLanguage) {
    technologies.add(repoLanguage)
  }

  // Common technologies
  const techKeywords = [
    'typescript',
    'javascript',
    'python',
    'java',
    'c++',
    'c#',
    'go',
    'rust',
    'php',
    'ruby',
    'react',
    'vue',
    'angular',
    'svelte',
    'nextjs',
    'nuxt',
    'gatsby',
    'nodejs',
    'express',
    'fastify',
    'nestjs',
    'deno',
    'bun',
    'docker',
    'kubernetes',
    'aws',
    'azure',
    'gcp',
    'vercel',
    'netlify',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'sqlite',
    'prisma',
    'typeorm',
    'graphql',
    'rest',
    'grpc',
    'websocket',
    'socket.io',
    'webpack',
    'vite',
    'rollup',
    'esbuild',
    'turbo',
    'parcel',
    'jest',
    'vitest',
    'cypress',
    'playwright',
    'selenium',
    'tailwind',
    'css',
    'sass',
    'styled-components',
    'emotion',
    'git',
    'github',
    'gitlab',
    'bitbucket',
    'ci/cd',
    'actions',
  ]

  for (const tech of techKeywords) {
    if (content.includes(tech)) {
      technologies.add(tech)
    }
  }

  return Array.from(technologies)
}

/**
 * Detect required skills from issue content and technologies
 */
function detectSkills(title: string, body: string | null, technologies: string[]): string[] {
  const skills = new Set<string>(technologies)
  const content = `${title} ${body || ''}`.toLowerCase()

  // Programming skills
  const skillKeywords = [
    'frontend',
    'backend',
    'fullstack',
    'devops',
    'mobile',
    'ui/ux',
    'design',
    'api',
    'database',
    'testing',
    'debugging',
    'performance optimization',
    'security',
    'accessibility',
    'code review',
    'documentation',
    'technical writing',
    'problem solving',
    'algorithms',
    'data structures',
    'system design',
    'architecture',
    'microservices',
    'monitoring',
    'logging',
    'analytics',
    'machine learning',
    'artificial intelligence',
    'blockchain',
    'web3',
  ]

  for (const skill of skillKeywords) {
    if (content.includes(skill)) {
      skills.add(skill)
    }
  }

  return Array.from(skills).slice(0, 10) // Limit to 10 skills
}

/**
 * Calculate relevance score based on issue and repository factors
 */
function calculateRelevanceScore(
  githubIssue: GitHubApiIssue,
  repository: Repository,
  aiAnalysis?: Partial<{
    complexityScore: number
    impactScore: number
    confidenceScore: number
  }>
): number {
  let score = 0.5 // Base score

  // Repository factors (40% weight)
  score += repository.health.score * 0.2
  score += Math.min(repository.starsCount / 10000, 0.1) // Up to 0.1 for stars
  score += repository.issuesCount > 0 ? 0.05 : 0 // Active issues
  score += repository.hasIssues ? 0.05 : 0

  // Issue factors (30% weight)
  score += githubIssue.labels.length > 0 ? 0.1 : 0 // Well-labeled
  score += githubIssue.body && githubIssue.body.length > 100 ? 0.1 : 0 // Detailed description
  score += githubIssue.assignee === null ? 0.1 : 0 // Available for assignment

  // AI analysis factors (30% weight)
  if (aiAnalysis) {
    score += (aiAnalysis.impactScore || 0) * 0.15
    score += (aiAnalysis.confidenceScore || 0) * 0.15
  }

  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score))
}

// ==================== SEARCH INTEGRATION ====================

/**
 * Transform GitHub search results to internal search results
 */
function transformGitHubSearchResults<T extends GitHubApiRepository | GitHubApiIssue, R>(
  searchResult: { items: T[]; total_count: number; incomplete_results: boolean },
  transformFn: (item: T) => R
): {
  items: R[]
  totalCount: number
  incompleteResults: boolean
} {
  return {
    items: searchResult.items.map(transformFn),
    totalCount: searchResult.total_count,
    incompleteResults: searchResult.incomplete_results,
  }
}

// ==================== VALIDATION SCHEMAS ====================

/**
 * GitHub webhook payload validation
 */
export const GitHubWebhookPayloadSchema = z.object({
  action: z.string(),
  issue: GitHubIssueTransformSchema.optional(),
  pull_request: z.unknown().optional(), // Pull request structure is similar to issue but more complex
  repository: GitHubRepositoryTransformSchema,
  sender: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().url(),
    html_url: z.string().url(),
    type: z.string(),
  }),
})

export type GitHubWebhookPayload = z.infer<typeof GitHubWebhookPayloadSchema>

/**
 * GitHub API response wrapper validation
 */
export const GitHubApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    status: z.number().int().min(200).max(299),
    headers: z.record(z.string()).optional(),
    url: z.string().url().optional(),
  })

// ==================== ERROR HANDLING ====================

/**
 * GitHub API error response
 */
export const GitHubApiErrorSchema = z.object({
  message: z.string(),
  documentation_url: z.string().url().optional(),
  errors: z
    .array(
      z.object({
        resource: z.string().optional(),
        field: z.string().optional(),
        code: z.string(),
        message: z.string().optional(),
      })
    )
    .optional(),
})

export type GitHubApiError = z.infer<typeof GitHubApiErrorSchema>

/**
 * Rate limit error specific to GitHub
 */
export const GitHubRateLimitErrorSchema = GitHubApiErrorSchema.extend({
  message: z.literal('API rate limit exceeded'),
})

export type GitHubRateLimitError = z.infer<typeof GitHubRateLimitErrorSchema>

// ==================== UTILITY TYPES ====================

/**
 * GitHub API compatibility layer types
 */
export interface GitHubApiCompatibility {
  /**
   * Convert internal Repository to GitHub API format
   */
  toGitHubRepository(repository: Repository): GitHubApiRepository

  /**
   * Convert internal Opportunity to GitHub API Issue format
   */
  toGitHubIssue(opportunity: Opportunity): GitHubApiIssue

  /**
   * Validate GitHub webhook payload
   */
  validateWebhookPayload(payload: unknown): GitHubWebhookPayload | null

  /**
   * Transform GitHub search results
   */
  transformSearchResults<T, R>(
    results: { items: T[]; total_count: number; incomplete_results: boolean },
    transformer: (item: T) => R
  ): { items: R[]; totalCount: number; incompleteResults: boolean }
}

/**
 * GitHub integration configuration
 */
export interface GitHubIntegrationConfig {
  readonly enableWebhooks: boolean
  readonly webhookSecret: string | undefined
  readonly autoSyncIssues: boolean
  readonly syncInterval: number // minutes
  readonly rateLimit: {
    readonly requestsPerHour: number
    readonly burstLimit: number
  }
  readonly retries: {
    readonly maxRetries: number
    readonly backoffMultiplier: number
    readonly maxBackoffMs: number
  }
}

export const GitHubIntegrationConfigSchema = z.object({
  enableWebhooks: z.boolean().default(false),
  webhookSecret: z.string().optional(),
  autoSyncIssues: z.boolean().default(true),
  syncInterval: z.number().int().min(1).max(1440).default(60), // 1 minute to 24 hours
  rateLimit: z.object({
    requestsPerHour: z.number().int().min(1).max(5000).default(1000),
    burstLimit: z.number().int().min(1).max(100).default(10),
  }),
  retries: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    backoffMultiplier: z.number().min(1).max(10).default(2),
    maxBackoffMs: z.number().int().min(1000).max(300000).default(30000), // 30 seconds max
  }),
})

// ==================== EXPORTS ====================

/**
 * Re-export commonly used transformation functions
 */
export { transformGitHubRepository, transformGitHubIssue, transformGitHubSearchResults }
