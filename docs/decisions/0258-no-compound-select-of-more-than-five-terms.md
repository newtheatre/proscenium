# 0258: No compound SELECT of more than five terms

- Status: Proposed
- Date: 2026-11-05
- Amends: 0253 (the overview's rota week)

## Context

On cutover day the console overview answered 500 for anybody holding `rota.read`. Its rota week
was one `SELECT` per night joined by `UNION ALL`, seven terms in all. D1 refuses a compound
`SELECT` of more than five terms ("too many terms in compound SELECT"), well under SQLite's
default of 500, so the query passed every local test and failed on the first production request.
Local D1 (`wrangler d1 execute --local`) reproduces the limit; libsql does not.

## Decision

1. **No statement joins more than five `SELECT`s with `UNION` or `UNION ALL`.** A fixed set of
   rows to compute over is a `VALUES` list in a `WITH` clause, which D1 does not count as a
   compound, and the per-row work reads its columns.
2. **The rota week is one `SELECT` over a seven-row `VALUES` list** of each night and its bounds.
   Its parameters stay fixed at three per night (0006).
3. **A query built by joining terms in a loop says how many it can make**, and a test holds the
   rota week to no compound at all.

## Consequences

- The overview loads again; its figures are unchanged.
- The libsql test database cannot catch a breach of this limit. Anything that builds a compound
  from a list should be run once against local D1 before it merges.
