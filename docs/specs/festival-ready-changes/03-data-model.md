# 2. Data model

Eight new tables and new columns on six existing ones, in Foundations' layout. Every new table also has `created_at` (and `updated_at` unless append-only), internal and kept. Columns added to a built table carry no new CHECK, because adding one rebuilds the table: their bounds are on the route's input and on the service's statement, as core already does for `finding_it` and `interval_minutes`.

## Id prefixes

Checked against every prefix declared in `layers/*/server/db/schema.ts` on `next` (23 November 2026); none is taken. To be added to Foundations' part 4 index by Integration, which also checks them against the other third-round specs.

| Prefix | Table | Holds |
| --- | --- | --- |
| `cln` | `core_collections` | A collection |
| none | `core_collection_productions` | A production in a collection; keyed by its two columns |
| `lup` | `core_performance_line_ups` | One item in a performance's line-up |
| `imp` | `core_imports` | One programme import |
| `hct` | `box_office_headcount_taps` | One press of the door counter |
| `shb` | `front_of_house_shift_batches` | Shifts made together from the rota grid |
| `crc` | `front_of_house_crew_calls` | A crew call and its perks rules |
| `hnd` | `front_of_house_handouts` | A T-shirt or meal handed out |

## Core: collections

**`core_collections`**: realm operational; subject none; not append-only; no retention.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `cln` | primary key | internal | keep |  |
| `slug` | text | not null, unique | public | keep | `/collections/<slug>`. Old slugs redirect, as productions' do, through the same slug history rule |
| `name` | text | not null, 1 to 80, unique ignoring case | public | keep | "StageFest", "Studio shorts" |
| `summary` | text | at most 300 | public | keep | Card and page lead |
| `description` | text | at most 5,000, markdown | public | keep | The collection page body |
| `colour` | text | not null, `#rrggbb` | public | keep | Timetable blocks, chips and the page accent. Checked for contrast against the brand's light and dark surfaces, as the `colour` setting kind is |
| `season_id` | ref `core_seasons` | nullable, on delete set null | internal | keep | Set: only productions of that season may join (a festival strand). Null: any production may (a standing strand) |
| `state` | text | not null, `draft`, `published`, `archived` | internal | keep | Only published collections show publicly |
| `sort` | integer | not null, default 0 | internal | keep | Order among collections of one season |
| `created_by` | account | actor, on merge alias, nullable | internal | keep |  |

An image is attached through core's files to the record type `core.collection`; there is no image column. Collections are never deleted once published, only archived, so a production's page never loses a "part of" link silently.

**`core_collection_productions`**: realm operational; subject none; key (`collection_id`, `production_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `collection_id` | ref `core_collections` | not null, on delete cascade | internal | keep |  |
| `production_id` | ref `core_productions` | not null, on delete cascade | internal | keep | Index on (`production_id`) for `collectionsFor` |
| `sort` | integer | not null, default 0 | internal | keep | Order within the collection page |

The season rule is a predicate on the insert (`collection.season_id IS NULL OR collection.season_id = production.season_id`), never a read beforehand.

## Core: line-ups and credits for one performance

**`core_performance_line_ups`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `lup` | primary key | internal | keep |  |
| `performance_id` | ref `core_performances` | not null, on delete cascade | internal | keep | Only draft performances can be deleted, so cascade never removes history |
| `production_id` | ref `core_productions` | nullable, on delete set null | internal | keep | The act's own production, when it has one. Unique per performance where not null |
| `name` | text | not null, 1 to 120 | public | keep | As printed. Filled from the production's title when linked, and may differ ("WickFest Big Band, second set") |
| `note` | text | at most 200 | public | keep | "With special guests" |
| `starts_at` | timestamp | nullable; within the performance's start and end | public | keep | An announced set time. Null: in order, no time given |
| `minutes` | integer | nullable, 1 to 600 | public | keep | Expected length, for the running order and the venue-day sheet |
| `announced` | boolean | not null, default true | internal | keep | False keeps an item off public pages until announced ("special guest") |
| `sort` | integer | not null | internal | keep | Order in the line-up |

Index on (`performance_id`, `sort`) and on (`production_id`) for a production's "appears in" list.

**`core_production_credits`**, two new columns (the table is built and holds members' names; nothing else changes):

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `performance_id` | ref `core_performances` | nullable, on delete cascade | internal | keep | Set: the credit applies to that performance only, which must belong to the credit's production (statement predicate). Null: every performance, as today |
| `line_up_id` | ref `core_performance_line_ups` | nullable, on delete cascade | internal | keep | Set: the person is in that line-up item; `performance_id` must equal the item's. For an item with no production of its own |

Index on (`performance_id`) where not null. A per-performance credit is shown on that date only and counts toward `core.production-team` like any other credit.

## Core: drop-in performances, video player, import marker

**`core_performances`**, five new columns:

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `shape` | text | not null, default `timed`; `timed` or `drop-in` (route input) | public | keep | Drop-in: `starts_at` is open from, `ends_at` open until, `doors_at` null, no intervals |
| `video_url` | text | nullable, `https://` (route input), at most 500 | public | keep | A livestream or recording on a switched-on player host: YouTube, Vimeo or Cloudflare Stream (VL1). Played in an embedded player; never hosted here |
| `video_kind` | text | nullable; `live` or `recording`; required when `video_url` is set | public | keep | Live: shown from doors (or open from) to the end. Recording: shown from the end onwards |
| `import_id` | ref `core_imports` | nullable, on delete set null | internal | keep | The import that made it, for undo |
| `external_ref` | text | nullable, at most 200; unique where not null | internal | keep | The source's own id (`pretalx:<event>:<code>`), so a second import updates rather than duplicates |

**`core_productions`**, two new columns: `import_id` and `external_ref`, as above.

**`core_imports`**: realm operational; subject none; not append-only; retention of the uploaded file by `core.import.keep-files`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `imp` | primary key | internal | keep |  |
| `kind` | text | not null, `spreadsheet` or `pretalx` | internal | keep |  |
| `file_id` | ref `core_files` | nullable, on delete set null | internal | keep | The uploaded file, private to staff. Cleared when the file is swept |
| `source_url` | text | nullable, `https://`, at most 500 | internal | keep | A pretalx schedule address, instead of a file |
| `season_id` | ref `core_seasons` | not null | internal | keep | Everything imported joins this season |
| `collection_id` | ref `core_collections` | nullable | internal | keep | Optionally, everything imported joins this collection too |
| `mapping` | JSON | not null | internal | keep | Source room names to space ids, categories and tracks to terms or collections, columns to fields. Ids and names only |
| `summary` | JSON | not null | internal | keep | Counts: new, updated, unchanged, refused, with the reason for each refused row by row number |
| `state` | text | not null; `previewed`, `applying`, `applied`, `undoing`, `undone`, `failed` | internal | keep |  |
| `created_by` | account | actor, on merge alias | internal | keep |  |
| `applied_at`, `undone_at` | timestamp | nullable | internal | keep |  |

The import holds no personal data of its own. A pretalx speaker's public name becomes a credit with no account (public, as on the festival's published schedule); biographies, emails and anything not in the public export are never read.

## Forms

**The definition format** gains optional fields; the format number stays 1 because an older engine simply ignores them.

| Where | New field | Meaning |
| --- | --- | --- |
| `Question` (choice, yes or no, number, short text) | `answer: { correct, points?, feedback? }` | `correct`: option ids (choice), a boolean (yes or no), `{ min, max }` (number) or a list of accepted texts compared ignoring case and surrounding spaces (short text). `points` whole, 0 to 100, default 1. `feedback`: `{ right?, wrong? }`, at most 500 each |
| `Definition` | `marking: { passMark, show }` | `passMark` whole points, 0 to the total. `show`: `score`, `score-and-feedback` or `score-feedback-and-answers` |
| `Transition` | `who: 'system'` and `when: Condition` | A move the system makes; `when` required for system moves, refused on others |
| `Operand` | `{ marking: 'score' \| 'percent' \| 'passed' }` | Usable in a system transition's condition and in calculations |

The answer key lives in the published version's definition, which is immutable, so marking a response always uses the key of the version it answered. Every route that sends a definition to a browser sends it through `publicDefinition()`, which removes `answer` and `marking.passMark`; a build test fails if any other path serialises a definition.

**`forms_responses`**, three new columns:

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `score` | integer | nullable | personal | clear | Points scored at submission. Null when the version has no answer key |
| `out_of` | integer | nullable | internal | keep | Total points available in that version |
| `passed` | boolean | nullable | personal | clear | Against the version's pass mark |

Per-question marking is not stored: it is worked out again from the stored answers and the version's key whenever it is shown, and gives the same answer because both are immutable.

## Front of house

**`front_of_house_shifts`**, three new columns: `space_id` (nullable, internal: the space the shift works in, copied from the performance or chosen in the grid; the venue-day sheet groups by it), `batch_id` (ref `front_of_house_shift_batches`, nullable, on delete set null) and `crew_call_id` (ref `front_of_house_crew_calls`, nullable, on delete set null).

**`front_of_house_shift_batches`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `shb` | primary key | internal | keep |  |
| `crew_call_id` | ref `front_of_house_crew_calls` | nullable | internal | keep |  |
| `template_id` | ref `front_of_house_rota_templates` | not null | internal | keep | The duties and places applied |
| `venue_id` | ref `core_venues` (by id) | not null | internal | keep |  |
| `space_id` | text | nullable | internal | keep |  |
| `title` | text | not null, 1 to 80 | internal | keep | "Bar", "Gallery stewards" |
| `days` | JSON | not null, 1 to 31 local dates | internal | keep |  |
| `call_time`, `end_time` | time | not null, `HH:MM`; an end before the call runs past midnight | internal | keep | Local wall-clock times |
| `made` | integer | not null | internal | keep | Shifts made |
| `state` | text | not null, `made` or `removed` | internal | keep | Removing a batch cancels its shifts that nobody has taken and lists the rest |
| `created_by` | account | actor, alias | internal | keep |  |

**`front_of_house_crew_calls`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `crc` | primary key | internal | keep |  |
| `name` | text | not null, 1 to 80, unique among live rows | internal | keep | "StuFF 2027 crew" |
| `season_id` | text | nullable | internal | keep | Shifts made for this season's performances join the call automatically |
| `starts_on`, `ends_on` | date | not null, ends on or after starts | internal | keep | Local dates |
| `form_id` | ref `forms_forms` (by id) | nullable | internal | keep | The sign-up questions, offered in the slot `front-of-house.crew-call` |
| `question_roles` | JSON | not null, default `{}` | internal | keep | Which question key is the T-shirt size, the meal days and the dietary need. Keys only |
| `tshirt_min_shifts` | integer | nullable, 1 to 50 | internal | keep | Shifts worked to earn a T-shirt. Null: no T-shirts |
| `meal_min_minutes` | integer | nullable, 30 to 720 | internal | keep | Minutes on shift in a day to earn a meal that day. Null: no meals |
| `meals_on_request` | boolean | not null, default true | internal | keep | Count a meal only on days the person asked for one |
| `state` | text | not null, `draft`, `open`, `closed`, `archived` | internal | keep |  |
| `created_by` | account | actor, alias | internal | keep |  |

**`front_of_house_handouts`**: realm members; subject `account_id`; append-only; retention `front-of-house.retention.assignments`, counted from the call's end.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `hnd` | primary key | internal | keep |  |
| `crew_call_id` | ref `front_of_house_crew_calls` | not null | internal | keep |  |
| `account_id` | account | subject, on merge alias | internal | keep |  |
| `item` | text | not null, `tshirt` or `meal` | internal | keep |  |
| `day` | date | required for a meal, null for a T-shirt | internal | keep |  |
| `size` | text | nullable, at most 20 | personal | clear | The size handed over, which may differ from the answer |
| `reverses_id` | ref `front_of_house_handouts` | nullable | internal | keep | An undo is a new row; nothing is edited |
| `handed_by` | account | actor, alias | internal | keep |  |

At most one standing handout per call, person, item and day: a predicate on the insert (no unreversed row for the same four), not a unique index, because reversals are rows too.

**`front_of_house_assignments`**, three new columns: `shadowing` (boolean, not null, default false: this person is shadowing on this shift), `shadow_confirmed_by` (account, actor, on merge alias, nullable) and `shadow_confirmed_at` (timestamp, nullable). A shadowing assignment does not count toward the shift's \`places\_taken\`, so the existing CHECK still guards real places; shadow places are limited by \`front-of-house.shifts.shadow-places\` in the sign-up statement. Both shadow confirmation columns are set together, once, by the lead; a correction clears and sets again in one unit and is audited.

## Box office

**`box_office_headcount_taps`**: realm operational; subject none; append-only; no retention (counts are the theatre's history and name nobody).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id `hct` | primary key; made on the device | internal | keep | So a tap sent twice from an offline device counts once, as scans do |
| `performance_id` | text | not null | internal | keep | The performance the counter was set to |
| `kind` | text | not null, `in`, `out` or `undo` | internal | keep | `in` is a person admitted without a ticket scan. `out` a person leaving. `undo` reverses one earlier tap |
| `quantity` | integer | not null, 1 to 50, default 1 | internal | keep | A group counted in one press ("+4") |
| `reverses_id` | ref `box_office_headcount_taps` | required for `undo`, else null | internal | keep | An undo of an undo is refused |
| `tapped_by` | account | actor, alias | internal | keep |  |
| `device_label` | text | nullable, at most 40 | internal | keep |  |
| `tapped_at` | timestamp | not null | internal | keep | The device's clock |
| `received_at` | timestamp | not null | internal | keep | The server's |
| `offline` | boolean | not null, default false | internal | keep |  |

Index on (`performance_id`, `received_at`). Figures are derived, never stored: admitted is Box office's existing count of admitted scans; walk-ups is the sum of `in` quantities less undone ones; out likewise; inside is admitted plus walk-ups less out, never below nought.

## What erasure and merge do

| Table | Erasing a person | Merging two accounts |
| --- | --- | --- |
| `core_production_credits` (new columns) | Unchanged: the credit follows core's existing rule | Unchanged (alias) |
| `forms_responses` (new columns) | Score and passed cleared with the response's other personal columns | Moves with the response |
| `front_of_house_handouts` | Rows kept with the account anonymised; size cleared | Alias: the survivor's counts include both |
| `front_of_house_assignments` (new columns) | Kept, as the rest of the row | Unchanged |
| Every other new table | Names nobody | Actor columns alias |

## Calendar feed (support module calendar-feed, C-70)

One new table, the same shape as Front of house's feed table, which it replaces (CF5).

| Column | Type | Notes | Class | Retention | Purpose |
| --- | --- | --- | --- | --- | --- |
| account\_id | id | primary key; subject; onMerge move | internal | erased with the account | One feed each |
| token\_hash | text | unique; keyed hash of the token | internal | keep | Finds the person from the address |
| generation | integer | default 1; raised by Reset | internal | keep | Makes the old address stop working |
| created\_at | timestamp |  | internal | keep |  |

Table calendar\_feed\_tokens, realm members, subject account\_id. Keyed by account, so it needs no id prefix. The site marker is a core configuration value, not a column.
