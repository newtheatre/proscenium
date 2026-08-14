-- Content warnings: replace the ACTION / DIALOGUE / TECHNICAL axis model with
-- kind (TECHNICAL | GENERAL) + level (MENTIONED | DISCUSSED | DEPICTED).
-- See docs/decisions/0004-content-warning-model.md.
--
-- Hand-edited after `nuxt db generate`, before being applied anywhere. Drizzle
-- emitted the usual `__new_*` rebuild, which would have failed twice over:
--
--   1. Both INSERT…SELECTs read columns that do not exist yet (`slug`, `level`).
--      Nothing carries over anyway — this is a deliberate clean slate.
--   2. `DROP TABLE content_warnings` drops a *parent*. D1 runs every migration
--      inside an implicit transaction with foreign keys enforced and documents
--      that a query cannot turn them off, so drizzle's `PRAGMA foreign_keys=OFF`
--      is inert there — the drop would have cascaded into show_content_warnings
--      and emptied it before the archive copy ran. Every previous rebuild in
--      this repo happened to touch a child table, which is why this has not
--      bitten before. Child is dropped first here so no cascade is possible.
--
-- Order matters throughout: archive, then drop, then recreate, then seed, then
-- remap.

-- 1. Archive the pre-rework rows verbatim. Must precede everything else.
CREATE TABLE `content_warnings_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`icon` text,
	`legacy_category` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `show_content_warnings_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`content_warning_id` text NOT NULL,
	`kind` text NOT NULL,
	`mapped_to_warning_id` text,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `show_content_warnings_archive_show_id_idx` ON `show_content_warnings_archive` (`show_id`);--> statement-breakpoint
INSERT INTO `content_warnings_archive` ("id", "title", "icon", "legacy_category", "archived", "created_at", "updated_at")
	SELECT "id", "title", "icon", "legacy_category", "archived", "created_at", "updated_at" FROM `content_warnings`;--> statement-breakpoint
INSERT INTO `show_content_warnings_archive` ("id", "show_id", "content_warning_id", "kind", "created_at")
	SELECT "id", "show_id", "content_warning_id", "kind", "created_at" FROM `show_content_warnings`;--> statement-breakpoint

-- 2. Drop child then parent.
DROP TABLE `show_content_warnings`;--> statement-breakpoint
DROP TABLE `content_warnings`;--> statement-breakpoint

-- 3. Recreate, parent then child. Bodies are drizzle's, minus the rebuild dance.
CREATE TABLE `content_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`description` text,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "content_warnings_kind_domain" CHECK("kind" IN ('TECHNICAL', 'GENERAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_warnings_slug_unique` ON `content_warnings` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_warnings_title_unique` ON `content_warnings` (`title`);--> statement-breakpoint
CREATE TABLE `show_content_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`content_warning_id` text NOT NULL,
	`level` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_warning_id`) REFERENCES `content_warnings`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "show_content_warnings_level_domain" CHECK("level" IS NULL OR "level" IN ('MENTIONED', 'DISCUSSED', 'DEPICTED'))
);
--> statement-breakpoint
CREATE INDEX `show_content_warnings_show_id_idx` ON `show_content_warnings` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_content_warnings_warning_id_idx` ON `show_content_warnings` (`content_warning_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `show_content_warnings_unique` ON `show_content_warnings` (`show_id`,`content_warning_id`);--> statement-breakpoint

-- 4. The curated default vocabulary: 10 technical effects and 55 themes.
-- Ids are literal `cw_<slug>`, not generated, so a warning means the same thing
-- in dev as in production and a migration can reference one by id.
INSERT INTO `content_warnings` ("id", "slug", "title", "kind", "category", "description", "icon", "sort", "archived", "created_at", "updated_at") VALUES
  ('cw_strobe-lighting', 'strobe-lighting', 'Strobe and flashing lights', 'TECHNICAL', NULL, 'Rapid flashing or strobe effects.', 'i-lucide-zap', 10, false, current_timestamp, current_timestamp),
  ('cw_loud-noise', 'loud-noise', 'Loud noises', 'TECHNICAL', NULL, 'Sustained loud sound.', 'i-lucide-volume-2', 20, false, current_timestamp, current_timestamp),
  ('cw_sudden-noise', 'sudden-noise', 'Sudden loud noises', 'TECHNICAL', NULL, 'Bangs, gunshots, sudden effects.', 'i-lucide-volume-2', 30, false, current_timestamp, current_timestamp),
  ('cw_low-frequency-sound', 'low-frequency-sound', 'High or low frequency sound', 'TECHNICAL', NULL, 'Tones some people find physically uncomfortable.', 'i-lucide-volume-2', 40, false, current_timestamp, current_timestamp),
  ('cw_haze-and-smoke', 'haze-and-smoke', 'Haze and smoke effects', 'TECHNICAL', NULL, 'Atmospheric haze, smoke or fog.', 'i-lucide-cloud-fog', 50, false, current_timestamp, current_timestamp),
  ('cw_naked-flame', 'naked-flame', 'Naked flame and pyrotechnics', 'TECHNICAL', NULL, 'Live flame or pyrotechnic effects on stage.', 'i-lucide-flame', 60, false, current_timestamp, current_timestamp),
  ('cw_smoking-on-stage', 'smoking-on-stage', 'Smoking on stage', 'TECHNICAL', NULL, 'Herbal cigarettes or similar, lit during the performance.', 'i-lucide-cigarette', 70, false, current_timestamp, current_timestamp),
  ('cw_strong-smells', 'strong-smells', 'Strong smells', 'TECHNICAL', NULL, 'Scent effects, cooking or burning.', 'i-lucide-wind', 80, false, current_timestamp, current_timestamp),
  ('cw_blackout', 'blackout', 'Complete blackout', 'TECHNICAL', NULL, 'Periods of total darkness.', 'i-lucide-eye-off', 90, false, current_timestamp, current_timestamp),
  ('cw_audience-interaction', 'audience-interaction', 'Audience interaction', 'TECHNICAL', NULL, 'Performers address or approach the audience.', 'i-lucide-users', 100, false, current_timestamp, current_timestamp),
  ('cw_violence', 'violence', 'Violence', 'GENERAL', 'Violence and death', NULL, 'i-lucide-swords', 0, false, current_timestamp, current_timestamp),
  ('cw_death', 'death', 'Death', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_murder', 'murder', 'Murder', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_gun-violence', 'gun-violence', 'Gun violence', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_weapons', 'weapons', 'Weapons', 'GENERAL', 'Violence and death', 'Knives, guns or other weapons handled on stage.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_blood-and-injury', 'blood-and-injury', 'Blood and injury', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_domestic-abuse', 'domestic-abuse', 'Domestic abuse', 'GENERAL', 'Violence and death', 'Abuse within a household or relationship.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_emotional-abuse', 'emotional-abuse', 'Emotional abuse and manipulation', 'GENERAL', 'Violence and death', 'Gaslighting, coercion, controlling behaviour.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_child-abuse', 'child-abuse', 'Child abuse', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_violence-to-animals', 'violence-to-animals', 'Violence to animals', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_war', 'war', 'War', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_kidnapping', 'kidnapping', 'Kidnapping and abduction', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_stalking', 'stalking', 'Stalking', 'GENERAL', 'Violence and death', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_bullying', 'bullying', 'Bullying', 'GENERAL', 'Violence and death', 'Including cyberbullying.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_sexual-references', 'sexual-references', 'Sexual references', 'GENERAL', 'Sexual content', 'Innuendo, jokes, explicit language.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_sex', 'sex', 'Sex', 'GENERAL', 'Sexual content', 'Sexual activity or intimacy staged.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_nudity', 'nudity', 'Nudity', 'GENERAL', 'Sexual content', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_sexual-assault', 'sexual-assault', 'Sexual assault and rape', 'GENERAL', 'Sexual content', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_sexual-harassment', 'sexual-harassment', 'Sexual harassment', 'GENERAL', 'Sexual content', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_incest', 'incest', 'Incest', 'GENERAL', 'Sexual content', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_suicide', 'suicide', 'Suicide', 'GENERAL', 'Mental health', 'Including attempts and suicidal ideation.', 'i-lucide-heart-crack', 0, false, current_timestamp, current_timestamp),
  ('cw_self-harm', 'self-harm', 'Self-harm', 'GENERAL', 'Mental health', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_mental-illness', 'mental-illness', 'Mental illness', 'GENERAL', 'Mental health', 'Depression, anxiety, psychosis and similar.', 'i-lucide-brain', 0, false, current_timestamp, current_timestamp),
  ('cw_eating-disorders', 'eating-disorders', 'Eating disorders and body image', 'GENERAL', 'Mental health', 'Disordered eating, diet culture, body dysmorphia.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_grief', 'grief', 'Grief and bereavement', 'GENERAL', 'Mental health', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_trauma', 'trauma', 'Trauma', 'GENERAL', 'Mental health', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_alcohol', 'alcohol', 'Alcohol and drinking', 'GENERAL', 'Substances', 'Including alcoholism and underage drinking.', 'i-lucide-wine', 0, false, current_timestamp, current_timestamp),
  ('cw_drug-use', 'drug-use', 'Drug use', 'GENERAL', 'Substances', 'Including addiction and overdose.', 'i-lucide-pill', 0, false, current_timestamp, current_timestamp),
  ('cw_smoking', 'smoking', 'Smoking', 'GENERAL', 'Substances', 'Smoking as a theme. For lit cigarettes on stage, use the technical warning.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_addiction', 'addiction', 'Addiction', 'GENERAL', 'Substances', 'Including gambling and other compulsions.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_racism', 'racism', 'Racism', 'GENERAL', 'Discrimination', 'Including xenophobia and racial violence.', 'i-lucide-scale', 0, false, current_timestamp, current_timestamp),
  ('cw_sexism', 'sexism', 'Sexism and misogyny', 'GENERAL', 'Discrimination', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_homophobia', 'homophobia', 'Homophobia', 'GENERAL', 'Discrimination', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_transphobia', 'transphobia', 'Transphobia', 'GENERAL', 'Discrimination', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_ableism', 'ableism', 'Ableism', 'GENERAL', 'Discrimination', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_classism', 'classism', 'Classism', 'GENERAL', 'Discrimination', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_ageism', 'ageism', 'Ageism', 'GENERAL', 'Discrimination', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_religious-discrimination', 'religious-discrimination', 'Religious discrimination', 'GENERAL', 'Discrimination', 'Islamophobia, antisemitism and similar.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_discrimination', 'discrimination', 'Discrimination', 'GENERAL', 'Discrimination', 'Prejudice or slurs not covered by a more specific warning.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_strong-language', 'strong-language', 'Strong language', 'GENERAL', 'Language', 'Swearing and profanity.', 'i-lucide-message-square-warning', 0, false, current_timestamp, current_timestamp),
  ('cw_religious-language', 'religious-language', 'Religious language', 'GENERAL', 'Language', 'Blasphemy or irreverent religious references.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_infidelity', 'infidelity', 'Infidelity', 'GENERAL', 'Family and relationships', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_family-conflict', 'family-conflict', 'Family conflict', 'GENERAL', 'Family and relationships', 'Arguments, estrangement, relationship breakdown.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_death-of-a-child', 'death-of-a-child', 'Death of a child', 'GENERAL', 'Family and relationships', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_serious-illness', 'serious-illness', 'Serious illness', 'GENERAL', 'Health and body', 'Cancer, terminal diagnosis and similar.', 'i-lucide-stethoscope', 0, false, current_timestamp, current_timestamp),
  ('cw_medical-procedures', 'medical-procedures', 'Medical procedures', 'GENERAL', 'Health and body', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_pregnancy-and-birth', 'pregnancy-and-birth', 'Pregnancy and birth', 'GENERAL', 'Health and body', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_pregnancy-loss', 'pregnancy-loss', 'Pregnancy loss', 'GENERAL', 'Health and body', 'Miscarriage, stillbirth, termination.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_vomiting', 'vomiting', 'Vomiting', 'GENERAL', 'Health and body', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_disability', 'disability', 'Disability and chronic illness', 'GENERAL', 'Health and body', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_imprisonment', 'imprisonment', 'Imprisonment', 'GENERAL', 'Health and body', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_supernatural', 'supernatural', 'Supernatural and horror', 'GENERAL', 'Other', NULL, 'i-lucide-ghost', 0, false, current_timestamp, current_timestamp),
  ('cw_loneliness', 'loneliness', 'Loneliness and isolation', 'GENERAL', 'Other', NULL, NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_existential-themes', 'existential-themes', 'Existential themes', 'GENERAL', 'Other', 'Mortality, meaninglessness, existential dread.', NULL, 0, false, current_timestamp, current_timestamp),
  ('cw_climate-and-disaster', 'climate-and-disaster', 'Climate change and disaster', 'GENERAL', 'Other', NULL, NULL, 0, false, current_timestamp, current_timestamp);
--> statement-breakpoint

-- 5. Mark every archived link with the vocabulary entry it maps onto.
--
-- Done as its own pass, before the insert, so the alias map is written once and
-- the archive ends up self-describing: `mapped_to_warning_id IS NULL` is exactly
-- "this one did not carry over", which is what the show editor asks for. The
-- insert below cannot answer that question on its own, because it collapses
-- rows — "Sexism" and "Misogyny" both become `sexism`, so only one of the two
-- archive ids survives as a live row and the other would look dropped.
--
-- The alias map was derived by reading every one of the 361 distinct legacy
-- titles in use, ranked by usage — not by pattern-matching prefixes. It covers
-- 963 of 998 links (96.5%). The 35 it leaves are titles too vague to restate
-- ("Adult content", "Political Themes", "Lying and Deceit"); inventing a
-- meaning for those would be worse than admitting they were dropped.
WITH alias(legacy_title, slug) AS (
	VALUES
		('Strobe lighting', 'strobe-lighting'),
		('Strobe', 'strobe-lighting'),
		('Strobe effects', 'strobe-lighting'),
		('Flashing lights', 'strobe-lighting'),
		('Loud noises', 'loud-noise'),
		('Loud noise', 'loud-noise'),
		('Loud music', 'loud-noise'),
		('Sudden noises', 'sudden-noise'),
		('Sudden loud noises', 'sudden-noise'),
		('Gunshots', 'sudden-noise'),
		('High and low frequency noises', 'low-frequency-sound'),
		('Haze effects', 'haze-and-smoke'),
		('Haze', 'haze-and-smoke'),
		('Smoke', 'haze-and-smoke'),
		('Smoke effects', 'haze-and-smoke'),
		('Live smoking on stage', 'smoking-on-stage'),
		('Audience Interaction', 'audience-interaction'),
		('Actors approaching Audience', 'audience-interaction'),
		('4th wall breaking', 'audience-interaction'),
		('Breaking the 4th wall', 'audience-interaction'),
		('Violence', 'violence'),
		('Explicit Violence', 'violence'),
		('Comic Violence', 'violence'),
		('Slapstick violence', 'violence'),
		('Physical violence', 'violence'),
		('Violent behaviour', 'violence'),
		('Death', 'death'),
		('Dying', 'death'),
		('Murder', 'murder'),
		('Gun Violence', 'gun-violence'),
		('Graphic depiction of school shooting', 'gun-violence'),
		('Weapons', 'weapons'),
		('Knives on Stage', 'weapons'),
		('Blood', 'blood-and-injury'),
		('Fake blood', 'blood-and-injury'),
		('Gore', 'blood-and-injury'),
		('Injury', 'blood-and-injury'),
		('mutilation', 'blood-and-injury'),
		('Domestic violence', 'domestic-abuse'),
		('Domestic abuse', 'domestic-abuse'),
		('Abuse', 'domestic-abuse'),
		('Abusive behaviour', 'domestic-abuse'),
		('Abusive partner', 'domestic-abuse'),
		('Verbal Abuse', 'domestic-abuse'),
		('Physical Abuse', 'domestic-abuse'),
		('Self-abuse', 'self-harm'),
		('Gaslighting', 'emotional-abuse'),
		('Manipulation', 'emotional-abuse'),
		('Manipulation and gaslighting', 'emotional-abuse'),
		('Emotional Abuse / Gaslighting', 'emotional-abuse'),
		('Emotional Abuse', 'emotional-abuse'),
		('Religious abuse', 'emotional-abuse'),
		('Child Abuse', 'child-abuse'),
		('Violence to Animals', 'violence-to-animals'),
		('Animal cruelty', 'violence-to-animals'),
		('War', 'war'),
		('War-related violence', 'war'),
		('nuclear weapons', 'war'),
		('Kidnapping and Abduction', 'kidnapping'),
		('Stalking', 'stalking'),
		('Sexual references', 'sexual-references'),
		('Sexual innuendos', 'sexual-references'),
		('Sexual Innuendo', 'sexual-references'),
		('Sexual jokes', 'sexual-references'),
		('Allusions to Sex', 'sexual-references'),
		('Sexually explicit language', 'sexual-references'),
		('Sexual Nature', 'sexual-references'),
		('Sexual content', 'sexual-references'),
		('Sex', 'sex'),
		('Sexual Behaviour', 'sex'),
		('Intimacy', 'sex'),
		('Female Orgasm', 'sex'),
		('sex toys', 'sex'),
		('Pornography', 'sex'),
		('Simulated sex', 'sex'),
		('Partial nudity', 'nudity'),
		('Nudity', 'nudity'),
		('Reference to Nudity', 'nudity'),
		('Rape', 'sexual-assault'),
		('Sexual assault', 'sexual-assault'),
		('Sexual violence', 'sexual-assault'),
		('Graphic Sexual Assault', 'sexual-assault'),
		('Rape and Sexual Assault', 'sexual-assault'),
		('Interpretations of Sexual Violence', 'sexual-assault'),
		('Sexual Harassment', 'sexual-harassment'),
		('Incest', 'incest'),
		('Suicide', 'suicide'),
		('Suicide Attempt', 'suicide'),
		('Suicidal ideation', 'suicide'),
		('Self-harm', 'self-harm'),
		('Self harm', 'self-harm'),
		('Self inflicted injury', 'self-harm'),
		('Depression', 'mental-illness'),
		('Mental health conditions', 'mental-illness'),
		('Ill mental health', 'mental-illness'),
		('Poor Mental Health', 'mental-illness'),
		('Psychosis', 'mental-illness'),
		('Declining Mental Health', 'mental-illness'),
		('Mental Breakdown', 'mental-illness'),
		('References to mental health; anxiety and psychosis', 'mental-illness'),
		('Suggestions of mental health deterioration', 'mental-illness'),
		('Anxiety', 'mental-illness'),
		('Mental Illness', 'mental-illness'),
		('Diet Culture', 'eating-disorders'),
		('Body Dysmorphia', 'eating-disorders'),
		('Disordered Eating', 'eating-disorders'),
		('Eating Disorders', 'eating-disorders'),
		('fatphobia', 'eating-disorders'),
		('Grief', 'grief'),
		('Bereavement', 'grief'),
		('Trauma', 'trauma'),
		('Alcohol abuse', 'alcohol'),
		('Alcohol', 'alcohol'),
		('Alcoholism', 'alcohol'),
		('Alcoholism and Drinking', 'alcohol'),
		('Drinking', 'alcohol'),
		('Underage Drinking', 'alcohol'),
		('Alcohol consumption', 'alcohol'),
		('Drunkness', 'alcohol'),
		('Drunkenness', 'alcohol'),
		('Intoxication', 'alcohol'),
		('Drug Use', 'drug-use'),
		('Drug abuse', 'drug-use'),
		('Drugs', 'drug-use'),
		('Substance Abuse', 'drug-use'),
		('Overdose', 'drug-use'),
		('Smoking', 'smoking'),
		('Addiction', 'addiction'),
		('Gambling', 'addiction'),
		('Racism', 'racism'),
		('Xenophobia', 'racism'),
		('Colonialism', 'racism'),
		('Racial hate crimes', 'racism'),
		('Nationalism', 'racism'),
		('Racial slurs', 'racism'),
		('Sexism', 'sexism'),
		('Misogyny', 'sexism'),
		('Themes of sexism and misogyny', 'sexism'),
		('Gender Stereotypes', 'sexism'),
		('Misogynistic Language', 'sexism'),
		('Homophobia', 'homophobia'),
		('Homophobic Violence', 'homophobia'),
		('Homophobic language', 'homophobia'),
		('Transphobia', 'transphobia'),
		('Ableism', 'ableism'),
		('Ableist language', 'ableism'),
		('Classism', 'classism'),
		('Ageism', 'ageism'),
		('Strong language', 'strong-language'),
		('Swearing', 'strong-language'),
		('Mild / Bad Language', 'strong-language'),
		('Moderate Bad Language', 'strong-language'),
		('Bad Language', 'strong-language'),
		('Explicit language', 'strong-language'),
		('Religious Language', 'religious-language'),
		('Blasphemy', 'religious-language'),
		('Adultery', 'infidelity'),
		('Infidelity', 'infidelity'),
		('Dysfunctional Family', 'family-conflict'),
		('Marital Arguments', 'family-conflict'),
		('Emotional argument between a couple', 'family-conflict'),
		('Relationship breakdown', 'family-conflict'),
		('A toxic relationship', 'family-conflict'),
		('Divorce', 'family-conflict'),
		('Loss of a child', 'death-of-a-child'),
		('Death of a child', 'death-of-a-child'),
		('Cancer', 'serious-illness'),
		('Terminal Illness', 'serious-illness'),
		('Illness', 'serious-illness'),
		('Pregnancy', 'pregnancy-and-birth'),
		('Childbirth', 'pregnancy-and-birth'),
		('Miscarriage', 'pregnancy-loss'),
		('Abortion', 'pregnancy-loss'),
		('Vomiting', 'vomiting'),
		('Dry Heaving / Dry Vomiting', 'vomiting'),
		('Imprisonment', 'imprisonment'),
		('The Supernatural', 'supernatural'),
		('Life after death', 'supernatural'),
		('Horror', 'supernatural'),
		('Loneliness', 'loneliness'),
		('Isolation', 'loneliness'),
		('Existential Dread', 'existential-themes'),
		('Epilepsy', 'strobe-lighting'),
		('Flashing Lights on Stage', 'strobe-lighting'),
		('Bright, Flashing Lights / Sounds', 'strobe-lighting'),
		('UV Lighting', 'strobe-lighting'),
		('Sudden outbursts', 'sudden-noise'),
		('Vibrations', 'low-frequency-sound'),
		('Depictions and Discussions of Fire', 'naked-flame'),
		('Arson', 'naked-flame'),
		('Staged Violence', 'violence'),
		('Social Violence', 'violence'),
		('State Violence', 'violence'),
		('Psychological Violence', 'emotional-abuse'),
		('Police Brutality', 'violence'),
		('Real Cases of Police Brutality', 'violence'),
		('Threat of violence', 'violence'),
		('Threatening Violence', 'violence'),
		('Non-abusive threats', 'violence'),
		('aggressive language/behaviour', 'violence'),
		('Violence (Scissors)', 'violence'),
		('sharp object', 'weapons'),
		('Knife crime', 'weapons'),
		('Strangling', 'violence'),
		('Hanging', 'suicide'),
		('Cannibalism', 'violence'),
		('Burning alive till death', 'violence'),
		('Restraint and Manhandling', 'violence'),
		('Graphic Murder', 'murder'),
		('Matricide', 'murder'),
		('Threat of murder', 'murder'),
		('Wishing death upon a character', 'death'),
		('Accidental Death', 'death'),
		('non-violent death', 'death'),
		('Mortality', 'death'),
		('Lighthearted discussion of death', 'death'),
		('Plane crash', 'death'),
		('Car Accident', 'death'),
		('Death of a Family Member', 'grief'),
		('Death of a close relative', 'grief'),
		('Child death', 'death-of-a-child'),
		('harm to a child', 'child-abuse'),
		('Child sexual abuse', 'child-abuse'),
		('Pedophilia', 'child-abuse'),
		('paedophilia', 'child-abuse'),
		('pedophilia / incest', 'child-abuse'),
		('Parental abuse', 'child-abuse'),
		('Neglect', 'child-abuse'),
		('School shooting', 'gun-violence'),
		('Preempting of a school shooting', 'gun-violence'),
		('Depiction of a gun', 'gun-violence'),
		('References to World War II and Hitler', 'war'),
		('preconceptions of war', 'war'),
		('Concentration Camp', 'imprisonment'),
		('False Imprisonment', 'imprisonment'),
		('Lockdown / Imprisonment', 'imprisonment'),
		('Experiences of detention', 'imprisonment'),
		('Deportation', 'imprisonment'),
		('Kidnap and Drugging', 'kidnapping'),
		('Kidnapping', 'kidnapping'),
		('human trafficking', 'kidnapping'),
		('Cyberbullying', 'bullying'),
		('Suggestion of cyberbullying', 'bullying'),
		('Psychological Abuse', 'emotional-abuse'),
		('Mental Health Abuse', 'emotional-abuse'),
		('Intimidation and Manipulation', 'emotional-abuse'),
		('Coercion, manipulation and threat in a marriage', 'emotional-abuse'),
		('Controlling Behaviour', 'emotional-abuse'),
		('Unequal power dynamics', 'emotional-abuse'),
		('Abuse of power', 'emotional-abuse'),
		('Blackmail', 'emotional-abuse'),
		('being trapped in a toxic situation', 'emotional-abuse'),
		('Depictions of physical and psychological abuse', 'domestic-abuse'),
		('Domestic Abuse with Alcholism', 'domestic-abuse'),
		('Suggestion of Domestic Abuse', 'domestic-abuse'),
		('Physical domestic abuse', 'domestic-abuse'),
		('Domestic disputes', 'family-conflict'),
		('Verbal Abuse at Member of Crew', 'domestic-abuse'),
		('Sexual Coercion', 'sexual-assault'),
		('Threat of Sexual Assault', 'sexual-assault'),
		('Forced Intimacy', 'sexual-assault'),
		('Forced Marriage', 'sexual-assault'),
		('Non-Consensual drugging', 'sexual-assault'),
		('Overt mention of statutory rape with sexually explicit language', 'sexual-assault'),
		('possible interpretation of sexual abuse', 'sexual-assault'),
		('Beastiality', 'sexual-assault'),
		('Kissing', 'sex'),
		('Heavy petting', 'sex'),
		('Mild intimacy', 'sex'),
		('physical intimacy', 'sex'),
		('Sexual Contact', 'sex'),
		('masturbation', 'sex'),
		('Exploration of Sexuality', 'sex'),
		('Porn', 'sex'),
		('Prostitution', 'sex'),
		('Male genitalia', 'nudity'),
		('Explicit reference to sexual organs', 'sexual-references'),
		('Inuendo', 'sexual-references'),
		('Suggestive Sexual Language', 'sexual-references'),
		('Sexual Thoughts', 'sexual-references'),
		('Mentions of an inappropriate relationship with sexually explicit language', 'sexual-references'),
		('Objectification', 'sexism'),
		('Depictions of Homophobia', 'homophobia'),
		('Depictions of Misogynistic and Homophobic Language', 'homophobia'),
		('Islamophobia', 'religious-discrimination'),
		('Anti-Semitism', 'religious-discrimination'),
		('outdated views of religion', 'religious-discrimination'),
		('Discrimination', 'discrimination'),
		('Prejudicial language', 'discrimination'),
		('Slurs', 'discrimination'),
		('Aphobia', 'discrimination'),
		('Racial stereotypes', 'racism'),
		('Racism and Microaggression', 'racism'),
		('Ideas that certain people are better based on physical appearences', 'discrimination'),
		('Comment on appearances', 'eating-disorders'),
		('Deafness', 'disability'),
		('Loss of hearing', 'disability'),
		('Muscular dystrophies disability', 'disability'),
		('Chronic Pain', 'disability'),
		('Panic attacks', 'mental-illness'),
		('Insomnia', 'mental-illness'),
		('Nightmares and Night Terrors', 'mental-illness'),
		('Emotional Breakdown', 'mental-illness'),
		('Depressive episodes', 'mental-illness'),
		('Mental Health Issues', 'mental-illness'),
		('Mental Health (Asylum scene)', 'mental-illness'),
		('depersonalisation', 'mental-illness'),
		('hallucination', 'mental-illness'),
		('degenerative mental illness', 'mental-illness'),
		('Emotional Instability', 'mental-illness'),
		('Psychological distress', 'mental-illness'),
		('Emotional Distress and Paranoia, Feelings of Inadequacy', 'mental-illness'),
		('Distress', 'mental-illness'),
		('Dangerous Thoughts', 'mental-illness'),
		('postnatal depression', 'mental-illness'),
		('Agoraphobia', 'mental-illness'),
		('Amnesia', 'mental-illness'),
		('Suicidal Thought', 'suicide'),
		('One suicidal thought', 'suicide'),
		('Minimisation of suicide', 'suicide'),
		('Possible interpretation of endorsement of self harm', 'self-harm'),
		('Inter-Generational Trauma', 'trauma'),
		('Traumatic images of people crying, screaming and scared', 'trauma'),
		('Smoking Cannabis', 'drug-use'),
		('Implicit drug use', 'drug-use'),
		('Drug and Alcohol Use', 'drug-use'),
		('Health Risks about Drugs', 'drug-use'),
		('Benefits of taking drugs', 'drug-use'),
		('Prescription Drugs', 'drug-use'),
		('Medical Drug Administration', 'medical-procedures'),
		('Dangerous Behaviour - Poisoning', 'drug-use'),
		('Addiction (Nicotine)', 'addiction'),
		('Complusive Behaviour', 'addiction'),
		('Tobacco use', 'smoking'),
		('Binge Drinking', 'alcohol'),
		('Suggestions of alcholism', 'alcohol'),
		('Depictions of illegal alcohol consumption', 'alcohol'),
		('Alcohol use', 'alcohol'),
		('Unwanted Pregnancy', 'pregnancy-and-birth'),
		('Surrogacy', 'pregnancy-and-birth'),
		('Inability of having children', 'pregnancy-and-birth'),
		('Heart failure', 'serious-illness'),
		('Allergic Reaction', 'serious-illness'),
		('Depiction of ailment', 'serious-illness'),
		('Reference to serious ailment', 'serious-illness'),
		('Family Illness', 'serious-illness'),
		('Covid-19', 'serious-illness'),
		('Visible signs of pain', 'serious-illness'),
		('medical procedure', 'medical-procedures'),
		('Mental Health Assessments', 'medical-procedures'),
		('medicalisation', 'medical-procedures'),
		('Public Urination', 'vomiting'),
		('Bodily Secretions', 'vomiting'),
		('Vomiting Offstage', 'vomiting'),
		('foul language', 'strong-language'),
		('Moderate Language', 'strong-language'),
		('Mentally charged language', 'strong-language'),
		('Custody of a child', 'family-conflict'),
		('Family Rejection', 'family-conflict'),
		('Abandonment', 'family-conflict'),
		('ideas of heaven, hell and purgatory', 'existential-themes'),
		('Existential themes (mentions of therapy)', 'existential-themes'),
		('Loss of Identity and Existentialism', 'existential-themes'),
		('Identity Existentialism', 'existential-themes'),
		('Loss of identity', 'existential-themes'),
		('environmental catastrophe', 'climate-and-disaster'),
		('environmental catastrophes', 'climate-and-disaster'),
		('Climate change', 'climate-and-disaster'),
		('World disaster', 'climate-and-disaster'),
		('human extinction events', 'climate-and-disaster')
)
UPDATE `show_content_warnings_archive` SET `mapped_to_warning_id` = (
	SELECT cw."id"
	FROM `content_warnings_archive` v
	JOIN alias a ON lower(trim(a.legacy_title)) = lower(trim(v."title"))
	JOIN `content_warnings` cw ON cw."slug" = a.slug
	WHERE v."id" = `show_content_warnings_archive`."content_warning_id"
);--> statement-breakpoint

-- 6. Create the live links from the marked archive rows.
--
-- Legacy could not express DISCUSSED, so nothing maps to it. ACTION becomes
-- DEPICTED and DIALOGUE becomes MENTIONED. A legacy TECHNICAL link also becomes
-- DEPICTED when its target is a general warning ("Fake blood" -> blood-and-injury):
-- it was staged, so it was shown.
--
-- The GROUP BY is not cosmetic. The old unique key was (show, warning, axis) and
-- the new one is (show, warning), so a show carrying one warning on two axes —
-- or two legacy titles that alias to one entry — would violate it and, on D1's
-- atomic path, roll back the whole migration. MIN(level_rank) means the
-- strongest claim wins. Reusing MIN(archive_id) as the new row id keeps the
-- migration deterministic and every live row traceable to an archive row.
INSERT INTO `show_content_warnings` ("id", "show_id", "content_warning_id", "level", "created_at")
WITH mapped AS (
	SELECT
		l."show_id" AS show_id,
		l."mapped_to_warning_id" AS warning_id,
		CASE l."kind" WHEN 'DIALOGUE' THEN 3 ELSE 1 END AS level_rank,
		l."created_at" AS created_at,
		l."id" AS archive_id
	FROM `show_content_warnings_archive` l
	WHERE l."mapped_to_warning_id" IS NOT NULL
		AND EXISTS (SELECT 1 FROM `shows` s WHERE s."id" = l."show_id")
),
collapsed AS (
	SELECT show_id, warning_id, MIN(level_rank) AS best_rank,
		MIN(created_at) AS created_at, MIN(archive_id) AS archive_id
	FROM mapped GROUP BY show_id, warning_id
)
SELECT
	c.archive_id,
	c.show_id,
	c.warning_id,
	CASE WHEN cw."kind" = 'TECHNICAL' THEN NULL
		WHEN c.best_rank = 1 THEN 'DEPICTED'
		ELSE 'MENTIONED' END,
	coalesce(c.created_at, current_timestamp)
FROM collapsed c
JOIN `content_warnings` cw ON cw."id" = c.warning_id;
