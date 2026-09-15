# 0078: A shift carries its own start and end, and authority holds inside that window

- Status: Accepted
- Date: 2026-09-15

## Context

A shift knows which performance it belongs to and nothing about when it is worked. Everything the
system says about a shift's time is read off the performance: the rota lists it by curtain, the
day-before reminder is timed from curtain, and authority holds for the whole show night, 04:00 to
04:00 (0014, E-110). That is generous by about fourteen hours. A confirmed bar shift for an 19:30
curtain opens the till at 05:00 the same morning and still opens it at 03:00 the next, which is
not what a volunteer agreed to and not what the rota means.

It also leaves the system unable to answer a question the bar asks every matinee day. Two
performances at one venue are two rotas and two houses, but one bar session (E-127 criterion 5),
and a sale at 14:30 and a sale at 20:30 belong to different performances. Today the sale route
resolves the performance only when the caller's authority covers exactly one, and otherwise
leaves it null. Nothing in the data says which house a 14:30 sale was for, because nothing in the
data says when the shift covering it was worked. Times on the shift answer both questions at once,
and a venue's own template is where the theatre's habits about them live: a bar opens earlier than
the door and closes later than the curtain falls.

## Decision

**A shift carries `starts_at` and `ends_at`, stamped when the shift is stamped.** Both are
nullable integer columns added by `ADD COLUMN`, which is not a rebuild. They are computed at stamp
time from the performance and the venue's template, so editing a template afterwards changes
nothing already stamped, which is the pattern `checklist_stamps` already follows (E-101
criterion 1).

**The default window is configuration.** A shift starts `SHIFT_START_BEFORE_DOORS_MINUTES` before
the performance's `doors_at`, falling back to `starts_at` where the house records no doors time.
It ends `SHIFT_END_AFTER_CURTAIN_DOWN_MINUTES` after the performance ends, which is
`starts_at + duration_minutes + interval_count * interval_minutes`, falling back to `starts_at`
where the running time is not recorded. All three keys ship at 30 minutes as the proposed values
in `docs/workshops.md`.

**The venue's template overrides per role.** `shift_templates` gains nullable
`starts_before_doors_minutes` and `ends_after_end_minutes`. Null means the configured default,
which is the honest starting state for every existing row: a venue that has never been asked the
question is not claiming an answer.

**One pure function computes the window, and one statement stamps it.** `shiftWindow()` in
`shared/utils/rota-times.ts` takes the performance's times and the offsets and returns the two
instants; nothing else derives them a second way. `stampStatement` computes them in SQL with the
configured defaults bound once for the whole statement, however many slots the template holds
(0006), and `backfillShiftTimesStatement` fills the rows stamped before this record, idempotently,
by writing only where the columns are null.

**Authority holds inside the window, with a grace period.** This amends E-111 criterion 1. A
confirmed shift opens its tool between `starts_at - SHIFT_AUTHORITY_GRACE_MINUTES` and
`ends_at + SHIFT_AUTHORITY_GRACE_MINUTES`, for every role, not the bar alone. The refusal names
the window in London time, so a volunteer arriving at 17:00 for an 18:30 door is told when their
shift opens rather than told they have no shift. A shift with null times, which after the backfill
means a performance that recorded neither doors nor a running time, is not bounded by this check:
an unknown window refuses nobody.

**The 04:00 night still bounds the lookup.** The window narrows authority; it never widens it. A
shift whose computed end falls after 04:00 is still gone at 04:00, because `showNightBounds` is
what the query selects on and this check runs after it (0014, E-110).

**The officer bypass is unaffected.** It is a standing grant being used, not a shift being worked,
and it has no window. It remains recorded once per night, venue and role (0044).

**The window is what decides a sale's house.** `performanceForSale(context, at)` picks the
performance whose bar window contains the sale's instant; with no containing window it takes the
nearest bound, ties going to the earlier performance; with no windows at all it resolves null.
This replaces the sale route's "exactly one performance in scope" choice, and a comp request
records its house the same way.

**The arithmetic is absolute seconds, so daylight saving needs no special case.** Every stored
time is a Unix instant and every offset is a count of minutes, so a shift starting 30 minutes
before 18:30 on the night the clocks go back starts at the instant 30 minutes before that instant,
whatever the wall clock did in between. The two 2026 clock changes are named test cases, which is
how this claim stays true rather than merely argued.

## Consequences

- Volunteers can be refused by the clock, which is new. The refusal names the window, and the
  grace period is generous enough that an early arrival with a genuine shift is not turned away;
  a bar shift running late past a configured end still works during grace, and the officer bypass
  is behind it.
- Three configuration keys ship as proposed values, so the theatre can widen the windows without a
  release if 30 minutes proves wrong for the door queue or the bar's close-down (0012).
- The rota screens can say when a shift is worked rather than when the curtain rises, and the
  day-before reminder has a real start time to quote.
- A performance with no doors time and no running time gets a window equal to its curtain instant
  plus the offsets, which is nearly a point rather than a window. The write path that records
  performances is where that is worth improving; until then those shifts fall back to the curtain
  and the grace period carries them.
- Template edits are inert over stamped shifts by design. An officer who widens a venue's bar
  window and expects tonight's shifts to change will be surprised, so the template screen says so.
- `shiftWindow()` is shared code with no database access, which is what lets the sale resolver,
  the authority check and the rota screens agree without three implementations.

## Options considered

- **Times on the template alone, derived at read time.** Rejected. Every reader would derive the
  window again, a template edit would silently move a shift somebody already worked, and the sale
  resolver would need the template on every sale.
- **A stored duration rather than two instants.** Rejected. The end is the thing both the
  authority check and the sale resolver compare against, so storing it is storing the answer;
  a duration makes every reader do the same addition.
- **Authority bounded by the performance's own times, with no columns.** Rejected. It cannot
  express a bar that opens an hour before the door or closes half an hour after the audience
  leaves, which is the actual shape of the evening, and it gives an opening with no performance
  (0077) no window at all.
- **Wall-clock arithmetic in Europe/London.** Rejected. It needs a special case for each clock
  change and a decision about what "30 minutes before 01:30" means on the night that hour happens
  twice. Absolute seconds have no such night.
