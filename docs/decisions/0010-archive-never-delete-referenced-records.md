# ADR-0010: Retire referenced records by archiving, never by deleting

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Ticket types and content-warning vocabulary entries are both **shared, long-lived and referenced by
history**. A 2019 ticket still has to resolve its type's name and price; a customer looking at a 2019
production still needs to see what that production carried.

Both also accumulate entries that should never be offered again. After a decade of imports there are
far more dead Fringe and StuFF ticket types than live ones, and the legacy content-warning vocabulary
arrived with 384 distinct titles ([ADR-0004](0004-content-warning-model.md)).

Deleting such a row is destructive in a way that is easy to miss. Under a cascading foreign key,
deleting "Strobe lighting" from the admin vocabulary page would silently strip that warning from
every production carrying it, with nothing left to show a customer or an auditor that it was ever
there.

## Decision

**Referenced records carry an `archived` flag, and their foreign keys are `onDelete: 'restrict'`.**

- Archiving removes the entry from every picker and override screen. Historic rows keep resolving it.
- `DELETE` remains available and is **refused** while anything references the row, with an
  explanation rather than a raw foreign-key 500.
- The same shape applies to users: `reservations.userId` is `restrict`, so a customer with booking
  history cannot be deleted. The answer there is anonymisation — see
  [ADR-0014](0014-anonymise-never-delete.md).

`archived` is distinct from `activeByDefault` on ticket types, and the two answer different
questions. `activeByDefault` decides whether a *live* type is pre-selected on new shows; an inactive
type is still offered and can be switched on per show or per performance. `archived` says the type
will never be sold again.

Changing a content warning's `kind` while it is linked is refused for the same class of reason: kind
decides whether a link carries a level, and existing links were written under the old answer.
Flipping `GENERAL` to `TECHNICAL` would strand rows with a level the show page will not render, and
the reverse strands rows with none. There is no correct level to invent, so the endpoint refuses and
leaves the decision with a human.

## Consequences

- Retiring something is reversible. Deleting it, where permitted, is not.
- Pickers stay short without the history becoming unreadable.
- Every screen that lists these records needs an "include archived" mode; exactly one screen per
  vocabulary uses it — the page where archiving and restoring happen.
- The `restrict` keys are a backstop, not the primary guard. The application refuses first so a
  volunteer gets an explanation; the constraint catches the paths nobody has thought of yet.
