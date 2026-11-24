# Festival-ready changes

Nov 23, 2026 · @Matthew Adcock

This amendment makes four built modules ready for a festival without making them festival software. It adds 22 stories across core, Identity (inside core), the form builder, Front of house and Box office, 8 new tables and new columns on 6 existing ones, and touches no existing behaviour: every change is additive and off until someone uses it. NNT's StuFF and the Warwick Student Arts Festival are the first users; a normal season benefits from every piece.

## Summary

- **Core** gains collections (strands of productions with their own page), drop-in performances (open from, until), line-ups inside one performance, credits for one performance, an embedded video player per performance, a programme import (spreadsheet and pretalx), three points other specs asked for (public-site.production-section, `core.person-busy`, `core.public-wording`) and the write services Programme planning, Festival and Productions call.
- **Sign-in** gains Microsoft as a second provider on the OpenID Connect flow that already exists, limited by tenant and email domain.
- **The form builder** gains correct answers, points and a pass mark with server-side marking, transitions the system makes by itself, and a quiz template. Training's quizzes and any other marked form use them.
- **Front of house** gains a rota grid for shifts that are not tied to a performance, crew sign-up questions answered once per crew call, T-shirt and meal counts with handouts ticked off, a shadowed-shift source for Training, and contributions to three points other specs declare.
- **Box office** gains a door headcount: walk-ups counted in, and in and out counted for drop-in events against capacity, with contributions to Festival's and Reports' points.

## What changes where

| Module | Change | Stories | New tables | Changed tables |
| --- | --- | --- | --- | --- |
| Core | Collections | C-60 | `core_collections`, `core_collection_productions` |  |
| Core | Line-ups and credits for one performance | C-61 | `core_performance_line_ups` | `core_production_credits` |
| Core | Drop-in performances | C-62 |  | `core_performances` |
| Core | Programme import, spreadsheet and pretalx | C-63 | `core_imports` | `core_productions`, `core_performances` (import marker) |
| Core | Video player | C-64 |  | `core_performances` |
| Core | Point `core.person-busy` | C-66 |  |  |
| Core | Point `core.public-wording` | C-67 |  |  |
| Core | Write services for productions, performances and credits | C-68 |  |  |
| Public site | Point `public-site.production-section` and venue-section (C-69); front-page (C-71), menu (C-72) and production-address (C-73) for the festival site | C-69 |  |  |
| Core (identity) | Microsoft and general OpenID Connect sign-in | ID-47 |  | none (settings and a credential) |
| Forms | Outcome action `core.create-production` extended | FB-512+ |  |  |
| Forms | Correct answers, points, pass mark, marking | FB-513 |  | `forms_responses` |
| Forms | Automatic transitions | FB-514 |  |  |
| Forms | Quiz and crew sign-up templates | FB-515 |  |  |
| Front of house | Rota grid | FH-48 | `front_of_house_shift_batches` | `front_of_house_shifts` |
| Front of house | Crew calls and sign-up questions | FH-49 | `front_of_house_crew_calls` |  |
| Front of house | T-shirt and meal counts, handouts | FH-50 | `front_of_house_handouts` |  |
| Front of house | Shadowed shifts for Training | FH-51 |  | `front_of_house_assignments` |
| Front of house | Contributions: person-busy, venue-day sheet crew section | FH-52 |  |  |
| Front of house | Event `front-of-house.timing.recorded` | FH-53 |  |  |
| Box office | Door headcount | BO-73 | `box_office_headcount_taps` |  |
| Box office | Contributions to Festival's and Reports' points | BO-74 |  |  |

C-65 is Programme planning's (the shared occupancy service) and is not in this doc.

## Decisions this rests on

- **A festival is a way of running a season**, with a switchable `festival` module (map doc, 23 November 2026). Nothing here depends on that module; it depends on this.
- **One season per production** (core ruling C2) stands. Collections are how a production joins several groupings.
- **Everything record-like keys to a performance**, so a drop-in exhibition is a performance with opening hours, one per opening day, not a new kind of record.
- **A module never reads another's tables.** Every cross-module need below is a service of an always-on module, a point, an event or a fact.
- **The Phase 0 rule on the order of work** applies: each story here gets failing tests before code, and the repository's specs are amended in the same pull request as the behaviour.

## Agreed with the other third-round specs

| Spec | What was agreed |
| --- | --- |
| Programme planning | Uses `createProduction`, `createPerformance`, `movePerformance`, `schedulePerformances`, the line-up services and `shape`. Drafts are not clash-guarded; the guard bites when a draft is scheduled. C-65 (occupancy) is theirs |
| Festival | Reads collections, `shape`, `lineUpsFor`; declares `festival.told-elsewhere`, `festival.headcount` and `festival.sheet-section`, to which Box office and Front of house contribute. Core declares `core.public-wording`; Festival contributes |
| Training (amended) | FB-513's marking returned by `addResponse`; quiz slot `training.quiz` is Training's; FH-51 contributes `front-of-house.shadowed-shift` to `training.step-source` |
| Rehearsals | `core.person-busy` is a core point (C-66); Rehearsals contributes published calls |
| Productions | Core credit services in C-68; event `front-of-house.timing.recorded` (FH-53). Whether the backstage board (FH-36) moves to Productions is their question for Matt |
| Reports | Box office contributes door figures to `core.measure` |
| Fundraising | No clash: this doc does not touch online checkout |

## Status

| Part | State |
| --- | --- |
| 1 to 8 | Draft complete, 23 November 2026 |
| 9. Questions for Matt | Eight questions, each with a recommendation; none blocks Stage 2, and four should be settled before Stage 3 |
| Sources | Complete for what was read; two outside facts not verified (listed there) |

No code has been written. When accepted, each section becomes an amendment page in the repository spec it changes (`docs/specs/core-domain-and-public-site`, `identity`, `form-builder`, `front-of-house`, `box-office-payments-ledger`), dated, as the form builder's change pages are.
