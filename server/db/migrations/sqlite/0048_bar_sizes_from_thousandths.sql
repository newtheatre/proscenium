-- Hand-authored: a data conversion has no Drizzle schema to generate from.
-- Thousandths of a container are exactly millilitres of a 1000 ml one, so this
-- nominal size leaves every level, par and ratio meaning what it meant before.
-- Set the real sizes in /admin/bar/catalogue before recording any stock (ADR-0035).
UPDATE bar_products SET container_ml = 1000 WHERE container_ml IS NULL;
--> statement-breakpoint
-- Only a measure poured from something else carries a depletion figure now.
UPDATE bar_products SET depletes_qty = NULL WHERE stock_product_id IS NULL AND depletes_qty IS NOT NULL;
