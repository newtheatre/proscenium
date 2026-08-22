# ADR-0006: Scope subqueries, never bind id lists

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

**D1 allows at most 100 bound parameters per statement.** Exceeding it is a hard failure of the
whole request, not a degradation, and because the limit is a function of *data volume*, a query
written against a small table passes every test and fails in production once the data grows.

The estate has hit this repeatedly:

- `GET /api/whats-on/:slug` bound the performance ids of the show being viewed. A Fringe show can
  have well over 100 performances on sale at once, so the public page failed outright for exactly
  the busiest shows. `/api/whats-on` next door already avoided this.
- `POST /api/_hooks/auth/export` (GDPR subject access) joined tickets on a bound list of the user's
  reservation ids. A decade of legacy bookings puts a regular attendee well past 100 reservations:
  the people most likely to file a subject-access request are precisely the ones for whom it failed.
- The pass door search bound an id list per page; `limit=100` on the admin list would have blown the
  budget on its own.

## Decision

**A statement's parameter count must not depend on how many rows it covers.**

In practice:

- Scope by **correlated subquery over a predicate**, not by an `IN` built from a result set. Counting
  occupied seats for a page of performances scopes through the time span the page covers: two bound
  parameters whether the page holds five performances or two hundred.
- Where a bound list is unavoidable it must be **explicitly bounded and small**: `/api/shows` binds
  the page's own ≤50 show ids and nothing else. Performance ids are never bound: 50 shows carry
  roughly 150 performances.
- Where two ids per row is the natural shape, say so. `mergeUser` re-points four columns with two
  bound parameters each however many rows move; that is already safe and must not be "fixed" into the
  chunked pattern `last-activity` uses.

Over-fetching slightly is acceptable when it buys a constant parameter count: `countOccupiedSeats`
counts a few performances the caller will not return, and only the ids the caller reads are used.

## Consequences

- `IN (…)` over a result set is treated as a defect in review, not a style preference. It is a latent
  hard failure that surfaces as the archive grows.
- Some queries read more rows than strictly necessary. That is the accepted cost.
- Two call sites document the requirement at the point of use: `countOccupiedSeats` in
  `server/utils/tickets.ts` and `redeemabilityForPage` in `server/utils/passes.ts`: because the
  constraint is invisible from the query alone.
- The same limit applies to every app on the estate. rehearsal's and rooms' merge hooks bind two
  parameters per statement for the same reason.
