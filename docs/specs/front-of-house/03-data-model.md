# 2. Data model

Front of house owns seventeen tables, all prefixed `front_of_house_`. Each is given below in the Foundations layout. Every table also has `created_at` and, unless append-only, `updated_at`; they are internal, kept on erasure, and left out of the column lists to keep them short.

## Id prefixes

Registered with Foundations on 16 November 2026 and listed in its part 4 index. All are time-sorted.

| Prefix | Table | Holds |
| --- | --- | --- |
| `dty` | `front_of_house_duties` | A kind of job on a night |
| `rtp` | `front_of_house_rota_templates` | A named set of duties and counts |
| none | `front_of_house_rota_template_lines` | One duty in a rota template; keyed by its two columns |
| `shf` | `front_of_house_shifts` | One duty at one performance or occasion |
| `asg` | `front_of_house_assignments` | One person on one shift |
| `ckl` | `front_of_house_checklists` | A checklist definition |
| `cki` | `front_of_house_checklist_items` | One item of a checklist |
| `ckr` | `front_of_house_checklist_runs` | One use of a checklist on one night |
| `cke` | `front_of_house_checklist_entries` | The outcome of one item in one run |
| `inc` | `front_of_house_incidents` | An incident or near miss |
| `inp` | `front_of_house_incident_people` | A person involved in an incident |
| `ina` | `front_of_house_incident_actions` | A follow-up action |
| `inu` | `front_of_house_incident_updates` | The log of an incident |
| `nrp` | `front_of_house_night_reports` | The record of one performance |
| `nrn` | `front_of_house_night_report_notes` | Notes on the night and addenda after sign-off |
| `tmg` | `front_of_house_timings` | A recorded moment of the night |
| `emg` | `front_of_house_emergency_cards` | A venue's emergency card |

## Rota

**`front_of_house_duties`**: realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, unique among live rows, at most 60 | internal | keep | "Steward" |
| `description` | text | at most 500 | internal | keep | What the job involves. Shown at sign-up |
| `is_lead` | boolean | not null, default false | internal | keep | Holding it confers `front-of-house.leading-shift` |
| `call_before_minutes` | integer | not null, 0 to 480 | internal | keep | Default call time, before the performance starts |
| `stay_after_minutes` | integer | not null, 0 to 480 | internal | keep | Default end, after the performance's expected end |
| `requirements` | JSON | not null, default empty list | internal | keep | Opaque references (source id, a colon, the source's own id), stored as plain text and checked through `core.requirement`. Empty means anyone may take the duty |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep | An archived duty takes no new shifts |

**`front_of_house_rota_templates`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, unique | internal | keep | "Studio evening" |
| `venue_id` | ref `core_venues` | nullable | internal | keep | Offered first for performances in this venue |
| `is_default` | boolean | not null, default false | internal | keep | At most one per venue, and one with no venue |
| `archived_at` | timestamp | nullable | internal | keep |  |

**`front_of_house_rota_template_lines`**: realm operational; subject none; key (`template_id`, `duty_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `template_id` | ref `front_of_house_rota_templates` | not null | internal | keep |  |
| `duty_id` | ref `front_of_house_duties` | not null | internal | keep |  |
| `places` | integer | not null, 1 to 50 | internal | keep |  |

**`front_of_house_shifts`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `performance_id` | ref `core_performances` | nullable | internal | keep | Null for a shift not tied to a performance |
| `venue_id` | ref `core_venues` | nullable | internal | keep | Copied from the performance, or chosen for another occasion |
| `title` | text | required when `performance_id` is null, at most 80 | internal | keep | "Get-in", "Freshers' social" |
| `duty_id` | ref `front_of_house_duties` | not null | internal | keep | Unique with `performance_id` when that is set |
| `places` | integer | not null, 1 to 50, at least `places_taken` | internal | keep |  |
| `places_taken` | integer | not null, default 0, CHECK between 0 and `places` | internal | keep | Kept in the same batch as each assignment change. The CHECK is what stops a place being taken twice |
| `call_at` | timestamp | not null | internal | keep |  |
| `ends_at` | timestamp | not null, after `call_at` | internal | keep |  |
| `window_opens_at` | timestamp | not null, at or before `call_at` | internal | keep | See part 3 |
| `window_closes_at` | timestamp | not null, at or after `ends_at` | internal | keep | Moved later by "Extend tonight" |
| `sign_up_closes_at` | timestamp | nullable | internal | keep | Null means sign-up is not offered: a manager fills it |
| `briefing` | text | at most 1,000 | internal | keep | Shown to people on the shift. The screen says not to name anyone in it |
| `state` | text | one of draft, published, cancelled, completed | internal | keep | See part 3 |
| `cancelled_reason` | text | at most 200 | internal | keep |  |

**`front_of_house_assignments`**: realm members; subject `account_id`; retention `front-of-house.retention.assignments`, counted from the shift's end; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `shift_id` | ref `front_of_house_shifts` | not null | internal | keep |  |
| `account_id` | account, role subject, on merge move | not null | internal | keep | One live assignment per account per shift. A merge that would make two keeps the one further along |
| `state` | text | one of requested, confirmed, release\_requested, checked\_in, worked, no\_show, declined, withdrawn, released, removed | internal | keep | See part 3 |
| `source` | text | one of sign-up, assigned, cover | internal | keep |  |
| `assigned_by` | account, role actor, on merge move | nullable | internal | keep | The manager, when not a sign-up |
| `confirmed_at` | timestamp | nullable | internal | keep |  |
| `checked_in_at`, `checked_out_at` | timestamp | nullable | internal | keep |  |
| `ended_at` | timestamp | nullable | internal | keep | When it reached a final state |
| `ended_by` | account, role actor, on merge move | nullable | internal | keep |  |
| `release_reason` | text | at most 300 | free text | redact | The person's own words |
| `minutes_worked` | integer | nullable, at least 0 | internal | keep | Set when the state becomes worked |
| `reminded` | integer | not null, default 0 | internal | keep | How many reminders have gone |

On erasure the row is kept with its account reference following Identity's tombstone, so a past rota still adds up; the free text is redacted.

## Checklists

**`front_of_house_checklists`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, at most 80 | internal | keep | "Before the house opens" |
| `moment` | text | one of pre-show, post-show, other | internal | keep | Pre-show lists are what the house-open rule looks at |
| `venue_id` | ref `core_venues` | nullable | internal | keep | Null applies everywhere |
| `duty_id` | ref `front_of_house_duties` | nullable | internal | keep | Whose list it usually is. A hint for the board, not a restriction |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep |  |

**`front_of_house_checklist_items`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `checklist_id` | ref `front_of_house_checklists` | not null | internal | keep |  |
| `label` | text | not null, at most 160 | internal | keep | "Fire exits clear and unlocked" |
| `help` | text | at most 500 | internal | keep |  |
| `kind` | text | one of tick, reading | internal | keep | A reading takes a whole number |
| `unit` | text | at most 20, only for a reading | internal | keep | "people", "°C" |
| `required` | boolean | not null, default true | internal | keep | A required item must be done or given an exception |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep | An item is archived, never deleted, once a run has used it |

**`front_of_house_checklist_runs`**: realm operational; subject none; retention `front-of-house.retention.checklists`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `checklist_id` | ref `front_of_house_checklists` | not null | internal | keep | Unique with `performance_id`, or with `venue_id` and `local_date` when there is no performance |
| `performance_id` | ref `core_performances` | nullable | internal | keep |  |
| `venue_id` | ref `core_venues` | nullable | internal | keep |  |
| `local_date` | local date | not null | internal | keep | The operating day |
| `state` | text | one of open, complete, complete\_with\_exceptions | internal | keep |  |
| `completed_by` | account, role actor, on merge move | nullable | internal | keep |  |
| `completed_at` | timestamp | nullable | internal | keep |  |

**`front_of_house_checklist_entries`**: realm operational; subject none; retention with its run; key unique on (`run_id`, `item_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `run_id` | ref `front_of_house_checklist_runs` | not null | internal | keep |  |
| `item_id` | ref `front_of_house_checklist_items` | not null | internal | keep |  |
| `label` | text | not null | internal | keep | Copied from the item, so a later rewording does not change the record |
| `outcome` | text | one of done, exception, not\_applicable | internal | keep |  |
| `reading` | integer | nullable | internal | keep |  |
| `reason_code` | ref `core_terms` | required for an exception | internal | keep | From the vocabulary `front-of-house.exception-reason` |
| `reason_note` | text | at most 200 | internal | keep | About the thing, not a person. The screen says so; anything about a person belongs in an incident |
| `done_by` | account, role actor, on merge move | not null | internal | keep |  |
| `done_at` | timestamp | not null | internal | keep | The device's time when queued offline |

## Incidents

**`front_of_house_incidents`**: realm operational; subject `{ via: incident_people }` for the people involved, none for the incident itself; retention `front-of-house.retention.incidents`, counted from closing; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `number` | integer | not null, unique with `year` | internal | keep | Shown as "INC-2026-0042" |
| `year` | integer | not null | internal | keep |  |
| `kind` | text | one of incident, near\_miss | internal | keep |  |
| `category_id` | ref `core_terms` | nullable until reviewed | internal | keep | Vocabulary `front-of-house.incident-category` |
| `severity` | text | one of minor, moderate, serious | internal | keep |  |
| `state` | text | one of reported, in\_review, closed | internal | keep | See part 3 |
| `performance_id` | ref `core_performances` | nullable | internal | keep |  |
| `venue_id`, `space_id` | ref `core_venues`, `core_spaces` | nullable | internal | keep |  |
| `where_note` | text | at most 120 | internal | keep | "Foyer stairs" |
| `occurred_at` | timestamp | not null, not in the future | internal | keep |  |
| `what_happened` | text | not null, at most 4,000 | free text | retain until `front-of-house.retention.incidents`, then redact | Kept through an erasure because it is the safety record; reason key `front-of-house.retain.incident` |
| `immediate_action` | text | at most 2,000 | free text | retain, as above |  |
| `first_aid_given`, `emergency_services_called` | boolean | not null, default false | internal | keep | Either one raises severity to at least moderate |
| `reported_by` | account, role actor, on merge move | not null | internal | keep |  |
| `reported_at` | timestamp | not null | internal | keep | Server time; `occurred_at` and the device time come from the report |
| `reviewer_id` | account, role actor, on merge move | nullable | internal | keep |  |
| `closed_by` | account, role actor, on merge move | nullable | internal | keep | Never the reporter alone when severity is serious; see part 3 |
| `closed_at` | timestamp | nullable | internal | keep |  |
| `closing_note` | text | required to close, at most 2,000 | free text | retain, as above |  |

Foundations' rule is that a table with free text has a subject. The incident's free text may describe anyone, so its subject is declared through the people table: an erasure of someone listed on the incident reaches the incident's free text once the retention period ends.

**`front_of_house_incident_people`**: realm operational; subject `{ account: 'account_id', unlinked: 'staff' }` (Foundations' ruling of 16 November for a person with no account); retention with the incident.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `incident_id` | ref `front_of_house_incidents` | not null | internal | keep |  |
| `account_id` | account, role subject, on merge move | nullable | internal | keep | Set for a member or a known customer |
| `name` | text | at most 120 | personal | retain until the retention period, then anonymise |  |
| `contact` | text | at most 200 | personal | retain, then clear | A phone number or an email, as given. A contact column, never a subject |
| `involvement` | text | one of affected, witness, helped, other | internal | keep |  |
| `is_child` | boolean | not null, default false | internal | keep | Lengthens retention; see part 6 |
| `details` | text, encrypted |  | special | clear | Injury and treatment. Cleared at once on erasure, with no retention |

**`front_of_house_incident_actions`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `incident_id` | ref `front_of_house_incidents` | not null | internal | keep |  |
| `what` | text | not null, at most 300 | internal | keep | "Replace the stair nosing". About a thing to do, not a person |
| `owner_id` | account, role actor, on merge move | nullable | internal | keep |  |
| `due_on` | local date | nullable | internal | keep |  |
| `state` | text | one of open, done, dropped | internal | keep |  |
| `resolved_at` | timestamp | nullable | internal | keep |  |
| `resolved_note` | text | required when dropped, at most 300 | internal | keep |  |

**`front_of_house_incident_updates`**: realm operational; subject `{ via: incident_id }`; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `incident_id` | ref `front_of_house_incidents` | not null | internal | keep |  |
| `kind` | text | one of comment, state, severity, category | internal | keep |  |
| `from_value`, `to_value` | text | nullable | internal | keep | For a change of state, severity or category |
| `body` | text | at most 2,000 | free text | retain with the incident, then redact | The one erasable column the append-only trigger allows to change |
| `author_id` | account, role actor, on merge alias | not null | internal | keep | Alias, as an append-only table must |

## The night

**`front_of_house_night_reports`**: realm operational; subject none; no retention.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `performance_id` | ref `core_performances` | not null, unique | internal | keep |  |
| `state` | text | one of draft, signed\_off | internal | keep |  |
| `snapshot` | JSON | null until signed off | internal | keep | The compiled report: figures, timings, ids and counts. No names and no free text; see part 3 |
| `snapshot_version` | integer | not null, default 1 | internal | keep | The shape of the snapshot |
| `signed_off_by` | account, role actor, on merge move | nullable | internal | keep |  |
| `signed_off_at` | timestamp | nullable | internal | keep |  |
| `distributed_at` | timestamp | nullable | internal | keep |  |

A trigger refuses any change to a signed-off row except setting `distributed_at`.

**`front_of_house_night_report_notes`**: realm operational; subject none; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `report_id` | ref `front_of_house_night_reports` | not null | internal | keep |  |
| `kind` | text | one of note, addendum | internal | keep | An addendum is a note written after sign-off |
| `topic` | text | one of audience, building, show, staffing, other | internal | keep |  |
| `body` | text | not null, at most 2,000 | internal | keep | About the night, not a person. The screen points to "Report an incident" for anything about a person |
| `author_id` | account, role actor, on merge alias | not null | internal | keep |  |

**`front_of_house_timings`**: realm operational; subject none; unique on (`performance_id`, `kind`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `performance_id` | ref `core_performances` | not null | internal | keep |  |
| `kind` | text | one of house\_open, curtain\_up, interval\_start, interval\_end, curtain\_down, house\_clear | internal | keep | The backstage board (later) adds the half, the quarter, the five and beginners |
| `at` | timestamp | not null | internal | keep |  |
| `recorded_by` | account, role actor, on merge move | not null | internal | keep |  |

**`front_of_house_emergency_cards`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `venue_id` | ref `core_venues` | not null, unique | internal | keep |  |
| `body` | text | not null, at most 8,000 | internal | keep | Markdown: evacuation routes, assembly point, who to call. Role titles and switchboard numbers, not private numbers |
| `reviewed_on` | local date | not null | internal | keep | The card shows it; a health check warns after `front-of-house.emergency.review-every` |
| `reviewed_by` | account, role actor, on merge move | not null | internal | keep |  |

## What is deliberately not stored

- **Volunteer hours** have no table. They are the sum of `minutes_worked` over worked assignments.
- **The shift window per person.** The window is on the shift, so everyone on a shift shares it.
- **Sold and admitted counts, takings.** They are read from other modules when the board is open and copied into the report's snapshot at sign-off, as numbers.
- **Who may do what on a night.** No table maps duties to abilities in the first release; the facts do that work (question 2).
