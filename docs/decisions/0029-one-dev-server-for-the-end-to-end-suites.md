# 0029: The end-to-end suites are a separate command, and stop waiting on the clock

- Status: Accepted
- Date: 2026-08-30

## Context

Decision 0022 put the end-to-end suites on Bun and `Bun.WebView`, each booting a Nuxt dev server so
it could talk to a database no other suite had touched. That isolation earned its place: sharing
one database is how "the last administrator" stops being true halfway through a run.

The cost grew with the suite count. Nineteen suites at fifteen seconds a boot is close to five
minutes before a single assertion runs, out of an eleven minute run. Bun also buffers a test file's
console output until the file ends, so the run printed nothing at all for minutes at a time: a slow
suite and a hung one looked identical.

Two things were tried and refused. Running suites in parallel shards, each with its own port and
server, made the run **slower** and flaky: concurrent `nuxt dev` processes share this project's
`.nuxt` directory and contend over it, and one server failed to start inside its two minute
deadline. Trimming the dev-only modules (`@nuxt/a11y`, `@nuxt/eslint`, `@nuxt/hints`) and DevTools
saved about two seconds of the fifteen, which is worth taking and is not the answer.

## Decision

**The end-to-end suites are not part of `bun run test`.** That command is now the unit and
integration suites, and it finishes in under a second, so the thing a person runs dozens of times a
day costs nothing. `bun run test:e2e` is the slow half, run deliberately. CI gates on the first;
the second runs nightly and on demand (`.github/workflows/e2e.yml`).

The rest of this record is about making that slow half worth running.

**One dev server for the whole run, and the database emptied between suites.** Bun runs a test
file's siblings in the same process, so the harness keeps the server in a module singleton:
the first `startApp()` boots it, every later one empties the database and hands back the same
handle.

Emptying is a delete of every row rather than a replacement of the file, because the server holds
that file open and swapping it underneath a live connection is what `SQLITE_READONLY_DBMOVED` is.

**The schema is never touched.** A first attempt dropped the append-only triggers so `audit_log`
could be cleared and put them back from `sqlite_master`. It passed locally and failed a hundred and
one tests on CI, the server answering 500 from the third suite onwards: changing the schema under a
server whose statements are prepared against it is not something a second connection may do.
`audit_log` is therefore left standing, along with `_hub_migrations`. Its rows name ids that no
longer exist, which no suite reads, and every deletion runs in one transaction so the write lock is
taken and released once rather than per table.

**Isolation is unchanged in what it guarantees.** Every suite still starts against a database no
other suite has written to, which is the property 0022 was protecting. What is shared is the
server, which holds no state a suite can see.

**`scripts/run-tests.ts` owns the server's lifetime.** An exit hook inside a bun test process does
not reliably run, and a leaked dev server holds the port the next run needs. A `finally` in the
runner does run. The harness adopts a server that is already answering on its port rather than
refusing, so a leak from an interrupted run heals itself instead of blocking the next one.

**Progress is written straight to the descriptor.** `Bun.write(Bun.stderr, ...)` escapes the
per-file buffering, so the run names each suite as it starts, and the runner prints a heartbeat
naming the one it is still on.

## Waiting on the authenticator was larger than the boots

Five suites signed in as an officer holding a second factor. A spent TOTP step cannot answer a
second challenge, so each of them waited, a second at a time, for the thirty second window to move
on. Four of the five were the slowest suites in the run, and between them they slept for nearly
four minutes of a six minute run: more than every dev server boot put together.

They now clear `last_used_step` instead of waiting for it to expire. Replay protection is not what
those suites are about, and it has its own tests in `mfa-challenge.test.ts`, which does not use the
helper and still proves that a spent code is refused.

## A production build was considered

Testing against `.output` under `wrangler dev` is attractive: it boots in six seconds rather than
sixteen, and it exercises the artefact that deploys. It was measured and not taken, for now:
migrations are not applied under it (`/api/health` reports all eight pending), the session password
arrives through a Secrets Store binding that is absent locally so every request is refused, and the
local D1 file lives in wrangler's state directory rather than the one nineteen suites read with
`bun:sqlite`. Those are three solvable problems and one weak motive: after this decision the boot
is seventeen seconds of a hundred and fifty-four, so the case for it is fidelity, not speed.

## A pipe nobody reads

The runner and the harness both spawned the server with its output piped and read it nowhere. A
pipe fills at 64KB and then blocks the writer, so a dev server that logged enough froze mid-request
and answered everything after that with a 500. It survived locally, where the output was smaller,
and failed a hundred and one tests on CI where it was not. The runner drains both streams and keeps
the last of them for the message it prints when a server never becomes healthy; the harness
discards its own.

## One CI failure is unexplained, and is recorded rather than buried

The shared server passes locally, from a cold `.nuxt`, repeatedly. On a GitHub runner it fails: the
server answers 500 from the third suite onwards and a hundred and one tests fall over. Three
hypotheses were tested and two were real defects fixed on the way, neither of them the cause: a
piped output stream nobody read, which fills at 64KB and blocks the writer; the reset dropping and
recreating triggers under a live server; and the hub directory sitting inside the tree the dev
server watches, so every reset tripped a reload. The third is the current state and is unproven.

This is in known issues. Taking the end-to-end suites out of the pull request gate is not what
fixes it, and the nightly run is what will keep it visible.

## Consequences

- `bun run test` goes from eleven minutes to under a second, because it no longer waits for a
  browser. `bun run test:e2e` goes from eleven minutes to under three, with the same assertions.
- The output now says which suite is slow, which is how the waiting was found at all: the four
  suites that dominated the run were the four that waited on the clock.
- `E2E_SHARDS` still exists and still defaults to 1. Raising it is not currently useful, and the
  reason is written where somebody would try it.
- A suite that wanted a server configured differently, rather than a database in a different state,
  no longer has one. None does today, and the harness would need a second port if one did.
- A suite that genuinely needs a spent step to stay spent must not use `forgetSpentStep`. The one
  that does, `mfa-challenge.test.ts`, does not.
- CI gates on `bun run test`; `.github/workflows/e2e.yml` runs the rest nightly and on demand. `bun test <file>` still runs a single suite, booting a server of its own.
