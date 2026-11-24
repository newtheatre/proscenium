# 3. States and rules

Three records have a life cycle here: the entry, the placement (pencil, then core performance), and the plan. Every rule below has an id that stories and tests cite. Warnings are worked out when the board is read and are never stored; only a programmer's acknowledgement of one is.

## Life cycles

_[Diagram: life cycles · entry, placement, plan]_

Only two moves change anything outside this module: accepting an entry (core gets a draft production and draft performances) and publishing (core schedules them). Everything before that is this module's alone and can be undone freely.

## The call (C)

| Id | Rule |
| --- | --- |
| C1 | A season has at most one form in `programme-planning.call` (slot limit 1). Placing one creates the season's plan if it has none |
| C2 | The call opens and closes at the forms placement's times; the plan mirrors them for its overview, and never decides them |
| C3 | A form in the call slot may not take payment (slot features) |
| C4 | An answer bound to one of this module's attributes is written to the entry by this module's bindable writer, in the form builder's submission unit. The first submission creates the entry (an insert keyed by `source_ref`), so there is never a response without its entry |
| C5 | A resubmitted response updates its entry only while the entry is a candidate. After that the entry is the programmer's |

## Entries (E)

| Id | Rule |
| --- | --- |
| E1 | An entry belongs to one plan and never moves between seasons |
| E2 | A programmer may add an entry by hand, from a Companies engagement (point `programme-planning.entry-source`), or from an existing draft production of the season ("Bring onto the board"), which creates the entry already accepted |
| E3 | Accepting is allowed only from candidate. For an entry from the call it is the outcome action `programme-planning.accept-entry` on the form's accepting transition, run exactly once (FB-506); for any other entry it is the Accept action |
| E4 | Accepting is one unit: core's `createProduction` (title, kind, category, collections, running time, credits from the entry's people); the entry's state, `production_id` and `decided_at`, guarded by `state = 'candidate'` on the statement; each option-1 pencil turned into a draft performance through `createPerformance` with its placement row, the pencil deleted; the event `programme-planning.entry.accepted` |
| E5 | Declining is allowed only from candidate: through the form's declining transition (this module listens for `forms.response.decided`) or the Decline action. The entry's pencils are deleted in the same unit |
| E6 | A candidate is withdrawn when its response is withdrawn, when its applicant is erased, or by a programmer; its pencils go with it |
| E7 | Withdrawing an accepted entry removes its draft placements (core deletes the draft performances) in one unit. It is refused while any placement is scheduled: those are cancelled through core's own cancellation, which reaches Box office and Front of house |
| E8 | When core announces the entry's production cancelled, the entry becomes withdrawn with reason production-cancelled. Placements stay as history |
| E9 | Once accepted, the production's title, category and running time are core's; the entry shows them. Editing the entry's `minutes` does not move placements; a placement whose length differs is flagged (W10) |
| E10 | An entry's people and entry windows may be edited by holders of `programme-planning.entry.manage` at any state; never by the applicant after submission except by resubmitting while a candidate (C5) |

_[Diagram: accepting an entry · E3 and E4]_

## Pencils and placements (P)

| Id | Rule |
| --- | --- |
| P1 | A pencil may be made for a candidate entry, or as option 2 or 3 for any entry. An entry has at most `performances_wanted` pencils per option |
| P2 | Pencils never block anything. They are contributed to `core.space-busy` as yielding and to `core.person-busy` as advisory, so Spaces and Rehearsals see them as "pencilled" and are not stopped |
| P3 | Dropping an accepted entry on the board makes a draft performance through `createPerformance` (its production, the space, the start, the start plus `minutes`, or opening hours for drop-in) and a placement row, in one unit |
| P4 | Dropping on an offered slot makes one draft per occurrence of the slot's pattern inside its days, up to `performances_wanted`, and is refused if the slot already holds `takes` entries (a predicate on the insert) |
| P5 | Dropping onto another performance makes a line-up item through `addLineUpItem` and a placement row on the host performance. The host must be in the same plan's season |
| P6 | Moving a draft placement uses `movePerformance`. Moving a scheduled one goes through core's reschedule, with `core.change-impact` shown first (orders held, room bookings bumped), and is offered only to holders of core's own ability to reschedule |
| P7 | Removing a draft placement deletes the core draft and the row. A scheduled placement cannot be removed on the board; the board links to core's cancellation |
| P8 | Every board write carries `version = :expected` on the plan's update and raises it. A write against a stale version is refused ("Someone else changed the plan just now") and the board reloads; other open boards are told through the realtime hub |
| P9 | When an entry is accepted, option-2 and option-3 pencils stay pencils. "Use this option" swaps an option's pencils with the placements in one unit |
| P10 | A draft performance of an accepted entry's production made outside the board shows on the board as "made elsewhere" and can be adopted (a placement row is written). Publishing schedules only placements |

## Warnings (W)

Nine kinds, worked out on each board read from the occupancy module's `occupancy` (OC-01) and `core.person-busy` (C-66) and this module's own rows. None blocks a move. The first three, and a non-yielding busy time, are **hard**: they will refuse at publish because core refuses scheduling over them, so the board says so in those words.

| Id | Rule |
| --- | --- |
| W1 | **Space taken (hard).** In an exclusive space, a placement overlaps a scheduled performance, or another placement or pencil of this plan. Draft against draft is hard too: the second would be refused at publish |
| W2 | **Closed (hard, or a note).** A blocking closure of the space, its venue or the theatre is hard; a public holiday or other non-blocking closure is a note |
| W3 | **Turnaround (hard).** Two performances in one exclusive space closer than `core.programme.turnaround`, which core refuses |
| W4 | **Changeover.** The gap is less than the larger of the space's changeover (profile, else the setting) and the earlier entry's get-out plus the later one's get-in. Never less than W3: a profile below core's turnaround is raised to it when read |
| W5 | **Room in use.** Times from `core.space-busy`: yielding ones (room bookings, rehearsal calls through Spaces) say what publishing will bump; one that does not yield is hard |
| W6 | **Entry windows.** The placement, widened by get-in and get-out, falls outside every "can" window of the entry, or inside a "cannot". A "prefer" met shows as a tick |
| W7 | **In two places.** A person on the entry (its people, or after accepting its production's credits linked to accounts) is busy elsewhere in the widened window, from `core.person-busy` or from this plan's own placements and pencils. Names show only to holders of `programme-planning.plan.view` |
| W8 | **Tech need.** The space does not offer a required need of the entry (a warning) or a preferred one (a note) |
| W9 | **Count.** The entry has fewer placements than it wants (it stays in the tray) or more (a note) |
| W10 | **Length.** A placement's length differs from the entry's running time by more than five minutes (a note) |
| W11 | A warning has a key (its kind and the sorted ids it is about). A soft warning may be acknowledged with an optional note; the acknowledgement lapses by itself when the facts change, because the key changes. A hard warning cannot be acknowledged |
| W12 | Day view reads at most 14 days of at most 30 spaces in one call; Season view reads the plan's whole range but returns counts per space and day, not items |
| W13 | The tray card, the board block and the publish review show the same warnings from one function, so the three never disagree |

## Publishing (U)

| Id | Rule |
| --- | --- |
| U1 | A plan may be published from planning, and again from published to schedule placements added since |
| U2 | The review lists the draft placements to schedule, every hard clash (which stops it), soft warnings not acknowledged (which do not), what `core.change-impact` says ("4 room bookings will be bumped"), and how many people will be told |
| U3 | The screen sends the plan version and the count it showed. Either differing refuses, quoting both ("You reviewed 38; there are now 39"), as money-taking screens do with totals |
| U4 | Publishing is one unit: core's `schedulePerformances` for every draft placement, each guarded on its statement; if the plan says so, core's publish for each placed production still in draft; the plan's state, `published_at` and version; the event `programme-planning.plan.published`. If core refuses any placement, the whole unit is refused and the refusal lists each, with its reason |
| U5 | Two drafts that clash only with each other are caught at publish too: the statements run in order inside the batch and the second sees the first as scheduled (Festival-ready changes, 23 November 2026) |
| U6 | A plan larger than one unit's set-rows limit is published a day at a time (later story PP-30); until then the publish is refused with that remedy |
| U7 | Publishing never puts anything on sale. Box office's on-sale is unchanged |
| U8 | A plan closes by itself the day after its season ends, or by hand; a closed board is read-only. Reopening needs `programme-planning.plan.manage` |

_[Diagram: publishing a plan · U2 to U4, U7]_

## Telling acts (N)

| Id | Rule |
| --- | --- |
| N1 | After a publish commits, the job `programme-planning.send-slot-notices` (prompt lane) runs for each entry with a placement whose current space and times differ from what it was last told |
| N2 | Recipients are the entry's people with role contact and `told` true, plus the accounts contributed through `programme-planning.entry-contacts` (Companies). One message per person, however many entries name them |
| N3 | The first notice lists every slot. A later one lists only what changed, old beside new, or what was cancelled |
| N4 | Changes to scheduled placements after publish are gathered: an entry's notice is sent no sooner than `programme-planning.notices.gather` after its last change, so ten drags make one message |
| N5 | With `programme-planning.notices.send` at manual, nothing is sent until a programmer presses "Tell acts", which shows who will be told and what |
| N6 | Sending writes a notice row and each placement's told fingerprint in the same unit as the notification is queued |
| N7 | A line-up placement's notice names the host performance and the item's order |
| N8 | Pencils are never told to anyone |

_[Diagram: telling acts · N1 to N6]_

## The occupancy view (O), for the support module occupancy (OC-01 to OC-03)

| Id | Rule |
| --- | --- |
| O1 | `occupancy({ spaceIds, from, to })` returns, per space, every item in the window: scheduled and draft performances, closures and public holidays, and each `core.space-busy` contribution, with its kind, source module, times, whether it yields, and a record reference |
| O2 | A label is returned only where the reader may see it; otherwise the item is "Busy" with its times. Each contributor decides for its own items, as Spaces' rule K2 already does |
| O3 | At most 31 days and 30 spaces a call |
| O4 | It is a read for showing. No write anywhere is decided by it: writes keep their statement predicates |
