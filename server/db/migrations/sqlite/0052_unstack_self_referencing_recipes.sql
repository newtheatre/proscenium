-- Hand-authored: a data repair has no Drizzle schema to generate from.
-- 0050 turned every stock_product_id pointer into a recipe row, including the
-- ones that pointed at their own product. A product that stocks itself must
-- have NO recipe: resolveLine() reads an empty recipe as "one whole container
-- of itself" (ADR-0036), but reads a self-referencing one as an ingredient
-- that is not stocked, and refuses the sale.
--
-- The container size those products lost is recoverable: 0050 copied it into
-- the recipe row's qty before nulling the column, so it is restored from there
-- first and the rows are dropped second.
UPDATE bar_products SET container_ml = (
  SELECT r.qty FROM bar_recipe_items r
  WHERE r.product_id = bar_products.id AND r.component_product_id = bar_products.id
)
WHERE container_ml IS NULL
  AND id IN (SELECT product_id FROM bar_recipe_items WHERE product_id = component_product_id);
--> statement-breakpoint
DELETE FROM bar_recipe_items WHERE product_id = component_product_id;
