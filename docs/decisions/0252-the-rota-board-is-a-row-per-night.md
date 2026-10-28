# 0252: The rota board is a row per night, and plans a bar opening from its night

- Status: Proposed
- Date: 2026-10-25
- Amends: E-107 criterion 7 (the board as a list of cards); E-130 criterion 2 (an opening planned
  only on Bar openings). Extends 0250.

## Context

After 0250 the board staffs performances and bar openings alike, but it still laid every card in one
grid, three to a row, so an evening's performance and the bar opening after it could land on
different rows with the next night's cards between them. Planning an opening on a free evening
meant leaving the board for Bar openings, pressing Plan, and typing the date the officer had just
been looking at.

## Decision

1. **The board groups its cards by show night.** Each night is a heading with its date and its
   confirmed count across every card that night, then that night's performances and openings in
   the order they start. A card past midnight stays on the night it started (0014).
2. **Each night offers Plan a bar opening.** It opens the same dialogue Bar openings uses, with
   the evening already set to that night. The venue is preset where only one bar is staffed, and
   18:00 to 23:00 is the default, so a usual opening needs only its label. The opening joins the
   night's row when it is planned.
3. **One dialogue.** `PlanOpeningModal` is the only planning form, used by both screens, so the
   overlap warning (0215) and the clock-change handling (0014) live once.
4. **Bar openings stays** for an opening's slot count, cancelling and history. The sidebar is left
   as it is here; folding the two entries into one is the console-counts change's to make.

## Consequences

- A night reads whole: what is on, what is open and how much is confirmed.
- Planning a hire-night bar takes one press on its night, the label and Plan.
- A night with nothing on it has no row, so there is nothing to plan from on a dark evening; the
  officer plans that from Bar openings, as before.

## Options considered

- **A fixed calendar, every night in the window shown, empty or not.** Lets a dark night be
  planned from the board, but a fortnight of mostly empty rows hides the nights that need work.
- **A grid of nights by role.** Dense, but an opening's slots and a performance's shifts are not
  the same rows, and it would need a second layout on a phone.
