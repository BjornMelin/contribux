import { neon } from '@neondatabase/serverless';

// Database configuration with Neon built-in pooling
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create Neon client with serverless pooling
export const sql = neon(connectionString);

// Branch-specific connections for different environments
export const getDatabaseUrl = (branch: 'main' | 'dev' | 'test' = 'main') => {
  switch (branch) {
    case 'dev':
      return process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;
    case 'test':
      return process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
    default:
      return process.env.DATABASE_URL;
  }
};

// Vector search configuration
export const vectorConfig = {
  efSearch: parseInt(process.env.HNSW_EF_SEARCH || '200'),
  similarityThreshold: parseFloat(process.env.VECTOR_SIMILARITY_THRESHOLD || '0.7'),
  textWeight: parseFloat(process.env.HYBRID_SEARCH_TEXT_WEIGHT || '0.3'),
  vectorWeight: parseFloat(process.env.HYBRID_SEARCH_VECTOR_WEIGHT || '0.7'),
};

// Database branches configuration
export const dbBranches = {
  main: process.env.DB_MAIN_BRANCH || 'br-summer-art-a864udht',
  dev: process.env.DB_DEV_BRANCH || 'br-cold-scene-a86p5ixr', 
  test: process.env.DB_TEST_BRANCH || 'br-fancy-pine-a8imumhr',
};

export const dbConfig = {
  projectId: process.env.DB_PROJECT_ID || 'soft-dew-27794389',
  poolMin: parseInt(process.env.DB_POOL_MIN || '2'),
  poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
  poolIdleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '10000'),
};
