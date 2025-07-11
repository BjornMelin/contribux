/**
 * Mock for database config
 */

export const getDatabaseUrl = () => {
  return process.env.DATABASE_URL || 'postgresql://test:test@localhost/test'
}

export const getDatabaseUrlForEnvironment = () => {
  return process.env.DATABASE_URL || 'postgresql://test:test@localhost/test'
}

export const dbConfig = {
  connectionString: 'postgresql://test:test@localhost/test',
  poolSize: 5,
  maxConnections: 20,
  idleTimeout: 30000,
}
