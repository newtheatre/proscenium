# 2. Data model

Inventory owns fourteen tables, all named `inventory_*`, with eleven id prefixes. It adds no column to any other module's table, and it reads core's tables only by foreign key and through core's services.

## Reading the tables

Each table is in the Foundations data-class registry layout: a line of table options, then one row per column. `created_at`, and `updated_at` where rows change, are left out; both are timestamps, internal, kept. Every realm is operational: kit is the theatre's work, not its audience. A requirement list is JSON holding references as plain text, `<source>:<id>` or `fact:<name>`, which Inventory never reads inside (rule K1).

## All fourteen tables and their id prefixes

| Table | Prefix | Holds | Rows grow with |
| --- | --- | --- | --- |
| `inventory_departments` | `kdp` | Kit departments, with their tag prefix and who they lend to | Four to eight |
| `inventory_categories` | `kcat` | Categories within a department | Tens |
| `inventory_locations` | `kloc` | Stores, rooms, rails and shelves, as a tree | Tens |
| `inventory_items` | `kit` | Every item | Hundreds to a few thousand |
| `inventory_item_tags` | none, keyed by its two columns | Free tags on items ("Victorian", "size 12") | A few per item |
| `inventory_item_events` | `kev` | Everything that happened to an item, in order. Append-only | Tens per item over its life |
| `inventory_inspection_kinds` | `ki``k` | Recurring checks: PAT test, visual check, lifting-equipment examination | Under ten |
| `inventory_category_inspections` | none, keyed by its two columns | Which kinds a category's items need | Categories times kinds |
| `inventory_inspection_dues` | none, keyed by item and kind | Whether each kind applies to each item, and when it is next due | Individual items times kinds |
| `inventory_inspections` | `ki``n` | Every recorded inspection. Append-only | Hundreds a year with PAT testing |
| `inventory_loans` | `k``ln` | Loans and pull lists | Hundreds a year |
| `inventory_loan_lines` | `k``ll` | What is on each loan | A few to forty per loan |
| `inventory_faults` | `kft` | Reported problems with items | Tens a year |
| `inventory_disposals` | `kdis` | Items leaving for good | Tens a year |

All eleven prefixes are time-sorted, none random: nothing in this module grants access by being known. A label's QR code holds the item's address, which needs a signed-in person with the right ability to open. They all start with `k`, for kit, because Invoices and exports registered the `iv` prefixes first; none is in Foundations' index or the built code on 23 November 2026. They are to be entered in the index when the spec is accepted.

## Departments, categories and locations

**`inventory_departments`**: id prefix `kdp`; realm operational; subject none; no retention; not append-only. Record type `inventory.department`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, at most 60, unique ignoring case among active | internal | keep | "Costume" |
| `tag_prefix` | text | not null, 1 to 4 capital letters, unique | internal | keep | "CO". Changing it changes only tags made afterwards (rule I3) |
| `next_tag_number` | integer | not null, default 1, at least 1 | internal | keep | The contended counter tags are made from (rule I2) |
| `lends_to` | text | not null, default `members`, one of `productions`, `members`, `anyone` | internal | keep | Who may borrow: productions only; productions and members; or also outside borrowers (rule L3) |
| `requirements` | JSON | not null, default empty list | internal | keep | Required to borrow anything in the department |
| `guidance` | text | markdown, at most 2,000 | internal | keep | Shown to borrowers: "The costume store opens Tuesdays 6 to 8pm" |
| `contact` | text | at most 200 | internal | keep | A role or a desk, never a private person: "the Wardrobe Manager" |
| `department_term_id` | ref `core_terms` | nullable, restrict; a term of vocabulary `core.departmen``t`, of either kind, production or organisation (R3-07) | internal | keep | Optional link to the theatre-wide department list, so budgets and kit line up. A kit department stays its own row because it is a grant scope and holds a tag counter, lending rules and guidance, which a term cannot (Integration, 23 November 2026) |
| `state` | text | not null, default `active`, one of `active`, `archived` | internal | keep | An archived department takes no new items or loans |
| `sort` | integer | not null, default 0 | internal | keep |  |

**`inventory_categories`**: id prefix `kcat`; realm operational; subject none; no retention; not append-only. Record type `inventory.category`, parent `inventory.department`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `department_id` | ref `inventory_departments` | not null, restrict | internal | keep |  |
| `name` | text | not null, at most 60, unique ignoring case within the department among active | internal | keep | "Lighting fixtures", "Hats" |
| `requirements` | JSON | not null, default empty list | internal | keep | Added to the department's |
| `state` | text | not null, default `active`, one of `active`, `archived` | internal | keep |  |
| `sort` | integer | not null, default 0 | internal | keep |  |

**`inventory_locations`**: id prefix `kloc`; realm operational; subject none; no retention; not append-only. Record type `inventory.location`, parent `core.venue`, optional.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, at most 60, unique ignoring case among active siblings | internal | keep | "Rail 3" |
| `parent_id` | ref `inventory_locations` | nullable, restrict; never a descendant of itself; at most four levels deep | internal | keep | "Costume store" › "Rail 3" |
| `venue_id` | ref `core_venues` | nullable, restrict | internal | keep | Inherited by children that set none |
| `space_id` | ref `core_spaces` | nullable, restrict; a space of `venue_id` when both are set | internal | keep | Lets a festival see what kit is in which room |
| `state` | text | not null, default `active`, one of `active`, `archived` | internal | keep | Archiving refuses while any item's home is here (rule I8) |
| `sort` | integer | not null, default 0 | internal | keep |  |

The same shape as the bar's stock locations (name, optional venue and space), with a parent added, because a costume store holds rails and a workshop holds shelves.

## Items

**`inventory_items`**: id prefix `kit`; realm operational; subject none; no retention; not append-only. Record type `inventory.item`, parent `inventory.category`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `category_id` | ref `inventory_categories` | not null, restrict | internal | keep | Its department is the category's |
| `tag` | text | not null, unique, `<prefix>-<number>` with the number padded to four digits | internal | keep | Made once, never changed or reused, even if the item moves department (rule I2) |
| `name` | text | not null, at most 120 | internal | keep | "ETC Source Four 26°" |
| `description` | text | markdown, at most 4,000 | internal | keep | About the thing, shown in the members' catalogue. Never about a person (rule I10) |
| `tracking` | text | not null, one of `individual`, `counted`; fixed once the item has a loan or an inspection | internal | keep |  |
| `quantity` | integer | not null, default 1; exactly 1 when individual, at least 1 when counted | internal | keep | Lowered only by a disposal of part of a counted item, raised by editing |
| `home_location_id` | ref `inventory_locations` | not null, restrict, an active location | internal | keep |  |
| `current_location_id` | ref `inventory_locations` | nullable, restrict | internal | keep | Set when moved away from home without a loan; null means at home |
| `container_id` | ref `inventory_items` | nullable, restrict; an individual item, not itself in a container; never the item itself | internal | keep | One level of nesting only (rule I6) |
| `state` | text | not null, default `active`, one of `active`, `out-of-service`, `missing`, `disposed` | internal | keep | See part 3 |
| `out_of_service_reason` | text | set exactly when out of service; one of `inspection-failed`, `fault`, `by-hand` | internal | keep |  |
| `condition` | text | not null, default `good`, one of `as-new`, `good`, `worn`, `damaged` | internal | keep |  |
| `lendable` | boolean | not null, default true | internal | keep | False for kit that never leaves (a rig fixed in the roof) |
| `requirements` | JSON | not null, default empty list | internal | keep | Added to the category's and the department's |
| `make`, `model`, `serial_number` | text | each at most 80 | internal | keep | For technical kit and the insurance schedule |
| `acquired_on` | local date | nullable, not in the future | internal | keep |  |
| `replacement_value` | minor units | nullable, at least 0 | internal | keep | A valuation for insurance, never a ledger entry. Staff only (rule I9) |
| `currency` | currency | not null, the theatre's | internal | keep |  |
| `ownership` | text | not null, default `owned`, one of `owned`, `hired-in`, `borrowed-in` | internal | keep |  |
| `owner_name` | text | at most 120; required unless owned | internal | keep | An organisation or a desk, never a private person (rule I11) |
| `owner_company_ref` | text | nullable, `companies.company:<id>` | internal | keep | Optional, resolved through `core.record-resolver` |
| `owner_due_back_on` | local date | required unless owned | internal | keep | When it must go back to its owner |
| `created_by` | account, actor | nullable | internal | keep | On merge: alias |

Photos (up to the slot's limit of 8) are core files in slot `inventory.item-photo`; manuals and receipts in slot `inventory.item-document`. Neither needs a column. Indexes: `tag`; (`category_id`, `state`); `home_location_id`; `container_id`; lower(`name`) for search.

**`inventory_item_tags`**: keyed by (`item_id`, `term_id`); realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `item_id` | ref `inventory_items` | not null, cascade | internal | keep |  |
| `term_id` | ref `core_terms` | not null, restrict; a term of vocabulary `inventory.tag` (`assertTerm`) | internal | keep | Tags are the theatre's own list, edited on the Lists tab of the module's Admin page |

**`inventory_item_events`**: id prefix `kev`; realm operational; subject none; no retention; **append-only**.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `item_id` | ref `inventory_items` | not null, restrict | internal | keep |  |
| `kind` | text | not null, one of `added`, `edited`, `recategorised`, `moved`, `condition-changed`, `out-of-service`, `back-in-service`, `checked-out`, `returned`, `inspected`, `fault-reported`, `fault-closed`, `marked-missing`, `found`, `disposed` | internal | keep |  |
| `loan_id` | ref `inventory_loans` | nullable, restrict | internal | keep |  |
| `inspection_id` | ref `inventory_inspections` | nullable, restrict | internal | keep |  |
| `fault_id` | ref `inventory_faults` | nullable, restrict | internal | keep |  |
| `disposal_id` | ref `inventory_disposals` | nullable, restrict | internal | keep |  |
| `from_location_id`, `to_location_id` | ref `inventory_locations` | nullable, restrict | internal | keep | For `moved` |
| `condition` | text | nullable, one of the four conditions | internal | keep |  |
| `reason` | text | nullable, a fixed code | internal | keep | Never free text, so the table holds nothing about a person |
| `actor` | account, actor | nullable; null for a task | internal | keep | On merge: alias (append-only) |
| `at` | timestamp | not null | internal | keep |  |

## Inspections

**`inventory_inspection_kinds`**: id prefix `ki``k`; realm operational; subject none; no retention; not append-only. Record type `inventory.inspection-kind`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, at most 80, unique ignoring case among active | internal | keep | "Portable appliance test (PAT)" |
| `description` | text | markdown, at most 2,000 | internal | keep | What the check involves, shown when recording |
| `interval_days` | integer | not null, 1 to 3,650 | internal | keep | Next due is the pass date plus this (rule N2) |
| `inspector_requirements` | JSON | not null, default empty list | internal | keep | What the person recording must meet, such as a PAT tester competency (rule N5) |
| `contractor_allowed` | boolean | not null, default true | internal | keep | May be recorded as done by an outside firm, named on the inspection |
| `certificate` | text | not null, default `optional`, one of `none`, `optional`, `required` | internal | keep | Whether a file is asked for, in slot `inventory.inspection-certificate` |
| `blocks_when_overdue` | boolean | not null, default true | internal | keep | An item overdue for this kind may not go out or be booked (rule N7) |
| `state` | text | not null, default `active`, one of `active`, `archived` | internal | keep | Archiving stops new dues; recorded inspections stay |
| `sort` | integer | not null, default 0 | internal | keep |  |

**`inventory_category_inspections`**: keyed by (`category_id`, `kind_id`); realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `category_id` | ref `inventory_categories` | not null, cascade | internal | keep |  |
| `kind_id` | ref `inventory_inspection_kinds` | not null, restrict | internal | keep |  |

**`inventory_inspection_dues`**: keyed by (`item_id`, `kind_id`); realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `item_id` | ref `inventory_items` | not null, cascade; an individual item | internal | keep |  |
| `kind_id` | ref `inventory_inspection_kinds` | not null, restrict | internal | keep |  |
| `source` | text | not null, one of `category`, `item` | internal | keep | From the item's category, or added to this item by hand |
| `applies` | boolean | not null, default true | internal | keep | False excludes a category's kind from this one item, with a reason in its event (rule N3) |
| `next_due_on` | local date | nullable; null exactly when `applies` is false or the last result was a fail | internal | keep | Indexed where `applies` |
| `last_inspection_id` | ref `inventory_inspections` | nullable, restrict | internal | keep |  |

This table is the one place a due date lives. It is written in the same unit as whatever changes it: adding an item, changing its category, changing a category's kinds, changing a kind's interval, and recording an inspection (rule N1).

**`inventory_inspections`**: id prefix `ki``n`; realm operational; subject none; no retention; **append-only**. Corrections supersede (rule N9).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `item_id` | ref `inventory_items` | not null, restrict | internal | keep |  |
| `kind_id` | ref `inventory_inspection_kinds` | not null, restrict | internal | keep |  |
| `done_on` | local date | not null, not in the future | internal | keep |  |
| `result` | text | not null, one of `pass`, `fail` | internal | keep |  |
| `readings` | text | at most 500 | internal | keep | Measurements and observations about the item ("earth 0.08 Ω, insulation > 200 MΩ"). The screen says it is about the item, never a person (rule I10) |
| `contractor` | text | at most 120; only where the kind allows | internal | keep | An outside firm's name |
| `next_due_on` | local date | nullable; the due date this inspection set, null for a fail | internal | keep | Kept so a later interval change does not rewrite history |
| `supersedes_id` | ref `inventory_inspections` | nullable, restrict, unique; same item and kind | internal | keep | A correction names what it replaces |
| `requirement_overridden_by` | account, actor | nullable | internal | keep | Set when the inspector did not meet the kind's requirement (rule N5). On merge: alias |
| `recorded_by` | account, actor | not null | internal | keep | On merge: alias |

The certificate, where there is one, is a core file in slot `inventory.inspection-certificate`, owned by the inspection.

## Loans

**`inventory_loans`**: id prefix `k``ln`; realm operational; subject `responsible_account_id`, or `borrower_email` where there is no account; retention `inventory.loans.keep-for`, counted from `updated_at` of a loan in a final state, and applied as erasure, never deletion, so item history stays whole; not append-only. Record type `inventory.loan`, parent `inventory.department`, owner `responsible_account_id`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `department_id` | ref `inventory_departments` | not null, restrict | internal | keep | One department per loan (rule L2) |
| `kind` | text | not null, one of `production`, `member`, `outside` | internal | keep |  |
| `state` | text | not null, one of `draft`, `requested`, `approved`, `out`, `returned`, `declined`, `cancelled` | internal | keep | `draft` only for a production's pull list. See part 3 |
| `production_id` | ref `core_productions` | set exactly when kind is `production`, restrict | internal | keep |  |
| `responsible_account_id` | account, subject | not null unless kind is `outside` | internal | keep | On merge: alias |
| `borrower_name` | text | at most 120; required when kind is `outside` and there is no account | personal | anonymise | A person or an organisation |
| `borrower_email` | email | required when kind is `outside` and there is no account | personal | anonymise | Reminders go here |
| `borrower_phone` | text | at most 40 | personal | clear |  |
| `company_ref` | text | nullable, `companies.company:<id>`; outside loans only | internal | keep | Resolved through `core.record-resolver`; works with Companies off |
| `purpose` | text | at most 500 | free text | redact | "For the panto at the Albany" |
| `starts_at` | timestamp | not null | internal | keep | When the items are wanted from |
| `due_back_on` | local date | not null, on or after the day of `starts_at`; within `inventory.loans.max-length` unless overridden | internal | keep | Ends at the close of that operating day (rule L8) |
| `due_back_set` | text | not null, default `by-person`, one of `by-person`, `from-production` | internal | keep | `from-production` follows the last performance (rule L9) |
| `requested_by` | account, actor | nullable | internal | keep | On merge: alias |
| `decided_by` | account, actor | nullable | internal | keep | On merge: alias |
| `decided_at` | timestamp | nullable | internal | keep |  |
| `decline_note` | text | at most 500 | free text | redact | Sent to the borrower with a decline |
| `out_at` | timestamp | nullable | internal | keep | First check-out |
| `returned_at` | timestamp | nullable | internal | keep | When the last line came back |
| `cancel_reason` | text | nullable, one of `by-borrower`, `by-staff`, `production-cancelled`, `item-withdrawn` | internal | keep |  |
| `last_reminded_on` | local date | nullable | internal | keep | So the daily task never reminds twice in a day (rule R3) |

A check refuses a row with neither `responsible_account_id` nor `borrower_email`, so no loan is unlinked. Indexes: (`state`, `due_back_on`); `production_id`; (`department_id`, `state`); the account scope on `responsible_account_id`.

**`inventory_loan_lines`**: id prefix `k``ll`; realm operational; subject via `loan_id`; retention with its loan; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `loan_id` | ref `inventory_loans` | not null, restrict | internal | keep |  |
| `item_id` | ref `inventory_items` | null exactly when state is `wanted` | internal | keep |  |
| `wanted` | text | at most 200; required when `item_id` is null | internal | keep | "Victorian teapot, chipped is fine" |
| `quantity` | integer | not null, default 1, at least 1; exactly 1 for an individual item | internal | keep |  |
| `state` | text | not null, one of `wanted`, `listed`, `promised`, `out`, `returned`, `lost`, `cancelled` | internal | keep | See part 3 |
| `with_line_id` | ref `inventory_loan_lines` | nullable, restrict | internal | keep | A container's contents ride on their container's line (rule I6) |
| `out_at`, `returned_at` | timestamp | nullable | internal | keep |  |
| `out_by`, `returned_by` | account, actor | nullable | internal | keep | On merge: alias |
| `out_condition`, `returned_condition` | text | nullable, one of the four conditions | internal | keep |  |
| `returned_quantity` | integer | nullable, 0 to `quantity` | internal | keep | Counted items may come back in parts |
| `fault_id` | ref `inventory_faults` | nullable, restrict | internal | keep | Damage found on return |
| `requirement_overridden_by` | account, actor | nullable | internal | keep | Set when the responsible person did not meet a requirement (rule K4). On merge: alias |
| `sort` | integer | not null, default 0 | internal | keep |  |

Indexes: (`item_id`, `state`), which the promise check reads (rule C1); `loan_id`.

## Faults and disposals

**`inventory_faults`**: id prefix `kft`; realm operational; subject none; retention `inventory.faults.keep-for`, counted from a closed fault's `closed_at` and applied as erasure of its free text; not append-only. Record type `inventory.fault`, parent `inventory.item`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `item_id` | ref `inventory_items` | not null, restrict | internal | keep |  |
| `state` | text | not null, default `open`, one of `open`, `repaired`, `written-off` | internal | keep |  |
| `takes_out_of_service` | boolean | not null, default true | internal | keep | False for a cosmetic fault the item can go out with |
| `description` | text | not null, at most 2,000 | free text | redact | May name a person ("dropped by the get-out crew"), hence free text with a retention |
| `source` | text | not null, one of `report`, `return`, `inspection`, `show-report` | internal | keep |  |
| `loan_id` | ref `inventory_loans` | nullable, restrict | internal | keep |  |
| `inspection_id` | ref `inventory_inspections` | nullable, restrict | internal | keep |  |
| `production_id` | ref `core_productions` | nullable, restrict | internal | keep | From a show report's link |
| `reported_by` | account, actor | nullable | internal | keep | On merge: alias |
| `resolution` | text | at most 1,000 | free text | redact | What was done |
| `closed_by` | account, actor | nullable | internal | keep | On merge: alias |
| `closed_at` | timestamp | nullable | internal | keep |  |

Photos of the damage go in slot `inventory.fault-photo`, owned by the fault, and are deleted by the same retention.

**`inventory_disposals`**: id prefix `kdis`; realm operational; subject none; no retention; not append-only. Record type `inventory.disposal`, parent `inventory.item`, owner `proposed_by`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `item_id` | ref `inventory_items` | not null, restrict; at most one open disposal per item | internal | keep |  |
| `quantity` | integer | not null, default 1; for a counted item, up to its quantity | internal | keep | Part of a counted item may go |
| `state` | text | not null, default `proposed`, one of `proposed`, `approved`, `declined`, `done` | internal | keep |  |
| `method` | text | not null, one of `sold`, `donated`, `recycled`, `scrapped`, `lost`, `stolen`, `returned-to-owner` | internal | keep | `returned-to-owner` only for hired-in or borrowed-in items |
| `recipient` | text | at most 120 | internal | keep | An organisation, never a private person (rule D5) |
| `police_reference` | text | at most 40; only for `stolen` | internal | keep |  |
| `value_at_disposal` | minor units | nullable | internal | keep | The valuation written off, for the insurance schedule. Not a ledger entry |
| `proposed_by` | account, actor | not null | internal | keep | The record's owner, so the proposer cannot approve (rule D2). On merge: alias |
| `decided_by` | account, actor | nullable | internal | keep | On merge: alias |
| `decided_at`, `done_at` | timestamp | nullable | internal | keep |  |

## Erasure and merge in one place

- **Only loans reach a person.** Erasing an account anonymises `borrower_name`, `borrower_email` and `borrower_phone`, and redacts `purpose` and `decline_note`, on every loan in the person's account scope and every outside loan whose email is one of their verified addresses. The loan row, its lines and the item history stay, because they are the theatre's record of where its property went. A loan that is still out is not erased until it is returned or closed; it appears on the data request screen as an erasure hold through `core.erasure-hold`, with the count.
- **Free text about a person** sits in three columns only: a loan's `purpose` and `decline_note`, and a fault's `description` and `resolution`. Each is redacted by erasure or by its retention. Every other text column is about a thing, and its screen says so.
- **Merge.** Every account column is `alias`, including `responsible_account_id`: no column is part of a unique rule, so no handler is needed and nothing is rewritten. Reads go through the account scope, so a merged person's loans show on the survivor's "My loans" at once.
- **Download.** A person's download includes their loans and lines (realm operational), with the items' names and tags, and nothing from the item history.
