# 0096: Every till charge is an attempt, answered by SumUp or by the person at the reader

- Status: Proposed
- Date: 2026-09-26
- Supersedes in part: 0069, its clause that the typed cross-check stays the laptop's flow as it
  was. Everything else in 0069 stands, and 0005's boundary is unchanged.

## Context

0069 put a SumUp hand-off on an attempt row, so nothing posts until the app answers, and left the
typed path as it was. On the typed path, pressing Charge wrote the ledger entry, the stock
movements and any booking collection, and only then did the screen say "Key this into the reader".
A card the reader declined left the takings, the depletion and a PAID booking in place, and no
bar-sale reversal exists to take them back (issue 1300, from the MVP flow review of 25 September
2026). The desk already records after the reader, so the bar was the one money-taking screen in
the building that wrote first.

On a phone with the hand-off switched on, the till also showed two full-width charge buttons, one
for each path, and a volunteer mid-interval had no reason to choose between them.

## Decision

A card charge on the till is always an attempt. The typed path writes a `sumup_attempts` row of
kind `TYPED`, holding the basket exactly as priced, after the same cross-check the hand-off runs
(F-104, F-124 criteria 2 and 8). The till then shows the figure to key and asks the person at the
reader for one of two answers:

- **Reader took it** posts the basket through the same `commitSale` a SumUp success uses, which
  runs the whole cross-check again against the database as it then stands. A basket that can no
  longer be sold marks the attempt mismatched with the reason and writes nothing, exactly as 0069
  records for the app.
- **Card declined** moves the attempt to `FAILED`, writes nothing, and brings the basket back.

`POST /api/till/sale` keeps the two cases that involve no reader: a tab charge (F-108), and a
basket with nothing to take, such as a round whose restricted lines were all refused. It refuses
any other card basket.

Everything 0069 built for a hand-off applies to a typed attempt unchanged: every transition is a
conditional write, the sweep abandons an unanswered one after `SUMUP_ATTEMPT_TIMEOUT_MINUTES`, the
till lists tonight's open attempts so another device can answer one, the close is refused while
one is open, and a booking inside an open attempt cannot be charged again. A typed attempt has no
signed key and is never answered through the SumUp return route.

On a phone with the hand-off switched on, the till shows one charge button, which opens the SumUp
app, and keying the figure by hand is a secondary link under it.

## Consequences

- Nothing on the till is recorded before the reader has answered, so a declined card leaves
  nothing to reverse. The till still has no bar-sale reversal, and now needs none.
- The typed path gains one press. The figure to key moves from the confirmation to the attempt,
  where it is read before the card goes in (F-104 criterion 6 and F-124 criterion 1 amended).
- A typed charge nobody answered blocks the close until somebody answers it or the sweep gives up
  on it, as a hand-off does.
- `sumup_attempts.kind` is a nullable column with no CHECK, because adding a CHECK would rebuild
  the table (0063). The code writes it from a closed list, and NULL reads as a hand-off, which is
  what every row written before this record is. The table keeps its name for the same reason.
- The Refunds line on the till's close stays at nought for good: no refund route exists and
  none is now needed.

## Options considered

- **Keep write-first and add "Card declined: undo"**, superseding the sale with a reversing
  entry. Rejected: a step on every decline, a reversal the Treasurer must read, and a stock and
  booking reversal still to build.
- **SumUp hand-off only, with no typed path.** Rejected: not every phone can run the SumUp app,
  and the counter laptop cannot run it at all.
- **Variance notes at the close.** Rejected: it moves the problem to the next morning, and a PAID
  booking would still be admitted at the door.
