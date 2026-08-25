-- Hand-authored: a data repair has no Drizzle schema to generate from.
-- 0050 turned every stock_product_id pointer into a recipe row, including the
-- ones that pointed at their own product. A product that stocks itself must
-- have NO recipe: resolveLine() reads an empty recipe as "one whole container
-- of itself" (ADR-0036), but reads a self-referencing one as an ingredient
-- that is not stocked, and refuses the sale.
--
-- WARNING, and the reason this file is left exactly as it ran: the restore
-- below is wrong. It claimed 0050 had copied container_ml into the recipe
-- row's qty. 0050 copied `coalesce(depletes_qty, 1)`, which is a depletion
-- quantity and never a container size, so a 70 cl bottle that pointed at
-- itself came out of this holding 25, 35 or 1 rather than 700. 0051 has since
-- dropped depletes_qty, so nothing in the database can recover the real size.
-- Detection and repair: docs/09-known-issues.md #bar-container-size-lost.
UPDATE bar_products SET container_ml = (
  SELECT r.qty FROM bar_recipe_items r
  WHERE r.product_id = bar_products.id AND r.component_product_id = bar_products.id
)
WHERE container_ml IS NULL
  AND id IN (SELECT product_id FROM bar_recipe_items WHERE product_id = component_product_id);
--> statement-breakpoint
DELETE FROM bar_recipe_items WHERE product_id = component_product_id;
