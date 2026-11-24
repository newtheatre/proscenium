# 3. States and rules

Thirty-seven rules guard every change: A for a person's availability, I for calendar imports, R for requests, F for Find a time and polls, M for arranged meetings. Warnings never block; refusals are listed as such. Every date and time is the theatre's, and the show-night convention (04:00 to 04:00) does not apply here: availability is about ordinary days.

## A person's availability

**A1, own only.** A person changes only their own patterns, lines and exceptions, except entries on their behalf (A8).

**A2, no overlaps.** Two patterns of one person may not share a date. Lines of one pattern and weekday may not overlap. Every time sits on the grid step (`availability.grid.step`); a change of step never moves stored times, and the grid draws partial cells.

**A3, how far.** Entries may reach `availability.entry.horizon` ahead. Days before today are read-only to everyone; a past exception is deleted `availability.retention.past` after its last date.

**A4, working out a level.** For any instant, in order: the exceptions covering it (if several, the one entered most recently wins); else an imported block covering it (busy beats maybe where blocks overlap, I3); else the line of the pattern whose dates cover the day; else what the person's unmarked time means (their own choice, else the site default). The flow is drawn below.

**A5, commitments are separate.** What `core.person-busy` returns is never written into availability. It is shown beside it, and Find a time counts a firm commitment as busy and a tentative one as maybe (F4).

**A6, telling others.** Each save updates `changed_at` and announces `availability.updated { accountId, from, to }`, the dates the change touches. No levels or reasons leave the module in an event.

**A7, who sees what.** A person's levels are read only through `levels()` by a planner: someone for whom a group containing the person says canPlan, or a holder of `availability.find.anyone`. Pattern labels are never shown to anyone else. A reason is shown only when the person ticked "Share the reason" on that entry, and then only to planners of a group the person is in. Commitments show their label ("Performance", "Shift") and the record's title only where the viewer may see that record.

**A8, on someone's behalf.** A planner may add a dated busy or maybe exception for a member of a group they plan for ("phoned in: away 12 March"). Never free, never a pattern. `entered_by` records them, the person is told and may change or delete it, and the planner may delete only what they added.

**A9, under-18s.** Whether someone is under 18 on a date comes only from core's `ageStatus(person, on)` (R3-25). The marker shows only to planners, never in an export, and nothing here contacts a parent.

(Diagram in the Claude Doc: https://claude.ai/artifact/RDYGyCYpg3RvKRGqyryC31) rule A4 · working out one instant's level

A "free" exception therefore overrides a busy pattern line or a calendar import, which is how "I can do this Thursday after all" works.

## Calendar imports

Matt chose these for the first release on 24 November (question 6). A person may bring in busy times from a calendar they keep elsewhere, so they need not paint the same lectures twice.

**I1, connecting.** Only the person connects their own calendar, from S14, while signed in; nobody can connect one on their behalf. A connection is a calendar connection, never a sign-in: it never creates, links or changes a login, so a personal Google calendar can be connected while Google sign-in stays Workspace-only (0008). Identity's consent service is numbered in spec 15 beside ID-47 (agreed with Integration, R3-26). Each kind is offered only while its switch is on (`availability.import.ics`, `.google`, `.microsoft`), and Google or Microsoft only while that sign-in provider is set up in the site. A secret calendar address must be https and must read as a calendar on a trial fetch before it saves. At most `availability.import.max-connections` live connections per person; a reconnect to the same provider account replaces the old connection.

**I2, consent.** Google and Microsoft use the provider credentials already set in the site for sign-in (Identity's provider cards), never a Worker secret. Connecting asks a separate consent for the narrowest calendar scope: Google `calendar.freebusy`; Microsoft `Calendars.ReadBasic`, with subjects thrown away on receipt. The refresh token is stored encrypted. Signing in with the same provider never grants calendar access by itself. Proof P-AV-1 confirms the scopes and whether Google needs app verification for accounts outside the site's Workspace.

**I3, what is kept.** Only start, end and level. Busy and out-of-office events become busy; tentative events become the connection's `tentative_as` (maybe by default); free, cancelled and declined events are ignored. All-day events cover the theatre's day. Only the import window (`availability.import.window` from today) is read.

**I4, not our own events.** A refresh drops anything the site itself put in the calendar: ICS events whose UID ends with the site's feed marker (C-70 UIDs are \<contributor>.\<key>@\<site marker>, the marker fixed in core configuration when the feed is first served, CF3), and any block matching one of the person's firm commitments from `core.person-busy` to within a minute (free/busy answers carry no ids). Without this, a person subscribed to their own feed would show every call twice, once as stated busy.

**I5, refresh and failure.** The task `availability.calendar-sync` refreshes each live connection every `availability.import.refresh`, on the bulk lane, replacing its blocks in one batch and announcing A6's `availability.updated` for the dates that changed. A person may also press "Refresh now" (at most once a minute). A failed refresh marks the connection failing; three in a row mark it broken and tell the person once. A broken connection's blocks are dropped seven days after its last good refresh. Disconnecting revokes the token at the provider and deletes the blocks at once.

**I6, who sees imports.** Imported time is the person's own availability, read like any other through `levels()` and contributed to `core.person-busy` as stated busy (firm false, `availability.unavailable`). Planners see busy or maybe and nothing about where it came from; the person alone sees it hatched as "From your calendar" with the connection's label. There is never a title, place or reason to share.

## Availability requests

**R1, opening.** A planner opens a request for groups they plan for (and named people in them); a module opens one with `openRequest` and a `source_ref`, at most one open per source. The period is at most 366 days; the due date is today or later. People are resolved by subquery into `availability_request_people`, all asked, in one batch.

**R2, joiners.** People who join a chosen group while the request is open are added as asked by the daily task, and told.

**R3, notices.** Each person asked is notified once at opening, and reminded at `availability.requests.first-reminder` and `availability.requests.second-reminder` before the due date while still asked. Nothing is sent after closing.

**R4, answering.** The request page shows the period with the person's own levels. Pressing "This is right" answers it, changed or not, and moves `checked_to` to at least the request's last date. Saving alone does not answer: a person may still be part-way through.

**R5, lapsing.** At the end of the due date, asked becomes lapsed. A lapsed person may still answer. The organiser sees who answered, who lapsed and who was withdrawn.

**R6, withdrawing.** The organiser may withdraw a person; a person who leaves every chosen group is withdrawn by the daily task.

**R7, closing.** A request closes by hand, by its module (`closeRequest(sourceRef)`) or at the end of its last date. Closing stops reminders only. Entry is never locked (agreed with Rehearsals, replacing its old F1 lock).

(Diagram in the Claude Doc: https://claude.ai/artifact/RDYGyCYpg3RvKRGqyryC31) rules R1 to R7 · a request and one person asked

A lapsed person can still answer; only the reminders end.

## Find a time and polls

**F1, who may look.** A find holds the members of groups the viewer may plan for, plus named people who are in such a group, or anyone at all for a holder of `availability.find.anyone`. At most 200 people; must-have people at most 30.

**F2, the grid.** A window of at most 62 days, chosen daily hours and the site's step. One `levels()` read and one `core.person-busy` read cover everyone, groups resolved by subquery and named ids chunked at 90.

**F3, best times.** A slot of the find's length is a best time only if every must-have person is free (or unmarked and treated as free) throughout and has no firm commitment. Best times rank by most people free, then fewest maybe, then fewest unknown, then earliest. Ten are listed.

**F4, commitments.** Firm rows count as busy, tentative rows (Programme planning's pencils) as maybe. Each shows its source. Rows from `source` availability are dropped, because the stated levels already cover them.

**F5, rooms.** When the organiser chose spaces and the occupancy support module is on, a slot where a chosen space is taken is hatched and is not a best time, unless "Room optional" is ticked.

**F6, under-18 warnings.** A slot ending after `core.under-18.latest-finish`, when that is set, warns if anyone in the find is under 18 on that date. A find whose people are exactly one adult and one under-18 warns once, when `availability.safeguarding.one-to-one` is on. Both are warnings, shown to the organiser only.

**F7, polling.** Sending a poll stores the find, its 2 to 6 slots and its people, and notifies them once. Each person answers yes, if need be, or no per slot, and may change an answer until the poll closes. Answers never change anyone's availability. The organiser sees tallies as they arrive; invitees never see each other's answers.

**F8, deciding.** The organiser may decide on any slot at any time, or abandon the poll; people are told either way. A poll still undecided `availability.polls.abandon-after` past its answer time is abandoned by the daily task, and the organiser is told.

**F9, targets.** "Turn into" offers only targets whose ability the viewer holds. A target's `open()` takes the slot, people, title and context, creates the owner's draft under the owner's own rules, and returns its reference, stored as `outcome_ref`. Availability never writes another module's tables. When every chosen group is a governance.body group, the Committee meeting target replaces Availability's own Meeting target, so a committee meeting exists only once.

## Arranged meetings

**M1, arranging.** A holder of `availability.meeting.arrange` arranges a meeting for people they may plan for (as F1), from a decided poll or directly. At most 24 hours long; start not in the past.

**M2, invitations.** Invitees are notified; each answers going or not going and may change it until the meeting ends.

**M3, moving.** A change of time notifies everyone, sets every response back to pending and announces `availability.meeting.moved`. A change of title, place or notes notifies only when the organiser ticks "Tell people".

**M4, cancelling.** Arranged becomes cancelled with an optional reason; everyone is told; it leaves feeds and `core.person-busy`.

**M5, busy.** Each invitee who has not said not going is busy, firm, for the meeting through `core.person-busy`, labelled "Meeting".

**M6, where it shows.** A meeting with a production context appears on that production's schedule (`productions.schedule-entry`, ability `productions.task.view`). Every meeting goes to its invitees' calendar feed (C-70). Arranging checks F6's warnings again.

(Diagram in the Claude Doc: https://claude.ai/artifact/RDYGyCYpg3RvKRGqyryC31) rules F7 to F9 and M1 to M6 · from a find to its result

Availability hands the slot over and stops: the call or session then follows its own module's states.
