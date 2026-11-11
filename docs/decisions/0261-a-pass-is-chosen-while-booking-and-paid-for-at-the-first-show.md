# 0261: A pass is chosen while booking and paid for at the first show it is used

- Status: Proposed
- Date: 2026-11-11
- Amends: D-124 criteria 3 and 4, D-133 criteria 2 and 4, D-125 criterion 4, 0138

## Context

A season pass could be paid for and issued only in person. Online, D-133 let a booker ask for
one, and the request reserved nothing and admitted nobody until the desk fulfilled it, so the
booker still had to book their first seat as an ordinary ticket and pay twice over in their head.
The IT Manager asked on 11 November 2026 for the pass to be chosen while booking, held against
the seat, and charged the first night its holder turns up, when the till scans the booking's QR,
with the till free to change the pass or price as it can a ticket. No money may move online (0005).

`passes.status` is a CHECK over `ACTIVE`, `CANCELLED` and `EXPIRED`. Adding a fourth value is a
rebuild of `passes`, and 0103 showed that rebuilding `passes` also drops and recreates
`pass_admissions`, an append-only table 0010 forbids rebuilding now that it holds production rows.

## Decision

1. **A pass is either paid or unpaid, as its own column.** `passes.paid` (0 or 1, default 1) is
   added in place, so no table is rebuilt and every pass sold so far reads as paid. The status
   keeps its meaning: an unpaid pass is `ACTIVE` until it is paid, cancelled or lapses. Its
   `price_paid` is the price snapshotted at choosing, owed until the reader takes it, and its
   `issued_by` stays NULL until the person taking the money is named on it.
2. **Choosing a pass while booking makes the unpaid pass and its first booking in one batch.**
   The booking page offers each pass on sale that covers the show, with its price points, signed in
   or not (0260). Choosing one writes the pass, a zero-value pass booking for the performance, its
   admission and the zero-value ledger line together; a full house refuses the whole batch, so
   no pass is left without its seat. The browser remembers the pass as 0260 says.
3. **A booking on an unpaid pass holds and releases like any unpaid booking.** It carries the
   ordinary hold, released by the ordinary sweep. More covered performances can be booked on the
   unpaid pass the same way. Paying clears every hold on the pass at once.
4. **The till takes the money when it scans the booking or the pass.** The scan names the unpaid
   pass and its price, and adds it to the basket. Before charging, the seller may switch to
   another price point or another pass type on sale, provided it covers every live booking on the
   pass. The charge marks the pass paid, re-prices it to what was charged, names the seller, posts
   the `PASS_SALE` line and clears the holds, in the sale's own batch under the expected-total
   cross-check. **Drop the pass** cancels it and its bookings instead, so tonight's seat can be sold
   as a walk-up.
5. **The cap counts paid passes only.** Unpaid passes do not hold a place under the cap; it is
   asserted at payment as D-124 criterion 4 always said, and a type at its cap is not offered.
6. **The door admits only a paid pass.** A booking or a pass QR on an unpaid pass is refused with
   the amount and "pay at the till first", as an unpaid ticket is.
7. **An unpaid pass lapses** when its type's sales window closes or its validity ends, on the
   daily pass sweep, and any booking still held on it is cancelled.
8. **Requests stop.** The booking page no longer offers "Ask for this pass"; open requests run to
   their sales window as before and the desk still fulfils them.

## Consequences

- The `passes` CHECK is unchanged, so 0010's refusal to rebuild `pass_admissions` holds.
  Every reader that means "a pass that admits" must ask `paid = 1` as well as `status = 'ACTIVE'`.
- A booker who never comes leaves an unpaid pass that admits nobody and lapses at the window's
  end; its seats were released like any no-show's.
- The plan put this as a new status value; it is a column instead, for the reason above.
