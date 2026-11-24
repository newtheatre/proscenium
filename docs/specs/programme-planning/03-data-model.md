# 2. Data model

Programme planning owns thirteen tables, all prefixed `programme_planning_`, in the Foundations layout. Every table also has `created_at` and, unless append-only, `updated_at`; they are internal, kept on erasure, and left out of the lists below. No table holds a time that core also holds: a placement's start, end and space are read from the core performance, never copied.

## Id prefixes

Checked against Foundations' index (part 4) and the built code on 23 November 2026; none is taken. All are time-sorted. To be registered by the Integration spec.

| Prefix | Table | Holds |
| --- | --- | --- |
| `pppl` | `programme_planning_plans` | One season's plan |
| `ppsl` | `programme_planning_offered_slots` | A window offered in a call |
| `ppen` | `programme_planning_entries` | One thing that might be programmed |
| `pp``ew` | `programme_planning_``entry_windows` | One time an entry can or cannot do |
| `pppc` | `programme_planning_pencils` | A tentative placement |
| `ppck` | `programme_planning_acknowledgements` | A warning a programmer accepted |
| `ppnt` | `programme_planning_notices` | One slot notice sent for one entry |
| none | `programme_planning_entry_people` | Keyed by entry and account |
| none | `programme_planning_entry_needs` | Keyed by entry and term |
| none | `programme_planning_slot_choices` | Keyed by entry and offered slot |
| none | `programme_planning_space_profiles` | Keyed by space |
| none | `programme_planning_space_features` | Keyed by space and term |
| none | `programme_planning_placements` | Keyed by performance and entry |

## Plans and offered slots

`programme_planning_plans`: realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `season_id` | ref `core_seasons` | not null, unique | internal | keep | One plan per season |
| `state` | text | one of planning, published, closed | internal | keep | Part 3 |
| `board_from` | date | not null | internal | keep | First day the board shows. Defaults to the season's start |
| `board_to` | date | not null, on or after `board_from` | internal | keep | Defaults to the season's end |
| `day_starts` | time | not null, default 09:00 | internal | keep | First hour drawn in Day view |
| `day_ends` | time | not null, after `day_starts` or 00:00 meaning midnight | internal | keep |  |
| `call_opens_at` | timestamp | nullable | internal | keep | Copied to the forms placement's opening; null when there is no call |
| `call_closes_at` | timestamp | nullable, after `call_opens_at` | internal | keep |  |
| `publish_productions` | boolean | not null, default from the setting | internal | keep | Whether publishing also publishes each placed production |
| `published_at` | timestamp | nullable | internal | keep | Last publish |
| `published_by` | account | nullable; role actor, onMerge alias | internal | keep |  |
| `version` | integer | not null, default 0 | internal | keep | Raised by every board write, so two programmers see each other's moves and a stale write is refused |

`programme_planning_offered_slots`: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `plan_id` | ref plans | not null | internal | keep |  |
| `label` | text | not null, 1 to 60, unique in the plan | public | keep | "Studio, week 3". Shown in the call |
| `space_id` | ref `core_spaces` | not null | internal | keep |  |
| `first_day` | date | not null | internal | keep | Operating days (core's 04:00 to 04:00) |
| `last_day` | date | not null, on or after `first_day` | internal | keep |  |
| `pattern` | JSON | not null | internal | keep | Core's run-preset shape, `[{ days, times }]`; may be copied from a run preset |
| `takes` | integer | not null, default 1, 1 to 20 | internal | keep | How many entries it can hold (a showcase evening takes several) |
| `sort` | integer | not null | internal | keep |  |

## Entries

`programme_planning_entries`: realm members; subject account `applicant_account_id`, unlinked staff; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `plan_id` | ref plans | not null | internal | keep |  |
| `source` | text | one of call, manual, companies, import | internal | keep |  |
| `source_ref` | text | nullable, at most 80, unique among live entries | internal | keep | `forms:<response id>`, `companies:<engagement id>`, or an import row. Opaque |
| `title` | text | not null, 1 to 200 | internal | keep | The working title. Becomes the production's title on accept, after which the production's own title is shown |
| `kind` | text | one of own, visiting, hire, event | internal | keep | Passed to core on accept |
| `category_term_id` | ref `core_terms` | nullable | internal | keep | Core's category vocabulary |
| `state` | text | one of candidate, accepted, declined, withdrawn | internal | keep | Part 3 |
| `production_id` | ref `core_productions` | nullable, unique; set exactly when accepted | internal | keep |  |
| `company_id` | text | nullable | internal | keep | Opaque `companies.company` id; set only while Companies is on |
| `applicant_account_id` | account | nullable; role subject, onMerge alias | personal | anonymise | Who answered the call; null when typed in by staff |
| `minutes` | integer | nullable, 1 to 1,440 | internal | keep | Running time of one performance; the board needs it to place |
| `get_in_minutes` | integer | not null, default 0, 0 to 720 | internal | keep |  |
| `get_out_minutes` | integer | not null, default 0, 0 to 720 | internal | keep |  |
| `performances_wanted` | integer | not null, default 1, 1 to 60 | internal | keep | The tray shows an entry until it has this many placements |
| `shape` | text | one of timed, drop-in; default timed | internal | keep | Core's performance shape (C-62) |
| `rights_status` | text | one of none-needed, needed, held-by-company, unknown; default unknown | internal | keep | Carried on the accept event for Productions |
| `collection_ids` | JSON | not null, default empty list | internal | keep | Collections asked for (C-60). Passed to core on accept |
| `staff_note` | text | at most 2,000 | free-text | redact | Programmers only. The screen says not to write about people |
| `decided_at` | timestamp | nullable | internal | keep |  |
| `withdrawn_reason` | text | nullable, one of applicant, staff, production-cancelled, retention | internal | keep |  |

`programme_planning_entry_people`: realm members; subject account `account_id`; key (`entry_id`, `account_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `entry_id` | ref entries | not null | internal | keep |  |
| `account_id` | account | not null; role subject, onMerge handler | personal | delete row | The handler keeps one row when both merged accounts were on the entry |
| `role` | text | one of contact, member | internal | keep | A contact is told about slots; a member only counts for "in two places" |
| `told` | boolean | not null, default true for contact | internal | keep | A contact may opt out of slot notices |

Once an entry is accepted, "in two places" also reads core's credits through `core.person-busy`; these rows matter most before a production exists.

`programme_planning_``entry_windows`: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `entry_id` | ref entries | not null | internal | keep |  |
| `kind` | text | one of can, cannot, prefer | internal | keep | An entry with any `can` row is unavailable outside them |
| `starts_at` | timestamp | not null | internal | keep |  |
| `ends_at` | timestamp | not null, after `starts_at` | internal | keep |  |

No reason column: why a group cannot do a time is nobody's business on the board, and a reason would often be personal.

`programme_planning_entry_needs`: realm operational; subject none; key (`entry_id`, `term_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `entry_id` | ref entries | not null | internal | keep |  |
| `term_id` | ref `core_terms` | not null; in `programme-planning.tech-need` | internal | keep |  |
| `level` | text | one of required, preferred | internal | keep |  |

`programme_planning_slot_choices`: realm operational; subject none; key (`entry_id`, `offered_slot_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `entry_id` | ref entries | not null | internal | keep |  |
| `offered_slot_id` | ref offered slots | not null, same plan | internal | keep |  |
| `rank` | integer | not null, 1 to 10, unique per entry | internal | keep | 1 is first choice |

## Spaces as the board sees them

`programme_planning_space_profiles`: realm operational; subject none; key (`space_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `space_id` | ref `core_spaces` | primary key | internal | keep |  |
| `changeover_minutes` | integer | nullable, 0 to 720 | internal | keep | Null takes the setting. Never less than core's turnaround in effect (rule W3) |
| `on_board` | boolean | not null, default true | internal | keep | Whether the space is a column on the board |
| `board_order` | integer | not null | internal | keep |  |

A space with no row is on the board, in core's order, with the setting's changeover.

`programme_planning_space_features`: realm operational; subject none; key (`space_id`, `term_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `space_id` | ref `core_spaces` | not null | internal | keep |  |
| `term_id` | ref `core_terms` | not null; in `programme-planning.tech-need` | internal | keep | What the space offers |

## Pencils and placements

`programme_planning_pencils`: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `entry_id` | ref entries | not null | internal | keep |  |
| `space_id` | ref `core_spaces` | not null | internal | keep | Venue is read from core |
| `starts_at` | timestamp | not null | internal | keep | Opens at, for drop-in |
| `ends_at` | timestamp | not null, after `starts_at` | internal | keep |  |
| `line_up_of` | ref `core_performances` | nullable | internal | keep | Pencilled into another performance's line-up rather than a time of its own |
| `offered_slot_id` | ref offered slots | nullable | internal | keep |  |
| `option` | integer | not null, default 1, 1 to 3 | internal | keep | Option 2 or 3 is an alternative, drawn hatched |

`programme_planning_placements`: realm operational; subject none; key (`performance_id`, `entry_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `performance_id` | ref `core_performances` | not null | internal | keep | Draft or scheduled; core holds its time and space |
| `entry_id` | ref entries | not null | internal | keep |  |
| `line_up_item_id` | text | nullable | internal | keep | Core's line-up item, when the entry was placed in a line-up rather than as its own performance |
| `offered_slot_id` | ref offered slots | nullable | internal | keep |  |
| `told_fingerprint` | text | nullable, 64 | internal | keep | Hash of the space, start and end last told to the act; differs when the slot moved since |

An entry placed as its own performance has one row per performance. Entries placed into a showcase's line-up share the host performance, one row each, which is why the key is the pair.

## Acknowledgements and notices

`programme_planning_acknowledgements`: realm operational; subject none; append-only; corrections by a later row with `withdrawn` true.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `plan_id` | ref plans | not null | internal | keep |  |
| `warning_key` | text | not null, 120 | internal | keep | Kind plus the ids it is about, sorted: `entry-window``:ppen_x:perf_y`. Stable while the facts are |
| `withdrawn` | boolean | not null, default false | internal | keep |  |
| `note` | text | at most 300 | free-text | redact |  |
| `by` | account | not null; role actor, onMerge alias | internal | keep |  |

`programme_planning_notices`: realm members; subject none; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `entry_id` | ref entries | not null | internal | keep |  |
| `kind` | text | one of slots, changed, cancelled | internal | keep |  |
| `recipients` | integer | not null | internal | keep | How many people; who is core's notification record |
| `fingerprint` | text | not null, 64 | internal | keep | The slots as told |
| `sent_by` | account | nullable; role actor, onMerge alias | internal | keep | Null when sent by the publish job |

## Erasure, merge and retention

- **Erasing a person.** Entries they applied for keep their planning facts (times, needs, length): the programme's history, holding nothing personal. `applicant_account_id` is anonymised, `staff_note` redacted, their `entry_people` rows deleted. An entry still a candidate when its applicant is erased is withdrawn with reason applicant, in the erasure unit, by this module's erasure handler; its pencils go with it. Accepted entries are untouched beyond that: the production is core's.
- **Merging two accounts.** Every account column is alias except `entry_people.account_id`, whose handler keeps one row where both were on one entry.
- **Retention.** A declined or withdrawn entry, with its entry windows, needs, slot choices and pencils, is deleted `programme-planning.retention.unsuccessful` after it was decided (default 2 years). The form response is the form builder's to keep or delete under its own retention.
- **Data download.** A person's entries (title, state, slots told) through `core.export-contributor`.
