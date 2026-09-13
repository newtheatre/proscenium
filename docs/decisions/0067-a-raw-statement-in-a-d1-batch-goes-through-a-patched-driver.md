# 0067: A raw statement in a `db.batch` goes through a patched drizzle-orm, and the patch is pinned by its own unit test

- Status: Proposed
- Date: 2026-09-13

## Context

Decision 0001 makes `db.batch` the only atomicity this application has, and 0003 and 0006 push
most contended writes into hand-written SQL: a conditional update whose predicate rides on the
statement, a scope expressed as a subquery, a recursive count that keeps the bound-parameter
count fixed. Those are written as `db.run(sql\`...\`)`, `db.all(sql\`...\`)`, `db.get` and
`db.values`, and they are put in a batch alongside ordinary Drizzle inserts. About 78 such
statements sit inside a batch across `server/api` and `server/utils`, including the booking
insert in `server/utils/reservations.ts`, the rota stamp in `server/utils/rota.ts`, the ledger,
the till, stocktakes, the waiting list and training sign-up.

On 13 September 2026 every one of those failed on the deployed worker with
`TypeError: Cannot read properties of undefined (reading 'bind')`, thrown from
`SQLiteD1Session.batch`. The cause is in the driver, not in this repository.
`drizzle-orm/d1/session.js` builds a batch by asking each query for a prepared statement and
calling `preparedQuery.stmt.bind(...)` whenever the query binds any parameters; it falls back to
`this.client.prepare(sql).bind(...)` only on the zero-parameter branch. A raw statement is a
`SQLiteRaw` (`drizzle-orm/sqlite-core/query-builders/raw.js`), whose `_prepare()` returns itself
and which carries no `stmt` at all. So a raw statement with at least one bound parameter throws,
and one with none does not. It is reported upstream as drizzle-team/drizzle-orm issue 2277, open since 8 May 2024 with no fix
released, so waiting for one is not a plan. Nothing caught it before deployment because the
driver is the D1 one:
the unit and integration suites run against SQLite drivers whose `batch` never takes that branch,
and `nuxt dev` does not use the D1 session either. The schema was never involved, which is why
`EXPLAIN` of the failing statement ran cleanly against production D1.

## Decision

`drizzle-orm` is patched in this repository, through `bun patch`. The params branch of
`SQLiteD1Session.batch` becomes
`(preparedQuery.stmt ?? this.client.prepare(builtQuery.sql)).bind(...builtQuery.params)`, which is
what the zero-parameter branch two lines below already does. The patch lives in
`patches/drizzle-orm@0.45.2.patch` and is applied by the `patchedDependencies` entry in
`package.json`, so a clean `bun install --frozen-lockfile` carries it, in CI as on a developer
machine. Both the ESM and the CommonJS build of the file are changed, so the fix does not depend
on which one a bundler picks.

`tests/unit/d1-batch-raw.test.ts` drives `drizzle-orm/d1`'s own `batch` against a fake D1 client
and asserts that a parameterised raw statement binds its parameters rather than throwing. That
test is the patch's contract: **the patch may be removed only when that test passes without it**,
which is the day upstream fixes this and the version moves. Removing the patch and deleting the
test together is not an option a future dependency bump may take.

Nothing in `server/` changes. Writing a contended claim as a raw statement inside a batch stays
the right shape under 0001, 0003 and 0006; it was correct code against a broken driver.

## Consequences

- This repository now carries a patched dependency, with the cost that goes with one: a
  `drizzle-orm` upgrade has to re-apply or retire the patch, and `bun install` fails loudly if the
  patch no longer applies, which is the behaviour wanted.
- The unit test is the only thing standing between a future version bump and a silent return of
  the same outage, so it is written against the driver's public surface rather than against this
  application's code, and needs no database.
- The gap that let this reach production remains: no automated suite exercises the D1 driver.
  Every unit and integration test runs on a SQLite driver that takes a different code path, so a
  defect specific to D1 is invisible until a request hits the deployed worker. Closing that
  properly means an end-to-end lane against `wrangler dev --local` on the built worker, which is
  its own piece of work and is recorded in `docs/known-issues.md` rather than done here.
- A reproduction recipe now exists and is worth keeping: build with `NODE_ENV=production`, run the
  built worker under `bunx wrangler dev --local -c .output/server/wrangler.json`, and apply the
  migrations to the local D1 from the copy the build writes to `.output/server/db/migrations`.

## Options considered

**Rewrite the 78 call sites to avoid raw statements in a batch.** Rejected. The raw statements are
there because 0003 and 0006 require them: a conditional write needs its predicate on the
statement, and a scope needs to be a subquery rather than a parameter list. Expressing those
through the query builder is either impossible or costs the very property those decisions exist to
protect, and 78 rewrites carry far more risk than three lines in a dependency.

**Wrap `db.batch` in a local helper that pre-prepares raw statements.** Rejected as the worse
shape of the same fix: it puts a workaround for somebody else's defect into application code that
every future reader has to understand, and it would have to be used consistently by 119 files to
work at all. A patch is the smaller, more honest statement of what is wrong and where.

**Pin to an older `drizzle-orm`.** Not available: upstream issue 2277 has been open since May
2024, so every version this project could reasonably run carries the defect.

**Wait for the upstream fix.** Not a plan for an outage. The issue is sixteen months old with
seven comments and no release behind it, and every create route in the application is down until
something changes here.
