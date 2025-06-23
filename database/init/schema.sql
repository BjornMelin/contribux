-- contribux Database Schema
-- PostgreSQL 16 with pgvector extension for AI-powered GitHub contribution discovery

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create enum types for type safety
CREATE TYPE user_role AS ENUM ('user', 'admin', 'developer', 'maintainer');
CREATE TYPE repository_status AS ENUM ('active', 'archived', 'private', 'fork', 'template');
CREATE TYPE opportunity_status AS ENUM ('open', 'in_progress', 'completed', 'stale', 'closed');
CREATE TYPE skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE contribution_type AS ENUM ('bug_fix', 'feature', 'documentation', 'test', 'refactor', 'security');
CREATE TYPE notification_type AS ENUM ('email', 'webhook', 'in_app', 'slack', 'discord');
CREATE TYPE outcome_status AS ENUM ('pending', 'accepted', 'rejected', 'merged', 'abandoned');

-- Users table with GitHub integration and AI profile embeddings
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id INTEGER UNIQUE NOT NULL,
    github_username VARCHAR(255) UNIQUE NOT NULL,
    github_name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    bio TEXT,
    company VARCHAR(255),
    location VARCHAR(255),
    blog TEXT,
    twitter_username VARCHAR(255),
    
    -- Role and preferences
    role user_role DEFAULT 'user',
    preferred_languages TEXT[] DEFAULT '{}',
    skill_level skill_level DEFAULT 'intermediate',
    availability_hours INTEGER DEFAULT 10,
    
    -- AI-powered profile analysis
    profile_embedding halfvec(1536), -- OpenAI embedding for semantic matching
    skills_confidence JSONB DEFAULT '{}', -- Skill confidence scores
    contribution_patterns JSONB DEFAULT '{}', -- Historical contribution analysis
    preference_weights JSONB DEFAULT '{}', -- Personalized recommendation weights
    
    -- Activity tracking
    last_github_sync TIMESTAMP WITH TIME ZONE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_contributions INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_github_id CHECK (github_id > 0),
    CONSTRAINT valid_availability CHECK (availability_hours >= 0 AND availability_hours <= 168),
    CONSTRAINT valid_streak CHECK (streak_days >= 0)
);

-- Repositories table with health scoring and AI analysis
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id INTEGER UNIQUE NOT NULL,
    full_name VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    clone_url TEXT NOT NULL,
    
    -- Repository metadata
    owner_login VARCHAR(255) NOT NULL,
    owner_type VARCHAR(50) NOT NULL, -- User, Organization
    language VARCHAR(100),
    languages JSONB DEFAULT '{}', -- Language breakdown
    topics TEXT[] DEFAULT '{}',
    
    -- Status and metrics
    status repository_status DEFAULT 'active',
    stars_count INTEGER DEFAULT 0,
    forks_count INTEGER DEFAULT 0,
    watchers_count INTEGER DEFAULT 0,
    open_issues_count INTEGER DEFAULT 0,
    
    -- Health scoring (0-100)
    health_score DECIMAL(5,2) DEFAULT 0,
    activity_score DECIMAL(5,2) DEFAULT 0,
    community_score DECIMAL(5,2) DEFAULT 0,
    documentation_score DECIMAL(5,2) DEFAULT 0,
    
    -- AI analysis
    description_embedding halfvec(1536), -- Semantic search for repo matching
    complexity_level skill_level DEFAULT 'intermediate',
    contributor_friendliness INTEGER DEFAULT 50, -- 0-100 scale
    learning_potential INTEGER DEFAULT 50, -- 0-100 scale
    
    -- Contribution insights
    avg_pr_merge_time INTEGER, -- Hours
    avg_issue_close_time INTEGER, -- Hours
    maintainer_responsiveness DECIMAL(3,2) DEFAULT 0, -- 0-1 scale
    first_time_contributor_friendly BOOLEAN DEFAULT false,
    
    -- Activity tracking
    last_activity TIMESTAMP WITH TIME ZONE,
    last_analyzed TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_github_id CHECK (github_id > 0),
    CONSTRAINT valid_scores CHECK (
        health_score >= 0 AND health_score <= 100 AND
        activity_score >= 0 AND activity_score <= 100 AND
        community_score >= 0 AND community_score <= 100 AND
        documentation_score >= 0 AND documentation_score <= 100
    ),
    CONSTRAINT valid_counts CHECK (
        stars_count >= 0 AND
        forks_count >= 0 AND
        watchers_count >= 0 AND
        open_issues_count >= 0
    )
);

-- Opportunities table for contribution suggestions with AI analysis
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    
    -- GitHub issue/PR details
    github_issue_number INTEGER,
    github_pr_number INTEGER,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    labels TEXT[] DEFAULT '{}',
    
    -- Opportunity classification
    type contribution_type NOT NULL,
    status opportunity_status DEFAULT 'open',
    difficulty skill_level DEFAULT 'intermediate',
    estimated_hours INTEGER,
    priority INTEGER DEFAULT 50, -- 0-100 scale
    
    -- AI-powered matching
    title_embedding halfvec(1536), -- For semantic search
    description_embedding halfvec(1536), -- Combined with title for better matching
    complexity_score DECIMAL(5,2) DEFAULT 50, -- AI-calculated complexity
    learning_value DECIMAL(5,2) DEFAULT 50, -- Educational value
    impact_score DECIMAL(5,2) DEFAULT 50, -- Potential impact of contribution
    
    -- Skill requirements
    required_skills TEXT[] DEFAULT '{}',
    nice_to_have_skills TEXT[] DEFAULT '{}',
    technologies TEXT[] DEFAULT '{}',
    
    -- Contribution context
    mentorship_available BOOLEAN DEFAULT false,
    good_first_issue BOOLEAN DEFAULT false,
    help_wanted BOOLEAN DEFAULT false,
    bounty_available BOOLEAN DEFAULT false,
    bounty_amount DECIMAL(10,2),
    
    -- Tracking
    view_count INTEGER DEFAULT 0,
    application_count INTEGER DEFAULT 0,
    completion_count INTEGER DEFAULT 0,
    
    -- Time tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 100),
    CONSTRAINT valid_estimated_hours CHECK (estimated_hours IS NULL OR estimated_hours > 0),
    CONSTRAINT valid_scores CHECK (
        complexity_score >= 0 AND complexity_score <= 100 AND
        learning_value >= 0 AND learning_value <= 100 AND
        impact_score >= 0 AND impact_score <= 100
    ),
    CONSTRAINT valid_counts CHECK (
        view_count >= 0 AND
        application_count >= 0 AND
        completion_count >= 0
    ),
    CONSTRAINT has_github_reference CHECK (
        github_issue_number IS NOT NULL OR github_pr_number IS NOT NULL
    )
);

-- User preferences for personalized recommendations
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Content preferences
    preferred_contribution_types contribution_type[] DEFAULT '{}',
    preferred_difficulty skill_level[] DEFAULT '{}',
    preferred_languages TEXT[] DEFAULT '{}',
    preferred_topics TEXT[] DEFAULT '{}',
    
    -- Filtering preferences
    min_stars INTEGER DEFAULT 0,
    max_estimated_hours INTEGER,
    require_mentorship BOOLEAN DEFAULT false,
    prefer_good_first_issues BOOLEAN DEFAULT false,
    
    -- Notification preferences
    notification_types notification_type[] DEFAULT '{email}',
    notification_frequency INTEGER DEFAULT 24, -- Hours between notifications
    max_notifications_per_day INTEGER DEFAULT 5,
    
    -- AI tuning
    exploration_vs_exploitation DECIMAL(3,2) DEFAULT 0.7, -- 0=exploit, 1=explore
    diversity_preference DECIMAL(3,2) DEFAULT 0.5, -- How diverse recommendations should be
    
    -- Time preferences
    timezone VARCHAR(100) DEFAULT 'UTC',
    available_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- 1=Monday, 7=Sunday
    available_hours INTEGER[] DEFAULT '{9,10,11,12,13,14,15,16,17}', -- 24-hour format
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_hours CHECK (max_estimated_hours IS NULL OR max_estimated_hours > 0),
    CONSTRAINT valid_frequency CHECK (notification_frequency > 0),
    CONSTRAINT valid_max_notifications CHECK (max_notifications_per_day > 0),
    CONSTRAINT valid_exploration CHECK (exploration_vs_exploitation >= 0 AND exploration_vs_exploitation <= 1),
    CONSTRAINT valid_diversity CHECK (diversity_preference >= 0 AND diversity_preference <= 1),
    CONSTRAINT unique_user_preferences UNIQUE(user_id)
);

-- Notifications for user engagement
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
    
    -- Notification details
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Delivery tracking
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    
    -- External delivery tracking
    external_id VARCHAR(255), -- For webhook/email service tracking
    delivery_status VARCHAR(50) DEFAULT 'pending',
    delivery_error TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_delivery_sequence CHECK (
        read_at IS NULL OR read_at >= sent_at
    )
);

-- Track contribution outcomes for learning and improvement
CREATE TABLE contribution_outcomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
    
    -- Outcome tracking
    status outcome_status DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- GitHub integration
    github_pr_url TEXT,
    github_pr_number INTEGER,
    
    -- Quality metrics
    code_quality_score INTEGER, -- 0-100, if available
    review_feedback_score INTEGER, -- 0-100, based on review sentiment
    time_to_completion INTEGER, -- Hours from start to completion
    
    -- Learning outcome
    difficulty_rating INTEGER, -- 1-5, user-provided
    learning_rating INTEGER, -- 1-5, how much they learned
    would_recommend BOOLEAN,
    feedback TEXT,
    
    -- AI analysis
    success_factors TEXT[], -- What made this successful
    improvement_areas TEXT[], -- What could be improved
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_scores CHECK (
        (code_quality_score IS NULL OR (code_quality_score >= 0 AND code_quality_score <= 100)) AND
        (review_feedback_score IS NULL OR (review_feedback_score >= 0 AND review_feedback_score <= 100))
    ),
    CONSTRAINT valid_ratings CHECK (
        (difficulty_rating IS NULL OR (difficulty_rating >= 1 AND difficulty_rating <= 5)) AND
        (learning_rating IS NULL OR (learning_rating >= 1 AND learning_rating <= 5))
    ),
    CONSTRAINT valid_completion CHECK (
        completed_at IS NULL OR completed_at >= started_at
    )
);

-- Track user interactions with repositories for recommendation learning
CREATE TABLE user_repository_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    
    -- Interaction types
    starred BOOLEAN DEFAULT false,
    forked BOOLEAN DEFAULT false,
    watched BOOLEAN DEFAULT false,
    visited BOOLEAN DEFAULT false,
    contributed BOOLEAN DEFAULT false,
    
    -- Engagement metrics
    visit_count INTEGER DEFAULT 0,
    time_spent_seconds INTEGER DEFAULT 0,
    opportunities_viewed INTEGER DEFAULT 0,
    opportunities_applied INTEGER DEFAULT 0,
    
    -- Timing
    first_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_counts CHECK (
        visit_count >= 0 AND
        time_spent_seconds >= 0 AND
        opportunities_viewed >= 0 AND
        opportunities_applied >= 0
    ),
    CONSTRAINT unique_user_repo_interaction UNIQUE(user_id, repository_id)
);

-- Create indexes for performance

-- User indexes
CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_github_username ON users(github_username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_skill_level ON users(skill_level);
CREATE INDEX idx_users_last_active ON users(last_active);
CREATE INDEX idx_users_preferred_languages ON users USING GIN(preferred_languages);

-- HNSW index for user profile embeddings (vector similarity search)
CREATE INDEX idx_users_profile_embedding_hnsw ON users 
USING hnsw (profile_embedding halfvec_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Repository indexes
CREATE INDEX idx_repositories_github_id ON repositories(github_id);
CREATE INDEX idx_repositories_full_name ON repositories(full_name);
CREATE INDEX idx_repositories_owner_login ON repositories(owner_login);
CREATE INDEX idx_repositories_language ON repositories(language);
CREATE INDEX idx_repositories_status ON repositories(status);
CREATE INDEX idx_repositories_health_score ON repositories(health_score DESC);
CREATE INDEX idx_repositories_stars_count ON repositories(stars_count DESC);
CREATE INDEX idx_repositories_last_activity ON repositories(last_activity);
CREATE INDEX idx_repositories_topics ON repositories USING GIN(topics);
CREATE INDEX idx_repositories_languages ON repositories USING GIN(languages);

-- HNSW index for repository description embeddings
CREATE INDEX idx_repositories_embedding_hnsw ON repositories 
USING hnsw (description_embedding halfvec_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Opportunity indexes
CREATE INDEX idx_opportunities_repository_id ON opportunities(repository_id);
CREATE INDEX idx_opportunities_type ON opportunities(type);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_difficulty ON opportunities(difficulty);
CREATE INDEX idx_opportunities_priority ON opportunities(priority DESC);
CREATE INDEX idx_opportunities_good_first_issue ON opportunities(good_first_issue);
CREATE INDEX idx_opportunities_help_wanted ON opportunities(help_wanted);
CREATE INDEX idx_opportunities_created_at ON opportunities(created_at DESC);
CREATE INDEX idx_opportunities_labels ON opportunities USING GIN(labels);
CREATE INDEX idx_opportunities_required_skills ON opportunities USING GIN(required_skills);

-- HNSW indexes for opportunity embeddings
CREATE INDEX idx_opportunities_title_embedding_hnsw ON opportunities 
USING hnsw (title_embedding halfvec_cosine_ops) 
WITH (m = 16, ef_construction = 200);

CREATE INDEX idx_opportunities_description_embedding_hnsw ON opportunities 
USING hnsw (description_embedding halfvec_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Text search indexes using pg_trgm
CREATE INDEX idx_repositories_description_trgm ON repositories USING GIN(description gin_trgm_ops);
CREATE INDEX idx_repositories_name_trgm ON repositories USING GIN(name gin_trgm_ops);
CREATE INDEX idx_opportunities_title_trgm ON opportunities USING GIN(title gin_trgm_ops);
CREATE INDEX idx_opportunities_description_trgm ON opportunities USING GIN(description gin_trgm_ops);

-- User preference indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_contribution_types ON user_preferences USING GIN(preferred_contribution_types);
CREATE INDEX idx_user_preferences_languages ON user_preferences USING GIN(preferred_languages);

-- Notification indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_opportunity_id ON notifications(opportunity_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_sent_at ON notifications(sent_at);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);

-- Outcome tracking indexes
CREATE INDEX idx_contribution_outcomes_user_id ON contribution_outcomes(user_id);
CREATE INDEX idx_contribution_outcomes_opportunity_id ON contribution_outcomes(opportunity_id);
CREATE INDEX idx_contribution_outcomes_status ON contribution_outcomes(status);
CREATE INDEX idx_contribution_outcomes_started_at ON contribution_outcomes(started_at);

-- User interaction indexes
CREATE INDEX idx_user_repository_interactions_user_id ON user_repository_interactions(user_id);
CREATE INDEX idx_user_repository_interactions_repository_id ON user_repository_interactions(repository_id);
CREATE INDEX idx_user_repository_interactions_contributed ON user_repository_interactions(contributed);
CREATE INDEX idx_user_repository_interactions_last_interaction ON user_repository_interactions(last_interaction);

-- Create trigger function for updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON repositories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON opportunities 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contribution_outcomes_updated_at BEFORE UPDATE ON contribution_outcomes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_repository_interactions_updated_at BEFORE UPDATE ON user_repository_interactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();