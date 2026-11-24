# Availability: specification

2026-11-23 · Matthew Adcock

Availability is a new switchable module, `availability`, that lets each person say once when they can and cannot come, and lets anyone organising for a group find a time that suits everyone, then turn it into a rehearsal call, a training session or a meeting. It is the platform's version of [CallTime](https://www.calltime.online/), which Matt asked for on 23 November 2026, and Integration registered it as ruling R3-26.

## What it does

- **My availability.** A person keeps one availability for everything they do: a weekly pattern ("Term time: lectures Monday to Friday 09:00 to 17:00") plus dated exceptions ("Away 14 to 16 March"), each marked free, maybe or busy, with an optional reason that stays private unless they share it. Time they have not marked is unknown, never assumed free. They can also bring in busy times from Google, Microsoft or any calendar address, times only, never titles; anything they paint by hand wins.
- **Find a time.** An organiser picks people by group (a production team, a department, a rehearsal unit, a committee, a course's waiting list) or by name, a date range and a length, and sees an overlap grid: how many are free in each slot, who is busy, maybe or unknown, and what they are already committed to elsewhere through `core.person-busy` (C-66). A ranked list of best times sits beside it.
- **Polls.** When the grid leaves a choice, the organiser shortlists two to six slots and asks the group to answer yes, if need be, or no, as on Doodle.
- **Turn it into something.** A chosen slot opens a prefilled draft in the module that owns the result: a rehearsal call (Rehearsals), a training session (Training), a committee meeting (Governance, GV-23), or Availability's own small arranged meeting for anything else (production meetings, socials).
- **Availability requests.** An organiser, or Rehearsals for a schedule, asks a group to check their availability for a period by a deadline. Reminders go as notifications. Closing a request stops the chasing only; nobody is ever locked out of their own availability.

## What changes elsewhere

- **Rehearsals requires Availability.** Its per-production stated conflicts (table `rehearsals_conflicts`, rules F1 to F5) move here, as R3-04 now says. The planner reads `levels()`; busy raises its clash warning, maybe shows a softer note.
- **Front of house** shows maybe, busy or unknown beside each volunteer on the rota grid and the assign dialog (FH-48), when Availability is on.
- **Productions, Rehearsals, Governance and Training** contribute groups of people; Rehearsals and Training contribute targets; Productions shows arranged meetings on its schedule and an Availability workspace tab.
- **core.person-busy** gains Availability as a contributor (stated busy, firm false; arranged meetings, firm true) and a `source` field on every row.
- **Identity and the calendar feed** (proposed, 24 November): Identity lends its Google and Microsoft provider credentials for a separate calendar consent, shared with Festival-ready's Microsoft and OpenID sign-in; the core feed (C-70) marks its own events so imports never bring them back.

## How CallTime maps here

| CallTime | This module |
| --- | --- |
| A role in a production ("Hamlet", "Stage Manager") with its own calendar | A group a module contributes: a position, a department, a rehearsal unit, a committee |
| A personal calendar used for every role you claim | My availability, one per account, used everywhere |
| Free or busy per half hour; whole day by clicking the date; drag to select | Free, maybe or busy; whole day; drag; a weekly pattern on top, which CallTime lacks |
| Organiser ticks roles and sees overlapping busy times, with who is busy on hover | Find a time, with counts, names, and commitments from every module |
| "Updated 10 minutes ago", "Updated never" under each role | The same freshness line, plus "checked to" from requests |
| Anyone can fill in a role without an account | Later (AV-27): a signed link for someone with no account |

## Shape of the spec

Fourteen tables (`availability_*`), 37 rules, 14 screens, 19 settings, 8 abilities and 32 stories (AV-01 to AV-32: 8 gate, 20 first release, 4 later), with 36 tests. Under-18s are handled through Integration's R3-25: Find a time warns, to planners only, when a slot ends after `core.under-18.latest-finish` for someone under 18, and when the chosen people are exactly one adult and one under-18. Matt answered all nine questions on 24 November (tab 9): eight as recommended, and calendar imports brought into the first release, which added rules I1 to I6, S14, two tables, six settings, AV-31, AV-32 and T-AV-32 to T-AV-36.

## Status

Draft for Matt's review, written on 23 November 2026; his answers folded in on 24 November. Seams agreed the same afternoon with Rehearsals, Productions, Festival-ready changes (C-66, FH-48), Governance, Training, Programme planning and Integration (R3-04 amended, R3-25, R3-26).
