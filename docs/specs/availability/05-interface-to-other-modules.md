# 4. Interface to other modules

Availability reads other modules only through two points it declares, `core.person-busy`, `ageStatus` and the occupancy read, plus Identity's provider credentials for calendar imports (proposed, below); it writes nothing outside its own tables. Everything below was agreed with the owning thread on 23 November 2026 unless marked proposed.

## Manifest

| Field | Value |
| --- | --- |
| `id` | `availability` |
| Kind | switchable |
| `requires` | `core` |
| `uses` | `communications`, `productions`, `rehearsals`, `governance`, `training`, `front-of-house`, `occupancy` |
| Required by | `rehearsals` (R3-04 as amended, R3-26) |
| Tables | fourteen, `availability_*` (part 2) |
| Tasks | `availability.daily` at 04:30: joiners and leavers on open requests (R2, R6), lapsing (R5), closing at period end (R7), abandoning stale polls (F8), retention sweeps. `availability.reminders` hourly, prompt lane. availability.calendar-sync every availability.import.refresh, bulk lane (I5). Outside calls, each declared with a timeout and a reconcile: fetch a calendar address; Google and Microsoft free/busy reads; token revoke on disconnect and erasure |
| Menu | Members' area: "My availability", "Find a time" (shown to anyone who may plan for at least one group). Console: none of its own; settings on Admin > Modules > Availability |

## Services

Plain named exports (R3-09). Every read takes the viewer and returns only what A7 allows.

| Service | Kind | Contract |
| --- | --- | --- |
| `levels({ groupId } or { accountIds }, from, to, viewerId)` | read | Blocks `{ accountId, from, to, level: free, maybe, busy or unknown, reason? }` covering the range for each person the viewer may plan for. `reason` only when the entry is shared and the viewer plans for a group the person is in. A group is resolved by subquery inside the module; explicit ids are chunked at 90. A whole team for a week is one call (agreed with Rehearsals). People the viewer may not plan for are left out and counted in `hidden` |
| `freshness(accountIds, viewerId)` | read | `{ accountId, changedAt, checkedTo }` for the same people |
| `openRequest({ sourceRef, groupIds, accountIds, from, to, dueOn, title, message, openedBy })` | write, in the caller's unit | Opens a request, or returns the open one for that `sourceRef`. Rehearsals uses `rehearsals.schedule:<id>` |
| `closeRequest(sourceRef)` | write | Closes it (R7). Closing a closed request does nothing |
| `requestStatus(sourceRef, viewerId)` | read | Counts by state and, for a planner, each person's state |

## Points declared

**`availability.group`**, code. A contribution owns one id prefix and answers:

| Member | Contract |
| --- | --- |
| `list(viewerId)` | Groups the viewer may plan for, `{ id, label, hint }`, for the picker |
| `members(groupId)` | A subquery of current member account ids, never a list built from a result set (0006) |
| `canPlan(viewerId, groupId)` | Boolean |
| `groupsOf(accountId)` | The person's groups of this kind, for A7 reason sharing and "Who can see my availability" |

| Contributor | Ids | Members | canPlan |
| --- | --- | --- | --- |
| Productions | `productions.team:<productionId>`, `productions.department:<productionId>:<slug>` (a production-kind `core.department` term, R3-07), `productions.position:<productionId>:<positionId>` | Current team from `listTeam`, left members excluded; non-archived productions only | Holders of `productions.team-lead` for that production, and of `productions.team.manage` |
| Rehearsals | `rehearsals.unit:<id>` | The unit's people | The schedule's managers |
| Governance | `governance.body:<id>` | Current post holders, by subquery on `governance.member-of` | Anyone holding a post in that body |
| Training | `training.course-waiting:<courseId>` | Everyone waiting for any upcoming session of that course, over merged accounts | Holders of `training.session.manage` |

**`availability.target`**, code. `{ id, label, ability, open({ from, to, accountIds, title, contextRef }) }` returning `{ ref, link }` to a draft the owner created under its own rules.

| Contributor | Id | Label | Ability | What `open()` makes |
| --- | --- | --- | --- | --- |
| Rehearsals | `rehearsals.call` | Rehearsal call | Rehearsals' schedule management | A draft call, prefilled with slot, people and title |
| Training | `training.session` | Training session | `training.session.manage` | A draft session on the console Sessions screen; the chosen people are listed for staff to add as places once published, so nobody holds a place on a draft |
| Availability | `availability.meeting` | Meeting | `availability.meeting.arrange` | An arranged meeting (M1) |
| Governance | `governance.meeting` | Committee meeting | Governance's | A draft Governance meeting (GV-23, first release) prefilled with body, time, room and invitees. Offered only for governance.body groups; there Availability's own Meeting target is hidden, so a committee meeting exists once. Governance writes its own core.person-busy rows; neither module reads the other's tables |
| Spaces, later (proposed) | `spaces.booking` | Room booking | Spaces' booking ability | AV-28, with the Spaces amendment SP-54 |

Front of house contributes no target: shifts are never started from a found time.

## Points contributed

| Point | Contribution |
| --- | --- |
| `core.person-busy` (C-66) | Stated busy time, from patterns, exceptions and calendar imports (I6): `firm` false, kind `unavailable`, labelKey `availability.unavailable`, never a reason or label. Arranged meetings: `firm` true, kind `meeting`, for each invitee not answering not going. Maybe and unknown are not contributed. Every row carries `source: 'availability'` |
| `core.calendar-feed` (C-70) | Contribution { id: 'availability', events(accountId, from, to) }: arranged meetings in each invitee's personal feed, key the meeting id. UIDs are \<contributor>.\<key>@\<site marker> (C-70, spec 15, CF3); I4 drops imports by that suffix (agreed with Integration, 24 November) |
| `productions.schedule-entry` | `read(productionId, from, to)` returns `{ at, endsAt, title, kind: 'meeting', to }` for meetings whose context is that production; ability `productions.task.view`, so the whole team sees them |
| `productions.workspace-tab` | "Availability": the person's own levels for the production's dates and any open request for it |
| `core.record-resolver` | Record types `availability.meeting`, `availability.request`, `availability.find` |
| `core.measure` (Reports) | Aggregates only: `availability.requests.on-time` (ratio of people asked who answered by the due date), `availability.people.current` (share of people in requests whose availability changed within `availability.entry.stale-after`). No per-person figure |
| `core.practice-scenario` | `availability.find-a-time`, later (AV-30) |
| Identity's merge point | Step `availability.settle-merge` (part 2) |

## Notifications

All through core's notification pipeline as notices, never marketing. Each names the organiser and the thing, never another person's level or reason.

| Key | To | When |
| --- | --- | --- |
| `availability.request.asked` | Each person asked | R1, R2 |
| `availability.request.reminder` | Those still asked | R3 |
| `availability.entry.added-for-you` | The person | A8 |
| `availability.poll.asked` | Poll people | F7 |
| `availability.poll.decided`, `availability.poll.abandoned` | Poll people; the organiser for an automatic abandon | F8 |
| `availability.meeting.invited`, `.moved`, `.changed`, `.cancelled` | Invitees | M2 to M4 |

## Events

| Event | When | Payload | Leaves the platform |
| --- | --- | --- | --- |
| `availability.updated` | A6 | accountId, from, to | false |
| `availability.request.opened`, `.answered`, `.closed` | R1, R4, R7 | requestId, sourceRef; accountId for answered | false |
| `availability.poll.decided` | F8 | findId, slot from and to, outcomeRef | false |
| `availability.meeting.arranged`, `.moved`, `.cancelled` | M1, M3, M4 | meetingId, from, to, contextRef | false |

Heard: none. Joiners and leavers are found by the daily task from the group point, so no module has to announce membership for this to stay right.

## Seams agreed

| With | Agreed | Their side |
| --- | --- | --- |
| Rehearsals | Requires availability; `rehearsals_conflicts`, conflict rules, keep-for setting, conflict.view ability and My conflicts screen removed; its rules F1 to F3 now call `openRequest`/`closeRequest`, `levels()` (busy raises W2, maybe a soft note, unknown nothing) and contribute a group and a target. Its Q4 (private reasons) moves to this spec's question 2. Its tests U-1 to U-3 and U-9 point to T-AV cases | Rewritten 23 November |
| Productions | Three group kinds; meetings on `productions.schedule-entry`; Availability workspace tab | Interface tab updated |
| Festival-ready changes (C-66, FH-48) | Availability contributes to `core.person-busy`; `source` added to every row; maybe and unknown not contributed; FH-48 rota grid and assign dialog show levels; no Shift target; self sign-up unchanged | C-66 and FH-48 updated |
| Governance | Body groups; GV-23 meetings now first release (Matt, 24 November) with a Committee meeting target, which replaces the Meeting target for body groups | GV-23 updated |
| Training | Session target; course-waiting groups | Interface tab updated |
| Programme planning | Reads stated busy through `core.person-busy` only (its W7); does not use availability; its entry windows (W6) stay its own, renamed by Integration with prefix `ppew` (was `ppav`) | Renamed by Integration |
| Integration | R3-26 registers the module, prefixes, points, services, events; R3-04 amended; R3-25 for under-18s | Integration doc |

**Calendar imports, proposed 24 November.** Question 6 brought imports into the first release, which needs three things outside this module, sent to Integration for ruling:

| With | Proposed | Why |
| --- | --- | --- |
| Identity | A core service to ask an extra consent from a sign-in provider already set up in the site, and hand the module an encrypted refresh token for it. Reuses Identity's Google and Microsoft provider cards (and the general OpenID card, ID-47, for any later provider), so no credential is ever a Worker secret | I2. Overlaps Festival-ready's Microsoft and OpenID sign-in, which ships at the same time: one Microsoft app registration serves both, with calendar access asked only when a person connects |
| Core calendar feed (C-70) | Agreed: UIDs end @\<site marker>, fixed in core configuration (spec 15, CF3) | I4: a person subscribed to their own feed elsewhere must not import the site's events back as busy |
| Integration | Prefixes `avcc` and `avib`; the outside calls in the manifest; one more task on the bulk lane | Part 2, I5 |
