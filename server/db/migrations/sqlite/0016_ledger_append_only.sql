-- Append-only is trigger-enforced, not a convention (decision 0010). The ledger has no exception
-- at all: a void, a refund and a correction are each a new entry pointing at what it corrects, so
-- nothing here may ever be rewritten or removed (decision 0004).

CREATE TRIGGER ledger_entries_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only: post a reversing entry that references this one');
END;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only: post a reversing entry that references this one');
END;
--> statement-breakpoint
CREATE TRIGGER ledger_lines_no_update
BEFORE UPDATE ON ledger_lines
BEGIN
  SELECT RAISE(ABORT, 'ledger_lines is append-only: correct the entry, not the line');
END;
--> statement-breakpoint
CREATE TRIGGER ledger_lines_no_delete
BEFORE DELETE ON ledger_lines
BEGIN
  SELECT RAISE(ABORT, 'ledger_lines is append-only: correct the entry, not the line');
END;
