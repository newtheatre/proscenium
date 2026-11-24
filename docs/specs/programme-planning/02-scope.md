# 1. Scope

Programme planning gathers what might go into a season, helps a programmer place it into spaces and times without clashes, and publishes the result as core performances. It is module `programme-planning`, switchable, requires nothing but core, uses `forms` and `companies`, and owns thirteen tables.

## What it does

- **Plans.** A season may have one plan: the working state of its programme, with the date range the board shows, and a record of when it was published.
- **The call.** An optional form in the slot `programme-planning.call`, open between two dates, built in the form builder. Answers that matter for planning (length, entry windows, tech needs, rights, preferred slot, people) are bound to this module's own columns, so the board can check them.
- **Offered slots.** For an ordinary season, a programmer may define the windows on offer before the call ("Studio, week 3, Wednesday to Saturday at 19:30"), so proposers can say which they want and the board can place a whole run at once.
- **Entries.** One per thing that might be programmed, from the call, from Companies, or typed in. An entry carries what the board needs: length, get-in and get-out, how many performances, entry windows (when the act can and cannot play), tech needs, people, rights status.
- **Review stays in forms.** Scores, conflicts of interest, rounds and the decision are the form builder's (FB-401 to FB-407). This module shows the outcome and offers the accept action.
- **Accepting.** The outcome action `programme-planning.accept-entry` creates the draft production through core, links it to the entry, and turns the entry's pencils into draft performances, all in one unit.
- **The tray and the board.** Unplaced entries in a tray; spaces across, time down, a Day view for festivals and a Season view for runs; drag to place, drag to move.
- **Pencils.** A tentative placement for an entry not yet decided, or a second option for one that is. A pencil is this module's row; it shows to Spaces and Rehearsals as yielding occupancy, and never stops anyone.
- **Clash warnings.** Space, changeover, the turnaround, closures, the act's entry windows, the same person in two places, tech needs the space lacks, and a count of performances short of what the entry wanted.
- **Publishing.** One action schedules every draft performance in the plan, in one unit, or refuses quoting each hard clash.
- **Telling acts.** One notice per person after publish, listing their slots; later only what changed.
- **The occupancy view.** The specification of the shared read of a space's time (performances, closures, room bookings, rehearsals, pencils), which this module's board, Spaces' calendar and Rehearsals' planner all draw. It is built in core as story C-65 (question 1).

## What it does not do

| Not here | Where it is |
| --- | --- |
| The form, its stages, review rounds, scores, conflicts, decisions | Form builder |
| Productions, performances, the space guard, closures, collections, line-ups, drop-in performances, programme import | Core (and the Festival-ready changes spec for the last four) |
| Marking a season a festival, the public timetable, My plan, festival wording, venue-day sheets, exhibitions, headcount views | Festival |
| The company record, engagements, contacts' own view of their events, guest allocations, settlements | Companies |
| Rehearsal calls, including tech and dress in the performance space | Rehearsals, through Spaces |
| Production team, tasks, rights and licence records, show reports | Productions. This module only records the rights status the proposer gave |
| Budgets and funding awarded to an act | Budgets and claims |
| Room bookings and their approval | Spaces |
| Prices, on-sale dates, tickets | Box office. Publishing schedules performances; it does not put them on sale |

## What it assumes of other modules

1. **Core** keeps one season per production (ruling C2) and adds the write services `createProduction`, `createPerformance`, `movePerformance` and `schedulePerformances`, guarded as scheduling is today (Festival-ready changes, agreed 23 November 2026).
2. **Core** offers `core.space-busy` and adds `core.person-busy` (C-66), so warnings never read another module's tables.
3. **Core** builds the occupancy service and component (C-65) to the shape in tab 4.
4. **Forms** runs outcome actions exactly once (FB-506, built) and lets a module bind answers to its own attributes (`forms.bindable`, FB-505).
5. **Companies**, when on, contributes contacts and waiting engagements to this module's points and listens for its accept event.
6. **Festival**, when on, contributes festival days to the board's day selector.
7. Settings are site-wide; anything that varies by space is a column here that falls back to a setting (Foundations, 16 November 2026).

## Glossary

Words owned elsewhere are used as their owners define them: season, production, performance, space, venue, closure, collection, line-up and turnaround are core's; response, stage, review and outcome action are the form builder's; engagement and company are Companies'; act and festival day are Festival's public words; room booking is Spaces'.

| Word | Meaning |
| --- | --- |
| plan | The working programme of one season. At most one per season |
| call | The season's invitation to propose, through the form in `programme-planning.call`, with opening and closing times |
| entry | One thing that might be programmed in a plan. Becomes linked to exactly one production when accepted |
| entry source | Where an entry came from: call, manual, companies, import |
| offered slot | A window a programmer offers in a call: a space, a range of days and a pattern of start times |
| tray | The list of entries in a plan with fewer placements than they asked for |
| board | The console screen that places entries into spaces and times |
| placement | A draft or scheduled core performance that this module made for an entry. The word for the link, not a second record of the time |
| pencil | A tentative placement held only in this module, for an entry not yet accepted or as an alternative |
| get-in, get-out | Minutes an entry needs in the space before its start and after its end |
| changeover | Minutes a space needs between one use and the next, set per space here, at least core's turnaround |
| tech need | A requirement from the vocabulary `programme-planning.tech-need` (blackout, piano, projector) that an entry may need and a space may offer |
| warning | A clash found by the board, of one of nine kinds. Never blocks a move |
| hard clash | A warning that will refuse at publish: an exclusive space taken, a blocking closure, the turnaround |
| acknowledged | A warning a programmer has accepted, with an optional note, so it stops asking for attention |
| publish | Scheduling every draft placement in a plan in one unit |
| slot notice | The message telling an entry's contacts their slots |

### Words that needed a ruling

| Word | Clash | Use here |
| --- | --- | --- |
| slot | The form builder's "slot" is where a form sits | In this module "offered slot" always; the call is "the call slot" only in technical text |
| proposal | Used loosely for a submission | "Entry" in the data and staff screens; "proposal" only in call wording a theatre writes |
| act | Festival's public word for a company in a festival | Not used in staff screens; the notice says "your performances" |
| occupancy | Box office uses it for seats sold | Here it means a space's time taken. Reports calls the seat figure "capacity filled" and the room figure "room use" (agreed with Reports, 23 November 2026) |
