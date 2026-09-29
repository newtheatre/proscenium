# Tests

Three layers, all under `bun test` (decision 0016).

| Directory | What lives here |
| --- | --- |
| `unit/` | Pure logic from `shared/`: expiry arithmetic, pricing resolution, validity, date discipline. |
| `integration/` | Routes and invariants against a real local database. The racing tests live here. |
| `e2e/` | The critical journeys in a browser: booking, door, till, register, room request. |

## The named regression suite (K-121)

The cases the old estate taught us are seeded as `test.todo` entries carrying the story they
belong to. They are present and visible from day one, which is what K-121 asks for, but a
`test.todo` does not gate a merge. Each one becomes a real failing test in the pull request
that works its story, ahead of the implementation, per the order in `CONTRIBUTING.md`. Seeding
them as passing stubs would misreport what is covered.

## Fixtures

Every fixture speaks one currency: a `BoundStatement`, which is a statement and its bound
parameters, run through a sink. `createTestDatabase()` is a sink over an in-memory database and
`sqliteTarget(database)` is one over a file, which is what an end-to-end suite hands a fixture
builder for the dev server's own database. `scripts/seed/` holds the builders the development
seed composes, and `tests/helpers/` holds the small ones a suite needs, so a fixture and a
development database are written by the same code (K-120).

Each `createTestDatabase()` is a copy of one migrated image, made the first time a run asks for one
(0110): its own database, with every table and trigger the journal builds, for the cost of a copy
rather than a replay of every migration. The migration tests below still migrate for real.

A sink also reads, which is what lets a builder match a row on its natural key and stay
re-runnable. Nothing else may reach the database from a fixture.

## Migration tests

A migration with a data step, or a table rebuild, is proved against the shape it meets: every
migration before it, rows seeded in that old shape, then that one migration alone (0010, 0052).
`tests/helpers/migrations.ts` is the one harness for it, and a test never walks the journal or
splits a migration file itself.

- `withMigration(name, seed, check)` does the whole round on an in-memory database with foreign
  keys on; `{ runs: 2 }` applies the migration a second time over its own result, for a data
  step that claims to be idempotent.
- `databaseBefore(name)` and `applyTag(database, name)` are the same two halves, for a test that
  needs its own shape, such as asserting that a migration aborts. `migrationSql(name)` and
  `execMigration(database, sql)` split the apply further, so that `expect(...).toThrow()` sees
  only the migration's own statements and never a failed file read.
- `name` is the whole tag (`0116_the_box_office_role_folds_into_front_of_house`) or the name
  with its number left off (`_the_front_of_house_role_is_retired`). The name alone lets a test
  written before its migration lands survive the number the migration is given; the whole tag
  pins it.

## The browser suites

`e2e/` drives Chrome through `Bun.WebView` over the DevTools protocol, WebKit on macOS (0022).
One dev server is shared across a shard and the isolation is the database, emptied between
suites. A suite with no usable browser reports a skip rather than passing.

`E2E_SUITES` (paths, space-separated) narrows `bun run test:e2e` to those suites before the slices
are dealt. CI sets it for a pull request that edits suites alone (0110); a name that is not a suite
is refused rather than run as nothing.
