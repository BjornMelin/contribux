/**
 * Type-safe test data factories using Zod for schema validation
 * Provides consistent test data generation across the test suite
 */

import { z } from 'zod'

// Zod schemas for test data validation

// User factory schema
export const UserFactorySchema = z.object({
  id: z.string().uuid().optional(),
  github_id: z.number().positive(),
  github_username: z.string().min(1).max(255),
  github_name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().optional(),
  company: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  blog: z.string().url().optional(),
  twitter_username: z.string().max(255).optional(),
  role: z.enum(['user', 'admin', 'developer', 'maintainer']).default('user'),
  preferred_languages: z.array(z.string()).default([]),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).default('intermediate'),
  availability_hours: z.number().min(0).max(168).default(10),
  profile_embedding: z.array(z.number()).length(1536).optional(),
  skills_confidence: z.record(z.number()).default({}),
  contribution_patterns: z.record(z.any()).default({}),
  preference_weights: z.record(z.number()).default({}),
  last_github_sync: z.date().optional(),
  last_active: z.date().default(() => new Date()),
  total_contributions: z.number().nonnegative().default(0),
  streak_days: z.number().nonnegative().default(0),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
})

// Repository factory schema
export const RepositoryFactorySchema = z.object({
  id: z.string().uuid().optional(),
  github_id: z.number().positive(),
  full_name: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  url: z.string().url(),
  clone_url: z.string().url(),
  owner_login: z.string().min(1).max(255),
  owner_type: z.string().min(1).max(50),
  language: z.string().max(100).optional(),
  languages: z.record(z.number()).default({}),
  topics: z.array(z.string()).default([]),
  status: z.enum(['active', 'archived', 'private', 'fork', 'template']).default('active'),
  stars_count: z.number().nonnegative().default(0),
  forks_count: z.number().nonnegative().default(0),
  watchers_count: z.number().nonnegative().default(0),
  open_issues_count: z.number().nonnegative().default(0),
  health_score: z.number().min(0).max(100).default(0),
  activity_score: z.number().min(0).max(100).default(0),
  community_score: z.number().min(0).max(100).default(0),
  documentation_score: z.number().min(0).max(100).default(0),
  description_embedding: z.array(z.number()).length(1536).optional(),
  complexity_level: z
    .enum(['beginner', 'intermediate', 'advanced', 'expert'])
    .default('intermediate'),
  contributor_friendliness: z.number().min(0).max(100).default(50),
  learning_potential: z.number().min(0).max(100).default(50),
  avg_pr_merge_time: z.number().positive().optional(),
  avg_issue_close_time: z.number().positive().optional(),
  maintainer_responsiveness: z.number().min(0).max(1).default(0),
  first_time_contributor_friendly: z.boolean().default(false),
  last_activity: z.date().optional(),
  last_analyzed: z.date().optional(),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
})

// Opportunity factory schema
export const OpportunityFactorySchema = z.object({
  id: z.string().uuid().optional(),
  repository_id: z.string().uuid(),
  github_issue_number: z.number().positive().optional(),
  github_pr_number: z.number().positive().optional(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  url: z.string().url(),
  labels: z.array(z.string()).default([]),
  type: z.enum(['bug_fix', 'feature', 'documentation', 'test', 'refactor', 'security']),
  status: z.enum(['open', 'in_progress', 'completed', 'stale', 'closed']).default('open'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).default('intermediate'),
  estimated_hours: z.number().positive().optional(),
  priority: z.number().min(0).max(100).default(50),
  title_embedding: z.array(z.number()).length(1536).optional(),
  description_embedding: z.array(z.number()).length(1536).optional(),
  complexity_score: z.number().min(0).max(100).default(50),
  learning_value: z.number().min(0).max(100).default(50),
  impact_score: z.number().min(0).max(100).default(50),
  required_skills: z.array(z.string()).default([]),
  nice_to_have_skills: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  mentorship_available: z.boolean().default(false),
  good_first_issue: z.boolean().default(false),
  help_wanted: z.boolean().default(false),
  bounty_available: z.boolean().default(false),
  bounty_amount: z.number().nonnegative().optional(),
  view_count: z.number().nonnegative().default(0),
  application_count: z.number().nonnegative().default(0),
  completion_count: z.number().nonnegative().default(0),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
  expires_at: z.date().optional(),
})

// Vector embedding schema
export const VectorEmbeddingSchema = z.array(z.number()).length(1536)

// Type exports
export type UserFactoryInput = z.input<typeof UserFactorySchema>
export type UserFactoryOutput = z.output<typeof UserFactorySchema>
export type RepositoryFactoryInput = z.input<typeof RepositoryFactorySchema>
export type RepositoryFactoryOutput = z.output<typeof RepositoryFactorySchema>
export type OpportunityFactoryInput = z.input<typeof OpportunityFactorySchema>
export type OpportunityFactoryOutput = z.output<typeof OpportunityFactorySchema>

/**
 * Generate a realistic 1536-dimensional embedding vector
 */
export function generateTestEmbedding(seed?: string): number[] {
  const random = createSeededRandom(seed)
  const embedding: number[] = []

  // Generate 1536-dimensional vector with realistic distribution
  for (let i = 0; i < 1536; i++) {
    // Use Box-Muller transform for normal distribution
    const u1 = random()
    const u2 = random()
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

    // Scale to typical embedding range
    embedding.push(z0 * 0.1)
  }

  // Normalize to unit vector (common in embeddings)
  return normalizeVector(embedding)
}

/**
 * Generate embeddings that are semantically similar
 */
export function generateSimilarEmbeddings(
  baseEmbedding: number[],
  count: number,
  similarity = 0.8
): number[][] {
  const embeddings: number[][] = []

  for (let i = 0; i < count; i++) {
    const noise = generateTestEmbedding(`noise_${i}`)
    const similar = baseEmbedding.map(
      (val, idx) => val * similarity + (noise[idx] ?? 0) * (1 - similarity)
    )
    embeddings.push(normalizeVector(similar))
  }

  return embeddings
}

// User factory counter
let userFactoryCounter = 1

/**
 * Create a test user with type-safe data generation
 */
export function createUser(overrides: Partial<UserFactoryInput> = {}): UserFactoryOutput {
  const id = userFactoryCounter++

  const userData: UserFactoryInput = {
    id: overrides.id ?? `550e8400-e29b-41d4-a716-446655441${id.toString().padStart(3, '0')}`,
    github_id: overrides.github_id ?? 1000000 + id,
    github_username: overrides.github_username ?? `testuser${id}`,
    github_name: overrides.github_name ?? `Test User ${id}`,
    email: overrides.email ?? `test${id}@example.com`,
    avatar_url: overrides.avatar_url ?? `https://github.com/images/error/testuser${id}_happy.gif`,
    bio: overrides.bio ?? `Bio for test user ${id}`,
    company: overrides.company ?? `Test Company ${id}`,
    location: overrides.location ?? `Test City ${id}`,
    preferred_languages: overrides.preferred_languages ?? ['JavaScript', 'TypeScript'],
    profile_embedding: overrides.profile_embedding ?? generateTestEmbedding(`user_${id}`),
    ...overrides,
  }

  return UserFactorySchema.parse(userData)
}

/**
 * Create multiple test users
 */
export function createManyUsers(
  count: number,
  overrides: Partial<UserFactoryInput> = {}
): UserFactoryOutput[] {
  return Array.from({ length: count }, () => createUser(overrides))
}

/**
 * Create a test user with specific embedding
 */
export function createUserWithEmbedding(
  embedding: number[],
  overrides: Partial<UserFactoryInput> = {}
): UserFactoryOutput {
  return createUser({
    ...overrides,
    profile_embedding: embedding,
  })
}

/**
 * Reset user factory counter
 */
export function resetUserFactoryCounter(): void {
  userFactoryCounter = 1
}

// Repository factory counter
let repositoryFactoryCounter = 1

/**
 * Create a test repository with type-safe data generation
 */
export function createRepository(
  overrides: Partial<RepositoryFactoryInput> = {}
): RepositoryFactoryOutput {
  const id = repositoryFactoryCounter++
  const owner = overrides.owner_login ?? `testowner${id}`
  const name = overrides.name ?? `test-repo-${id}`

  const repoData: RepositoryFactoryInput = {
    id: overrides.id ?? `550e8400-e29b-41d4-a716-446655442${id.toString().padStart(3, '0')}`,
    github_id: overrides.github_id ?? 2000000 + id,
    full_name: overrides.full_name ?? `${owner}/${name}`,
    name,
    description: overrides.description ?? `Test repository ${id} description`,
    url: overrides.url ?? `https://github.com/${owner}/${name}`,
    clone_url: overrides.clone_url ?? `https://github.com/${owner}/${name}.git`,
    owner_login: owner,
    owner_type: overrides.owner_type ?? 'User',
    language: overrides.language ?? 'TypeScript',
    languages: overrides.languages ?? { TypeScript: 80, JavaScript: 20 },
    topics: overrides.topics ?? ['test', 'example'],
    description_embedding: overrides.description_embedding ?? generateTestEmbedding(`repo_${id}`),
    ...overrides,
  }

  return RepositoryFactorySchema.parse(repoData)
}

/**
 * Create multiple test repositories
 */
export function createManyRepositories(
  count: number,
  overrides: Partial<RepositoryFactoryInput> = {}
): RepositoryFactoryOutput[] {
  return Array.from({ length: count }, () => createRepository(overrides))
}

/**
 * Create a test repository with specific embedding
 */
export function createRepositoryWithEmbedding(
  embedding: number[],
  overrides: Partial<RepositoryFactoryInput> = {}
): RepositoryFactoryOutput {
  return createRepository({
    ...overrides,
    description_embedding: embedding,
  })
}

/**
 * Reset repository factory counter
 */
export function resetRepositoryFactoryCounter(): void {
  repositoryFactoryCounter = 1
}

// Opportunity factory counter
let opportunityFactoryCounter = 1

/**
 * Create a test opportunity with type-safe data generation
 */
export function createOpportunity(
  overrides: Partial<OpportunityFactoryInput> = {}
): OpportunityFactoryOutput {
  const id = opportunityFactoryCounter++

  const opportunityData: OpportunityFactoryInput = {
    repository_id:
      overrides.repository_id ??
      `550e8400-e29b-41d4-a716-446655440${id.toString().padStart(3, '0')}`,
    github_issue_number: overrides.github_issue_number ?? id,
    title: overrides.title ?? `Test Issue ${id}`,
    description: overrides.description ?? `Test issue ${id} description with details`,
    url: overrides.url ?? `https://github.com/testowner/test-repo/issues/${id}`,
    labels: overrides.labels ?? ['bug', 'good first issue'],
    type: overrides.type ?? 'bug_fix',
    required_skills: overrides.required_skills ?? ['JavaScript', 'React'],
    technologies: overrides.technologies ?? ['Node.js', 'Express'],
    title_embedding: overrides.title_embedding ?? generateTestEmbedding(`opportunity_title_${id}`),
    description_embedding:
      overrides.description_embedding ?? generateTestEmbedding(`opportunity_desc_${id}`),
    ...overrides,
  }

  return OpportunityFactorySchema.parse(opportunityData)
}

/**
 * Create multiple test opportunities
 */
export function createManyOpportunities(
  count: number,
  overrides: Partial<OpportunityFactoryInput> = {}
): OpportunityFactoryOutput[] {
  return Array.from({ length: count }, (_, index) =>
    createOpportunity({
      ...overrides,
      repository_id:
        overrides.repository_id ||
        `550e8400-e29b-41d4-a716-446655440${(index + 1).toString().padStart(3, '0')}`,
    })
  )
}

/**
 * Create a good first issue opportunity
 */
export function createGoodFirstIssue(
  overrides: Partial<OpportunityFactoryInput> = {}
): OpportunityFactoryOutput {
  return createOpportunity({
    good_first_issue: true,
    difficulty: 'beginner',
    labels: ['good first issue', 'beginner-friendly'],
    ...overrides,
  })
}

/**
 * Create an opportunity with specific embeddings
 */
export function createOpportunityWithEmbeddings(
  titleEmbedding: number[],
  descriptionEmbedding: number[],
  overrides: Partial<OpportunityFactoryInput> = {}
): OpportunityFactoryOutput {
  return createOpportunity({
    ...overrides,
    title_embedding: titleEmbedding,
    description_embedding: descriptionEmbedding,
  })
}

/**
 * Reset opportunity factory counter
 */
export function resetOpportunityFactoryCounter(): void {
  opportunityFactoryCounter = 1
}

// Utility functions

function createSeededRandom(seed?: string): () => number {
  let seedValue = 0
  if (seed) {
    for (let i = 0; i < seed.length; i++) {
      seedValue += seed.charCodeAt(i)
    }
  } else {
    seedValue = Math.floor(Math.random() * 1000000)
  }

  return () => {
    seedValue = (seedValue * 9301 + 49297) % 233280
    return seedValue / 233280
  }
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector
}

/**
 * Create a complete test scenario with user, repository, and opportunities
 */
export function createUserWithRepositoryAndOpportunities(config?: {
  userOverrides?: Partial<UserFactoryInput>
  repoOverrides?: Partial<RepositoryFactoryInput>
  opportunityCount?: number
  opportunityOverrides?: Partial<OpportunityFactoryInput>
}) {
  const { userOverrides, repoOverrides, opportunityCount = 3, opportunityOverrides } = config || {}

  const user = createUser(userOverrides)
  const repository = createRepository(repoOverrides)
  const opportunities = createManyOpportunities(opportunityCount, {
    repository_id: repository.id ?? 'default-repo-id',
    ...opportunityOverrides,
  })

  return { user, repository, opportunities }
}

/**
 * Create semantically similar opportunities for vector search testing
 */
export function createSimilarOpportunities(
  baseOpportunity: OpportunityFactoryOutput,
  count: number
) {
  const baseEmbedding = baseOpportunity.title_embedding
  if (!baseEmbedding) {
    throw new Error('Base opportunity must have title_embedding for similarity generation')
  }

  const baseDescriptionEmbedding = baseOpportunity.description_embedding
  if (!baseDescriptionEmbedding) {
    throw new Error('Base opportunity must have description_embedding for similarity generation')
  }

  const similarEmbeddings = generateSimilarEmbeddings(baseEmbedding, count, 0.85)

  return similarEmbeddings.map((embedding, index) =>
    createOpportunity({
      repository_id: baseOpportunity.repository_id,
      title: `Similar Issue ${index + 1}`,
      type: baseOpportunity.type,
      difficulty: baseOpportunity.difficulty,
      title_embedding: embedding,
      description_embedding: generateSimilarEmbeddings(baseDescriptionEmbedding, 1, 0.8)[0],
    })
  )
}

/**
 * Create a diverse set of opportunities with different characteristics
 */
export function createDiverseOpportunities(repositoryId: string, count = 10) {
  const types: Array<OpportunityFactoryInput['type']> = [
    'bug_fix',
    'feature',
    'documentation',
    'test',
    'refactor',
    'security',
  ]
  const difficulties: Array<OpportunityFactoryInput['difficulty']> = [
    'beginner',
    'intermediate',
    'advanced',
    'expert',
  ]

  return Array.from({ length: count }, (_, index) => {
    const type = types[index % types.length] ?? 'bug_fix'
    const difficulty = difficulties[index % difficulties.length] ?? 'intermediate'

    return createOpportunity({
      repository_id: repositoryId,
      type,
      difficulty,
      good_first_issue: index % 4 === 0, // Every 4th opportunity
      help_wanted: index % 3 === 0, // Every 3rd opportunity
      priority: Math.floor(Math.random() * 100),
      estimated_hours: Math.floor(Math.random() * 20) + 1,
    })
  })
}

/**
 * Reset factory counters (useful for test isolation)
 */
export function resetFactoryCounters(): void {
  resetUserFactoryCounter()
  resetRepositoryFactoryCounter()
  resetOpportunityFactoryCounter()
}
