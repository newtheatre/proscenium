-- Hand-authored: triggers cannot come from the Drizzle schema (ADR-0027).
-- 0034's column list missed `reason`, so the one free-text field an auditor
-- reads when a stocktake does not reconcile could be rewritten in place.
DROP TRIGGER IF EXISTS stock_movements_no_update;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS stock_movements_no_update
BEFORE UPDATE OF product_id, qty_milli, kind, ref_table, ref_id, cost_pence_per_unit, reason, created_at ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only: correct it with an opposing movement');
END;
--> statement-breakpoint
-- And make the existing append-only triggers re-runnable: a part-applied
-- migration is unrecorded, and its retry aborted on "trigger already exists".
DROP TRIGGER IF EXISTS stock_movements_no_delete;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only: correct it with an opposing movement');
END;
