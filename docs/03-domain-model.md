# Domain model

The schema lives in `server/db/schema/` — five files: `show.ts`, `venue.ts`, `ticket.ts`,
`reservation.ts`, `user.ts`. Migrations are in `server/db/migrations/sqlite/`, `0000` to `0008`.

Read this before changing the schema. Several of the constraints below are load-bearing in ways
that are not obvious from the table definitions.

## The shape

```mermaid
erDiagram
    venues ||--o{ performances : hosts
    venues ||--o{ venues_to_features : has
    venue_features ||--o{ venues_to_features : describes
    shows ||--o{ performances : "is performed as"
    shows ||--o{ show_ticket_type_overrides : prices
    performances ||--o{ performance_ticket_type_overrides : prices
    performances ||--o{ reservations : "is booked via"
    performances ||--o{ tickets : admits
    ticket_types ||--o{ show_ticket_type_overrides : "overridden by"
    ticket_types ||--o{ performance_ticket_type_overrides : "overridden by"
    ticket_types ||--o{ tickets : types
    users ||--o{ reservations : owns
    reservations ||--o{ tickets : contains
    performances ||--o{ performance_shifts : "is staffed by"
    users ||--o{ performance_shifts : works
    venues ||--o{ shift_templates : "is staffed as"
```

Four groups:

- **Programme** — `shows` → `performances` → `venues` (+ `venue_features`). What is on, when, where.
- **Money** — `ticket_types` with two layers of override. What things cost.
- **Sales** — `users` → `reservations` → `tickets`. Who is coming and what they paid.
- **Staffing** — `performance_shifts` (+ `shift_templates`). Who is working, which is also what
  scopes the show night screen ([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)).

## Entities

### `shows`

A production. The top-level programming unit.

| Column | Notes |
|---|---|
| `id` | nanoid, 21 chars |
| `slug` | **UNIQUE.** URL identity: `/whats-on/<slug>`. Validated against a regex on create |
| `title`, `subtitle`, `description` | |
| `posterUrl` | R2 path, served through `/images/**` |
| `ageGuidance`, `latecomerPolicy` | What the door gets asked, so it is on the record rather than in someone's head. Rendered by `/foh/tonight` |
| `status` | `DRAFT` \| `PUBLISHED` |

**Invariants and gotchas**

- A show is only visible on `/whats-on` when `PUBLISHED`. It is visible on `GET /api/shows`
  regardless — see [09-known-issues](./09-known-issues.md#drafts-are-public).
- `slug` uniqueness is enforced by index *and* checked in the handler. Both are needed: the handler
  check gives a decent error, the index prevents the race.
- Deleting a show cascades to performances, and thence would cascade into reservations — except
  `reservations.performanceId` is `onDelete: restrict`, so the delete fails instead. That is
  deliberate. Do not relax it.

### `performances`

One scheduled instance of a show.

| Column | Notes |
|---|---|
| `showId` | FK, `cascade` |
| `venueId` | FK, `restrict` |
| `startsAt` | **unix timestamp, integer seconds.** Not a string, unlike the metadata columns |
| `doorsAt` | optional |
| `durationMinutes`, `intervalCount`, `intervalMinutes` | |
| `capacityOverride` | `NULL` = use `venue.capacity` |
| `status` | `DRAFT` \| `ON_SALE` \| `CANCELLED` |

**Invariants and gotchas**

- `SOLD_OUT` and `COMPLETED` are **not** statuses. Sold-out is derived from ticket counts;
  completed is derived from `startsAt < now`. The schema comment says so; believe it.
- Effective capacity is `capacityOverride ?? venue.capacity`, and **`NULL` means unlimited**. A
  venue with no capacity set silently disables the capacity check on every performance in it.
- Timestamps are seconds, not milliseconds. Drizzle's `mode: 'timestamp'` handles the conversion;
  raw SQL does not. Getting this wrong shifts everything to 1970.

### `venues`, `venue_features`, `venues_to_features`

Rooms and their accessibility/facility tags, many-to-many. `venues.name` and `venue_features.name`
are both UNIQUE.

`venues.capacity` is nullable and, as above, `NULL` disables capacity enforcement rather than
meaning zero.

### `ticket_types`

The price list. See [06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md) for the
resolution rules.

| Column | Notes |
|---|---|
| `name` | **UNIQUE, global.** There is no per-show namespace |
| `price` | **integer pence.** Never floats, anywhere in this codebase |
| `activeByDefault` | Whether it is offered unless overridden |

`show_ticket_type_overrides` and `performance_ticket_type_overrides` both carry a nullable `price`
and a nullable `active`, unique on `(showId, ticketTypeId)` and `(performanceId, ticketTypeId)`
respectively. **`NULL` at a layer means "inherit", not "unset"** — this is the single most
misread thing in the schema.

### `users`

A **mirror**, not an identity store. Accounts, credentials, roles and verification live in the
central auth service (stage-door); migration 0014 dropped `password`, `email_verified`,
`last_login`, `user_roles`, `email_verifications` and `password_resets` from this database.

| Column | Notes |
|---|---|
| `id` | The auth service's canonical id. **Never regenerate or reuse one** — `reservations.user_id` FKs against it |
| `email` | **UNIQUE, NOT NULL**, lowercase (canonical store convention) |
| `name` | NOT NULL |
| `anonymisedAt` | Set when the person has been erased; the row and its bookings stay |

Rows appear via `ensureLocalUser` (an idempotent primary-key upsert from the session) or, for guest
checkout, from `POST /api/users/shadow` on the auth service. The FK is `onDelete: 'restrict'`, so
nobody with booking history can be deleted — erasure rewrites instead of removing, which is why
`anonymisedAt` exists. See [04-auth-and-permissions](./04-auth-and-permissions.md#erasure).

**Shadow accounts.** A guest who books without registering gets a real central account with no
password, mirrored here like any other. `session.user.guest` distinguishes them. There is no local
flag, and there should not be one — this app cannot see credentials.

### `reservations`

A customer's booking for one performance.

| Column | Notes |
|---|---|
| `bookingRef` | 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no O/0, no I/L/1. **UNIQUE** |
| `performanceId` | FK, `restrict`. **NOT NULL — a reservation is always for exactly one performance** |
| `userId` | FK, `restrict`. NOT NULL |
| `status` | `PENDING` \| `COLLECTED` \| `DOOR` \| `CANCELLED` \| `NO_SHOW` |
| `cancelledBy` | `CUSTOMER` \| `STAFF`, nullable |
| `customerNotes` | Written by the customer at booking. Access needs, dietary, etc. |
| `staffNotes` | Internal. **Never render this to a customer** |

**`performanceId` being NOT NULL is why passes need their own entity** — a multi-performance
product cannot be a reservation. See [10-passes-design](./10-passes-design.md).

The `restrict` on `userId` is deliberate and commented in the schema: it stops someone deleting a
customer and silently destroying booking history. Reassign before deleting.

### `tickets`

One issued seat. The atom of both capacity and money.

| Column | Notes |
|---|---|
| `reservationId` | FK, `restrict` |
| `performanceId` | FK, `restrict`. Denormalised from the reservation — see below |
| `ticketTypeId` | FK, `restrict` |
| `pricePaid` | **integer pence, snapshot at time of issue** |
| `refundedAt` | nullable timestamp |

**Why `performanceId` is on both the ticket and its reservation.** It is redundant, and nothing
enforces that they agree. It exists so the capacity query can count tickets without joining through
reservations twice. If you ever write to it, write both.

**`refundedAt` is read in five places and written by nothing.** Refunds are not implemented. See
[09-known-issues](./09-known-issues.md#refunds-do-not-exist).

### `performance_shifts`

One slot on one performance. A null `userId` is an open slot. Design:
[12-access-and-staffing](./12-access-and-staffing-design.md) §3.

| Column | Notes |
|---|---|
| `performanceId` | FK, `cascade` |
| `role` | `DUTY_MANAGER` \| `DOOR` \| `BAR` |
| `userId` | FK, `restrict`, **nullable**. Null means the slot is open |
| `status` | `OPEN` → `CLAIMED` → `CONFIRMED`, or `DECLINED` |
| `needsEligibilityReview` | Set when a claim was allowed under the eligibility fallback ([ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)) |
| `assignedByUserId` | FK, `restrict`, nullable |
| `claimedAt`, `confirmedAt` | nullable timestamps |

Two invariants, both held by the database rather than by every writer:

- **Exactly one confirmed duty manager per performance**, as a partial unique index on
  `(performance_id) WHERE role = 'DUTY_MANAGER' AND status = 'CONFIRMED'`. A second one is refused
  with a 409 before it reaches the index, so staff see a sentence rather than a 500.
- **An unfilled slot is `OPEN` and a filled one is not**, as a check constraint pairing `status`
  and `user_id`. Without it "who is on" can quietly disagree with itself.

`userId` is `restrict` rather than `cascade` deliberately: the rota is a record of who worked, and
erasure anonymises the person while the shift survives
([ADR-0014](./decisions/0014-anonymise-never-delete.md)).

**A merge can collide here.** Two accounts confirmed on the same slot would break the duty-manager
index, so `mergeUser` deletes the loser's duplicate before re-pointing the rest.

### `rota_settings`

One row, `id = 'current'`. Whether a claim confirms itself is a season's decision, because trust
levels differ year to year (docs/12 §3.3). A claim allowed under the eligibility fail-open path is
never auto-confirmed, whatever this says: the flag exists to be looked at.

### `shift_templates`

How many of each role a new performance starts with. One row per role per venue; a null `venueId`
is the estate default, used when a venue has no rows of its own. Stamped onto a performance at
creation, so publishing a rota costs nothing by default.

### `venue_emergency_info`

The emergency card the show night screen renders, one row per venue. Deliberately **not** columns on
`venues`: that row is read by public pages, and a column added here must never be one missing
allow-list away from the front page.

Every field is nullable, so a venue with no card still answers rather than failing the request.
`addressForEmergencyCall` is stored as it should be *spoken* to a 999 handler, which is not always
the same as the postal address.

### `foh_contacts`

Numbers the door may need, tap-to-call: committee on-call, venue, security, taxi. Not the people
working tonight, which is the rota's answer, and not anyone's personal number from the mirror,
which holds none. Archived rather than deleted
([ADR-0010](./decisions/0010-archive-never-delete-referenced-records.md)): a number that was on the
card during an incident should still be findable afterwards.

### `incident_log`

The theatre's first structured incident record: performance, author, time, free text.

**Append-only, enforced by the database.** `BEFORE UPDATE` and `BEFORE DELETE` triggers raise, in
migration `0019`. Corrections are new rows carrying `supersedesId`, and both stay in order. The
reasoning is [ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)'s, applied to the
other register this app keeps: one you can tidy is not a record.

The trigger is hand-authored, because a trigger cannot be expressed in the Drizzle schema. That is
authoring a new migration, not editing a generated one, which stays forbidden.

**An append-only trigger must be scoped to the content columns**, as
`BEFORE UPDATE OF body, performance_id, supersedes_id, created_at`. A blanket `BEFORE UPDATE` also
blocks the author re-point that an estate account merge performs
([ADR-0025](./decisions/0025-every-user-reference-joins-the-estate-hooks.md)), and because
stage-door retries a failing hook indefinitely, that is a merge which can never complete. Migration
`0019` had exactly that bug and `0023` fixes it. Any future append-only table with a user column
needs the same scoping — what was written stays immutable; who the row points at is estate
bookkeeping.

### `backstage_nights`, `backstage_sessions`

The backstage board's access model ([ADR-0020](./decisions/0020-backstage-joins-by-a-nightly-code.md)).

**No code is stored, in any form.** `backstage_nights` holds a night and an `epoch`; the six-digit
code is derived from those two by HMAC against a worker secret. A database dump reveals nothing
without it, the front-of-house screen recomputes the code to display it, and joining recomputes it
to compare. Bumping `epoch` is therefore a reset *and* a mass sign-out in one write: every session
records the epoch it joined at, and one below the night's current epoch is dead.

`failedAttempts` counts wrong codes across all devices. Past the threshold the night rotates its own
epoch, so a distributed guesser achieves a reset rather than a join.

`backstage_sessions` holds no user. The device name is what somebody typed at join, and attribution
here is social rather than authenticated: the page's ability surface contains nothing the account
model exists to protect. The bearer token lives in a cookie; only its SHA-256 is stored.

### `backstage_presets`, `backstage_messages`

The comms board ([ADR-0021](./decisions/0021-show-night-comms-poll-rather-than-hold-a-socket.md)).

Presets are **admin data with a direction**, because each society runs its calls slightly
differently, and a preset may name a `milestone` (`CLEARANCE`, `HOUSE_OPEN`, `SHOW_START`,
`INTERVAL`, `RESTART`, `END`). Naming the milestone on the preset rather than matching its label is
what lets a society reword a call without losing the timing record that feeds the end-of-night
report (docs/11 §5.5).

`backstage_messages` snapshots the `label` it was sent with, for the same reason ticket prices are
snapshotted: rewording a preset next term must not rewrite what was called on the night.

**Exactly one sender column is set.** A front-of-house message has a `senderUserId`; a backstage
message has a `senderSessionId` and the name somebody typed at join, which is social rather than
authenticated ([ADR-0020](./decisions/0020-backstage-joins-by-a-nightly-code.md)).

`acknowledgedAt` is a column rather than a derived thing because acknowledgement is the entire
reason the board exists instead of a group chat. You cannot acknowledge your own side's message:
the value is one side seeing that the other has read it.

### `age_checks`

The Challenge 25 register ([ADR-0027](./decisions/0027-the-refusals-register-is-append-only.md)).

`ACCEPTED` rows are a **bare tally** and carry no detail at all: the ratio of accepted to refused is
the evidence that the policy is operated rather than merely displayed. Only refusals carry a reason,
what was asked for, and a description — which is *"tall man, grey coat"* and **never a name**. There
is nowhere to put a photograph, and there must not be.

Append-only, enforced by triggers in migration `0025`, **scoped to the content columns** so an
estate merge can still re-point `checked_by_user_id` — see the `incident_log` note above for why
that scoping is not optional.

### `access_profiles`

Access needs, one row per account ([ADR-0022](./decisions/0022-access-needs-are-special-category-data.md)).
Design: [12-access-and-staffing](./12-access-and-staffing-design.md) §2.

**Special category data**, held on explicit consent. Three consequences the schema encodes:

- `consentFohAt` is **null until somebody ticks the box**, and null means nothing is shown to anyone
  on a show night. It is the lawful basis, so it is never inferred from anything else.
- The needs are the **eight Access Card symbols plus a companion count**, which are operational
  statements — "needs level access" — and never a diagnosis. There is no free-text field for one.
- `accessCardNumber` is recorded only if offered. **Evidence is viewed, never stored**: no document,
  scan or letter enters this system, and there is nowhere to put one.

**Erasure deletes the row outright** rather than anonymising it, which is a deliberate departure
from [ADR-0014](./decisions/0014-anonymise-never-delete.md)'s default: the data is held on consent,
and an erasure withdraws consent. It also joins the subject-access `export` hook, where it is the
part of the bundle that matters most.

Withdrawal keeps the row as a `WITHDRAWN` tombstone with every symbol, note and card number cleared,
so a future booking stops offering access ticket types. The tombstone is swept after 30 days.

**A merge drops the loser's profile rather than moving it.** Merging two sets of access needs is not
a decision this app should make on someone's behalf.

### `bar_categories`, `bar_products`, `bar_prices`, `bar_discounts`

The bar catalogue. Design: [13-bar-design](./13-bar-design.md) §3.

**Money is integer pence and quantities are thousandths of a unit** (`qty_milli`), so a 25 ml
measure out of a 70 cl bottle is an exact integer rather than a rounding argument.

**`bar_prices` is append-only and date-effective.** A price change is a new row, never an update, so
the current price is a query (`effective_from <= today`, latest wins) and the history *is* the audit
trail. Setting a future date is how a change is planned rather than remembered.

**A product may point at what it depletes**, one level only: a 175 ml glass points at the 750 ml
bottle with `depletes_milli = 233`; a bottled beer points at itself with `1000`. Pointing at
something that itself depletes another is refused, because a bundle of bundles is a different design
(§3.1).

**Discounts are percentage, and bar lines only.** They never touch a ticket line — ticket prices have
their own override chain — and they are snapshotted onto a transaction when used, so changing the
committee rate next year does not rewrite history.

### `transactions`, `transaction_lines`

**The record of money taken in the building** ([ADR-0023](./decisions/0023-money-taken-is-recorded-as-a-transaction.md)).
One row per SumUp tap or comp, whatever mix of ticket payments, walk-ups and bar items it covers.

[ADR-0011](./decisions/0011-collection-is-the-payment-boundary.md) still says *when* money is taken:
collection is the boundary. This says *what was taken*, and the two are written in **one
`db.batch()`** — both, or neither. D1 has no interactive transactions, so nothing here takes a
transaction handle; the builders return statements and the caller batches them.

- **`takenOn` is the Europe/London calendar day**, computed server-side. The Worker runs in UTC, so
  a 23:30 sale in August lands on tomorrow's reader total without it.
- **Two questions, two keys.** *Did today balance* is `taken_on`. *How did that show do* is
  `transaction_lines.performance_id`. An advance payment belongs to one of each and to neither of
  the others — confusing them is the bug this shape exists to prevent.
- **Line amounts are gross.** The discount lives on the transaction, so "how much of that did we
  sell" stays honest and "how much did we give away" is one sum.
- **`bar_session_id` carries no foreign key.** It was written before `bar_sessions` existed, and
  SQLite cannot add a constraint later without rebuilding the table.

### `bar_sessions`, `bar_session_performances`, `day_reconciliations`

A **bar session** is one night's trading at one counter: who opened it, when, and which
performances it covered. A partial unique index allows **one open session at a time** (`WHERE
closed_at IS NULL`), so two volunteers tapping *Open the bar* cannot produce two sets of figures for
the same night.

- **The session is a container, not a total.** Every figure is derived from `transactions` at read
  time. Nothing is accumulated onto the session row, so a correction to a transaction is reflected
  without a rebuild, and a crashed till loses no money.
- **`bar_session_performances` is many-to-many on purpose.** A double bill is one bar session across
  two performances; a session with no performance (a social, a bar-only night) is legal and holds no
  rows here.
- **`day_reconciliations` records what the reader actually said**, once, at close, against what the
  transactions say it should have said. It is the operator's record of a discrepancy, not a
  correction to the sales: a short till is a fact to investigate, and overwriting the sales to make
  it balance destroys the evidence.

## Status lifecycles

### Reservation

```
                    ┌──────────► CANCELLED  (customer or staff; releases the seat)
                    │
  [booked] ──► PENDING ──► COLLECTED   (paid and collected at the door)
                    │
                    └──────────► NO_SHOW    (held, never collected; releases the seat)

  [walk-up] ──► DOOR                        (bought on the door, not pre-booked)
```

`CANCELLED` and `NO_SHOW` release capacity. `PENDING`, `COLLECTED` and `DOOR` consume it.

**`DOOR` is currently unreachable through the UI.** The walk-in flow creates `PENDING` then sets
`COLLECTED`, so pre-booked and on-the-door revenue cannot be told apart in reporting. See
[09-known-issues](./09-known-issues.md#door-status-is-never-set).

### Show and performance

A show goes `DRAFT` → `PUBLISHED` via `POST /api/shows/:id/publish`. There is no unpublish endpoint;
you must `PUT` the show back to `DRAFT`.

A performance goes `DRAFT` → `ON_SALE`, or `→ CANCELLED`. Publishing a show optionally bulk-sets its
performances to `ON_SALE` — and currently does so for cancelled ones too, which is a bug.

## Cross-cutting rules

**Money is always integer pence.** `ticket_types.price`, `tickets.pricePaid`. There is no float or
decimal anywhere and there must not be. Display formatting is the frontend's job.

**Ids are nanoid(21)**, generated in the application via `$defaultFn`, not by the database. This
means an insert without going through Drizzle's schema objects will produce a NULL id.

**Timestamps are inconsistent by design, and it is worth knowing which is which:**

- `startsAt`, `doorsAt`, `refundedAt`, token `expiresAt` — integer unix seconds.
- `createdAt`, `updatedAt`, `lastLogin` — text, SQLite `current_timestamp`, i.e. `YYYY-MM-DD HH:MM:SS`
  in **UTC**, no zone marker.

The theatre operates in Europe/London. Nothing in the schema records that. Anything doing date
arithmetic on the text columns must not assume local time — and anything displaying `startsAt` must
convert to Europe/London or the 19:30 curtain will read as 18:30 for half the year.

**Capacity is defined in exactly one way** and should stay that way:

> tickets joined to reservations, where `reservations.status IN ('PENDING','COLLECTED','DOOR')`
> and `tickets.refundedAt IS NULL`, counted against `performance.capacityOverride ?? venue.capacity`.

It is currently *computed* in five places and *enforced* in one. See
[05-booking-and-box-office](./05-booking-and-box-office.md#capacity).

## What the model does not have

Worth stating explicitly, because their absence shapes what you can build:

- **No payment entity.** Money is taken in person. `pricePaid` is a record of what was owed, not
  evidence of a transaction. There is no order, no payment, no till reconciliation.
- **No seat map.** Capacity is a single number per performance. Unreserved seating only.
- **No holds or expiry.** A `PENDING` reservation lives forever until someone acts on it.
- **No audit log.** Nothing records who changed a reservation's status, or when. The legacy Django
  system had one (`django_admin_log`, 2,782 rows); this does not.
- **No multi-performance product** — see passes.
- **No show categories or seasons.** Both are being added by the legacy migration; see
  [ADR-0003](./decisions/0003-legacy-ticketing-import.md).
- **Content warnings** are modelled as a curated vocabulary (`content_warnings`) plus per-show links
  carrying a level. A warning is either a technical effect — strobe, haze, loud noise, no level — or a
  theme recorded as mentioned, discussed or depicted. `shows.warningsConfirmedNone` distinguishes
  "the company checked and there are none" from "nobody filled this in", and the public page says
  which. Manageable at `/admin/content-warnings`; see
  [ADR-0004](./decisions/0004-content-warning-model.md).
