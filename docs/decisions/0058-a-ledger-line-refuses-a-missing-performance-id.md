# 0058: A ledger line whose kind always belongs to one performance refuses a missing performanceId

- Status: Accepted
- Date: 2026-09-10

## Context

`ledger_lines.performance_id` is left unset silently, and nothing at the write path notices,
because nothing reads the column until a report does. This has now happened four times, in the
two busiest money paths and two others found while looking for a third:

- `commitSale()` and `commitCompSale()` in `server/utils/sale.ts` (bar's `BAR_ITEM`), fixed in
  #791. It broke E-123's per-performance bar summary for every performance on the night.
- `collect()` in `server/utils/desk-collection.ts` (box office's `TICKET_COLLECTION`, D-114),
  fixed in #795. Every ticket collection, not only the access and companion ones D-128 adds.
- `refundTicket()` in `server/utils/refunds.ts` (`REFUND`, D-116): `reservation.performanceId`
  is resolved two lines above the write, for the approval scope, and never reaches the line.
- `voidTabCharge()` in `server/utils/tab-settlement.ts` (a voided tab's `BAR_ITEM`, F-109): the
  credit line copies every column the charge it reverses had except this one.

All four share the same shape: the value is available at the call site, resolved for some other
purpose, and simply never threaded onto the line. No existing test caught any of them; the first
two were found by a person reading the report that came out wrong, and the second two by
deliberately auditing every caller of `postEntry()` once the pattern was named. Two is a
coincidence. Four is the contract's fault: `docs/architecture.md`'s money-path table fixes the
`(source, tender, kind)` triple a path posts under and a test enforces it (0053's own sibling,
the money-path checklist), but nothing before this record said anything about `performanceId`,
which a report needs exactly as much as it needs the kind.

Not every kind belongs to one performance. `PASS_SALE` is issued and paid for at the desk but
is not for one show; a pass covers many. `TAB_SETTLEMENT` bundles every outstanding charge a
holder has, which can span more than one performance in one settling. `IMPORT` genuinely has no
performance to give: no programme transform exists yet to map an old-estate id to a live one
(K-114, 0015), and the ticket id it could be recovered from lives in `out/money-id-map.tsv`
rather than a column. `BAR_ITEM` itself is conditional rather than either: a till sale posts
`performanceId: context.performanceId`, typed `string | null`, because the bar may be open with
nothing scheduled. A structural check cannot know whether a show is on; that is the caller's own
business logic, not a fact the ledger schema can verify.

## Decision

**A line whose kind is always one ticket for one performance refuses to post without a
`performanceId`, at the write, in `shared/utils/ledger.ts`'s `lineForm`.**
`PERFORMANCE_REQUIRED_KINDS` names `TICKET_COLLECTION`, `WALK_UP`, `PASS_ADMISSION` and `REFUND`:
each represents one ticket, and there is no legitimate case where one of these has nothing to
name. `lineForm` gains a `.refine()` checking it, so every current and future caller of
`postEntry()` is checked identically, with no way to opt out short of editing this file. This is
deliberately a runtime refusal, not only a type: `postEntry()` already calls `entryForm.parse`,
so a caller cannot reach the database with a violating line, by construction, the same way a
missing `source` or `tender` already cannot.

`BAR_ITEM` and `TAB_SETTLEMENT` are not in the list, for the reasons in Context: their absence is
sometimes correct, and only the caller knows when. `PASS_SALE` and `IMPORT` are never in the
list, unconditionally. A future kind is added to `PERFORMANCE_REQUIRED_KINDS` explicitly, by
whoever adds it, the same way a new kind already needs its own row in `docs/architecture.md`'s
table; this is not something to special-case quietly.

## Consequences

- `refundTicket()` and `voidTabCharge()` are fixed directly in the same pull request as this
  record: `RefundTicketWriteInput` gains `performanceId`, threaded from `reservation.performanceId`
  at the route; the void's own `SELECT` now reads `performance_id` off the charge it reverses and
  carries it onto the credit line.
- Existing tests in `tests/unit/ledger.test.ts` that construct a `TICKET_COLLECTION` or `REFUND`
  line to test something unrelated (whole-pence amounts, self-reversal) now supply a
  `performanceId`, so each still tests only the one thing its name claims.
- No test today exercises `desk-collection.ts`'s `collect()` directly; only an end-to-end run or
  production does. Until #795 merges, `collect()` still constructs a `TICKET_COLLECTION` line with
  no `performanceId`, which this refinement now refuses outright: merging this record before #795
  breaks ticket collection, undetected by `bun run test`, since nothing in that suite reaches the
  real function. This is not a hypothetical: confirmed directly against `lineForm` with the exact
  shape `collect()` posts today. Sequence the merge after #795.
- The next occurrence, if there is one, is a call site nobody has audited yet rather than a gap
  in this mechanism: every path through `postEntry()` is now checked the same way, including one
  written after this record.
