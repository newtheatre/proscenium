# 0141: Close till is a labelled button at the top of the till

- Status: Proposed
- Date: 2026-10-21
- Amends: how the till met K-102 criterion 2 for Close till

## Context

K-102 criterion 2 keeps the bottom third of a show-night screen for the actions taken many times a
night: on the till, Charge and the SumUp hand-off. Close till is taken once, at the end, so the till
put it in an overflow menu (a "more" button with three dots) at the top of the screen. On most
nights that menu held Close till alone; Change bar joins it only on a phone that remembered its
bar.

Walking the end of a night on 21 October 2026, Close till could not be found without already
knowing it was there: three dots read as "options", not as the one thing left to do, and the menu
opened onto a single item.

## Decision

**Close till is a labelled outline button beside "Open since", at the top of the till.** It is not
in the thumb zone, so criterion 2 holds: nothing in the pinned bottom row changes. Change bar, where
it is offered, is a labelled button beside it. There is no overflow menu.

## Consequences

- The end-of-night action names itself on every till screen, at a 48 by 48 tap.
- The top row is a little wider on a phone. Two short labelled buttons fit beside "Open since" at
  390 px; a third action would need this decision revisited rather than a menu brought back.
- The till's end-to-end cases, the accessibility case and the operator documentation press the
  button directly.
