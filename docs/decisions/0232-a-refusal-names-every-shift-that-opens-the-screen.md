# 0232: A refusal names every shift that opens the screen, and who is really there to ask

- Status: Proposed
- Date: 2026-10-21

## Context

A screen any of tonight's three shifts opens (the glance, Challenge 25, Contacts and incidents) is
guarded by `requireAnyNightAuthority`, which tries each role in turn. With no shift at all, every
role refuses alike, and the guard threw whichever came first. On 21 October 2026 a volunteer with
no shift was told she needed "a confirmed door shift" by the glance, "a confirmed duty manager
shift" by Challenge 25, and "a confirmed bar shift" by the same register's write, although all
three screens open to all three shifts.

The refusal card then said "Ask tonight's duty manager." on a night nobody held the duty manager
shift, and the door's wrong-performance verdict sent volunteers to the Front of House Manager
alone, the one person on that night who could not open the door.

## Decision

- **A no-shift refusal from a multi-role guard names every role asked**, in the order a night meets
  them: "This needs a confirmed door, bar or duty manager shift on one of tonight's performances,
  or the Front of House Manager's role". A refusal more specific than no shift (hours, a claim, a
  committee role, the request itself) still wins, as before (issue 1303).
- Every no-shift refusal opens "This needs a confirmed ", which is how the hub tells it from a
  more specific one, one role or several.
- **The refusal card names who is actually there**, in the wording the bar area's work settled
  (`whoCanHelpTonight`): tonight's duty manager by first name; where nobody is on as duty manager,
  the Front of House Manager; where the rota could not be read, both.
- The door's referral is "tonight's duty manager or the Front of House Manager".

## Consequences

- A volunteer is told the same thing by every screen that opens to the same shifts.
- The door's own refusal keeps naming the duty manager who can cover it (0095); a combined refusal
  does not, since no screen that takes several roles is the door.
