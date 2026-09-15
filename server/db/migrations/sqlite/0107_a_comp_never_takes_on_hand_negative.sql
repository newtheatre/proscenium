-- Hand-authored, mirroring 0071 for the other kind that pours: a comp depletes exactly as a paid
-- sale would (F-110 criterion 4), so the last bottle cannot be given away twice.

-- It raises the sale's own name deliberately, so the one refusal path in `commitSale` and
-- `commitCompSale` covers both kinds and neither wording drifts from the other.

CREATE TRIGGER stock_movements_comp_exceeds_on_hand
BEFORE INSERT ON stock_movements
WHEN NEW.kind = 'COMP' AND (
  SELECT coalesce(sum(qty), 0) FROM stock_movements WHERE item_id = NEW.item_id
) + NEW.qty < 0
BEGIN
  SELECT RAISE(ABORT, 'stock_movements_sale_exceeds_on_hand');
END;
