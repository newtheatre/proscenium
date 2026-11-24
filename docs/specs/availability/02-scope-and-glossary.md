# 1. Scope and glossary

Availability owns what a person says about their own time, the search across a group's time, polls, availability requests and arranged meetings. It owns no rehearsal, session, shift or room booking: those stay with the modules that own them, which it hands a prefilled draft.

## In

| Area | What is in |
| --- | --- |
| My availability | One availability per account: weekly patterns with date ranges, dated exceptions, levels free / maybe / busy, optional private reason with per-entry sharing, a person's own choice of what unmarked time means, freshness ("updated 3 days ago", "checked to 14 March"); busy times brought in from Google, Microsoft or any calendar address, one way and times only (first release, Matt 24 November) |
| Entry on someone's behalf | A planner adds a dated busy entry for a person in a group they plan for (a phoned-in absence); marked with who added it; the person is told and can change it |
| Groups | A point other modules contribute to: a group has members and says who may plan for it |
| Find a time | Pick groups and people, must-have and optional, date range, daily hours, length; overlap grid; best times; commitments from `core.person-busy`; optional rooms from the occupancy support module |
| Polls | Shortlist 2 to 6 slots; invitees answer yes, if need be, no; organiser decides |
| Targets | A point other modules contribute to: "turn this slot into…" opens their prefilled draft |
| Arranged meetings | Title, time, place (words or a Spaces booking), context (a production, a committee), invitees with going / not going; notifies on change; feeds the calendar feed and `core.person-busy` |
| Availability requests | Ask a group to check a period by a deadline; reminders; who has answered; opened by people or by modules (Rehearsals schedules) |
| Under-18 warnings | Late finish and one-to-one warnings in Find a time and on meetings, from R3-25 |

## Out

| Not here | Where it is |
| --- | --- |
| Rehearsal calls, call sheets, attendance | Rehearsals |
| Shifts, sign-up, rota | Front of house (FH-48 reads `levels()`) |
| Training sessions and places | Training |
| Room and space bookings | Spaces; a "Room booking" target is later (AV-28) |
| Committee meetings with minutes | Governance, GV-23 (first release), which contributes a "Committee meeting" target for body groups |
| An act's or show's can / cannot / prefer windows | Programme planning's entry windows (`prefix ppew`, rule W6). They describe an entry, not a person, and acts without accounts have them |
| Commitments (performances, shifts, calls, sessions) | Each owner, read through `core.person-busy` |
| Writing to Google or Outlook calendars, or reading event titles from them | Nowhere: imports (AV-26, AV-31) are one way and busy-only (I3). The core calendar feed (C-70) carries arranged meetings out |
| Availability for people with no account | Later (AV-27) |
| Payment, money, tickets | Nothing in this module touches money |

## What it assumes of other modules

- **Core**: `core.person-busy` (C-66) returns rows with `source`, so Find a time can drop its own rows and say where a clash comes from. `ageStatus(person, on)` returns under-18 or unknown, never a date (R3-25, C-74). The shared setting `core.under-18.latest-finish` is a time and ships unset. The notification pipeline sends requests, reminders and meeting notices. The calendar feed point (C-70) carries meetings. `core.department` terms (R3-07) name departments.
- **Identity** (proposed, 24 November): a core service to ask an extra calendar consent from the Google or Microsoft sign-in provider already set up on Identity's provider cards, and hand back an encrypted refresh token (I2). Shared with Festival-ready's Microsoft and OpenID sign-in (ID-47), which ships at the same time. The calendar feed (C-70) marks its event ids so imports can drop them (I4).
- **Productions**: contributes groups `productions.team:<productionId>`, `productions.department:<productionId>:<slug>`, `productions.position:<productionId>:<positionId>` for non-archived productions; members from `listTeam`; canPlan for the production's team leads and holders of `productions.team.manage`. Takes arranged meetings through `productions.schedule-entry` and an Availability item through `productions.workspace-tab`.
- **Rehearsals**: requires this module; contributes `rehearsals.unit:<id>` groups and the "Rehearsal call" target; opens and closes requests for its schedules.
- **Governance**: contributes `governance.body:<id>` groups (current post holders; canPlan for anyone holding a post in that body).
- **Training**: contributes the "Training session" target (`training.session`) and `training.course-waiting:<courseId>` groups.
- **Front of house**: reads `levels()` on the rota grid and assign dialog; contributes no target.
- **Occupancy** (support module): when on, Find a time can show whether chosen spaces are free, through its read-only `occupancy()`.

## Glossary

Words this module owns. Other specs cite them.

| Word | Meaning |
| --- | --- |
| Availability | What a person says about their own time: free, maybe or busy, by weekly pattern and dated exception. Never a commitment |
| Level | One of free, maybe, busy, and the derived unknown |
| Unknown | Time a person has not marked. Shown grey, counted as neither free nor busy, unless the person chose "treat unmarked time as free" |
| Weekly pattern | A named set of weekly times that applies between two dates ("Term time") |
| Exception | A dated entry that overrides the pattern for its days and times |
| Commitment | Something a module has put a person down for (a performance, a shift, a published call, a session place, an arranged meeting), read from `core.person-busy` |
| Group | A set of people a module contributes, with a rule for who may plan for it |
| Planner | Someone for whom a group's canPlan is true, or who holds `availability.find.anyone` |
| Find | One use of Find a time; saved only when it becomes a poll |
| Slot | A start and end time of the find's length |
| Must-have | A person or group without whom a slot is not offered as a best time |
| Poll | A find sent to its people to answer, slot by slot |
| Target | A module's "turn this slot into…" action |
| Arranged meeting | Availability's own event for anything no other module owns |
| Availability request | An ask to a group to check their availability for a period by a deadline |
| Checked to | The last date a person has confirmed, by answering a request, that their availability is right |
