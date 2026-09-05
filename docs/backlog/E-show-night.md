# Module E: Show night operations

The rota, the duty manager's evening, the safety paper trail and the backstage board: the part of
the old estate most worth keeping, rebuilt on one database. The proven judgement carries (the
04:00 boundary, database-held staffing invariants, append-only registers, the derived board code,
auto-closing night reports), while the fail-open eligibility seam to the training app dissolves
into internal queries that fail closed. Show night is hostile territory: every screen here is
phone-first, one-handed, and degrades to cached read-only rather than a spinner.

Counts: 27 MVP stories (E-101 to E-127), 4 V2 stories (E-201 to E-204), 1 Later epic stub (E-301).
31 total.

## Open questions

1. Answered by E-105's pull request: claims auto-confirm by default (`docs/workshops.md`), a
   proposed value rather than a workshop decision, so it remains a settings change to reverse. In
   queue mode only `rota.write` holders (the FOH officer and administrators) may confirm or
   decline, the same audience E-101 gave the templates to.
2. Which training modules gate which shift roles at launch (duty manager, door, bar), and is any
   time-boxed officer override permitted on a safety-gated role, as stage-door's 90-day eligibility
   overrides once allowed? The catalogue mapping is committee work.
3. Who holds the safety officer function that incident severity routing targets? The Prompt Book
   names no such committee role; it needs a mapping in the role vocabulary table.
4. What are the retention periods for frozen night reports and the Challenge 25 register? Both are
   licensing evidence and must outlive ordinary retention automation; the number needs writing
   down.
5. Answered 3 September: the bypass carries. Designated officer roles open show-night screens
   without a shift; every use is audited and flagged in the night report's staffing section
   (E-111, `../build-order.md`). A decision record lands with E-111's first pull request.
6. Backstage board acknowledgements attach to anonymous devices with self-chosen labels. Is a
   device-level acknowledgement operationally meaningful for clearance calls, or does clearance
   need a named confirmer?

## E-101: Shift templates per venue

- Role: FOH officer
- Phase: MVP
- Story: As the FOH officer, I want per-venue shift templates so that every performance is staffed the same way without setting up each night by hand.
- Depends on: none
- Acceptance criteria:
  1. A template belongs to one venue and lists slots, each carrying a role (DUTY_MANAGER, DOOR or BAR) and a count; every venue template includes exactly one DUTY_MANAGER slot.
  2. Templates are editable by the FOH officer and administrators; every change is audited with a from/to diff.
  3. Editing a template affects only performances stamped afterwards; rotas already stamped are untouched.
  4. A performance created in a venue with no template stamps zero slots and immediately appears in the unstaffed escalation (E-108) rather than failing silently.
- Source: Prompt Book E-1; audit PR-13; get-in disposition (rota carries).

## E-102: Stamping shifts onto performances

- Role: FOH officer
- Phase: MVP
- Story: As the FOH officer, I want template slots stamped onto every performance automatically so that the rota exists the moment a performance does.
- Depends on: E-101
- Acceptance criteria:
  1. Creating a performance stamps one open shift per template slot in the same transaction; a performance can never exist staffed-by-nothing while its venue has a template.
  2. A backfill action stamps missing slots for existing performances and is idempotent: running it twice creates no duplicate shifts, held by a uniqueness rule on (performance, slot).
  3. Stamped shifts are created OPEN with no person named, satisfying the E-106 constraint from birth.
  4. Cancelling a performance cancels its shifts; confirmed holders are notified, open shifts vanish from the claimable list.
- Source: Prompt Book E-1; audit PR-13 (idempotent backfill carries).

## E-103: The qualification-gated shift list

- Role: Member
- Phase: MVP
- Story: As a member, I want the open-shift list to show what I currently qualify for and name what would unlock the rest so that staffing is self-service and the safety gate is visible, not mysterious.
- Depends on: E-102; Prompt Book G-1
- Acceptance criteria:
  1. Eligibility is computed against my live training records by internal query at request time; there is no network seam, no cache window and no fail-open path. The old estate's 45-second cached API call with needsEligibilityReview fallback must not be recreated.
  2. Shifts I qualify for are claimable; each shift I do not qualify for is listed with the specific training module that would unlock it, linking to that module's catalogue page.
  3. A record in EXPIRING state still counts as held; the shift list uses the same derived-validity rules as the training module, never its own copy.
  4. Which modules gate which shift roles is committee configuration, editable and audited; an empty or unreadable rule refuses eligibility rather than granting it to everyone.
  5. The list pages in SQL, filterable by role and date range, and returns a pagination envelope.
- Source: Prompt Book E-1, G-1; audit PR-13, TR-8; get-in disposition (eligibility seam dissolves).

## E-104: Race-safe shift claiming

- Role: Member
- Phase: MVP
- Story: As a member, I want to claim an open shift in one tap so that a free evening becomes a staffed one without a spreadsheet.
- Depends on: E-103
- Acceptance criteria:
  1. The claim re-checks eligibility server-side at the write; a stale list cannot claim a shift the member no longer qualifies for.
  2. Two simultaneous claims on one shift resolve to exactly one winner, guaranteed by the database (the availability predicate is asserted on the UPDATE itself, never read-then-write); the loser receives a clear "already taken" response.
  3. A member cannot hold two shifts on the same performance.
  4. A successful claim either confirms or queues per the E-105 setting, and the response states which happened.
  5. The concurrent double-claim is a named automated regression case.
- Source: Prompt Book E-1, K-1; audit PR-13 (taken check inside the UPDATE predicate carries).

## E-105: Auto-confirm setting

- Role: Committee
- Phase: MVP
- Story: As the committee, I want a setting that decides whether claims auto-confirm or queue for approval so that trust in the rota is policy, not code.
- Depends on: E-104; Prompt Book J-3
- Acceptance criteria:
  1. One committee setting selects auto-confirm or queue mode, surfaced with its default, current value and last changer per the configuration surface.
  2. In auto-confirm mode a successful claim becomes CONFIRMED immediately; in queue mode it becomes PENDING and appears on the FOH officer's approval list.
  3. Approving or declining a queued claim notifies the claimant; a decline carries a reason the claimant sees.
  4. Changing the setting affects only future claims; pending claims keep their state.
- Source: Prompt Book E-1, J-3; audit PR-13 (auto-confirmation toggle carries).

## E-106: Staffing invariants held by the database

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want the rota's two invariants enforced by database constraints so that no application bug can double-book a duty manager or leave a person named on an open shift.
- Depends on: E-102
- Acceptance criteria:
  1. At most one CONFIRMED DUTY_MANAGER shift exists per performance, held by a partial unique index or equivalent constraint; a second confirmation fails at the write, whatever code path attempts it.
  2. An open shift can never name a person: a check constraint ties OPEN status to a null person and every assigned status to a non-null person.
  3. A constraint violation surfaces to the caller as a handled 409 with a human-readable message, never a raw database error.
  4. Both constraints have automated tests that attempt to violate them directly at the SQL layer, not only through the API.
- Source: Prompt Book E-1 (held by the database); audit PR-13 (both invariants carry verbatim).

## E-107: Release and reassignment

- Role: Member
- Phase: MVP
- Story: As a shift holder, I want to release a shift I can no longer work, and as the FOH officer I want to reassign it, so that a changed plan becomes a staffing fact instead of a no-show.
- Depends on: E-104, E-106
- Acceptance criteria:
  1. A holder can release their own shift up to the start of its show night; the shift returns to OPEN with no person named, and the claim history is retained for staffing reports.
  2. A release within a configurable window before the night (default 48 hours) notifies the FOH officer immediately; earlier releases appear only in the daily digest. Releasing a confirmed duty-manager shift notifies immediately regardless of window.
  3. The FOH officer can assign an eligible member to an open shift or replace a holder; assignment applies the same live eligibility gate as self-claiming, and an officer assignment is confirmed by definition, bypassing the E-105 queue.
  4. Replacing a confirmed duty manager is atomic: at no instant do two confirmed duty managers exist and at no instant is the change half-applied.
  5. Both the removed and the assigned member are notified with performance, role and time; every reassignment is audited with actor.
- Source: Prompt Book E-1; audit PR-13 (claim and release carry).

## E-108: Unstaffed escalation seven days ahead

- Role: FOH officer
- Phase: MVP
- Story: As the FOH officer, I want a daily escalation of unfilled shifts inside seven days so that a gap on the rota is chased while there is still time to fill it.
- Depends on: E-102
- Acceptance criteria:
  1. A daily scheduled job finds every performance within the next seven days with any unfilled shift and emails the FOH officer one digest listing performance, venue, date and the missing roles.
  2. An unfilled or unconfirmed DUTY_MANAGER slot is flagged distinctly in the digest: the night cannot legally run without one.
  3. The job runs at a configured Europe/London time; a fully staffed week sends nothing.
  4. The send is attributed to system, logged in the notification ledger, and a failure surfaces on the operations dashboard rather than vanishing.
- Source: Prompt Book E-1, P6; audit PR-13 (7-day unstaffed warning carries).

## E-109: Day-before reminders with calendar attachments

- Role: Member
- Phase: MVP
- Story: As a shift holder, I want a reminder the day before with a calendar attachment so that my shift lives where the rest of my life is planned.
- Depends on: E-104, E-110; Prompt Book H-1
- Acceptance criteria:
  1. A morning job (configured Europe/London time) sends every holder of tomorrow's confirmed shifts a reminder carrying performance, venue, role, call time and an ICS attachment.
  2. "Tomorrow" is resolved against the show-night boundary (E-110); the reminder days containing the March and October clock changes are automated test cases.
  3. Each reminder sends at most once per shift, held by an idempotency record in the notification ledger, so a re-run cannot double-send.
  4. Shift reminders are shift-topic messages in the notification centre; a shift confirmation and its reminder are distinct message types in the send log.
- Source: Prompt Book E-1, H-1; audit PR-13 (10:00 cron with calendar attachment carries).

## E-110: The show-night boundary

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want one shared definition of the show night, 04:00 to 04:00 Europe/London, so that every show-night feature agrees on what "tonight" means.
- Depends on: none
- Acceptance criteria:
  1. A single shared function resolves any instant to its show night, running 04:00 Europe/London to 04:00 the next day; shift authority, tonight screens, board codes and night reports all call it, and no caller reimplements it.
  2. The nights containing the spring and autumn clock changes (23 and 25 hours long) resolve correctly and are named automated test cases.
  3. The runtime clock is UTC; the boundary arithmetic pins Europe/London explicitly and never reads server-local time.
  4. A performance's show night is derived from its curtain time, so a midnight-crossing event (a late-night show ending at 01:00) belongs to the evening it started.
- Source: Prompt Book E-2, K-1; audit PR-9 (04:00 to 04:00 London carries).

## E-111: Shift-scoped authority

- Role: Shift authority
- Phase: MVP
- Story: As tonight's confirmed shift holder, I want my shift to be my authority so that operational power derives from the rota and expires by itself.
- Depends on: E-104, E-110
- Acceptance criteria:
  1. Show-night tools open only to a confirmed shift on tonight's performance at that venue: DUTY_MANAGER opens approvals (comps, waiting-list overrides), the board reset and the close-night action; DOOR opens the door screen; BAR opens the till. A DOOR shift does not open the till.
  2. Authority is evaluated server-side on every request against the E-110 boundary; at 04:00 it is gone with nothing to revoke, and a request a second later is refused.
  3. A released or reassigned shift loses its authority on the next request, not at next login.
  4. Designated officer roles may open the screens without a shift; every bypass use is recorded and flagged on the night report's staffing section.
  5. Hiding navigation is never the enforcement: every show-night API route checks authority itself.
- Source: Prompt Book E-2, P3; audit PR-9, PR-12 (shift scoping carries; staff bypass flagged).

## E-112: The duty manager's tonight screen

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want the whole evening on one phone screen so that running the night is checklists and glances, not tabs.
- Depends on: E-111; Prompt Book D-5
- Acceptance criteria:
  1. One phone-first screen shows tonight's performance: live house numbers (sold, admitted, remaining capacity, with an explicit uncapped state), running time and interval calls, content warnings and age guidance, and the latecomer policy.
  2. Tonight's team is listed by role with one-tap contact where the member has consented to shift-visible contact details; an unfilled slot shows as unfilled, never as a blank name.
  3. House numbers update without manual refresh; on connection loss the screen shows the last-fetched values with a visible staleness indicator, never a spinner.
  4. Quick links reach the incident log, the Challenge 25 register, near-miss reporting, the checklists, the backstage board and close-night, each within one tap.
  5. The screen is usable one-handed on a phone in a dark foyer and meets WCAG 2.2 AA.
- Source: Prompt Book E-2, P8, K-1; audit PR-9 (tonight screen carries).

## E-113: The emergency card, cached offline

- Role: Shift authority
- Phase: MVP
- Story: As front of house, I want the venue's emergency card available with no connection at all so that the worst moment of the night never depends on the Wi-Fi.
- Depends on: E-112
- Acceptance criteria:
  1. Every venue has a committee-editable emergency card (evacuation procedure, assembly point, emergency contacts, key locations); edits are versioned and audited.
  2. Opening any show-night screen caches the current card on the device; it then opens fully offline, including after a device restart. The old estate's localStorage mirror survived a dropped connection but not an offline first load; that gap is closed.
  3. The cached card shows its as-of date and refreshes silently when connectivity returns.
  4. The card renders with no round-trip, in large type and high contrast, readable in a dark foyer.
- Source: Prompt Book E-2, K-1; audit PR-9 (localStorage mirror, offline first-load gap).

## E-114: Pre and post-show checklists

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want configurable pre and post-show checklists that gate the close so that the routine of the night is enforced, with a stated way out when reality intervenes.
- Depends on: E-111, E-110
- Acceptance criteria:
  1. The committee configures per-venue pre-show and post-show checklist items (text, order, required flag); changes apply from the next show night and are audited.
  2. Each tick records who ticked it and when; items cannot be ticked before the show night begins at 04:00.
  3. System-verified items (all no-show holds released, all of tonight's incidents reviewed) tick themselves from data and cannot be hand-ticked.
  4. The close-night action is blocked while any required item is unticked, and the block names the missing items.
  5. The exception path: the duty manager may close over an incomplete item only by recording a reason per item; every exception prints in the night report and appears in the FOH officer's digest.
  6. Incomplete required pre-show items show as a warning banner on the tonight screen from house open.
- Source: Prompt Book E-2; audit PR-10 (close checklist carries, now configurable).

## E-115: The incident log

- Role: Front of house
- Phase: MVP
- Story: As front of house, I want an incident log that cannot be quietly edited so that the record protects both the public and us.
- Depends on: E-111
- Acceptance criteria:
  1. Any shift authority tonight (and officers) can log an incident with timestamp (defaults to now; backdatable within tonight only), category, severity and a free-text account; the reporter is attributed automatically.
  2. Entries are append-only: no update or delete path exists at the API, and the table refuses UPDATE and DELETE at the database (trigger-enforced per the engineering standards).
  3. Corrections are new entries pointing at the entry they supersede; a superseded entry stays visible, marked as superseded, and readers see the chain.
  4. Entries are visible to tonight's shift authority, the FOH officer, the safety officer and administrators; never to general members or the public.
  5. Erasure scrubs free text referring to an erased person while the row and its statistics survive.
  6. Logging an incident takes at most two navigations from the door screen or the tonight screen.
- Source: Prompt Book E-3, P2; audit PR-9; get-in migration (registers import verbatim, timestamps intact).

## E-116: Severity routing to follow-up

- Role: Committee
- Phase: MVP
- Story: As the safety officer, I want serious incidents routed to me automatically so that follow-up depends on severity, not on somebody remembering to forward an email.
- Depends on: E-115; Prompt Book H-1
- Acceptance criteria:
  1. The severity vocabulary is committee configuration, and each severity declares whether it requires follow-up.
  2. An entry at a follow-up severity notifies the safety officer immediately as a transactional message and joins their open-items list until closed.
  3. Closing a follow-up requires a resolution note; the closure is an append-only entry linked to the incident, never an edit to it.
  4. Follow-up-severity incidents are flagged on the night report whether or not the follow-up is closed.
- Source: Prompt Book E-3; audit PR-9 (severity routing specified; workflow deepens in E-202).

## E-117: Near-miss reporting

- Role: Front of house
- Phase: MVP
- Story: As anyone working tonight, I want to report a near miss in two taps and a sentence so that the reports we get reflect the culture we want.
- Depends on: E-115
- Acceptance criteria:
  1. From any show-night screen, a near miss is one tap to open, one tap to pick a category and one sentence of free text; no severity triage, no further mandatory fields.
  2. Submitting a near miss never blocks or interrupts any other flow.
  3. Near misses land in the incident log as a distinct append-only type, attributed to the reporter, and count on the night report.
  4. Near misses are included in the safety officer's digests and in the season trend queries (E-126).
- Source: Prompt Book E-3 (low-friction by design); audit PR-9.

## E-118: The Challenge 25 register

- Role: Shift authority
- Phase: MVP
- Story: As bar or door staff, I want an age-check register that cannot be quietly edited so that the licence is defensible on paper at any moment.
- Depends on: E-111; Prompt Book F-1
- Acceptance criteria:
  1. An entry records timestamp, the checking person (automatic), the outcome (ID accepted or refused), the ID type where accepted, and for every refusal a mandatory reason.
  2. The subject is recorded as a physical description only ("tall man, grey coat"); the form has no name field and its guidance states that a name must never be entered.
  3. The register is append-only with supersede-style corrections, enforced exactly as E-115.
  4. The flow is reachable inline from the till when an age-restricted item is sold, and standalone from the tonight and door screens.
  5. The old estate's register imports verbatim with original timestamps, checksummed and row-count reconciled: it is licensing evidence and the import must be lossless.
- Source: Prompt Book E-3, P2; audit PR-9; get-in migration (none-tolerable risk line).

## E-119: Licensing export of the register

- Role: Committee
- Phase: MVP
- Story: As the committee, I want the Challenge 25 register exportable as CSV and PDF so that a licensing inspection costs one download.
- Depends on: E-118
- Acceptance criteria:
  1. The register exports for any date range as CSV and as a formatted PDF stating venue, period and generation date, with entries in time order.
  2. Exports include superseded entries with their supersedes links; nothing is omitted.
  3. CSV output guards formula injection; every export is audited with actor and range.
  4. Export requires an officer role; a shift alone reads tonight's entries but does not export history.
- Source: Prompt Book E-3 (exportable for licensing inspection); audit PR-7 (CSV injection guard precedent).

## E-120: Backstage board join by nightly code

- Role: Backstage crew
- Phase: MVP
- Story: As stage management, I want to join tonight's comms board with a spoken code and no account so that clearance and calls flow on whatever phone is in the wings.
- Depends on: E-110, E-111
- Acceptance criteria:
  1. Crew join by entering a short code the duty manager reads out, choosing only a display label; no account and no personal data are required.
  2. The code is derived (a keyed hash over night, venue and epoch) and never stored; a database dump reveals no valid code.
  3. The code is valid only for tonight's board at that venue and dies at the 04:00 boundary.
  4. Ten failed join attempts rotate the code automatically.
  5. The duty manager's tonight screen shows the current code on demand; the code never travels by email or notification.
- Source: Prompt Book E-4; audit PR-11 (derived-code design carries).

## E-121: Milestones, presets and acknowledgements

- Role: Backstage crew
- Phase: MVP
- Story: As backstage crew, I want structured milestones, preset calls and acknowledgements so that the routine of the night is one tap and everyone knows it was heard.
- Depends on: E-120
- Acceptance criteria:
  1. Milestones (clearance, house open, curtain up, interval, restart, end; the set is committee-configurable) post as structured events with timestamp and poster, and feed the night report timeline.
  2. Preset messages cover routine calls in one tap; free text (capped at 500 characters) covers the rest.
  3. Messages appear on every joined device within five seconds; the transport (push or short-interval refresh) is an implementation choice, the five seconds is the contract.
  4. Each message shows which joined devices have acknowledged it.
  5. A mistaken milestone is corrected by a superseding event; the report timeline shows the corrected value with the correction visible.
  6. The board tolerates connection loss: outgoing messages queue and send on reconnect carrying their original composed time.
- Source: Prompt Book E-4, P8; audit PR-11 (milestones and presets carry; real-time replaces polling as an implementation detail).

## E-122: Board reset and retention

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want a board reset that kicks every device and a retention rule that forgets the chatter so that a leaked code or a stray phone never compromises the wings.
- Depends on: E-120
- Acceptance criteria:
  1. A reset bumps the board epoch: every joined device is disconnected immediately and the code changes.
  2. The reset notifies configured recipients that a reset happened, deliberately without the new code; the new code travels by voice only.
  3. Reset is available to tonight's confirmed duty manager and officers only; each reset is logged with actor and time.
  4. Free-text messages purge after 30 days by scheduled sweep; milestone events persist as night-report data.
- Source: Prompt Book E-4; audit PR-11 (epoch reset and code-less notification carry verbatim).

## E-123: The night report compiles itself

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want the night report auto-compiled from the evening's data so that sign-off is review, not typing.
- Depends on: E-112, E-115, E-118, E-121; Prompt Book D-5, F-1
- Acceptance criteria:
  1. The report compiles with no typing: attendance vs sold (admitted, no-shows, walk-ups), takings by tender split desk and bar, incidents and near misses with severities, Challenge 25 outcome counts, the milestone timeline, staffing (each shift's holder, officer bypasses flagged, unfilled slots), and a bar summary.
  2. Every figure derives from ledger and register queries at compile time, never a stored total; comps and discounts appear as foregone revenue, never as silent gaps.
  3. The access section carries counts only; a report can never contain an access need or the identity of an access-ticket holder.
  4. Before close, the report is viewable as a live draft that recomputes on each view.
- Source: Prompt Book E-5, P4; audit PR-10 (report snapshot carries, now fully derived).

## E-124: Sign-off, freeze and distribution

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want to sign off the night and have the report distribute itself so that the evening's record carries my name and reaches the people who need it.
- Depends on: E-114, E-123; Prompt Book H-1
- Acceptance criteria:
  1. Sign-off requires the E-114 checklist gate; the duty manager adds a closing note and signs, and the report freezes into an append-only row uniquely keyed to the performance, so a second report for the same night is impossible.
  2. Sign-off is available only under live shift authority (E-111); an officer closing instead of the duty manager is recorded and flagged as such.
  3. On freeze the report emails the configured recipients plus the closer; the recipient list is committee configuration.
  4. Failed sends retry automatically and surface on the operations dashboard until delivered; the report row records each distribution outcome.
  5. A frozen report is immutable; a later correction is an addendum entry linked to the report and distributed the same way.
- Source: Prompt Book E-5; audit PR-10 (uniquely-keyed snapshot and email carry).

## E-125: Auto-close within 24 hours

- Role: System
- Phase: MVP
- Story: As the theatre, I want any unclosed night to close itself within 24 hours, marked as such, so that the paper trail exists even when nobody pressed the button.
- Depends on: E-124
- Acceptance criteria:
  1. A scheduled job closes any performance still open 24 hours after its show night ended, compiling the report from the same queries as E-123.
  2. An auto-closed report is marked auto-closed, carries no human signatory, and lists unmet checklist items with no exceptions recorded.
  3. Auto-closed reports distribute to the same recipients with a distinct subject line, and each auto-close appears in the FOH officer's digest: an unclosed night is a visible event, not a silent repair.
  4. The job attributes its actions to system and is idempotent: the unique report key means a re-run can never produce a second report.
- Source: Prompt Book E-5, P6; audit PR-10 (auto-close cron carries, window tightened to 24 hours).

## E-126: Cross-season report queries

- Role: Committee
- Phase: MVP
- Story: As the committee, I want frozen night reports queryable across seasons so that incident trends, attendance patterns and staffing gaps are questions, not archaeology.
- Depends on: E-124, E-125
- Acceptance criteria:
  1. Reports are queryable within and across seasons: incident and near-miss trends by category, severity and venue; attendance vs sold patterns; staffing gaps (unfilled slots, officer bypasses, auto-closed nights).
  2. Query results page in SQL and export to CSV with the formula-injection guard.
  3. Access is limited to officers and administrators; results obey the same redaction rules as the reports themselves (access counts only, erased identities anonymised).
  4. Historical night reports imported from the old estate are included, marked with their source.
- Source: Prompt Book E-5; audit PR-10; get-in migration (night reports import verbatim).

## E-127: Two shows, one venue, one day

- Role: Shift authority
- Phase: MVP
- Story: As the duty manager on a matinee day, I want every show-night surface to handle multiple performances in one venue on one day so that a matinee and an evening never blur into one record.
- Depends on: E-108, E-113
- Acceptance criteria:
  1. Every operational record is keyed to a performance, never to a day or a venue: shifts, checklists, incidents, age checks, night reports and door state all belong to exactly one performance, and the same person may hold shifts on both performances of the day.
  2. The tonight view lists every performance inside the 04:00 boundary in running order and makes the active one unmistakable; switching between them is one tap, and every scan, admit and register entry lands against the performance selected at that moment.
  3. A ticket scanned against the wrong performance of the same day refuses loudly with the correct performance named (D-108 wrong-night handling applies between a matinee and an evening, not just between days).
  4. Each performance closes with its own report and its own checklist; closing the matinee does not touch the evening, and the day's second report can open while the first is still unsigned.
  5. The bar may run one session spanning the day's performances (module F, one open session per venue per night); its takings reconcile by the day while attendance and door figures stay per performance.
  6. An automated test covers a matinee-and-evening fixture end to end: two rotas, two registers, two reports, one bar session.
- Source: Committee direction 26 August; Prompt Book E-2, E-5; audit PR-9 (the old tonight view already listed multiple performances; this pins the behaviour).

## E-201: Door offline queue refinements

- Role: Front of house
- Phase: V2
- Story: As door staff, I want scans queued offline and reconciled honestly so that a hole in the venue Wi-Fi never stops the queue at seven twenty-five.
- Depends on: E-111, E-123; Prompt Book D-5, K-1
- Acceptance criteria:
  1. The door screen caches tonight's full admit list when the shift opens; while offline, scans verdict against the cache and queue as writes that survive an app restart.
  2. On reconnect, queued admissions replay in order; a conflict discovered at replay (the same ticket admitted on another device) flags for the duty manager rather than silently double-admitting.
  3. The screen shows its state honestly at all times: online, offline, and the count of queued writes.
  4. The night report distinguishes admissions recorded live from those reconciled from an offline queue.
- Source: Prompt Book D-5, K-1, P8; audit PR-5 (cached admit list baseline).

## E-202: Incident follow-up workflow

- Role: Committee
- Phase: V2
- Story: As the safety officer, I want follow-ups with owners, statuses and deadlines so that a serious incident produces action, not just a record.
- Depends on: E-116, E-126
- Acceptance criteria:
  1. A follow-up carries a status (open, investigating, actioned, closed) and an owner; every status change is an append-only entry with actor and note.
  2. Actions taken (a repair, a policy change, a checklist item added) are recorded against the follow-up, and a resulting checklist change links back to the incident that caused it.
  3. Follow-ups open past a configurable age escalate in the safety officer's digest and on the committee dashboard.
  4. The trend view extends E-126 with follow-up outcomes: time-to-close, actions by category, repeat categories per venue.
- Source: Prompt Book E-3 (resolution workflow); audit PR-9.

## E-203: Front of house contacts directory

- Role: Shift authority
- Phase: V2
- Story: As tonight's duty manager, I want an operational contacts directory on the tonight screen so that the right number is one tap away when something goes wrong.
- Depends on: E-112, E-113
- Acceptance criteria:
  1. The committee maintains a directory of operational contacts, per venue and estate-wide: label, number and a when-to-use note; edits are audited.
  2. The directory renders on the tonight screen with one-tap dial and caches offline alongside the emergency card.
  3. The directory holds organisational numbers only; members' personal numbers appear solely through the shift-visibility consent on their own profile, never here.
- Source: Prompt Book E-2 (team contacts), A-3; audit PR-9.

## E-204: Shift swap offers

- Role: Member
- Phase: V2
- Story: As a shift holder, I want to offer my shift for swap before releasing it so that a change of plan finds its own cover instead of a gap.
- Depends on: E-104, E-106, E-107
- Acceptance criteria:
  1. A holder can offer a shift for swap; eligible members are notified per their preferences, and the first acceptance transfers the shift atomically under the same race-safety as claiming.
  2. The acceptor passes the same live eligibility gate as a fresh claim, and a duty-manager swap re-runs the E-106 uniqueness constraint.
  3. An offer nobody accepts by a configurable deadline before the night converts to a release with the E-107 notifications.
  4. Swaps appear in the staffing history and on the FOH officer's view of the rota.
- Source: Prompt Book E-1 (staffing is self-service); audit PR-13.

## E-301: Production obligations on the show-night pack

- Role: Shift authority
- Phase: Later
- Story: As tonight's duty manager, I want rights and licensing obligations from the production module surfaced on the tonight screen so that "no filming" is an operational fact, not folklore.
- Depends on: E-112, E-114; Prompt Book B-4
- Acceptance criteria:
  1. When the programming module ships, restrictions recorded against a production (no filming, mandatory announcements, cast limits) render on the tonight screen and in the show-night pack.
  2. A restriction can seed a pre-show checklist item automatically, acknowledged like any other item.
  3. Nothing in module E's MVP data model blocks this: the tonight screen already composes from show-level data, so the story is wiring, not rework.
- Source: Prompt Book B-4, E-2; get-in constraint 2 (production module is the agreed destination, phased Later).
