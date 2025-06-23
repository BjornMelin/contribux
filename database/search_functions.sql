-- Advanced search functions for contribux
-- Hybrid text + vector search for AI-powered contribution discovery

-- Function: hybrid_search_opportunities
-- Combines full-text search with vector similarity for opportunity discovery
CREATE OR REPLACE FUNCTION hybrid_search_opportunities(
    search_text TEXT DEFAULT NULL,
    query_embedding halfvec(1536) DEFAULT NULL,
    text_weight DOUBLE PRECISION DEFAULT 0.3,
    vector_weight DOUBLE PRECISION DEFAULT 0.7,
    similarity_threshold DOUBLE PRECISION DEFAULT 0.6,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    id UUID,
    repository_id UUID,
    title VARCHAR(500),
    description TEXT,
    type contribution_type,
    difficulty skill_level,
    priority INTEGER,
    required_skills TEXT[],
    technologies TEXT[],
    good_first_issue BOOLEAN,
    help_wanted BOOLEAN,
    estimated_hours INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    relevance_score DOUBLE PRECISION
) AS $$
BEGIN
    -- Validate inputs
    IF text_weight + vector_weight = 0 THEN
        RAISE EXCEPTION 'Text weight and vector weight cannot both be zero';
    END IF;
    
    IF result_limit <= 0 THEN
        RAISE EXCEPTION 'Result limit must be positive';
    END IF;

    RETURN QUERY
    WITH text_scores AS (
        -- Full-text search with trigram similarity
        SELECT 
            o.id,
            o.repository_id,
            o.title,
            o.description,
            o.type,
            o.difficulty,
            o.priority,
            o.required_skills,
            o.technologies,
            o.good_first_issue,
            o.help_wanted,
            o.estimated_hours,
            o.created_at,
            CASE 
                WHEN search_text IS NULL OR search_text = '' THEN 0.5
                ELSE GREATEST(
                    -- Title similarity (weighted higher)
                    similarity(o.title, search_text) * 0.7,
                    -- Description similarity
                    similarity(COALESCE(o.description, ''), search_text) * 0.3,
                    -- Full-text search score
                    CASE 
                        WHEN to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')) @@ 
                             plainto_tsquery('english', search_text) 
                        THEN 0.8 
                        ELSE 0.0 
                    END
                )
            END AS text_score
        FROM opportunities o
        WHERE o.status = 'open'
    ),
    vector_scores AS (
        -- Vector similarity search
        SELECT 
            ts.*,
            CASE 
                WHEN query_embedding IS NULL THEN 0.5
                ELSE 1.0 - COALESCE(
                    LEAST(
                        o.title_embedding <=> query_embedding,
                        o.description_embedding <=> query_embedding
                    ), 
                    1.0
                )
            END AS vector_score
        FROM text_scores ts
        JOIN opportunities o ON ts.id = o.id
    ),
    combined_scores AS (
        -- Combine text and vector scores
        SELECT 
            vs.*,
            (vs.text_score * text_weight + vs.vector_score * vector_weight) / 
            (text_weight + vector_weight) AS relevance_score
        FROM vector_scores vs
    )
    SELECT 
        cs.id,
        cs.repository_id,
        cs.title,
        cs.description,
        cs.type,
        cs.difficulty,
        cs.priority,
        cs.required_skills,
        cs.technologies,
        cs.good_first_issue,
        cs.help_wanted,
        cs.estimated_hours,
        cs.created_at,
        cs.relevance_score
    FROM combined_scores cs
    WHERE cs.relevance_score >= similarity_threshold
    ORDER BY cs.relevance_score DESC, cs.priority DESC, cs.created_at DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: hybrid_search_repositories
-- Combines text search with vector similarity for repository discovery
CREATE OR REPLACE FUNCTION hybrid_search_repositories(
    search_text TEXT DEFAULT NULL,
    query_embedding halfvec(1536) DEFAULT NULL,
    text_weight DOUBLE PRECISION DEFAULT 0.3,
    vector_weight DOUBLE PRECISION DEFAULT 0.7,
    similarity_threshold DOUBLE PRECISION DEFAULT 0.6,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    id UUID,
    github_id INTEGER,
    full_name VARCHAR(255),
    name VARCHAR(255),
    description TEXT,
    language VARCHAR(100),
    topics TEXT[],
    stars_count INTEGER,
    health_score NUMERIC(5,2),
    activity_score NUMERIC(5,2),
    first_time_contributor_friendly BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    relevance_score DOUBLE PRECISION
) AS $$
BEGIN
    -- Validate inputs
    IF text_weight + vector_weight = 0 THEN
        RAISE EXCEPTION 'Text weight and vector weight cannot both be zero';
    END IF;
    
    IF result_limit <= 0 THEN
        RAISE EXCEPTION 'Result limit must be positive';
    END IF;

    RETURN QUERY
    WITH text_scores AS (
        -- Full-text search with trigram similarity
        SELECT 
            r.id,
            r.github_id,
            r.full_name,
            r.name,
            r.description,
            r.language,
            r.topics,
            r.stars_count,
            r.health_score,
            r.activity_score,
            r.first_time_contributor_friendly,
            r.created_at,
            CASE 
                WHEN search_text IS NULL OR search_text = '' THEN 0.5
                ELSE GREATEST(
                    -- Name similarity (weighted higher)
                    similarity(r.name, search_text) * 0.4,
                    -- Full name similarity
                    similarity(r.full_name, search_text) * 0.3,
                    -- Description similarity
                    similarity(COALESCE(r.description, ''), search_text) * 0.2,
                    -- Topic matching
                    CASE 
                        WHEN r.topics && string_to_array(lower(search_text), ' ') 
                        THEN 0.6 
                        ELSE 0.0 
                    END,
                    -- Full-text search score
                    CASE 
                        WHEN to_tsvector('english', r.name || ' ' || COALESCE(r.description, '')) @@ 
                             plainto_tsquery('english', search_text) 
                        THEN 0.7 
                        ELSE 0.0 
                    END
                )
            END AS text_score
        FROM repositories r
        WHERE r.status = 'active'
    ),
    vector_scores AS (
        -- Vector similarity search
        SELECT 
            ts.*,
            CASE 
                WHEN query_embedding IS NULL THEN 0.5
                ELSE 1.0 - COALESCE(r.description_embedding <=> query_embedding, 1.0)
            END AS vector_score
        FROM text_scores ts
        JOIN repositories r ON ts.id = r.id
    ),
    combined_scores AS (
        -- Combine text and vector scores with quality boost
        SELECT 
            vs.*,
            ((vs.text_score * text_weight + vs.vector_score * vector_weight) / 
             (text_weight + vector_weight)) * 
            -- Quality boost based on health score and stars
            (1.0 + (vs.health_score / 200.0) + (LOG(GREATEST(vs.stars_count, 1)) / 50.0)) AS relevance_score
        FROM vector_scores vs
    )
    SELECT 
        cs.id,
        cs.github_id,
        cs.full_name,
        cs.name,
        cs.description,
        cs.language,
        cs.topics,
        cs.stars_count,
        cs.health_score,
        cs.activity_score,
        cs.first_time_contributor_friendly,
        cs.created_at,
        cs.relevance_score
    FROM combined_scores cs
    WHERE cs.relevance_score >= similarity_threshold
    ORDER BY cs.relevance_score DESC, cs.stars_count DESC, cs.health_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: search_similar_users
-- Find users with similar profiles based on embedding similarity
CREATE OR REPLACE FUNCTION search_similar_users(
    query_embedding halfvec(1536),
    similarity_threshold DOUBLE PRECISION DEFAULT 0.7,
    result_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    github_username VARCHAR(255),
    github_name VARCHAR(255),
    bio TEXT,
    preferred_languages TEXT[],
    skill_level skill_level,
    total_contributions INTEGER,
    last_active TIMESTAMP WITH TIME ZONE,
    similarity_score DOUBLE PRECISION
) AS $$
BEGIN
    IF result_limit <= 0 THEN
        RAISE EXCEPTION 'Result limit must be positive';
    END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.github_username,
        u.github_name,
        u.bio,
        u.preferred_languages,
        u.skill_level,
        u.total_contributions,
        u.last_active,
        (1.0 - (u.profile_embedding <=> query_embedding)) AS similarity_score
    FROM users u
    WHERE 
        u.profile_embedding IS NOT NULL
        AND (1.0 - (u.profile_embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY u.profile_embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: find_matching_opportunities_for_user
-- AI-powered personalized opportunity recommendations
CREATE OR REPLACE FUNCTION find_matching_opportunities_for_user(
    target_user_id UUID,
    similarity_threshold DOUBLE PRECISION DEFAULT 0.6,
    result_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    repository_id UUID,
    title VARCHAR(500),
    description TEXT,
    type contribution_type,
    difficulty skill_level,
    required_skills TEXT[],
    good_first_issue BOOLEAN,
    estimated_hours INTEGER,
    match_score DOUBLE PRECISION,
    match_reasons TEXT[]
) AS $$
DECLARE
    user_record users%ROWTYPE;
    user_prefs user_preferences%ROWTYPE;
BEGIN
    -- Get user profile
    SELECT u.* 
    INTO user_record
    FROM users u
    WHERE u.id = target_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    -- Get user preferences (may not exist)
    SELECT up.* 
    INTO user_prefs
    FROM user_preferences up
    WHERE up.user_id = target_user_id;

    RETURN QUERY
    WITH opportunity_matches AS (
        SELECT 
            o.id,
            o.repository_id,
            o.title,
            o.description,
            o.type,
            o.difficulty,
            o.required_skills,
            o.good_first_issue,
            o.estimated_hours,
            
            -- Calculate match score based on multiple factors
            (
                -- Profile embedding similarity
                CASE 
                    WHEN user_record.profile_embedding IS NOT NULL AND o.description_embedding IS NOT NULL
                    THEN (1.0 - (user_record.profile_embedding <=> o.description_embedding)) * 0.3
                    ELSE 0.2 
                END +
                
                -- Skill level compatibility
                CASE 
                    WHEN o.difficulty = user_record.skill_level THEN 0.2
                    WHEN (user_record.skill_level = 'beginner' AND o.difficulty = 'intermediate') OR
                         (user_record.skill_level = 'intermediate' AND o.difficulty IN ('beginner', 'advanced')) OR
                         (user_record.skill_level = 'advanced' AND o.difficulty IN ('intermediate', 'expert')) OR
                         (user_record.skill_level = 'expert' AND o.difficulty = 'advanced')
                    THEN 0.15
                    ELSE 0.05
                END +
                
                -- Language preference match
                CASE 
                    WHEN user_record.preferred_languages && 
                         (SELECT ARRAY[r.language::TEXT] FROM repositories r WHERE r.id = o.repository_id)
                    THEN 0.15
                    ELSE 0.0
                END +
                
                -- Contribution type preference (if available)
                CASE 
                    WHEN user_prefs.preferred_contribution_types IS NOT NULL AND 
                         o.type = ANY(user_prefs.preferred_contribution_types)
                    THEN 0.1
                    ELSE 0.05
                END +
                
                -- Good first issue bonus for beginners
                CASE 
                    WHEN user_record.skill_level = 'beginner' AND o.good_first_issue = true
                    THEN 0.1
                    ELSE 0.0
                END +
                
                -- Time availability match
                CASE 
                    WHEN user_prefs.max_estimated_hours IS NOT NULL AND 
                         o.estimated_hours IS NOT NULL AND 
                         o.estimated_hours <= user_prefs.max_estimated_hours
                    THEN 0.1
                    WHEN o.estimated_hours IS NULL OR o.estimated_hours <= user_record.availability_hours
                    THEN 0.05
                    ELSE 0.0
                END
                
            ) AS match_score,
            
            -- Generate match reasons
            ARRAY_REMOVE(ARRAY[
                CASE 
                    WHEN user_record.profile_embedding IS NOT NULL AND o.description_embedding IS NOT NULL AND
                         (1.0 - (user_record.profile_embedding <=> o.description_embedding)) > 0.7
                    THEN 'Similar to your interests'
                END,
                CASE 
                    WHEN o.difficulty = user_record.skill_level 
                    THEN 'Matches your skill level'
                END,
                CASE 
                    WHEN user_record.preferred_languages && 
                         (SELECT ARRAY[r.language] FROM repositories r WHERE r.id = o.repository_id)
                    THEN 'Uses your preferred languages'
                END,
                CASE 
                    WHEN o.good_first_issue = true 
                    THEN 'Good first issue'
                END,
                CASE 
                    WHEN o.help_wanted = true 
                    THEN 'Help wanted'
                END,
                CASE 
                    WHEN o.mentorship_available = true 
                    THEN 'Mentorship available'
                END
            ], NULL) AS match_reasons
            
        FROM opportunities o
        WHERE 
            o.status = 'open'
            -- Exclude opportunities from repositories user has already contributed to
            AND NOT EXISTS (
                SELECT 1 FROM user_repository_interactions uri
                WHERE uri.user_id = target_user_id 
                AND uri.repository_id = o.repository_id 
                AND uri.contributed = true
            )
    )
    SELECT 
        om.id,
        om.repository_id,
        om.title,
        om.description,
        om.type,
        om.difficulty,
        om.required_skills,
        om.good_first_issue,
        om.estimated_hours,
        om.match_score,
        om.match_reasons
    FROM opportunity_matches om
    WHERE om.match_score >= similarity_threshold
    ORDER BY om.match_score DESC, om.good_first_issue DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: get_trending_opportunities
-- Get trending opportunities based on recent activity and engagement
CREATE OR REPLACE FUNCTION get_trending_opportunities(
    time_window_hours INTEGER DEFAULT 168, -- Default: last week
    min_engagement INTEGER DEFAULT 1,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    id UUID,
    repository_id UUID,
    title VARCHAR(500),
    type contribution_type,
    difficulty skill_level,
    view_count INTEGER,
    application_count INTEGER,
    stars_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    trending_score DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.repository_id,
        o.title,
        o.type,
        o.difficulty,
        o.view_count,
        o.application_count,
        r.stars_count,
        o.created_at,
        -- Calculate trending score based on engagement and recency
        (
            -- Engagement score (views + applications)
            (o.view_count + o.application_count * 3.0) * 0.4 +
            -- Recency boost (newer is better)
            (1.0 - EXTRACT(EPOCH FROM (NOW() - o.created_at)) / (time_window_hours * 3600.0)) * 0.3 +
            -- Repository quality boost
            (LOG(GREATEST(r.stars_count, 1)) / 10.0) * 0.3
        ) AS trending_score
    FROM opportunities o
    JOIN repositories r ON o.repository_id = r.id
    WHERE 
        o.status = 'open'
        AND o.created_at >= NOW() - INTERVAL '1 hour' * time_window_hours
        AND (o.view_count + o.application_count) >= min_engagement
    ORDER BY trending_score DESC, o.created_at DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: get_repository_health_metrics
-- Calculate comprehensive health metrics for a repository
CREATE OR REPLACE FUNCTION get_repository_health_metrics(
    target_repo_id UUID
)
RETURNS TABLE(
    repository_id UUID,
    health_score NUMERIC(5,2),
    activity_score NUMERIC(5,2),
    community_score NUMERIC(5,2),
    documentation_score NUMERIC(5,2),
    contributor_friendliness INTEGER,
    total_opportunities INTEGER,
    open_opportunities INTEGER,
    avg_opportunity_completion_time DOUBLE PRECISION,
    recommendations JSONB
) AS $$
DECLARE
    repo_record RECORD;
    opportunity_stats RECORD;
BEGIN
    -- Get repository data
    SELECT * INTO repo_record
    FROM repositories r
    WHERE r.id = target_repo_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repository not found: %', target_repo_id;
    END IF;
    
    -- Get opportunity statistics
    SELECT 
        COUNT(*) as total_opps,
        COUNT(*) FILTER (WHERE o.status = 'open') as open_opps,
        AVG(
            EXTRACT(EPOCH FROM (co.completed_at - co.started_at)) / 3600.0
        ) FILTER (WHERE co.completed_at IS NOT NULL) as avg_completion_hours
    INTO opportunity_stats
    FROM opportunities o
    LEFT JOIN contribution_outcomes co ON o.id = co.opportunity_id
    WHERE o.repository_id = target_repo_id;

    RETURN QUERY
    SELECT 
        repo_record.id,
        repo_record.health_score,
        repo_record.activity_score,
        repo_record.community_score,
        repo_record.documentation_score,
        repo_record.contributor_friendliness,
        COALESCE(opportunity_stats.total_opps, 0)::INTEGER,
        COALESCE(opportunity_stats.open_opps, 0)::INTEGER,
        opportunity_stats.avg_completion_hours,
        jsonb_build_object(
            'health_status', 
            CASE 
                WHEN repo_record.health_score >= 80 THEN 'excellent'
                WHEN repo_record.health_score >= 60 THEN 'good'
                WHEN repo_record.health_score >= 40 THEN 'fair'
                ELSE 'needs_improvement'
            END,
            'key_strengths',
            ARRAY_REMOVE(ARRAY[
                CASE WHEN repo_record.activity_score >= 70 THEN 'active_development' END,
                CASE WHEN repo_record.community_score >= 70 THEN 'strong_community' END,
                CASE WHEN repo_record.documentation_score >= 70 THEN 'well_documented' END,
                CASE WHEN repo_record.contributor_friendliness >= 70 THEN 'contributor_friendly' END
            ], NULL),
            'improvement_areas',
            ARRAY_REMOVE(ARRAY[
                CASE WHEN repo_record.activity_score < 50 THEN 'increase_activity' END,
                CASE WHEN repo_record.community_score < 50 THEN 'build_community' END,
                CASE WHEN repo_record.documentation_score < 50 THEN 'improve_docs' END,
                CASE WHEN repo_record.contributor_friendliness < 50 THEN 'better_onboarding' END
            ], NULL)
        );
END;
$$ LANGUAGE plpgsql;