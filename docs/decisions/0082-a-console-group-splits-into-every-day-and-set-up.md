# 0082: A console group splits into Every day and Set-up, and a nav label is the page's own title

- Status: Proposed
- Date: 2026-09-21

## Context

0040 declared the console sidebar: nine groups in a fixed order, one declaration
(`shared/utils/site-nav.ts`) feeding both the sidebar and the route guard, one group open at a
time. That much holds. What it did not say was how a group is ordered inside itself, and the
modules have since filled the groups up. The sidebar now carries fifty-four items, past the
"roughly forty" at which 0040 and `docs/design-language.md` both say a command palette becomes
the answer, and the pre-cutover review (issue 1151 item 1) found what that does to a person
using it.

Every group interleaves two different jobs. Box office puts Desk, the screen a member opens at
19:15 on a Tuesday, in the same undifferentiated list as Ticket types and Show categories,
which a Box Office Manager touches when a season is built and then not again for a year. Bar
puts Stock beside Discounts. The group named Tonight is not tonight at all: it holds shift
templates, approvals, checklists, emergency cards, safety and the age-check register, all of it
planned at a desk days ahead, while the phone shell a person actually works a show night on is
also called Tonight. One word named two things, and neither of them well.

The smaller faults compound it. Nine icons are used twice or more, so `i-lucide-beer` marks the
Bar group, Bar products and Bar openings, and the icon column stops carrying information. Desk
is a magnifying glass and the rota board a crossed-out person. "Issue passes" is the only verb
in a sidebar of nouns, and it sits next to "Passes", which is not a pass but the screen that
administers pass types. Six nav labels disagree with the title the page sets in its own
`definePageMeta`, so the sidebar says Stock and the screen's top bar says Stocked items; the
existing test allowed it through two escape hatches (an exempt set, and an allowance for a
title that leads with its group's word). Only one group opens at a time, so an officer moving
between Box office and Bar re-expands on every switch. The sidebar header is a bare span, so
the one place every console screen agrees on is not a way home.

## Decision

**A console group is ordered as two sections, Every day and Set-up. A nav label and its page's
title are one string. An icon belongs to one entry. Groups stay open once opened.**

### The two sections

`NavEntry` takes an optional `section`, one of `NAV_SECTIONS` (`Every day`, `Set-up`). The
layout renders it as a muted `type: 'label'` item inside the group, above the items carrying
it, and omits it when the sidebar is collapsed, where the group's items already come out in a
popover in order. A group either splits (every item names a section) or does not (no item
does), which is a test: a half-split group would file some of its items under a heading and
leave the rest floating above it.

Every day is the work of a week: the desk, the board, the stock, the requests that arrived.
Set-up is what a committee configures when it takes over or when a season is built, and then
leaves alone. Rota, Box office, Bar, Spaces and Training split. People, Money, Communications
and System do not, because each is one kind of thing throughout: registers of people, reports
on money, two sending screens, three governance screens.

Two placements are worth naming, because they could have gone the other way. **Movements** is
every day, not set-up: it is the history of what the till sold and what a stocktake adjusted,
read when a figure looks wrong, and a reversal is posted from it. **Access profiles** is
every day as well: declarations wait there to be sighted in person, and the queue carries its
count on the sidebar, so it is weekly work rather than vocabulary set once (issue 1334, from the
MVP flow review of 25 September 2026).

### The group is Rota, the shell is Tonight

The group under `/rota/manage` is named Rota. `tonight` remains the name of the phone shell and
of `SHELL_NAV`'s entry for it, which is the only thing a person on a show night calls it. The
group's key changes with its label, so `groupFor` and the sidebar agree.

### One name per screen

A nav label equals the page's `definePageMeta` title, exactly, and
`tests/unit/site-nav.test.ts` compares the two with no exemptions. Where the pair disagreed,
the shorter noun won, because the sidebar truncates at its default width (issue 921) and the
navbar does not: the Bar screens are Stock, Movements, Categories, Products and Reports, and
the Training screens are Catalogue, Records, Sessions and Requests. The group heading above
them supplies the domain the title used to repeat.

"Passes" becomes **Pass types**, beside Ticket types, which is what the screen administers.
"Issue passes" becomes **Pass desk**, a noun beside Desk. Folding it into the Desk screen was
considered and refused: the two screens hold different tables and different refusals, and a
tab strip inside Desk would hide a screen the box office reaches directly from a cold start
while adding navigation that is not in the declaration, which is exactly what 0040 forbids.

### One icon, one entry

No icon appears twice across `CONSOLE_HOME`, the group headings and the items, and a test says
so. Desk takes `i-lucide-ticket-check` and the rota board `i-lucide-users-round`.

### Groups stay open, and the header goes home

The sidebar's navigation menu is `type="multiple"`, bound to a list of open keys that the
current route's group is added to on every navigation and that a person's own clicks then
extend. Box office and Bar are open at once for as long as the session lasts. The sidebar
header is a link to `/admin`, the console overview, which 0040 already named as the console's
home.

## Consequences

- The sidebar is longer in pixels by one muted line per section and shorter in reading: the
  nine or ten items a group holds are two short lists with a heading each.
- `section` is declaration only. It changes no route, no ability and no guard; the middleware
  resolves a route through `entryFor` exactly as it did (0040).
- Nine page titles change. Each is the string in the page's own `definePageMeta`, so the
  navbar, the browser tab and the documentation's "Manage, Bar, Stock" line now say one thing.
  The documentation already used the sidebar's words, so the pages moved towards the docs
  rather than the other way.
- The rename from Tonight to Rota reaches ten documentation pages and the glossary. The
  account menu, the phone shell and `/tonight` are untouched.
- `UDashboardSearch` is still the right answer past forty items and is still not built. It is
  now a story, K-201, rather than a line in a consequences list: it wants a keyboard shortcut,
  ability filtering over the same declaration, and a test that a screen absent from the
  palette is absent from the sidebar too, which is more than this change can carry and stay
  reviewable.
- A tenth group, or a group past a dozen items, will want a third section before it wants a
  third level of nesting. Nesting was refused here: a collapsed sidebar renders children in a
  popover one level deep, and a grandchild has nowhere to go.

## Options considered

- **Leave the groups flat and build the search box first.** Refused: search finds a screen
  whose name you already know. The officer who has never opened Access profiles does not know
  it exists, and a flat list of ten is what stops them learning.
- **Split each group in two, as two groups.** Eighteen groups in the fixed order, and Box
  office would appear twice in a sidebar whose order is meant to be learnable. A section
  inside a group keeps one heading per domain.
- **Nest set-up under a "Set-up" group of its own at the foot of the sidebar.** One place for
  every domain's configuration reads tidily and works badly: a person configuring ticket types
  is doing box office work, and moving them out of Box office breaks the prefix-to-group
  relationship that `groupFor` and the middleware rest on.
- **Keep both names per screen, and let the sidebar abbreviate.** This is what the escape
  hatches in the test encoded. It is how "Unfilled shifts" survived for months after the
  screen became the rota board (issue 1041): two names means one of them is free to rot.
