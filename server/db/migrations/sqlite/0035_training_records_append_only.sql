-- Append-only is trigger-enforced, not a convention (decision 0010). A record admits three named
-- edits and no others: a revocation stamped once, erasure clearing its free text (0011, G-122
-- criterion 6), and recalculation restating an expiry it is allowed to restate (G-124).

CREATE TRIGGER training_records_named_edits_only
BEFORE UPDATE ON training_records
WHEN OLD.id IS NOT NEW.id
  OR OLD.user_id IS NOT NEW.user_id
  OR OLD.module_id IS NOT NEW.module_id
  OR OLD.awarded_on IS NOT NEW.awarded_on
  OR OLD.source IS NOT NEW.source
  OR OLD.session_id IS NOT NEW.session_id
  OR OLD.granted_by IS NOT NEW.granted_by
  OR OLD.expiry_overridden IS NOT NEW.expiry_overridden
  OR OLD.created_at IS NOT NEW.created_at
  OR (OLD.evidence_ref IS NOT NEW.evidence_ref AND NEW.evidence_ref IS NOT NULL)
  OR (OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS NOT NEW.revoked_at)
  OR (OLD.revoked_by IS NOT NULL AND OLD.revoked_by IS NOT NEW.revoked_by)
  OR (OLD.revoke_reason IS NOT NULL AND NEW.revoke_reason IS NOT NULL
      AND OLD.revoke_reason IS NOT NEW.revoke_reason)
  OR (OLD.expires_on IS NOT NEW.expires_on
      AND (OLD.expiry_overridden = 1 OR OLD.revoked_at IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT, 'training_records is append-only: revoke with a reason and re-grant to correct a record, and let recalculation restate an expiry');
END;
--> statement-breakpoint
CREATE TRIGGER training_records_no_delete
BEFORE DELETE ON training_records
BEGIN
  SELECT RAISE(ABORT, 'training_records is append-only: revoke with a reason, and re-grant to correct it');
END;
