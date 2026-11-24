# Rehearsals specification

2026-11-23 · Matthew Adcock

Rehearsals is a new switchable module, `rehearsals`, for a production's stage manager: calls, who is called, conflicts, rooms and call sheets. It is spec 5 of the third round, written on 23 November 2026 with its boundaries agreed that day with the Productions, Programme planning, Festival-ready and Reports threads. Nothing in it is built.

## The design in six sentences

1. A production's leads plan rehearsal calls on a week grid; each call has a kind, a time, a room or a place, a running order of scenes and the people called.
2. Calling a scene calls the people in it, and each person gets their own call time, so nobody waits two hours for their entrance.
3. A call in a theatre room makes its Spaces room booking in the same save, so the schedule and the room diary can never disagree; if Spaces later takes the room away, the call is flagged at once.
4. Cast and crew say once, in the Availability module, when they are free, maybe or busy; the planner reads it, warns, never refuses, and shows a reason only where Availability allows.
5. Issuing a week's call sheet sends each person one message with only their own calls, and later changes reach only the people they affect.
6. Everything a person is called to shows in their account, on their home page and in their calendar, and is offered to core so other modules know they are busy.

## The parts

| Tab | Holds | Size |
| --- | --- | --- |
| 1. Scope and glossary | What is in and out, 16 words this module owns, 6 that needed a ruling |  |
| 2. Data model | Nine tables in the Foundations layout, erasure and merge | 9 tables, 7 id prefixes |
| 3. States and rules | The call's four states and its room's four, drawn; every rule with an id | 54 rules |
| 4. Interface to other modules | Manifest, services, events, contributions, routes, index of names, what is agreed and open | 3 open points |
| 5. Screens | Four for anyone called, seven in the production workspace, two in the console; three wireframes | 13 screens |
| 6. Settings and abilities | Settings, abilities, call kinds and presets | 15 settings, 7 abilities |
| 7. Stories | RH-01 to RH-51 with an order of work and a cut order | 4 gate, 40 first, 7 later |
| 8. Test plan | The gate proof, then unit, integration and end-to-end | 44 named cases |
| 9. Questions for Matt | Eight questions, each with a recommendation | Answered 24 November 2026 |
| Sources | What was read |  |

## Combined and split

Matt asked where modules could be combined or split further. For Rehearsals:

- **Kept apart from Productions**, as the map proposed. Productions owns the team, positions, departments, tasks, rights and show reports; Rehearsals requires it and calls its team service. They meet on three agreed seams: the team list, the production timeline (`productions.schedule-entry`) and milestones ticked by call kind.
- **Combined into core: "is this person busy?"** Rehearsals, Programme planning, Front of house and festival crew all need it, so it became one core point, `core.person-busy` (Festival-ready story C-66), rather than four private checks. Rehearsals contributes its published calls; Availability contributes stated busy time without reasons.
- **Split out to Availability: stated conflicts.** What times a person cannot make is now the Availability module's, entered once for every production (Integration ruling R3-26, amending R3-04). Rehearsals asks for it, reads it on the planner and gives back its units as groups and a "Rehearsal call" target; it keeps no conflicts table.
- **Combined into core**: one personal calendar feed, core.calendar-feed, instead of one per module (Integration ruling R3-12, pending Matt as question 7).
- **Not split further.** Rehearsal reports stay here rather than joining Productions' show reports: same shape, same department list, different moment and author. Auditions stay out (question 8).
- **No new room logic.** Every clash, approval and bump is Spaces'; Rehearsals is the caller Spaces' own spec already describes.

## What it rests on

| Source | Used for |
| --- | --- |
| Spaces and room booking (second round) | Origin bookings, purposes and tiers, approval, the room's states |
| Productions (third round, in progress) | The team, its facts and departments, the workspace tab, the production timeline |
| Festival-ready changes (third round) | `core.person-busy`, C-66 |
| Availability (third round, in progress) | Stated availability, requests, levels(), availability.group and availability.target (ruling R3-26) |
| Programme planning (third round) | The core `occupancy` read for the planner's room column |
| Reports (third round) | `core.measure`, aggregates only |
| Foundations, Interface, core on `next` | Formats, the Calendar component UI-35, credits and `core.production-team`, Front of house's feed |

## Open before it can be called settled

- None of Matt's questions: he answered them on 24 November 2026 (tab 9). Question 7, the calendar feed, rests with Integration's R3-12.
- Integration's rulings are written in (R3-01, R3-12, R3-25, and R3-26 amending R3-04; https://claude.ai/artifact/AKm7BUp7iuRBo2g2Gdcshg); registering the seven id prefixes and the RH story prefix remains.
- Interface: whether the planner is the Calendar component with a people strip (assumed) or a grid of its own.
- It cannot ship before Spaces' first release (and so UI-35) and Productions' team.
