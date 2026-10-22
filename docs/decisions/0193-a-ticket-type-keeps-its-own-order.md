# 0193: A ticket type keeps its own order

- Status: Proposed
- Date: 2026-10-21
- Amends: how ticket types are listed (D-119 criterion 1)

## Context

Every screen that lists ticket types sorted them by price, then name: a show's prices, the
publish sheet, the desk, the till and the public booking page. Members only at £5 came first
and Full price at £8 last, so the cheapest restricted type headed the list a guest saw. Show
categories and content warnings already carry an Order an officer sets; ticket types did not.

## Decision

**`ticket_types.sort` is an integer, nought or more, defaulting to 0, set on the ticket type's
form.** Every list orders by it, then by price, then by name, so a house that never sets it sees
exactly the order it had.

- The column is added by `ALTER TABLE ... ADD`, never a rebuild: `ticket_types` is referenced by
  every sold ticket (0037).
- The console list sorts by Order by default, and shows it.
- A change of order is audited with the rest of the type's edit.
- An edit that leaves the order out keeps it, so a form or caller that predates the column never
  resets a type to 0.

## Consequences

- An officer can put Full price first without renaming or repricing anything.
- The pass admission type keeps 0, which no screen lists anyway.
- "From £x" on a show card still quotes the cheapest price a guest can book, whatever the order.
