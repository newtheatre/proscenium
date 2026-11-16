CREATE TABLE `core_terms` (
	`id` text PRIMARY KEY,
	`vocabulary_key` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`seeded` integer DEFAULT false NOT NULL,
	`retired_at` integer,
	`merged_into_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_terms_vocabulary_key_core_vocabularies_key_fk` FOREIGN KEY (`vocabulary_key`) REFERENCES `core_vocabularies`(`key`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_terms_merged_into_id_core_terms_id_fk` FOREIGN KEY (`merged_into_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_terms_label_length" CHECK(length("label") BETWEEN 1 AND 80),
	CONSTRAINT "core_terms_description_length" CHECK("description" IS NULL OR length("description") <= 300)
);
--> statement-breakpoint
CREATE TABLE `core_vocabularies` (
	`key` text PRIMARY KEY,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`ordering` text DEFAULT 'manual' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`term_class` text DEFAULT 'public' NOT NULL,
	CONSTRAINT "core_vocabularies_ordering" CHECK("ordering" IN ('manual', 'alphabetical')),
	CONSTRAINT "core_vocabularies_term_class" CHECK("term_class" IN ('public', 'internal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `core_terms_slug` ON `core_terms` (`vocabulary_key`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_terms_live_label` ON `core_terms` (`vocabulary_key`,lower("label")) WHERE "core_terms"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX `core_terms_order` ON `core_terms` (`vocabulary_key`,`sort`);