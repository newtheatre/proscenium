# 0194: The publish sheet names every blocker

- Status: Proposed
- Date: 2026-10-22
- Amends: the publish sheet "gates nothing" (D-132 criterion 7)

## Context

The publish route already refuses a show whose category or season has been retired (D-131
criterion 5), but it named only the first it found, and only after **Put on sale** was pressed.
The sheet read the retired category and season back with no warning. An officer fixed one, tried
again, and met the second.

## Decision

**`publishBlockers()` in `shared/utils/programme.ts` is the one list of reasons a show cannot
publish, and both ends read it.**

- The route refuses with every reason at once, joined into one message.
- The sheet lists the same reasons at the top and disables **Put on sale** while any remains.
- Everything else the sheet and the checklist report still gates nothing: a missing poster,
  unstamped shifts or unassessed warnings are the committee's call (D-121).
- The checklist gains two lines it already had the facts for: content warnings assessed, and
  shifts stamped on every uncancelled performance at a venue we run.

## Consequences

- The sheet can no longer offer a button the route will refuse.
- A new publish refusal goes in `publishBlockers()`, or the sheet and the route drift apart.
