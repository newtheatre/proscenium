# 7. Stories

Thirty-two stories, AV-01 to AV-32 (a new series, R3-26): 8 gate, 20 first release, 4 later. AV-26 moved to the first release and AV-31 and AV-32 were added on 24 November, when Matt chose calendar imports for the first release (question 6). The gate is what Rehearsals needs to drop its own conflicts: entry, `levels()`, groups, `core.person-busy` and requests. Find a time, polls and meetings follow in the first release.

| Id | As | I want | Acceptance criteria | Release | Needs | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| AV-01 | an administrator | to switch Availability on | Manifest, fourteen tables and migrations, settings page, abilities registered; Admin > Modules lists it with Rehearsals as "Needed by"; switching Rehearsals on asks to switch Availability on | Gate | Core | T-AV-01 |
| AV-02 | a member | a weekly pattern with dates | Create, rename, date and delete patterns; lines on the grid step; overlapping patterns or lines refused naming the clash (A2) | Gate | AV-01 | T-AV-02 |
| AV-03 | a member | dated exceptions | Whole day or times, optional weekdays, level, reason, share tick; past days read-only; at most `entry.horizon` ahead (A3) | Gate | AV-01 | T-AV-03, T-AV-04 |
| AV-04 | a member | to paint my week | S1: paint free, maybe, busy, clear; whole day by heading; drag on a computer, tap then tap on a phone; painting a pattern day asks "just this week" or "change the pattern"; commitments shown locked; "Updated …" and "checked to" shown | Gate | AV-02, AV-03, C-66 | T-AV-05 |
| AV-05 | a module | `levels()` and `freshness()` | Levels per A4; A7 limits people and reasons; a group resolved by subquery; ids chunked at 90; a team of 40 for a week in one call; hidden people counted, never named | Gate | AV-02, AV-03 | T-AV-06, T-AV-07, T-AV-12 |
| AV-06 | a module | to contribute groups | Point `availability.group` with list, members, canPlan, groupsOf; Productions' three kinds and Rehearsals' units contribute; archived productions offer none | Gate | AV-01, PD, RH | T-AV-08 |
| AV-07 | another module | to see stated busy time | Contribution to `core.person-busy`: busy from patterns and exceptions, firm false, kind unavailable, no reason or label, `source` availability; maybe and unknown absent | Gate | AV-05, C-66 | T-AV-09 |
| AV-08 | a schedule manager in Rehearsals | to ask the team to check their availability | `openRequest`/`closeRequest`/`requestStatus`; one open request per source; S4 and S5; "This is right" answers and moves checked to; lapsing at the due date; closing stops nothing but reminders | Gate | AV-05, AV-06 | T-AV-10, T-AV-11 |
| AV-09 | an organiser | reminders and a view of who has answered | Notice at opening; reminders at the two settings while asked; S11 with states; "Remind now" at most once a day per request; nothing after closing | First | AV-08 | T-AV-13 |
| AV-10 | an organiser | the request to follow the group | Joiners added and told; leavers withdrawn, by the daily task (R2, R6) | First | AV-08 | T-AV-14 |
| AV-11 | a team lead | Find a time | S7 with groups, people, range up to 62 days, hours, length; grid counts; names by level; commitments with source; own rows dropped; at most 200 people (F1, F2, F4) | First | AV-05, AV-06, C-66 | T-AV-15, T-AV-16 |
| AV-12 | a team lead | best times | Must-have people and groups; ranked list of ten per F3; dimmed slots where a must-have cannot | First | AV-11 | T-AV-17 |
| AV-13 | a team lead | to see if the room is free | Choose spaces; taken slots hatched and excluded unless "Room optional" (F5); hidden when occupancy is off | First | AV-11, OC-01 | T-AV-18 |
| AV-14 | an organiser | to be warned about under-18s | Late finish after `core.under-18.latest-finish` and one-to-one warnings on slots, best times and meetings; shown to the organiser only; never block; nothing when ageStatus is unknown | First | AV-11, C-74 | T-AV-19 |
| AV-15 | an organiser | to send a poll | 2 to 6 slots; answer time; S9 with the person's own level per slot; yes, if need be, no; answers changeable until close; invitees never see others' answers; votes never change availability | First | AV-12 | T-AV-20 |
| AV-16 | an organiser | to decide or give up | S8 tallies; decide any time; abandon; automatic abandon after `polls.abandon-after`; everyone told | First | AV-15 | T-AV-21 |
| AV-17 | an organiser | to turn a slot into a call or session | Point `availability.target`; S10 offers only targets whose ability the organiser holds; Rehearsals call and Training session open prefilled drafts; `outcome_ref` stored | First | AV-12, RH, TR | T-AV-22 |
| AV-18 | an organiser | to arrange a meeting | S12; M1 to M5; invitations, going or not going, move resets answers, cancel; invitees busy through `core.person-busy` | First | AV-17 | T-AV-23, T-AV-24 |
| AV-19 | a team member | meetings where I look | Meetings in the personal calendar feed (C-70); production meetings on `productions.schedule-entry` | First | AV-18, C-70 | T-AV-25 |
| AV-20 | a planner | to add an absence someone phoned in | A8: busy or maybe only; person told; person may change it; planner deletes only their own | First | AV-03, AV-06 | T-AV-26 |
| AV-21 | a member | to know who can see my availability | S6 from `groupsOf`; what planners see and never see; how sharing a reason works | First | AV-06 | T-AV-27 |
| AV-22 | a data officer | erasure and merge to be right | Erasure deletes every personal row in one unit, calendar connections and imported blocks included, after revoking any provider token; past invitee rows anonymised; merge handler per part 2, undoable | First | AV-01 | T-AV-28, T-AV-29, T-AV-34 |
| AV-23 | the theatre | old rows gone on time | Daily sweeps for past exceptions and history per the retention settings | First | AV-03, AV-18 | T-AV-30 |
| AV-24 | a committee member | my committee and courses in Find a time | Governance body groups; Training course-waiting groups; Productions workspace tab "Availability" | First | AV-06, GV, TR, PD | T-AV-08 |
| AV-25 | Reports | aggregate figures | `core.measure` figures on-time answers and current availability; aggregates only | Later | AV-09, Reports | T-AV-31 |
| AV-26 | a member | to bring in busy times from my own calendar | S14 "Calendar address": a secret https address checked by a trial fetch, refreshed every import.refresh over import.window; busy-only, never titles (I3); hatched "From your calendar" on S1, overridden by an exception (A4); broken after three failures, person told (I5); disconnect deletes at once; at most import.max-connections | First | AV-03, AV-05 | T-AV-32, T-AV-35, T-AV-36 |
| AV-27 | an organiser | availability from someone with no account | A signed link per person, valid for one request, giving a one-week grid; rows kept against the address and erased with it | Later | AV-08 | none yet |
| AV-28 | an organiser | to book the room from the slot | Spaces contributes `spaces.booking` target; Spaces amendment SP-54 (Integration) | Later | AV-17, Spaces | none yet |
| AV-29 | a committee chair | to arrange a committee meeting | Governance contributes `governance.meeting` with GV-23 (first release, Matt 24 November): a draft Governance meeting prefilled with body, time, room and invitees; offered only for governance.body groups, where the Meeting target is hidden | First | AV-17, GV-23 | none yet |
| AV-30 | a new member | to practise Find a time | Practice scenario `availability.find-a-time` on sample data | Later | Practice mode | none yet |

Added on 24 November for calendar imports:

| Id | As | I want | Acceptance criteria | Release | Needs | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| AV-31 | a member | to connect my Google or Microsoft calendar | S14 Google and Microsoft, offered only while the switch is on and the provider is set up in the site; a separate consent for the narrow free/busy scope only (I2); token encrypted, never shown; reconnecting the same account replaces it; disconnect revokes the token and deletes blocks at once; proof P-AV-1 passed first | First | AV-26, Identity incremental consent (proposed to Integration), ID-47 | T-AV-32, T-AV-34, T-AV-35 |
| AV-32 | a member subscribed to my own site feed | my calls not counted twice | Refreshes drop the site's own feed events by id marker and any block matching my firm commitment to within a minute (I4); imported busy reaches `core.person-busy` as stated busy with nothing about its source (I6) | First | AV-26, C-66, C-70 marker | T-AV-33 |
