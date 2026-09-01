# Module C: Spaces and equipment

Room booking becomes calendar-first with policy enforced in code, replacing the request-and-approve
product whose published policy the old `rooms` app never enforced. The availability engine's proven
judgement carries (half-open intervals, pending-holds-slot occupancy, twice-asserted writes,
conflict masking), while the calendar, the policy engine, blackouts, tiers and no-show handling are
new build. Equipment loans arrive in V2 as the sibling the room store always implied, gated by live
training records because the gate and the record now share one database.

Counts: 19 MVP stories (C-101 to C-119), 6 V2 stories (C-201 to C-206), 2 Later epic stubs
(C-301, C-302). 27 total.

## Open questions

1. Which spaces are "sensitive" and queue for approval even when a request is inside policy (the
   auditorium during a production week is the obvious candidate)? Needs a committee list in the
   Phase 0 workshop.
2. The policy defaults inherited from the published `rooms` policy document (30-minute minimum,
   4-hour maximum, 4 working days' notice, 10-active-bookings cap, 12-week series limit) were never
   enforced in code. Are they still the numbers the committee wants, and is the notice window
   calendar days or working days?
3. Do externally arranged SU venues stay in scope, and if so does the AWAITING_EXTERNAL status
   carry, given assignment there is a manual conversation the system cannot confirm?
4. Does the old `allowConflicts` double-booking override carry into the unified system, or do
   blackouts plus priority tiers cover every legitimate use it had?
5. Who may record a no-show (any admin, or only the Theatre Manager), and does the consequence
   ladder reset at the committee-year boundary?
6. Which equipment categories are safety-critical and which training module gates each (rigging is
   confirmed; what else)? Needs the department leads in the room.

## C-101: Room and venue administration

- Role: Administrator
- Phase: MVP
- Story: As the Theatre Manager, I want to manage rooms and external venues so that the bookable estate reflects reality.
- Depends on: none
- Acceptance criteria:
  1. An internal room carries a name, capacity, per-weekday opening hours, a sensitive-space flag and an active flag; all fields are editable by an administrator and every change is audited with a from/to diff.
  2. Internal rooms deactivate (soft delete) so booking history stays readable; permanent deletion is refused with a clear error once any booking references the room.
  3. External venues carry campus, building, room and free-text contact details; deletion is refused while any booking references the venue.
  4. Deactivated rooms disappear from member-facing calendars and booking forms immediately but remain visible in historical bookings and reports.
  5. Room capacity is recorded and compared against a booking's attendee count at the write path, producing a warning (not a refusal) when exceeded; the old estate recorded both and compared neither.
- Source: Prompt Book C-1, C-2; audit RM-5.

## C-102: Calendar views per room and across rooms

- Role: Member
- Phase: MVP
- Story: As a member, I want week and day calendar views per room and across all rooms so that finding a free slot is looking, not guessing.
- Depends on: C-101
- Acceptance criteria:
  1. A week view and a day view render per room and across all rooms, showing each slot as free, booked, pending or blacked out.
  2. Clicking a free slot opens the booking form pre-filled with that room, date and time.
  3. All filtering and paging happens server-side in SQL; the browser never receives more than the visible span's bookings. The old app fetched every page of every booking to the client, and that defect must not recur.
  4. The calendar renders in Europe/London, and the weeks containing the March and October clock changes display correctly; both transitions are automated test cases.
  5. The calendar is readable on a phone: day view is the default below tablet width.
- Source: Prompt Book C-1; audit RM-3 (defect observed), RM-7.

## C-103: Availability search with conflict masking

- Role: Member
- Phase: MVP
- Story: As a member, I want to search availability over a span so that I can plan around what is already taken without seeing whose booking it is.
- Depends on: C-101
- Acceptance criteria:
  1. Availability search accepts any span up to 31 days and refuses (never truncates) a query whose conflict sweep would exceed the configured row bound, carried from the old app's 1,000-row refusal.
  2. Occupancy rules: CONFIRMED bookings, PENDING requests with a room assigned, and AWAITING_EXTERNAL bookings all hold their slot; a pending request with no room assigned holds nothing.
  3. Intervals are half-open, so a booking ending at 19:00 and one starting at 19:00 in the same room never conflict; this is an automated test case.
  4. Without admin standing, every conflicting slot reads "Booked" with no identity, title or production name; admins see full details. A member learns when a slot is taken, never whose it is.
  5. The same masking applies identically to the calendar (C-102), the search API and any error payload listing conflicts.
- Source: Prompt Book C-1; audit RM-2.

## C-104: ICS export and personal calendar feeds

- Role: Member
- Phase: MVP
- Story: As a member, I want my bookings in my own calendar so that rehearsals appear where the rest of my life is planned.
- Depends on: C-105
- Acceptance criteria:
  1. Every confirmed booking offers a single-event ICS download, and the confirmation email carries it as an attachment.
  2. Each member has a personal feed URL covering their upcoming bookings; confirmed bookings appear as confirmed and pending requests as tentative.
  3. The feed URL contains a revocable token; regenerating it invalidates the old URL, and the URL grants access to that member's bookings only.
  4. Feed events carry correct times across DST transitions (VTIMEZONE for Europe/London); a 19:00 booking is 19:00 local in every client, in both halves of the year.
  5. A cancelled or bumped booking disappears from the feed (or is marked cancelled) on the feed's next fetch.
- Source: Prompt Book C-1; audit RM-7 (calendar promised, never built).

## C-105: Instant booking within policy

- Role: Member
- Phase: MVP
- Story: As a member, I want a booking that satisfies every policy rule to confirm instantly so that a routine rehearsal slot never waits on a human.
- Depends on: C-101, C-106, C-107
- Acceptance criteria:
  1. A booking for a standard (non-sensitive) room that passes every policy rule and has no conflict is created CONFIRMED with the room assigned, with no approval step.
  2. Current membership is checked at the write path (module A); a lapsed member is refused with a message naming membership as the reason.
  3. The member receives a confirmation notification with the ICS attachment; the booking appears on the calendar immediately.
  4. A booking that fails any policy rule is not refused outright: it is offered as an approval request (C-108) with the failed rule named.
  5. A booking for a sensitive-space room always queues for approval, even when fully inside policy, and the form says so before submission.
  6. Bookings wholly in the past are refused at the API, not only in the UI; the old app accepted bookings in the past and three years out.
- Source: Prompt Book C-1; audit RM-1 (policy not enforced).

## C-106: Policy engine and configurable rules

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want booking policy as validated configuration enforced at the write path so that the published policy and the enforced policy are the same document.
- Depends on: C-101
- Acceptance criteria:
  1. The following are admin-editable, per room or estate-wide with per-room override: opening hours, minimum duration, maximum duration, advance-notice window, booking horizon, per-member active-booking cap and maximum series length.
  2. Starting defaults enter Phase 0 as proposals from the old published policy document (30-minute minimum, 4-hour maximum, 4 working days' notice, 10 active bookings, 12-week series) and are confirmed or amended in committee workshops before launch.
  3. Every rule is enforced server-side at the write path; the UI mirrors the rules but the API is the authority, so a hand-crafted request cannot bypass them.
  4. Each setting displays its default, its current value, and who last changed it when; every change is audited and reversible to the prior value in one action.
  5. A policy change applies to new bookings only; it never cancels or invalidates an existing confirmed booking.
  6. Out-of-hours, over-length, short-notice, beyond-horizon and over-cap requests each produce a distinct, named refusal-or-divert reason the member sees.
- Source: Prompt Book C-1, J-3, P5; audit RM-1 (policy not enforced); Get-In part 2 (policy engine is new).

## C-107: Race-safe slot claims

- Role: Member
- Phase: MVP
- Story: As a member, I want slot claims to be decided by the database so that two simultaneous requests for one slot can never both succeed.
- Depends on: C-101
- Acceptance criteria:
  1. Two concurrent booking attempts for overlapping spans in one room resolve to exactly one CONFIRMED booking; the loser receives a conflict response, never a silent double booking. This is a named regression case with an automated concurrency test.
  2. The no-overlap rule is enforced by the database (a constraint, or the clash predicate asserted on the write itself), never by a read-then-check-then-write in application code.
  3. Zero rows written resolves deterministically: gone (the target no longer exists) or conflict (someone took the slot), matching the old app's twice-asserted pattern but on stronger transactions.
  4. The conflict response lists the conflicting spans with identities masked for non-admins (C-103).
  5. Back-to-back bookings sharing a boundary instant both succeed (half-open intervals).
- Source: Prompt Book C-1, K-1; audit RM-4; Get-In part 2 (write path rebuilt on stronger transactions).

## C-108: Out-of-policy booking requests

- Role: Member
- Phase: MVP
- Story: As a member, I want to request a slot outside policy with a stated reason so that unusual needs get a decision instead of a dead end.
- Depends on: C-105, C-106
- Acceptance criteria:
  1. When a booking fails policy, the member may convert it to a request; the form shows exactly which rules failed and requires a reason (up to 1,000 characters).
  2. The request lands PENDING with its room and span held (pending-holds-slot), so the slot cannot be instant-booked out from under a decision in progress.
  3. A pending request unactioned after a configurable age triggers an escalation notification to the approvers and, after a second configurable age, expires with notification to the requester; the old app let pending requests sit forever.
  4. The member can edit a request only while PENDING; an edit re-runs policy and conflict checks in full.
  5. Sensitive-space requests follow this same path whether or not they breach policy.
- Source: Prompt Book C-1; audit RM-1, RM-2, RM-6 (no auto-expiry existed).

## C-109: Approval queue

- Role: Theatre Manager
- Phase: MVP
- Story: As the Theatre Manager, I want a triage queue for out-of-policy and sensitive-space requests so that every request gets an answer and no double booking is ever confirmed.
- Depends on: C-107, C-108
- Acceptance criteria:
  1. The queue lists pending requests with the requester, span, room, breached rules and stated reason; actions are approve, approve with a different room, and reject.
  2. Rejection requires a reason, which is shown verbatim to the requester in their booking list and notification.
  3. Approval is race-safe: the clash rule is asserted on the approving write itself, and an approval beaten to the slot returns a conflict listing what took it, never a confirmed double booking.
  4. Bulk approve and reject act on up to 100 requests at a time; resulting notifications group per user, so five decisions for one member arrive as one message.
  5. REJECTED and CANCELLED are terminal for everyone, admins included; reopening is refused because the slot may already be someone else's.
  6. Every decision is audited with actor, action and target.
- Source: Prompt Book C-1; audit RM-3, RM-4.

## C-110: Recurring bookings

- Role: Member
- Phase: MVP
- Story: As a member, I want a weekly rehearsal slot booked as one series so that a term of rehearsals is one action, not twelve.
- Depends on: C-105, C-106, C-107
- Acceptance criteria:
  1. Recurrence is daily or weekly (weekly requires chosen days), up to the configured series cap (default 12 weeks, roughly one term).
  2. The series expands to individual occurrences at creation; every occurrence is policy- and conflict-checked before any row is written.
  3. If any occurrence fails, nothing is written; the response lists every failing occurrence and its reason, and the member may resubmit excluding them.
  4. Recurrence arithmetic is London wall-clock: a 19:00 rehearsal stays 19:00 across both DST transitions, and both are automated test cases carried from the old app's behaviour.
  5. Occurrences share a series identity visible in the UI and the API, and each occurrence is an ordinary booking for every other rule in this module.
  6. A series inside policy for a standard room confirms instantly as a whole; one that breaches policy queues as a whole with the breaches listed per occurrence.
- Source: Prompt Book C-1; audit RM-1.

## C-111: Series and occurrence scope

- Role: Member
- Phase: MVP
- Story: As a member, I want series edits and single-occurrence edits to be distinct, explicit actions so that changing one week never silently changes the term.
- Depends on: C-110
- Acceptance criteria:
  1. Editing or cancelling from a series always asks "this occurrence" or "the whole series"; there is no implicit default and no single-button ambiguity.
  2. Series-scoped actions cover every non-terminal occurrence, resolved server-side; already cancelled or rejected occurrences are untouched.
  3. Cancelling or deleting the head occurrence promotes the next occurrence to series head atomically, so the series never splits; this is an automated test case.
  4. A series-scoped change re-runs policy and conflict checks across every affected occurrence before any row changes, with the same all-or-nothing rule as creation.
  5. Notifications for a series-scoped change group into one message per affected user, naming the occurrences changed.
- Source: Prompt Book C-1; audit RM-4 (series-scoped actions, head promotion).

## C-112: Cancellation

- Role: Member
- Phase: MVP
- Story: As a member, I want to cancel a booking myself so that a changed plan frees the room for someone else without emailing the Theatre Manager.
- Depends on: C-105
- Acceptance criteria:
  1. A member may cancel their own booking while PENDING or CONFIRMED; the slot frees immediately and the calendar updates.
  2. Cancellation is a status change, never row deletion; the old app's API let an owner hard-delete a CONFIRMED booking, and no delete path may exist for members in the new system.
  3. Cancelling a booking at an externally arranged venue raises a pointed warning to the approvers that the venue was arranged by hand and must be told.
  4. The member receives a cancellation confirmation; approvers are notified of short-notice cancellations inside a configurable window.
  5. CANCELLED is terminal; the booking remains visible in the member's history with its status.
- Source: Prompt Book C-1; audit RM-3 (defect observed: hard-delete of CONFIRMED).

## C-113: Booking notifications

- Role: Member
- Phase: MVP
- Story: As a member, I want booking status changes and reminders through my chosen channels so that I never miss a decision or a slot I booked.
- Depends on: C-105, C-109; Prompt Book H-1
- Acceptance criteria:
  1. Confirmation, rejection (with reason), bump, blackout cancellation and expiry each notify the affected member through the notification centre, honouring per-topic preferences; room bookings are one topic, not one per event type.
  2. Multiple changes to one member's bookings in a single action or hour coalesce into one message, carrying forward the old app's grouped status emails.
  3. A reminder goes out the day before each confirmed booking with the ICS attached; the old app had zero clockwork, so this is new and must be covered by a scheduled-job test.
  4. New pending requests notify the approvers; if every approver has the topic muted, the request still surfaces on the approval queue dashboard, so a muted inbox cannot orphan a request.
  5. Every automated send is logged with type, recipient and outcome; failures surface on the operations dashboard rather than vanishing.
- Source: Prompt Book C-1, H-1, P6; audit RM-1, RM-6 (no reminders, no clockwork, admin-alert backstop).

## C-114: Blackout periods

- Role: Theatre Manager
- Phase: MVP
- Story: As the Theatre Manager, I want blackout periods for maintenance, get-ins and external hires so that a closed room cannot be booked and existing bookings are told, not stranded.
- Depends on: C-101, C-113
- Acceptance criteria:
  1. An admin creates a blackout for one room or all rooms with a span and a mandatory reason; the old app had no blackout mechanism at all.
  2. New bookings and occurrences overlapping a blackout are refused, with the reason shown; recurring series creation excludes blacked-out occurrences from the all-or-nothing check only if the member explicitly opts to skip them.
  3. Creating a blackout over existing bookings cancels each with a notification naming the reason; for a recurring series, only the overlapping occurrences are cancelled.
  4. Blackouts render on the calendar for everyone with their stated reason; they are never masked as "Booked".
  5. Blackout creation, edit and removal are audited; removal restores nothing automatically (cancelled bookings stay cancelled and must be rebooked).
- Source: Prompt Book C-2; audit RM-6 (no blackout mechanism existed).

## C-115: Priority tiers and bumping

- Role: Theatre Manager
- Phase: MVP
- Story: As the Theatre Manager, I want priority tiers with a fair bumping process so that productions, training and general use coexist by rule, not by argument.
- Depends on: C-105, C-113
- Acceptance criteria:
  1. Every booking carries a tier; the default order is production in its show week, then scheduled training, then regular rehearsal, then general use, and the order is configuration confirmed in Phase 0 workshops.
  2. A higher-tier need may bump a lower-tier confirmed booking; bumping requires a mandatory reason and an admin action, never happens automatically, and an equal or lower tier can never bump.
  3. The bumped member is notified immediately with the reason and offered the nearest equivalent free slot (same room, or a room of at least equal capacity, closest in time); accepting rebooks in one action.
  4. A bumped booking becomes status BUMPED, distinct from CANCELLED, and links to the replacement offer; it is never deleted.
  5. Every bump is audited with actor, reason, the displaced booking and the replacing booking.
- Source: Prompt Book C-2; audit RM-1 (priority order published, never enforced).

## C-116: No-show recording and the consequence ladder

- Role: Theatre Manager
- Phase: MVP
- Story: As the Theatre Manager, I want no-shows recorded with a configurable consequence ladder so that empty booked rooms have a cost the member can see coming.
- Depends on: C-105, C-106
- Acceptance criteria:
  1. An authorised person can mark a past confirmed booking as a no-show; the mark records who, when and the booking, and cannot be marked on a future or cancelled booking.
  2. A no-show record is corrected by a superseding entry with a reason, never edited or deleted (facts are append-only).
  3. Repeated no-shows within a rolling window trigger a configurable ladder, defaulting to a warning at the second and a pre-approval requirement at the third; the numbers are workshop-confirmed configuration, not code.
  4. A member under pre-approval has every booking divert to the approval queue (C-109) regardless of policy compliance, and the booking form tells them so before submission.
  5. Members see their own no-show count and current standing; the ladder state is visible to them, not a surprise.
  6. Erasure keeps no-show statistics as anonymous rows; the ladder state itself dies with the account.
- Source: Prompt Book C-2, P2; audit RM-1 (no-show tracking promised, never built).

## C-117: Utilisation reporting

- Role: Theatre Manager
- Phase: MVP
- Story: As the Theatre Manager, I want utilisation reporting per room, per tier and per production so that the end-of-year review runs on numbers, not impressions.
- Depends on: C-105, C-116
- Acceptance criteria:
  1. Reports show booked hours against open hours per room per period, bookable from the policy engine's opening hours, with confirmed, cancelled and no-show hours distinguished.
  2. Breakdown by tier and, where bookings are production-tagged, by production.
  3. Report queries page in SQL and export to CSV; no report endpoint returns a bare unpaginated array.
  4. Figures survive user erasure as anonymous rows, so a year's statistics are never dented by a member leaving.
  5. Imported legacy bookings (C-118) appear in reports for their original dates, flagged as pre-migration data.
- Source: Prompt Book C-2; audit RM-3 (dashboard stats), EW-2; Get-In part 2 (history feeds reporting from day one).

## C-118: Legacy booking history import

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want the full booking history from the old rooms app imported so that utilisation reporting and member history start with years of truth, not an empty table.
- Depends on: C-101
- Acceptance criteria:
  1. Every booking imports keyed by the canonical account id, with original timestamps, statuses (PENDING, CONFIRMED, AWAITING_EXTERNAL, REJECTED, CANCELLED) and recurring series structure intact.
  2. The import is checksummed and reconciled by row counts; a mismatch fails the import loudly rather than proceeding partially.
  3. Anonymised tombstone rows port as tombstones; no import path may resurrect an erased identity.
  4. Web push subscriptions are deliberately not migrated; push consent is re-collected when push actually works.
  5. The import is re-runnable against fresh exports during migration rehearsals without duplicating rows.
- Source: Prompt Book C-1; audit RM-1, EW-2; Get-In part 3 (rooms inventory row, cutover order 2).

## C-119: The union's rooms, and what they are good for

- Role: Theatre Manager
- Phase: MVP
- Story: As the Theatre Manager, I want the rooms the SU manages listed with what each is good and bad for, so that nobody is sent to rehearse in a room with a fixed table in it again.
- Depends on: C-101
- Acceptance criteria:
  1. An SU room carries a name, campus, building, contact and capacity, and is retired rather than deleted so an old request still names something. It is a reference catalogue and never part of the bookable estate: nothing in it holds a slot or appears on a calendar.
  2. A suitability note records one verdict (suitable, caution, unsuitable) against one room and one purpose, with a mandatory reason. The same room may be unsuitable for a rehearsal and suitable for a meeting, which is the case the pairing exists for. Noting the same pair again replaces the verdict; notes are ordinary editable rows, not an append-only register.
  3. A member searching for a room sees, per result, whether it suits the purpose they are asking for, and the reason.
  4. The catalogue is searched on the server and never shipped whole: the union has hundreds of rooms.
  5. Every listing, change and note is audited; the wording of a note stays out of the trail, because it may describe a person's experience.
- Source: the Theatre Manager's spreadsheet, checked by hand before answering the SU; audit RM-6.

## C-201: Asset register

- Role: Department lead
- Phase: V2
- Story: As a department lead, I want an asset register of items and consumables so that the theatre knows what kit it owns, where it is and what state it is in.
- Depends on: C-101
- Acceptance criteria:
  1. Items carry an id, label, department, condition, home location and photos; consumables carry a quantity tracked by movement, not a stored figure.
  2. Safety-relevant kit links to a named training module in the training catalogue; the link is a reference the loan gate (C-202) resolves live.
  3. The register is searchable and filterable by department, condition and location; leads steward their own department's entries, admins everything.
  4. Retirement is a write-off with a reason, never row deletion; loan history against a retired item stays readable.
  5. Register changes are audited.
- Source: Prompt Book C-3; Get-In part 4 (equipment loans in V2).

## C-202: Training-gated loans

- Role: Member
- Phase: V2
- Story: As a technician, I want safety-critical kit to check my live training record at checkout so that competence gates the loan with no seam to fail open.
- Depends on: C-201; Prompt Book G-1
- Acceptance criteria:
  1. Checking out safety-flagged kit requires the borrower to currently hold the linked module's record; EXPIRING counts as held, EXPIRED does not, and validity is derived at the moment of checkout, never cached.
  2. The check is an internal query in the one database and fails closed: if the record cannot be read, the loan is refused. There is no API seam, no advisory cache and no fail-open path.
  3. A refusal names the exact module that would unlock the loan, matching the training module's "what unlocks this" convention.
  4. Non-safety kit checks nothing beyond membership.
  5. An admin override for a gated loan exists, requires a reason, and is audited; it is absent from the ordinary checkout flow.
- Source: Prompt Book C-3 (safety-critical), G-1; audit TR-8 (fail-closed rule carried, seam dissolved per Get-In part 2).

## C-203: Checkout and return

- Role: Member
- Phase: V2
- Story: As a technician, I want checkout and return with condition recorded both ways so that kit stops disappearing into rehearsal rooms.
- Depends on: C-201, C-202
- Acceptance criteria:
  1. Checkout assigns an item to a person or a production with a due date; condition out is recorded at that moment.
  2. Return records condition in and restores the item's availability; a condition worse than at checkout prompts a damage report (C-205).
  3. An item cannot be checked out twice concurrently; the claim is race-safe at the database, same standard as C-107.
  4. Open loans are listed per person, per production and per department; consumable issues decrement quantity by movement.
  5. Loan history is append-only; corrections supersede.
- Source: Prompt Book C-3; audit RM-4 (race-safe claim pattern).

## C-204: Overdue loan handling

- Role: Department lead
- Phase: V2
- Story: As a department lead, I want overdue loans to nag the borrower and surface to me so that chasing kit is clockwork, not memory.
- Depends on: C-203; Prompt Book H-1
- Acceptance criteria:
  1. A loan past its due date nags the borrower on a configurable cadence through the notification centre, stopping immediately on return.
  2. Overdue loans surface on the owning department lead's dashboard and in their periodic digest.
  3. After a configurable escalation period, the overdue loan is flagged to the committee alongside the lead.
  4. The clockwork notices and reminds only; it never closes, extends or reassigns a loan (the system notices; humans decide).
  5. Every automated send is logged with outcome.
- Source: Prompt Book C-3, P6, H-1; audit RM-6 (the no-clockwork failure mode this avoids).

## C-205: Damage and loss reports

- Role: Member
- Phase: V2
- Story: As a technician, I want to report damage or loss against an item so that broken kit gets a decision instead of going quietly back on the shelf.
- Depends on: C-203; Prompt Book I-1
- Acceptance criteria:
  1. A report is raised at return or standalone, with description and photos; it opens a follow-up owned by the department lead.
  2. Follow-up outcomes are repair, write-off, or recharge to a production budget; a recharge posts a ledger entry in Finance referencing the item and report.
  3. An item under repair or reported lost is unavailable for checkout and reservation until the follow-up resolves.
  4. Reports and resolutions are append-only with a mandatory resolution reason.
  5. Free text in reports is reachable by erasure scrubbing, so a report about a person's loan never blocks their erasure.
- Source: Prompt Book C-3, P2, I-1; audit EW-2 (free-text scrubbing rule).

## C-206: Kit reservation ahead of a loan

- Role: Member
- Phase: V2
- Story: As a technician, I want to reserve kit for a future date range so that a production week's equipment is secured before the week it is needed.
- Depends on: C-203
- Acceptance criteria:
  1. Items are reservable for a date range by a person or production; reservations check against loans and other reservations using the same half-open interval engine as room bookings.
  2. A reservation converts to a loan at checkout; one unclaimed past its start releases after a configurable grace period, with notification to the reserver, released by clockwork that is audited as system.
  3. Training-gated kit applies the C-202 gate at reservation and again at checkout, since a record can expire in between.
  4. Department leads see a demand calendar of reservations against their kit.
  5. Reservations are masked like room bookings: non-privileged viewers see an item as unavailable, not who has it.
- Source: Prompt Book C-3; audit RM-2 (interval and masking engine reused).

## C-301: External hires

- Role: Theatre Manager
- Phase: Later
- Story: As the committee, I want external hire enquiries handled in-system so that hiring the space out is income, not inbox archaeology.
- Depends on: C-114; Prompt Book I-1
- Acceptance criteria:
  1. Enquiry form, quote, then confirmed hire with contract reference and an invoice posted through Finance.
  2. A confirmed hire appears as a blackout on the internal calendar with its reason.
  3. Hirers get a scoped guest page: their booking, their invoice, and the venue's technical and emergency information, and nothing else.
- Source: Prompt Book C-4; Get-In part 1 constraint 2 (Later by decision).

## C-302: Production-linked room scheduling

- Role: Production role
- Phase: Later
- Story: As a producer, I want rehearsal bookings linked to my production hub so that the show's true room usage and cost are queryable in one place.
- Depends on: C-105, C-117; Prompt Book B-3
- Acceptance criteria:
  1. When the production module lands, room bookings link to a production, and the hub shows its bookings and utilisation.
  2. Show-week priority tier membership (C-115) derives from the production's programmed dates automatically, not from manual tagging.
  3. A production's room usage feeds its settlement report alongside budget and box office figures.
- Source: Prompt Book B-3, C-2; Get-In part 4 phase 5.
