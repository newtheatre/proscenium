# Contributing

Engineering standards for this repository, in force from the first commit. Most carry from the
old estate's conventions, which earned their keep; the additions cover working in one
repository at speed. Read this before your first change.

## Process

- Spec-and-test-driven, in that order: every change traces to a backlog story or a decision
  record (a change with no home in either gets one before it merges); failing unit and
  integration tests reflecting the spec land first; the implementation follows; the tests
  pass. Review enforces the order.
- Trunk-based development with short-lived branches. Every pull request is reviewed by a human
  who can explain the change cold; that reviewer's understanding is the merge criterion.
- Small pull requests over heroic ones. A slice that cannot be reviewed in twenty minutes is
  two slices.
- Assisted development builds from stories and decision records, never from vibes. Generated
  code merges only when its human owner understands it. Money, capacity and safety paths get
  test-first treatment and line-by-line review.

## CI gates (all green before merge, no exemptions)

Eleven steps, in `.github/workflows/ci.yml`. Run all of them before opening a pull request.

1. `build`.
2. `typecheck`, the Nuxt application, and `typecheck:bun`, a separate compiler over `tests/`,
   `scripts/` and `migration/`. **They are two gates.** Passing one says nothing about the other,
   and the second is the one a change to a script or a fixture fails.
3. `lint`.
4. `test`, the unit and integration suites, including the named regression cases: the register
   race, the double refund, the capacity race, DST recurrence arithmetic, academic-year carry-over,
   erasure completeness, and the expected-total mismatch.
5. `check:comments`: two lines maximum, constraints not narration, no JSDoc block tags, no
   narrated history.
6. `check:migrations`: a generated migration that rebuilds an append-only table is refused, as is a
   hand-edited generated one, as is a journal that disagrees with the files on disk.
7. `check:content-tokens`: a policy token on a content page that no configuration key answers.
8. `check:ledger`: a ledger line kind that the code does not enforce.
9. `check:notifications`: a notification type with no template, or a template nothing sends.
10. `check:audit`: a privileged route with no audit write, or an action written but never
    registered.

`test:e2e` is **not** a CI gate. It runs nightly and on demand (0029), and a full run takes minutes
rather than seconds.

Documentation drift is a defect and fails review, but no script checks it: a change to behaviour
without a change to its document is caught by a person. The old rooms application is the
cautionary tale.

## Scripts and tooling

- Anything that runs on this machine, in CI or at build time uses the Bun standard library:
  `Bun.file`, `Bun.write`, `Bun.Glob`, `Bun.$`. Not `node:fs`. Worker code touches neither.
- `node:path` stays, because Bun ships no replacement for it.
- The exception is directory creation, which Bun has no API for. `Bun.write` creates a file's
  parents; anything else keeps `mkdirSync` with a comment saying why.
- Scripts are TypeScript run by `bun`, not `.mjs` run by `node`.

- **Domain rules live in `shared/utils/`**, which Nuxt auto-imports into both the application
  and the server. A route or a server utility names them with no import at all.
- Everything in `server/utils/` is auto-imported into server code the same way. Only types need
  naming, because auto-import covers values and not types.
- Outside the application, in `tests/` and `scripts/`, nothing is auto-imported: reach in by
  alias, `#shared/utils/...`, `#server/...`, `#tests/...`. Those paths are declared twice, by
  Nuxt for the application and in `tsconfig.bun.json` for the Bun projects, so one spelling
  means the same thing everywhere.
- Never climb out of a directory with `../..`. A sibling inside the same directory stays
  relative, and that is the only relative import that should appear.

## Decisions

- Decision records live in `docs/decisions/` from day one. Accepted records are never edited,
  only superseded. Anything that cost an evening becomes a record citing the incident.

## Data rules

- Money is integer pence everywhere until formatted.
- Dates are formatted with Europe/London pinned; the show night runs 04:00 to 04:00.
- Append-only ledgers (money, stock, incidents, age checks, price history, audit) are
  trigger-enforced; corrections supersede.
- No personal free text in audit detail; erasure must never need to reach the audit trail's
  content.
- Every list endpoint paginates in SQL and returns an envelope, never a bare array.
- Customer-facing responses are column allow-listed.
- Validation with Zod on every request body and query string.

## Writing

- British English in UI copy and documentation.
- No em dashes; use a comma, a colon, a semicolon, parentheses, or two sentences.
- Write for the successor: the committee turns over yearly; assume the reader has no context
  and nobody to ask.
- Work is attributed to the person who submitted it. No tool attributions anywhere.

## Testing philosophy

- Three layers, all under Bun 1.4's test tooling: unit tests for pure logic, integration tests
  against a real test database (where the racing tests live), and end-to-end interface tests
  driving the critical journeys (booking, door, till, register, room request) in a browser.
  The first two gate every merge; the third runs nightly and on demand (0029).
- The register, the ledger and erasure are correct or the system is not shippable; their tests
  are written before their implementations.
- Every defect found in the old estate's audit becomes a regression test here before its
  feature is considered done.
- Concurrency claims ("race-safe", "at-most-once") are proven by a test that races, not by a
  comment that promises.
