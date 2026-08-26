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

1. Lint and typecheck.
2. The full test suite, including the named regression cases: the register race, the double
   refund, the capacity race, DST recurrence arithmetic, academic-year carry-over, erasure
   completeness, and the expected-total mismatch.
3. Migration review check: a generated migration that rebuilds an append-only table is refused;
   hand-edited generated migrations are refused.
4. Comment rules: two lines maximum, constraints not narration, no JSDoc block tags, no
   narrated history.
5. Documentation drift check: a change to behaviour without a change to its document fails
   review. Documentation drift is a defect; the old rooms application is the cautionary tale.

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
  All three run in CI on every merge.
- The register, the ledger and erasure are correct or the system is not shippable; their tests
  are written before their implementations.
- Every defect found in the old estate's audit becomes a regression test here before its
  feature is considered done.
- Concurrency claims ("race-safe", "at-most-once") are proven by a test that races, not by a
  comment that promises.
