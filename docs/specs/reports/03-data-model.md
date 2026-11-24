# 2. Data model

Reports owns six tables, all named `reports_*`, with five id prefixes. None holds a total: a run's totals live in its file. One table, `reports_person_rows`, holds the rows of a people report, because those rows name people and erasure must reach them (Matt's answer to question 2, 24 November 2026). Two kit points feed Reports: `core.measure` for totals and `core.person-measure` for figures per person. They are contracts, not tables, and come first because other modules write against them. Both were agreed with Integration as R3-27.

## Reading the tables

Each table is in the Foundations data-class layout: a line of options, then one row per column. `created_at`, and `updated_at` where rows change, are left out: timestamps, internal, kept. An instant is UTC milliseconds; a local date is text `YYYY-MM-DD` in the theatre's time zone.

| Table | Prefix | Holds | Rows grow with |
| --- | --- | --- | --- |
| `reports_definitions` | `rpd` | A theatre's saved report | Tens |
| `reports_runs` | `rpr` | One working-out of a report, with its file | A few a week; pruned by `reports.runs.keep-for` |
| `reports_person_rows` | `rpe` | One person's figure in one copy of a people report | People times figures per copy; pruned by `reports.people.keep-for` |
| `reports_schedules` | `rpsh` | When a report is run and who it goes to | Tens |
| `reports_schedule_recipients` | none, keyed by schedule and account | The people a schedule sends to | A handful per schedule |
| `reports_pins` | `rpp` | A saved report attached to a committee post | A few per post |

All five prefixes are time-sorted and checked against the Foundations index and the built code on 23 November 2026 (`rps` was taken by `core_run_presets`, so schedules use `rpsh`). Ready-made reports are not rows: they come from the point `reports.report` at start-up, as navigation entries do.

## The point `core.measure`

A code point declared by core, so contributing needs no dependency on Reports. One file per figure, `server/contributions/core.measure/<name>.ts`; the figure's id is `<module>.<name>`.

```ts
interface Measure {
  label: string                      // translation key; '<id>.help' explains it in the catalogue
  unit: 'count' | 'money' | 'minutes' | 'percent'
  combine: 'sum' | 'distinct' | 'level'
  by: Breakdown[]                    // shared keys and the module's own '<module>.<noun>' keys
  filters?: Breakdown[]              // keys it honours as a filter, declared up front (R3-27)
  ability: string                    // held site-wide, or on the scope record
  ratio?: { of: string, over: string } // a percent worked out by core from two figures; no read then
  read?: (q: MeasureQuery) => Promise<{ rows: MeasureRow[] } | 'unsupported'>
}
interface MeasureQuery {
  from: string, to: string           // local dates, inclusive, in show nights
  scope?: { season: string } | { collection: string } | { production: string } | { performance: string } | { venue: string } | { space: string }
  by: Breakdown[]                    // zero, one or two keys from the figure's own list
  filter?: { key: Breakdown, values: string[] } // one declared key, 1 to 20 values
}
interface MeasureRow { keys: Partial<Record<Breakdown, string>>, value: number, currency?: string }
```

| Field | Rule |
| --- | --- |
| Shared breakdowns | `performance`, `production`, `season`, `collection`, `venue`, `space`, `day`, `week`, `month`, `committee-year`. Only these can line up two modules' figures in one report |
| A module's own breakdown | `<module>.<noun>`, its values the module's record ids (labelled through `core.record-resolver`) or fixed codes (labelled by translation key `<module>.breakdowns.<noun>.<code>`) |
| `combine: 'sum'` | Rows add up across groups and periods: tickets, money, minutes |
| `combine: 'distinct'` | People or things counted once. Core never adds rows; for a total it asks again with fewer keys |
| `combine: 'level'` | A level at the end of the period (members holding, kit due inspection). Never added across time; a `day` or `month` row is the level at that day's or month's end |
| `unit: 'money'` | Integer minor units; every row names its currency; never converted |
| `ratio` | `of` and `over` must share the breakdowns; core divides group by group and the total by total, never averages percentages |
| What a row may hold | Keys and a number. Never an account id, a name, an email or text a person wrote |
| filters and filter | A figure lists the keys it can narrow by (a ticket type, a venue). Core refuses a query whose filter key the figure has not declared, so a filter is never silently ignored. One key per query, 1 to 20 values; the module narrows by them on the statement, under the chunk of 90. A key used as a filter may also be a breakdown |

`readMeasure(id, query, actor?)` is core's service. It checks the figure exists, its module is on, the breakdowns and any filter key are declared and, given an actor, the ability; it runs the read within `core.measures.read-budget` and answers `{ state: 'ok', rows }`, `{ state: 'unavailable', reason }` or `{ state: 'unsupported' }`. A filter on an undeclared key is refused before the module is asked (`filter_not_declared`). A job with no actor reads as the schedule's owner (rule S4). A ratio's two reads run side by side. Pivots (a second breakdown across the columns) and formulas between figures are worked out by Reports from the rows, never by a module.

## The point core.person-measure

A second kit point declared by core, for figures per person such as volunteer hours. It exists so `core.measure` can stay aggregates only: no total ever carries a person, and the few figures that must are fenced into their own point with their own ability, audit and erasure. Only members-side participation qualifies. Audience-side sources (bookings, bar sales, donations), special-category data (access needs, health, age checks) and anything a person wrote are refused at registration.

```ts
interface PersonMeasure {
  label: string                      // translation key, as core.measure
  unit: 'count' | 'minutes'
  combine: 'sum' | 'distinct'
  by: SharedBreakdown[]              // at most one shared key is asked for at a time
  ability: string                    // privileged, audit 'read'; the module's own
  purpose: string                    // a core.privacy-record purpose key, e.g. 'front-of-house.volunteer-recognition'
  read: (q: PersonMeasureQuery) => Promise<{ rows: PersonRow[] } | 'unsupported'>
}
interface PersonMeasureQuery { from: string, to: string, scope?: MeasureQuery['scope'], by?: SharedBreakdown }
interface PersonRow { person: string, keys?: Partial<Record<SharedBreakdown, string>>, value: number } // person: an account id
```

| Field | Rule |
| --- | --- |
| Who may contribute | A module whose manifest marks the figure `side: 'members'`. Core refuses a contribution from a module that holds audience data in the same figure, or whose `purpose` key is not in the privacy record |
| First contributors | `front-of-house.minutes-worked` and `front-of-house.shifts-worked` (FH-54), `rehearsals.person-hours-attended` (Rehearsals numbers its own story) |
| What a row may hold | An account id, at most one shared key and a number. Never a name, email, role note or text a person wrote; names are resolved by Reports when the page is drawn |
| Merged people | The module answers in the account scope, so a merged person is one row |
| Erased people | Gone from the module's own rows, so they are simply absent; Reports deletes its copies (below) |
| Who reads it | Only Reports, through `readPersonMeasure`. Core refuses any other caller, so Productions, Governance and the rest cannot pull person figures through it |
| Filters, pivots, formulas | None. A people report is one figure or a few side by side, by person, with at most one shared breakdown |

`readPersonMeasure(id, query, actor)` is core's service for this point. It needs an actor (no job reads people), checks the figure's own ability and `reports.people.view`, runs within `core.measures.read-budget` and writes one audit row per read: who, which figure, scope and period, row count, never the names or figures.

## Saved reports

**`reports_definitions`**: realm operational; subject none; no retention; not append-only; id prefix `rpd`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| name | text | not null, 1 to 80 characters, unique ignoring case among active | internal | keep |  |
| description | text | at most 300 characters | internal | keep | Shown in the list. Staff are told not to write about people here |
| kind | text | not null, figures or people | internal | keep | A people report reads `core.person-measure` and obeys rules P1 to P8 |
| based_on | text | nullable; a reports.report id | internal | keep | Set when saved from a ready-made report, so the list can say so |
| columns | JSON | not null, 1 to `reports.builder.max-columns` entries, in order; each `{ measure }` or `{ formula, label, unit }` | internal | keep | Measure ids, never labels. A formula names earlier columns by position (rule B3). A people report allows measures only, at most 6 |
| rows_by | text | nullable; one key every measure column allows | internal | keep | Null means one total row. A people report always rows by person, and this is its optional shared breakdown |
| across_by | text | nullable; one shared key, not rows_by | internal | keep | The pivot: each column repeats for each value. Figures reports only |
| filters | JSON | nullable; `{ key, values }`, a key every measure column declares, 1 to 20 values | internal | keep | Figures reports only |
| scope_kind | text | not null, one of none, season, collection, production, venue, space | internal | keep |  |
| scope_id | text | nullable; a record id of that kind, or null meaning "chosen when opened" | internal | keep | Checked through core.record-resolver, not a foreign key |
| period_rule | text | not null, one of scope (the scope's own dates), last-week, last-month, season-to-date, committee-year, last-committee-year, chosen | internal | keep | Worked out in the theatre's days when run |
| chart | text | nullable, one of bar, line; first column only; never with across_by | internal | keep |  |
| share_role | text | nullable; a role key; null for a people report | internal | keep | Who else sees it in the list; null means only its maker and holders of reports.report.manage |
| made_by | account | not null, actor, onMerge alias | internal | keep |  |
| state | text | not null, active or archived | internal | keep |  |

## Runs

**`reports_runs`**: realm operational; subject none; retention `reports.runs.keep-for` from `finished_at`; not append-only (the state moves once, rule R3); id prefix `rpr`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `definition_id` | ref `reports_definitions` | nullable, restrict | internal | keep | Exactly one of this and `report_key` |
| `report_key` | text | nullable; a `reports.report` id | internal | keep | A ready-made report |
| `question` | JSON | not null | internal | keep | The figures, breakdown, scope and dates as worked out, so a copy says exactly what it answered |
| `schedule_id` | ref `reports_schedules` | nullable, set null | internal | keep |  |
| `requested_by` | account | not null, actor, onMerge alias | internal | keep | The person, or the schedule's owner |
| `state` | text | not null, one of `queued`, `running`, `done`, `failed`, `expired`, stale (people runs only, after a merge) | internal | keep |  |
| `job_id` | ref `core_jobs` | nullable | internal | keep |  |
| `rows_count` | integer | nullable, 0 or more | internal | keep |  |
| `unavailable` | JSON | not null, default empty list | internal | keep | Figure ids that answered unavailable, with the reason code |
| `headline` | JSON | nullable; at most 6 `{ measure, value, currency? }` | internal | keep | The totals row, for the list and the email |
| `file_id` | ref `core_files` | nullable, set null | internal | keep | The CSV, in slot `reports.run-csv` |
| `data_file_id` | ref `core_files` | nullable, set null | internal | keep | The same rows as JSON for the page, in slot `reports.run-data` |
| `failure` | text | nullable; a refusal code | internal | keep | Never a message from a module |
| `started_at`, `finished_at` | timestamp | nullable | internal | keep |  |

A people run (definition kind `people`) keeps `file_id` and `data_file_id` null: its rows are in `reports_person_rows`, and the CSV is made on the fly when someone with `reports.people.export` downloads it. Its `headline` holds totals only, never a person. A run is marked `expired` when its person rows are pruned.

## People rows

`reports_person_rows`: realm operational; subject account_id; retention `reports.people.keep-for` from the run's finished_at; not append-only (rows are deleted on erasure); id prefix rpe. Listed in staged erasure (R3-27).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| id | id | primary key | internal | keep |  |
| run_id | ref reports_runs | not null, cascade | internal | keep |  |
| account_id | account | not null, subject, onMerge move | personal | delete | Names are looked up when the page is drawn, never stored |
| measure | text | not null; a core.person-measure id | internal | keep |  |
| breakdown_value | text | nullable; the shared key's value | internal | keep |  |
| value | integer | not null, 0 or more | personal | delete | Minutes or a count |

Indexed on (run_id, account_id) and (account_id). A merge moves the rows to the survivor and marks each run it touched `stale`, shown as "Re-run to combine merged people"; the rows are never added up by Reports itself.

## Schedules and cadence

**`reports_schedules`**: realm operational; subject none; no retention; not append-only; id prefix `rpsh`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `definition_id` | ref `reports_definitions` | nullable, restrict | internal | keep | Exactly one of this and `report_key` |
| `report_key` | text | nullable | internal | keep |  |
| `scope_id` | text | nullable | internal | keep | Fills a report whose scope is chosen when opened; a schedule needs a fixed one |
| `cadence` | text | not null, one of `weekly`, `monthly`, `season-end`, `committee-year-end` | internal | keep |  |
| `on_day` | integer | weekly 1 (Monday) to 7; monthly 1 to 28; null otherwise | internal | keep | 28 so every month has the day |
| `send_at` | text | not null, local time `HH:MM`, default from `reports.schedules.send-at` | internal | keep |  |
| `period_rule` | text | not null, as on definitions but not `chosen` | internal | keep |  |
| `next_due_at` | timestamp | nullable; null while paused or ended | internal | keep | The one claim on a slot (rule S2) |
| `owner_id` | account | not null, actor, onMerge alias | internal | keep | Whose abilities the run uses |
| `state` | text | not null, one of `active`, `paused`, `ended` | internal | keep |  |
| `paused_reason` | text | nullable, one of `by-person`, `owner-lost-ability`, `failed-three-times`, `report-archived` | internal | keep |  |
| `failures` | integer | not null, default 0 | internal | keep | Consecutive; reset by a good run |

This cadence shape (cadence, on day, send at, period rule, next due, one claim per slot) is offered to Invoices and exports for its scheduled exports, which it runs itself (agreed 23 November 2026).

**`reports_schedule_recipients`**: realm operational; subject `account_id`; no retention; not append-only; keyed by (`schedule_id`, `account_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `schedule_id` | ref `reports_schedules` | not null, cascade | internal | keep |  |
| `account_id` | account | not null, subject, onMerge handler | personal | row deleted | The handler moves the row to the survivor and drops a duplicate |
| `skipped_at` | timestamp | nullable | internal | keep | Last time this person was left out for want of an ability (rule S5) |

## Pins

**`reports_pins`**: realm operational; subject none; no retention; not append-only; id prefix `rpp`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `definition_id` | ref `reports_definitions` | nullable, cascade | internal | keep | Exactly one of this and `report_key` |
| `report_key` | text | nullable | internal | keep |  |
| `post_id` | text | not null; a `governance.post` record id | internal | keep | Checked through `core.record-resolver`; Reports never reads Governance's tables |
| `sort` | integer | not null, default 0 | internal | keep |  |
| `pinned_by` | account | not null, actor, onMerge alias | internal | keep |  |

Unique on (`post_id`, `definition_id`, `report_key`).

## Files

Two server file slots through `core.file-slot`: `reports.run-csv` (accepts csv) and `reports.run-data` (accepts json), owner `reports.run`, access `record`, text class `internal`, source `server`, `clean: false`. Reports contributes `core.file-access` for `reports.run`: a person reads a run's files if they hold `reports.run.view` and every figure's ability for the run's scope at the moment of reading, the same test as the page (rule R6).

## Erasure, merge and the privacy record

- Two personal columns: a schedule recipient, and a person row's account. Erasing an account deletes its recipient rows and its person rows in the same staged-erasure step; a schedule left with no recipients is paused with by-person. Actor columns keep their id and read "Former member", as everywhere.
- A merge moves recipient rows to the survivor and drops a duplicate, and moves person rows and marks those runs stale, through the module's merge handler.
- A person's data download lists the schedules they receive, by report name, and every people-report copy still kept that includes them: report name, period, figure and value.
- core.privacy-record: "Who receives which scheduled reports, so they can be sent", kept while the schedule exists; and "Your figures in people reports, such as volunteer hours, so the committee can recognise contributions", kept for `reports.people.keep-for` (90 days), under each contributing figure's own purpose key.
