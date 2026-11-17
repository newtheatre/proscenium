# 3. Rules and flows

A booking has eight states, and only a Confirmed booking occupies time. Every rule below has an id so stories and tests can cite it.

## Booking states

| State | Meaning | Occupies the time | Final |
| --- | --- | --- | --- |
| Requested | Asked for, waiting for a decision | No | No |
| Confirmed | The time is the booker's | Yes | No |
| Declined | An approver said no | No | Yes |
| Withdrawn | The booker took the request back before a decision | No | Yes |
| Expired | Nobody decided before the start time | No | Yes |
| Cancelled | A confirmed booking given up, by the booker or by staff | No | Yes |
| Bumped | A confirmed booking displaced by a performance, a closure or a higher tier | No | Yes |
| Completed | The end time has passed | In the past | Yes, except the no-show mark |

### Moves between states

| From | To | Who or what | Condition |
| --- | --- | --- | --- |
| none | Confirmed | The booker, on asking | Every rule passes and approval is automatic |
| none | Requested | The booker, on asking | Every rule passes and a decision is needed (rule A1) |
| Requested | Confirmed | An approver | The time is still free, or what is in the way can be bumped (rule B2) |
| Requested | Declined | An approver | A note is given |
| Requested | Withdrawn | The booker, or staff |  |
| Requested | Expired | The sweep task | `starts_at` has passed |
| Confirmed | Cancelled | The booker, or staff | `starts_at` has not passed. Staff may cancel up to `ends_at` |
| Confirmed | Bumped | The system | Rules B2, L1, L2 |
| Confirmed | Completed | The sweep task | `ends_at` has passed |

No other move exists. A final state is never left: a declined request that should have been allowed is asked for again. Each move is one conditional update that names the state it expects, and the unit goes on only if the update changed something, tested as above nought and never as an exact number (D1's count includes rows written by triggers and indexes), so two people acting at once cannot both succeed. Each move writes a `spaces_booking_events` row and announces its event in the same unit of work.

## Asking for a booking

The checks run in this order, and the first failure is the one reported.

| Rule | Check | On failure |
| --- | --- | --- |
| P1 | The booker holds `spaces.booking.request` on the bookable, and the bookable is Active | Refused |
| P2 | The purpose is open to them: `bookers` means anyone passing P1; `production-team` means the fact `core.production-team` holds for them on the named production; `staff` means they hold `spaces.booking.manage` | Refused. The purpose is not offered in the picker in the first place |
| P3 | The purpose is allowed on this bookable, and is Active | Refused |
| P4 | Start and end fall on slot boundaries, the end is after the start, and the start is in the future | Refused |
| P5 | Length is within the limit: the bookable's, else the purpose's, else the setting | Refused, unless overridden |
| P6 | The start is no further ahead than the purpose's limit, else the setting | Refused, unless overridden |
| P7 | The start is at least the minimum notice away | Refused, unless overridden |
| P8 | The whole booking falls inside opening hours, or the bookable is always open | Refused, unless overridden |
| P9 | Every requirement on the bookable and on the purpose is met by the person the booking is for, at the booking's start (rule P13) | Refused, naming what is unmet, unless overridden |
| C1 | Nothing blocks the time | See "Clashes" |

**P10, override.** A person holding `spaces.booking.override` may pass P5 to P9 by giving a reason. The reason is stored on the booking and the act is audited. An override never passes P1 to P4 or C1.

**P11, on behalf.** A person holding `spaces.booking.manage` may make a booking for another member. Rules P2 to P9 are checked against the person the booking is for, so staff cannot hand someone a purpose they could not choose themselves, except by override.

**P12, capacity is advice.** If `attendees` is above the space's default capacity the form warns and the approver sees it. It never refuses: the capacity of a room for a rehearsal is not its seated capacity.

**P13, requirements.** A bookable and a purpose may each list requirements a booker must meet. Each is a reference held as plain text in Foundations' two-part form: `<source>:<id>`, such as `training:tcmp_...`, or `fact:<name>`. Spaces never reads inside a reference and holds no foreign key. It calls the kit's `requirements.check` for the person the booking is for, at the booking's start time, so a qualification that lapses before the day is caught when the booking is made. The verdicts and what Spaces does with each: `met`, carry on; `not-met`, refuse with the reason the source gives; `unavailable` (the judging module is off), not enforced. That last is this module's own choice, because a requirement here restricts who may book and grants nothing; the request form and the bookable's screen say so beside the requirement. A verdict's `until` lets the request form say when a qualification runs out. A holder of `spaces.booking.override` may allow an unmet requirement with a reason, audited with who allowed it. For a series the check is made at each occurrence's start. Spaces declares no point of its own for conditions on a person.

## Clashes

**C1, what blocks a time.** For a bookable and a window, the blockers are:

1. A Confirmed booking of the same bookable whose time overlaps. Two times overlap when each starts before the other ends.
2. For a space: a Scheduled performance in that space, from its start to its end.
3. A closure with kind `closure` that covers the space, its venue or the whole theatre. For a resource, a closure of its home venue or of the whole theatre.

A public holiday is not a blocker. It is shown on the calendar and on the request form as a note.

**C1a, other modules' uses of a space.** A fourth blocker for a space: any time another module reports through core's point `core.space-busy`, such as a training session. Spaces reads it through core's `isSpaceFree`, leaving out its own contribution, so anything that occupies a room blocks a booking and is drawn on the calendar, labelled by the module that reported it. These uses are code contributions and cannot be part of the one statement in rule C2: they are read immediately before the write. A module that takes a space is expected to ask `isSpaceFree` itself first, which then sees the bookings here.

**C2, the write that cannot double-book.** Confirming is one statement: an insert (or, for a request, an update from Requested) that carries the condition "no Confirmed booking of this bookable overlaps this window", and the unit goes on only if the statement changed something, tested as above nought and never as an exact number. D1 runs the statements of a unit one after another with no other writer between them, so of two people confirming overlapping times exactly one succeeds, and the other receives the refusal `spaces.clash` with the blocker named. For a space, the same statement carries core's predicate `assertSpaceFree(spaceId, from, to)`, which is false when a scheduled performance or a blocking closure overlaps, so blockers 2 and 3 are refused on the write itself and not by a read before it.

**C3, what the refusal says.** The refusal names each blocker by kind and time, and by title only if the reader may see titles (rule K2). It offers the nearest free time of the same length that day, where there is one.

**C4, a request does not take the time.** Two people may each have a request for the same time. Whichever is confirmed first has it. See question 1.

**C5, a request that clashes may still be asked for** when everything in the way is a booking of a lower tier that can be bumped (rule B1). It is stored with `bumps` set and always goes to an approver. A request that clashes with a performance, a closure, or a booking of the same or a higher tier is refused at once.

**C6, external bookables.** The theatre does not know the outside owner's diary. Blocker 1 still applies among the theatre's own bookings, so the theatre never asks for the same room twice. Blockers 2 and 3 apply as for any space. Which kind a space's bookable is follows core's managed flag on the space and is not chosen: a space the theatre runs is own, and a space it uses but does not run may be bookable only as external, so every request for it goes to a room manager, who places it with the owner and reports back. The insert of a bookable carries core's predicate assertSpaceManaged(spaceId), or its opposite, so the wrong kind is refused on the write itself. When core announces core.space.managed-changed the bookable follows in the listener's unit: it turns external when the theatre stops running the space and own when it starts. No booking is cancelled. Confirmed future bookings stay and, where the bookable turned external, show to the room managers as not yet placed with the owner; open requests wait for a room manager as rule A1 already says. Core offers the change to core.change-impact first and Spaces answers with the number of room bookings affected; it may warn but not refuse. A resource's kind is chosen by whoever manages it.

## Approval

**A1, when a decision is needed.** A booking goes to Requested, not Confirmed, when any of these holds: the bookable is external; the bookable's approval is `always`; the purpose's approval on this bookable is `approval`; the request would bump (C5); it is a change that needs one (X3).

**A2, who decides.** Anyone holding `spaces.booking.decide` on the bookable. The ability refuses its own owner: nobody decides a booking that is for them, whatever their role. If that leaves nobody, the health check "a bookable has no approver" fails.

**A3, what the approver sees.** The request, the booker, the purpose and tier, the notes, every other request for an overlapping time, every booking it would bump, and the booker's count of no-shows and late cancellations in the last 90 days.

**A4, deciding.** Confirm runs rule C2 again at that moment. Decline needs a note, which is sent to the booker. Either may carry a note.

**A5, telling people.** A new request notifies the approvers of that bookable. Requests still open after `spaces.requests.remind-after` are listed in one reminder a day, not one message each. The decision notifies the booker.

**A6, running out of time.** A request not decided by its start time becomes Expired and the booker is told. A request is flagged urgent in the queue once its start is nearer than `spaces.requests.remind-after`.

**A7, a series is decided once.** One decision covers every occurrence still Requested. An approver may instead open the series and decide occurrences one by one.

## Bumping

**B1, what can be bumped.** A Confirmed booking can be bumped by a request only when all of these hold: `spaces.bumping.enabled` is on; the request's tier is strictly higher (a smaller number); the booking's purpose has `can_be_bumped`; and the booking starts at least `spaces.bumping.notice` from now.

**B2, bumping happens at the decision.** When an approver confirms a request with `bumps` set, the same unit moves each booking in the way to Bumped with reason `higher-tier` and confirms the request. If anything in the way can no longer be bumped (the notice has run out, or a performance has appeared), nothing is written and the approver is told why.

**B3, inside the notice.** A person holding `spaces.booking.override` may bump inside the notice period, with a reason. It is audited.

**B4, the person bumped** is notified at once, with the reason, who to talk to, and a link that opens the request form filled with the same details and no time. A bumped booking is never restored automatically if the thing that displaced it later goes away.

**B5, equal tiers never bump each other.** Between two bookings of the same tier, the earlier confirmation stands.

## Changing and cancelling

**X1, small changes.** The booker may change the title, notes and attendee count of their own booking at any time before it ends.

**X2, changing the time or the bookable** is treated as a new ask: every rule from P1 runs against the new time. If it passes and no decision is needed, the booking is moved in one statement that carries the clash condition, so the old time is released and the new one taken together.

**X3, a change that needs a decision** creates a new request with `replaces_id` pointing at the booking. The booking stays Confirmed at its old time until the new request is confirmed, and then it is cancelled in the same unit. If the new request is declined, nothing has been lost.

**X4, cancelling.** The booker may cancel before the start. Inside `spaces.bookings.cancel-notice` the booking is marked `late_cancel`. The time is free the moment it is cancelled.

**X5, staff may cancel any booking** with a note, which is sent to the booker.

**X6, no-show.** After a booking is Completed, a person holding `spaces.booking.manage` may set or clear the no-show mark for 14 days. It changes nothing by itself: it is a figure the approver sees (A3). See question 5.

## Series

**R1, a series is expanded when it is made.** Each occurrence is a row in `spaces_bookings`, created in the same unit as the series. Nothing is generated later, so what the booker saw is what exists. The occurrences are written as one set, as Foundations' rule U7 requires: one insert reads them all from one parameter, each row carrying the clash condition of rule C2. The kit's guard follows it: a read statement that passes only when every occurrence asked for now exists in the series, and the unit rolls back if it does not. No count of changed rows is relied on.

**R2, limits.** At most `spaces.series.max-occurrences` occurrences, and the last no further ahead than the purpose's limit (P6). The purpose must allow repeats.

**R3, the clock.** Every occurrence starts at the same wall-clock time in the theatre's time zone. A series across a clock change keeps 19:00 as 19:00. A start time that does not exist on the day the clocks go forward is refused for that occurrence.

**R4, clashes inside a series.** The form checks every occurrence before anything is saved and lists those that clash. The booker chooses to leave them out or go back. A series is never partly saved by accident: if an occurrence that looked free is taken at the moment of saving, the whole save is refused and the list is shown again.

**R5, rules apply to each occurrence.** Opening hours and closures are checked per date.

**R6, changing a series.** Three scopes: this occurrence, this and later ones, or all that have not started. Past occurrences never change. A change of time runs R4 again for the occurrences in scope.

**R7, cancelling a series** cancels every occurrence that has not started and marks the series Ended.

**R8, monthly** means the same weekday of the month (the second Tuesday). A month with no such day is skipped.

## External bookables

**E1.** Every request for an external bookable goes to Requested.

**E2.** A person holding `spaces.booking.decide` on it records that the request has been placed with the outside owner (an `external-placed` event, shown to the booker as "asked"), then records the answer: Confirmed, with the owner's reference, or Declined with a note.

**E3.** The request form says, before anything is typed, that the theatre does not control this space, and shows the bookable's approval note.

## Who sees what

**K1, the calendar.** A person holding `spaces.calendar.view` on a bookable sees its bookings, performances and closures as blocks with times.

**K2, titles and names.** `spaces.calendar.show-details` decides what a viewer sees on other people's bookings: `full` shows purpose, title and the booker's name; `purpose` shows the purpose only; `busy` shows "Booked". Approvers and staff always see everything. The booker always sees their own. Notes are seen only by the booker and by people who may decide or manage.

**K3, requests on the calendar.** A viewer sees their own requests, drawn as outlines. Other people's requests are seen only by approvers. The request form tells a booker how many other requests are waiting for the same time, and nothing more.

**K4, nothing here is public.** No route of this module answers without sign-in.

## When other things change

| Rule | When | What happens |
| --- | --- | --- |
| L1 | A performance is scheduled, rescheduled or moved into a space (core's events) | Each Confirmed booking of that space that now overlaps becomes Bumped with reason `performance`. Each overlapping request is Declined with a standard note. The scheduler was shown the count beforehand through `core.change-impact` |
| L2 | A closure is created (core's event) | The same, with reason `closure`, for bookings in its scope. The scope is core's: the write selects the spaces through core's statement fragment closureSpaces(closureId), never from a list of ids read beforehand or from the event. A public holiday does nothing |
| L3 | A performance is cancelled or a closure removed | Nothing. The time shows as free. People bumped by it are not told; see question 4 |
| L4 | A space or venue is archived | Its bookable is archived. Future bookings are Cancelled with reason `bookable-removed`. Core's confirmation showed the count |
| L5 | A bookable is paused | No new requests. Existing bookings stand |
| L6 | A purpose's tier or rules change | Nothing already booked changes: bookings keep the tier they were made with |
| L7 | A booker's account loses the members' side or is suspended | Open requests are Withdrawn by the sweep. Confirmed bookings stay, flagged in the console for staff to decide |
| L8 | The record a booking was made for is removed (its origin) | The owning module calls the service that cancels by origin, in its own unit |
| L9 | The module is switched off | Tables are kept. Nothing is cancelled. Core's check of whether a space is free no longer counts bookings |

**Many bookings at once.** L1, L2 and L4 may change hundreds of bookings. Each listener writes set-wise, as Foundations' rules U7 to U9 require. It reads the bookings in the way; then one conditional update moves them, and the kit's guard, a read statement, passes only when none of the bookings read is still in the state it was read in; one insert writes their history rows; and one set each goes to `unit.announce` and to the notification service. The number of statements does not grow with the number of bookings. If a booking changed between the read and the write, the guard does not pass, the unit rolls back and the listener's retry reads again. When more bookings are in the way than `core.units.set-rows-limit` allows in one set, the listener changes the soonest and queues the job `spaces.clear-window` for the same blocker, which repeats in chunks until none is left. Each chunk is safe to repeat, because it acts only on bookings still Confirmed or Requested.

## Sweeps and reminders

| Task | Runs | Does |
| --- | --- | --- |
| `spaces.sweep-bookings` | Every 15 minutes | Confirmed past its end becomes Completed. Requested past its start becomes Expired. Series with nothing left become Ended. Applies L7 |
| `spaces.send-reminders` | Every 15 minutes | Sends the booker one reminder when the start is `spaces.reminders.before` away. Skipped if that setting is zero |
| `spaces.remind-approvers` | Daily at 09:00 | One message per approver listing requests open longer than `spaces.requests.remind-after` |

Each is safe to run twice: every step is a conditional update, and `reminded_at` guards the reminder.
