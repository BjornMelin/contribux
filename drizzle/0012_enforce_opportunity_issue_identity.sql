-- Ensure opportunity upserts have a real conflict target.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM opportunities
    WHERE repository_id IS NULL OR issue_number IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce opportunity issue identity: found opportunities with NULL repository_id or issue_number';
  END IF;
END $$;

ALTER TABLE opportunities
  ALTER COLUMN repository_id SET NOT NULL,
  ALTER COLUMN issue_number SET NOT NULL;
