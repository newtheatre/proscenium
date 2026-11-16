# 2. Data model

Spaces owns seven tables, all named `spaces_*`, with five id prefixes. It adds no column to a core table: what makes a core space bookable is a row of its own that points at the space.

## Reading the tables

Each table is in the layout the Foundations data-class registry fixes: a line of table options, then one row per column. Types, classes and erasure behaviours are Foundations' own. `created_at`, and `updated_at` where rows change, are left out: both are timestamps, internal, kept. An instant is a timestamp in UTC milliseconds. A local time is text `HH:MM` in the theatre's time zone.

## All seven tables and their id prefixes

| Table | Prefix | Holds | Rows grow with |
| --- | --- | --- | --- |
| `spaces_bookables` | `bkb` | One row per thing that can be booked | Rooms and resources: tens |
| `spaces_opening_hours` | none, keyed by its columns | The weekly hours of a bookable | Seven or so per bookable |
| `spaces_purposes` | `bpu` | What a booking may be for, with its tier and default rules | Around ten |
| `spaces_bookable_purposes` | none, keyed by its two columns | Which purposes a bookable allows, with any tighter rule | Bookables times purposes |
| `spaces_booking_series` | `bks` | A repeat rule and its owner | Series made |
| `spaces_bookings` | `bkg` | Every booking and request | Bookings: thousands a year at a busy society |
| `spaces_booking_events` | `bke` | What happened to each booking, in order | A few per booking |

All five prefixes are time-sorted. None is a secret, and nothing in this module grants access by being known. Registered with the Foundations thread on 16 November 2026.

## Bookables

**`spaces_bookables`**: realm operational; subject none; no retention; not append-only; id prefix `bkb`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `kind` | text | not null, one of `space`, `resource` | internal | keep |  |
| `space_id` | ref `core_spaces` | unique where set, restrict; set exactly when kind is `space` | internal | keep | A space has at most one bookable |
| `name` | text | not null when kind is `resource`, unique ignoring case among resources; null for a space | internal | keep | A space's name is always read from core, so a rename shows at once |
| `home_venue_id` | ref `core_venues` | nullable, restrict; resources only | internal | keep | Where a resource lives. A closure of that venue blocks it |
| `control` | text | not null, one of `own`, `external` | internal | keep | A space takes its starting value from its venue's `managed` flag |
| `approval` | text | not null, default `by-purpose`, one of `by-purpose`, `always` | internal | keep | An external bookable is always decided by a person, whatever this says |
| `approval_note` | text | at most 500 characters, markdown | internal | keep | Shown to the booker before they ask: "Requests are placed with the Students' Union on Mondays" |
| `external_contact` | text | at most 200 characters; external only | internal | keep | Who staff ask. An organisation or a desk, not a private person |
| `always_open` | boolean | not null, default false | internal | keep | True ignores opening hours |
| `max_length_minutes` | integer | nullable, greater than 0 | internal | keep | Tightens the purpose's limit. Null means no tighter limit |
| `guidance` | text | markdown | internal | keep | House rules shown on the request form |
| `colour` | text | nullable, one of calendar-1 to calendar-8, Interface's eight named calendar colours | internal | keep |  |
| requirements | JSON | not null, default empty list | internal | keep | Requirement references as plain text, \<source>:\<id> or fact:\<name>. No foreign key, and Spaces never reads inside one. Rule P13 |
| `state` | text | not null, default `active`, one of `active`, `paused`, `archived` | internal | keep | Paused takes no new requests and keeps what is booked |
| `sort` | integer | not null, default 0 | internal | keep |  |

A space is not bookable until it has a row here. Turning the module on creates none, so no room becomes bookable by surprise. The setup step offers to create one for each active space in a managed venue.

**`spaces_opening_hours`**: realm operational; subject none; no retention; not append-only; keyed by (`bookable_id`, `weekday`, `opens_at`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `bookable_id` | ref `spaces_bookables` | not null, cascade | internal | keep |  |
| `weekday` | integer | not null, 1 (Monday) to 7 | internal | keep |  |
| `opens_at` | text | not null, local time | internal | keep |  |
| `closes_at` | text | not null, local time, after `opens_at`; `24:00` allowed | internal | keep | Hours past midnight are a second row on the next weekday |

Rows for one bookable and weekday may not overlap. A bookable with no rows and `always_open` false is open at no time, which the bookable's screen warns about.

## Purposes

**`spaces_purposes`**: realm operational; subject none; no retention; not append-only; id prefix `bpu`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `slug` | text | not null, unique | internal | keep |  |
| `name` | text | not null, unique ignoring case, at most 60 characters | internal | keep | "Rehearsal", "Committee meeting" |
| `tier` | integer | not null, 1 to 9 | internal | keep | 1 is highest. Performances sit above every tier and are not a purpose |
| `open_to` | text | not null, one of `bookers`, `production-team`, `staff` | internal | keep | See rule P2 |
| `needs_production` | boolean | not null, default false | internal | keep | The booking must name a production. Always true when `open_to` is `production-team` |
| `approval` | text | not null, default `automatic`, one of `automatic`, `approval` | internal | keep |  |
| `max_length_minutes` | integer | nullable | internal | keep | Null falls back to the setting |
| `max_ahead_days` | integer | nullable | internal | keep | Null falls back to the setting |
| `min_notice_minutes` | integer | nullable | internal | keep | Null falls back to the setting |
| `may_repeat` | boolean | not null, default true | internal | keep | False refuses a series |
| `can_be_bumped` | boolean | not null, default true | internal | keep | False protects it from a higher tier: maintenance, a safety inspection |
| requirements | JSON | not null, default empty list | internal | keep | As on a bookable. A booking must meet the bookable's and the purpose's. Rule P13 |
| `description` | text | at most 300 characters | internal | keep | Shown under the name on the request form |
| `state` | text | not null, default `active`, one of `active`, `retired` | internal | keep | Retired leaves the picker and still labels old bookings |
| `sort` | integer | not null, default 0 | internal | keep |  |

Purposes are a table of this module and not a core vocabulary, because each carries rules a term cannot. Presets ship a starting list (part 6).

**`spaces_bookable_purposes`**: realm operational; subject none; no retention; not append-only; keyed by (`bookable_id`, `purpose_id`).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `bookable_id` | ref `spaces_bookables` | not null, cascade | internal | keep |  |
| `purpose_id` | ref `spaces_purposes` | not null, cascade | internal | keep |  |
| `allowed` | boolean | not null | internal | keep | False removes the purpose from this bookable |
| `approval` | text | nullable, one of `automatic`, `approval` | internal | keep | Null follows the purpose |

No row means allowed, following the purpose. So a theatre that never opens this screen has every purpose available everywhere.

## Bookings

**`spaces_booking_series`**: realm members; subject through `booked_for`; retention `spaces.bookings.keep-for`, counted from the last occurrence's end; not append-only; id prefix `bks`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `bookable_id` | ref `spaces_bookables` | not null, restrict | internal | keep |  |
| `purpose_id` | ref `spaces_purposes` | not null, restrict | internal | keep |  |
| `booked_for` | account, role subject | not null | personal | anonymise | Follows a merge |
| `frequency` | text | not null, one of `daily`, `weekly`, `fortnightly`, `monthly-by-weekday` | internal | keep |  |
| `weekdays` | text | JSON list of 1 to 7; weekly and fortnightly only | internal | keep |  |
| `starts_local` | text | not null, local time | internal | keep | The wall-clock start of every occurrence |
| `length_minutes` | integer | not null, greater than 0 | internal | keep |  |
| `first_date` | local date | not null | internal | keep |  |
| `last_date` | local date | not null, on or after `first_date` | internal | keep | An occurrence count is turned into a date when the series is made |
| `state` | text | not null, one of `active`, `ended` | internal | keep | Ended when no occurrence is left in the future |

The title and notes live on each occurrence, so one occurrence can be renamed without touching the rest.

**`spaces_bookings`**: realm members; subject through `booked_for`; retention `spaces.bookings.keep-for`, counted from `ends_at`; not append-only; id prefix `bkg`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `bookable_id` | ref `spaces_bookables` | not null, restrict | internal | keep |  |
| `purpose_id` | ref `spaces_purposes` | not null, restrict | internal | keep |  |
| `tier` | integer | not null | internal | keep | Copied from the purpose when the booking is made, so a later change to a purpose never reorders what is already booked |
| `series_id` | ref `spaces_booking_series` | nullable, restrict | internal | keep |  |
| `starts_at` | timestamp | not null, on a slot boundary | internal | keep | Included in the booking |
| `ends_at` | timestamp | not null, after `starts_at`, on a slot boundary | internal | keep | Not included: a booking ending at 15:00 does not clash with one starting at 15:00 |
| `state` | text | not null, one of `requested`, `confirmed`, `declined`, `withdrawn`, `expired`, `cancelled`, `bumped`, `completed` | internal | keep | Part 3 |
| `booked_for` | account, role subject | not null | personal | anonymise | The person whose booking it is. Owner column of the record type |
| `requested_by` | account, role actor | not null | internal | keep | Differs from `booked_for` when staff book on someone's behalf |
| `production_id` | ref `core_productions` | nullable, restrict | internal | keep | Required when the purpose needs one |
| `origin_type`, `origin_id` | text, text | both or neither; a registered record type and its id | internal | keep | Set when another module made the booking. Unique together among live bookings |
| `title` | text | not null, 3 to 120 characters | free text | redact | "Act 2 run-through". Shown on the calendar |
| `notes` | text | at most 1,000 characters | free text | redact | For the approver. Never on the calendar |
| `attendees` | integer | nullable, greater than 0 | internal | keep | Checked against the space's capacity as a warning only |
| `replaces_id` | ref `spaces_bookings` | nullable | internal | keep | Set on a change that needs a decision (rule X3) |
| `bumps` | boolean | not null, default false | internal | keep | Confirming this request would displace at least one booking |
| `external_ref` | text | at most 120 characters | internal | keep | The outside owner's reference for an external bookable |
| `override_reason` | text | at most 300 characters | free text | redact | Set when a rule was overridden |
| `decided_by` | account, role actor | nullable | internal | keep |  |
| `decided_at` | timestamp | nullable | internal | keep |  |
| `decision_note` | text | at most 500 characters | free text | redact | Sent to the booker. Required on a decline |
| `closed_reason` | text | nullable, one of `by-booker`, `by-staff`, `performance`, `closure`, `higher-tier`, `bookable-removed`, `origin-removed` | internal | keep | Why a booking was cancelled or bumped |
| `bumped_by_id` | ref `spaces_bookings` | nullable | internal | keep | The booking that displaced this one |
| `late_cancel` | boolean | not null, default false | internal | keep | Cancelled inside the cancellation notice |
| `no_show` | boolean | not null, default false | internal | keep | Only on a completed booking |
| `reminded_at` | timestamp | nullable | internal | keep | So a reminder is sent once |

Indexes: (`bookable_id`, `state`, `starts_at`) for the clash check and the calendar; (`booked_for`, `starts_at`) for "my bookings"; (`state`, `starts_at`) for the approval queue and the sweeps; (`series_id`, `starts_at`); (`production_id`, `starts_at`); (`origin_type`, `origin_id`).

The clash rule cannot be a database constraint, because SQLite has no way to forbid overlapping ranges. It is enforced by the shape of the write (rule C2) and proved by a test (part 8).

**`spaces_booking_events`**: realm members; subject through the booking; retention with its booking; append-only except erasure; id prefix `bke`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `booking_id` | ref `spaces_bookings` | not null, cascade | internal | keep |  |
| `kind` | text | not null, one of `requested`, `confirmed`, `declined`, `withdrawn`, `expired`, `changed`, `cancelled`, `bumped`, `completed`, `no-show-set`, `no-show-cleared`, `external-placed`, `reminder-sent` | internal | keep |  |
| `actor` | account, role actor | nullable | internal | keep | Null when the system acted |
| `at` | timestamp | not null | internal | keep |  |
| `detail` | JSON | old and new times and bookable on a change; the reason code otherwise | internal | keep | Ids and times only, never text a person typed |
| `note` | text | at most 500 characters | free text | redact |  |

This is the booking's own history, shown on its page. It is not the audit log: a privileged act (an override, a bump, a decision) also writes an audit entry through the unit of work.

## What needs no table

- **Approvers.** Whoever holds `spaces.booking.decide` on a bookable, by role or by a grant scoped to it. Identity already stores that.
- **Performances and closures on the calendar.** Read from core's services each time. Nothing is copied.
- **Priority tiers.** A column on the purpose and a copy on the booking.
- **Waiting for a slot.** There is no waiting list in the first release.

## When a person is erased

Bookings in the past keep their time, bookable and purpose, so occupancy figures stay true; `booked_for` is anonymised and the title, notes and decision note are redacted. Future bookings and open requests of the erased person are cancelled first, in the erasure unit, by this module's erasure handler, which frees their times. No erasure hold is contributed: nothing here needs to stop an erasure.

## When two accounts are merged

`booked_for`, `requested_by`, `decided_by` and `actor` move to the surviving account by column declaration. No row can collide, since no table here is unique on an account.
