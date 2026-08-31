# 0034: The booking horizon is a number of weeks

- Status: Accepted
- Date: 2026-08-31

## Context

`ROOM_BOOKING_HORIZON` shipped as `END_OF_TERM|END_OF_SEASON`, defaulting to `END_OF_TERM`. It came
into the workshop register from the old estate's published policy, which says a member may book
until the end of the current term.

Nothing in this system can answer when a term ends. The `periods` table that would hold term
boundaries belongs to I-107, a finance story about locking accounting periods, and is unbuilt. The
`seasons` table belongs to Productions and is unbuilt. Configuration holds `SEASON_START` and
`SEASON_END` as `MM-DD` strings, which answer the season but not the term. `shared/utils/london.ts`
knows only the committee year end.

So the default value of a shipped setting names a rule the code cannot evaluate. The horizon is
also one of the five refusals C-106 requires each to be distinct and named, which makes an
unenforceable branch worse than an absent one: the member is told nothing, and the officer reading
the settings screen is told a rule is in force that is not.

There is a second reason not to wait. A term boundary is not a fact this system owns. It comes from
the university, it moves, and nobody has volunteered to keep it current. A rule that silently stops
being enforced when a date passes is worse than one that never claimed to be.

## Decision

**The horizon is `ROOM_BOOKING_HORIZON_WEEKS`, an integer, proposed as 12.** A member may book that
many weeks ahead of today, counted in London days.

Twelve because a University of Nottingham teaching term runs eleven or twelve weeks, and because
`ROOM_SERIES_MAX_OCCURRENCES` already proposes 12 for a weekly series: a member who may book a
twelve-week series and an eight-week horizon would find the series refused by a rule the series
limit says is fine.

This supersedes the `END_OF_TERM|END_OF_SEASON` row in `docs/workshops.md`, which the committee has
not yet confirmed. It is the proposal that goes to the spaces workshop instead.

Removing the old key orphans any override stored against it. Readers only ever ask for keys in
`CONFIG_KEYS`, and the settings screen iterates `CONFIG_KEY_NAMES`, so an orphaned row is never read
and never shown. Nothing is live, so there is none.

## Consequences

- The rule is enforceable today, in one subtraction, with no dependency on a table nobody has built
  and no date anybody has to maintain.
- A member near the end of term can book into the next one. The old policy would have stopped them.
  If the committee wants that boundary back, it needs term dates from somewhere, and this record is
  what that conversation supersedes.
- I-107 may bring real term boundaries. If it does, this becomes a choice between a rolling window
  and a term boundary rather than a choice between a window and nothing, and that is a better
  argument to have with the data in hand.
