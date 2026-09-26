ALTER TABLE `stock_movements` ADD `container_cost_pence` integer;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `container_qty` integer;--> statement-breakpoint
-- Hand-authored (0100): a delivery's container cost arrives whole, with what the container held,
-- on a delivery only, and never beside a unit cost. A CHECK would rebuild this table (0010).

CREATE TRIGGER stock_movements_container_cost_is_whole
BEFORE INSERT ON stock_movements
WHEN (NEW.container_cost_pence IS NULL) <> (NEW.container_qty IS NULL)
  OR (NEW.container_cost_pence IS NOT NULL AND (
    NEW.kind <> 'DELIVERY'
    OR NEW.container_cost_pence < 0
    OR NEW.container_qty <= 0
    OR NEW.unit_cost_pence IS NOT NULL
  ))
BEGIN
  SELECT RAISE(ABORT, 'a container cost belongs to a delivery, whole: what the container cost and what it held, and no unit cost beside it');
END;
