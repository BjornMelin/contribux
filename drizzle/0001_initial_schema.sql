-- Initial schema migration for contribux
-- Creates core tables and extensions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id INTEGER UNIQUE NOT NULL,
  username TEXT NOT NULL,
  github_login TEXT NOT NULL,
  email TEXT,
  profile JSONB NOT NULL DEFAULT '{}',
  activity JSONB NOT NULL DEFAULT '{"last_active": null, "total_contributions": 0, "streak_days": 0}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  analysis JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(1536),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT repositories_full_name_idx UNIQUE (full_name)
);

-- Create opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_issue_id INTEGER,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  labels JSONB NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'unknown',
  contribution_type TEXT DEFAULT 'enhancement',
  tech_stack TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT opportunities_unique_issue UNIQUE (repository_id, issue_number)
);

-- Create user_repository_interactions table
CREATE TABLE IF NOT EXISTS user_repository_interactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT user_repository_interactions_idx UNIQUE (user_id, repository_id, action_type, created_at)
);

-- Create contribution_outcomes table
CREATE TABLE IF NOT EXISTS contribution_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  pr_url TEXT,
  status TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'unknown',
  github_login TEXT NOT NULL,
  time_to_complete INTEGER,
  lines_changed INTEGER,
  review_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_github_login ON users(github_login);
CREATE INDEX IF NOT EXISTS idx_repositories_github_id ON repositories(github_id);
CREATE INDEX IF NOT EXISTS idx_repositories_owner ON repositories(owner);
CREATE INDEX IF NOT EXISTS idx_opportunities_repository_id ON opportunities(repository_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_issue_number ON opportunities(issue_number);
CREATE INDEX IF NOT EXISTS idx_user_repository_interactions_user_id ON user_repository_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_repository_interactions_repository_id ON user_repository_interactions(repository_id);
CREATE INDEX IF NOT EXISTS idx_contribution_outcomes_opportunity_id ON contribution_outcomes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- HNSW indexes for vector search
CREATE INDEX IF NOT EXISTS idx_repositories_embedding ON repositories USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_opportunities_embedding ON opportunities USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);