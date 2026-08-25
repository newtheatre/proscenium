# ADR-0045: The practice fixture dates itself against tonight

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

[ADR-0032](0032-training-mode-writes-to-its-own-table.md) describes the sandbox data as a "frozen
fixture", and it was frozen in both senses. Its two performances carried literal instants,
`2026-01-01T19:30:00.000Z` and `2026-01-01T21:30:00.000Z`, and `GET /api/training/bar/lookup`
returned `isTonight: true` as a literal beside them.

The till renders those two together. `app/pages/foh/bar/till.vue` prints
`formatDateTime(found.performance.startsAt)`, which includes the year, and colours it neutral when
`isTonight` and amber with "· not tonight" when it is not. So the sandbox showed a booking dated eight
months earlier, in neutral grey, asserted to be tonight's. That gap widens by a year every year
nobody touches the file, which is exactly the cost ADR-0032 books under Consequences: "a stale
sandbox teaches a screen that no longer exists."

The second half is worse than the stale date. The amber branch was unreachable. Paying in advance for
another night is a designed case of the real till, deliberately not night-scoped
([docs/13 §2.2](../13-bar-design.md), and `server/api/bar/lookup.get.ts` says so in a comment), and it
is the only thing the `isTonight` flag exists for. With the flag a constant, no trainee could ever
practise it. Moving the flag alone would not have fixed that either: all five fixture bookings sat on
`training-perf-1`, and the lookup returns bookings, so there was nothing on the other performance to
find.

## Decision

**The fixture keeps a wall clock and a number of nights, and is dated against a show night when it is
read.** Each performance carries `curtain` (`'19:30'`) and `nightsAhead` (`0` for tonight), and
`trainingPerformances(night, window)` resolves them through `londonInstant`, which moved to
`shared/utils/londonTime.ts` so the fixture and the server's validity windows share one definition
of a London wall clock.

**The guarantee ADR-0032 made is untouched, and it was never about the values being constant.** It is
that no fixture row is ever inserted into `performances`, `reservations`, `users` or anything else.
That is still true, and it is still checkable. Where ADR-0032 and
[docs/14 §4](../14-training-mode-design.md) say "frozen", read "never persisted": this record is where
that narrowing lives, since an accepted ADR is superseded rather than edited.

**`isTonight` is decided, never asserted.** `trainingPerformances` takes the window and compares
against it; the sandbox builds that window with `showNightDate()`, `validityStart()` and
`validityEnd()`, which are the same three functions the real till scopes itself with. A fixture
performance the sandbox cannot identify is flagged **not** tonight rather than assumed to be tonight,
because the amber card is still payable and the neutral one is a claim.

**The fixture gains a third performance, a week out, and `TRAIN4` moves onto it** as a two-ticket
`PENDING` booking. That makes the advance-payment case reachable through the till, and it retires an
accidental duplicate: `TRAIN4` was the same paid single-ticket booking as `TRAIN2` under another
name, which [docs/14 §5.4](../14-training-mode-design.md) had to apologise for on the printed sheet.

**The door sandbox is scoped to tonight, like the real door.** `GET /api/foh/lookup` only ever
searches tonight's performances ([ADR-0019](0019-the-rota-scopes-the-front-of-house-role.md)), so
`GET /api/training/foh/lookup` now filters the fixture the same way. Without that, putting a booking
on another night would have taught a door that finds next week's bookings, which no real door does:
a drift introduced by the fix, in the one feature whose whole argument is that practice must not
drift from the thing practised.

## Alternatives considered

- **Fix `isTonight` and leave the dates alone.** Rejected. It swaps a confident wrong answer for a
  correct one that reads "1 Jan 2026 · not tonight" on every card, so every fixture booking turns
  amber and the neutral case becomes the unreachable one. The stale date is on screen either way.
- **Move `training-perf-2` to another night rather than adding a third.** Rejected. The real
  `GET /api/bar/tonight` returns tonight's performances only, so the till would have been left with
  one, losing the two-shows-in-an-evening shape the fixture already had.
- **Seed the fixture into the real tables and date it there.** Rejected outright by ADR-0032: no
  fixture row is ever inserted anywhere, and this is the alternative that ADR rejected at length.
- **Print the resolved date on the practice ticket sheet.** Rejected. The sheet exists to be printed
  ahead of a lesson ([ADR-0043](0043-practice-tickets-print-ahead-of-the-lesson.md)), and a card
  carrying a calendar date is wrong the second week a trainer reuses the stack. Each card says
  "Tonight" or "Another night" plus the curtain time, both of which stay true.

## Consequences

The till sandbox shows tonight's date, the amber advance-payment case can be practised, and the
fixture stops ageing.

The fixture now depends on the clock, which it did not before. It reads the show night through
`showNightDate()`, so it rolls over at 04:00 exactly as every other front-of-house screen does, and a
sandbox opened at 00:30 sees the night that is still running rather than the next one.

`TRAIN4` is now a till card rather than a door card. A trainer who scans it at the door gets nothing,
which is a case worth meeting, and the sheet says so on the card and in its heading rather than
leaving them to work it out.
