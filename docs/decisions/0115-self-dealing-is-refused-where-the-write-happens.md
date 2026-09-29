# 0115: Self-dealing is refused where the write happens

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29
- Amends: 0102 (which bookings a refunder may refund)

## Context

The role audit of September 2026 (issue 1211, section 4 and R1) put the whole bar in the Front of
House Manager's grant (0110). One grant now sells, sets prices, runs the desk, refunds paid tickets
on any day (0102), voids tab charges and overrides the tab cap. Comps already need a second person:
F-110 criterion 1 and D-117 refuse the requester's own approval, on the claim itself. Four other acts
had no such check. An officer could void a charge on their own tab, wave a charge to their own tab
past the cap, refund a ticket on their own booking, and, holding `access.verify`, verify their own
access declaration, which carries up to two companion seats priced at zero (D-127 criterion 1,
D-128 criterion 3). The IT Manager holds every permission (0113), so the same was true of them.

Approving a desk comp gives a seat away on any day. It is decided by tonight's duty manager or an IT
Manager, and asked nothing more of them than the session they signed in with, however long ago
that was. A signed audit entry, a smaller act, already asks for a fresh credential (0028, A-128).

## Decision

**Nobody does these four things to their own account, and the refusal is carried by the write.**
Each rule is a predicate on the statement that writes, not a read-then-check in a route (0003), so
every caller of the utility inherits it and a race or an account merge cannot slip between a read
and the write. A read beforehand, or after a write that matched nothing, only chooses the words.

- **A tab void** (F-109 criterion 4): the void entry's own guard refuses when the charge's holder is
  the person voiding it (`voidTabCharge`).
- **A tab-cap override** (F-108 criterion 4): the cap guard rides every tab charge and lifts only for
  an override by someone other than the holder (`tabCapGuard`). The till refuses the override on the
  seller's own tab before anything is written, naming who can override instead.
- **An access decision** (D-127 criterion 2): verifying and declining both carry `user_id <> officer`
  in `decisionPredicate`, on the `UPDATE` itself.
- **A paid refund** (D-116 criterion 7): the ticket's claim refuses when the booking's account is the
  refunder's own. Own means the booking is in the refunder's name. Taking the money for somebody
  else's booking at the desk is the box office's everyday work and is not refused.

Every refusal says who does it instead, in the words of the post, and none has an exemption: an IT
Manager is refused their own the same way, and turning `REFUND_PAID_REQUIRES_MANAGER` off does not
lift the refund rule.

**Approving a desk comp needs a fresh credential.** The approve route asks for a session proven
within `REAUTH_WINDOW_MINUTES` (`requireFreshSession`, A-128), after the approver's authority is
settled and before the claim. It does not also require an authenticator on the account, as a signed
audit entry does: the approver is often a duty manager on a shift, which carries no second-factor
gate (0044), and a Google account re-asserts through Google. The comp queue opens the
re-authentication modal on the refusal and the approver taps again.

## Consequences

- The Front of House Manager's own tab void and own booking refund go to an IT Manager, or another
  holder of the role. An override on their own tab goes to tonight's duty manager, if that is
  somebody else. An IT Manager's own goes to the other IT Manager, whom A-120 keeps.
- The Secretary and Welfare Officer's own declaration is decided by an IT Manager.
- Every tab charge now carries the cap guard, so a tab sale reads back whether its entry landed
  every time, not only when the cap was not overridden: one extra read per tab sale.
- An approver whose sign-in is older than the window re-asserts before a desk comp is approved.
  Declining gives nothing away and is unchanged.
- F-108 criterion 4, F-109 criterion 4, F-110 criterion 1, D-117 criterion 6, D-116 criterion 7 and
  D-127 criterion 2 say so.
- Collusion is not caught: an officer may still void a friend's charge or refund a friend's booking.
  The ledger and the trail name who pressed it, and a second person's sign-off on every refund is
  the request queue 0102 deferred to V2.

## Options considered

- **Compare ids in each route.** Rejected: the rule would live in one caller, and a second route to
  the same write (the till, a screen added later) would skip it. It is also the read-then-check 0003
  refuses for any contended rule.
- **Allow it and flag it on the trail or the night report.** Rejected: a flag is read after the money
  has moved, by the committee, when the point of the rule is that the second person is asked first.
- **Own booking means one the refunder took the money for.** Rejected: the Front of House Manager
  sells and refunds nearly every desk booking, so the rule would stop the box office rather than
  the conflict of interest.
- **Require an authenticator for a desk comp, as a signed audit entry does.** Rejected: it would
  refuse a duty manager with no authenticator in the middle of a show night, the enrolment problem
  0044 describes. A fresh credential proves the person at the screen without a new enrolment.
