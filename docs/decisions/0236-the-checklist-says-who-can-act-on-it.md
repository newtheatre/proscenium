# 0236: The checklist says who can act on it

- Status: Proposed
- Date: 2026-10-22

## Context

The 21 October process map found four gaps in the close-night checklist. Editing an item could
change its phase and how it ticks, but the audit entry recorded only its label and whether it was
required. **Make the exception** was pressable with no reason and only then said one was needed.
The hub's "Pre-show checklist incomplete" warning was read only by the duty manager, so with the
slot unfilled nobody saw required pre-show items open at house open. And "The till is closed"
ticked itself on a house with no bar, while at a house with a bar but nobody on it the line still
said "whoever is on the bar closes it".

## Decision

- `checklist-item.updated` records every field the edit writes: phase, label, order, required
  and how it ticks.
- **Make the exception** is unavailable until the reason passes the same form the route checks.
- Each performance tonight carries whether a confirmed duty manager shift is held. Where none is,
  every other shift's hub says nobody is working the checklist and to tell the Front of House
  Manager. The checklist itself stays the duty manager's to read; this is one fact about the rota.
- A venue has a bar when its rota template has a bar row or a till was opened there tonight.
  Without one, the till line shows only for what an earlier night left open. With one but no
  confirmed bar shift tonight, the line says the Front of House Manager closes the till.

## Consequences

- A venue that runs a bar without a bar row in its template, and has not opened the till yet, does
  not show the line until the till opens. Adding the bar row fixes that.
- The new hub warning cannot tell whether the Front of House Manager has ticked the list by
  officer role; it says nobody on the rota can, which is true either way.
