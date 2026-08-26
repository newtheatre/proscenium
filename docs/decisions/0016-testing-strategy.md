# 0016: Testing strategy: invariants first, named regressions forever

- Status: Proposed
- Date: 2026-08-26

## Context

Test coverage across the old estate was wildly uneven: the training application pinned its
safety semantics with a thorough suite; the applications carrying the money and the audience
had no tests at all. Every defect in the audit was in an untested area.

## Decision

The register, the ledger, capacity and erasure are correct or the system is not shippable;
their tests are written before their implementations. The named regression suite is seeded in
Phase 1 and grows monotonically: the register race, the capacity race, the double refund, the
expected-total mismatch, DST recurrence arithmetic, the academic-year carry-over, at-most-once
promotion notification, erasure completeness, and every defect the audit recorded in the old
estate. Concurrency claims are proven by tests that race real transactions, not by comments.
The old training suite's pinned behaviours are ported as specifications.

Amended 26 August at committee direction: development is spec-and-test-driven in that order,
everywhere. The backlog story or decision record is the spec; failing unit and integration
tests reflecting the spec are written first; the implementation follows; the tests pass. A
change arriving with its tests in the same commit satisfies the rule; a change arriving before
any test does not.

Also amended 26 August: coverage spans three layers, all under Bun 1.4's
test tooling (`bun test`, which both old suites already run on, several times faster than the
harness they left). **Unit tests** hold the pure logic (expiry arithmetic, pricing resolution,
validity). **Integration tests** exercise real routes against a real test database, which is
where the racing tests live. **End-to-end interface tests** drive the critical journeys in a
browser: booking a ticket, admitting at the door, a till sale, marking a register, requesting
a room. All three layers run in CI on every merge; the end-to-end journeys are the same list
the accessibility checks script, so the two suites share fixtures.

## Consequences

- CI runs the full suite on every merge with no exemptions.
- A bug found in production earns a failing test before it earns a fix.
- Feature work in an area without its invariant tests is sequenced after those tests.
