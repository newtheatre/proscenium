-- Hand-authored: a data conversion has no Drizzle schema to generate from.
-- Every measure that pointed at a bottle becomes a one-ingredient recipe, so
-- one mechanism says what a sale takes instead of two (ADR-0036).
INSERT INTO bar_recipe_items (id, product_id, component_product_id, choice_category_id, qty, sort)
SELECT lower(hex(randomblob(12))), id, stock_product_id, NULL, coalesce(depletes_qty, 1), 0
FROM bar_products
WHERE stock_product_id IS NOT NULL
  AND id NOT IN (SELECT product_id FROM bar_recipe_items);
--> statement-breakpoint
-- Something made of other things holds no stock, so it has no container size.
UPDATE bar_products SET container_ml = NULL
WHERE container_ml IS NOT NULL AND id IN (SELECT product_id FROM bar_recipe_items);
