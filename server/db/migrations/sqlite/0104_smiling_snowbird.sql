CREATE INDEX `ledger_lines_variant` ON `ledger_lines` (`product_variant_id`) WHERE "ledger_lines"."product_variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `stock_movements_ref` ON `stock_movements` (`ref_table`,`ref_id`);
