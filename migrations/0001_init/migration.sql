CREATE TABLE core_guard (ok INTEGER NOT NULL CHECK (ok = 1));
CREATE TABLE lost_property_items (id TEXT PRIMARY KEY, state TEXT NOT NULL, claimant_name TEXT, description TEXT NOT NULL);
CREATE TABLE core_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, record TEXT NOT NULL, actor_name TEXT);
CREATE TABLE box_office_performances (id TEXT PRIMARY KEY, capacity INTEGER NOT NULL, sold INTEGER NOT NULL DEFAULT 0, CHECK (sold <= capacity));
CREATE TRIGGER core_audit_no_delete BEFORE DELETE ON core_audit BEGIN SELECT RAISE(ABORT, 'append-only: core_audit'); END;
CREATE TRIGGER core_audit_no_update BEFORE UPDATE ON core_audit
WHEN NOT (NEW.id IS OLD.id AND NEW.action IS OLD.action AND NEW.record IS OLD.record AND NEW.actor_name IS 'Former member')
BEGIN SELECT RAISE(ABORT, 'append-only: core_audit'); END;
