# 0102: Paid refunds are approved by the Front of House Manager's own role, on any day

- Status: Accepted (IT Manager, 26 September 2026)
- Date: 2026-09-26
- Amends: 0090 (which permissions the Front of House Manager's role holds), and with it the refund
  line 0044 was amended to carry

## Context

D-116 criterion 2 asks a paid refund to be approved by a manager: the refund route needs
`ticketing.write` to reach it, then either `money.refund` or tonight's confirmed duty manager for
the booking's performance. After 0090 only the Front of House Manager and the IT Manager hold
`ticketing.write`, and only the IT Manager of those holds `money.refund`. The Front of House
Manager therefore approved a refund only through 0044's bypass, which answers for tonight's
performance and nothing else: a booking for next week was refused at the last press. The Manager
holds `money.refund` but not the desk, so was refused at the route. Nobody but the IT Manager could
refund a paid ticket for any night but tonight, while booking opens on 12 October.

The duty-manager branch does no work either. The desk needs `ticketing.write`, which no shift
gives, so a volunteer on a duty manager shift cannot reach the route at all; the only people it
ever answered were Front of House Managers standing in for a duty manager on the night. The review
of 25 September 2026 (issue 1325) found the refund is the box office's job, done in person at the
desk on whichever day the booker asks.

## Decision

**`FOH_MANAGER` holds `money.refund`.** The Front of House Manager approves a paid refund for any
performance, on any day, and is recorded as the approver on the ledger entry and the audit row, as
every `money.refund` holder already was. It is a standing administrative permission of a committee
post that already handles the box office's money, not an operational one: it opens no show-night
screen, and it follows the role's expiry at the committee year end (0009).

**The duty-manager branch goes.** `requireRefundApproval()` asks one question: does the caller hold
`money.refund`? Refund approval no longer reads 0044's bypass, so a refund writes no
`night.officer-bypass` row and nothing about it is flagged on the night report. Tonight's duty
manager plays no part in a refund; someone asking for their money back on a show night is sent to
the box office with their booking reference.

**`REFUND_PAID_REQUIRES_MANAGER` stays, and its default stays on.** With the key off, anyone who
reaches the desk refunds; with it on, only a `money.refund` holder does. Today those are the same
people, so the key changes nothing until a role holds the desk without `money.refund`.

## Consequences

- D-116 criterion 2 is trimmed: the role line names the Front of House Manager and the IT Manager,
  and the duty manager leaves it. The story's role becomes the box office officer's.
- The Front of House Manager's grant now sets prices and refunds paid tickets. 0090 accepted
  price-setting and tonight's refund approval in one grant; this widens the refund half from
  tonight to any day. The second factor the role already needs (A-112) guards it, and every refund
  is a ledger line and an audit row naming who pressed it.
- The Manager still holds `money.refund` without the desk, so the Manager still cannot refund. That
  is unchanged and left alone: the Manager is not the box office.
- The blast-radius preview for `REFUND_PAID_REQUIRES_MANAGER` reads the permission map, so it now
  counts nobody. Retiring the key, and its line on the booking policy page, is its own change.
- A duty manager who is not the Front of House Manager never could refund; the change removes a
  branch that answered nobody else, so no volunteer loses anything.

## Options considered

- **Switch `REFUND_PAID_REQUIRES_MANAGER` off.** Every desk holder refunds without approval. Today
  that is the same people, but it removes the rule rather than naming who holds it, and the next
  role given the desk would refund unapproved.
- **A request queue: the desk asks, an approver approves later.** A second person's sign-off on
  every refund is the stronger control, but it is a new screen and a new state for a desk that
  refunds in person while the booker waits. Deferred to V2.
- **Keep the status quo.** Only the IT Manager could refund anything but tonight's bookings, from
  the day booking opens.
