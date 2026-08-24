ALTER TABLE `bar_products` RENAME COLUMN "depletes_milli" TO "depletes_qty";--> statement-breakpoint
ALTER TABLE `bar_products` RENAME COLUMN "par_milli" TO "par_qty";--> statement-breakpoint
ALTER TABLE `stock_delivery_lines` RENAME COLUMN "qty_milli" TO "qty";--> statement-breakpoint
ALTER TABLE `stock_delivery_lines` RENAME COLUMN "cost_pence_per_unit" TO "cost_pence_per_container";--> statement-breakpoint
ALTER TABLE `stock_movements` RENAME COLUMN "qty_milli" TO "qty";--> statement-breakpoint
ALTER TABLE `stock_movements` RENAME COLUMN "cost_pence_per_unit" TO "cost_pence_per_container";--> statement-breakpoint
ALTER TABLE `stocktake_lines` RENAME COLUMN "expected_milli" TO "expected_qty";--> statement-breakpoint
ALTER TABLE `stocktake_lines` RENAME COLUMN "counted_milli" TO "counted_qty";