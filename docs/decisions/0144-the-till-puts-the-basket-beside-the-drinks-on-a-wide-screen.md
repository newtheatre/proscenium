# 0144: The till puts the basket beside the drinks on a wide screen

- Status: Proposed
- Date: 2026-10-21
- Amends: docs/design-language.md rule 4 (every show-night screen is a `max-w-md` column) for the till

## Context

Every show-night screen is a capped column a phone wide, at any window width (issue 1520). On a
tablet at the bar the till was a narrow strip down the middle of the screen, and the basket sat
under the whole drinks grid, or in a sheet off the pinned bar, so checking a round meant scrolling
or opening something.

## Decision

**The till asks for a wider column, and splits it by its own width.** The page declares
`nightWide: true` in its page meta. `NightScreen` and the `tonight` layout read it and cap the
column at `max-w-5xl` rather than `max-w-md`; it is still a capped column, so the rule that a screen
keys its shape to its container, never to the window, still holds.

- The screen is a named container (`@container/night`). From `@2xl/night` (42rem) up, the Bar and
  Tickets panes take the left and the basket a 20rem column on the right, held in view as the grid
  scrolls. With nothing in it the column says the basket is empty.
- The pinned actions (Charge, the SumUp hand-off) narrow to the same 20rem under the basket, so they
  stay at the bottom of the screen and under the thumb (K-102 criterion 2).
- The basket's own open button in the pinned row is hidden there, since the basket is already on
  screen. The sheet remains for a phone.
- The drinks grid is its own container too: three tiles across from `@lg`, two below.

On a phone nothing changes: the column never reaches `@2xl`, so the till is the screen it was.

## Consequences

- A portrait tablet (768 px) and anything wider sees drinks and basket side by side.
- Only the till asks for this. Another show-night screen that wants it declares `nightWide` and
  lays itself out by container, and this record is where that is argued.
