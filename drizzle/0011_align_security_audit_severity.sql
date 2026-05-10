-- Align security audit severity constraints with the application auth enum.

UPDATE security_audit_logs
SET event_severity = CASE event_severity
  WHEN 'low' THEN 'info'
  WHEN 'medium' THEN 'warning'
  WHEN 'high' THEN 'error'
  ELSE event_severity
END
WHERE event_severity IN ('low', 'medium', 'high');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'security_audit_logs_event_severity_check'
  ) THEN
    ALTER TABLE security_audit_logs
      ADD CONSTRAINT security_audit_logs_event_severity_check
      CHECK (event_severity IN ('info', 'warning', 'error', 'critical'));
  END IF;
END $$;
