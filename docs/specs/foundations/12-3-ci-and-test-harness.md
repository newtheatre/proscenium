# CI and test harness

## Tests that run where the developer is

Proscenium's suites pass only on CI, and its repository records that no suite exercises the D1 driver. Mailflare's unit tests use Node's SQLite rather than D1. This design starts from the opposite position: every tier runs on a contributor's machine with one command, and anything that depends on the database runs against D1's own local engine. Proof 3 showed the three tiers working on Linux.

**Linux is the supported system for tests**, by Matt's decision of 16 November 2026: Workers run on Linux and the application depends on the browser, not the operating system. CI runs on Linux only. Differences between browsers are covered in the browser tier, where Firefox and WebKit can be added beside Chromium on the same runner.

## Tools

| Job | Tool | Why |
| --- | --- | --- |
| Package manager and script runner | Bun | As in Mailflare; fast installs; one lockfile |
| Type check | `vue-tsc` through `nuxt typecheck` | Types flow from the generated registry, so a wrong setting key or ability is a type error |
| Lint | ESLint with the Nuxt configuration, plus foundations' own rules | The import, route and audit conformance checks are lint rules, so editors show them as you type |
| Unit tests | Vitest, Node project |  |
| Integration tests | Vitest with Cloudflare's Vitest plugin: tests run inside workerd with local D1, R2, KV and queues | The same engine as production; no account |
| Browser tests | Playwright against `wrangler dev` serving the production build | Tests what is deployed, including the Worker entry, queues and cron |
| Accessibility | axe, run inside the browser journeys |  |
| Migrations | Drizzle Kit to generate; foundations' runner to apply |  |

## Commands

| Command | Does | Typical time |
| --- | --- | --- |
| `bun run dev` | The site with local resources |  |
| `bun run check` | Lint, types and every conformance check | under a minute |
| `bun run test` | Unit and integration tiers | seconds to a few minutes |
| `bun run test:browser` | Builds, serves under `wrangler dev`, runs the journeys | a few minutes |
| `bun run test -- layers/box-office` | One module's tests | seconds |
| `bun run db:generate -- --name <what>` | Writes a migration from a schema change |  |
| `bun run verify` | Everything CI runs, in CI's order |  |

There is no command that works in CI and not locally. `bun run verify` is what CI calls.

## How integration tests reach D1

- The Vitest plugin starts workerd with the bindings from a small test configuration. Each test file gets its own storage, so files run in parallel without seeing each other.
- A setup file applies all migrations with the plugin's own helper, then the fixtures. The proof did this for a four-table schema in well under a second.
- Tests import services and call them with a real unit, or call routes through the Worker's fetch handler. They never stub the database.
- Concurrency tests use real concurrent calls against the one local database; this is how the last-seat case was shown.
- Queues are driven by the plugin's helpers: a test enqueues, then asks the consumer to run, and asserts on the job row.
- Time is the kit's clock, set per test.

## CI workflows

| Workflow | When | Jobs |
| --- | --- | --- |
| `ci` | Every pull request and push to `next` and `main` | `check` (Linux) · `test` unit and integration (Linux) · `browser` (Linux) · `build` with a size report · `fork-merge` (the scripted theatre fork merges this commit) |
| `release` | A tag | Re-runs `ci`, builds release notes, publishes the release and its machine-readable notes file |
| `update` | Daily, in a theatre's fork | The update action (Upstream merges tab) |
| `fork-ci` | Pull requests in a theatre's fork | `check` including owned paths, `test`, `build` |

Rules for the workflows themselves:

- Dependencies are cached by lockfile hash; the workerd binary and Playwright's browser are cached by version.
- A test that fails is never retried automatically to turn green. A test found to be unreliable is fixed or deleted, and CI reports any test that passed only on a re-run as a failure.
- No workflow needs a secret to run the tests, so a pull request from a fork runs the full suite.
- Deploys are not done by GitHub Actions. Cloudflare's Workers Builds deploys the default branch, which keeps the theatre's Cloudflare credentials out of GitHub.
- Preview deployments for pull requests are off by default, because a preview shares the production database; a theatre that wants them connects a second Worker with its own resources.

## Budgets

| Thing | Budget | Enforced by |
| --- | --- | --- |
| `bun run check` | 60 seconds on a laptop | CI warns above, fails at double |
| Unit and integration, whole product | 5 minutes on CI | The same |
| Browser journeys | 10 minutes on CI | The same |
| Worker bundle, compressed | A stated margin under the platform limit, reported on every pull request | `build` job |
| One request's database statements | A ceiling per route, asserted in integration tests of the busiest routes | Test helper that counts statements |

## What a module author has to write

Unit tests for its rules, integration tests for its services and routes, fixtures for the seeded world, and at most one or two browser journeys. Everything in the conformance table of the Test plan comes for nothing from the registry, including the erasure scan and the run with each soft dependency switched off.
