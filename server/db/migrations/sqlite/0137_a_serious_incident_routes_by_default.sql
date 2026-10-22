-- A serious incident routes to follow-up out of the box (0235). A severity somebody has already
-- set, either way, keeps their choice: only a row nobody has touched is switched on.
UPDATE incident_severity_config SET requires_follow_up = 1, updated_at = unixepoch()
WHERE severity = 'SERIOUS' AND updated_by IS NULL;
