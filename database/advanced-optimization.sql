-- Advanced Database Optimization for Contribux
-- Performance-focused indexing strategy and query optimization

-- ============================================================================
-- PHASE 1: COMPOSITE INDEXES FOR HIGH-PERFORMANCE QUERIES
-- ============================================================================

-- High-performance search indexes (covering common query patterns)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_search_optimized
ON repositories (status, health_score DESC, stargazers_count DESC, language)
WHERE status = 'active' AND archived = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_opportunities_discovery_optimized
ON opportunities (status, skill_level, good_first_issue, complexity_score)
WHERE status = 'open' AND expires_at > NOW();

-- User activity pattern optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_activity_pattern
ON users (last_active DESC, skill_level, github_id)
WHERE github_id IS NOT NULL;

-- Repository quality scoring (composite for ranking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_quality_ranking
ON repositories (health_score DESC, stargazers_count DESC, open_issues_count ASC, updated_at DESC)
WHERE archived = false AND disabled = false;

-- ============================================================================
-- PHASE 2: ADVANCED VECTOR INDEX OPTIMIZATION
-- ============================================================================

-- Optimize existing HNSW indexes with better parameters for production workload
DROP INDEX IF EXISTS idx_repositories_embedding_hnsw;
CREATE INDEX idx_repositories_embedding_hnsw ON repositories 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 200);

DROP INDEX IF EXISTS idx_opportunities_embedding_hnsw;
CREATE INDEX idx_opportunities_embedding_hnsw ON opportunities 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Create specialized vector indexes for different similarity thresholds
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_embedding_high_precision
ON repositories USING hnsw (embedding vector_cosine_ops)
WITH (m = 24, ef_construction = 400)
WHERE embedding IS NOT NULL;

-- ============================================================================
-- PHASE 3: JSONB OPTIMIZATION FOR METADATA QUERIES
-- ============================================================================

-- Repository metadata search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_language_jsonb
ON repositories USING GIN ((metadata->'language'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_topics_search
ON repositories USING GIN ((metadata->'topics'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_stars_range
ON repositories ((CAST(metadata->>'stars' AS INTEGER)))
WHERE metadata->>'stars' IS NOT NULL;

-- Opportunity metadata optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_opportunities_labels_gin
ON opportunities USING GIN ((metadata->'labels'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_opportunities_skills_gin
ON opportunities USING GIN ((metadata->'skillsRequired'));

-- ============================================================================
-- PHASE 4: PARTITIONING STRATEGY FOR LARGE TABLES
-- ============================================================================

-- User activity partitioning by date (monthly partitions)
-- This will be implemented when the table grows beyond 1M rows

-- Function to create monthly partitions for user_activity
CREATE OR REPLACE FUNCTION create_monthly_partition(table_name TEXT, start_date DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    end_date DATE;
BEGIN
    partition_name := table_name || '_' || to_char(start_date, 'YYYY_MM');
    end_date := start_date + INTERVAL '1 month';
    
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I 
                   FOR VALUES FROM (%L) TO (%L)',
                   partition_name, table_name, start_date, end_date);
    
    -- Create index on partition
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at, user_id)',
                   'idx_' || partition_name || '_created_user', partition_name);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 5: MATERIALIZED VIEWS FOR AGGREGATED DATA
-- ============================================================================

-- Repository health summary for dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_repository_health_summary AS
SELECT 
    date_trunc('day', updated_at) as date,
    COUNT(*) as total_repositories,
    AVG(health_score) as avg_health_score,
    AVG(stargazers_count) as avg_stars,
    COUNT(*) FILTER (WHERE health_score >= 80) as healthy_repos,
    COUNT(*) FILTER (WHERE health_score < 50) as unhealthy_repos,
    COUNT(*) FILTER (WHERE last_analyzed_at > NOW() - INTERVAL '24 hours') as recently_analyzed
FROM repositories
WHERE archived = false
GROUP BY date_trunc('day', updated_at)
ORDER BY date DESC;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_repository_health_summary_date 
ON mv_repository_health_summary (date DESC);

-- User engagement metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_engagement_metrics AS
SELECT 
    date_trunc('week', last_active) as week,
    skill_level,
    COUNT(*) as active_users,
    AVG(total_contributions) as avg_contributions,
    COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days') as weekly_active
FROM users
WHERE github_id IS NOT NULL
GROUP BY date_trunc('week', last_active), skill_level
ORDER BY week DESC, skill_level;

-- ============================================================================
-- PHASE 6: ADVANCED QUERY OPTIMIZATION FUNCTIONS
-- ============================================================================

-- Optimized repository search with intelligent ranking
CREATE OR REPLACE FUNCTION optimized_repository_search(
    search_query TEXT,
    user_skill_level TEXT DEFAULT 'intermediate',
    language_filter TEXT[] DEFAULT '{}',
    min_stars INTEGER DEFAULT 0,
    limit_results INTEGER DEFAULT 20
)
RETURNS TABLE(
    id UUID,
    full_name TEXT,
    description TEXT,
    language TEXT,
    stargazers_count INTEGER,
    health_score INTEGER,
    relevance_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH search_results AS (
        SELECT 
            r.id,
            r.full_name,
            r.description,
            r.language,
            r.stargazers_count,
            r.health_score,
            
            -- Advanced relevance scoring
            (
                -- Text similarity (30%)
                CASE 
                    WHEN search_query IS NOT NULL THEN
                        GREATEST(
                            similarity(r.name, search_query),
                            similarity(COALESCE(r.description, ''), search_query),
                            CASE WHEN r.full_name ILIKE '%' || search_query || '%' THEN 0.8 ELSE 0 END
                        ) * 0.3
                    ELSE 0.2
                END +
                
                -- Quality boost (40%)
                (r.health_score::NUMERIC / 100.0) * 0.4 +
                
                -- Popularity boost (20%)
                LEAST(LOG(GREATEST(r.stargazers_count, 1)) / 20.0, 1.0) * 0.2 +
                
                -- Activity bonus (10%)
                CASE 
                    WHEN r.updated_at > NOW() - INTERVAL '30 days' THEN 0.1
                    WHEN r.updated_at > NOW() - INTERVAL '90 days' THEN 0.05
                    ELSE 0.0
                END
            ) AS relevance_score
        FROM repositories r
        WHERE 
            r.archived = false
            AND r.disabled = false
            AND r.stargazers_count >= min_stars
            AND (array_length(language_filter, 1) IS NULL OR r.language = ANY(language_filter))
            AND (
                search_query IS NULL 
                OR r.name ILIKE '%' || search_query || '%'
                OR r.description ILIKE '%' || search_query || '%'
                OR r.full_name ILIKE '%' || search_query || '%'
            )
    )
    SELECT 
        sr.id,
        sr.full_name,
        sr.description,
        sr.language,
        sr.stargazers_count,
        sr.health_score,
        sr.relevance_score
    FROM search_results sr
    WHERE sr.relevance_score > 0.2
    ORDER BY sr.relevance_score DESC, sr.stargazers_count DESC
    LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Performance-optimized opportunity matching
CREATE OR REPLACE FUNCTION fast_opportunity_matching(
    user_id_param UUID,
    skill_level_filter TEXT DEFAULT NULL,
    limit_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    title TEXT,
    repository_name TEXT,
    difficulty TEXT,
    estimated_hours INTEGER,
    match_confidence NUMERIC
) AS $$
DECLARE
    user_languages TEXT[];
    user_skill TEXT;
BEGIN
    -- Get user preferences efficiently
    SELECT array_agg(DISTINCT pref), u.skill_level
    INTO user_languages, user_skill
    FROM users u
    LEFT JOIN unnest(u.preferred_languages) pref ON true
    WHERE u.id = user_id_param
    GROUP BY u.skill_level;
    
    RETURN QUERY
    WITH ranked_opportunities AS (
        SELECT 
            o.id,
            o.title,
            r.name as repository_name,
            o.skill_level as difficulty,
            o.estimated_hours,
            
            -- Fast confidence scoring
            (
                CASE 
                    WHEN o.skill_level = COALESCE(skill_level_filter, user_skill) THEN 0.4
                    WHEN o.skill_level IN ('beginner', 'intermediate') AND user_skill = 'advanced' THEN 0.3
                    ELSE 0.1
                END +
                
                CASE 
                    WHEN r.language = ANY(user_languages) THEN 0.3
                    ELSE 0.0
                END +
                
                CASE 
                    WHEN o.good_first_issue THEN 0.2
                    ELSE 0.0
                END +
                
                CASE 
                    WHEN o.mentorship_available THEN 0.1
                    ELSE 0.0
                END
            ) AS match_confidence
            
        FROM opportunities o
        JOIN repositories r ON o.repository_id = r.id
        WHERE 
            o.status = 'open'
            AND (o.expires_at IS NULL OR o.expires_at > NOW())
            AND r.archived = false
            -- Exclude opportunities user has already interacted with
            AND NOT EXISTS (
                SELECT 1 FROM user_repository_interactions uri
                WHERE uri.user_id = user_id_param 
                AND uri.repository_id = o.repository_id
                AND uri.contributed = true
            )
    )
    SELECT 
        ro.id,
        ro.title,
        ro.repository_name,
        ro.difficulty,
        ro.estimated_hours,
        ro.match_confidence
    FROM ranked_opportunities ro
    WHERE ro.match_confidence > 0.3
    ORDER BY ro.match_confidence DESC, ro.estimated_hours ASC NULLS LAST
    LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 7: MONITORING AND MAINTENANCE AUTOMATION
-- ============================================================================

-- Function to refresh materialized views efficiently
CREATE OR REPLACE FUNCTION refresh_performance_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh concurrently to avoid blocking
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_repository_health_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_engagement_metrics;
    
    -- Log refresh completion
    INSERT INTO performance_logs (event_type, event_data, created_at)
    VALUES ('materialized_view_refresh', '{"views": ["repository_health", "user_engagement"]}', NOW());
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error
        INSERT INTO performance_logs (event_type, event_data, created_at)
        VALUES ('materialized_view_error', 
               json_build_object('error', SQLERRM, 'state', SQLSTATE)::jsonb, 
               NOW());
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Performance logging table
CREATE TABLE IF NOT EXISTS performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_logs_type_time 
ON performance_logs (event_type, created_at DESC);

-- ============================================================================
-- PHASE 8: QUERY PLAN ANALYSIS UTILITIES
-- ============================================================================

-- Function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query_performance(query_text TEXT)
RETURNS TABLE(
    plan_line TEXT,
    execution_time_ms NUMERIC,
    rows_returned BIGINT,
    index_usage TEXT[]
) AS $$
DECLARE
    explain_result TEXT;
BEGIN
    -- Execute EXPLAIN ANALYZE for the query
    EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' || query_text
    INTO explain_result;
    
    -- Parse and return results (simplified version)
    RETURN QUERY
    SELECT 
        unnest(string_to_array(explain_result, E'\n')) as plan_line,
        0::NUMERIC as execution_time_ms,
        0::BIGINT as rows_returned,
        '{}'::TEXT[] as index_usage;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MAINTENANCE SCHEDULE
-- ============================================================================

-- Schedule materialized view refresh (to be run via cron or pg_cron)
-- */15 * * * * SELECT refresh_performance_views();

-- Auto-vacuum configuration for high-traffic tables
ALTER TABLE repositories SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE opportunities SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE user_activity SET (
    autovacuum_vacuum_scale_factor = 0.2,
    autovacuum_analyze_scale_factor = 0.1
);

-- Update table statistics
ANALYZE repositories;
ANALYZE opportunities;
ANALYZE users;

-- ============================================================================
-- COMPLETION SUMMARY
-- ============================================================================

-- Performance optimization complete
-- Key improvements implemented:
-- 1. Advanced composite indexes for common query patterns
-- 2. Optimized HNSW vector indexes with production parameters
-- 3. JSONB-specific indexes for metadata queries
-- 4. Materialized views for dashboard aggregations
-- 5. High-performance search and matching functions
-- 6. Automated maintenance and monitoring
-- 7. Query performance analysis tools

SELECT 'Database optimization completed successfully. Monitor performance_logs table for ongoing metrics.' as status;