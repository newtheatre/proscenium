# 0006: Capacity is enforced by the database

- Status: Accepted
- Date: 2026-08-26

## Context

The old box office counted seats with a read-then-write check; two simultaneous bookings could
both pass, a documented P2 issue that survived because D1 offered no good fix. Seats are the
product; overselling a real house is a night-ruining failure.

## Decision

Seat claims are atomic conditional writes: the capacity predicate rides on the claiming
statement itself, inside one batch, so two concurrent claims for the last seat resolve to
exactly one success and one explicit refusal (the mechanism 0003 settles for D1; the
guarantee, not the mechanism, is this record). The same pattern covers shift claims, register
marking and pass-per-performance uniqueness, the last held by a unique index. General admission is the core model: capacity is a count, and
nothing in the schema may assume a seat map (fixed-seat venues are a Later epic).

## Consequences

- Overselling requires an explicit, audited capacity increase; there is no code path that
  oversells silently.
- The capacity race is a permanent named regression test that races real transactions.
- Reinstating a cancelled booking, admitting on a pass and till-collecting a released booking
  all pass through the same claim path.
