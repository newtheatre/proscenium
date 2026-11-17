CREATE TABLE `bar_outlet_favourites` (
	`id` text PRIMARY KEY,
	`outlet_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_outlet_favourites_outlet_id_bar_outlets_id_fk` FOREIGN KEY (`outlet_id`) REFERENCES `bar_outlets`(`id`),
	CONSTRAINT `fk_bar_outlet_favourites_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`)
);
--> statement-breakpoint
ALTER TABLE `bar_categories` ADD `parent_id` text REFERENCES bar_categories(id);--> statement-breakpoint
ALTER TABLE `bar_outlets` ADD `till_layout` text DEFAULT 'chips' NOT NULL;--> statement-breakpoint
CREATE INDEX `bar_categories_parent` ON `bar_categories` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_outlet_favourites_pair` ON `bar_outlet_favourites` (`outlet_id`,`variant_id`);