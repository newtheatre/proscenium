# 1. Scope and glossary

Rehearsals lets a production's stage manager plan rehearsal calls, see who is free, book the room for each call through Spaces, and tell each person exactly when and where they are needed. It is module `rehearsals`, switchable, requires `productions`, spaces and occupancy, and owns ten tables. Story prefix RH.

## What it does

- **A rehearsal schedule per production.** The rehearsal period, the default room and the default call times, set once by the production's leads.
- **Units.** The script broken into scenes or numbers, each with the people in it, so calling "Act 2 scene 3" calls the right people.
- **Calls.** A dated block with a kind (rehearsal, music, fight, fitting, technical, dress), a place, a running order of units and the people called, each with their own time if it differs.
- **Availability.** Cast and crew say once, in the Availability module, when they are free, maybe or busy (Integration ruling R3-26). Rehearsals asks for it by a date, reads it on the planner, and warns when someone is called while busy or on something else (a shift, a training session, another call).
- **Room booking.** A call held in a bookable room makes and owns its Spaces room booking in the same save, so the schedule and the room diary can never disagree. Losing the room (declined, bumped) flags the call.
- **Call sheets.** Issuing the schedule for a window (usually a week) publishes the calls in it and sends each person one message listing only their own calls. Later changes reach only the people they affect.
- **Acknowledging and attendance.** A called person can mark a call seen or say they cannot make it. The stage manager may record who came.
- **Rehearsal reports.** After a call, notes by department, sent to the team, with actions a department ticks off.
- **Personal calendar.** Each person's calls in My account, on the members' home and in core's one personal calendar feed (core.calendar-feed).

## What it does not do

| Not here | Where it is |
| --- | --- |
| Who is on the production team, their positions and departments | Productions (`productions_team_members`, service `listTeam`) |
| Auditions and casting | Not in this round. Sign-up slots are a form (Form builder); casting is a later Productions question |
| The production timeline, tasks and milestones ("Tech week") | Productions. Rehearsals contributes its calls to `productions.schedule-entry` and announces published calls so a milestone can tick |
| Show reports per performance and the show-call screen | Productions |
| Rooms, resources, approval, clashes between bookings | Spaces. Rehearsals only calls `requestBooking`, `changeBookingOfOrigin` and `cancelBookingsOfOrigin` |
| Performances, get-ins and changeovers that belong to a performance | Core and Programme planning. A technical or dress rehearsal is a Rehearsals call |
| Whether a person is busy elsewhere | Core's point `core.person-busy` (Festival-ready story C-66), which every module contributes to |
| Front of house shifts and rota availability | Front of house |
| Training sessions | Training, which reports room use through `core.space-busy` and does not book through Spaces |
| Child performer licences and chaperones | Later (question 6) |
| Anything public | Nothing in this module is public |

## Glossary

This module owns these words. Words owned elsewhere keep their owners' meaning: production, performance, space and venue are core's; team member, position and lead are Productions'; department is core's; bookable, room booking and purpose are Spaces'; account, role and grant are Identity's; ability, fact, point and unit of work are Foundations'.

| Word | Meaning |
| --- | --- |
| rehearsal schedule | One production's rehearsal period and defaults, and every call in it |
| rehearsal period | The dates from the first call to the last, set on the schedule. Availability is asked for across it |
| call | One dated block of rehearsal for one production: a kind, a start and an end, a place, and the people called. Always "rehearsal call" outside this document, never "booking" or "session" |
| call kind | What a call is for, from the vocabulary `rehearsals.call-kind`: rehearsal, read-through, music, movement, fight, fitting, technical, dress, photocall. Each kind names the Spaces purpose its room booking uses |
| called | A person is called to a call when they are on its list. A person's call time is when they must arrive, which may be later than the call's start |
| unit | A part of the script rehearsed as one piece: a scene, a French scene or a musical number, with the people in it |
| running order | The units a call works through, in order, with an optional time for each |
| conflict | Kept as everyday speech for busy time a person stated in Availability, worded against a call: unavailable, late until a time, or leaving at a time. Rehearsals stores none; reasons are Availability's |
| clash warning | The planner's note that a person is called while busy in Availability or against a commitment from `core.person-busy`. A clash warning never refuses |
| call sheet | One issue of the schedule for a window: which calls it published and when. Each person receives their own view of it |
| issue | To publish a call sheet. Draft calls in the window become published and each person called is told once |
| change notice | The message a person gets when a published call that concerns them changes |
| room state | The state of a call's room booking, as Spaces reports it: none, requested, confirmed, lost |
| rehearsal report | Notes written after a call, by department, sent to the team |
| action | A report note that asks a department to do something, open until that department ticks it |
| schedule manager | The words screens use for a person holding `rehearsals.schedule.manage` on a production: usually its stage manager and director. Not a role key |

### Words that needed a ruling

| Word | Clash | Use here |
| --- | --- | --- |
| call | Productions' show-call screen (the half, the quarter, beginners) and Front of house's "call time" for a shift | "Rehearsal call" everywhere outside this document. Front of house's call time is a shift's arrival time, a different record |
| booking | Box office's ticket booking and Spaces' room booking | Rehearsals never says booking alone: "room booking", as integration ruled |
| session | Training's dated session of a course; Identity's sign-in session | Never used for a call |
| availability | Box office's seat availability; Front of house's later rota availability | Rehearsals says "conflicts" for what a person cannot do and "free" for the planner's view |
| report | Productions' show report; Reports module | Always "rehearsal report" |
| department | `Core's vocabulary core.department (shared with Productions, Budgets and Inventory)` | Used as core defines it |

## Assumptions carried in

1. **Productions is on.** The team comes from `listTeam(productionId)`; the facts `productions.team-member` and `productions.team-lead` hold on `core.production` (agreed with the Productions thread, 23 November 2026).
2. **Spaces is on.** A call in a bookable room makes its room booking through Spaces' services with the call as origin, as Spaces' part 4 already allows (its story SP-37). A call elsewhere names the place in words and books nothing.
3. **Settings are site-wide.** A value that varies by production lives on the schedule row and falls back to the setting (Foundations' ruling of 16 November 2026).
4. **Members' side only.** An audience account never sees this module.
5. **Times.** Calls are stored as instants and shown in the theatre's time zone. A rehearsal day is a calendar day, not core's 04:00 operating day, because rehearsals run in the daytime and evening; a call that runs past midnight belongs to the day it starts.
6. **D1 and the kit.** Every write goes through a unit of work; anything that writes one row per person is set-wise, ids scoped by subquery and parameters chunked at 90.
