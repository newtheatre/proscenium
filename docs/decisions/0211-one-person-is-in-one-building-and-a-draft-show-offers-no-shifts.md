# 0211: One person is in one building at a time, and a draft show offers no shifts

- Status: Proposed
- Date: 2026-10-21
- Amends: E-102 (what a stamp reaches), E-103 criterion 2 (what is offered), E-104 and E-107
  criteria 3 and 5 (what a claim, an assignment and an added shift admit); extends 0210

## Context

The hands-on run of 21 October 2026 confirmed one volunteer on the Seagull bar at the New Theatre
(20:30 to 00:30) and on the Small Hours door at the Studio (21:15 to 23:30) the same night. The
only rule was one shift per performance, so two performances could hold one person at two venues
at once. Rota also offered shifts on a draft show whose page was a 404, stamping a template onto
the diary reached a matinee whose curtain was already down, and moving a volunteer from the bar to
duty manager on one performance meant standing them down and assigning them again.

## Decision

**A shift whose window overlaps one the person holds at another venue is refused.** `clashesWith()`
rides the claim, the assignment and the added shift as a predicate on the write (0003), comparing
each shift's own `starts_at` and `ends_at` (0078). Two performances at one venue are not a clash: one
bar serves both, and a volunteer may cover both. A shift stamped before shifts had windows clashes
with nothing. The open list leaves such a shift out for the member, and a refusal names the other
show and venue.

**A shift on a show that is not published is neither listed nor claimable.** The stamp still puts
it on the rota, so the plan is ready when the show is announced, and the board marks the card
**Draft show**. Only a member's claim is refused; an officer may still assign.

**A stamp skips a performance whose curtain is already down.** From tonight's 04:00 on still holds
(0014), less any performance whose start plus its running time has passed.

**An assignment may move somebody off their other shift on the same performance.** `move: true`
waives the one-per-performance rule on that write only, and `moveOffStatement` reopens the other
shift in the same batch, gated on the assignment's audit row (0049), so a refused assignment moves
nobody. The candidate search marks such a person `movable`.

**The board numbers a role's rows where there is more than one**, and the template's offset fields
say their 480-minute limit.

## Consequences

- A member who holds a bar shift at one venue no longer sees an overlapping door shift elsewhere.
- An officer told "already holds a shift on … at … at the same time" stands the other one down
  first; there is no override.
- A draft show's open shifts wait for publication; nothing is restamped when it publishes.

## Options considered

- **Warn and allow.** An officer and a volunteer both accepted the clash on the night without
  noticing; a warning nobody reads is how it happened.
- **Refuse any overlap, at one venue too.** A volunteer on the bar for two performances in one
  house is one job, not two.
- **Stop stamping draft shows.** Publishing would then need a stamp of its own, and the plan an
  officer made beforehand would be lost.
