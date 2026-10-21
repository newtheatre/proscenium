# 0138: A pass sold on the till names its buyer by email, and moves tonight's one-seat booking onto it

- Status: Proposed
- Date: 2026-10-21
- Amends: D-124 criterion 1 (where a pass may be sold); specifies D-134

## Context

A season pass could only be sold at Box office → Desk passes, which needs `ticketing.write`. The
first show of a season is where people decide to buy one, and on a show night the person taking
money is on the till under tonight's bar shift, not a box office officer. The IT Manager decided on
21 October 2026 that the till can sell passes, that using or asking for a pass always needs an
account, and that a pass bought at the door should take over tonight's booking so nobody pays twice.

The desk picks a buyer by searching every account by name or email. Giving that search to whoever
holds a bar shift would show a volunteer the names and addresses of every account in the building.

## Decision

**The till sells a pass inside the ordinary basket, and names the buyer only by the email of their
own account.** The basket carries `pass: { passTypeId, passTypePriceId, email }`; the sale and the
SumUp hand-off cross-check it like any other line, and the pass is issued in the sale's own batch
with a `PASS_SALE` ledger line. An email with no confirmed account that can sign in (a guest record
from a booking is not one) is refused before the reader is asked, telling the seller the buyer
needs to create one. The till never lists accounts.

**The cap is asserted, not just guarded.** The pass row is inserted gated on the sale's entry, and
0035's assertion re-inserts the pass's own id when the type is over its cap, so the whole sale rolls
back rather than posting money for a pass that was never issued. After a SumUp charge, that refusal
is a mismatch for a person to resolve, the same as any other basket refused at the answer.

**Tonight's booking moves onto the pass only when it is unpaid, for one seat, and covered.** It is
cancelled with `exchanged_to_reservation_id` pointing at a new zero-value pass booking, in one
batch closed by 0035's assertion, so either both halves land or neither does. Cancelling first
frees the seat the pass then takes, so a full house still moves. A booking for a party is left as it
is, because a pass admits one person; the receipt says so. The move runs after the sale's batch,
since it needs the pass to exist; if it loses a race, the pass stays sold and the receipt tells the
seller to cancel the booking at the desk and scan the pass at the door.

## Consequences

- A volunteer on the till can sell a pass without being able to look anybody up.
- A buyer without an account has to make one at the counter, which takes a minute and needs their
  email confirmed. That friction is the decided price of "a pass always needs an account".
- The swap happening after the sale means a window where the pass is sold and the booking not yet
  moved. It is short and the failure is visible on the receipt, which was judged better than
  folding a capacity-checked redemption into the sale's batch and its SumUp answer.
