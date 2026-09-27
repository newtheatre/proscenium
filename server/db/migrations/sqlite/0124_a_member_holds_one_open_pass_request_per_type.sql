-- A member who asked twice asked once (issue 1331): keep each account's oldest open request per
-- pass type, so the index below can be built over rows that already break it.
DELETE FROM `pass_requests` WHERE `status` = 'PENDING' AND EXISTS (
  SELECT 1 FROM `pass_requests` AS `older`
  WHERE `older`.`user_id` = `pass_requests`.`user_id`
    AND `older`.`pass_type_id` = `pass_requests`.`pass_type_id`
    AND `older`.`status` = 'PENDING'
    AND (`older`.`created_at` < `pass_requests`.`created_at`
      OR (`older`.`created_at` = `pass_requests`.`created_at` AND `older`.`id` < `pass_requests`.`id`))
);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_requests_one_open` ON `pass_requests` (`user_id`,`pass_type_id`) WHERE status = 'PENDING';
