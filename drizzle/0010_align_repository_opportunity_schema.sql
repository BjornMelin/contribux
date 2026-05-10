-- Align migrated tables with the Drizzle schema used by optimized search paths.

ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS health_metrics JSONB,
  ADD COLUMN IF NOT EXISTS overall_health_score REAL DEFAULT 0;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS difficulty_score INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS impact_score INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS match_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS computed_match_score REAL DEFAULT 0;

UPDATE repositories
SET overall_health_score = COALESCE(overall_health_score, 0);

UPDATE opportunities
SET
  description = COALESCE(description, body),
  difficulty_score = COALESCE(difficulty_score, 5),
  impact_score = COALESCE(impact_score, 5),
  match_score = COALESCE(match_score, 0),
  computed_match_score = COALESCE(computed_match_score, 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_score_range'
  ) THEN
    ALTER TABLE repositories
      ADD CONSTRAINT health_score_range
      CHECK (overall_health_score >= 0 AND overall_health_score <= 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_id_positive'
  ) THEN
    ALTER TABLE repositories
      ADD CONSTRAINT github_id_positive
      CHECK (github_id > 0);
  END IF;
END $$;
