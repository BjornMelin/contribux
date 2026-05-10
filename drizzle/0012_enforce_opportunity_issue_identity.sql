-- Ensure opportunity upserts have a real conflict target.

DELETE FROM opportunities
WHERE repository_id IS NULL OR issue_number IS NULL;

ALTER TABLE opportunities
  ALTER COLUMN repository_id SET NOT NULL,
  ALTER COLUMN issue_number SET NOT NULL;
