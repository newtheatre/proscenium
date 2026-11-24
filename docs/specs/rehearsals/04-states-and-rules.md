# 3. States and rules

A call has four states and only a published call is seen by the people called; its room has a state of its own that Spaces decides and Rehearsals copies. Every rule below has an id so stories and tests can cite it.

(Diagram in the Claude Doc: https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) call life cycle · 4 states, and the room state beside it

A draft call already holds its room booking (rule B1), so a stage manager can plan a term ahead without losing the room; what draft means is that nobody but the managers has been told.

## Call states

| State | Meaning | Seen by the people called | Final |
| --- | --- | --- | --- |
| Draft | Planned, not yet issued | No | No |
| Published | Issued; the people called have been told | Yes | No |
| Cancelled | Called off after publishing | Yes, struck through, with the note | Yes |
| Done | Its end has passed | Yes, in the past | Yes, except attendance and the report |

### Moves between states

| From | To | Who or what | Condition |
| --- | --- | --- | --- |
| none | Draft | A schedule manager | Rules C1 to C6 pass |
| Draft | none | A schedule manager | Deleting a draft removes it and cancels its room booking in the same unit. Nobody is told |
| Draft | Published | A schedule manager, by issuing a call sheet (rule S1) or publishing the one call (rule S4) | The call starts in the future |
| Published | Published | A schedule manager | A change (rule N2). `version` goes up by one |
| Published | Cancelled | A schedule manager | Before its end. A note is required |
| Published | Done | The sweep task | `ends_at` has passed |
| Draft | none | The sweep task | A draft whose start passed more than `rehearsals.drafts.expire-after` ago is deleted, as above |

Each move is one conditional update naming the state it expects; the unit goes on only if it changed something, tested as above nought. Each announces its event in the same unit.

## Making a call

Checked in this order; the first failure is reported. Rules C1 to C6 refuse. Rules W1 to W7 only warn.

| Rule | Check | On failure |
| --- | --- | --- |
| C1 | The actor holds `rehearsals.schedule.manage` on the production, and the schedule is Active | Refused |
| C2 | Start is before end, both on a five-minute boundary, the call is at most 16 hours long, and the start is in the future | Refused |
| C3 | Exactly one of a bookable room and a place in words | Refused |
| C4 | The call kind is active | Refused |
| C5 | Every person called is on the production's team (from `listTeam`, account scope), or was when called (rule U2) | Refused, naming them |
| C6 | If a room is chosen, Spaces' `requestBooking` accepts it (rule B1) | Refused with Spaces' own reason and its nearest free time (its rule C3) |
| W1 | The call is outside the rehearsal period | Warning |
| W2 | Availability's levels() has a person called as busy over their own call time (rule F2); maybe gives a softer note without clash | Warning on that person, `clash` set |
| W3 | A person called has a commitment from `core.person-busy` that overlaps, other than this call and other than Availability's stated time (already W2) | Warning on that person, `clash` set |
| W4 | A person is called to more than `rehearsals.calls.max-hours-a-day` hours that day across this production's calls | Warning |
| W5 | The call ends after `rehearsals.calls.latest-end` | Warning |
| W6 | Core's ageStatus answers under-18 for a person called, on the date of the call (question 6b; Integration ruling R3-25) | An "Under 18" marker on that person in the planner and team list, shown only to people who run calls and never exported |
| W7 | A person called is under 18 on the date of the call (W6) and the call ends after core's core.under-18.latest-finish (Identity, with C-74; shared with Productions), which ships unset, so the rule is off until set | Warning on that person |

A warning is shown beside the person or the time, and the save goes ahead. Nothing here ever refuses because a person is busy: a stage manager often calls someone knowing they will be late.

(Diagram in the Claude Doc: https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) flow · saving a call with its room, two checks and three answers from Spaces

A call that fails C1 to C5 is not saved. A call with a room saves only together with its Spaces request: the room ends Requested or Confirmed, or Spaces refuses and nothing is saved (C6). Warnings W1 to W7 never refuse a save.

## Rooms

**B1, a call books its own room.** When a call is saved with a bookable, the same unit carries the statements from Spaces' `requestBooking`, with origin `rehearsals.call` and the call's id, `booked_for` the actor, the production, the call's times and title, and the purpose named by the call kind (part 6). The call and its room booking are saved together or not at all. If Spaces answers "needs a decision", the call is saved and `room_state` is `requested`; if it answers confirmed, `confirmed`.

**B2, moving a call moves its room.** A change of time or room goes through `changeBookingOfOrigin` in the same unit. Where Spaces needs a decision for the new time (its rule X3), the call moves at once, `room_state` becomes `requested`, and the old room booking stays confirmed until Spaces confirms the new one and cancels the old in its own unit. The planner shows both until then.

**B3, giving up the room.** Cancelling a call, deleting a draft, or switching from a room to a place in words calls `cancelBookingsOfOrigin` in the same unit.

**B4, the copy of the room's state.** Rehearsals listens for Spaces' `confirmed`, `declined`, `expired`, `bumped`, `cancelled` and `changed` events, ignores any whose booking has no `rehearsals.call` origin, and sets `room_state` with a conditional update. Declined, expired, bumped, and cancelled other than by Rehearsals itself set `lost` with the reason. The listener is safe to run twice.

**B5, losing a room.** A lost room flags the call on the planner and in the health check, and tells the schedule managers at once. It tells the people called nothing: the call still stands until a manager moves it or picks another room, which starts the room's life again at Requested.

**B6, a call with no room confirmed.** A published call whose room is still `requested` within `rehearsals.rooms.warn-before` of its start is flagged and its managers are reminded once. The people called see "room to be confirmed" in place of the room.

**B7, the purpose.** Each call kind names a Spaces purpose slug. A technical or dress call uses a higher tier, so through Spaces it may ask to bump a lower-tier booking (Spaces' rule C5, decided by an approver). Rehearsals never sets a tier itself.

## Units and who is called

**U1, units call people.** Adding a unit to a call's running order calls every person in that unit who is not already called, with `source` `unit`. Removing it removes those whose only reason to be called was that unit, if they have not been told; if they have, they are listed for the manager to confirm before they are released (rule N2).

**U2, only the team.** A person is added to a unit or called only while they are on the production's team. Someone from outside, a fight director say, is added to the team in Productions first.

**U3, leaving the team.** On Productions' `productions.team-member.left` event, the person is removed from units, and from every call starting on or after their leaving date: at once from drafts, and from published calls with a change notice. Productions announces the event when the date is typed, so a future leaving date is handled the same day. Past calls keep them.

**U4, individual times.** A person's own `from_at` and `until_at` sit inside the call. A running order with times suggests them: a person is called from the first unit they are in and released after the last. The manager may change either.

**U5, changing a unit's people** changes draft calls at once. For published calls, the planner lists the calls affected and the manager chooses which to update; each update is a change under rule N2.

## Availability

Rehearsals stores no stated conflicts. People say once, in Availability, when they are free, maybe or busy, for every production at once (Integration ruling R3-26, amending R3-04). Rehearsals asks for it, reads it and contributes to it.

**F1, asking for availability.** A schedule manager opens the schedule's request with Availability's openRequest, sourceRef rehearsals.schedule:\<id>, the team's accounts, the rehearsal period, a due date and a message ("Tell us your conflicts by 1 February"). Closing it, by hand or when the schedule closes, calls closeRequest: that stops reminders only, and people can still enter availability afterwards.

**F2, reading it.** The planner asks Availability's levels() once for the whole team over the week shown, by group id (members resolved inside Availability) or by account ids chunked at 90. A busy block over a person's own call time raises W2 and sets clash; maybe shows a softer "maybe" note and never sets clash; unknown shows nothing. The planner words a block against the call: "unavailable", "late until 19:30", "leaves 21:00". A reason shows only where the person shared it and Availability's canPlan allows the viewer.

**F3, what Rehearsals gives back.** Its published calls to core.person-busy (firm true); each unit to availability.group, id rehearsals.unit:\<id>, with canPlan true for schedule managers; and an availability.target, "Rehearsal call", that turns a slot found in Find a time into a draft call with the slot, people and title filled in. Stated busy time reaches other modules through Availability's own contribution to core.person-busy, never through Rehearsals.

## Issuing and telling people

(Diagram in the Claude Doc: https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) flow · issuing a sheet and telling people about changes

Issuing publishes a sheet's drafts together and sends each person one message with only their own calls. A change to a published call reaches only the people it affects: at once inside short notice, otherwise gathered for 10 minutes into one message.

**S1, issuing a call sheet.** A manager picks a window, usually a week. The sheet publishes every Draft call in the window that starts in the future, in one unit, with set-wise writes (Foundations' rules U7 to U9), and records a `rehearsals_sheets` row. Calls already published in the window are included in each person's message unchanged.

**S2, one message each.** Every person called to any call in the window gets one message: the sheet's covering note, then their own calls in time order, each with their own call time, place and running order. Nobody receives a list of everyone else's calls unless `team_sees` is `full`, and even then the message holds only their own. Sending goes through core's notification service with one set of recipients, not one call per person.

**S3, a person with nothing.** A team member called to nothing in the window is not messaged, unless `rehearsals.sheets.tell-uncalled` is on, when they get "You are not called between 3 and 9 March".

**S4, publishing one call.** A single draft call can be published without a sheet; the people called get a message about that call alone.

**N1, what counts as a change.** A change to the time, the room or place, the running order, a person's own times, or adding or removing a person. A change to notes alone is not a change notice, but it does raise the version so the feed updates.

**N2, change notices.** Each published change tells only the people it affects: those added, removed, or whose own time, place or running order changed. A person removed gets "You are no longer called". Notices are coalesced over `rehearsals.changes.coalesce` so several edits in a minute reach a person once. `told_version` records what each person has been told.

**N3, short notice.** A change or a cancellation within `rehearsals.changes.short-notice` of the call is marked urgent: it is sent by email at once, whatever the person's digest preference, as core's transactional category allows.

**N4, reminders.** The people called get a reminder `rehearsals.reminders.before` the start of their own call time. Zero sends none.

## Responses and attendance

**A1, responses.** A person called may mark a call `seen`, or `cannot` with an optional note. `cannot` tells the managers at once and shows on the planner. It is not stated availability and does not change who is called; the manager decides.

**A2, who has not seen it.** The call's page shows who has not responded. If `rehearsals.calls.ask-to-confirm` is on, a person with no response 48 hours before the call gets one nudge.

**A3, attendance is optional.** Recording attendance is switched by `rehearsals.attendance.enabled`; off by default, as many companies only care who was late.

**A4, recording attendance.** From the call's start until 7 days after its end, a schedule manager marks each person present, late, absent or excused. Unmarked people stay unmarked; nothing is assumed. The first mark sets `attendance_taken`.

**A5, what attendance is for.** The manager's own view and aggregate figures for Reports (part 4). It never changes anyone's standing, role or eligibility.

## Rehearsal reports

**R1, one per call.** A schedule manager may write one report per call once it has started. Each note names a department from `core.department` and may be an action.

**R2, sending.** Sending sets the report `sent` and tells the recipients chosen by `rehearsals.reports.send-to`, one message each with the whole report. Department leads (Productions' `lead` positions in that department) see their department's actions on their home card; a department with no lead falls back to the production's leads.

**R3, after sending.** The summary and the notes already sent are fixed. A manager may add a note, which is marked `added_after_send` and sent to the same recipients as a short addition. An action is ticked done by anyone in its department or a manager.

## Who sees what

**V1, your own calls.** A person always sees the published calls they are called to, with the call's notes, place and running order, and never its private notes.

**V2, the whole schedule.** Team members (fact `productions.team-member`) see the production's whole published schedule when `team_sees` is `full`, or only their own when `own`. Who else is called to a call is shown under `full` only.

**V3, drafts and private notes** are seen only by holders of `rehearsals.schedule.view` and up.

**V4, nothing public.** No route answers without sign-in. Rehearsals' contribution to core's calendar feed (core.calendar-feed) lists only that person's published calls, with public-safe titles (production and call kind only), per C-70; the feed's token is core's.

## When other things change

| Rule | When | What happens |
| --- | --- | --- |
| L1 | The production is cancelled or withdrawn (core's events) | Future calls are cancelled in one set with the note "The production has been cancelled", their room bookings cancelled by origin, and the people told once |
| L2 | A performance is scheduled over a call's room | Spaces bumps the room booking (its rule L1); B4 and B5 follow. Rehearsals does nothing else |
| L3 | A call kind is retired | Existing calls keep it. It leaves the picker |
| L4 | Productions removes a person from the team | U3 |
| L5 | The schedule is closed | Draft calls are deleted, feeds stop listing it, its availability request is closed (rule F1) |
| L6 | The module is switched off | Tables are kept. Room bookings already made stay in Spaces as ordinary bookings, labelled by their origin; nothing is cancelled |

## Sweeps and reminders

One task, `rehearsals.sweep`, every 15 minutes: moves past published calls to Done, deletes expired drafts, sends reminders (N4) and the confirmation nudge (A2), and flags calls under rule B6. Each step is set-wise and safe to repeat.
