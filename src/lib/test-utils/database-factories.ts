/**
 * Modern Database Test Factories
 *
 * Provides realistic test data factories using modern patterns.
 * Supports both PGlite (fast) and Neon branching (staging) modes.
 */

import { faker } from '@faker-js/faker'
import type { NeonQueryFunction } from '@neondatabase/serverless'

export interface TestUser {
  id?: string
  github_id: string
  github_username: string
  email: string
  name: string
  avatar_url: string
  preferences: Record<string, unknown>
  created_at?: Date
  updated_at?: Date
}

export interface TestRepository {
  id?: string
  github_id: string
  name: string
  full_name: string
  description: string
  url: string
  language: string
  stars: number
  forks: number
  health_score: number
  last_analyzed: Date
  created_at?: Date
}

export interface TestOpportunity {
  id?: string
  repository_id: string
  issue_number: number
  title: string
  description: string
  labels: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimated_hours: number
  skills_required: string[]
  ai_analysis: Record<string, unknown>
  score: number
  embedding?: number[]
  created_at?: Date
}

/**
 * User factory for creating test users
 */
export class UserFactory {
  private sql: NeonQueryFunction<false, false>
  private usedUsernames: Set<string> = new Set()
  private usedEmails: Set<string> = new Set()

  constructor(sql: NeonQueryFunction<false, false>) {
    this.sql = sql
  }

  /**
   * Create a test user with realistic data
   */
  async create(overrides: Partial<TestUser> = {}): Promise<TestUser> {
    // Generate unique username
    let github_username = overrides.github_username || faker.internet.username()
    
    // If username was explicitly provided, make it unique by adding timestamp suffix if already used
    if (overrides.github_username && this.usedUsernames.has(github_username)) {
      github_username = `${overrides.github_username}_${Date.now()}_${faker.number.int({ min: 1, max: 999 })}`
    }
    
    // For generated usernames, use original collision detection
    while (!overrides.github_username && this.usedUsernames.has(github_username)) {
      github_username = faker.internet.username() + '_' + faker.number.int({ min: 1, max: 999 })
    }
    
    this.usedUsernames.add(github_username)
    
    // Generate unique email
    let email = overrides.email || faker.internet.email()
    while (this.usedEmails.has(email)) {
      email = faker.internet.email()
    }
    this.usedEmails.add(email)
    
    const userData: TestUser = {
      github_id: faker.number.int({ min: 1000000, max: 9999999 }).toString(),
      github_username,
      email,
      name: faker.person.fullName(),
      avatar_url: faker.image.avatar(),
      preferences: {
        languages: faker.helpers.arrayElements(['TypeScript', 'Python', 'Go', 'Rust'], 2),
        difficulty: faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced']),
        notifications: {
          email: true,
          push: false,
          frequency: 'weekly',
        },
      },
      ...overrides,
    }

    const [user] = await this.sql`
      INSERT INTO users (
        github_id, github_username, email, name, avatar_url, preferences
      ) VALUES (
        ${userData.github_id}, ${userData.github_username}, ${userData.email},
        ${userData.name}, ${userData.avatar_url}, ${JSON.stringify(userData.preferences)}
      ) RETURNING *
    `

    return user as TestUser
  }

  /**
   * Create multiple users
   */
  async createMany(count: number, overrides: Partial<TestUser> = {}): Promise<TestUser[]> {
    const users: TestUser[] = []
    for (let i = 0; i < count; i++) {
      users.push(await this.create(overrides))
    }
    return users
  }

  /**
   * Create user with specific skills
   */
  async createWithSkills(skills: string[], overrides: Partial<TestUser> = {}): Promise<TestUser> {
    const user = await this.create(overrides)

    // Add skills
    for (const skill of skills) {
      await this.sql`
        INSERT INTO user_skills (user_id, skill_name, proficiency_level)
        VALUES (${user.id}, ${skill}, ${faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced'])})
      `
    }

    return user
  }
}

/**
 * Repository factory for creating test repositories
 */
export class RepositoryFactory {
  private sql: NeonQueryFunction<false, false>
  private usedGithubIds: Set<string> = new Set()

  constructor(sql: NeonQueryFunction<false, false>) {
    this.sql = sql
  }

  /**
   * Create a test repository with realistic data
   */
  async create(overrides: Partial<TestRepository> = {}): Promise<TestRepository> {
    // Generate unique github_id
    let github_id = overrides.github_id || faker.number.int({ min: 100000, max: 999999 }).toString()
    while (this.usedGithubIds.has(github_id)) {
      github_id = faker.number.int({ min: 100000, max: 999999 }).toString()
    }
    this.usedGithubIds.add(github_id)
    
    const repoData: TestRepository = {
      github_id,
      name: faker.lorem.slug(),
      full_name: `${faker.internet.username()}/${faker.lorem.slug()}`,
      description: faker.lorem.sentence(),
      url: faker.internet.url(),
      language: faker.helpers.arrayElement(['TypeScript', 'Python', 'Go', 'Rust', 'JavaScript']),
      stars: faker.number.int({ min: 10, max: 50000 }),
      forks: faker.number.int({ min: 1, max: 1000 }),
      health_score: faker.number.float({ min: 0.1, max: 1.0, fractionDigits: 2 }),
      last_analyzed: faker.date.recent(),
      ...overrides,
    }

    const [repo] = await this.sql`
      INSERT INTO repositories (
        github_id, name, full_name, description, url, language,
        stars, forks, health_score, last_analyzed
      ) VALUES (
        ${repoData.github_id}, ${repoData.name}, ${repoData.full_name},
        ${repoData.description}, ${repoData.url}, ${repoData.language},
        ${repoData.stars}, ${repoData.forks}, ${repoData.health_score}, ${repoData.last_analyzed}
      ) RETURNING *
    `

    return repo as TestRepository
  }

  /**
   * Create multiple repositories
   */
  async createMany(
    count: number,
    overrides: Partial<TestRepository> = {}
  ): Promise<TestRepository[]> {
    const repos: TestRepository[] = []
    for (let i = 0; i < count; i++) {
      repos.push(await this.create(overrides))
    }
    return repos
  }

  /**
   * Create repository with specific language
   */
  async createWithLanguage(
    language: string,
    overrides: Partial<TestRepository> = {}
  ): Promise<TestRepository> {
    return this.create({ language, ...overrides })
  }

  /**
   * Create popular repository (high stars)
   */
  async createPopular(overrides: Partial<TestRepository> = {}): Promise<TestRepository> {
    return this.create({
      stars: faker.number.int({ min: 10000, max: 100000 }),
      forks: faker.number.int({ min: 1000, max: 10000 }),
      health_score: faker.number.float({ min: 0.8, max: 1.0, fractionDigits: 2 }),
      ...overrides,
    })
  }
}

/**
 * Opportunity factory for creating test opportunities
 */
export class OpportunityFactory {
  private sql: NeonQueryFunction<false, false>
  private issueNumberCounters: Map<string, number> = new Map()

  constructor(sql: NeonQueryFunction<false, false>) {
    this.sql = sql
  }

  /**
   * Create a test opportunity with realistic data
   */
  async create(overrides: Partial<TestOpportunity> = {}): Promise<TestOpportunity> {
    const repositoryId = overrides.repository_id || (await this.getRandomRepositoryId())
    
    // Get next unique issue number for this repository
    const issueNumber = overrides.issue_number || this.getNextIssueNumber(repositoryId)
    
    const oppData: TestOpportunity = {
      repository_id: repositoryId,
      issue_number: issueNumber,
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraphs(2),
      labels: faker.helpers.arrayElements(
        ['bug', 'feature', 'documentation', 'good first issue', 'help wanted'],
        2
      ),
      difficulty: faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced']),
      estimated_hours: faker.number.int({ min: 1, max: 40 }),
      skills_required: faker.helpers.arrayElements(
        ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'CSS'],
        3
      ),
      ai_analysis: {
        complexity_score: faker.number.float({ min: 0.1, max: 1.0, fractionDigits: 2 }),
        learning_potential: faker.number.float({ min: 0.1, max: 1.0, fractionDigits: 2 }),
        business_impact: faker.number.float({ min: 0.1, max: 1.0, fractionDigits: 2 }),
        recommendation: faker.lorem.sentence(),
      },
      score: faker.number.float({ min: 0.1, max: 1.0, fractionDigits: 2 }),
      embedding: Array.from({ length: 1536 }, () =>
        faker.number.float({ min: -1, max: 1, fractionDigits: 6 })
      ),
      ...overrides,
    }

    const [opportunity] = await this.sql`
      INSERT INTO opportunities (
        repository_id, issue_number, title, description, labels,
        difficulty, estimated_hours, skills_required, ai_analysis, score, embedding
      ) VALUES (
        ${oppData.repository_id}, ${oppData.issue_number}, ${oppData.title},
        ${oppData.description}, ${JSON.stringify(oppData.labels)}, ${oppData.difficulty},
        ${oppData.estimated_hours}, ${JSON.stringify(oppData.skills_required)},
        ${JSON.stringify(oppData.ai_analysis)}, ${oppData.score}, ${JSON.stringify(oppData.embedding)}
      ) RETURNING *
    `

    return opportunity as TestOpportunity
  }

  /**
   * Create multiple opportunities
   */
  async createMany(
    count: number,
    overrides: Partial<TestOpportunity> = {}
  ): Promise<TestOpportunity[]> {
    const opportunities: TestOpportunity[] = []
    for (let i = 0; i < count; i++) {
      opportunities.push(await this.create(overrides))
    }
    return opportunities
  }

  /**
   * Create opportunity with specific difficulty
   */
  async createWithDifficulty(
    difficulty: 'beginner' | 'intermediate' | 'advanced',
    overrides: Partial<TestOpportunity> = {}
  ): Promise<TestOpportunity> {
    return this.create({ difficulty, ...overrides })
  }

  /**
   * Create opportunity for specific repository
   */
  async createForRepository(
    repositoryId: string,
    overrides: Partial<TestOpportunity> = {}
  ): Promise<TestOpportunity> {
    return this.create({ repository_id: repositoryId, ...overrides })
  }

  /**
   * Get next unique issue number for repository
   */
  private getNextIssueNumber(repositoryId: string): number {
    const current = this.issueNumberCounters.get(repositoryId) || 0
    const next = current + 1
    this.issueNumberCounters.set(repositoryId, next)
    return next
  }

  /**
   * Get random repository ID for opportunity
   */
  private async getRandomRepositoryId(): Promise<string> {
    const [repo] = await this.sql`
      SELECT id FROM repositories ORDER BY RANDOM() LIMIT 1
    `
    return repo?.id || 'test-repo-id'
  }
}

/**
 * Complete test scenario factory
 */
export class ScenarioFactory {
  private userFactory: UserFactory
  private repositoryFactory: RepositoryFactory
  private opportunityFactory: OpportunityFactory

  constructor(sql: NeonQueryFunction<false, false>) {
    this.userFactory = new UserFactory(sql)
    this.repositoryFactory = new RepositoryFactory(sql)
    this.opportunityFactory = new OpportunityFactory(sql)
  }

  /**
   * Create a complete test scenario with users, repos, and opportunities
   */
  async createCompleteScenario() {
    // Create users
    const users = await this.userFactory.createMany(3)

    // Create repositories
    const repositories = await this.repositoryFactory.createMany(5)

    // Create opportunities for each repository
    const opportunities: TestOpportunity[] = []
    for (const repo of repositories) {
      if (!repo.id) {
        throw new Error('Repository must have an id after creation')
      }
      const repoOpportunities = await this.opportunityFactory.createMany(
        faker.number.int({ min: 2, max: 5 }),
        { repository_id: repo.id }
      )
      opportunities.push(...repoOpportunities)
    }

    return {
      users,
      repositories,
      opportunities,
    }
  }

  /**
   * Create AI/ML testing scenario with vector data
   */
  async createVectorTestScenario() {
    const repo = await this.repositoryFactory.create({
      name: 'ml-test-repo',
      language: 'Python',
    })

    if (!repo.id) {
      throw new Error('Repository must have an id after creation')
    }

    // Create opportunities with similar embeddings for testing similarity search
    const similarEmbedding = Array.from({ length: 1536 }, () => 0.5)
    const opportunities = await Promise.all([
      this.opportunityFactory.create({
        repository_id: repo.id,
        title: 'Implement neural network',
        embedding: similarEmbedding,
        skills_required: ['Python', 'TensorFlow', 'Machine Learning'],
      }),
      this.opportunityFactory.create({
        repository_id: repo.id,
        title: 'Add data preprocessing',
        embedding: similarEmbedding.map(v => v + 0.1), // Slightly different
        skills_required: ['Python', 'Pandas', 'Data Science'],
      }),
      this.opportunityFactory.create({
        repository_id: repo.id,
        title: 'Create visualization dashboard',
        embedding: Array.from({ length: 1536 }, () => -0.5), // Very different
        skills_required: ['JavaScript', 'D3.js', 'React'],
      }),
    ])

    return {
      repository: repo,
      opportunities,
    }
  }

  /**
   * Create performance testing scenario with large dataset
   */
  async createPerformanceTestScenario() {
    console.log('🔄 Creating performance test scenario...')

    // Create multiple repositories
    const repositories = await this.repositoryFactory.createMany(20)
    console.log(`✅ Created ${repositories.length} repositories`)

    // Create many opportunities for performance testing
    const opportunities: TestOpportunity[] = []
    for (const repo of repositories) {
      if (!repo.id) {
        throw new Error('Repository must have an id after creation')
      }
      const repoOpportunities = await this.opportunityFactory.createMany(50, {
        repository_id: repo.id,
      })
      opportunities.push(...repoOpportunities)
    }
    console.log(`✅ Created ${opportunities.length} opportunities`)

    return {
      repositories,
      opportunities,
    }
  }

  get users() {
    return this.userFactory
  }
  get repositories() {
    return this.repositoryFactory
  }
  get opportunities() {
    return this.opportunityFactory
  }
}

/**
 * Factory manager for easy access
 */
export function createTestFactories(sql: NeonQueryFunction<false, false>) {
  return new ScenarioFactory(sql)
}
