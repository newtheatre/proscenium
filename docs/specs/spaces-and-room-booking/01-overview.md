# Spaces and room booking: specification

Nov 16, 2026 · @Matthew Adcock

This is the second-round specification for the Spaces module: booking rooms and shared resources, with rules, clashes and approval. It was written on 16 November 2026, with Matt's nine decisions and the other workstreams' rulings of that day written into the body. Nothing in it has been built or run.

## The design in six sentences

1. A space from core becomes bookable when the theatre says so; a van or a piano can be made bookable too.
2. A member picks a room, a time and a purpose, and is told at once whether the booking is confirmed, sent to a person to decide, or refused and by which rule.
3. Only a confirmed booking occupies time, and two confirmed bookings can never overlap in one room: the write itself carries the check.
4. Performances and closures come from core and always win; bookings in their way are bumped and their bookers told.
5. Each purpose has a priority the booker cannot choose, and a higher one may displace a lower one only through an approver and with notice.
6. Other modules make bookings through a service, inside their own save, so a rehearsal and its room can never disagree.

## The parts

| Tab | Holds | Size |
| --- | --- | --- |
| 1. Scope and glossary | What is in and out, 20 words this module owns, 5 that needed a ruling |  |
| 2. Data model | Seven tables in the Foundations layout, erasure and merge | 7 tables, 5 id prefixes |
| 3. Rules and flows | Eight states and their moves, and every rule with an id | 62 rules |
| 4. Interface to other modules | Manifest, services, events, contributions, routes, the index of names, and what is agreed and still open with other workstreams | 1 open point |
| 5. Screens | Four in the members' area, eight in the console | 12 screens |
| 6. Settings and abilities | Settings, abilities, presets and the starting purposes | 17 settings, 10 abilities, 3 record types |
| 7. Stories | SP-01 to SP-48 with an order of work and a cut order | 4 gate, 32 first, 12 later |
| 8. Tests | The clash proof, then unit, integration and end-to-end | 7 proof runs, 33 integration, 8 end-to-end |
| 9. Questions for Matt | The nine questions, each with its decision and the reasoning behind it | 9 questions, all decided |

## What it rests on

| Source | Used for |
| --- | --- |
| [Core domain and public site](https://claude.ai/artifact/Qt8cFSyEekr7tfpiMCqe2E) | Venues, spaces, closures, `core.space-busy`, `core.change-impact`, notifications |
| [Foundations](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x) | The manifest, registries, table layout, kit and the index of names |
| [Interface and wireframes](https://claude.ai/artifact/KwZ3oXcFJSMNj98kNc9ywW) | Shells, page types and navigation |
| [Design paper](https://claude.ai/artifact/8Yn8fPcsngaKVrTdijBaiD) | The module catalogue's six lines on Spaces, and the shared glossary |
| [Identity](https://claude.ai/artifact/BcVS8iNe7oDZCPmW4gyus5) and [Form builder](https://claude.ai/artifact/6E5k2VS2PnhdciVNMeap5s) | Identity: the role keys, the fact `core.member` and the owner rule, as it confirmed. Form builder: the form slot for the later story SP-38, still to be agreed with it (tab 4) |

## Where the catalogue's six lines went

| Catalogue line | In this specification |
| --- | --- |
| A calendar per space with bookings, recurring series and closures | First release |
| A policy engine: who may book what, how far ahead, for how long, with what notice | First release, as rules on a purpose that a bookable may tighten |
| Priority tiers decided by the system from what the booking is for | First release |
| Approvals, bumping with notice, cancellations and no-shows | First release; no-shows are recorded and carry no penalty (question 5) |
| Requests for spaces the theatre does not control | First release |
| Bookable resources other than rooms | First release, one of each; quantities later (question 7) |

## Open before it can be called settled

- Nothing from Matt: all nine questions were decided on 16 November 2026 (tab 9).
- One point with another workstream (tab 4): the Form builder's form slot, which belongs to the later story SP-38. Everything asked of Core, Foundations, Identity and Interface is agreed and written in.
- The shared calendar component is Interface's story UI-35, placed in roadmap phase 4, so Spaces cannot ship earlier than that.
- The clash proof (tab 8) has not been run.
