# 2. Data model

Availability owns fourteen tables, all prefixed `availability_`, in Foundations' layout. Every table also has `created_at` and, unless append-only, `updated_at`; they are internal, kept on erasure, and left out of the lists. None is append-only: availability is a person's current word, not a record of history. Times of day are wall clock in the theatre's time zone (stored `HH:MM`, `24:00` allowed as an end), so "18:00 on Tuesdays" stays 18:00 across a clock change.

## Id prefixes

Checked free by Integration on 23 November 2026 (R3-26). All time-sorted.

| Prefix | Table | Holds |
| --- | --- | --- |
| none | `availability_profiles` | One row per account that has entered anything; keyed by `account_id` |
| `avpt` | `availability_patterns` | A named weekly pattern with a date range |
| `avpl` | `availability_pattern_lines` | One weekly time in a pattern |
| `avex` | `availability_exceptions` | A dated entry |
| `avcc` | `availability_calendar_connections` | A person's link to an outside calendar (proposed, 24 November; Integration to check) |
| `avib` | `availability_imported_blocks` | One busy block read from an outside calendar (proposed, 24 November) |
| `avrq` | `availability_requests` | An availability request |
| `avrp` | `availability_request_people` | One person asked |
| `avfd` | `availability_finds` | A saved find (a poll) |
| none | `availability_find_people` | One person in a poll; keyed by (`find_id`, `account_id`) |
| `avfs` | `availability_find_slots` | A shortlisted slot |
| `avfv` | `availability_find_votes` | One person's answer for one slot |
| `avmt` | `availability_meetings` | An arranged meeting |
| `avmi` | `availability_meeting_invitees` | One person invited |

## A person's availability

**`availability_profiles`**: realm members; subject `account_id`; key `account_id`; onErasure delete-row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `account_id` | account, role subject, on merge handler | primary key | internal | delete row | See "Merge" below |
| `unmarked_means` | text | one of unknown, free; nullable | internal | delete row | Null follows `availability.entry.unmarked-default` |
| `changed_at` | timestamp | not null | internal | delete row | Last change to any pattern, line or exception. Drives "updated 3 days ago" |
| `checked_to` | local date | nullable | internal | delete row | Latest `to_date` of a request this person answered |

**`availability_patterns`**: realm members; subject `account_id`; onErasure delete-row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `account_id` | account, role subject, on merge handler | not null | internal | delete row |  |
| `label` | text | not null, at most 40 | free text | delete row | "Term time". Seen by the person only |
| `starts_on` | local date | not null | internal | delete row |  |
| `ends_on` | local date | nullable, on or after `starts_on` | internal | delete row | Null runs on. Two patterns of one person may not overlap (rule A2) |

**`availability_pattern_lines`**: realm members; subject via `pattern_id`; onErasure delete-row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `pattern_id` | ref `availability_patterns` | not null, cascade | internal | delete row |  |
| `weekday` | integer | not null, 1 (Monday) to 7 | internal | delete row |  |
| `from_local` | text | not null, local time on a grid step | internal | delete row |  |
| `until_local` | text | not null, after `from_local`, at most 24:00 | internal | delete row | Lines of one pattern and weekday may not overlap |
| `level` | text | not null, one of free, maybe, busy | internal | delete row |  |

**`availability_exceptions`**: realm members; subject `account_id`; retention `availability.retention.past`, counted from `last_date`; onErasure delete-row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `account_id` | account, role subject, on merge move | not null | internal | delete row | Move is safe: exceptions have no uniqueness |
| `first_date` | local date | not null | internal | delete row |  |
| `last_date` | local date | not null, on or after `first_date`, at most 366 days after it | internal | delete row |  |
| `weekdays` | text | JSON list of 1 to 7, nullable | internal | delete row | "Tuesdays until 6 March". Null means every day in the range |
| `from_local`, `until_local` | text | both null (whole day) or both set, `until_local` after `from_local` | internal | delete row |  |
| `level` | text | not null, one of free, maybe, busy | internal | delete row | Free overrides a busy pattern ("I can do this Thursday after all") |
| `reason` | text | at most 300 | free text | delete row | Optional |
| `reason_shared` | boolean | not null, default false | internal | delete row | True shows the reason to planners of groups the person is in (rule A7) |
| `entered_by` | account, role actor, on merge alias | not null | internal | keep | Differs from `account_id` for an entry on someone's behalf (rule A8) |
| `request_id` | ref `availability_requests` | nullable, set null | internal | delete row | The request it was entered against, for "added for Hamlet" on the person's own list |

## Requests

**`availability_requests`**: realm members; subject none; retention `availability.retention.``history`, counted from `closed_at`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `title` | text | not null, at most 80 | internal | keep | "Hamlet rehearsals, January to March" |
| `message` | text | at most 1,000 | free text | keep | The organiser's words. The screen says not to name anyone |
| `from_date`, `to_date` | local date | not null, to on or after from, at most 366 days apart | internal | keep | The period to check |
| `due_on` | local date | not null, on or after today when opened | internal | keep |  |
| `group_refs` | JSON | not null, list of group ids, may be empty | internal | keep | As chosen |
| `account_refs` | JSON | not null, list of account ids, may be empty | internal | keep | People named beside the groups, so the daily task never withdraws them as leavers (R6) |
| `source_ref` | text | nullable, unique among open requests | internal | keep | Set when a module opened it: `rehearsals.schedule:<id>`. Such a request is closed by its module, not by hand |
| `opened_by` | account, role actor, on merge alias | not null | internal | keep |  |
| `state` | text | one of open, closed | internal | keep | See part 3 |
| `reminded_at` | timestamp | nullable | internal | keep | The last "Remind now", which goes at most once a day (S11) |
| `closed_at` | timestamp | nullable | internal | keep |  |

**`availability_request_people`**: realm members; subject `account_id`; onErasure delete-row; unique (`request_id`, `account_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `request_id` | ref `availability_requests` | not null, cascade | internal | delete row |  |
| `account_id` | account, role subject, on merge handler | not null | internal | delete row | Handler keeps the further-along row where both accounts were asked |
| `state` | text | one of asked, answered, lapsed, withdrawn | internal | delete row | See part 3 |
| `answered_at` | timestamp | nullable | internal | delete row |  |
| `reminders_sent` | integer | not null, default 0 | internal | delete row |  |

## Polls

A find that is never sent is not stored: the grid is computed on demand.

**`availability_finds`**: realm members; subject none; retention `availability.retention.``history`, counted from `decided_at` or `abandoned_at`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `title` | text | not null, at most 80 | internal | keep |  |
| `length_minutes` | integer | not null, a multiple of the grid step, 15 to 720 | internal | keep |  |
| `group_refs` | JSON | not null | internal | keep | As chosen, for "run again" |
| `space_ids` | JSON | not null, default empty list | internal | keep | Opaque `spaces.space:<id>` refs shown on the grid |
| `context_ref` | text | nullable | internal | keep | `productions.production:<id>` or `governance.body:<id>`, carried to the result |
| `target_id` | text | nullable | internal | keep | The target the organiser means to use, for the closing screen |
| `created_by` | account, role actor, on merge alias | not null | internal | keep |  |
| `answers_by` | timestamp | not null | internal | keep | When the poll stops taking answers |
| `state` | text | one of polling, decided, abandoned | internal | keep | See part 3 |
| `decided_slot_id` | ref `availability_find_slots` | nullable | internal | keep |  |
| `outcome_ref` | text | nullable | internal | keep | What the target made: `rehearsals.call:<id>`, `availability.meeting:<id>` |
| `decided_at`, `abandoned_at` | timestamp | nullable | internal | keep |  |

**`availability_find_people`**: realm members; subject `account_id`; key (`find_id`, `account_id`); onErasure delete-row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `find_id` | ref `availability_finds` | not null, cascade | internal | delete row |  |
| `account_id` | account, role subject, on merge handler | not null | internal | delete row | Handler: one row survives, must-have wins |
| `must_have` | boolean | not null | internal | delete row |  |

**`availability_find_slots`**: realm members; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `find_id` | ref `availability_finds` | not null, cascade | internal | keep | 2 to 6 per find |
| `starts_at`, `ends_at` | timestamp | not null, length equals the find's | internal | keep |  |

**`availability_find_votes`**: realm members; subject `account_id`; onErasure delete-row; unique (`slot_id`, `account_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `slot_id` | ref `availability_find_slots` | not null, cascade | internal | delete row |  |
| `account_id` | account, role subject, on merge handler | not null | internal | delete row | Handler: the later answer wins |
| `answer` | text | not null, one of yes, if-need-be, no | internal | delete row | Never changes the person's availability |

## Arranged meetings

**`availability_meetings`**: realm members; subject none; retention `availability.retention.``history`, counted from `ends_at`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `title` | text | not null, at most 80 | internal | keep | "Hamlet production meeting" |
| `starts_at`, `ends_at` | timestamp | not null, ends after starts, at most 24 hours | internal | keep |  |
| `place` | text | at most 120 | internal | keep | Words, when there is no space booking |
| `space_booking_ref` | text | nullable | internal | keep | Opaque `spaces.booking:<id>`, when a room was booked for it |
| `context_ref` | text | nullable | internal | keep | Shows the meeting on that production's schedule |
| `notes` | text | at most 2,000 | free text | keep | Agenda. The screen says not to name anyone in it |
| `arranged_by` | account, role actor, on merge alias | not null | internal | keep |  |
| `find_id` | ref `availability_finds` | nullable | internal | keep |  |
| `state` | text | one of arranged, cancelled | internal | keep | Past is derived from `ends_at` |
| `cancelled_reason` | text | at most 200 | internal | keep |  |

**`availability_meeting_invitees`**: realm members; subject `account_id`; unique (`meeting_id`, `account_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `meeting_id` | ref `availability_meetings` | not null, cascade | internal | keep |  |
| `account_id` | account, role subject, on merge handler | not null | internal | anonymise | Past meetings keep a row so "7 invited" stays true |
| `response` | text | one of pending, going, not-going | internal | keep |  |
| `responded_at` | timestamp | nullable | internal | keep |  |

## Calendar imports

Matt chose these for the first release on 24 November (question 6). Only busy time is kept: never a title, place, description, attendee or the event's own id beyond what loop suppression needs (rule I4).

**`availability_calendar_connections`**: realm members; subject `account_id`; onErasure delete-row; at most `availability.import.max-connections` live per account.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `account_id` | account, role subject, on merge move | not null | internal | delete row | Move: connections have no uniqueness across accounts |
| `kind` | text | not null, one of ics, google, microsoft | internal | delete row |  |
| `label` | text | not null, at most 40 | free text | delete row | "Uni timetable". Seen by the person only |
| `ics_url` | text, encrypted | required for ics, at most 2,000, https only | special | delete row | The calendar's secret address. Never shown again after saving, never logged, never in an export |
| `token` | text, encrypted | required for google and microsoft | special | delete row | The refresh token from the person's consent (I2). Revoked at the provider on disconnect and erasure |
| `provider_subject` | text | nullable | personal | delete row | The provider's account id, so a reconnect replaces rather than duplicates |
| `tentative_as` | text | not null, one of maybe, busy, ignore; default maybe | internal | delete row | What a tentative outside event becomes |
| `state` | text | one of active, failing, broken, disconnected | internal | delete row | See I5 |
| `last_synced_at` | timestamp | nullable | internal | delete row | "Synced 12 minutes ago" |
| `failures` | integer | not null, default 0 | internal | delete row | Consecutive failed refreshes |

**`availability_imported_blocks`**: realm members; subject via `connection_id`; onErasure delete-row; replaced whole on each refresh.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | delete row |  |
| `connection_id` | ref `availability_calendar_connections` | not null, cascade | internal | delete row |  |
| `starts_at`, `ends_at` | timestamp | not null, ends after starts | internal | delete row | All-day events stored as the theatre's local midnight to midnight |
| `level` | text | not null, one of busy, maybe | internal | delete row | Busy, or the connection's `tentative_as` for a tentative event |

A refresh deletes the connection's blocks and writes the new set in one batch, chunked within the bound-parameter limit, so a reader never sees half a calendar.

## Erasure

One unit, no hold: every row about the person in profiles, patterns (and lines by cascade), exceptions, calendar connections (and imported blocks by cascade), request people, find people and votes is deleted. Invitee rows for meetings not yet ended are deleted; past ones keep the row with the account following Identity's tombstone. Free text the person wrote is all in deleted rows. Before the unit, each Google or Microsoft token is revoked through the module's declared outside call; a failed revoke is retried by the call's reconcile and never holds the erasure. An organiser's `message` or `notes` that names the person is redacted by staff through core's free-text redaction, as elsewhere.

## Merge

The module contributes one handler step, `availability.settle-merge`, before Identity rewrites columns:

- **Profile**: the surviving account keeps its row; `changed_at` becomes the later of the two; `checked_to` the later.
- **Patterns**: the account whose `changed_at` is later keeps its patterns; the other's are set aside (moved to the survivor with `ends_on` set to the day before the kept pattern starts, so nothing overlaps) and listed on the merge screen. Undo restores them.
- **Exceptions**: moved. Overlaps are allowed; part 3 says how they combine.
- **Request people, find people, votes, invitees**: where both accounts appear, the further-along row is kept (answered over asked; going over pending; the later vote; must-have over optional) and the other is deleted, recorded on the merge item for undo.

## How levels are worked out

No level is stored per slot. `levels()` computes them from the rows above at read time (rule A4), so a pattern change shows everywhere at once and nothing needs rebuilding.
