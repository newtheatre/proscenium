# 0215: A bar opening is shorter than a day, and an overlap at the venue is warned of

- Status: Proposed
- Date: 2026-10-22
- Amends: E-130 criteria 1 and 7 (what an opening admits, and removing its last slot); extends 0077

## Context

The hands-on run of 21 October 2026 planned an opening from 20:00 to 20:00. The form reads a
closing time no later than the opening time as the next morning, so it saved a 24-hour opening that
ran into the next show night. Two openings at one venue whose hours overlapped were both accepted
without a word. **Remove** was offered on an opening's only slot and then refused.

## Decision

**An opening is shorter than a day.** `barOpeningForm` refuses `endsAt - startsAt` of 86,400 seconds
or more, and the screen refuses equal times before sending, with the same sentence. A closing time
earlier on the clock than the opening time still means the next morning.

**An overlapping opening at the venue is a warning, not a rule.** The route reads for a `PLANNED`
opening at the venue whose hours overlap, and answers 409 naming it with `data.overlap`. The
screen shows that as a warning with **Plan the opening anyway**, which resends with `overlapping: true`. The
read is not on the write: a race between two officers plans both, which is what going ahead would
have done anyway.

**The only slot shows why it cannot be removed** in place of the button. The delete still refuses
it (0003), so a slot cancelled in another tab is caught there.

## Consequences

- Nobody can plan a 24-hour bar. A real all-day event is two openings, which the warning lets
  through.
- An API caller planning openings back to back at one venue sends `overlapping: true` for each one
  it means to overlap.

## Options considered

- **Refuse an overlap outright.** A society social running into a hire really does share one bar.
- **Warn after saving.** The officer would have to cancel what they did not mean, and every slot
  holder would be told.
