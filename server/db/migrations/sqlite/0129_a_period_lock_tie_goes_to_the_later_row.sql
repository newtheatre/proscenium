-- Two period_locks rows written in the same second were ordered by their random ids, so a close
-- and a reopen in one second resolved by chance (#1567). The trigger now breaks the tie by rowid,
-- the order they were written in. Only the trigger is recreated: period_locks is append-only and
-- is never rebuilt (decision 0010).

DROP TRIGGER IF EXISTS ledger_entries_refuses_a_closed_period;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_refuses_a_closed_period
BEFORE INSERT ON ledger_entries
WHEN (
  SELECT pl.action FROM period_locks pl
  WHERE NEW.london_day BETWEEN pl.from_day AND pl.to_day
  ORDER BY pl.created_at DESC, pl.rowid DESC
  LIMIT 1
) = 'CLOSED'
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries_refuses_a_closed_period: this period is closed, post a correction in the open period instead');
END;
