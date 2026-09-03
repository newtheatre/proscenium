# 0045: A public listing caches until the next thing that changes it

- Status: Accepted
- Date: 2026-09-03

## Context

D-101 criterion 3 wants the public listing edge-cacheable, because it is the busiest page on the
site and every response is the same for everybody. D-112 criterion 4 wants it to say "booking
closed" the moment a performance's booking window passes, "not on the next cache refresh beyond the
stated cache lifetime".

Those pull against each other. A booking window closes at an instant computed per performance, and
nothing fires when it does: the window is a number of hours held on the row, and the answer to "is
this on sale" is derived at read time. A cache with a fixed lifetime therefore goes on offering a
Book button for up to that lifetime after the desk needed the house settled, and the reservation
route refuses whoever presses it. The old estate had no listing cache and no window, so this is not
a regression anybody has seen; it is a defect the two criteria together forbid us to ship.

Three answers were available.

- **A short fixed lifetime.** Thirty seconds is cheap to write and still wrong: it caches badly all
  day to be nearly right for a few minutes an evening, and "nearly" is still a Book button that
  409s.
- **Purge on the boundary.** Correct, and it needs something to fire at an arbitrary instant per
  performance. Nothing in the estate does that: the scheduled tasks run on a cron, and the nearest
  one is `holds:release`, which is D-106's and not built.
- **Shorten the lifetime to the boundary.** The response already knows every performance it
  describes and, through `performanceClosesAt()`, exactly when each stops being bookable.

## Decision

**A public listing response carries a `max-age` that expires no later than the earliest booking
window it describes closing.** `listingCacheSeconds(boundaries, at)` in
`shared/utils/programme.ts` takes the closing moments of every performance in the payload and
answers with the seconds until the soonest one still ahead, capped at `LISTED_CACHE_MAX_SECONDS`.
A boundary already passed constrains nothing: that performance says "booking closed" and will go on
saying it.

Both public routes set `Cache-Control: public, max-age=N, s-maxage=N` from that number, and both
return it in the body so a test can assert it without reading headers.

**`LISTED_CACHE_MAX_SECONDS` is five minutes**, and it is a technical bound rather than a policy
number: it is what the listing may be stale by when nothing is about to change, and no committee
decision turns on it. It is a constant in `shared/utils/programme.ts`, not a configuration key.

## Consequences

The busy case is the cheap case. On a quiet afternoon every response caches for the full five
minutes. In the hour before a curtain the lifetime shortens automatically, and in the last minute
before a window closes it is measured in seconds, which is exactly when correctness is worth more
than the cache.

A performance selling out is a different boundary and is not covered here: the sold count changes
when somebody books, and the listing may be up to five minutes behind on it. That is honest for
availability in a way it is not for a window, because a house that filled while the page was cached
refuses at the reservation route with a stated reason, and D-105's capacity predicate is what makes
that refusal safe rather than a race.

The same shape will serve any later public payload derived from a moment: the function takes
boundaries and knows nothing about performances.
