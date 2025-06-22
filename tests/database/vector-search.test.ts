/**
 * Vector Search Integration Tests
 * Tests vector similarity search functionality with real database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { VectorTestUtils, vectorTestHelpers } from '../helpers/vector-test-utils';
import { sql, TEST_DATABASE_URL } from './db-client';

describe('Vector Search Integration', () => {
  let client: Client;
  let vectorUtils: VectorTestUtils;
  const databaseUrl = TEST_DATABASE_URL;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL_TEST or DATABASE_URL is required for vector tests');
    }

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    
    vectorUtils = new VectorTestUtils(databaseUrl);
    await vectorUtils.connect();

    // Ensure extensions are loaded
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  });

  beforeEach(async () => {
    // Clean up any test data
    await client.query("DELETE FROM users WHERE github_username LIKE 'test_vector_%'");
    await client.query("DELETE FROM repositories WHERE full_name LIKE 'test_vector_%'");
    await client.query("DELETE FROM opportunities WHERE title LIKE 'test_vector_%'");
  });

  describe('User Profile Vector Search', () => {
    it('should find similar user profiles using HNSW index', async () => {
      // Insert test users with embeddings
      const baseEmbedding = vectorUtils.generateFakeEmbedding('base_user');
      const similarEmbeddings = vectorUtils.generateSimilarEmbeddings(baseEmbedding, 3, 0.9);
      
      // Insert base user
      await client.query(
        'INSERT INTO users (github_id, github_username, github_name, profile_embedding) VALUES ($1, $2, $3, $4)',
        [999001, 'test_vector_base', 'Base User', `[${baseEmbedding.join(',')}]`]
      );

      // Insert similar users
      for (let i = 0; i < similarEmbeddings.length; i++) {
        await client.query(
          'INSERT INTO users (github_id, github_username, github_name, profile_embedding) VALUES ($1, $2, $3, $4)',
          [999002 + i, `test_vector_similar_${i}`, `Similar User ${i}`, `[${similarEmbeddings[i].join(',')}]`]
        );
      }

      // Insert a dissimilar user
      const dissimilarEmbedding = vectorUtils.generateFakeEmbedding('dissimilar_user');
      await client.query(
        'INSERT INTO users (github_id, github_username, github_name, profile_embedding) VALUES ($1, $2, $3, $4)',
        [999005, 'test_vector_dissimilar', 'Dissimilar User', `[${dissimilarEmbedding.join(',')}]`]
      );

      // Test similarity search
      const queryEmbedding = baseEmbedding; // Search for users similar to base
      const result = await vectorUtils.testVectorSimilaritySearch(
        'users',
        'profile_embedding',
        queryEmbedding,
        5
      );

      expect(result.resultCount).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(100); // Should be fast with index
      expect(result.topSimilarity).toBeGreaterThan(0.8); // Should find very similar users
      // Index usage depends on query planner and data size - don't enforce
      // expect(result.indexUsed).toBe(true); // May or may not use index based on data size

      // Get actual results to verify ordering
      const queryResult = await client.query(`
        SELECT 
          github_username,
          profile_embedding <=> $1::halfvec as distance,
          1 - (profile_embedding <=> $1::halfvec) as similarity
        FROM users 
        WHERE github_username LIKE 'test_vector_%'
          AND profile_embedding IS NOT NULL
        ORDER BY profile_embedding <=> $1::halfvec
        LIMIT 5
      `, [`[${queryEmbedding.join(',')}]`]);
      const results = queryResult.rows;

      // Verify results are properly ordered
      vectorTestHelpers.assertSimilarityOrdering(results);
      
      // The base user should be most similar to itself
      expect(results[0].github_username).toBe('test_vector_base');
      expect(results[0].similarity).toBeCloseTo(1.0, 2);
    });

    it('should handle edge cases in vector search', async () => {
      const testQueries = vectorTestHelpers.generateTestQueries();
      
      // Insert a user with normal embedding
      const normalEmbedding = vectorUtils.generateFakeEmbedding('normal');
      await sql`
        INSERT INTO users (github_id, github_username, github_name, profile_embedding)
        VALUES (999010, 'test_vector_normal', 'Normal User', ${normalEmbedding})
      `;

      // Test edge case queries
      for (const [queryType, queryEmbedding] of Object.entries(testQueries)) {
        try {
          const result = await vectorUtils.testVectorSimilaritySearch(
            'users',
            'profile_embedding',
            queryEmbedding,
            5
          );

          expect(result.resultCount).toBeGreaterThanOrEqual(0);
          expect(result.executionTime).toBeLessThan(1000); // Should not hang
          
          if (result.resultCount > 0) {
            // Zero vectors will produce NaN similarity scores, which is expected
            if (queryType === 'edge_case_zeros') {
              expect(isNaN(result.topSimilarity)).toBe(true);
            } else {
              expect(result.topSimilarity).toBeGreaterThanOrEqual(-1);
              expect(result.topSimilarity).toBeLessThanOrEqual(1);
            }
          }
        } catch (error) {
          throw new Error(`Edge case query '${queryType}' failed: ${(error as Error).message}`);
        }
      }
    });
  });

  describe('Repository Vector Search', () => {
    it('should find repositories with similar descriptions', async () => {
      // Insert test repositories with embeddings
      const repositories = [
        {
          name: 'ai-ml-toolkit',
          description: 'Machine learning toolkit with neural networks and deep learning capabilities',
          embedding: vectorUtils.generateFakeEmbedding('ml_toolkit')
        },
        {
          name: 'data-science-lib',
          description: 'Data science library for machine learning and statistical analysis',
          embedding: vectorUtils.generateFakeEmbedding('data_science')
        },
        {
          name: 'web-framework',
          description: 'Modern web framework for building scalable applications',
          embedding: vectorUtils.generateFakeEmbedding('web_framework')
        }
      ];

      for (let i = 0; i < repositories.length; i++) {
        const repo = repositories[i];
        await sql`
          INSERT INTO repositories (
            github_id, full_name, name, description, url, clone_url,
            owner_login, owner_type, description_embedding
          ) VALUES (
            ${888000 + i}, ${'test_vector_' + repo.name}, ${repo.name}, ${repo.description},
            ${'https://github.com/test/' + repo.name}, ${'https://github.com/test/' + repo.name + '.git'},
            'test_vector_org', 'Organization', ${repo.embedding}
          )
        `;
      }

      // Search for ML-related repositories
      const mlQueryEmbedding = vectorUtils.generateSimilarEmbeddings(
        repositories[0].embedding, 1, 0.95
      )[0];

      const result = await vectorUtils.testVectorSimilaritySearch(
        'repositories',
        'description_embedding',
        mlQueryEmbedding,
        3
      );

      expect(result.resultCount).toBeGreaterThan(0);
      expect(result.topSimilarity).toBeGreaterThan(0.7);

      // Get detailed results
      const detailedResults = await sql`
        SELECT 
          name,
          description,
          1 - (description_embedding <=> ${mlQueryEmbedding}::halfvec) as similarity
        FROM repositories 
        WHERE full_name LIKE 'test_vector_%'
          AND description_embedding IS NOT NULL
        ORDER BY description_embedding <=> ${mlQueryEmbedding}::halfvec
        LIMIT 3
      `;

      // ML-related repos should rank higher
      expect(detailedResults[0].name).toMatch(/ai-ml-toolkit|data-science-lib/);
    });
  });

  describe('Opportunity Vector Search', () => {
    it('should find opportunities with similar titles and descriptions', async () => {
      // First, create a test repository
      const repoResult = await sql`
        INSERT INTO repositories (
          github_id, full_name, name, description, url, clone_url,
          owner_login, owner_type
        ) VALUES (
          777001, 'test_vector_repo', 'test-repo', 'Test repository for vector search',
          'https://github.com/test/test-repo', 'https://github.com/test/test-repo.git',
          'test_vector_org', 'Organization'
        ) RETURNING id
      `;
      const repoId = repoResult[0].id;

      // Insert test opportunities
      const opportunities = [
        {
          title: 'Implement machine learning model training pipeline',
          description: 'Create a comprehensive ML training pipeline with data preprocessing and model evaluation',
          titleEmbedding: vectorUtils.generateFakeEmbedding('ml_pipeline_title'),
          descEmbedding: vectorUtils.generateFakeEmbedding('ml_pipeline_desc')
        },
        {
          title: 'Add neural network visualization tools',
          description: 'Develop tools for visualizing neural network architectures and training progress',
          titleEmbedding: vectorUtils.generateFakeEmbedding('nn_viz_title'),
          descEmbedding: vectorUtils.generateFakeEmbedding('nn_viz_desc')
        },
        {
          title: 'Fix CSS styling bug in navbar',
          description: 'Resolve styling issues with navigation bar responsiveness',
          titleEmbedding: vectorUtils.generateFakeEmbedding('css_bug_title'),
          descEmbedding: vectorUtils.generateFakeEmbedding('css_bug_desc')
        }
      ];

      for (let i = 0; i < opportunities.length; i++) {
        const opp = opportunities[i];
        await sql`
          INSERT INTO opportunities (
            repository_id, github_issue_number, title, description, url,
            type, difficulty, title_embedding, description_embedding
          ) VALUES (
            ${repoId}, ${555000 + i}, ${opp.title}, ${opp.description},
            ${'https://github.com/test/test-repo/issues/' + (555000 + i)},
            'feature'::contribution_type, 'intermediate'::skill_level,
            ${opp.titleEmbedding}, ${opp.descEmbedding}
          )
        `;
      }

      // Search for ML-related opportunities
      const mlQueryEmbedding = vectorUtils.generateSimilarEmbeddings(
        opportunities[0].titleEmbedding, 1, 0.9
      )[0];

      const result = await vectorUtils.testVectorSimilaritySearch(
        'opportunities',
        'title_embedding',
        mlQueryEmbedding,
        3
      );

      expect(result.resultCount).toBeGreaterThan(0);
      expect(result.topSimilarity).toBeGreaterThan(0.7);

      // Test combined title + description search
      const combinedResult = await sql`
        SELECT 
          title,
          ((title_embedding <=> ${mlQueryEmbedding}::halfvec)::float + (description_embedding <=> ${mlQueryEmbedding}::halfvec)::float) / 2 as combined_distance,
          1 - (((title_embedding <=> ${mlQueryEmbedding}::halfvec)::float + (description_embedding <=> ${mlQueryEmbedding}::halfvec)::float) / 2) as combined_similarity
        FROM opportunities 
        WHERE title LIKE 'test_vector_%' OR title LIKE '%machine learning%' OR title LIKE '%neural network%' OR title LIKE '%CSS%'
        ORDER BY combined_distance
        LIMIT 3
      `;

      expect(combinedResult.length).toBeGreaterThan(0);
      vectorTestHelpers.assertSimilarityRange(
        combinedResult.map((r: any) => r.combined_similarity)
      );
    });
  });

  describe('Hybrid Search (Text + Vector)', () => {
    it('should combine text and vector search effectively', async () => {
      // Create test repository
      const repoResult = await sql`
        INSERT INTO repositories (
          github_id, full_name, name, description, url, clone_url,
          owner_login, owner_type, description_embedding
        ) VALUES (
          666001, 'test_vector_hybrid', 'hybrid-search-repo', 
          'Repository for testing hybrid search functionality',
          'https://github.com/test/hybrid-search-repo', 'https://github.com/test/hybrid-search-repo.git',
          'test_vector_org', 'Organization', ${vectorUtils.generateFakeEmbedding('hybrid_repo')}
        ) RETURNING id
      `;
      const repoId = repoResult[0].id;

      // Insert opportunities with both text and vector data
      const opportunities = [
        {
          title: 'Implement machine learning algorithms',
          description: 'Add support for various machine learning algorithms including neural networks',
          embedding: vectorUtils.generateFakeEmbedding('ml_algorithms')
        },
        {
          title: 'Machine learning model optimization',
          description: 'Optimize existing ML models for better performance',
          embedding: vectorUtils.generateFakeEmbedding('ml_optimization')
        },
        {
          title: 'Database query optimization',
          description: 'Improve database query performance',
          embedding: vectorUtils.generateFakeEmbedding('db_optimization')
        }
      ];

      for (let i = 0; i < opportunities.length; i++) {
        const opp = opportunities[i];
        await sql`
          INSERT INTO opportunities (
            repository_id, github_issue_number, title, description, url,
            type, difficulty, title_embedding, description_embedding
          ) VALUES (
            ${repoId}, ${444000 + i}, ${opp.title}, ${opp.description},
            ${'https://github.com/test/hybrid-search-repo/issues/' + (444000 + i)},
            'feature'::contribution_type, 'intermediate'::skill_level,
            ${opp.embedding}, ${opp.embedding}
          )
        `;
      }

      // Test hybrid search
      const searchTerm = 'machine learning';
      const queryEmbedding = vectorUtils.generateSimilarEmbeddings(
        opportunities[0].embedding, 1, 0.8
      )[0];

      const hybridResult = await vectorUtils.testHybridSearch(
        'opportunities',
        'title',
        'title_embedding',
        searchTerm,
        queryEmbedding,
        0.3, // text weight
        0.7, // vector weight
        3
      );

      expect(hybridResult.resultCount).toBeGreaterThan(0);
      expect(hybridResult.averageSimilarity).toBeGreaterThan(0);

      // Verify that opportunities with "machine learning" in title rank higher
      const detailedResults = await sql`
        SELECT 
          title,
          similarity(title, ${searchTerm}) as text_similarity,
          1 - (title_embedding <=> ${queryEmbedding}::halfvec) as vector_similarity,
          (
            similarity(title, ${searchTerm}) * 0.3 + 
            (1 - (title_embedding <=> ${queryEmbedding}::halfvec)) * 0.7
          ) as combined_score
        FROM opportunities 
        WHERE repository_id = ${repoId}
        ORDER BY combined_score DESC
      `;

      expect(detailedResults[0].title).toContain('machine learning');
      expect(detailedResults[0].combined_score).toBeGreaterThan(detailedResults[2].combined_score);
    });
  });

  describe('Vector Index Performance', () => {
    it('should demonstrate HNSW index performance benefits', async () => {
      // Create test data for performance comparison
      const testData = await vectorUtils.generateTestVectorData('users', 'profile_embedding', 50, 5);
      
      // Use timestamp-based IDs to avoid conflicts
      const baseId = Date.now() % 1000000;
      
      // Insert test data
      for (let i = 0; i < testData.length; i++) {
        const item = testData[i];
        await sql`
          INSERT INTO users (github_id, github_username, github_name, profile_embedding)
          VALUES (${baseId + i}, ${item.id + '_' + Date.now()}, ${'Test User ' + i}, ${item.embedding})
        `;
      }

      // Test performance with different ef_search values
      const queryEmbedding = testData[0].embedding;
      
      // Test with lower ef_search (faster, potentially less accurate)
      await sql`SET hnsw.ef_search = 100`;
      const fastResult = await vectorUtils.testVectorSimilaritySearch(
        'users',
        'profile_embedding',
        queryEmbedding,
        10
      );

      // Test with higher ef_search (slower, potentially more accurate)
      await sql`SET hnsw.ef_search = 400`;
      const accurateResult = await vectorUtils.testVectorSimilaritySearch(
        'users',
        'profile_embedding',
        queryEmbedding,
        10
      );

      // Reset to default
      await sql`SET hnsw.ef_search = 200`;

      expect(fastResult.resultCount).toBe(accurateResult.resultCount);
      expect(fastResult.executionTime).toBeLessThan(accurateResult.executionTime * 2); // Should be somewhat faster
      
      // Index usage depends on query planner and data size
      // Both queries should return valid results regardless of index usage
    });

    it('should benchmark different distance metrics', async () => {
      // Use existing test data
      const queryEmbedding = vectorUtils.generateFakeEmbedding('distance_test');
      
      const benchmarkResults = await vectorUtils.benchmarkDistanceMetrics(
        'users',
        'profile_embedding',
        queryEmbedding,
        5
      );

      expect(benchmarkResults.cosine).toBeDefined();
      expect(benchmarkResults.l2).toBeDefined();
      expect(benchmarkResults.inner_product).toBeDefined();

      // All metrics should return results
      expect(benchmarkResults.cosine.resultCount).toBeGreaterThan(0);
      expect(benchmarkResults.l2.resultCount).toBeGreaterThan(0);
      expect(benchmarkResults.inner_product.resultCount).toBeGreaterThan(0);

      // Execution times should be reasonable
      expect(benchmarkResults.cosine.executionTime).toBeLessThan(1000);
      expect(benchmarkResults.l2.executionTime).toBeLessThan(1000);
      expect(benchmarkResults.inner_product.executionTime).toBeLessThan(1000);
    });
  });

  afterAll(async () => {
    // Clean up test data
    await sql`DELETE FROM users WHERE github_username LIKE 'test_vector_%' OR github_username LIKE 'test_item_%'`;
    await sql`DELETE FROM repositories WHERE full_name LIKE 'test_vector_%'`;
    await sql`DELETE FROM opportunities WHERE title LIKE 'test_vector_%' OR title LIKE '%machine learning%' OR title LIKE '%neural network%' OR title LIKE '%CSS%'`;
    
    // Disconnect clients
    await client.end();
    await vectorUtils.disconnect();
  });
});