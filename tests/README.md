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

`e2e/` is empty and its browser driver is deliberately unchosen: the first end-to-end journey
is a Phase 2 story, and the choice gets a decision record when that story is picked up.
