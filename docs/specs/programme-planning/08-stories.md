# 7. Stories

Thirty-four stories, PP-01 to PP-34, and three for the support module occupancy, OC-01 to OC-03, at the end. PP and OC are new prefixes, checked unused in the repository on 23 November 2026. The gate is the smallest thing a programmer would use: plan a season on the board with entries typed in, and publish it. The call comes in the first release; Companies, Festival and import tie-ins are later because they wait for those modules.

## Gate (6)

| Id | Story | Acceptance criteria | Rules |
| --- | --- | --- | --- |
| PP-01 | As a programmer I start planning a season | "Start a plan" on a season makes one plan with the season's dates and the settings' day hours. A second start for the same season opens the existing plan. The season's console page gains a Programme tab | E1 |
| PP-02 | As a programmer I put what we might programme into the tray | I add an entry with a title, kind, running time, get-in, get-out and how many performances it wants, or bring an existing draft production of the season onto the board. Entries with fewer placements than wanted show in the tray, accepted first | E2, W9 |
| PP-03 | As a programmer I see every space's day on one board | Spaces across, time down, one day at a time. Scheduled performances, closures and room bookings show behind my plan's placements, labelled only where I may see them. Up to 30 spaces and 14 days load in one read | O1 to O4, W12 |
| PP-04 | As a programmer I place, move and remove shows by dragging | Dropping an accepted entry makes a draft performance of its running time in that space; dragging moves it; Remove deletes the draft. Every action also works from the keyboard. If someone else changed the plan since I loaded it, my move is refused with "Someone else changed the plan just now" and the board reloads | P3, P6, P7, P8 |
| PP-05 | As a programmer I see what will stop the plan publishing | Two shows in one exclusive space, a blocking closure, a gap under core's turnaround, and a room use that does not yield show as hard warnings with a red bar, in the same words the publish will use. Moving the block to a clear time clears the warning at once | W1, W2, W3, W5, W13 |
| PP-06 | As a programmer I publish the season in one step | The review lists what will be scheduled, what stops it, what it bumps, and who will be told; the button carries the count. Publishing schedules every draft placement or none; if core refuses any, the refusal lists each and nothing changed. If the plan changed after I opened the review, it refuses quoting both counts. Nothing goes on sale | U1 to U5, U7 |

## First release (18)

| Id | Story | Acceptance criteria | Rules |
| --- | --- | --- | --- |
| PP-07 | As a programmer I decide entries that did not come from a call | Accept creates the draft production with the entry's details and turns its pencils into draft performances, in one unit; pressing it twice creates nothing twice. Decline and Withdraw delete its pencils. I cannot decide an entry I am on | E3 to E7 |
| PP-08 | As a programmer I open a call for the season | I attach a form to the season's call slot with opening and closing times; the "Call for proposals" and "Festival call" templates come with their answers bound to entry fields. A form there cannot take payment. A second form for the same season is refused | C1 to C3 |
| PP-09 | As a proposer my answers arrive as an entry | Submitting creates the entry in the same save, with running time, entry windows, needs, rights status, slot choices and people filled from bound answers. Resubmitting while it is a candidate updates it; after a decision it does not | C4, C5 |
| PP-10 | As a programmer accepting in review creates the show | The form's accepting transition runs `programme-planning.accept-entry` once: the draft production, its credits from the proposed team, collections, the entry's link, and `entry.accepted` with rights status, together or not at all | E3, E4 |
| PP-11 | As a programmer a declined or withdrawn proposal leaves the board | Declining in review, or the proposer withdrawing, removes the entry from the tray and deletes its pencils. Withdrawing an accepted entry removes its drafts and is refused while any performance is scheduled, pointing to core's cancellation | E5 to E8 |
| PP-12 | As a programmer I pencil shows not yet decided | A candidate dropped on the board makes a dashed pencil. Spaces' calendar and Rehearsals' planner show it as "Pencilled" and are not stopped by it. Accepting turns option-1 pencils into draft performances | P1, P2, E4 |
| PP-13 | As a programmer I am warned about changeovers and entry windows | A gap shorter than the space's changeover, or the two entries' get-out and get-in, warns; so does a time outside the entry's can windows or inside a cannot. A met preference shows a tick | W4, W6 |
| PP-14 | As a programmer I am warned when someone would be in two places | A person on the entry, or credited on its production, who is busy elsewhere in the window (another placement, a pencil, a rehearsal call) warns, naming them and the other commitment | W7 |
| PP-15 | As a programmer I match shows to suitable spaces | Tech needs come from a vocabulary I can extend. I record what each space offers. A required need the space lacks warns; a preferred one is a note | W8 |
| PP-16 | As a programmer I accept a warning I have weighed | Acknowledge, with an optional note, stops a soft warning asking for attention; it comes back by itself if the facts change. Hard warnings cannot be acknowledged | W11 |
| PP-17 | As a programmer I plan an ordinary season in weeks | Season view shows spaces against days with counts; I define offered slots (space, days, pattern from a run preset, takes); dropping an entry on a slot makes one draft per occurrence up to what it wants, refused when the slot is full. Proposers can choose slots in the call | P4 |
| PP-18 | As a programmer I put acts into a showcase | Dropping an entry on a performance adds it to that performance's line-up after I confirm; the act's notice names the host performance and its place in the order | P5, N7 |
| PP-19 | As a programmer I place an exhibition across opening hours | An entry of shape drop-in places as a band from opening to closing, drawn across the time, and counts as using the space for that whole time | P3 |
| PP-20 | As an act I am told my slots once | After publish each contact gets one message listing every slot with venue, space, day and times. A later change sends only what changed, old beside new; a cancelled slot says so. Pencils are never told | N1 to N3, N6, N8 |
| PP-21 | As a programmer I control when acts are told | With sending automatic, changes after publish are gathered for 30 minutes so ten drags make one message. With sending manual, nothing goes until I press Tell acts, which shows who will get what | N4, N5 |
| PP-22 | As a proposer I follow my entry | Under my account, My entries shows each entry's state in plain words and, once told, its slots. I see nothing of reviewers' scores or staff notes | `entry.view-own` |
| PP-23 | As a programmer I set up spaces for planning | In the cog modal I choose which spaces are on the board and their order, each one's changeover, and the tech features it offers. A changeover below core's turnaround is shown raised to it | W4, W8 |
| PP-24 | As a theatre I keep unsuccessful proposals only as long as I need | Declined and withdrawn entries are deleted with their entry windows and pencils when the retention period passes. Shortening the period asks for confirmation and says how many will go | Part 2 |

## Later (10)

| Id | Story | Waits for | Rules |
| --- | --- | --- | --- |
| PP-25 | As a programmer I see another programmer's moves as they happen | The realtime hub's channel for console pages | P8 |
| PP-26 | As a programmer I keep a second and third option and swap to one |  | P9 |
| PP-27 | As a programmer I adopt draft performances made elsewhere |  | P10 |
| PP-28 | As a programmer Companies' engagements wait in my tray and their contacts are told | Companies | Points entry-source, entry-contacts |
| PP-29 | As a festival programmer the board's days are the festival's days | Festival | Point board-days |
| PP-30 | As a programmer I import entries from a spreadsheet, and later a pretalx export | Core's programme import (C-63) for the shared format | Point import-format |
| PP-31 | As a programmer I publish one day or one collection at a time |  | U6 |
| PP-32 | As a programmer I read the plan on my phone |  | Part 5 |
| PP-33 | As a committee member I see entries by state and the share placed in Reports | Reports' `core.measure` | Part 4 |
| PP-34 | As a programmer I see funding asked for and awarded on an entry | Budgets and claims | Point entry-panel |

## The occupancy support module (3)

Question 1 was decided (d) on 23 November 2026: the engine is the support module `occupancy`, not core. It has no switch and is on while any module that requires it is on (this module, Spaces, Rehearsals). Its stories are this spec's; the module kind itself and the Modules screen change are core story C-65 (Integration R3-03). It owns no tables, so it has no id prefix.

| Id | Story | Acceptance criteria | Rules |
| --- | --- | --- | --- |
| OC-01 | As a module that shows a space's time, I read everything occupying a set of spaces in a window in one call | `occupancy({ spaceIds, from, to })` returns per space an ordered list: kind, source module, start, end, yields, record reference, and a label or "Busy". Performances, closures and public holidays come from core; every `core.space-busy` contribution is included. More than 31 days or 30 spaces is refused | O1 to O4 |
| OC-02 | As a module that shows a space's time, I draw it with one read-only grid | `OccupancyGrid` draws spaces against time in the eight calendar colours, with a word and a border for kind; it takes slots so the board can add drag and the tray, and Spaces' calendar (UI-35) can reuse it | O2, Interface calendar rules |
| OC-03 | As an administrator I can see that occupancy is on and why | Admin > Modules lists Occupancy with its state and "Needed by" naming the switched-on modules that require it; it has no switch. With none of them on it reads Off, and its service is not mounted | C-65 |

## Order of work

1. Foundations and core first: C-65 (the support-module kind), then OC-01 to OC-03, and the write services from the Festival-ready changes (`createProduction`, `createPerformance`, `movePerformance`, `schedulePerformances`). The gate cannot start without them.
2. Gate, in order PP-01 to PP-06. The publish proof (part 8) runs with PP-06.
3. The call (PP-08 to PP-11), then pencils and soft warnings (PP-12 to PP-16), then the season shape (PP-17 to PP-19), then telling acts (PP-20 to PP-22), then PP-23 and PP-24.
4. If time runs short, cut from the end of the first release: PP-19 and PP-18 first, then PP-17. A festival needs PP-18 and PP-19 more than PP-17; NNT the reverse.

## As built: the occupancy module (24 November 2026)

OC-01 to OC-03 are built in `layers/occupancy` on the kit's support-module kind (C-65, `support: true`; kit README, "Modules, records, facts and pages").

- **OC-01.** `occupancy({ spaceIds, from, to }, actor)` from `#modules/occupancy`. Each item carries `kind`, `module`, `from`, `to`, the operating days `day` and `lastDay`, `yields`, `record` and `label`. A performance's label is its production's title where the reader holds `core.production.view` on it; a closure's or holiday's title is always shown, since it says why the building is shut and never names a person; a contribution's label is the contributor's (O2). A closure that does not block performances, and every public holiday, yields. Refusals: `occupancy.too-long` (over 31 days), `occupancy.too-many-spaces` (over 30), `occupancy.window`, and `core.module.off` while no requirer is on.
- **`core.space-busy`** is declared by core here, as a code point (contract `layers/core/server/points/space-busy.ts`); core's `isSpaceFree(spaceId, from, to, { except })` now counts its contributions.
- **OC-02.** `OccupancyGrid` (`layers/occupancy/app/components/OccupancyGrid.vue`): spaces against operating days, each block drawn by core's `CalendarBlock`; a `look` prop chooses colour, edge and word per item, and `cell` and `block` slots let the board add drag and the tray. A list at phone width.
- **OC-03.** Admin > Modules lists support modules under "Comes on with other modules", with On or Off, "Needed by" while on and what would bring it on while off, and no switch.

## As built: the gate's first slice, PP-01 and PP-02 (24 November 2026)

Built in `layers/programme-planning`, with the plans, entries and placements tables of part 2 (`programme_planning_plans`, `_entries`, `_placements`). The other ten tables arrive with the stories that use them.

- **PP-01.** `POST /api/programme-planning/seasons/<season>/plan` starts the plan with the season's dates and the `board.day-starts`, `board.day-ends` and `publish.productions` settings, and announces `programme-planning.plan.started`. A second start returns the existing plan with `started: false`. `<season>` is the season's id or web address throughout. The overview, `GET /api/programme-planning/seasons/<season>`, gives the plan (or null), its entries by state, placed against wanted, and what the reader may do.
- **The Programme tab.** Core has no console page for a season (its record resolver points at the productions list), so there is no tab to add. The list of seasons at `/console/programme` is the way in, with "Start a plan" on each season the reader may plan, and the season's plan is `/console/programme/<season>` as part 5 gives it.
- **PP-02.** `POST /api/programme-planning/plans/<id>/entries` takes a typed-in entry as a candidate (E3: it is decided later). `POST .../bring` brings a draft production of the plan's season onto the board already accepted (E2), refusing one from another season (`programme-planning.entry.other-season`), one no longer a draft (`.not-draft`) or one already on a board (`.already-on-board`). `GET .../productions` lists what can be brought. `GET .../entries` lists entries accepted first, then candidates, each with `placed` (its placements whose performance is not cancelled) and `inTray` (W9). Both writes raise the plan's `version` and are refused on a closed plan.
- **Abilities.** All grants reach a plan through its season: the plan's record resolver names the season as its parent and the entry's names the plan, so a grant on one season reaches nothing in another (tested). Declared so far: `plan.view`, `plan.manage`, `placement.manage`, `entry.view`, `entry.manage`. `plan.publish` and `entry.decide` are declared with PP-06 and the accept action, since the conformance check refuses an ability nothing requires. `entry.decide` will act on `programme-planning.entry` rather than the plan, so the kit's `owner: 'refuses'` can stop a person deciding their own entry (it needs a record with an owner column). The `programmer` preset holds `plan.manage` until then.
- **Not yet:** the board (PP-03 to PP-05) and publishing (PP-06) wait on core's `createPerformance`, `movePerformance` and `schedulePerformances` (C-68, PR 693). The retention setting is declared; its sweep of declined and withdrawn entries comes with declining.
