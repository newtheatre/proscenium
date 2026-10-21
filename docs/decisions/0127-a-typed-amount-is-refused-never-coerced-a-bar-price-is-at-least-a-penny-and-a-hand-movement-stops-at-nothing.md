# 0127: A typed amount is refused, never coerced; a bar price is at least a penny; a hand movement stops at nothing

- Status: Proposed
- Date: 2026-10-14
- Amends: 0032 (the component for a number and for money)

## Context

0032 made every number a `UInputNumber`. That component parses what is typed with the browser's
number format for `en-GB`, which reads a comma as a thousands separator, and then clamps the value
to its `min` and `max` and snaps it to its `step` when the field loses focus. The hands-on review
of 13 October 2026 found what that does to money and stock on the bar:

- "2,50" as a bar price listed the product at £250.00, live on the till at once; "2,00" in the
  price dialog became £200.00.
- 1.555 became £1.55. A price of -1.50, or "£2", was dropped, and the product was created hidden
  with no price. A delivery cost of -1 was dropped.
- An opening quantity of -5 became 1, and 2.5 became 3.
- A discount of -10% went live at 1%, and 12.5% at 13%. The hint said "1 to 100" while the
  configured cap was 50.
- A price of 0 went live at £0.00, which gives a drink away without the comp request and approval
  F-110 requires.
- A write-off of 1000 against 32 on hand was accepted, leaving -968; the sale trigger then refused
  to sell the item that was on the shelf.

The server's schemas already refused most of these figures. They never saw them: the field had
already turned them into different, valid ones.

## Decision

**Money is typed into `PoundsField`, a text field read by `penceFromTyped`.** It takes pounds
and pence with a full stop, an optional pound sign and thousands commas, and one figure of pence
(1.5 is £1.50). Anything else, a decimal comma, a third figure of pence, a minus, is held as
`NaN`, so the form's schema refuses it with the message "Type pounds and pence with a full stop,
such as 2.50". Nothing is rounded, clamped or dropped.

**A quantity or a percentage a number field would clamp or round is typed into `WholeField`**,
read by `wholeFromTyped`: digits only, `NaN` otherwise, refused the same way ("Type a whole number,
such as 12"). A screen with no schema of its own (the guided set-up) names the first unreadable
figure by its label (`firstUnreadable`) and keeps its button disabled.

**A bar price, a variant's or a category's, is at least 1p.** A drink given away is a comp, asked
for and approved at the till (F-110); a £0.00 price would skip both. The database's own
`CHECK (price_pence >= 0)` is unchanged; the schema the routes and screens share refuses zero.

**The discount form says the configured cap**, which the list route now returns beside its page
(`maxPercent`), rather than a fixed "1 to 100". The cap is still enforced only at the write path
(0012), and its refusal still reaches the screen in the route's own words.

**A movement entered by hand never takes on-hand below nothing.** Its `INSERT` carries
`staysInStock` (`server/utils/bar.ts`) on its own predicate, so a sale racing it cannot slip
between a read and the write (0003); the refusal names what is on hand. The database still lets
wastage take the sum negative, as F-114 tests, because the guard belongs to the hand-entry path,
not to every writer. Stock already negative is corrected by a delivery or a stocktake.

## Consequences

- 0032's "a number is `UInputNumber`" stands for a number a clamp cannot change the meaning of,
  such as a sort order. Money and the quantities above are text fields that refuse.
- `UInputNumber`'s steppers are gone from those fields; the keyboard on a phone is the decimal or
  numeric pad.
- Other areas with money fields (the box office's ticket prices, the till's close) can adopt the
  same component; this record does not move them.
