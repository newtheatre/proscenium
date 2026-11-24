# Sources

Everything below was read on 23 November 2026. Repository paths are on branch `next` of newtheatre/proscenium at commit cf7907e1.

## Planning documents

| Source | Used for |
| --- | --- |
| [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk), Overview tab, "The third round of specifications" | The split of Production management into Productions and Rehearsals |
| Third-round brief, project file `third-round-specs/brief.md` | Format, rules and the list of specs |
| `docs/design-paper/04-2-module-catalogue.md` | The catalogue's line: "Rehearsal schedule with call sheets and availability, linked to room bookings" |
| `docs/design-paper/09-1-comparable-systems.md` | Propared as the comparable product (calls, rehearsal and show reports, shared read-only pages) |
| `docs/design-paper/13-second-round-questions-and-status.md` | Spaces' SP4 ruling on who books rehearsal rooms |

## Specifications

| Source | Used for |
| --- | --- |
| `docs/specs/spaces-and-room-booking/` (all tabs) | Origin bookings (`requestBooking`, `changeBookingOfOrigin`, `cancelBookingsOfOrigin`, `bookingOfOrigin`), rules P2, C2, C3, C5, X3, L8, the preset purposes and story SP-37 |
| `docs/specs/foundations/02-3-abilities-registry.md`, `02-4-data-class-registry.md` | The ability and table formats, id prefixes, onMerge |
| `docs/specs/front-of-house/` | Its later availability stories FH-38 and FH-39, and the scope line giving rehearsal rooms to Spaces |
| `docs/specs/core-domain-and-public-site/05-interface-to-other-modules.md` | `core.space-busy` and yielding times |
| `docs/specs/training-records/` | Training's sessions report rooms through core, not Spaces; table layout |
| `docs/specs/form-builder/02-scope.md` | Rehearsal calls and casting are out of the form builder's scope |

## Built code

| Source | Used for |
| --- | --- |
| `layers/core/server/db/domain.ts`, `core_production_credits` | Credits, linked accounts, visibility |
| `layers/core/server/facts/production-team.ts`, `programme/credits.ts` | How `core.production-team` holds |
| `layers/core/server/points/upcoming.ts` | The Upcoming card contract |
| `layers/front-of-house/server/calendar.ts` | The private shift feed: hashed token, sealed token, reset |
| proscenium-old `server/routes/rooms/feed/[token]/calendar.ics.get.ts` | The old system's room feed, the same idea |

## Agreed with other threads on 23 November 2026

| Thread | Agreed |
| --- | --- |
| Specify Productions | Team service and facts, department vocabulary, workspace tab point, schedule-entry point, milestone ticks by kind, team-member events, a core credit for every current team member |
| Specify Programme planning | Boundary between performances and rehearsal calls; the core `occupancy` read; people's commitments through `core.person-busy` |
| Specify Festival-ready changes | `core.person-busy` as core story C-66 |
| Specify Availability | Stated conflicts moved there (ruling R3-26); openRequest, closeRequest, levels(), availability.group and availability.target agreed 23 November 2026; this spec's former U-1 to U-3 and U-9 became its T-AV tests |
| Integrate the third round of specs | Rulings R3-25 (under-18 members, core ageStatus, core.under-18.latest-finish) and R3-26 (Availability takes stated conflicts) |
| Specify Reports | `core.measure`, aggregates only |
