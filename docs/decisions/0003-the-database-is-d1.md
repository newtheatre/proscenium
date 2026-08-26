# 0003: The database is D1

- Status: Accepted (IT Manager decision, 26 August 2026, on SP-5's outcome)
- Date: 2026-08-26

## Context

The unified system needs a single database for the ledger, capacity claims, register marking
and everything else. PostgreSQL was the initial recommendation for its interactive
transactions and row locks; SP-5 established that hosted PostgreSQL is prohibitively expensive
for the society, and that D1's batch atomicity is sufficient for our write paths. The old
estate ran four production applications on D1 for a year and its disciplines for doing so
safely are documented and proven.

## Decision

The unified system runs on D1. The estate's D1 disciplines carry as requirements, not
workarounds: atomicity through `db.batch` only (never `BEGIN`); conditional writes, where the
guarding predicate rides on the UPDATE or INSERT itself, for every contended claim; partial
and composite unique indexes as the arbiter of at-most-once rules; bound parameters chunked at
90 against the 100-parameter cap; and no statement whose parameter count grows with the rows
it covers.

## Consequences

- Capacity, shift claims, register marking and promotion notifications are enforced by
  conditional writes and unique indexes rather than locks (0006 records the mechanism); each
  carries a racing test that proves one winner and a refused loser.
- A zero-rows-affected conditional write is disambiguated explicitly (gone versus beaten),
  the pattern the rooms application proved.
- Hosting cost stays effectively zero and operations stay on known tooling: migrations
  hand-reviewed, Time Travel restore points before applying, the ledger re-read after.
- If the society's finances or D1's limits ever change materially, a successor record revisits
  this; nothing in the schema design may gratuitously block a future move.
