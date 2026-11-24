# 8. Test plan

Thirty-six named cases that must never regress; T-AV-32 to T-AV-36, for calendar imports, follow the table. Privacy cases (T-AV-06, T-AV-07, T-AV-09, T-AV-20, T-AV-27, T-AV-32, T-AV-34) and the clock-change case (T-AV-04) are the ones most likely to break quietly. Rehearsals' old cases U-1 to U-3 and U-9 now point here (T-AV-03, T-AV-04, T-AV-07, T-AV-11); its U-12 and I-19 cover its side of the seam.

| Id | Name | Given | Expect |
| --- | --- | --- | --- |
| T-AV-01 | `rehearsals-needs-availability` | Availability off, Rehearsals switched on | Asked to switch Availability on; refused without it |
| T-AV-02 | `no-overlapping-patterns` | Term time 1 Oct to 12 Dec; a second pattern from 1 Dec | Refused, naming Term time; lines overlapping on one weekday refused too |
| T-AV-03 | `exception-shapes` | Away 14 to 16 March; Tuesdays until 6 March 18:00 to 23:00; late until 19:30 as busy until 19:30 | Each covers exactly its days and times |
| T-AV-04 | `wall-clock-across-clock-change` | Busy Sundays 18:00 to 20:00 across the last Sunday of March and October | Still 18:00 to 20:00 London time each week |
| T-AV-05 | `paint-pattern-day` | Painting a Tuesday that the pattern covers, "just this week" | One exception written; pattern unchanged; `changed_at` moves; one `availability.updated` |
| T-AV-06 | `level-order` | Busy pattern line, free exception, later maybe exception over part of it | Maybe where the later exception lies, free elsewhere in the first, busy outside both; unmarked shows unknown or free per the person's choice |
| T-AV-07 | `planner-sees-no-reason` | Exception with reason, not shared; then shared | Planner of the person's group sees busy only, then the reason; a `find.anyone` holder outside the group never sees it; pattern labels never seen |
| T-AV-08 | `group-contributions` | A production team, a department, a position, a unit, a body, a course waiting list | members() and canPlan() right for each; archived production offers none |
| T-AV-09 | `busy-contribution-shape` | Busy, maybe, unknown, and an arranged meeting | person-busy rows: busy firm false with no label or reason; meeting firm true; nothing for maybe or unknown; all `source` availability |
| T-AV-10 | `one-request-per-source` | `openRequest` twice for one schedule | Second returns the first; after close, a new one opens |
| T-AV-11 | `closing-never-locks` | Request closed | No reminders go; the person can still change availability and answer late |
| T-AV-12 | `levels-at-scale` | A group of 250 and 120 named ids for 7 days | One subquery for the group; named ids in chunks of at most 90; no statement over 100 bound parameters |
| T-AV-13 | `reminders-stop` | Two reminders due; person answers between | Only the first goes; nothing after closing; "Remind now" twice in a day refused |
| T-AV-14 | `joiners-and-leavers` | Person joins the team after opening; another leaves | First added as asked and told; second withdrawn |
| T-AV-15 | `find-limits` | 201 people; 63 days; a named person in no group the viewer plans for | Each refused or left out with the reason; `find.anyone` lifts only the third |
| T-AV-16 | `own-rows-not-double-counted` | Person busy by exception; same row returned by person-busy | Counted once, as busy |
| T-AV-17 | `best-times-respect-must-haves` | A must-have person maybe at the best-count slot | That slot not offered; ranking order per F3 otherwise |
| T-AV-18 | `room-taken` | Studio booked 19:00 to 21:00 | Overlapping slots hatched and excluded; included when "Room optional" |
| T-AV-19 | `under-18-warnings` | Latest finish 22:00; one person under 18 on the date, one turning 18 the day before; slot to 23:00; a find of one adult and one under-18 | Warning for the first person only; one-to-one warning; none when the key is unset or ageStatus is unknown; nothing blocks |
| T-AV-20 | `poll-privacy` | Three invitees answer | Each sees only their own answers; organiser sees tallies and names; no availability row changes |
| T-AV-21 | `poll-ends` | Poll undecided 14 days after its answer time | Abandoned by the daily task; invitees and organiser told once |
| T-AV-22 | `target-needs-ability` | Organiser without `training.session.manage` | Training session not offered; Rehearsal call opens a draft and `outcome_ref` is stored |
| T-AV-23 | `meeting-move-resets` | Meeting moved an hour | Everyone told; every response pending; feed and person-busy follow |
| T-AV-24 | `meeting-cancel` | Meeting cancelled | Leaves feed and person-busy; invitees told with the reason |
| T-AV-25 | `meeting-on-production-schedule` | Meeting with a production context | On that production's schedule for holders of `productions.task.view`; not on others |
| T-AV-26 | `on-behalf-limits` | Planner adds busy for a group member; tries free; tries a non-member | First written, person told; others refused |
| T-AV-27 | `who-can-see-me` | Person in two productions and a committee | S6 lists the three groups and who plans for each; nothing about other people |
| T-AV-28 | `erasure` | Person with patterns, exceptions, answers, votes, past and future invitations | All personal rows deleted in one unit; past invitee row anonymised; counts on past meetings still true |
| T-AV-29 | `merge-and-undo` | Two accounts both on one request and one poll, each with patterns | Further-along rows kept; later patterns kept, others set aside; undo restores all |
| T-AV-30 | `retention` | Exceptions 91 days past; a poll decided 13 months ago | Both removed; nothing newer touched |
| T-AV-31 | `measures-aggregate-only` | Reports reads both figures | Ratios only; no person identifiable from any figure |

Calendar imports (added 24 November). Outside calendars are stubbed in tests: a fixture ICS file, and recorded Google and Microsoft free/busy and revoke responses. Proof P-AV-1, against real test accounts, confirms the scopes before AV-31 starts.

| Id | Name | Given | Expect |
| --- | --- | --- | --- |
| T-AV-32 | `ics-busy-only` | A fixture calendar with a busy event with title, place and attendees; a tentative, a free, a cancelled and a declined event; an all-day event; one beyond the import window | Only start, end and level stored: busy, maybe for the tentative (busy or none per `tentative_as`), the all-day event as the theatre's whole day; nothing for the rest; no title, place or attendee anywhere in the database or logs |
| T-AV-33 | `own-feed-not-reimported` | A person subscribed to their own site feed, with a rehearsal call and an arranged meeting in it; and a Google free/busy block exactly matching the call | Feed events dropped by marker; the matching free/busy block dropped; Find a time counts each commitment once |
| T-AV-34 | `revoke-on-disconnect-and-erasure` | A Google connection; then disconnect. A Microsoft connection; then the person is erased | Each token revoked at the provider and its blocks deleted in the same action; a failed revoke is retried by reconcile and never holds the erasure; no connection row survives |
| T-AV-35 | `broken-connection` | A calendar address that answers 404 on three refreshes in a row | Failing after the first; broken after the third, person told once; blocks kept until seven days after the last good refresh, then dropped; reconnecting resets |
| T-AV-36 | `exception-beats-import` | An imported busy block 18:00 to 20:00 over a free pattern line; the person paints free 19:00 to 20:00 | 18:00 to 19:00 busy, 19:00 to 20:00 free; a planner sees only levels, never that either came from a calendar |
