# 3. Rules and flows

Every write below is one unit of work: the change, its audit entry and its event go in one batch or none do. Every refusal uses the Foundations body `{ code, reason, remedy? }`; codes are listed at the end of this part. A write that reaches many rows at once (cancelling a performance's shifts, telling everyone on a rota) is written set-wise, as Foundations' rules U7 to U9 require, never one statement per person. No rule here depends on how many rows a statement changed, because D1's count includes rows written by triggers and indexes. A change that is only valid from a given state (taking cover, check-in, completing a checklist run, closing an incident, signing off a report) succeeds when the kit's guard passed in the same unit, and is refused when it did not. None of those records its outcome in a later statement, so none needs more than the guard. The one unit that must know which rows a conditional write changed is the account merge, which uses Foundations' claim stamp (below).

## The shift window

The window is the period in which a shift gives its people authority. It is stored on the shift, so the answer to "is this person on shift?" is one indexed read.

| Value | How it is set |
| --- | --- |
| `call_at` | The performance's start, less the duty's `call_before_minutes`. A manager may change it per shift |
| `ends_at` | The performance's expected end (start plus running time and intervals, from core), plus the duty's `stay_after_minutes`. When core has no running time, start plus three hours |
| `window_opens_at` | `call_at` less `front-of-house.shifts.window-before` (default 30 minutes) |
| `window_closes_at` | `ends_at` plus `front-of-house.shifts.window-after` (default 60 minutes) |

Rules:

1. The two settings are read when the shift is created or its times change. A later change to a setting does not move shifts that already exist; the settings screen says so.
2. **Extend tonight.** A person leading the shift, or a manager, may move `window_closes_at` later for every shift of the performance, in steps of 30 minutes, to at most six hours after `ends_at`. It is audited and shown on the board. It never moves the window earlier.
3. **When the performance moves.** On core's rescheduled event, every shift of the performance has its four times recomputed by the same offsets it had, in the event's unit of work. People with a live assignment are told. A person may then release the shift without the notice rule applying.
4. **When the performance is cancelled.** Every shift becomes cancelled, every live assignment becomes released, and people are told once, in one notification.
5. **Closing.** The task `front-of-house.close-shifts` marks a shift completed once its window has closed. It does not resolve who worked; sign-off does (below), and the task does it for a shift not tied to a performance.
6. The window is the same for everyone on a shift. Two duties at one performance may have different windows, because their call times differ.

## The three facts

| Fact | On | Standing | Holds when |
| --- | --- | --- | --- |
| `front-of-house.on-shift` | `core.performance` | yes | The account has an assignment in state confirmed, release\_requested or checked\_in, on a published shift of that performance, and now is from `window_opens_at` to `window_closes_at` inclusive |
| `front-of-house.leading-shift` | `core.performance` | no | As on-shift, and the shift's duty has `is_lead` |
| `front-of-house.rostered` | the site | yes | The account has an assignment in state requested, confirmed, release\_requested or checked\_in on any shift whose window has not closed |

Each resolver answers the three things Foundations asks of a fact: whether it holds, which record it holds on (the performance, with the assignment given as the reason), and until when (`window_closes_at`). Resolvers are pure reads. Every read, count and claim by account, in the resolvers and in sign-up, uses the kit's account scope (the survivor and its aliases), so a merged person is on shift once and cannot hold two places.

What follows from that:

- **A requested assignment gives no authority.** Only a confirmed one does. Rostered holds from the request, so a new volunteer can reach the members' area to see what they asked for.
- **Being on shift does not need check-in.** A steward who forgets to tap "I'm here" can still scan. Check-in is a record of attendance, not a key (question 6).
- **A shift not tied to a performance confers rostered only** (question 8). There is no performance for the other two facts to hold on.
- **Loss takes effect on the next request.** Nothing is cached beyond the request. A page open on a phone keeps showing what it showed; its next write is refused with `front-of-house.shift-ended`, which the interface shows as stuck, never retried.
- **Leading-shift grants privileged abilities only when the theatre confirms it**, as Foundations requires of any fact. The setup step for the module asks once.
- **Removal or release ends the fact at once.** So does cancelling the shift.

The on-shift bar and the Tonight entry in the account menu follow `front-of-house.on-shift`. The members' home card "Your shift tonight" follows an assignment whose call time is today and whose window has not yet opened.

## Shifts

States: draft, published, completed, cancelled.

| From | To | Who | Rule |
| --- | --- | --- | --- |
| none | draft | manager | By applying a rota template to a performance, or adding one shift. Applying a template twice adds only duties not already present |
| draft | published | manager | Shifts of a performance are published together or one at a time. Publishing announces `front-of-house.shift.published` |
| published | draft | manager | Only while no one is assigned |
| published | completed | task | After the window closes |
| draft, published | cancelled | manager, or core's cancelled event | Needs a reason from a manager. Live assignments are released and people told |

A manager may change `places` at any time, never below `places_taken`. A draft shift is invisible to members. Nothing here is created automatically for any performance, so a performance in a space the theatre uses but does not manage gets no shifts unless a manager adds them by hand; once added they behave like any others. The flag is core's and sits on the space, not the venue, and is read through core's service. Front of house uses it in two places only: the Rota page marks such a performance and the bulk "Apply rota template" skips it, and the emergency card health check does not ask for a card on its account.

## Assignments

| From | To | Who | Rule |
| --- | --- | --- | --- |
| none | requested | the person | Sign-up, when `front-of-house.shifts.confirmation` is manager |
| none | confirmed | the person, or a manager | Sign-up when confirmation is automatic (the default), or a manager assigning someone |
| requested | confirmed, declined | manager | Declining frees the place |
| requested | withdrawn | the person |  |
| confirmed | released | the person | Outside the release notice |
| confirmed | release\_requested | the person | Inside the release notice. The place stays theirs and the shift is offered as cover |
| release\_requested | released | another member taking cover, or a manager | Taking cover creates the taker's confirmed assignment (source cover) and releases the first in one batch |
| release\_requested | confirmed | the person | They change their mind before anyone takes it |
| confirmed, release\_requested | checked\_in | the person, or someone leading | Only inside the window. A repeat, such as two leads marking the same person, is accepted, keeps the first time and changes nothing else |
| confirmed, release\_requested, checked\_in | worked, no\_show | someone leading at sign-off, or a manager | Default is worked. No-show is never set by a task |
| any live state | removed | manager | The person is told. A reason is not required and is not shown |

**Sign-up is allowed when** the shift is published, `sign_up_closes_at` has not passed, a place is free, the person passes eligibility, and the person has no other live assignment whose `call_at` to `ends_at` overlaps. A requested assignment takes a place, so a queue never exceeds the places on offer.

**Capacity.** Each change that takes or frees a place also changes `places_taken` in the same batch. The CHECK on that column fails the batch when two people take the last place at once; the loser is refused with `front-of-house.shift-full`.

**Eligibility.** The duty lists requirement references, each the source's id, a colon, and the source's own id (for example `training:tcmp_...`; a declared fact is `fact:NAME`), chosen through `requirements.options` and labelled through `requirements.describe`, the kit's calls on the core point `core.requirement` (Foundations' ruling of 16 November, as amended). Front of house never reads inside a reference. At sign-up it calls `requirements.check` with the account, the duty's references, the shift's call time as the instant, and the shift as the record. Each pair is answered met, not-met with a translated reason, or unavailable. All must be met. Unavailable (the source's module is off) is not enforced by front of house, which is the host's choice to make: a requirement on a duty restricts who may do something and grants no benefit, and the duty and shift screens say so. A duty with no requirements takes anyone with the sign-up ability. The consequence is front of house's: a sign-up with a requirement not met is refused; a manager assigning someone sees the same answers as warnings and may go ahead, and that override is audited with who allowed it.

**Release notice.** `front-of-house.shifts.release-notice` (default 48 hours before call). Outside it a person simply leaves. Inside it they ask, the place stays theirs, the manager and other eligible members see "cover needed", and the person remains responsible until someone takes it. Nothing punishes a late release; the manager sees it.

**Reminders.** `front-of-house.remind-shifts` sends at most two, at `front-of-house.reminders.first` and `.second` before call. `reminded` counts them so a re-run sends nothing twice.

**Hours.** `minutes_worked` is set when an assignment becomes worked: from `call_at` to `ends_at` when `front-of-house.hours.count-from` is scheduled (the default), or from check-in to check-out when it is checked and both exist. A manager may correct it; the correction is audited.

## The Tonight board

The board is a read of one performance: who is on which duty and whether they have arrived, the timings recorded so far, each checklist's progress, open incidents by number, and the figures other modules contribute through `front-of-house.tonight-figure`. It is served by one live-data source and refreshes on the interval the interface sets for live mode. A contributed figure that fails or is slow is shown as unavailable; it never blocks the board.

- **Arrived.** A person is flagged "not arrived" when the performance is within `front-of-house.shifts.late-after` of the call time passing and they have not checked in. It is a prompt to the lead, not a state.
- **Timings.** Each kind is recorded once per performance by a tap, with the time adjustable by up to an hour either way. Recording one again replaces it and is audited.
- **House open.** When `front-of-house.checklists.block-house-open` is on, recording house\_open is refused while a pre-show checklist run for the performance is still open. The default is off: the board warns instead.

## Checklists

1. A run is created the first time someone opens a checklist for a performance (or for a venue and operating day). Its items are the checklist's live items at that moment.
2. Each item gets one entry: done, exception or not applicable. A reading item needs its number to be done. An exception needs a reason code and may take a note.
3. Anyone on shift may enter any item; the duty on a checklist is a hint. The entry records who and when.
4. An entry may be changed while the run is open. The last write wins per item and every change is audited.
5. A run is completed by one tap once every required item has an entry. Its state is complete, or complete\_with\_exceptions when any entry is an exception. Completing announces `front-of-house.checklist-run.completed`.
6. A completed run may be reopened only by someone leading, before the night report is signed off.
7. **Offline.** Entries are queued writes with idempotency keys, carrying the device's time. A queued entry that arrives after the run was completed is refused and shown as stuck.

## Incidents

States: reported, in\_review, closed.

**Reporting.** Asks for the least that makes a useful record: what happened, where, when, whether it is an incident or a near miss, whether anyone was hurt, whether first aid was given, whether the emergency services were called. Everything else waits for review. The report works offline as a queued write.

**Severity** is set at report: minor by default; at least moderate when first aid was given or the emergency services called; serious when the reporter marks it so. A reviewer may change it either way, except below moderate while either flag is set. Each change is logged in the updates.

**Routing.** At or above `front-of-house.incidents.immediate-severity` (default serious), holders of `front-of-house.incident.manage` are notified at once on the prompt lane. Below it, incidents arrive in a daily digest. A notification carries the number, kind, severity and a link, and nothing else.

**Review.** Opening a reported incident as a reviewer moves it to in\_review. Review adds the category, the people involved, and follow-up actions. The health check and a console card flag an incident not opened within `front-of-house.incidents.review-within`.

**People.** A person involved is linked to an account when they have one, or recorded by name and contact when they do not. Welfare details go in the encrypted column and are shown only to holders of `front-of-house.incident.view`, with each read audited.

**Closing** needs a closing note and every action done or dropped. A serious incident cannot be closed by the account that reported it; the service refuses with `front-of-house.incident-needs-second-person`. A closed incident may be reopened by a manager; the reopening is logged.

**What the reporter sees afterwards.** Their own reports, as number, kind, state and their own words. Not the people, the welfare details, or the review.

**Actions.** `front-of-house.chase-actions` reminds an owner the day before an action is due and weekly while overdue.

## The night report

1. **Draft.** Created when the first shift window of the performance opens, or by hand by a manager. While it is a draft, the report page is a live view: nothing is copied yet.
2. **Notes.** Anyone leading adds notes under a topic. A note is about the night. The page points to "Report an incident" for anything about a person.
3. **Sign-off.** Someone leading, or a manager, signs off. The page first shows what is unresolved: assignments still to mark worked or no-show, open checklist runs, timings missing. Open checklist runs and missing timings are warnings; unresolved assignments default to worked. In one unit of work, sign-off resolves the assignments, compiles the snapshot, sets the state, and announces `front-of-house.night-report.signed-off`.
4. **The snapshot** holds: the timings; counts of people by duty and of no-shows; each checklist run's state and its exceptions as item label and reason code; incident numbers with kind and severity; and each section contributed through `front-of-house.report-section` as labelled numbers. It holds no names and no free text, so nothing in it ever needs erasing. The notes are shown beside it from their own table.
5. **Distribution.** When `front-of-house.night-report.auto-distribute` is on, holders of `front-of-house.night-report.view` who follow the topic get a notification with the headline numbers and a link. It never carries incident detail (question 9).
6. **Afterwards.** The row cannot change. A correction is an addendum: a note written after sign-off, shown under the report with its author and time.
7. **Chasing.** `front-of-house.chase-night-reports` tells managers each morning about any performance that ended more than `front-of-house.night-report.sign-off-by` ago with a draft report.

## Volunteer hours

A list of worked assignments, filtered by date range, person and duty, with totals. The person filter narrows this list, which is already on the screen, through identity's service findAccounts(text, list), exported from core's services: it answers a subquery of account ids that is passed to the kit's account scope, it is guarded by Identity's ability core.account.find, which front-of-house.hours.view implies, and it writes one audit read entry per call that never holds the text typed. Choosing a person who is not yet on the screen, as when a manager adds someone to a shift, is identity's other service, the person picker searchAccounts, under core.account.search, which every preset with console work already holds, so front-of-house.shift.manage implies nothing for it. Front of house never queries the accounts table itself. The search for an incident person with no account is a different thing: it reads this module's own rows. It can be exported under the export rate-limit class. A member sees their own total on "My shifts".

## The emergency card

One per venue, shown in live mode without any network once it has been opened on the device. It shows the date it was last reviewed. Saving the card sets the review date to today only when the editor ticks "I have reviewed the whole card".

## Privacy

- **Erasure of a member.** Assignments are kept on Identity's tombstone and their free text is redacted. Their rows in incident people are anonymised and the welfare details cleared at once.
- **Erasure hold.** The module contributes a `core.erasure-hold` for an account listed on an incident that is not closed, quoting the reason key `front-of-house.retain.incident`. Once the incident is closed the hold lifts; the incident's free text is retained until the retention period ends and then redacted.
- **A person with no account.** Reached only by staff: holders of `front-of-house.incident.redact-person` find the person through the incident search and redact their row. Identity's data-request screen lists this as a manual step.
- **Retention.** A daily sweep in the close-shifts task removes assignments, checklist runs and incident personal data past their periods. An incident with a child involved uses the longer period (part 6).
- **Download of my data.** The module contributes the person's assignments and hours, the incidents they reported (their own words), and their rows in incident people without the welfare details of others.

## Account merge and undo

Identity stages a merge and may undo it for 30 days. Only `front_of_house_assignments.account_id` is moved to the survivor; every other account column is an alias and is read through the kit's account scope.

1. **Before the move.** Where both accounts hold a live assignment on one shift, the handler keeps the one further along (checked\_in, then confirmed, then release\_requested, then requested; the older on a tie) and releases the other, stamping it `freed_by_merge` with the merge's id. This is Foundations' claim stamp: the merge's id is held before the unit starts. The released assignment is also listed through the kit's merge helper as a merge item of kind set-aside with onClose 'keep', because the released row is kept when the undo window closes; the stamp remains this module's own state.
2. **Places.** The next statement sets `places_taken`, on each shift that has an assignment stamped by this merge, to that shift's count of live assignments. It reads the stamp, never a count of changed rows, so running the merge again changes nothing.
3. **Undo.** After Identity has moved the column back, a stamped assignment is restored when its shift's call time is still ahead, a rota place is free and the account holds no other live assignment on the shift. It returns as a new sign-up would: confirmed when `front-of-house.shifts.confirmation` is automatic, requested when a manager confirms. `places_taken` is set again as in step 2. Nothing is taken back from anyone else.
4. **What undo reports.** The assignments still stamped and still released after step 3, as Identity's contract asks: { notRestored, reason }, where the reason is one of three fixed codes. They are front-of-house.shift-begun (the call time has passed), front-of-house.shift-full (no place is free) and front-of-house.already-on-shift (the account has signed up for the shift again since the merge). The daily sweep clears the stamp once the undo window has closed.

Merge and undo are each one unit and safe to repeat.

## Refusal codes

| Code | When |
| --- | --- |
| `front-of-house.shift-full` | No place left |
| `front-of-house.shift-closed` | Sign-up has closed, or the shift is not published |
| `front-of-house.shift-overlaps` | The person is on another shift at that time |
| `front-of-house.not-eligible` | A requirement is not met; the reason is the provider's |
| `front-of-house.shift-ended` | The act needs a fact whose window has closed |
| `front-of-house.outside-window` | Check-in before the window opens |
| `front-of-house.checklist-run-complete` | An entry for a completed run |
| `front-of-house.checklists-open` | House open while a pre-show run is open, when the setting is on |
| `front-of-house.incident-needs-second-person` | A serious incident closed by its reporter |
| `front-of-house.incident-actions-open` | Closing with an action still open |
| `front-of-house.report-signed-off` | A change to a signed-off report |
