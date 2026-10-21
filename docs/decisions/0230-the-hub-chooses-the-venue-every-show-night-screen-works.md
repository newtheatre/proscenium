# 0230: The hub chooses the venue every show-night screen works

- Status: Proposed
- Date: 2026-10-21
- Amends: 0044 (the officer bypass refuses an unnarrowed request on a night two venues run)

## Context

The guard refuses to resolve a request that could cover two venues, rather than hand out authority
over a house nobody asked about (0044, E-127 criterion 1). That refusal was right, but nothing on the
phone ever answered it. On 21 October 2026 three venues had a performance, and the Front of House
Manager's bypass opened nothing useful: the hub, door, glance, Challenge 25, incidents, message,
backstage and report each said "More than one venue is running tonight", with no way to name one.
Only the checklist and report worked, and only with `?performanceId=` typed by hand. A studio show
beside a main-house show is an ordinary NNT night.

The same night showed the volunteer's version: Amy held a bar shift at one venue and a door shift
at another, and the hub silently picked one, offered the other venue's Till tile, and put one
venue's title over another venue's house strip.

Threading a venue through every screen's every read and write would touch some forty calls, and
each one forgotten is a screen that refuses again.

## Decision

**The hub asks which venue this phone is working, and keeps the answer in a night-scoped cookie
that every show-night guard reads.**

- `GET /api/tonight/venues` lists tonight's running venues, which of them the viewer holds a
  confirmed shift at, and whether the viewer holds an officer's night permission. Anyone signed in
  may read it: the programme is public, and what each venue opens is still the guard's alone.
- The hub offers a choice where the viewer could work more than one venue: every running venue for
  an officer, otherwise the venues the viewer's own shifts are at. Until a venue is chosen the hub
  shows the choice and Emergency, and nothing drawn by role, since those tiles would mix two houses.
- The choice is written on the phone as `nnt-night-venue`, `{ night, venueId }`, expiring at
  04:00 London (0014), the same shape the till's remembered bar uses.
- `requireNightAuthority`, `requireAnyNightAuthority` and `nightAuthorityIfAny` read it when the
  request names neither a venue nor a performance. It **only narrows**: a named venue or
  performance wins, a choice for another night or for a venue running nothing tonight is ignored,
  and a choice never opens a venue the caller's shift or role would not.
- A request for the bar alone ignores it. The till keeps its own remembered bar (issue 1257), and
  the SumUp app's return on a bare link must land at the bar that took the payment.
- The 400 now says where to answer it: "choose the one you are working on the Tonight hub". The
  hub treats it as an answer rather than a dropped connection, so it no longer says "Showing what
  was last loaded" about something that was never loaded.

## Consequences

- An officer on a two-venue night chooses once and every screen, door and backstage included,
  works that venue; changing venue is one tap on the hub.
- A volunteer with shifts at two venues works one at a time, and the header names no house until
  they choose, so one venue's title never sits over another's figures.
- A request from a phone that never chose behaves exactly as before.
- The guard does one more read, of tonight's programme at the chosen venue, for a phone holding a
  choice.
