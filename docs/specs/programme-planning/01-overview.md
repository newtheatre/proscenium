# Programme planning: specification

Nov 23, 2026 · @Matthew Adcock

Programme planning is a new switchable module, `programme-planning`, that turns "what might we put on" into scheduled performances for any season: a theatre's ordinary season and a festival alike. It absorbs the catalogue's Programming area. It was written on 23 November 2026 as spec 1 of the third round; nothing in it is built.

## The design in eight sentences

1. A season gets a **plan** when someone starts planning it; a theatre that plans on paper never needs one, and every other module works without it.
2. Everything that might go into the season is an **entry**: a proposal from the call, an act, a hire from Companies, or a show typed in by hand.
3. The call is a form in this module's slot, and review is the form builder's, unchanged; accepting an entry creates its draft production in core, in the same unit.
4. Entries not yet placed wait in the **tray**; the **board** shows spaces across and time down, with everything else that occupies those spaces drawn behind.
5. Dragging an accepted entry onto the board makes core draft performances; dragging one not yet decided makes a **pencil**, which is only a note in this module.
6. Clashes are worked out live and shown as **warnings** that never block; the hard ones (two shows in one exclusive space, a blocking closure, core's turnaround) bite only at publish, on the statement, exactly as core already guards scheduling.
7. **Publishing** schedules every draft performance in the plan in one unit, or none of them, and quotes each refusal.
8. Each act is then **told** its slots once, and told again only about what changed.

## Why one module for seasons and festivals

The festival work showed that a call, review, an unplaced tray, a board and publishing are the same job whether NNT is filling eight Studio weeks or WSAF is placing 140 events over four days. Only the scale and the shape of the slot differ: a season places runs into weeks, a festival places single performances into hours. The board has two views for that (Season and Day) and nothing else changes. What makes a festival look and run differently on the day is the Festival module's.

NNT plans on paper and in meetings today, and many theatres have no proposals process at all (project memory, "Programming and production management are low priority"). So every part here works without a call: a programmer can type entries in, or place existing draft productions, and use only the board.

## The parts

| Tab | Holds | Size |
| --- | --- | --- |
| 1. Scope | What is in and out, what it assumes of others, 17 words it owns, 4 that needed a ruling |  |
| 2. Data model | Thirteen tables in the Foundations layout, erasure, merge and retention | 13 tables, 7 id prefixes |
| 3. States and rules | Three life cycles drawn, then every rule with an id | 58 rules |
| 4. Interface | Manifest, services, points, events, what core must add, and what is agreed with sibling specs | 5 points declared, 3 core stories asked for |
| 5. Screens | Eleven console screens and one in the account; the board drawn, the publish review step by step | 12 screens |
| 6. Settings and abilities | Settings, abilities and presets | 9 settings, 8 abilities, 4 record types |
| 7. Stories | PP-01 to PP-34, the occupancy module's OC-01 to OC-03, and an order of work | 6 gate, 18 first, 10 later, 3 occupancy |
| 8. Test plan | A publish proof, then named cases by tier | 4 proof runs, 12 unit, 24 integration, 6 end-to-end |
| 9. Questions for Matt | Seven questions, each now decided | 7 decided |
| Sources | What was read, and where |  |

## What it rests on

| Source | Used for |
| --- | --- |
| Map doc [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk), Overview and Festivals tabs | The boundary ("Programming joins a new Programme planning module"), pieces 4 and 5 (call to timetable, the board) |
| Built core on `next` (`layers/core/server/programme/performances.ts`, `db/domain.ts`) | Performance states, the space guard `noClash` and `assertSpaceFree`, the turnaround setting `core.programme.turnaround` |
| Built form builder (`layers/forms`) and its spec | Slots, review rounds with private scores and conflicts, outcome actions run exactly once |
| Spaces and room booking spec | `core.space-busy`, yielding times, `core.change-impact` |
| Sibling third-round specs | Festival, Companies, Festival-ready changes, Productions, Rehearsals, Reports and Inventory: seams agreed by message on 23 November 2026 (tab 4) |

## Open before it can be called settled

- All seven questions for Matt (tab 9) are decided; Q2, Q3, Q4, Q6 and Q7 as recommended. Q1 put the shared occupancy engine in a support module, `occupancy`, which has no switch of its own and is shown on the Modules screen.
- Three core stories this depends on are being written by the Festival-ready changes spec: `createProduction`, `createPerformance`/`movePerformance`/`schedulePerformances` (with C-60 to C-62), `core.person-busy` (C-66); and C-65, the support-module kind, for the occupancy engine specified here (OC-01 to OC-03) and built as the support module `occupancy`, which needs a new Foundations module kind.
- The Integration spec reconciles names across the round.
