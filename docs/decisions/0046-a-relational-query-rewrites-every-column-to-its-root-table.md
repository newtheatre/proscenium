# ADR-0046: A relational query rewrites every column to its root table

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`GET /api/bookings/my` had to page in SQL like every other list endpoint ([ADR-0005](0005-paginate-list-endpoints-in-sql.md)),
and it splits the caller's bookings into upcoming and past by the performance's start time. The
split cannot be a bound list of ids ([ADR-0006](0006-d1-bound-parameter-limit.md)), so it has to be
a subquery in the `where`, and the ordering has to be the performance's `startsAt` rather than the
reservation's `createdAt`.

Drizzle's relational query builder (`db.query.<table>.findMany`) accepts a raw `SQL` fragment in
both `where` and `orderBy`. What it does with one is not documented: **it rewrites the table
qualifier of every `Column` object it is handed to the root table of the query.** The obvious
correlated subquery,

```ts
sql`(select ${performances.startsAt} from ${performances} where ${performances.id} = ${reservations.performanceId})`
```

renders as

```sql
(select "reservations"."starts_at" from "performances" where "reservations"."id" = "reservations"."performance_id")
```

The name in the `from` clause survives, because a Table is not rewritten. Every column qualifier is
replaced. Aliasing the inner table with `alias()` does not help: the alias reaches the `from` clause
and the columns are rewritten anyway. None of this is a syntax error, so neither the compiler nor
the build says a word; SQLite executes it and answers the wrong question.

A second trap sits beside it. An `SQL` fragment carries no column type, so a `Date` bound through
raw `sql` is serialised as an ISO string while `performances.starts_at` holds an integer timestamp.
The comparison then matches nothing, quietly.

## Decision

Inside a relational `where` or `orderBy`:

1. **A predicate over another table uses a subquery object**, built with `db.select(...)` and passed
   to `inArray`. A query-builder object is not rewritten, and it binds one parameter however many
   rows it covers.
2. **A correlated scalar names its inner columns with `sql.identifier(column.name)`**, never with the
   `Column` object. The name still comes from the schema, so a rename moves with it, and there is
   nothing left for the builder to rewrite.
3. **A typed value is never bound inside a raw fragment.** Compare it through a real column, which
   means putting it in the subquery object of rule 1.

## Alternatives considered

- **Hand-written SQL identifiers** for the inner table and columns. Works, and is silently wrong
  after a column rename, which `sql.identifier(column.name)` is not.
- **Abandon the relational builder here** and assemble the payload from `db.select()` plus joins.
  Tickets are one-to-many, so the rows would have to be folded back together in the Worker, or
  fetched by a bound id list, which ADR-0006 forbids.
- **Order by `reservations.createdAt`**, which needs no correlation at all. Rejected: a customer's
  upcoming list ordered by when they booked is not the order they need to read it in, and the past
  list is the half that grows without bound.

## Consequences

- The one correlated scalar in `server/api/bookings/my.get.ts` reads oddly, and carries a two-line
  comment pointing here rather than an explanation.
- Any later relational query that filters or orders on a related table takes the same two shapes. A
  `Column` belonging to another table, inside a relational `where` or `orderBy`, is a defect in
  review.
- Plain `db.select()` queries are untouched by this: the rewrite belongs to the relational builder,
  not to the dialect. The same fragment is correct there and wrong one line away.
