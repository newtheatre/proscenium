# 0135: A stamp tops a role up to its template count, numbering past a cancelled slot

- Status: Proposed
- Date: 2026-10-14
- Amends: E-102 criterion 2 (how the backfill finds a missing slot)

## Context

Stamping expanded a template into slots numbered 1 to the role's count, and `ON CONFLICT DO NOTHING`
against UNIQUE (`performance_id`, `role`, `slot`) made a second run a no-op. A cancelled shift keeps
its row, its number and the name of whoever held it (E-102 criterion 4, `cancelOrphanedShiftsStatement`).
So a performance whose second Bar slot was cancelled by a venue move, and which then needed two Bar
again, could never get the second back: slot 2 was taken by the cancelled row, and **Stamp the
diary** reported nothing to add. The hands-on review of 13 October 2026 found exactly this, two Bar
in the template and one on the night, and `tests/integration/rota.test.ts` had pinned the gap as
intended ("stamped around the slot a cancelled row still holds").

## Decision

**A stamp tops each role up to its template count of live shifts.** For each performance and
template role, the number to add is the count less the shifts of that role not `CANCELLED`, and
each added shift is numbered after the highest slot the role holds on that performance, cancelled
ones included. A cancelled row is never reopened or renumbered: it stays the record of who held it.

The uniqueness rule still settles a race. Two stamps computing the same top-up compute the same
numbers, and the second's rows conflict and are dropped. A second run after the first finds no role
short and adds nothing, which is E-102 criterion 2's idempotency held by arithmetic as well as by
the constraint. A slot added by hand beyond the template counts as live, so it is never matched by
a stamp and never removed.

The statement still binds only its scope (0006): the counts are correlated subqueries, not a list.

## Consequences

- A performance moved away and back gains the open shifts its venue's template asks for, numbered
  after the cancelled ones.
- Slot numbers are no longer always 1 to the count. Nothing reads a slot number as a position in the
  template; the board orders by role and slot, so a top-up sorts after the cancelled row it replaces.
- The test that pinned the gap now pins the top-up, and a new case pins that a hand-added slot is
  not counted against the template.
