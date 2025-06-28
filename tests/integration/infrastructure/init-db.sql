-- Initialize test database with required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create test schema
CREATE SCHEMA IF NOT EXISTS test_data;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA test_data TO test_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA test_data TO test_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA test_data TO test_user;

-- Create performance monitoring function
CREATE OR REPLACE FUNCTION test_data.get_query_stats()
RETURNS TABLE(
    query TEXT,
    calls BIGINT,
    total_time DOUBLE PRECISION,
    mean_time DOUBLE PRECISION,
    max_time DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pg_stat_statements.query,
        pg_stat_statements.calls,
        pg_stat_statements.total_exec_time as total_time,
        pg_stat_statements.mean_exec_time as mean_time,
        pg_stat_statements.max_exec_time as max_time
    FROM pg_stat_statements
    WHERE pg_stat_statements.userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
    ORDER BY pg_stat_statements.total_exec_time DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create test data cleanup function
CREATE OR REPLACE FUNCTION test_data.cleanup_test_data()
RETURNS void AS $$
BEGIN
    -- Truncate all tables in test_data schema
    EXECUTE (
        SELECT string_agg('TRUNCATE TABLE test_data.' || tablename || ' CASCADE;', ' ')
        FROM pg_tables
        WHERE schemaname = 'test_data'
    );
    
    -- Reset sequences
    EXECUTE (
        SELECT string_agg('ALTER SEQUENCE test_data.' || sequencename || ' RESTART WITH 1;', ' ')
        FROM pg_sequences
        WHERE schemaname = 'test_data'
    );
END;
$$ LANGUAGE plpgsql;

-- Create index statistics function
CREATE OR REPLACE FUNCTION test_data.get_index_stats()
RETURNS TABLE(
    tablename TEXT,
    indexname TEXT,
    index_size TEXT,
    index_scans BIGINT,
    index_effectiveness NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname || '.' || tablename as tablename,
        indexrelname as indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        idx_scan as index_scans,
        CASE 
            WHEN idx_scan > 0 THEN 
                ROUND((100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0))::numeric, 2)
            ELSE 0
        END as index_effectiveness
    FROM pg_stat_user_indexes
    JOIN pg_stat_user_tables USING (schemaname, tablename)
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON SCHEMA test_data IS 'Schema for integration test data isolation';