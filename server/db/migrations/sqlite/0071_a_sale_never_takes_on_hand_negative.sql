-- Hand-authored: on-hand is derived, not a column a CHECK could read, and the predicate has to
-- sit on the write itself so two sales racing the last one resolve to one winner (0003, 0006).

CREATE TRIGGER stock_movements_sale_exceeds_on_hand
BEFORE INSERT ON stock_movements
WHEN NEW.kind = 'SALE' AND (
  SELECT coalesce(sum(qty), 0) FROM stock_movements WHERE item_id = NEW.item_id
) + NEW.qty < 0
BEGIN
  SELECT RAISE(ABORT, 'stock_movements_sale_exceeds_on_hand');
END;
