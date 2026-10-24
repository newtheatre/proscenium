# 0250: The rota board staffs a bar opening, and holds every claim waiting

- Status: Proposed
- Date: 2026-10-24
- Amends: E-130 criterion 8 (the board only showed an opening); E-105 criterion 2 (the waiting
  filter read performance shifts only). Extends 0077 and 0215.

## Context

Matt's admin review of 24 October 2026 timed the rota's commonest jobs against the code. Three
findings were about bar openings:

- **Nobody could put a person on an opening's slot.** `POST /api/rota/openings/shifts/[id]/assign`
  has existed since E-130, but neither screen offered it. Bar openings had Confirm, Decline, Stand
  down and Remove; the board had only a link to Bar openings. A slot filled only when a member
  claimed it.
- **The waiting filter left opening claims out.** With auto-confirm off, a claim on an opening's
  slot did not count in **Waiting for confirmation**, and the filter did not list it. It was
  answered only by somebody who opened Bar openings and looked.
- **Staffing a night meant two screens.** A performance and the bar opening after it on the same
  evening were filled on different pages, with the board able to act on only one of them.

E-130 criterion 8 made the board read-only for an opening so that one screen owned an opening's
staffing. That was the right call while the board was a list of cards. It now costs a screen change
for every slot, and the officer planning a fortnight works from the board.

## Decision

1. **The board acts on an opening's slots as it acts on a performance's shifts.** An open or
   declined slot offers **Assign**, a claimed one **Confirm** and **Decline**, and a confirmed one
   **Unconfirm**. Each calls the opening's own route, which keeps its own gate (bar training, and
   one slot per person per opening), its own audit action and its own emails.
2. **Bar openings offers Assign too**, for an open or declined slot, beside the actions it already
   had. Adding and removing slots and cancelling the opening stay there, because they change the
   opening rather than who works it.
3. **An opening slot's candidates are searched the way a shift's are.**
   `GET /api/rota/openings/shifts/[id]/candidates?search=` is scoped to `rota.write`, matches name
   or address, and gives the reason a person is locked: no bar training, or already on another slot
   of this opening. It reads one statement with a fixed number of parameters (0006).
4. **The waiting filter is every claim from tonight's show night on, of either kind.** The count
   adds the claimed slots on planned openings starting from tonight, and the filter lists those
   openings beside the performances, whole, so a claim is read beside the slots already filled.

## Consequences

- An officer can fill a hire night's bar without waiting for a claim.
- A clash between an opening slot and a performance shift at another venue is still not refused for
  an opening, as before. The candidate list does not show one either, so the list never locks
  somebody the route would let through.
- Bar openings remains the screen for an opening's own life: planning, slot count and
  cancelling. Folding that into the board as well is the next slice of the rota planner and gets its
  own record.

## Options considered

- **Assign on Bar openings only.** Fixes the missing action, but leaves the officer moving between
  screens for every night with both a show and an opening.
- **One route for both kinds of slot.** The two tables have different gates, audit actions and
  constraints (0077); one route would branch on every line. The screen branches once instead.
