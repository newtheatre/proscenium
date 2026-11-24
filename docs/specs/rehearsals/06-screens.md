# 5. Screens

Rehearsals has thirteen screens: four for anyone called (My conflicts went to Availability, ruling R3-26), seven for the people who run a production's rehearsals, and two in the console. The manager's screens sit in the production's members-side workspace, beside Productions' team and tasks, because stage managers are members, not staff.

## Where they live

- **Anyone called:** My account and the members' home. Entries: "Rehearsals" under My account, the home card "Your rehearsals this week", and Upcoming.
- **Schedule managers and the team:** a "Rehearsals" tab in Productions' production workspace (`/members/productions/<slug>/rehearsals`), `contributed to Productions' point productions.workspace-tab (beside its Overview, Team, Tasks, Schedule, Show reports and Rights tabs)`. Its sub-pages are Planner, Breakdown, Availability, Call sheets and Reports.
- **Console:** Admin > Modules > Rehearsals for settings and call kinds, and a read-only "Rehearsals this week" across productions for room managers.
- Nothing is public, and nothing is a live-mode screen.

## Inventory

| # | Screen | Address | Who sees it | Does |
| --- | --- | --- | --- | --- |
| M1 | My rehearsals | `/members/account/rehearsals` | Anyone with a published call | Their calls by day: own call time, place, running order. Seen, Can't make it, Add to calendar, a link to core's calendar feed |
| M2 | A call | side panel from M1, or `/members/rehearsals/calls/<id>` | The person called | Full call: notes, map link for the venue, running order, who else is called (when the team sees full) |
| M4 | Your rehearsals this week | home card | Anyone called this week | Next three calls, with "See all" |
| M5 | Calendar feed | panel in M1 | Signed in | A link to core's one personal calendar feed, which includes these calls |
| P1 | Planner | `…/rehearsals` | `rehearsals.schedule.view` | Week grid of calls, a strip of who is unavailable each day, the room's other uses. Make, move and copy calls |
| P2 | Call editor | side panel over P1 | `rehearsals.schedule.manage` | Kind, time, room or place with live room state, running order, people with warnings, own times, notes. Publish this call |
| P3 | Breakdown | `…/rehearsals/breakdown` | view; manage to edit | Units down, team across, a tick where a person is in a unit. Import units by pasting lines |
| P4 | Availability | `…/rehearsals/availability` | view; reasons `only where shared and Availability's canPlan allows` | People down, days across, shaded where unavailable. Ask the team for availability; close or reopen the request |
| P5 | Issue a call sheet | `…/rehearsals/sheets/new` | manage | Choose a week, see what will publish and a preview of one person's message, add a covering note, issue |
| P6 | Call sheet, printable | `…/rehearsals/sheets/<n>` | view | A day-by-day sheet for the rehearsal room wall, A4, light theme |
| P7 | Attendance and report | `…/rehearsals/calls/<id>/after` | manage; team reads sent reports | Tick who came; write notes by department, flag actions, send |
| C1 | Rehearsal settings | Admin > Modules > Rehearsals | `rehearsals.settings.manage` | The settings in part 6, and the call kinds with the room purpose each uses |
| C2 | Rehearsals this week | `/console/rehearsals` | `rehearsals.schedule.view` site-wide | Every production's calls this week; filters for no room confirmed and room lost. Read-only; links to each planner |

## P1, the planner

The planner is a week of days across and hours down, on Interface's shared Calendar component (UI-35) with one column per day. Calls are blocks showing kind, title and room state as a word and a border, never colour alone. Above the grid, a strip per day lists who is unavailable, as initials with "late 19:30" or "leaves 21:00"; hovering or focusing a name shows the full name, never the reason.

(Diagram in the Claude Doc: https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) wireframe P1 · planner, desktop week

- Choosing an empty slot opens P2 with the schedule's defaults. Dragging a call moves it; the save runs every rule and shows Spaces' answer before it lands.
- "Copy week" duplicates a week's calls as drafts a week later, each with its own room booking request.
- Draft calls are drawn outlined and labelled DRAFT. The issue button says how many drafts the week holds: "Issue call sheet (4 drafts)".
- On a phone the planner is a list by day (Interface's List view of the same component), with the unavailable strip as a line under each day heading.

## P2, the call editor

A side panel, so the week stays in view. Warnings sit next to what they are about and never block Save.

(Diagram in the Claude Doc: https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) wireframe P2 · call editor side panel

- People called through a unit show the unit; people added directly show "added". Removing someone who has been told asks for confirmation and says they will get a message.
- The room line updates as the manager types, from Spaces' `checkRequest`: free, needs approval, or taken by what, with the nearest free time (Spaces' rule C3).
- A clash warning names the kind of commitment only ("front of house shift"), never someone else's details.

## M1, my rehearsals, on a phone

(Diagram in the Claude Doc: https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) wireframe M1 · my rehearsals, phone

- The person's own call time leads, not the call's start. A changed call shows "Changed: now 20:00" until it is seen again. A cancelled one is struck through with the note.
- "Can't make it" opens a short note field; sending tells the managers.
- Every control meets the members' area 44-pixel target. "Seen" is one tap with Undo for ten seconds, as Interface asks.

## P3, P4 and P7 in brief

- **Breakdown (P3).** A matrix: units down the side, grouped by act; the team across, grouped by department and filtered to cast by default. A tick toggles membership; keyboard arrows move, Space toggles. Pasting lines such as "1.1 Elsinore battlements" creates units. A count per unit shows how many people it calls.
- **Availability (P4).** People down, the rehearsal period across, one cell per day shaded by Availability's level (busy, maybe, unknown) with a pattern and a word for each, not colour alone, worded against the day's calls (unavailable, late until, leaves). Nobody enters availability here: a person does it once in Availability. A reason shows only where the person shared it and Availability's canPlan allows the viewer. "Ask the team" opens the schedule's availability request (rule F1) with the due date.
- **After the call (P7).** Two parts on one page. Attendance: the people called, each with Present, Late, Absent, Excused as a segmented control, and "Mark the rest present". Report: a summary, then one note per department chosen from a dropdown, each with an "Action" checkbox; Send shows who will receive it.

## Words on screen

All copy goes through `t()` with British English. A few fixed phrases: "You're called", "Room to be confirmed", "Room lost: declined by the Theatre Manager", "Not called this week", "Unavailable" (never the reason), "Issue call sheet", "Can't make it". The kind names come from the vocabulary, so a theatre can say "Music rehearsal" in place of "Music call".

## Accessibility

- The planner grid has the Calendar component's spoken labels: "Tuesday 3 March, 19:00 to 22:00, rehearsal, units 1.1 to 1.3, Studio 1, room requested, draft".
- The unavailable strip and the availability grid read as "C. Davies, late until 19:30".
- The breakdown matrix is a real table with row and column headers, so a screen reader names the unit and the person for each tick.
