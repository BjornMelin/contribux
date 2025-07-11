/**
 * Enhanced Test Database Manager
 * Provides isolated database environments for different test types
 */

import { spawn } from 'node:child_process'
import {
  type TestEnvironmentConfig,
  getTestDatabaseUrl,
  createTestEnvironmentName,
} from './test-environment.config'

interface DatabaseConnection {
  url: string
  name: string
  poolConfig: {
    min: number
    max: number
    idleTimeout: number
  }
}

interface MigrationResult {
  success: boolean
  error?: string
  migrationsRun?: string[]
}

/**
 * Enhanced Test Database Manager with Environment-Specific Configuration
 */
export class EnhancedTestDatabaseManager {
  private static instances = new Map<string, EnhancedTestDatabaseManager>()
  private connections = new Map<string, DatabaseConnection>()
  private cleanupTasks: Array<() => Promise<void>> = []

  private constructor(private envConfig: TestEnvironmentConfig) {}

  /**
   * Get singleton instance for test environment type
   */
  static getInstance(envConfig: TestEnvironmentConfig): EnhancedTestDatabaseManager {
    const key = envConfig.type
    if (!EnhancedTestDatabaseManager.instances.has(key)) {
      EnhancedTestDatabaseManager.instances.set(key, new EnhancedTestDatabaseManager(envConfig))
    }
    return EnhancedTestDatabaseManager.instances.get(key)!
  }

  /**
   * Setup test database environment
   */
  async setup(): Promise<DatabaseConnection> {
    if (!this.envConfig.useDatabase) {
      throw new Error(`Database not enabled for ${this.envConfig.type} tests`)
    }

    const connectionKey = `${this.envConfig.type}-${Date.now()}`

    // Create isolated database connection
    const connection: DatabaseConnection = {
      url: getTestDatabaseUrl(this.envConfig),
      name: createTestEnvironmentName(this.envConfig),
      poolConfig: this.envConfig.database.pool,
    }

    // Create test database if using local PostgreSQL
    if (connection.url.includes('localhost')) {
      await this.createTestDatabase(connection)
    }

    // Run migrations based on strategy
    if (this.envConfig.database.migrations !== 'none') {
      await this.runMigrations(connection)
    }

    // Store connection for cleanup
    this.connections.set(connectionKey, connection)

    // Setup automatic cleanup
    if (this.envConfig.database.autoCleanup) {
      this.cleanupTasks.push(async () => {
        await this.cleanupDatabase(connection)
      })
    }

    // Set environment variables
    process.env.DATABASE_URL = connection.url
    process.env.DATABASE_URL_TEST = connection.url

    return connection
  }

  /**
   * Create isolated test database
   */
  private async createTestDatabase(connection: DatabaseConnection): Promise<void> {
    const dbName = this.extractDatabaseName(connection.url)

    try {
      // Create database using PostgreSQL command
      const createResult = await this.executeCommand(
        'createdb',
        ['-h', 'localhost', '-U', 'test', dbName],
        { env: { PGPASSWORD: 'test' } }
      )

      if (!createResult.success) {
        // Database might already exist, which is fine for some test scenarios
        console.warn(`Failed to create database ${dbName}:`, createResult.error)
      }
    } catch (error) {
      console.warn(`Database creation failed for ${dbName}:`, error)
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(connection: DatabaseConnection): Promise<MigrationResult> {
    const strategy = this.envConfig.database.migrations

    try {
      let result: MigrationResult

      switch (strategy) {
        case 'fresh':
          // Drop and recreate all tables
          result = await this.runFreshMigrations(connection)
          break
        case 'incremental':
          // Run pending migrations only
          result = await this.runIncrementalMigrations(connection)
          break
        default:
          result = { success: true }
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown migration error',
      }
    }
  }

  /**
   * Run fresh migrations (drop and recreate)
   */
  private async runFreshMigrations(connection: DatabaseConnection): Promise<MigrationResult> {
    const migrationScript = 'scripts/db-migrations/run-migrations-enhanced.cjs'

    const resetResult = await this.executeCommand('node', [migrationScript, 'reset'], {
      env: {
        ...process.env,
        DATABASE_URL: connection.url,
        NODE_ENV: 'test',
      },
    })

    if (!resetResult.success) {
      return { success: false, error: resetResult.error }
    }

    const runResult = await this.executeCommand('node', [migrationScript, 'run'], {
      env: {
        ...process.env,
        DATABASE_URL: connection.url,
        NODE_ENV: 'test',
      },
    })

    return {
      success: runResult.success,
      error: runResult.error,
      migrationsRun: ['fresh_migration_reset', 'fresh_migration_run'],
    }
  }

  /**
   * Run incremental migrations
   */
  private async runIncrementalMigrations(connection: DatabaseConnection): Promise<MigrationResult> {
    const migrationScript = 'scripts/db-migrations/run-migrations-enhanced.cjs'

    const result = await this.executeCommand('node', [migrationScript, 'run'], {
      env: {
        ...process.env,
        DATABASE_URL: connection.url,
        NODE_ENV: 'test',
      },
    })

    return {
      success: result.success,
      error: result.error,
      migrationsRun: ['incremental_migrations'],
    }
  }

  /**
   * Cleanup test database
   */
  async cleanup(): Promise<void> {
    // Run all cleanup tasks
    for (const cleanupTask of this.cleanupTasks) {
      try {
        await cleanupTask()
      } catch (error) {
        console.warn('Database cleanup task failed:', error)
      }
    }

    // Clear connections
    this.connections.clear()
    this.cleanupTasks = []

    // Clear environment variables
    process.env.DATABASE_URL = undefined
    process.env.DATABASE_URL_TEST = undefined
  }

  /**
   * Cleanup specific database
   */
  private async cleanupDatabase(connection: DatabaseConnection): Promise<void> {
    if (connection.url.includes('localhost')) {
      const dbName = this.extractDatabaseName(connection.url)

      try {
        await this.executeCommand(
          'dropdb',
          ['-h', 'localhost', '-U', 'test', '--if-exists', dbName],
          { env: { PGPASSWORD: 'test' } }
        )
      } catch (error) {
        console.warn(`Failed to drop test database ${dbName}:`, error)
      }
    }
  }

  /**
   * Get current database connections
   */
  getConnections(): DatabaseConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<{ healthy: boolean; connections: number; error?: string }> {
    try {
      const connections = this.getConnections()

      // Basic connection test for local databases
      for (const connection of connections) {
        if (connection.url.includes('localhost')) {
          const testResult = await this.executeCommand(
            'psql',
            [connection.url, '-c', 'SELECT 1;'],
            { timeout: 5000 }
          )

          if (!testResult.success) {
            return {
              healthy: false,
              connections: connections.length,
              error: `Connection test failed: ${testResult.error}`,
            }
          }
        }
      }

      return {
        healthy: true,
        connections: connections.length,
      }
    } catch (error) {
      return {
        healthy: false,
        connections: 0,
        error: error instanceof Error ? error.message : 'Unknown health check error',
      }
    }
  }

  /**
   * Extract database name from URL
   */
  private extractDatabaseName(url: string): string {
    const match = url.match(/\/([^/?]+)(\?|$)/)
    return match ? match[1] : 'unknown'
  }

  /**
   * Execute shell command with proper error handling
   */
  private async executeCommand(
    command: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv; timeout?: number } = {}
  ): Promise<{ success: boolean; error?: string; stdout?: string }> {
    return new Promise(resolve => {
      const proc = spawn(command, args, {
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', data => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', data => {
        stderr += data.toString()
      })

      // Handle timeout
      const timeout = options.timeout || 30000
      const timer = setTimeout(() => {
        proc.kill()
        resolve({
          success: false,
          error: `Command timed out after ${timeout}ms`,
        })
      }, timeout)

      proc.on('close', code => {
        clearTimeout(timer)
        resolve({
          success: code === 0,
          error: code !== 0 ? stderr || `Command failed with code ${code}` : undefined,
          stdout: stdout,
        })
      })

      proc.on('error', error => {
        clearTimeout(timer)
        resolve({
          success: false,
          error: error.message,
        })
      })
    })
  }

  /**
   * Static cleanup for all instances
   */
  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(EnhancedTestDatabaseManager.instances.values()).map(
      instance => instance.cleanup()
    )

    await Promise.allSettled(cleanupPromises)
    EnhancedTestDatabaseManager.instances.clear()
  }
}

/**
 * Create database manager for test environment
 */
export function createTestDatabaseManager(
  envConfig: TestEnvironmentConfig
): EnhancedTestDatabaseManager {
  return EnhancedTestDatabaseManager.getInstance(envConfig)
}

export default EnhancedTestDatabaseManager
