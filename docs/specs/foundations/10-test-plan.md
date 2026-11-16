# 8. Test plan

## Two test plans in one

Foundations has to be tested itself, and it supplies the tests every other module is held to. This part covers both. The harness (tools, commands, CI) is in the Design tab under CI and test harness; it was proved to run locally in the Proofs tab.

## The three tiers

| Tier | Runs in | Tests | Rule of thumb |
| --- | --- | --- | --- |
| Unit | Node | Pure rules: state machines, calculations, validators, the registries' own logic | No database, no network, milliseconds each |
| Integration | workerd with a fresh local D1, file store, cache and queue per test file | Services, routes, units of work, jobs, listeners, migrations | The real driver, the real triggers, the real constraints |
| Browser | Chromium against the built Worker under `wrangler dev` | Journeys a person makes, accessibility checks, refusals as a person sees them | Few, each a whole story |

A rule that can be tested at a lower tier is tested there. A behaviour that depends on D1 (anything with a guard, a trigger or a batch) is never tested against a stand-in database.

## Conformance checks: what every module must pass

These run from the registry over every module, upstream's and a theatre's own, with one command (`bun run check`) and in CI. A module author writes none of them. They are the mechanical form of the rules in the format tabs.

| Check | Fails when |
| --- | --- |
| Manifest | A manifest field is missing or misnamed; an id breaks the naming rules; `requires` forms a loop; a module imports one it does not list |
| Tables | A table exists that no manifest declares, or the reverse; a table name lacks its module's prefix |
| Data classes | A column has no class; a table with personal columns has no subject; a class and its erasure behaviour do not fit; an append-only table lacks its triggers |
| Migrations | The schema and the migrations disagree; an applied migration's checksum changed; a migration removes or renames within a major; a migration rebuilds an append-only table |
| Routes | A route has neither an ability nor `public: true` (the ability may be 'signed-in'; 'public' is not an ability); a route's ability is not declared; a route lies outside its module's prefix; a changing route lacks input validation |
| Abilities | An ability is declared and never checked, or checked and never declared; a `privileged ability that changes something is declared fresh: false, or one that only reads is declared fresh: false without audit: 'read'`; an ability's record type has no table |
| Settings | A key is read that is not declared; a default lies outside its own limits; a sensitive setting is quotable; a content token names an unknown or non-quotable key |
| Events and jobs | An event is announced or listened to without being declared; a listener's module neither requires nor uses the announcer; a job handler is missing |
| External calls | A module uses `externalCall` with no reconcile handler; an outside address is fetched outside `externalCall` or a declared credential |
| Imports | A file reaches into another module beyond its `services.ts`; anything but the kit touches a binding |
| Audit | A value from a personal or free-text column is passed to audit detail or to an event payload |
| Owned paths | (In a fork) a file outside the theatre's paths differs from the merged release |
| Translations | A user-facing string is not in a catalogue; a key is unused |
| Soft dependencies | A module's suite fails when a module in its `uses` is switched off |
| Erasure | After erasing a seeded person, any column classed personal, free-text or special still holds their data anywhere (run over the whole schema from the registry) |

The erasure check is the most valuable: it seeds one person through every module's fixtures, erases them, then scans every classed column. A new module that forgets a column fails it without anyone writing a test.

## Foundations' own tests

### Unit of work (integration)

| Case | Expect |
| --- | --- |
| Batch with a passing guard | All statements, the audit row and the event row are written |
| Batch with a failing guard | Nothing is written; the caller gets a refusal with the guard's code |
| N concurrent conditional claims of one row | Exactly one succeeds |
| N concurrent decrements of a counter with a limit | Never passes the limit |
| A service tries to commit | Type error at build; runtime error in a test that forces it |
| A unit over the statement limit | Refused before any statement runs |
| After-commit hook throws | The commit stands; the error is logged; the request still succeeds |

### Routes and permission

Every combination of: signed out, signed in without the ability, with it by grant, with it by fact, with it by ownership, Owner where `owner: 'refuses'`, stale sign-in on a `fresh` ability, module switched off, rate limit reached, challenge failed, invalid input, repeated idempotency key with the same and with a different body. Each expects the exact refusal code.

### Modules

Switch on with requirements unmet (offered together); switch off while required (refused, names listed); off then on (jobs resume, data intact); first enable runs setup steps once; missing `always` secret blocks, missing `when-used` secret does not.

### Settings

Every kind: accepts a valid value, refuses each kind of invalid one with the limit named. Default applies with no row. Change writes history. Sensitive values never appear in history, audit, logs or exports. A limit tightened by an update flags the old value. Orphaned keys are kept and reported. Import previews and applies only confirmed differences.

### Migrations

Fresh database to latest; each released version to latest (a stored snapshot per release); upstream then site ordering; failed migration leaves no trace; changed checksum stops the runner; two runners at once (one waits); pending migrations give 503 on ordinary routes and not on health or sign-in.

### Events, jobs and tasks

Event stored in the same batch as its change; crash between commit and dispatch is swept; duplicate queue message runs the job once; failure retries with back-off then dies at the limit; dead job retried from the screen; cron firing twice in a minute runs a task once; a missed hour is caught up once, not sixty times; a task at a local time behaves across both clock changes in March and October; jobs of a switched-off module wait.

### External calls

Success; provider refusal; timeout then reconcile to success; timeout then reconcile to failure; retry sends the same key; a crash after the provider succeeded and before the outcome commit is settled by reconcile and never charged twice.

### Setup and credentials

Setup without the code does nothing; with a wrong code is rate-limited; resumes mid-way; cannot be reached once an Owner exists. A credential is never returned by any route; rotation of the encryption key re-encrypts and old ciphertext still reads during the change.

### Updates (run in CI on a scripted fork)

The proof from the Proofs tab becomes a permanent test: a scripted theatre fork that overrides a page and a component, adds a page, a module with a table, a content collection and a dependency, then merges the release under test. It must merge with no conflict outside the lockfile, build, apply migrations and serve the theatre's versions.

## Browser journeys

1. First run: setup from an empty database to the console home, by keyboard alone.
2. Switch a module on, see its navigation appear without a reload, switch it off, see it go.
3. Change a setting, see the public page that quotes it change.
4. Break something on purpose (remove a secret in the test deployment), see the health screen say so with a remedy.
5. A dead job: find it, read the error, retry it.
6. Audit: find a change by record and see what allowed it.

Every journey also runs the automated accessibility check on each page it visits and fails on any serious finding.

## Fixtures and time

- One seeded world, built by each module's own fixture function, used by integration and browser tiers. No test depends on another's leftovers: each file gets a fresh database from migrations plus fixtures.
- The clock is the kit's and is set by the test. No test reads the real time.
- No test calls an outside service. Providers are replaced at the `externalCall` boundary by scripted stand-ins that can succeed, refuse, time out or answer late.

## What must be green before a release

Lint, type check, conformance checks, unit, integration and browser tiers, all on Linux; the scripted fork merge; a production build whose size is within the Worker limit with a stated margin. A release tag cannot be created from a commit where any of these failed.
