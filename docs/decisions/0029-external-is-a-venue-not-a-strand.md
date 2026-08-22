# ADR-0029: "External" is a venue, not a strand

**Status:** Accepted · **Date:** 2026-08-22 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The word "external" is used at the theatre for two arrangements that have almost nothing in common
operationally, and conflating them produces exactly the wrong behaviour in each direction.

**An external show** is another company using our building, most often during StuFF. It is their
production, and it is booked as a strand: `show_categories` already carries *In House, Fringe,
StuFF, External*. **We sell the tickets, we run the bar, and we staff the front of house.** That is
a condition of the hire, not a favour. Operationally this is one of our nights.

**An external venue** is us performing somewhere that is not ours, most often Edinburgh. **The venue
sells the tickets.** We advertise the show on our site and send people to the venue's page. There is
no rota, no bar session and no end-of-night report, because none of it happens in a building we run.

Before this decision there was one signal, `shows.external_url`, and it was read as "not ours". The
first behaviours built on it (#214) therefore skipped the rota and the duty-manager warning for
anything carrying a link. That is right for Edinburgh and would have been wrong for a StuFF hire,
which needs a duty manager more than an in-house show does, not less.

## Decision

**Ticketing follows the venue. The strand carries no operational meaning.**

- `venues.is_external` marks a venue as one we perform at but do not run.
- A performance is externally ticketed when **its venue is external**, or it carries its own
  `external_booking_url`, or its show carries an `external_url`.
- **The link lives on the performance, and falls back to the show.** A show that transfers is sold
  by us here and by them there, so the two dates need different answers: setting the show-level link
  for a transfer would take the home run off sale, which is exactly the trap this ordering avoids.
  The show-level link means *the whole run is sold elsewhere*.
**There are two questions, and they are answered separately.**

- *Who sells the tickets*: `externallyTicketed()`, with `ourTicketingPredicate()` as its SQL form.
  Every path that could take money for a seat we do not control uses it: the public booking route
  and the box office feed.
- *Whose building it is*: `ourBuildingPredicate()`. Everything front of house uses it: the rota
  stamp, the duty-manager warning, the show night screen, the emergency cards, closing the night,
  and which performances a bar session may serve.

They diverge, and the divergence is real rather than theoretical. A show in our building that
somebody else sells is **not ours to ticket and is ours to staff**. A show we sell at the Fringe is
the other way round.
- **The `External` show category changes nothing.** It is a programming strand for the What's On
  listing and for reporting. A hire in our building is ticketed, staffed and barred by us exactly as
  an in-house show is.

## Consequences

- A StuFF hire behaves like any other night: it appears in the box office, gets a rota, warns when
  it has no duty manager, and can open a bar session. This is the behaviour the hire agreement
  requires, and it now falls out of the model rather than depending on nobody having set a URL.
- Marking a venue external retires its performances from the box office feed, the rota, the show
  night screen and the end-of-night report, and takes the venue out of the emergency card list. We
  do not run front of house somewhere that is not ours, so an empty emergency card there is not a
  gap and must not be shown as one. Do not use the flag for a hire of our own space; the checkbox
  says so.
- A performance at an external venue with no link, on itself or its show, is a dead end: the page
  cannot offer a basket and has nowhere to send anyone. This is visible in admin rather than
  refused at save time, because the venue is usually known before the ticket link is.
- Pass coverage is untouched and stays a hand-maintained list (`pass_type_shows`). Deriving it from
  the strand is worth doing and is a separate question, still open in
  [10-passes-design](../10-passes-design.md) §10.

## Alternatives

**A `ticketing` enum on the show.** The original suggestion, and it is what
`shows.external_url` already does implicitly. Rejected as the primary lever because it asks the
question of the wrong entity, and a real case proves it: a show with five dates at home and one at
the Fringe is not externally ticketed, one of its performances is. A show-level answer takes the
home run off sale. The show-level link survives for a whole run sold elsewhere, which is the case it
was originally added for.

**A separate `foh_staffed_by_us` flag.** Considered when the two arrangements were still conflated.
It has no work left to do: we staff every night in our building and none outside it, which
`ourBuildingPredicate()` already expresses. If a hire ever brings its own front of house, that is
the point to add it, and this decision should be superseded rather than quietly extended.
