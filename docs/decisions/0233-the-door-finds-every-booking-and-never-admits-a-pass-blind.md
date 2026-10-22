# 0233: The door finds every booking, and never admits a pass blind

- Status: Proposed
- Date: 2026-10-21

## Context

The 21 October 2026 process map drove the door for an evening and found four answers that were
wrong for the person in front of it:

- A pass reference typed into the field admitted the pass at once, showing "Party of 1" and no
  name, although the docs and D-126 say a pass is never admitted blind. Only the camera and a name
  search showed the pass's card first.
- A pass already admitted tonight still offered **Admit one**, and pressing it gave the refusal.
  Its "already in" line was also worded differently from a ticket's ("This pass was already
  admitted tonight, at Wednesday, 21 October 2026 at 21:07" against "Already admitted at 21:02").
- For up to ten minutes after an unpaid hold's release time the door said UNPAID. The task that
  releases holds runs every ten minutes; the hold expires on the minute.
- A lapsed or cancelled booking was LAPSED or CANCELLED by reference but NOT FOUND by name, which
  tells the volunteer to check the spelling.

## Decision

- **A typed pass reference lists the pass's card**, exactly as a scanned pass QR does. The ticket
  scan is still tried first, since both alphabets are the same.
- **The pass card refuses tonight's own admission in the scan's words**: already admitted ("Already
  admitted at 21:07", the ticket's wording) or tonight's admission cancelled. Admit one shows only
  where the scan would admit.
- **A hold is unpaid until it is released, at the door as everywhere else.** The map's finding
  is not taken up: until the release task runs, the desk still collects the hold and capacity still
  counts its seats. A door that called it LAPSED on the clock would send the booker to buy a new
  ticket that capacity, counting their own hold, can refuse on a sold-out night, and the sweep would
  then give the seats to the waiting list. UNPAID sends them to the bar, where the hold is paid.
- **The name lookup lists lapsed and cancelled bookings for the performance**, saying so, with no
  Admit. An erased booker is still found by reference only (0011).
- The ticket scan's response carries the booker's first name only, which is all door mode shows.

## Consequences

- A volunteer never admits a pass without seeing whose it is, and never presses a button that refuses.
- A hold past its release time reads UNPAID at the door until the sweep, and LAPSED after it. Making
  the release itself immediate is a change to the release task, outside the door.
- Not changed: mapping a typed `0` to `O`. The reference alphabet has neither `0` nor `O` (nor `1`
  or `I`), so there is no letter a `0` could have meant; the NOT FOUND line already says so.
