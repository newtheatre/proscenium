# 2. Data model

Rehearsals owns `nine tables, all named rehearsals_*, with seven` id prefixes, all starting `rh`. It adds no column to a core, Productions or Spaces table: a call finds its room booking through Spaces' `bookingOfOrigin`, and its people through Productions' `listTeam`.

## Reading the tables

Each table is in the layout the Foundations data-class registry fixes: a line of options, then one row per column. Types, classes and erasure behaviours are Foundations' own. `created_at`, and `updated_at` where rows change, are left out: both are timestamps, internal, kept. An instant is a timestamp in UTC milliseconds. A local time is text `HH:MM` in the theatre's time zone; a local date is text `YYYY-MM-DD`.

## All nine tables

| Table | Prefix | Holds | Rows grow with |
| --- | --- | --- | --- |
| `rehearsals_schedules` | `rhsd` | One per production that rehearses: its period and defaults | Productions: tens a year |
| `rehearsals_units` | `rhun` | The scenes or numbers of the script | Twenty to sixty per production |
| `rehearsals_unit_people` | none, keyed by its two columns | Who is in each unit | Units times people |
| `rehearsals_calls` | `rhcl` | Every rehearsal call | Thirty to a hundred per production |
| `rehearsals_call_units` | none, keyed by its two columns | The running order of a call | A few per call |
| `rehearsals_call_people` | `rhcp` | One person called to one call, with their response and attendance | Calls times people: a few thousand per production |
| `rehearsals_sheets` | `rhsh` | Each issue of the schedule | Ten or so per production |
| `rehearsals_reports` | `rhrp` | A rehearsal report, one per call at most | One per call |
| `rehearsals_report_notes` | `rhrn` | One department's note in a report | A few per report |

All seven prefixes are time-sorted and none is a secret. They were checked against every prefix in `next` and in the first two rounds' specs on 23 November 2026; none starts `rh`. They still need registering in Foundations' index (part 4).

## The schedule and the script

**`rehearsals_schedules`**: realm members; subject none; no retention (kept with the production); not append-only; id prefix `rhsd`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `production_id` | ref `core_productions` | not null, unique, restrict | internal | keep | One schedule per production |
| `first_date` | local date | not null | internal | keep | The rehearsal period's first day |
| `last_date` | local date | not null, on or after `first_date` | internal | keep | Usually the dress rehearsal. Calls may fall outside it, with a warning |
| `default_bookable_id` | ref `spaces_bookables` | nullable, restrict | internal | keep | Offered first when a call is made |
| `default_place` | text | at most 200 characters | internal | keep | Used when the usual room is not bookable: "Portland Building B12" |
| `default_start` | text | local time, nullable | internal | keep | Falls back to the setting |
| `default_length_minutes` | integer | nullable, greater than 0 | internal | keep | Falls back to the setting |
| `team_sees` | text | nullable, one of `full`, `own` | internal | keep | Falls back to `rehearsals.schedule.team-sees` (rule V2) |
| `next_sheet_number` | integer | not null, default 1 | internal | keep | Numbers issues 1, 2, 3 per production |
| `state` | text | not null, default `active`, one of `active`, `closed` | internal | keep | Closed after the production's run: read-only, feeds stop |

**`rehearsals_units`**: realm members; subject none; no retention; not append-only; id prefix `rhun`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `schedule_id` | ref `rehearsals_schedules` | not null, cascade | internal | keep |  |
| `label` | text | not null, 1 to 40 characters, unique ignoring case within the schedule | internal | keep | "1.3", "Act 2 sc 1", "No. 7" |
| `name` | text | at most 120 characters | internal | keep | "The ballroom", "Defying Gravity" |
| `group_label` | text | at most 40 characters | internal | keep | "Act 1": how the breakdown groups rows |
| `pages` | text | at most 20 characters | internal | keep | "12 to 18" |
| `minutes` | integer | nullable, greater than 0 | internal | keep | A rough running time, used to suggest a running order's times |
| `sort` | integer | not null, default 0 | internal | keep |  |
| `state` | text | not null, default `active`, one of `active`, `cut` | internal | keep | Cut leaves the picker and still labels old calls |

**`rehearsals_unit_people`**: realm members; subject through `account_id`; no retention; not append-only; keyed by (`unit_id`, `account_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `unit_id` | ref `rehearsals_units` | not null, cascade | internal | keep |  |
| `account_id` | account, role subject | not null | personal | delete row | onMerge alias. A team member of the production when added (rule U2) |
| `part` | text | at most 60 characters | internal | keep | Which part they play in it, when they play several: "Ensemble", "Lady Bracknell" |

## Calls

**`rehearsals_calls`**: realm members; subject none; retention with the production; not append-only; id prefix `rhcl`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `schedule_id` | ref `rehearsals_schedules` | not null, restrict | internal | keep |  |
| `production_id` | ref `core_productions` | not null, restrict | internal | keep | Copied from the schedule so lists and grants scope without a join |
| `kind_term_id` | ref `core_terms` | not null | internal | keep | Vocabulary `rehearsals.call-kind` |
| `title` | text | at most 120 characters | internal | keep | "Act 2 blocking". Defaults to the kind and the units |
| `starts_at` | timestamp | not null | internal | keep | On a five-minute boundary |
| `ends_at` | timestamp | not null, after `starts_at`, at most 16 hours later | internal | keep | Not included |
| `bookable_id` | ref `spaces_bookables` | nullable, restrict | internal | keep | Set when the call is in a bookable room. Exactly one of this and `place` |
| `place` | text | at most 200 characters | internal | keep | Where it is when it is not a bookable: "Lakeside, Djanogly Theatre" |
| `room_state` | text | not null, default `none`, one of `none`, `requested`, `confirmed`, `lost` | internal | keep | A copy of the room booking's state, kept by rule B4 so lists need no service call. `none` when `place` is used |
| `room_lost_reason` | text | nullable, one of `declined`, `expired`, `bumped`, `cancelled` | internal | keep | Set with `lost` |
| `state` | text | not null, one of `draft`, `published`, `cancelled`, `done` | internal | keep | Part 3 |
| `version` | integer | not null, default 0 | internal | keep | Raised on each published change; the feed and change notices use it |
| `sheet_id` | ref `rehearsals_sheets` | nullable | internal | keep | The issue that first published it |
| `notes` | text | at most 2,000 characters, markdown | free text | keep | Shown to everyone called: "Bring character shoes" |
| `private_notes` | text | at most 2,000 characters | free text | keep | Seen only by schedule managers |
| `attendance_taken` | boolean | not null, default false | internal | keep | True once anyone's attendance is recorded |
| `cancel_note` | text | at most 300 characters | free text | keep | Sent to the people called |
| `published_at`, `cancelled_at` | timestamp | nullable | internal | keep |  |

Indexes: (`production_id`, `starts_at`); (`state`, `starts_at`) for the sweep; (`bookable_id`, `starts_at`); (`schedule_id`, `state`).

**`rehearsals_call_units`**: realm members; subject none; with its call; not append-only; keyed by (`call_id`, `unit_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `call_id` | ref `rehearsals_calls` | not null, cascade | internal | keep |  |
| `unit_id` | ref `rehearsals_units` | not null, restrict | internal | keep |  |
| `sort` | integer | not null | internal | keep | The running order |
| `at_local` | text | local time, nullable | internal | keep | "19:45 Act 2 sc 1" on the call sheet |

**`rehearsals_call_people`**: realm members; subject through `account_id`; retention `rehearsals.attendance.keep-for` from the call's end, after which the row is deleted and only counts remain; not append-only; id prefix `rhcp`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `call_id` | ref `rehearsals_calls` | not null, cascade | internal | keep |  |
| `account_id` | account, role subject | not null; unique with `call_id` | personal | anonymise | onMerge alias |
| `source` | text | not null, one of `unit`, `added` | internal | keep | `unit` when called through a unit in the running order; `added` when named directly |
| `from_at` | timestamp | nullable, within the call | internal | keep | This person's call time, when later than the call's start |
| `until_at` | timestamp | nullable, within the call, after `from_at` | internal | keep | When this person is released |
| `response` | text | not null, default `none`, one of `none`, `seen`, `cannot` | internal | keep | Rule A1 |
| `response_note` | text | at most 300 characters | free text | redact | Why they cannot come. Seen by schedule managers only |
| `responded_at` | timestamp | nullable | internal | keep |  |
| `attendance` | text | nullable, one of `present`, `late`, `absent`, `excused` | personal | anonymise | Rule A4 |
| `attendance_note` | text | at most 200 characters | free text | redact |  |
| `told_version` | integer | not null, default -1 | internal | keep | The call version this person was last told about (rule N3) |
| `clash` | boolean | not null, default false | internal | keep | Set when they were called against busy time (rules W2, W3), so the call shows it without a recount |

Indexes: (`account_id`, `call_id`) for "my calls"; (`call_id`, `attendance`).

## Availability: no table here

What times a person cannot make is Availability's, not Rehearsals' (Integration ruling R3-26, which amends R3-04). People enter it once, for every production, as a weekly pattern and dated exceptions; reasons, their sharing, retention and erasure are Availability's. A schedule's "tell us your conflicts by" date is an availability request Rehearsals opens with sourceRef rehearsals.schedule:\<id>, so the schedule needs no column for it.

## Issues, reports and feeds

**`rehearsals_sheets`**: realm members; subject none; with the production; append-only except erasure; id prefix `rhsh`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `schedule_id` | ref `rehearsals_schedules` | not null, restrict | internal | keep |  |
| `number` | integer | not null; unique with `schedule_id` | internal | keep | "Call sheet 4" |
| `covers_from` | local date | not null | internal | keep |  |
| `covers_to` | local date | not null, on or after `covers_from` | internal | keep |  |
| `message` | text | at most 1,000 characters, markdown | free text | keep | The covering note at the top of every person's message |
| `issued_by` | account, role actor | not null | internal | keep | onMerge alias |
| `issued_at` | timestamp | not null | internal | keep |  |
| `calls_published` | integer | not null | internal | keep | How many draft calls it published |
| `people_told` | integer | not null | internal | keep |  |

**`rehearsals_reports`**: realm members; subject none; with the production; not append-only until sent; id prefix `rhrp`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `call_id` | ref `rehearsals_calls` | not null, unique, restrict | internal | keep |  |
| `summary` | text | at most 4,000 characters, markdown | free text | keep | What was covered, what was not |
| `written_by` | account, role actor | not null | internal | keep | onMerge alias |
| `state` | text | not null, one of `draft`, `sent` | internal | keep | Sent is final; a correction is a new note (rule R3) |
| `sent_at` | timestamp | nullable | internal | keep |  |

**`rehearsals_report_notes`**: realm members; subject none; with its report; not append-only; id prefix `rhrn`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `report_id` | ref `rehearsals_reports` | not null, cascade | internal | keep |  |
| `department_term_id` | ref `core_terms` | not null | internal | keep | Core's vocabulary core`.department` |
| `body` | text | not null, 1 to 2,000 characters | free text | keep | "Props: a second teacup, it breaks in 2.3" |
| `is_action` | boolean | not null, default false | internal | keep |  |
| `done_at` | timestamp | nullable; only when `is_action` | internal | keep |  |
| `done_by` | account, role actor | nullable | internal | keep | onMerge alias |
| `added_after_send` | boolean | not null, default false | internal | keep | A correction or addition after the report went out |

**No feed table.** A person's private calendar feed is core's `core.calendar-feed` (story C-70, written in spec 15; ruling R3-12): Rehearsals contributes each person's published calls to it and keeps no token of its own.

## What needs no table

- **The team.** Productions' `listTeam`. Rehearsals stores account ids only where a person is in a unit or called.
- **The room booking.** Spaces' row, found by origin `rehearsals.call` and the call's id. `room_state` is a copy for lists, kept by rule B4.
- **Who else is busy.** Core's `personsBusy`, asked at the moment the planner draws.
- **Who manages.** Grants and Productions' facts, held by Identity.
- **Call kinds.** A core vocabulary, `rehearsals.call-kind`, with one extra field per term: the Spaces purpose slug its room booking uses (part 6).

## When a person is erased

Their future call rows are removed first, in the erasure unit. Past call rows keep the call and the counts true: `account_id` is anonymised, `attendance` anonymised with it, and the response and attendance notes redacted. Unit memberships are deleted. Reports and call notes are the production's record and keep their text; a schedule manager may redact a note that names the person, through the redaction ability the core offers for free text. No erasure hold: nothing here needs to stop an erasure.

## When two accounts are merged

Every account column here is onMerge alias and none is move, so a merge rewrites no row. The one unique key on an account, (`call_id`, `account_id`) on call people, could hold both halves of a merged pair if both were called; reads by person use the kit's account scope and show such a pair once, with the earlier response and the better attendance mark. Rule U2's "already called" check also uses the account scope, so the pair is never added twice after the merge.
