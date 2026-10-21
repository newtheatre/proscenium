# 0143: Product categories are dragged into their order on the till

- Status: Proposed
- Date: 2026-10-21
- Amends: how a category's place on the till is set (F-103 criterion 6)

## Context

A product category carried a sort number, typed on its form and shown in the list as "Order on the
till". The numbers started at 0, so the first category read as "0 on the till"; two categories
could share a number; and moving one category up meant renumbering the others by hand.

## Decision

**The order is set by dragging, on the categories screen, and each drop is one move.** A card
headed "Order on the till" lists every category in its till order; a row drags to its new place, and
each row also has up and down arrows, so a keyboard or a phone makes the same move. Positions shown
are counted from 1.

- A move is `POST /api/admin/bar/categories/:id/move` with the position wanted. One `UPDATE` ranks
  every category by its current sort (then its name), takes the moving one out, and writes
  positions 0 to n-1 back in a single statement, so a move can never leave two categories sharing
  a place, and it binds the same four parameters however many categories there are (0006). It is
  audited as `bar.category.moved` with the position it moved to.
- A new category goes last; an edit keeps its place. The form no longer asks for a number. An API
  caller that still sends `sort` is honoured.
- A failed move puts the list back as it was and says why.

## Consequences

- Nobody types a number to order the till, and the screen never shows a 0-based place.
- The till's order is unchanged by this decision: it still reads `sort`, now always 0 to n-1.
