# 0256: Ctrl+K goes to any screen the sidebar offers

- Status: Proposed
- Date: 2026-10-25
- Amends: K-201 (brought forward from V2), criterion 5

## Context

The console sidebar carries more than fifty screens in ten groups. Decision 0082 split each group
into Every day and Set-up so an unfamiliar screen can be found, and K-201 kept a command palette
for V2, for the officer who knows a screen's name but not its group. The admin UX audit of
24 October 2026 found that hunt at the start of many journeys, which then often end in a list's
search box: an account by name, a show by title. Matt approved the palette on 25 October.

## Decision

1. **`UDashboardSearch` sits in the console layout**, opened by Ctrl+K (Cmd+K on a Mac) and by
   **Go to** at the top of the sidebar, as K-201 criterion 1 asks.
2. **Its screens are `quickJumpScreens(viewer)`**, built from `CONSOLE_HOME` and
   `visibleGroups`, the very function the sidebar draws from. One palette group per sidebar group,
   in the sidebar's order, each entry suffixed with its section. A screen reaches the palette only
   by being declared (criteria 2 to 4).
3. **Typed words are offered to the lists that search by them.** With two characters or more,
   **Search a list** offers each of Accounts, Members, Shows, Stocked items, Products and Training
   modules that the viewer may open, as a link to that list with `?search=` set, cut at that list's
   own declared search length. Every one of those lists already reads its search from the address
   (K-129), so the palette adds no route and reads nothing itself.
4. **A booking reference is not looked up.** No route finds a booking across nights; the desk
   searches one night's bookings, and a palette that guessed a night would be wrong as often as
   right.

## Consequences

- Any screen is two keystrokes and a few letters away, and a person or a show is one more Enter.
- A new console screen joins the palette by being declared in `site-nav.ts`, as it joins the
  sidebar. A new list that should be searchable from the palette is added to `QUICK_FINDS` with
  its ability, beside its own declaration.
- The palette shows nobody a screen they could not open from their sidebar; a unit test holds the
  two to the same destinations.
