# 7. Stories

Rehearsals has 51 stories, RH-01 to RH-51: 4 gate, 40 in the rest of its first release and 7 later. RH is a new story prefix; no spec or backlog file uses it. Each story cites the rules in part 3 it delivers, and is done when those rules' tests in part 8 pass.

|  | Gate | Rest of first release | Later | All |
| --- | --- | --- | --- | --- |
| Stories | 4 | 40 | 7 | 50 |

The gate is the proof that a call and its room cannot disagree: saved together, moved together, cancelled together, and told when Spaces takes the room away. Nothing else is worth building until it passes. The module cannot ship before Spaces' first release (and so Interface's Calendar component, UI-35) or before Productions' team (`listTeam`).

## Gate

| Id | As | I want | So that | Rules | Rests on |
| --- | --- | --- | --- | --- | --- |
| RH-01 | a developer | the module, its ten tables, record types, abilities and the call-kind vocabulary declared | everything else has somewhere to stand | parts 2, 4, 6 | The kit; Productions' module and `listTeam`; Spaces' SP-01 to SP-04 and SP-37 |
| RH-02 | a stage manager | a call saved in a room to make its room booking in the same save, or not save at all | the schedule and the room diary never disagree | B1, C6 | RH-01; Spaces' `requestBooking` with an origin |
| RH-03 | a stage manager | moving, deleting or cancelling a call to move or cancel its room booking in the same save | I never hold a room I no longer need, or lose one I still do | B2, B3 | RH-02 |
| RH-04 | a stage manager | each call to show its room's real state, kept from Spaces' events | I see at once when a room is declined or bumped | B4 | RH-02 |

## Setting up

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| RH-05 | a stage manager | to set the rehearsal period, the usual room or place, and default start and length | making a call is one click | part 2, schedules | First |
| RH-06 | an administrator | a starting list of call kinds, each using a Spaces purpose I can change | a tech rehearsal gets priority over a meeting | B7, part 6 | First |
| RH-07 | an administrator | the module's settings on one page | the theatre's habits are set once | part 6 | First |
| RH-08 | a stage manager | to break the script into units by pasting a list | I don't type sixty scenes one at a time | part 5, P3 | First |
| RH-09 | a stage manager | to tick who is in each unit on a grid | calling a scene calls the right people | U2, P3 | First |

## Making calls

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| RH-10 | a stage manager | to make a call in a place that isn't bookable, named in words | wardrobe fittings and off-site rehearsals are in the schedule too | C3 | First |
| RH-11 | a stage manager | to call people from the production's team, and nobody else | the list matches the company | C5, U2 | First |
| RH-12 | a stage manager | to add units to a call's running order and have their people called | I plan by scene, not by name | U1 | First |
| RH-13 | a stage manager | each person's own call time and release, suggested from the running order | nobody waits two hours for their scene | U4 | First |
| RH-14 | a stage manager | to change a unit's people and choose which published calls follow | a recast doesn't silently change last week's sheet | U5 | First |
| RH-15 | a stage manager | a week of days on a grid with calls as blocks, and each room's other uses shown | I plan the week at a glance | part 5, P1 | First; rests on UI-35 and Programme planning's `occupancy` |
| RH-16 | a stage manager | to drag a call to another time and copy a week forward as drafts | a regular schedule takes minutes | B2, part 5 | First |
| RH-17 | a stage manager | warnings when a call is outside the period, too long a day or too late | I keep within the building's and the cast's limits | W1, W4, W5 | First |
| RH-18 | a stage manager | to see Spaces' answer as I type the time and room | I pick a free room first time | C6, part 5, P2 | First |

## Availability

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| RH-19 | a cast member | the availability I give once in Availability to be what every schedule plans around | I don't repeat it for each show | F2 | First; rests on Availability |
| RH-20 | a stage manager | to ask the team for their availability by a date, through Availability, and close the request | I have them before I plan | F1 | First; rests on Availability |
| RH-21 | a stage manager | my units offered as groups, and a "Rehearsal call" target, in Availability's Find a time | a slot I find there becomes a draft call with its people | F3 | First; rests on Availability |
| RH-22 | a stage manager | a warning when I call someone who is busy, and a softer note when they are maybe | I call them knowingly or not at all | W2, F2 | First |
| RH-23 | a stage manager | a warning when I call someone who is on a shift, a training session or another call then | people aren't in two places | W3 | First; rests on Festival-ready's C-66 |
| RH-24 | a stage manager | a strip of who is unavailable each day above the planner, and a grid of the whole period | I see the gaps before I fill them | F2, part 5, P1 and P4 | First |
| RH-25 | the theatre | published calls offered to `core.person-busy` as firm | other planners can warn too | F3 | First; rests on C-66 |

## Telling people

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| RH-26 | a stage manager | to issue a week's call sheet that publishes its drafts and sends each person only their own calls | everyone gets one clear message | S1, S2 | First |
| RH-27 | a stage manager | to publish a single call on its own | a one-off fitting doesn't need a sheet | S4 | First |
| RH-28 | a cast member | to be told only about changes that affect me, once, however many edits are made | my inbox isn't noise | N1, N2 | First |
| RH-29 | a cast member | a change or cancellation within a day to reach me by email at once | I don't turn up to a cancelled call | N3 | First |
| RH-30 | a stage manager | to cancel a call with a note that reaches everyone called | nobody turns up for nothing | moves table, B3 | First |
| RH-31 | a cast member | a list of my calls with my own times, place and running order | I know when and where to be | V1, part 5, M1 and M2 | First |
| RH-32 | a cast member | to mark a call seen, or say I can't make it with a note | the stage manager knows | A1 | First |
| RH-33 | a cast member | a reminder before my call, my next calls on my home page, and my calls in my personal calendar feed | it's in the calendar I already use | N4, V4, part 4; rests on core.calendar-feed (C-70) | First |
| RH-34 | a director | to choose whether the cast see the whole schedule or only their own calls | it suits how my company works | V2 | First |
| RH-35 | a stage manager | a printable day-by-day call sheet | it goes on the rehearsal room wall | part 5, P6 | First |

## When things change elsewhere

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| RH-36 | a stage manager | to be told at once when a call's room is declined or bumped, and warned while one is still unconfirmed close to the day | I find another room in time | B5, B6 | First |
| RH-37 | a stage manager | someone leaving the team to drop off future calls, with a notice to them | the schedule matches the company | U3 | First |
| RH-38 | a producer | a cancelled production to cancel its future calls and rooms and tell everyone once | nothing lingers | L1 | First |
| RH-39 | a producer | published calls on the production timeline, and tech and dress milestones ticked by them | one place shows the whole production | part 4, `productions.schedule-entry`, events | First; rests on Productions |
| RH-40 | a member | my calls and responses in my data download, and removed or anonymised when I am erased | my data is handled like everywhere else | part 2, part 4 | First |
| RH-50 | a stage manager | to see in the planner and team list who is under 18 on the date of each call, and optionally a warning when their call ends late | I can take care with late calls and get-outs | W6, W7 | First; rests on core's ageStatus (R3-25, Identity's C-74) |
| RH-41 | a stage manager | to record who came, late or absent | I can follow up, and the company knows its hours | A3 to A5 | First, attendance off by default (Matt, question 5) |
| RH-42 | a stage manager | to write a rehearsal report by department, flag actions and send it | departments hear what the rehearsal needs | R1 to R3 | First (Matt, question 5) |
| RH-51 | a committee member | each person's hours attended at rehearsals to appear in Reports' person figures | I can see who is putting time in across productions without opening every schedule | A5; part 4, core.person-measure | First (R3-27); rests on RH-41, so only where attendance is switched on |

## Later

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| RH-43 | a committee member | rehearsal figures in Reports: calls held, hours, attendance, lost rooms | we see how the season used its rooms and people | part 4, `core.measure` | Later; rests on Reports |
| RH-44 | a room manager | every production's calls this week in the console, with unconfirmed and lost rooms | I can sort rooms before people turn up | part 5, C2 | Later |
| RH-45 | a stage manager | a nudge to people who haven't marked a call seen | I don't chase by hand | A2 | Later |
| RH-46 | a stage manager | a call kind to need a qualification, such as a current stage combat certificate for a fight call | only qualified people are called to it | `core.requirement` | Later; rests on Training |
| RH-47 | an amateur company | child performers' hours checked against their licence and a chaperone called with them | we meet the law on children in performances | question 6a | Later |
| RH-48 | a cast member | to be told when I'm not called in a week | I don't wonder | S3 | Later |
| RH-49 | a member | a cancelled or changed call to update in my calendar app without my subscribing again | I subscribe once | question 7 | Later; rests on C-70 |

## Order of work and what to cut

1. Gate, RH-01 to RH-04.
2. RH-05 to RH-13, RH-26, RH-31: a stage manager can make and issue calls by unit and people can see them. This is the smallest release worth giving a production.
3. Availability and warnings, RH-19 to RH-25.
4. The rest of telling people and change handling, then attendance (off by default) and reports, RH-41, RH-42 and RH-51.

If the release must shrink, cut in this order: RH-35 (print), RH-16 (drag and copy), RH-24 (strip and grid; the warnings in P2 remain), RH-34 (always full), RH-14 (published calls follow units automatically after confirmation).
