# 2. Data model

Training goes from 12 tables to 16: the join `training_competency_courses` is replaced by routes and their items, and lessons, lesson progress and quiz attempts are new. Four existing tables change columns. Everything below uses the Foundations data-class layout; tables not named here stand as written in the repository's part 2.

*[Drawing: data model · 16 tables in four groups, 5 new]*

A route item points across to a course; a place points across to the sign-off it writes. Activity sign-offs need no table of their own: the step source's occurrence id is kept on the sign-off.

## Tables and id prefixes

| Table | Prefix | Holds | Realm | Subject | Change |
| --- | --- | --- | --- | --- | --- |
| `training_competency_routes` | `trte` | The routes of a competency | operational | none | New |
| `training_route_items` | none | What one route needs; keyed by (`route_id`, `position`) | operational | none | New |
| `training_competency_courses` | none |  |  |  | Removed |
| `training_lesson_sections` | `tlsc` | The sections of a lesson step | operational | none | New |
| `training_lesson_progress` | none | Sections a person has reached; keyed by (`account_id`, `section_id`) | members | `account_id` | New |
| `training_quiz_attempts` | `tqat` | One submission of a quiz, or a trainer's allowance of another try | members | `account_id` | New |
| `training_courses` | `tcrs` |  |  |  | `delivery` removed |
| `training_course_steps` | `tstp` |  |  |  | Four kinds and nine columns added |
| `training_sign_offs` | `tsof` |  |  |  | Three kinds added, `form` withdrawn, four columns added, one removed |
| `training_evidence` | `tevd` |  |  |  | Declarations added: a kind and eight columns |

The three new prefixes were checked against the Foundations index (part 4, "Index of id prefixes") and the `newId` calls in the built layers on 23 November 2026. None clashes: taken `t` prefixes are `tcrs`, `tver`, `tstp`, `tcmp`, `tses`, `tplc`, `tsof`, `trec`, `tevd`, `tgr`, `till`, `tko`, `tkt`, `tmg`, `tps`, `trm`, `tsp`, `tst` and `tty`. Integration registers them.

## What is required

**`training_competency_routes`**: realm operational; subject none; no retention; not append-only. Unique on (`competency_id`, `position`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `competency_id` | ref `training_competencies` | not null | internal | keep |  |
| `position` | integer | not null, from 1 | internal | keep | The order routes are offered in a verdict's reason and on the learner's page |
| `label` | text | not null, at most 80 | internal | keep | "Our first aid course", "An outside first-aid certificate" |
| `status` | text | one of `active`, `retired` | internal | keep | A retired route holds nothing and is kept for history |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

**`training_route_items`**: realm operational; subject none; keyed by (`route_id`, `position`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `route_id` | ref `training_competency_routes` | not null | internal | keep |  |
| `position` | integer | not null, from 1 | internal | keep |  |
| `kind` | text | one of `course`, `recognised` | internal | keep |  |
| `course_id` | ref `training_courses` | not null exactly when `kind` is `course` | internal | keep |  |
| `requirement_ref` | text | not null exactly when `kind` is `recognised`; a `core.requirement` reference `<source>:<id>` or `fact:<name>`; `never training: or fact:training.` | internal | keep | Stored as the host modules store theirs; never interpreted by Training |
| `created_at` | timestamp | not null | internal | keep |  |

A route with no items holds for nobody, and an active competency needs at least one active route with at least one item (rule R1). A check constraint holds the "exactly when" pairs. There is no foreign key on `requirement_ref`, because it points into another module; the kit's `requirements.describe` labels it, and one whose source is gone reads as "no longer available".

## What is taught

**`training_courses`**: the column `delivery` is removed. The catalogue's "ways to learn" is derived from the live version's step kinds (part 3, W1).

**`training_course_steps`**: `kind` becomes one of `session`, `practical`, `activity`, `reading`, `lesson`, `quiz`, `certificate`, `declaration`. Added columns:

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `form_id` | ref `forms_forms` | required for `quiz`; optional for `declaration`; null otherwise | internal | keep | A form in the slot `training.quiz` or `training.declaration` |
| `form_version_id` | ref `forms_versions` | set when the course version is published; null before | internal | keep | Pins the form version, so a published step never changes under people (part 3, V9) |
| `max_attempts` | integer | 1 to 20, nullable; `quiz` only | internal | keep | Null means no limit. Defaults from `training.quizzes.default-max-attempts` |
| `retry_after` | integer | seconds, nullable; `quiz` only | internal | keep | The wait once the attempts are used up. Defaults from `training.quizzes.retry-after` |
| `show_answers` | text | one of `never`, `after-pass`, `after-each`; `quiz` only | internal | keep | Defaults to `after-pass` |
| `source_id` | text | required for `activity`; a contribution id of `training.step-source` | internal | keep | `front-of-house.shadowed-shift` |
| `source_params` | JSON | `activity` only; validated by the source's schema | internal | keep | `{ "dutyId": "dty_…" }` |
| `qualifications` | JSON | `certificate` only; list of `{ title, issuers[] }`, at most 20 | internal | keep | The recognised qualifications the step accepts. Empty means any |
| `other_qualification` | boolean | `certificate` only; default true | internal | keep | Whether a person may name a qualification not on the list, for the verifier to judge |

`times_required` now applies to `practical` and `activity` steps. A step of kind `lesson` has its content in `training_lesson_sections` and none in `guidance` or `material_*`.

**`training_lesson_sections`**: realm operational; subject none; no retention; not append-only. Unique on (`step_id`, `position`). Sections belong to a step, so to a course version, and are frozen with it (part 3, V2).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `step_id` | ref `training_course_steps` | not null; a step of kind `lesson` | internal | keep |  |
| `position` | integer | not null, 1 to 30 | internal | keep |  |
| `kind` | text | one of `content`, `practice` | internal | keep |  |
| `title` | text | not null, at most 120 | internal | keep |  |
| `body` | JSON | Markdown, at most 20,000 characters | internal | keep | Stored as written and shown through core's one sanitising renderer (MarkdownText); no HTML is stored and no embed is allowed inside it. Images come from the file slot training.lesson-media |
| `video_url` | text | nullable; an address core's video player accepts, from a host on `core.video.player-hosts` (C-64, VL1) | internal | keep | Embedded, never stored |
| `video_caption_note` | text | at most 200 | internal | keep | Where captions or a transcript are, for accessibility |
| `scenario_id` | text | required for `practice`; a `core.practice-scenario` id | internal | keep | `box-office.desk-sale` |
| `carries_section_id` | ref `training_lesson_sections` | nullable; a section of the previous version's matching step | internal | keep | Progress on that section counts for this one (part 3, V3) |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

## What a person has done

**`training_lesson_progress`**: realm members; subject `account_id`; retention `training.retention.attendance`; keyed by (`account_id`, `section_id`); on erasure delete the row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `account_id` | `col.account`, role subject | not null; on merge: alias | internal | delete the row | Read through the account scope |
| `section_id` | ref `training_lesson_sections` | not null | internal | delete the row |  |
| `step_id` | ref `training_course_steps` | not null | internal | delete the row | Repeated, so progress on a step is one indexed read |
| `reached_at` | timestamp | not null | internal | delete the row | The first time the section was reached |

Insert only, with `ON CONFLICT DO NOTHING`, so reaching a section twice changes nothing.

**`training_quiz_attempts`**: realm members; subject `account_id`; retention `training.retention.attendance`; not append-only (only `note` is ever cleared).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `account_id` | `col.account`, role subject | not null; on merge: alias | internal | keep |  |
| `course_id` | ref `training_courses` | not null | internal | keep |  |
| `step_id` | ref `training_course_steps` | not null | internal | keep |  |
| `kind` | text | one of `attempt`, `allowance` | internal | keep | An allowance is a trainer letting the person try again now |
| `response_id` | ref `forms_responses` | not null for `attempt`; unique | internal | keep | The answers live in Forms and follow Forms' erasure and retention |
| `form_version_id` | ref `forms_versions` | not null for `attempt` | internal | keep |  |
| `score`, `out_of` | integer | not null for `attempt`; `score` at most `out_of` | internal | keep | Copied from Forms' marking in the same unit |
| `passed` | boolean | not null for `attempt` | internal | keep |  |
| `allowed_by` | `col.account`, role actor | not null for `allowance`; on merge: alias | internal | keep |  |
| `note` | text | at most 300 | free text | redact | Why another try was allowed |
| `created_at` | timestamp | not null | internal | keep |  |

**`training_sign_offs`**: `kind` becomes one of `trainer`, `attendance`, `self`, `lesson`, `quiz`, `activity`, `evidence`, `void`. `form` is withdrawn with TR-27, and `response_id` with it. Added columns:

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `attempt_id` | ref `training_quiz_attempts` | not null exactly for `quiz` | internal | keep | The passing attempt |
| `source_id` | text | not null exactly for `activity` | internal | keep | The step source |
| `source_ref` | text | not null exactly for `activity`; at most 64 | internal | keep | The occurrence id the source gave, such as an assignment id |
| `confirmed_by` | `col.account`, role actor | nullable; on merge: alias | internal | keep | For `activity`: who the source says confirmed it, such as the shift lead |

A partial unique index on (`course_id`, `account_id`, `source_id`, `source_ref`) where `kind` is `activity` makes each occurrence count once per course, however many times it is reported.

**`training_evidence`**: gains `kind`, one of `certificate`, `declaration`. For a declaration, `issuer` and `issued_on` may be null and these columns carry it:

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `kind` | text | one of `certificate`, `declaration`; not null | internal | keep |  |
| `qualification` | text | at most 120; certificates | personal | clear | The recognised qualification picked, or the person's own words when "other" |
| `statement` | text | at most 2,000; required for a declaration | personal | clear | What they did, in their words |
| `organisation` | text | at most 120 | personal | clear | Where they did it |
| `done_from`, `done_to` | local date | nullable; not in the future; from before to | personal | clear |  |
| `link_url` | text | at most 500 | personal | clear | A portfolio or a credit list |
| `referee` | text | at most 200 | personal | clear | A name and a way to reach them. Optional; a third party's details, so cleared with the row's retention |
| `response_id` | ref `forms_responses` | nullable | internal | keep | The step's own questions, where it has a form |

A declaration may carry one file, under the same file slot and access rule as a certificate (part 4). Where a step forbids files, a declaration on it is refused a file too.

## Uploaded video, added 24 November 2026

The answer to question 4 adds one table, `training_videos` (prefix `tvid`, realm operational, no subject), for 17 tables and 13 prefixes. Part 3 has its rules, VD1 to VD9.

| Column | Type | Constraint | Realm | Erasure | Note |
| --- | --- | --- | --- | --- | --- |
| `id` | text | primary key, `tvid_…` | internal | keep |  |
| `course_id` | text | references `training_courses` | internal | keep | The course it was uploaded for; reused only within it |
| `stream_uid` | text | unique | internal | keep | Stream's id for the video. Its signed playback is worked out from this |
| `status` | text | one of `uploading`, `processing`, `ready`, `failed`, `deleted` | internal | keep | VD2 |
| `failed_reason` | text | nullable; at most 200 | internal | keep | Stream's words |
| `duration_seconds` | integer | nullable | internal | keep | Read from Stream when ready |
| `uploaded_by` | text | references `accounts` | internal | anonymise |  |
| `uploaded_at`, `ready_at`, `deleted_at` | timestamp | nullable but `uploaded_at` | internal | keep |  |

`training_lesson_sections` gains `video_id` (nullable, references `training_videos`). A check constraint lets a section have `video_url` or `video_id`, never both. A `video_id` must name a video of the same course. Nothing personal is in this table, so erasure only anonymises `uploaded_by`. The download is unchanged.

## Rules the schema enforces, added

| Rule | How |
| --- | --- |
| A route item is either a course or a recognised requirement, never both | Check constraint |
| A route never names Training itself | Check: `requirement_ref NOT LIKE 'training:%'` AND requirement_ref NOT LIKE 'fact:training.%'; and the service refuses it with a reason |
| A shift counts once towards a course | The partial unique index on activity sign-offs |
| A quiz response is one attempt | Unique `response_id` |
| Attempts are limited | The attempt is inserted with `INSERT … SELECT … WHERE` the count of attempts since the last allowance and inside the window is under the limit; a second submission at the same moment cannot pass the predicate twice (part 3, Q3) |
| Reaching a section is recorded once | The key on (`account_id`, `section_id`) |

## Erasure, download, retention and merge

- **Download** adds lesson progress, quiz attempts with their scores, and declarations with their files. The quiz answers come from Forms' own download contribution.
- **Erasure** deletes lesson progress, clears every personal column of a declaration with the evidence row deleted as before, redacts attempt notes, and keeps attempts as anonymous counts for the pass-rate figures.
- **Retention.** Lesson progress and attempts follow `training.retention.attendance`. Declarations follow `training.retention.evidence`, as certificates do.
- **Merge.** Every new account column is alias, read through the kit's account scope. Attempts from both accounts count towards one limit; lesson progress under either account counts for the survivor; nothing needs a merge handler.

## What is deliberately not stored

- No answer, correct answer or question text in Training. Forms holds the answers and the answer key; Training keeps only the score and whether it passed.
- No copy of another source's answer for a recognised route item. It is asked at the instant, every time.
- No video file in D1 or R2. An embedded video is only its address on an allowed host; an uploaded one lives in the theatre's Cloudflare Stream account, and Training keeps only its Stream id and state.
- No stored "held by route" on anybody. Which route a person holds by is worked out at the instant, like everything else.
