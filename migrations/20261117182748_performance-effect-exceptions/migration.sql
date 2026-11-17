CREATE TABLE `core_performance_effect_exceptions` (
	`performance_id` text NOT NULL,
	`term_id` text NOT NULL,
	CONSTRAINT `core_performance_effect_exceptions_pk` PRIMARY KEY(`performance_id`, `term_id`),
	CONSTRAINT `fk_core_performance_effect_exceptions_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_performance_effect_exceptions_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`)
);
