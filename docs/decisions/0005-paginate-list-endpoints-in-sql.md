# ADR-0005: Paginate list endpoints in SQL and return an envelope

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Every admin list endpoint originally returned its whole table as a bare array and let the browser
filter and page it. That was tolerable at a few hundred rows. After the legacy import
([ADR-0003](0003-legacy-ticketing-import.md)) it was not:

- `/api/reservations` returned ~30,000 rows, about 18 MB of JSON, assembled inside a Worker with a
  128 MB memory ceiling.
- `/api/shows` returned all 498 shows with all 1,304 performances nested, for a page that displayed
  fifty of them.
- `/api/whats-on` — the highest-traffic endpoint in the app, backing both the homepage and What's On
  — read every published show and its performances and then discarded the historical majority in
  JavaScript.

D1 also bills by rows read, so the cost was not only latency.

A bare array is additionally ambiguous: a client that receives 50 rows cannot tell a complete result
from the first page of a truncated one, which is how a "search returned nothing" bug hides.

## Decision

**List endpoints filter, search, sort and page in SQL, and always return a `Paginated<T>` envelope.**

```ts
{ rows: T[], total: number, page: number, limit: number }
```

The contract lives in `server/utils/pagination.ts` and `shared/types/pagination.ts`. An endpoint
accepts `page`, `limit` and optionally `q`; `q` searches the columns that identify the row to a human
(booking reference, holder name, holder email — not free-text notes).

There are no exceptions. `/api/shows` briefly kept an undocumented no-query-string mode that returned
everything nested, for the box-office navigator; that consumer moved to
`/api/performances?near=` and the exception was removed rather than grandfathered.

### Searching with `LIKE`

`containsTerm()` emits its own `ESCAPE` clause. This is not incidental: Drizzle's `like()` renders a
bare `col like ?`, and SQLite has **no default escape character**. An earlier `likeTerm()`
backslash-escaped `%` and `_` and instructed callers to "pair with `ESCAPE '\'`" — which nothing did,
so the backslashes were matched literally. Searching for `john_smith@nott.ac.uk` looked for a
backslash no row contains and returned nothing at all: the box office was told a booking did not
exist. Underscores are common in email local parts and the failure was silent.

## Consequences

- Client-side filtering over a full table is gone from the admin area. A page that needs a count
  reads `total` from the envelope rather than walking a row model.
- Sorting and filtering must be expressible in SQL. Where a computed value is needed for a filter it
  is a correlated scalar, which interacts with [ADR-0006](0006-d1-bound-parameter-limit.md).
- Correlated scalars used to filter and order cannot also be projected: the relational builder
  resolves the outer reference differently in a projection than in a predicate, and the column comes
  back null. Derive such values from rows already loaded instead.
- The archive is reachable by search rather than by scrolling, which is the only way to reach a show
  from 2014.
