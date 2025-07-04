-- Initialize test database with pgvector and required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create pg_stat_statements extension
-- NOTE: This extension also requires 'pg_stat_statements' to be added to 
-- shared_preload_libraries in postgresql.conf for full functionality.
-- If not configured, the extension will be installed but queries will fail
-- with "pg_stat_statements must be loaded via shared_preload_libraries"
-- The application handles this gracefully by returning empty results.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create test schema
CREATE SCHEMA IF NOT EXISTS public;

-- Grant permissions
GRANT ALL ON SCHEMA public TO testuser;
GRANT CREATE ON DATABASE testdb TO testuser;

-- Set search path
ALTER DATABASE testdb SET search_path TO public;

-- Create custom types for consistency with production
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'opportunity_match',
        'repository_trending',
        'skill_recommendation',
        'contribution_milestone',
        'weekly_digest'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM (
        'email',
        'in_app',
        'webhook'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE opportunity_status AS ENUM (
        'open',
        'assigned',
        'in_progress',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE contribution_outcome_status AS ENUM (
        'pending',
        'accepted',
        'rejected',
        'merged'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Configure pgvector
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET shared_buffers = '256MB';

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Test database initialized successfully with pgvector support';
END $$;