# 0140: A manager is asked in their own terms, and never for what the system already knows

- Status: Proposed
- Date: 2026-10-21

## Context

A close review of front of house and bar management on 21 October 2026 walked every rota, stock,
product and till screen as the Front of House Manager would. Three screens asked for something the
system could work out, or answered in a unit the manager does not think in:

- **Add a shift** asked for a "Slot: the role's ordinal on this performance". The dialogue opened on
  1, and a performance stamped with two door shifts already holds Door 1 and Door 2, so the obvious
  press was refused with "That slot on this performance is already on the rota". Bar openings
  already number an added slot themselves (E-130 criterion 7).
- **Shift templates** offered "Starts before doors" and "Ends after the show" with a placeholder of
  "Default" and the words "Blank takes the house default", without saying what the default is. The
  number lives on Settings, a screen the Front of House Manager cannot open.
- **The tonight stocktake** told the counter the Bar Manager checks the count, a role retired by
  0113.
- **Record a delivery** of a measured item asked for millilitres, so a delivery of six 700 ml
  bottles meant typing 4200. Stock already knows each item's container size.
- **The order list** said how far below par an item was, in millilitres, and left the manager to
  turn 2250 ml of wine into bottles.
- **On hand** showed 5175 ml of gin, where a count of the shelf finds seven bottles and an open one.
- **Plan a bar opening** opened with no venue chosen when the theatre has only one.

## Decision

**What the system can number, it numbers.** `slot` on `POST /api/admin/rota/shifts/add` is
optional, and the screen no longer asks for it. With none named, `addShiftStatement` takes one past
the highest slot of that role on the performance, inside its own `INSERT ... SELECT`, so the
bound-parameter count is fixed (0006). `shifts_performance_slot` still refuses two writes that pick
the same number at once. The audit row reads the number back from the inserted row, as an
opening's added slot does, so the trail still says which shift was added. A caller that names a
slot is honoured as before.

**A blank that stands for a number shows the number.** `GET /api/admin/rota/templates` returns
`houseDefaults`, the two configured offsets, and the template form shows each one as the blank
field's placeholder and in its description ("Leave it blank for the house default, 30 minutes").
Nothing stored changes: a blank still means the venue follows the house default (0078).

**A figure is asked for and shown in what the manager counts.** For an item measured in
millilitres with a container size, a delivery asks for full containers and stores the product in
ml, saying the total beside the field; anything else is asked for as before. The order list adds
"To order", the shortfall rounded up to whole containers ("2 × 750 ml"), to the screen and the CSV.
On hand adds the shelf reading ("7 full and 275 ml open"). Movements of a whole number of
containers read the same way. The stored unit stays ml, so nothing about counting or reports moves.

**A choice of one is already made.** Plan a bar opening starts on the venue when only one exists.

**Screens name the posts that do the work today** (0113): the stocktake names the Front of House
Manager.

## Consequences

- Adding a shift is two choices, role and optionally a person, and cannot be refused for a number
  the manager never chose. Two officers adding the same role to the same performance at the same
  moment still collide, and the second is told so.
- A template's blank fields read true to whoever opens them, and a change to the house default on
  Settings shows on the form the next time it loads.
- A write-off keeps offering the measures the bar pours, and an adjustment stays in ml, because
  neither is usually a whole container.
- The rule stands for the screens that follow: a question the system can answer is not put to the
  person, and a figure is shown in the unit the person counts in.
