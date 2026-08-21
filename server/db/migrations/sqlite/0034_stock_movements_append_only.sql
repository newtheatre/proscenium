-- Hand-authored: triggers cannot come from the Drizzle schema (ADR-0027).
-- On-hand is SUM(qty_milli), so an edited movement silently rewrites history
-- that a stocktake has already reconciled against.
CREATE TRIGGER stock_movements_no_update
BEFORE UPDATE OF product_id, qty_milli, kind, ref_table, ref_id, cost_pence_per_unit, created_at ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only: correct it with an opposing movement');
END;
--> statement-breakpoint
-- created_by_user_id is deliberately absent above: an estate account merge
-- re-points it, and blocking that stalls the merge hook for ever (ADR-0025).
CREATE TRIGGER stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only: correct it with an opposing movement');
END;
