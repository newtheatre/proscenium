# ADR-0018: The box office screen is forward-looking only

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`/admin/box-office/reservations` exists to work tonight's door. It is used by front-of-house
volunteers, under time pressure, in a foyer.

It originally built its performance navigator by loading `/api/shows` with no query string — every
show in the archive, 498 of them with 1,304 performances nested — to render one dropdown.

Making the whole archive reachable from that screen is also a correctness problem, not only a
performance one. Landing on a show that finished last March invites collecting tickets against the
wrong night, and there is no workflow on this screen that needs a finished performance.

## Decision

**The navigator offers on-sale performances from today onwards, and nothing else.**

- `status=ON_SALE`: a `DRAFT` performance is one nobody can book, so its door list is empty by
  definition and its capacity figures are meaningless. Including it would only create a way to sell a
  walk-in against a night that is not on sale. Publishing a show does not publish its performances, so
  a published show can have draft ones; they appear here once they are actually selling.
- **From today onwards.** The date picker re-selects within the fetched list rather than re-fetching,
  so there is no window to slide and no way to slide it backwards.
- The default selection is today's performance, else the next one. There is deliberately **no**
  fallback to the most recent past performance: when there is nothing ahead, the page says so rather
  than quietly presenting a finished show as though it were tonight's.
- Historical bookings are looked up on `/admin/reservations`, which is paged and searchable over the
  whole archive.

The navigator is fed by `GET /api/performances`, a flat chronological list that exists because the
box office wants exactly that and nothing else. Its `near` mode returns the performances *closest to*
a date — half before, half after — rather than a fixed window: the theatre goes quiet over the
summer, so any fixed window is sometimes empty, and an empty navigator on the door is worse than an
old one.

## Consequences

- A volunteer cannot reach a finished performance from the box office screen. That is the point.
- "Sell a walk-in for a night that is not on sale" is not expressible here. Put the performance on
  sale first.
- `near` responses are one centred window rather than a page: `page` is always 1 and `total` is the
  size of the window. Use `from`/`to` when you genuinely want to page a range.
