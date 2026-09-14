# 0074: The pass-admission ticket type is owned by the system

- Status: Proposed
- Date: 2026-09-14

## Context

`ticket_types.kind` is `SINGLE` or `PASS_ADMISSION`. The second value exists for one row: the
zero-priced type every redeemed pass ticket is written under, so that a pass holder's seat is an
ordinary ticket to capacity, the door and the ledger (D-125 criterion 1). That row was minted by
`ensurePassAdmissionTicketType()` in `server/utils/pass-redemption.ts` the first time any pass was
redeemed, and the admin listing already hid it by filtering to `kind = 'SINGLE'`.

Three places had not caught up. The create form on `/box-office/ticket-types` still offered a
"Kind" select, so an officer could make a second `PASS_ADMISSION` row by hand, or make their
"Standard" type one by mistake. The show and performance price screens listed the system row
beside the real types, inviting somebody to price a thing that must always cost nought. And the
edit, archive and delete routes would act on the row if given its id, since nothing distinguished
it from a type an officer had made. Meanwhile the migration from the old estate needs to write
the same row before any redemption happens, so that imported pass admissions have a type to point
at, which made the minting function's private knowledge of the row's name a liability.

## Decision

The `PASS_ADMISSION` ticket type is the system's own. Officers never choose a ticket type's kind:
`newTicketTypeForm` no longer carries `kind`, `POST /api/admin/ticket-types` writes `SINGLE`
unconditionally, and a client still sending `kind` is neither refused nor obeyed, since Zod strips
what the schema does not name. The "Kind" select, its badge and `saysTicketTypeKind()` go, and
the page says once, under the table, that pass holders are seated automatically through pass
types.

The row is minted by `passAdmissionTicketType()` in `server/utils/ticket-types.ts`, under the
name `PASS_ADMISSION_TICKET_TYPE_NAME` in `shared/utils/ticket-types.ts`, which the import also
uses. The function finds the row by kind alone, whatever its id or name, so it is content to reuse
one the import or a seed wrote; when it must mint, the "no such row yet" predicate rides the
`INSERT` (0003) and a name conflict is a no-op, so two first redemptions racing leave one row.

`PUT`, `POST .../archive` and `DELETE` on `/api/admin/ticket-types/[id]` refuse the system row
with a 409 and one plain sentence, `systemTicketTypeRefusal()`, the same shape a reserved pass
type's refusal takes. The price queries in `server/utils/pricing.ts` filter to `kind = 'SINGLE'`,
so neither price screen lists the row and no override can name it.

`TICKET_TYPE_KINDS` stays as the data vocabulary and the schema `CHECK` stays: `kind` is still
what a sold ticket was sold under, and a report still tells a pass admission from a sale by it.

## Consequences

- An officer cannot make, rename, reprice, archive or delete the pass-admission type, and cannot
  make a second one. A stray row of that kind can only come from a migration or a seed, both of
  which write it by the shared name.
- The seed writes the row under `PASS_ADMISSION_TICKET_TYPE_NAME` rather than its own spelling,
  so a developer database and an imported one carry the same name.
- `tests/e2e/ticket-types.test.ts` still sends `kind` on a `PUT` and expects it ignored; that
  now holds for the `POST` as well, by the same mechanism.

## Deliberately not done

Dropping `kind` altogether and giving `tickets` a nullable `pass_id`, so that a pass admission is
a ticket that names its pass rather than a ticket of a special type, is the cleaner model and was
considered. It is not done here: it re-keys a table `pass_admissions` already keys to, moves the
once-per-performance rule (D-125 criterion 2) off the constraint that enforces it today, and
touches every reader that tells a pass admission from a sale by `kind`, including the SU export
and the revenue-by-show report. That is a story of its own, with its own migration under 0063,
and this record neither starts it nor forecloses it.

## Options considered

**Keep the Kind select and refuse `PASS_ADMISSION` at the route.** Rejected: a select with one
permitted value is a question with no answer, and the row would still be listed for pricing and
open to archive by id.

**Hide the row from the routes with a 404.** Rejected: the row exists, and a 404 tells the caller
something untrue. A 409 with a sentence is the shape every other reserved thing here uses.
