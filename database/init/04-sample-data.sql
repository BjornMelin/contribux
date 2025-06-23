-- Sample data for testing contribux database
-- This runs last during database initialization

-- Insert sample users with embeddings (zeros for testing)
INSERT INTO users (
    id,
    github_id,
    github_username,
    github_name,
    email,
    bio,
    preferred_languages,
    skill_level,
    profile_embedding
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    12345,
    'testuser1',
    'Test User One',
    'test1@example.com',
    'Full-stack developer interested in AI and machine learning',
    ARRAY['JavaScript', 'Python', 'TypeScript'],
    'intermediate',
    ('[' || ARRAY_TO_STRING((ARRAY[0.1] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536)
);

INSERT INTO users (
    id,
    github_id,
    github_username,
    github_name,
    email,
    bio,
    preferred_languages,
    skill_level,
    profile_embedding
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    67890,
    'testuser2',
    'Test User Two',
    'test2@example.com',
    'Backend engineer with focus on distributed systems',
    ARRAY['Go', 'Rust', 'Python'],
    'advanced',
    ('[' || ARRAY_TO_STRING((ARRAY[0.2] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536)
);

-- Insert sample repositories
INSERT INTO repositories (
    id,
    github_id,
    full_name,
    name,
    description,
    url,
    clone_url,
    owner_login,
    owner_type,
    language,
    topics,
    status,
    stars_count,
    health_score,
    activity_score,
    community_score,
    documentation_score,
    description_embedding,
    first_time_contributor_friendly
) VALUES (
    '660e8400-e29b-41d4-a716-446655440000',
    111111,
    'testorg/awesome-project',
    'awesome-project',
    'An awesome open source project for learning JavaScript and React',
    'https://github.com/testorg/awesome-project',
    'https://github.com/testorg/awesome-project.git',
    'testorg',
    'Organization',
    'JavaScript',
    ARRAY['react', 'javascript', 'frontend', 'beginners'],
    'active',
    1250,
    85.5,
    78.2,
    82.1,
    90.0,
    ('[' || ARRAY_TO_STRING((ARRAY[0.1] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    true
);

INSERT INTO repositories (
    id,
    github_id,
    full_name,
    name,
    description,
    url,
    clone_url,
    owner_login,
    owner_type,
    language,
    topics,
    status,
    stars_count,
    health_score,
    activity_score,
    community_score,
    documentation_score,
    description_embedding,
    first_time_contributor_friendly
) VALUES (
    '660e8400-e29b-41d4-a716-446655440001',
    222222,
    'devuser/ml-toolkit',
    'ml-toolkit',
    'Machine learning toolkit with Python and PyTorch',
    'https://github.com/devuser/ml-toolkit',
    'https://github.com/devuser/ml-toolkit.git',
    'devuser',
    'User',
    'Python',
    ARRAY['machine-learning', 'pytorch', 'python', 'ai'],
    'active',
    892,
    78.3,
    85.7,
    76.4,
    82.8,
    ('[' || ARRAY_TO_STRING((ARRAY[0.2] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    false
);

-- Insert sample opportunities
INSERT INTO opportunities (
    id,
    repository_id,
    github_issue_number,
    title,
    description,
    url,
    labels,
    type,
    status,
    difficulty,
    estimated_hours,
    priority,
    title_embedding,
    description_embedding,
    required_skills,
    good_first_issue,
    help_wanted
) VALUES 
(
    '770e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440000',
    42,
    'Add dark mode toggle to settings page',
    'Implement a dark mode toggle in the user settings page. Should persist user preference and update the entire app theme.',
    'https://github.com/testorg/awesome-project/issues/42',
    ARRAY['enhancement', 'good-first-issue', 'frontend'],
    'feature',
    'open',
    'beginner',
    8,
    75,
    ('[' || ARRAY_TO_STRING((ARRAY[0.1] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    ('[' || ARRAY_TO_STRING((ARRAY[0.1] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    ARRAY['JavaScript', 'React', 'CSS'],
    true,
    false
),
(
    '770e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    15,
    'Optimize neural network training performance',
    'The current training loop has performance bottlenecks. Need to implement gradient accumulation and mixed precision training.',
    'https://github.com/devuser/ml-toolkit/issues/15',
    ARRAY['performance', 'optimization', 'help-wanted'],
    'bug_fix',
    'open',
    'advanced',
    20,
    90,
    ('[' || ARRAY_TO_STRING((ARRAY[0.2] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    ('[' || ARRAY_TO_STRING((ARRAY[0.2] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    ARRAY['Python', 'PyTorch', 'CUDA'],
    false,
    true
),
(
    '770e8400-e29b-41d4-a716-446655440002',
    '660e8400-e29b-41d4-a716-446655440000',
    58,
    'Write unit tests for authentication module',
    'The authentication module needs comprehensive unit tests. Should cover login, logout, password reset, and token validation.',
    'https://github.com/testorg/awesome-project/issues/58',
    ARRAY['testing', 'good-first-issue'],
    'test',
    'open',
    'intermediate',
    12,
    60,
    ('[' || ARRAY_TO_STRING((ARRAY[0.15] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    ('[' || ARRAY_TO_STRING((ARRAY[0.15] || ARRAY_FILL(0.0, ARRAY[1535])), ',') || ']')::halfvec(1536),
    ARRAY['JavaScript', 'Jest', 'Testing'],
    true,
    false
);

-- Insert sample user preferences
INSERT INTO user_preferences (
    user_id,
    preferred_contribution_types,
    preferred_difficulty,
    preferred_languages,
    min_stars,
    max_estimated_hours,
    require_mentorship,
    prefer_good_first_issues
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    ARRAY['feature', 'bug_fix']::contribution_type[],
    ARRAY['beginner', 'intermediate']::skill_level[],
    ARRAY['JavaScript', 'TypeScript', 'Python'],
    10,
    16,
    false,
    true
);

INSERT INTO user_preferences (
    user_id,
    preferred_contribution_types,
    preferred_difficulty,
    preferred_languages,
    min_stars,
    max_estimated_hours,
    require_mentorship,
    prefer_good_first_issues
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    ARRAY['feature', 'refactor']::contribution_type[],
    ARRAY['intermediate', 'advanced']::skill_level[],
    ARRAY['Go', 'Rust', 'Python'],
    50,
    25,
    false,
    false
);

-- Insert sample user-repository interactions
INSERT INTO user_repository_interactions (
    user_id,
    repository_id,
    starred,
    visited,
    visit_count,
    opportunities_viewed
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    '660e8400-e29b-41d4-a716-446655440000',
    true,
    true,
    5,
    2
);

INSERT INTO user_repository_interactions (
    user_id,
    repository_id,
    starred,
    visited,
    visit_count,
    opportunities_viewed
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    false,
    true,
    3,
    1
);

-- Update opportunity view counts for testing
UPDATE opportunities SET view_count = 25 WHERE id = '770e8400-e29b-41d4-a716-446655440000';
UPDATE opportunities SET view_count = 18 WHERE id = '770e8400-e29b-41d4-a716-446655440001';
UPDATE opportunities SET view_count = 12 WHERE id = '770e8400-e29b-41d4-a716-446655440002';

-- Verify data insertion
DO $$
BEGIN
    RAISE NOTICE 'Sample data inserted successfully:';
    RAISE NOTICE '- Users: %', (SELECT COUNT(*) FROM users);
    RAISE NOTICE '- Repositories: %', (SELECT COUNT(*) FROM repositories);
    RAISE NOTICE '- Opportunities: %', (SELECT COUNT(*) FROM opportunities);
    RAISE NOTICE '- User Preferences: %', (SELECT COUNT(*) FROM user_preferences);
    RAISE NOTICE '- User Interactions: %', (SELECT COUNT(*) FROM user_repository_interactions);
END $$;