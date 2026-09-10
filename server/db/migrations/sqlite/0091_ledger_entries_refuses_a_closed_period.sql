-- A period close is a fact appended to period_locks, never a mutation of the entries it covers
-- (decision 0010, I-107). This is the enforcement: whether a day is locked is read off the latest
-- period_locks row covering it, however many times that range has been closed and reopened, and
-- an insert into a locked day is refused here rather than trusted to whichever write path remembered.

CREATE TRIGGER ledger_entries_refuses_a_closed_period
BEFORE INSERT ON ledger_entries
WHEN (
  SELECT pl.action FROM period_locks pl
  WHERE NEW.london_day BETWEEN pl.from_day AND pl.to_day
  ORDER BY pl.created_at DESC, pl.id DESC
  LIMIT 1
) = 'CLOSED'
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries_refuses_a_closed_period: this period is closed, post a correction in the open period instead');
END;
