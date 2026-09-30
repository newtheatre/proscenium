# 0110: CI runs its gates in parallel, and runs only what a change can reach

- Status: Proposed
- Date: 2026-09-29
- Amends: 0109 ("every pull request into `unified/main`" runs the end-to-end suites) and 0029
  (`bun run test` "finishes in under a second")

## Context

On 29 September 2026 a pull request waited about ten minutes for `ci.yml` and up to six for the
slowest of the ten end-to-end slices. `ci.yml` was one job running every gate in turn: install
29s, build 2m33s, typecheck 1m19s, lint 49s, the Bun typecheck 17s, and `bun run test` 4m23s.
The last was not the "under a second" 0029 promised. Integration tests were 260 of its 263
seconds, because `createTestDatabase()` replayed every migration file (about 130) for every test,
roughly 1,700 times a run, at about 260ms each.

The end-to-end suites ran all ten slices on every pull request, whatever it touched. A change to
this directory paid ten runners for five minutes each to prove that Markdown under `docs/` does not
break a browser journey, which it cannot: the application reads `content/`, never `docs/`.

## Decision

**The unit and integration suites copy one migrated schema.** The first `createTestDatabase()` in
a run migrates a scratch in-memory database and keeps its serialised image; every call then
deserialises a private copy (about 0.3ms) and turns foreign keys on, which is per connection and
not part of the image. Each test still gets its own database with every trigger. The migration
tests (`tests/helpers/migrations.ts`) and the end-to-end reset keep migrating for real, because
migrating is what they test.

**`ci.yml` runs its gates as parallel jobs behind one gate job named `ci`.** Build, typecheck (the
Nuxt application and the Bun projects), lint, test and check each run on their own runner, with the
Bun install cache restored from `bun.lock`. The `ci` job needs all of them and fails if any failed
or was cancelled, so the required check keeps its name. A newer push to a pull request cancels the
older run.

**A scope step decides what a pull request can reach** (`scripts/ci-scope.ts`), from the merge
commit's diff against its base. The rules are an allowlist, and anything they do not name runs
everything:

- Documentation (`docs/**`, and Markdown outside `content/`) cannot reach the application, so a
  change touching only documentation skips build, typecheck, lint and the end-to-end suites.
- `tests/unit/**`, `tests/integration/**`, the invariant checkers (`scripts/check*.ts`) and
  workflow files other than `e2e.yml` cannot reach the end-to-end suites.
- A change whose only other files are end-to-end suites (`tests/e2e/*.test.ts`) runs those suites
  alone, dealt across the slices as usual (`E2E_SUITES`).

`bun run test` and `bun run check` always run: unit tests read `docs/access-matrix.md` and the
backlog, and `check docs` guards `docs/`. A push to `unified/main`, the schedule, a manual run, a
diff that cannot be read and an empty diff all run everything.

**The slices skip by step, never by job.** A matrix job skipped by a job-level condition reports
an unexpanded name, which leaves the required `e2e (i/10)` checks waiting forever. Each slice
always starts and reports; out of scope, it runs only a line saying so.

## Consequences

- `bun run test` takes seconds rather than minutes, and `ci.yml` is bounded by the build, about
  three minutes, rather than by the sum of every gate. A documentation-only pull request clears
  in about a minute.
- Every gate pays its own checkout and install, so a full run uses more runner minutes than one
  serial job did, in exchange for wall-clock time. The install cache keeps that small.
- A path added to the allowlist is a claim that nothing in the running application reads it. A
  wrong claim lets a regression through to the next full run, which is the next push to
  `unified/main`. A file the rules do not name costs a full run, never a missed one.
- A suite edited on its own no longer proves the others still pass; the next full run does.
- The Bun module cache is shared across test files today, so the image is built once a run. If a
  later Bun isolates files, it is built once a file, still far cheaper than once a test.

## Options considered

- **Dealing the end-to-end suites to slices by recorded duration.** Rejected for now. It shortens
  the slowest slice of a full run, but needs a timings file that drifts with every suite, and
  running nothing at all for a change that cannot reach a browser is the larger saving.
- **A path filter on the workflow trigger.** Rejected. A workflow that never starts never reports
  its required checks, so the pull request cannot merge.
- **Mapping every source file to the suites that exercise it.** Rejected. Nuxt auto-imports and
  shared layouts make that graph wide and easy to get wrong, and a wrong map silently skips the
  suite that would have failed.
