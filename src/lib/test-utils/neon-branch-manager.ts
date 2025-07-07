/**
 * Neon Branch Manager for Test Isolation
 *
 * This utility manages Neon database branches for test isolation,
 * replacing Docker-based test infrastructure with serverless branching.
 *
 * Benefits:
 * - No local Docker requirement
 * - Faster test startup (branches create in seconds)
 * - Automatic cleanup
 * - Zero maintenance
 * - Cost-effective for solo developer
 */

import { config } from 'dotenv'
import { afterEach, beforeEach, expect } from 'vitest'
import type {
  CreateBranchResponse,
  GetBranchResponse,
  ListBranchesResponse,
  NeonBranchData,
  NeonEndpointData,
} from '../../types/neon-api'
import { isValidBranchData, isValidCreateBranchResponse } from '../../types/neon-api'

// Load environment variables
config({ path: '.env.test' })

export interface NeonBranchConfig {
  apiKey: string
  projectId: string
  baseUrl?: string
}

export interface NeonBranch {
  id: string
  name: string
  connectionString: string
  created_at: string
  parent_id?: string
}

export interface CreateBranchOptions {
  name: string
  parent_id?: string
  parent_lsn?: string
  parent_timestamp?: string
}

export class NeonBranchManager {
  private apiKey: string
  private projectId: string
  private baseUrl: string
  private activeBranches: Map<string, NeonBranch> = new Map()

  constructor(config: NeonBranchConfig) {
    this.apiKey = config.apiKey
    this.projectId = config.projectId
    this.baseUrl = config.baseUrl || 'https://console.neon.tech/api/v2'

    if (!this.apiKey) {
      throw new Error('NEON_API_KEY is required for branch management')
    }
    if (!this.projectId) {
      throw new Error('NEON_PROJECT_ID is required for branch management')
    }
  }

  /**
   * Create a new branch for test isolation
   */
  async createBranch(options: CreateBranchOptions): Promise<NeonBranch> {
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/branches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        branch: {
          name: options.name,
          parent_id: options.parent_id,
          parent_lsn: options.parent_lsn,
          parent_timestamp: options.parent_timestamp,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create branch: ${response.status} - ${error}`)
    }

    const data: CreateBranchResponse = await response.json()

    if (!isValidCreateBranchResponse(data)) {
      throw new Error('Invalid response format from Neon API')
    }

    const branch: NeonBranch = {
      id: data.branch.id,
      name: data.branch.name,
      connectionString: this.buildConnectionString(data),
      created_at: data.branch.created_at,
      ...(data.branch.parent_id && { parent_id: data.branch.parent_id }),
    }

    this.activeBranches.set(branch.id, branch)
    return branch
  }

  /**
   * Delete a branch after test completion
   */
  async deleteBranch(branchId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/projects/${this.projectId}/branches/${branchId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok && response.status !== 404) {
      const error = await response.text()
      throw new Error(`Failed to delete branch: ${response.status} - ${error}`)
    }

    this.activeBranches.delete(branchId)
  }

  /**
   * Get branch details
   */
  async getBranch(branchId: string): Promise<NeonBranch | null> {
    const response = await fetch(
      `${this.baseUrl}/projects/${this.projectId}/branches/${branchId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      const error = await response.text()
      throw new Error(`Failed to get branch: ${response.status} - ${error}`)
    }

    const data: GetBranchResponse = await response.json()
    return {
      id: data.branch.id,
      name: data.branch.name,
      connectionString: this.buildConnectionString(data),
      created_at: data.branch.created_at,
      ...(data.branch.parent_id && { parent_id: data.branch.parent_id }),
    }
  }

  /**
   * List all branches
   */
  async listBranches(): Promise<NeonBranch[]> {
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/branches`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to list branches: ${response.status} - ${error}`)
    }

    const data: ListBranchesResponse = await response.json()
    return data.branches.map((b: NeonBranchData) => {
      if (!isValidBranchData(b)) {
        throw new Error(`Invalid branch data received: ${JSON.stringify(b)}`)
      }

      return {
        id: b.id,
        name: b.name,
        connectionString: this.buildConnectionString({ branch: b, endpoints: data.endpoints }),
        created_at: b.created_at,
        ...(b.parent_id && { parent_id: b.parent_id }),
      }
    })
  }

  /**
   * Clean up all test branches created by this manager
   */
  async cleanupAllBranches(): Promise<void> {
    const branches = Array.from(this.activeBranches.keys())
    await Promise.all(
      branches.map(branchId =>
        this.deleteBranch(branchId).catch(_err => {
          // Ignore errors during cleanup
        })
      )
    )
  }

  /**
   * Create a test-specific branch with automatic cleanup
   */
  async withTestBranch<T>(
    testName: string,
    fn: (connectionString: string) => Promise<T>
  ): Promise<T> {
    const timestamp = Date.now()
    const safeName = testName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
    const branchName = `test-${safeName}-${timestamp}`

    const branch = await this.createBranch({ name: branchName })

    try {
      return await fn(branch.connectionString)
    } finally {
      await this.deleteBranch(branch.id)
    }
  }

  /**
   * Build connection string from API response
   */
  private buildConnectionString(
    data:
      | CreateBranchResponse
      | GetBranchResponse
      | { branch: NeonBranchData; endpoints: NeonEndpointData[] }
  ): string {
    const endpoint = data.endpoints?.[0]
    if (!endpoint) {
      throw new Error('No endpoint found in branch data')
    }

    const { host } = endpoint
    const password =
      ('connection_uris' in data
        ? data.connection_uris?.[0]?.connection_parameters?.password
        : undefined) || process.env.NEON_DATABASE_PASSWORD

    if (!password) {
      throw new Error('Database password not found')
    }

    const database = ('databases' in data ? data.databases?.[0]?.name : undefined) || 'neondb'
    const role = ('roles' in data ? data.roles?.[0]?.name : undefined) || 'neondb_owner'

    return `postgresql://${role}:${password}@${host}/${database}?sslmode=require&connect_timeout=10&application_name=contribux-tests`
  }

  /**
   * Generate a unique branch name for a test
   */
  static generateTestBranchName(testFile: string, testName?: string): string {
    const timestamp = Date.now()
    const fileBase = testFile.replace(/\.(test|spec)\.(ts|js)$/, '').replace(/[^a-zA-Z0-9]/g, '-')
    const testBase = testName ? `-${testName.replace(/[^a-zA-Z0-9]/g, '-')}` : ''
    return `test-${fileBase}${testBase}-${timestamp}`.toLowerCase().slice(0, 63)
  }
}

// Singleton instance for test usage
let branchManager: NeonBranchManager | null = null

/**
 * Get or create the global branch manager instance
 */
export function getBranchManager(): NeonBranchManager {
  if (!branchManager) {
    const apiKey = process.env.NEON_API_KEY
    const projectId = process.env.NEON_PROJECT_ID

    if (!apiKey || !projectId) {
      throw new Error('NEON_API_KEY and NEON_PROJECT_ID environment variables are required')
    }

    branchManager = new NeonBranchManager({
      apiKey,
      projectId,
    })
  }
  return branchManager
}

/**
 * Test helper to create an isolated database branch
 */
export async function createTestBranch(testName: string): Promise<NeonBranch> {
  const manager = getBranchManager()
  return manager.createBranch({
    name: NeonBranchManager.generateTestBranchName('test', testName),
  })
}

/**
 * Test helper to cleanup a branch
 */
export async function cleanupTestBranch(branchId: string): Promise<void> {
  const manager = getBranchManager()
  await manager.deleteBranch(branchId)
}

/**
 * Vitest/Jest helper for automatic branch lifecycle management
 */
export function setupNeonTestBranch() {
  let currentBranch: NeonBranch | null = null

  beforeEach(async () => {
    const testName = expect.getState().currentTestName || 'unknown'
    currentBranch = await createTestBranch(testName)

    // Set the branch connection string as DATABASE_URL for the test
    process.env.DATABASE_URL = currentBranch.connectionString
  })

  afterEach(async () => {
    if (currentBranch) {
      await cleanupTestBranch(currentBranch.id)
      currentBranch = null
    }
  })

  return {
    getBranch: () => currentBranch,
    getConnectionString: () => currentBranch?.connectionString,
  }
}
