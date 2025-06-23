-- Initialize required PostgreSQL extensions for contribux
-- This file runs first during database initialization

-- Enable required extensions in the correct order
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enable pg_stat_statements for query performance monitoring (if available)
-- This extension may not be available in all environments
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Verify extensions are loaded
DO $$
BEGIN
    RAISE NOTICE 'Extensions installed successfully:';
    RAISE NOTICE '- uuid-ossp: %', (SELECT extversion FROM pg_extension WHERE extname = 'uuid-ossp');
    RAISE NOTICE '- pgcrypto: %', (SELECT extversion FROM pg_extension WHERE extname = 'pgcrypto');
    RAISE NOTICE '- pg_trgm: %', (SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm');
    RAISE NOTICE '- vector: %', (SELECT extversion FROM pg_extension WHERE extname = 'vector');
    
    -- Check if pg_stat_statements is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE '- pg_stat_statements: %', (SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_statements');
    ELSE
        RAISE NOTICE '- pg_stat_statements: not available (this is optional)';
    END IF;
END $$;