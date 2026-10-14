# 0124: Selling a performance above its venue is confirmed, not typed

- Status: Proposed
- Date: 2026-10-14
- Amends: D-105 (what a capacity override may be)

## Context

A performance sells against its own `capacity_override` or, when that is null, its venue's
`capacity` (0043, `effectiveCapacity()`). The override was checked only for being a whole number
of nought or more, so the hands-on test of 13 October 2026 set 10,000 on a 120-seat house and was
told only that it had saved. The desk, the door and the public listing then sold against 10,000.
D-105 criterion 4 keeps deliberate oversell, done only by raising capacity, so a figure above the
venue cannot simply be forbidden; it was simply never asked about.

## Decision

- **A capacity override above its venue's capacity is refused unless it is confirmed.**
  `capacityOverrideRefusal()` in `shared/utils/programme.ts` refuses it on
  `POST /api/admin/shows/[id]/performances` and `PUT /api/admin/performances/[id]` with a 400
  naming the venue, quoting both figures and saying how to confirm. The request's
  `aboveVenueCapacity: true` is that confirmation, and the audit row already records the old and
  new capacity, as D-105 criterion 4 asks of every capacity change.
- **A venue with no capacity caps nothing**, as it always has: an uncapped venue is an uncapped
  house.
- **The form names the venue's figure beside the field and does not clamp what is typed**: a
  number silently changed is the same fault as a number silently accepted. Typing a figure above
  the venue's offers "Sell above the venue's capacity".

## Consequences

- A performance cannot be oversold by a typing slip, and the refusal says what to do instead.
- An existing override already above its venue is not rewritten; saving the performance again asks
  for the confirmation once more, which is the moment somebody should look at it.
