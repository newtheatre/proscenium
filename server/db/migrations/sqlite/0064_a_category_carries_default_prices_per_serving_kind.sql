CREATE TABLE `category_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`serving_kind` text NOT NULL,
	`price_pence` integer NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "category_prices_pence" CHECK("category_prices"."price_pence" >= 0),
	CONSTRAINT "category_prices_effective_from_is_a_date" CHECK("category_prices"."effective_from" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `category_prices_resolution` ON `category_prices` (`category_id`,`serving_kind`,`effective_from`,`created_at`);--> statement-breakpoint
CREATE TRIGGER category_prices_no_update
BEFORE UPDATE ON category_prices
BEGIN
  SELECT RAISE(ABORT, 'category_prices is append-only: correct a default with a new row dated today, which wins from the moment it is written');
END;
--> statement-breakpoint
CREATE TRIGGER category_prices_no_delete
BEFORE DELETE ON category_prices
BEGIN
  SELECT RAISE(ABORT, 'category_prices is append-only: correct a default with a new row dated today, which wins from the moment it is written');
END;
