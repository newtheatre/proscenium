CREATE INDEX `reservations_created_at_idx` ON `reservations` (`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_status_created_idx` ON `reservations` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_perf_created_idx` ON `reservations` (`performance_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_user_created_idx` ON `reservations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tickets_perf_refunded_idx` ON `tickets` (`performance_id`,`refunded_at`);--> statement-breakpoint
CREATE INDEX `tickets_res_refunded_idx` ON `tickets` (`reservation_id`,`refunded_at`);