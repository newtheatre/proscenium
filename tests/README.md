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

A sink also reads, which is what lets a builder match a row on its natural key and stay
re-runnable. Nothing else may reach the database from a fixture.

## The browser suites

`e2e/` drives Chrome through `Bun.WebView` over the DevTools protocol, WebKit on macOS (0022).
One dev server is shared across a shard and the isolation is the database, emptied between
suites. A suite with no usable browser reports a skip rather than passing.
