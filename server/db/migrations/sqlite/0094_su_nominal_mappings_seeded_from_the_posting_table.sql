CREATE TABLE `su_nominal_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`nominal_code` text,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `su_nominal_mappings_kind_source` ON `su_nominal_mappings` (`kind`,`source`);
--> statement-breakpoint
-- Every pair a ledger line can actually post under (architecture.md), seeded unmapped: nobody
-- guesses an SU nominal code, the treasurer sets each one explicitly (I-108 criterion 1).
INSERT INTO su_nominal_mappings (id, kind, source) VALUES
  ('b6549e4d78ee4cbb8a2e8e2f1a004140', 'TICKET_COLLECTION', 'DESK'),
  ('1f32725ae23f4282ba3b188b30fdf4cc', 'WALK_UP', 'DESK'),
  ('ff31564502fb4b12a2b3c4c992505065', 'PASS_SALE', 'DESK'),
  ('9275629d89ec48e58afdb9ade225a1ba', 'PASS_ADMISSION', 'DESK'),
  ('b8b01b14e6cf4358af2fd67cb91747d0', 'PASS_ADMISSION', 'SELF_SERVE'),
  ('cc3353a50c614144af9bdd41b0393726', 'BAR_ITEM', 'TILL'),
  ('d3ebb07658554cb283a7471cee0173fe', 'TAB_SETTLEMENT', 'TILL'),
  ('d419c6da0192444a9ab78678834ec633', 'REFUND', 'DESK'),
  ('ad34891d761440dc8d04e9b53a4ae576', 'IMPORT', 'IMPORT');