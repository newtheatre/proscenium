# 0022: Integration tests run on SQLite, end-to-end tests drive Bun.WebView

- Status: Accepted (IT Manager decision, 26 August 2026)
- Date: 2026-08-26

## Context

Decision 0016 set three test layers under Bun's own tooling: unit tests for pure logic,
integration tests against a real test database, and end-to-end tests driving the critical
journeys in a browser. It named neither the database those integration tests run on nor the
browser driver, because neither mattered until something needed testing.

Production runs D1 through `drizzle-orm/d1`, against a binding that exists only inside a worker.
A test process has no such binding.

## Decision

**Integration tests run on `bun:sqlite` through `drizzle-orm/bun-sqlite`**, one in-memory
database per suite, with the compiled migrations applied in journal order. D1 is SQLite, so
schema, constraints, triggers and query behaviour are the same engine.

Two things are not the same, and the harness closes both rather than leaving them to be
discovered in production:

- **D1 has no interactive transaction.** Atomicity is `db.batch` only (0001, 0003), and the
  bun-sqlite driver exposes no `batch` at all. The harness provides one with D1's all-or-nothing
  semantics, so a test exercises the shape production runs rather than a transaction production
  cannot use.
- **D1 caps a statement at 100 bound parameters** and this repository chunks at 90. SQLite
  accepts far more, so the harness refuses a statement over the chunk limit. Without it a test
  passes and the same statement fails on a busy night.

**End-to-end tests drive `Bun.WebView`.** It is in the runtime the rest of the suite already
uses, so there is no second toolchain, no browser download and no separate runner. Its default
`webkit` backend is macOS only; everywhere else it drives Chrome over the DevTools protocol,
which is what CI and the development machines use.

A suite with no usable browser **skips loudly and says why**. It establishes that by opening a
view and catching the failure, not by looking for a binary on `PATH`: Bun.WebView finds Chrome in
standard locations whether or not it is on `PATH`, so anything less than opening one is a guess.

## Consequences

- The integration layer proves logic, constraints and atomicity. It does not prove D1's own
  limits beyond the two the harness enforces, and it cannot prove genuine write contention,
  because an in-process SQLite serialises. A concurrency claim that needs real contention is
  proven against a deployed preview, and the story that makes such a claim says so.
- Miniflare would give true D1 semantics. The version in this tree is an alpha whose
  configuration shape has changed, and adopting it is a cost with no return while the harness
  closes the two gaps that bite. If contention testing ever needs it, that is a successor record.
- `Bun.WebView` is experimental and may change between Bun releases. It is used through one
  helper, so a change lands in one file rather than in every journey.
- Chrome is a development prerequisite on Linux. CI runners carry it already.
