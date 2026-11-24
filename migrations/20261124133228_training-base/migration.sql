CREATE TABLE `training_competencies` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'retired' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "training_competencies_status" CHECK("status" IN ('active', 'retired')),
	CONSTRAINT "training_competencies_title" CHECK(length("title") BETWEEN 1 AND 80),
	CONSTRAINT "training_competencies_description" CHECK("description" IS NULL OR length("description") <= 500)
);
--> statement-breakpoint
CREATE TABLE `training_competency_routes` (
	`id` text PRIMARY KEY,
	`competency_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_competency_routes_competency_id_training_competencies_id_fk` FOREIGN KEY (`competency_id`) REFERENCES `training_competencies`(`id`),
	CONSTRAINT "training_competency_routes_position_from_one" CHECK("position" >= 1),
	CONSTRAINT "training_competency_routes_status" CHECK("status" IN ('active', 'retired')),
	CONSTRAINT "training_competency_routes_label" CHECK(length("label") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `training_course_steps` (
	`id` text PRIMARY KEY,
	`version_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`needed_for` text DEFAULT 'both' NOT NULL,
	`times_required` integer DEFAULT 1 NOT NULL,
	`guidance` text,
	`material_url` text,
	`material_file_id` text,
	`evidence_expiry` text,
	`evidence_file` text,
	`form_id` text,
	`form_version_id` text,
	`max_attempts` integer,
	`retry_after` integer,
	`show_answers` text,
	`source_id` text,
	`source_params` text,
	`qualifications` text,
	`other_qualification` integer,
	`carries_step_id` text,
	CONSTRAINT `fk_training_course_steps_version_id_training_course_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `training_course_versions`(`id`),
	CONSTRAINT `fk_training_course_steps_material_file_id_core_files_id_fk` FOREIGN KEY (`material_file_id`) REFERENCES `core_files`(`id`),
	CONSTRAINT `fk_training_course_steps_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT `fk_training_course_steps_form_version_id_forms_versions_id_fk` FOREIGN KEY (`form_version_id`) REFERENCES `forms_versions`(`id`),
	CONSTRAINT `fk_training_course_steps_carries_step_id_training_course_steps_id_fk` FOREIGN KEY (`carries_step_id`) REFERENCES `training_course_steps`(`id`),
	CONSTRAINT "training_course_steps_position_range" CHECK("position" BETWEEN 1 AND 20),
	CONSTRAINT "training_course_steps_kind" CHECK("kind" IN ('session', 'practical', 'activity', 'reading', 'lesson', 'quiz', 'certificate', 'declaration')),
	CONSTRAINT "training_course_steps_needed_for" CHECK("needed_for" IN ('first', 'renewal', 'both')),
	CONSTRAINT "training_course_steps_title" CHECK(length("title") BETWEEN 1 AND 120),
	CONSTRAINT "training_course_steps_times" CHECK("times_required" BETWEEN 1 AND 20 AND ("times_required" = 1 OR "kind" IN ('practical', 'activity'))),
	CONSTRAINT "training_course_steps_guidance" CHECK("guidance" IS NULL OR length("guidance") <= 2000),
	CONSTRAINT "training_course_steps_evidence" CHECK(("kind" = 'certificate') = ("evidence_expiry" IS NOT NULL) AND ("kind" IN ('certificate', 'declaration')) = ("evidence_file" IS NOT NULL)),
	CONSTRAINT "training_course_steps_form" CHECK(("kind" = 'quiz' AND "form_id" IS NOT NULL) OR "kind" = 'declaration' OR ("form_id" IS NULL AND "form_version_id" IS NULL)),
	CONSTRAINT "training_course_steps_quiz" CHECK("kind" = 'quiz' OR ("max_attempts" IS NULL AND "retry_after" IS NULL AND "show_answers" IS NULL)),
	CONSTRAINT "training_course_steps_attempts" CHECK("max_attempts" IS NULL OR "max_attempts" BETWEEN 1 AND 20),
	CONSTRAINT "training_course_steps_source" CHECK(("kind" = 'activity') = ("source_id" IS NOT NULL) AND ("kind" = 'activity' OR "source_params" IS NULL)),
	CONSTRAINT "training_course_steps_qualifications" CHECK("kind" = 'certificate' OR ("qualifications" IS NULL AND "other_qualification" IS NULL)),
	CONSTRAINT "training_course_steps_lesson" CHECK("kind" != 'lesson' OR ("guidance" IS NULL AND "material_url" IS NULL AND "material_file_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `training_course_trainers` (
	`course_id` text NOT NULL,
	`account_id` text NOT NULL,
	`added_by` text,
	`added_at` integer NOT NULL,
	CONSTRAINT `training_course_trainers_pk` PRIMARY KEY(`course_id`, `account_id`),
	CONSTRAINT `fk_training_course_trainers_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_course_versions` (
	`id` text PRIMARY KEY,
	`course_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'in-preparation' NOT NULL,
	`change_kind` text,
	`change_note` text,
	`cut_to` integer,
	`published_by` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_training_course_versions_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT "training_course_versions_number_from_one" CHECK("number" >= 1),
	CONSTRAINT "training_course_versions_status" CHECK("status" IN ('in-preparation', 'live', 'replaced')),
	CONSTRAINT "training_course_versions_change" CHECK(("status" = 'in-preparation') = ("change_kind" IS NULL) AND ("change_kind" IS NULL OR "change_kind" IN ('records-stand', 'retraining-required'))),
	CONSTRAINT "training_course_versions_first" CHECK("number" > 1 OR "change_kind" IS NULL OR "change_kind" = 'records-stand'),
	CONSTRAINT "training_course_versions_note" CHECK("change_note" IS NULL OR length("change_note") <= 500)
);
--> statement-breakpoint
CREATE TABLE `training_courses` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text,
	`category_term_id` text,
	`expires` integer NOT NULL,
	`valid_for` integer,
	`self_sign_up` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'unpublished' NOT NULL,
	`live_version_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_courses_category_term_id_core_terms_id_fk` FOREIGN KEY (`category_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_training_courses_live_version_id_training_course_versions_id_fk` FOREIGN KEY (`live_version_id`) REFERENCES `training_course_versions`(`id`),
	CONSTRAINT "training_courses_status_values" CHECK("status" IN ('unpublished', 'live', 'retired')),
	CONSTRAINT "training_courses_title" CHECK(length("title") BETWEEN 1 AND 120),
	CONSTRAINT "training_courses_summary" CHECK("summary" IS NULL OR length("summary") <= 500),
	CONSTRAINT "training_courses_valid_for" CHECK(("expires" = 1 AND "valid_for" > 0) OR ("expires" = 0 AND "valid_for" IS NULL)),
	CONSTRAINT "training_courses_live" CHECK(("status" = 'unpublished') = ("live_version_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `training_evidence` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`course_id` text NOT NULL,
	`step_id` text NOT NULL,
	`kind` text NOT NULL,
	`issuer` text,
	`reference` text,
	`issued_on` text,
	`expires_on` text,
	`qualification` text,
	`statement` text,
	`organisation` text,
	`done_from` text,
	`done_to` text,
	`link_url` text,
	`referee` text,
	`response_id` text,
	`file_id` text,
	`seen_only` integer DEFAULT false NOT NULL,
	`state` text DEFAULT 'submitted' NOT NULL,
	`submitted_by` text NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`reject_reason` text,
	`retention_due_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_evidence_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT `fk_training_evidence_step_id_training_course_steps_id_fk` FOREIGN KEY (`step_id`) REFERENCES `training_course_steps`(`id`),
	CONSTRAINT `fk_training_evidence_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_training_evidence_file_id_core_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `core_files`(`id`),
	CONSTRAINT "training_evidence_kind" CHECK("kind" IN ('certificate', 'declaration')),
	CONSTRAINT "training_evidence_state" CHECK("state" IN ('submitted', 'verified', 'rejected', 'withdrawn')),
	CONSTRAINT "training_evidence_certificate" CHECK("kind" != 'certificate' OR ("issuer" IS NOT NULL AND "issued_on" IS NOT NULL)),
	CONSTRAINT "training_evidence_declaration" CHECK("kind" != 'declaration' OR "statement" IS NOT NULL),
	CONSTRAINT "training_evidence_lengths" CHECK(("issuer" IS NULL OR length("issuer") <= 120) AND ("reference" IS NULL OR length("reference") <= 80) AND ("qualification" IS NULL OR length("qualification") <= 120)
      AND ("statement" IS NULL OR length("statement") <= 2000) AND ("organisation" IS NULL OR length("organisation") <= 120) AND ("link_url" IS NULL OR length("link_url") <= 500)
      AND ("referee" IS NULL OR length("referee") <= 200) AND ("reject_reason" IS NULL OR length("reject_reason") <= 300)),
	CONSTRAINT "training_evidence_days" CHECK(("issued_on" IS NULL OR "issued_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') AND ("expires_on" IS NULL OR ("expires_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND ("issued_on" IS NULL OR "expires_on" > "issued_on")))
      AND ("done_from" IS NULL OR "done_from" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') AND ("done_to" IS NULL OR ("done_to" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND ("done_from" IS NULL OR "done_to" >= "done_from")))),
	CONSTRAINT "training_evidence_seen_only" CHECK("seen_only" = 0 OR "file_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `training_lesson_progress` (
	`account_id` text NOT NULL,
	`section_id` text NOT NULL,
	`step_id` text NOT NULL,
	`reached_at` integer NOT NULL,
	CONSTRAINT `training_lesson_progress_pk` PRIMARY KEY(`account_id`, `section_id`),
	CONSTRAINT `fk_training_lesson_progress_section_id_training_lesson_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `training_lesson_sections`(`id`),
	CONSTRAINT `fk_training_lesson_progress_step_id_training_course_steps_id_fk` FOREIGN KEY (`step_id`) REFERENCES `training_course_steps`(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_lesson_sections` (
	`id` text PRIMARY KEY,
	`step_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`video_url` text,
	`video_id` text,
	`video_caption_note` text,
	`scenario_id` text,
	`carries_section_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_lesson_sections_step_id_training_course_steps_id_fk` FOREIGN KEY (`step_id`) REFERENCES `training_course_steps`(`id`),
	CONSTRAINT `fk_training_lesson_sections_video_id_training_videos_id_fk` FOREIGN KEY (`video_id`) REFERENCES `training_videos`(`id`),
	CONSTRAINT `fk_training_lesson_sections_carries_section_id_training_lesson_sections_id_fk` FOREIGN KEY (`carries_section_id`) REFERENCES `training_lesson_sections`(`id`),
	CONSTRAINT "training_lesson_sections_position_range" CHECK("position" BETWEEN 1 AND 30),
	CONSTRAINT "training_lesson_sections_kind" CHECK("kind" IN ('content', 'practice')),
	CONSTRAINT "training_lesson_sections_title" CHECK(length("title") BETWEEN 1 AND 120),
	CONSTRAINT "training_lesson_sections_body" CHECK("body" IS NULL OR length("body") <= 20000),
	CONSTRAINT "training_lesson_sections_one_video" CHECK("video_url" IS NULL OR "video_id" IS NULL),
	CONSTRAINT "training_lesson_sections_caption" CHECK("video_caption_note" IS NULL OR length("video_caption_note") <= 200),
	CONSTRAINT "training_lesson_sections_scenario" CHECK(("kind" = 'practice') = ("scenario_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `training_quiz_attempts` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`course_id` text NOT NULL,
	`step_id` text NOT NULL,
	`kind` text NOT NULL,
	`response_id` text,
	`form_version_id` text,
	`score` integer,
	`out_of` integer,
	`passed` integer,
	`allowed_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_training_quiz_attempts_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT `fk_training_quiz_attempts_step_id_training_course_steps_id_fk` FOREIGN KEY (`step_id`) REFERENCES `training_course_steps`(`id`),
	CONSTRAINT `fk_training_quiz_attempts_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_training_quiz_attempts_form_version_id_forms_versions_id_fk` FOREIGN KEY (`form_version_id`) REFERENCES `forms_versions`(`id`),
	CONSTRAINT "training_quiz_attempts_kind" CHECK("kind" IN ('attempt', 'allowance')),
	CONSTRAINT "training_quiz_attempts_attempt" CHECK("kind" != 'attempt' OR ("response_id" IS NOT NULL AND "form_version_id" IS NOT NULL AND "score" IS NOT NULL AND "out_of" IS NOT NULL AND "passed" IS NOT NULL AND "score" BETWEEN 0 AND "out_of")),
	CONSTRAINT "training_quiz_attempts_allowance" CHECK("kind" != 'allowance' OR ("allowed_by" IS NOT NULL AND "response_id" IS NULL)),
	CONSTRAINT "training_quiz_attempts_note" CHECK("note" IS NULL OR length("note") <= 300)
);
--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`course_id` text NOT NULL,
	`version_id` text NOT NULL,
	`origin` text NOT NULL,
	`sign_off_ids` text DEFAULT '[]' NOT NULL,
	`awarded_at` integer NOT NULL,
	`awarded_by` text,
	`direct_reason` text,
	`expires_at` integer,
	`natural_expires_at` integer,
	`cut_reason` text,
	`status` text DEFAULT 'awarded' NOT NULL,
	`ended_at` integer,
	`superseded_by` text,
	`revoked_by` text,
	`revoke_code` text,
	`revoke_note` text,
	`warned_at` integer,
	`lapse_announced_at` integer,
	`retention_due_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_records_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT `fk_training_records_version_id_training_course_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `training_course_versions`(`id`),
	CONSTRAINT `fk_training_records_superseded_by_training_records_id_fk` FOREIGN KEY (`superseded_by`) REFERENCES `training_records`(`id`),
	CONSTRAINT "training_records_origin" CHECK("origin" IN ('steps', 'direct', 'import')),
	CONSTRAINT "training_records_status" CHECK("status" IN ('awarded', 'superseded', 'revoked')),
	CONSTRAINT "training_records_direct" CHECK("origin" != 'direct' OR ("direct_reason" IS NOT NULL AND "awarded_by" IS NOT NULL)),
	CONSTRAINT "training_records_ended" CHECK(("status" = 'awarded') = ("ended_at" IS NULL)),
	CONSTRAINT "training_records_superseded" CHECK(("status" = 'superseded') = ("superseded_by" IS NOT NULL)),
	CONSTRAINT "training_records_revoked" CHECK(("status" = 'revoked') = ("revoke_code" IS NOT NULL) AND ("revoke_code" IS NULL OR "revoke_code" IN ('entered-in-error', 'no-longer-competent', 'left', 'other'))),
	CONSTRAINT "training_records_cut" CHECK(("cut_reason" IS NULL) = ("natural_expires_at" IS NULL)),
	CONSTRAINT "training_records_lengths" CHECK(("direct_reason" IS NULL OR length("direct_reason") <= 500) AND ("revoke_note" IS NULL OR length("revoke_note") <= 500))
);
--> statement-breakpoint
CREATE TABLE `training_route_items` (
	`route_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`course_id` text,
	`requirement_ref` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `training_route_items_pk` PRIMARY KEY(`route_id`, `position`),
	CONSTRAINT `fk_training_route_items_route_id_training_competency_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `training_competency_routes`(`id`),
	CONSTRAINT `fk_training_route_items_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT "training_route_items_position_from_one" CHECK("position" >= 1),
	CONSTRAINT "training_route_items_one_kind" CHECK(("kind" = 'course' AND "course_id" IS NOT NULL AND "requirement_ref" IS NULL) OR ("kind" = 'recognised' AND "course_id" IS NULL AND "requirement_ref" IS NOT NULL)),
	CONSTRAINT "training_route_items_not_training" CHECK("requirement_ref" IS NULL OR ("requirement_ref" NOT LIKE 'training:%' AND "requirement_ref" NOT LIKE 'fact:training.%' AND length("requirement_ref") <= 200))
);
--> statement-breakpoint
CREATE TABLE `training_session_places` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`account_id` text NOT NULL,
	`state` text NOT NULL,
	`counted` integer NOT NULL,
	`waiting_since` integer,
	`added_by` text NOT NULL,
	`cancelled_at` integer,
	`cancel_kind` text,
	`marked_by` text,
	`marked_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_session_places_session_id_training_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`),
	CONSTRAINT "training_session_places_state" CHECK("state" IN ('booked', 'waiting', 'cancelled', 'attended', 'absent')),
	CONSTRAINT "training_session_places_counted" CHECK("counted" = (CASE WHEN "state" IN ('booked', 'attended', 'absent') THEN 1 ELSE 0 END)),
	CONSTRAINT "training_session_places_waiting_since" CHECK(("state" = 'waiting') <= ("waiting_since" IS NOT NULL)),
	CONSTRAINT "training_session_places_cancel" CHECK(("state" = 'cancelled') = ("cancel_kind" IS NOT NULL) AND ("cancel_kind" IS NULL OR "cancel_kind" IN ('self', 'staff', 'session-cancelled', 'merge'))),
	CONSTRAINT "training_session_places_note" CHECK("note" IS NULL OR length("note") <= 300)
);
--> statement-breakpoint
CREATE TABLE `training_session_trainers` (
	`session_id` text NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `training_session_trainers_pk` PRIMARY KEY(`session_id`, `account_id`),
	CONSTRAINT `fk_training_session_trainers_session_id_training_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY,
	`course_id` text NOT NULL,
	`version_id` text NOT NULL,
	`title` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`space_id` text,
	`place_note` text,
	`capacity` integer NOT NULL,
	`places_taken` integer DEFAULT 0 NOT NULL,
	`sign_up` text DEFAULT 'open' NOT NULL,
	`status` text DEFAULT 'unpublished' NOT NULL,
	`cancel_reason` text,
	`attendance_closed_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_training_sessions_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT `fk_training_sessions_version_id_training_course_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `training_course_versions`(`id`),
	CONSTRAINT `fk_training_sessions_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT "training_sessions_times" CHECK("ends_at" > "starts_at"),
	CONSTRAINT "training_sessions_capacity" CHECK("capacity" >= 1),
	CONSTRAINT "training_sessions_full" CHECK("places_taken" BETWEEN 0 AND "capacity"),
	CONSTRAINT "training_sessions_sign_up" CHECK("sign_up" IN ('open', 'invited')),
	CONSTRAINT "training_sessions_status_values" CHECK("status" IN ('unpublished', 'published', 'cancelled', 'completed')),
	CONSTRAINT "training_sessions_title" CHECK("title" IS NULL OR length("title") BETWEEN 1 AND 120),
	CONSTRAINT "training_sessions_note" CHECK("place_note" IS NULL OR length("place_note") <= 200),
	CONSTRAINT "training_sessions_reason" CHECK("cancel_reason" IS NULL OR length("cancel_reason") <= 300)
);
--> statement-breakpoint
CREATE TABLE `training_sign_offs` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`course_id` text NOT NULL,
	`step_id` text NOT NULL,
	`kind` text NOT NULL,
	`signed_by` text,
	`occurred_on` text NOT NULL,
	`place_id` text,
	`evidence_id` text,
	`attempt_id` text,
	`source_id` text,
	`source_ref` text,
	`confirmed_by` text,
	`voids_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_training_sign_offs_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT `fk_training_sign_offs_step_id_training_course_steps_id_fk` FOREIGN KEY (`step_id`) REFERENCES `training_course_steps`(`id`),
	CONSTRAINT `fk_training_sign_offs_place_id_training_session_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `training_session_places`(`id`),
	CONSTRAINT `fk_training_sign_offs_evidence_id_training_evidence_id_fk` FOREIGN KEY (`evidence_id`) REFERENCES `training_evidence`(`id`),
	CONSTRAINT `fk_training_sign_offs_attempt_id_training_quiz_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `training_quiz_attempts`(`id`),
	CONSTRAINT `fk_training_sign_offs_voids_id_training_sign_offs_id_fk` FOREIGN KEY (`voids_id`) REFERENCES `training_sign_offs`(`id`),
	CONSTRAINT "training_sign_offs_kind" CHECK("kind" IN ('trainer', 'attendance', 'self', 'lesson', 'quiz', 'activity', 'evidence', 'void')),
	CONSTRAINT "training_sign_offs_day" CHECK("occurred_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "training_sign_offs_void" CHECK(("kind" = 'void') = ("voids_id" IS NOT NULL) AND ("kind" != 'void' OR "note" IS NOT NULL)),
	CONSTRAINT "training_sign_offs_attendance" CHECK(("kind" = 'attendance') = ("place_id" IS NOT NULL)),
	CONSTRAINT "training_sign_offs_evidence" CHECK(("kind" = 'evidence') = ("evidence_id" IS NOT NULL)),
	CONSTRAINT "training_sign_offs_quiz" CHECK(("kind" = 'quiz') = ("attempt_id" IS NOT NULL)),
	CONSTRAINT "training_sign_offs_activity" CHECK(("kind" = 'activity') = ("source_id" IS NOT NULL AND "source_ref" IS NOT NULL) AND ("source_ref" IS NULL OR length("source_ref") <= 64)),
	CONSTRAINT "training_sign_offs_note" CHECK("note" IS NULL OR length("note") <= 500)
);
--> statement-breakpoint
CREATE TABLE `training_videos` (
	`id` text PRIMARY KEY,
	`course_id` text NOT NULL,
	`stream_uid` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`failed_reason` text,
	`duration_seconds` integer,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`ready_at` integer,
	`deleted_at` integer,
	CONSTRAINT `fk_training_videos_course_id_training_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `training_courses`(`id`),
	CONSTRAINT "training_videos_status" CHECK("status" IN ('uploading', 'processing', 'ready', 'failed', 'deleted')),
	CONSTRAINT "training_videos_reason" CHECK("failed_reason" IS NULL OR length("failed_reason") <= 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_competencies_slug` ON `training_competencies` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_competency_routes_position` ON `training_competency_routes` (`competency_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_course_steps_position` ON `training_course_steps` (`version_id`,`position`);--> statement-breakpoint
CREATE INDEX `training_course_steps_carries` ON `training_course_steps` (`carries_step_id`);--> statement-breakpoint
CREATE INDEX `training_course_trainers_account` ON `training_course_trainers` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_course_versions_number` ON `training_course_versions` (`course_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_course_versions_preparing` ON `training_course_versions` (`course_id`) WHERE status = 'in-preparation';--> statement-breakpoint
CREATE UNIQUE INDEX `training_courses_slug` ON `training_courses` (`slug`);--> statement-breakpoint
CREATE INDEX `training_courses_status` ON `training_courses` (`status`,`title`);--> statement-breakpoint
CREATE INDEX `training_evidence_account` ON `training_evidence` (`account_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `training_evidence_queue` ON `training_evidence` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `training_lesson_progress_step` ON `training_lesson_progress` (`account_id`,`step_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_lesson_sections_position` ON `training_lesson_sections` (`step_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_quiz_attempts_response` ON `training_quiz_attempts` (`response_id`) WHERE response_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `training_quiz_attempts_step` ON `training_quiz_attempts` (`account_id`,`step_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_records_awarded` ON `training_records` (`account_id`,`course_id`) WHERE status = 'awarded';--> statement-breakpoint
CREATE INDEX `training_records_course` ON `training_records` (`course_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `training_records_expiry` ON `training_records` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `training_route_items_course` ON `training_route_items` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_session_places_once` ON `training_session_places` (`session_id`,`account_id`) WHERE state != 'cancelled';--> statement-breakpoint
CREATE INDEX `training_session_places_account` ON `training_session_places` (`account_id`);--> statement-breakpoint
CREATE INDEX `training_session_places_waiting` ON `training_session_places` (`session_id`,`state`,`waiting_since`);--> statement-breakpoint
CREATE INDEX `training_session_trainers_account` ON `training_session_trainers` (`account_id`);--> statement-breakpoint
CREATE INDEX `training_sessions_course` ON `training_sessions` (`course_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `training_sessions_space` ON `training_sessions` (`space_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `training_sessions_status` ON `training_sessions` (`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `training_sign_offs_progress` ON `training_sign_offs` (`account_id`,`course_id`,`step_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_sign_offs_voids` ON `training_sign_offs` (`voids_id`) WHERE voids_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `training_sign_offs_activity_once` ON `training_sign_offs` (`course_id`,`account_id`,`source_id`,`source_ref`) WHERE kind = 'activity';--> statement-breakpoint
CREATE UNIQUE INDEX `training_videos_stream` ON `training_videos` (`stream_uid`);--> statement-breakpoint
CREATE INDEX `training_videos_course` ON `training_videos` (`course_id`,`status`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `training_sign_offs_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `training_sign_offs_append_only_delete` BEFORE DELETE ON `training_sign_offs` BEGIN SELECT RAISE(ABORT, 'append-only: training_sign_offs'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `training_sign_offs_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `training_sign_offs_append_only_update` BEFORE UPDATE ON `training_sign_offs` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`course_id` IS OLD.`course_id` AND NEW.`step_id` IS OLD.`step_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`signed_by` IS OLD.`signed_by` AND NEW.`occurred_on` IS OLD.`occurred_on` AND NEW.`place_id` IS OLD.`place_id` AND NEW.`evidence_id` IS OLD.`evidence_id` AND NEW.`attempt_id` IS OLD.`attempt_id` AND NEW.`source_id` IS OLD.`source_id` AND NEW.`source_ref` IS OLD.`source_ref` AND NEW.`confirmed_by` IS OLD.`confirmed_by` AND NEW.`voids_id` IS OLD.`voids_id` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: training_sign_offs'); END;
--> statement-breakpoint
CREATE TRIGGER `training_session_places_taken_insert` AFTER INSERT ON `training_session_places` WHEN NEW.`counted` = 1 BEGIN UPDATE `training_sessions` SET `places_taken` = `places_taken` + 1 WHERE `id` = NEW.`session_id`; END;
--> statement-breakpoint
CREATE TRIGGER `training_session_places_taken_update` AFTER UPDATE OF `counted` ON `training_session_places` WHEN NEW.`counted` <> OLD.`counted` BEGIN UPDATE `training_sessions` SET `places_taken` = `places_taken` + NEW.`counted` - OLD.`counted` WHERE `id` = NEW.`session_id`; END;
--> statement-breakpoint
CREATE TRIGGER `training_session_places_taken_delete` AFTER DELETE ON `training_session_places` WHEN OLD.`counted` = 1 BEGIN UPDATE `training_sessions` SET `places_taken` = `places_taken` - 1 WHERE `id` = OLD.`session_id`; END;
