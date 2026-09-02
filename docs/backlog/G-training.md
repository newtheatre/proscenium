# Module G: Training and safety records

Training was the old estate's best module, and this backlog carries its judgement wholesale: records are append-only with validity derived at read time, marking a register is the single act that awards records for taught sessions, and clockwork notices expiry but never enacts anything. The unified system removes the API seam between records and the surfaces they gate (shifts, the till, kit loans), so a gate reads live competence with nothing to fail open. New in this system are delivery modes: in-person, self-directed online, or hybrid; mode and external material links are MVP schema, while quiz assessment, hybrid completion and the question channel are V2, and a safety-critical module can never be fully self-directed.

Counts: 24 MVP stories (G-101 to G-123, G-125), 11 V2 stories (G-201 to G-211), 2 Later stubs (G-301, G-302), 3 resolved (G-124 and G-126 withdrawn, G-127 won't build). 40 total.

## Open questions

1. Answered 26 August: there is no legacy import (G-127 resolved); legacy records do not map to the current module system, and history stays in the archived old estate.
2. Certification auto-suspension when a constituent module lapses: the old system deliberately only flags. Does the committee ever want it to suspend, and if so with what notice?
3. Moot from 2 September: who closes a practice window no longer arises, because there are no practice windows (0042, G-126 withdrawn). The question G-211 carries in its place is what qualifies somebody to enter practice mode: holding the module, or holding it currently.
4. Answered 2 September: session running is scoped, but by competence rather than by department. Trainer standing is one cross-department certification (LEAD-CERT), and a trainer may teach only a module they currently hold a record for. A trainer may never sign off a certification, and a certification is not normally attached to a session at all, because it is issued on experience gained outside training; G-112 criterion 3's refusal of sign-off-only modules already covers that.
5. Quiz governance for V2: who authors and reviews quiz content, and does editing a quiz after people have passed it invalidate or merely date-stamp their attempts?
6. Answered 2 September: the session's own trainer may release the freeze, and only while the register carries no marks. Waiting on an officer at 18:50 is the friction that answer removes. Two consequences for G-115 and G-116: the release is a conditional write predicated on zero marks existing rather than a read followed by a write, and G-116's marking race has to assume the module list can change under it until the first mark lands.
7. Answered 2 September: TRAINING_MANAGER holds `training.leads`. The training officer is who knows which people are stepping up, so appointing stewards belongs with running the module rather than with the administrator alone.
8. Answered 2 September: TRAINING_MANAGER holds `training.revoke`; `training.override` stays ADMIN alone. Revocation is a safety act that sometimes has to happen tonight, and waiting for an administrator is the friction. Stamping a record as never expiring is the rarer break-glass and stays where G-120 criterion 5 put it.

## G-101: My training dashboard with derived validity

- Role: Member
- Phase: MVP
- Story: As a member, I want a dashboard of my training records with clear states so that I always know what I may safely do.
- Depends on: none
- Acceptance criteria:
  1. Records are grouped by department and each shows a derived state of VALID, EXPIRING or EXPIRED; the state is computed at read time from the award and expiry dates and is never stored in any column.
  2. A record expires on its expiry date: on the date itself the record no longer counts as held.
  3. EXPIRING counts as held for every gate in the system (shifts, till, kit loans, prerequisites), so an ability never flickers off before its date.
  4. The EXPIRING state begins when the record is within the configured warning window (default 60 days) of its expiry date.
  5. Briefs appear with their last-attended date and no expiry state, because briefs never expire.
  6. Revoked and superseded records are hidden from the member's own dashboard and visible only to leads and administrators in a history view.
- Source: Prompt Book G-1; audit TR-1

## G-102: The what's-next list and gate signposting

- Role: Member
- Phase: MVP
- Story: As a member, I want to see which modules I could take next and what each locked feature needs so that doing more is a visible path, not folklore.
- Depends on: G-101, G-108
- Acceptance criteria:
  1. The dashboard lists every active, non-draft module whose direct prerequisites the member currently holds (EXPIRING counts as held) and which the member has not already got a valid record for.
  2. Briefs never appear as prerequisites and never gate anything, so they cannot block an entry on the list.
  3. Every gated surface elsewhere in the system (a shift claim, the till, a kit loan) names the specific module that would unlock it, by its published human id and title.
  4. The list updates on the next read after a record is awarded, revoked or expires; no cached copy survives longer than the page load.
  5. Draft modules never appear in the list for members.
- Source: Prompt Book G-1; audit TR-1

## G-103: Browse the module catalogue

- Role: Member
- Phase: MVP
- Story: As a member, I want to browse the module catalogue with kinds, modes and materials so that I understand what each module is and how it is delivered.
- Depends on: G-107
- Acceptance criteria:
  1. Every module displays its published human id (for example TECH-111, LD-CERT), title, department, kind (module, certification or brief), delivery mode (in-person, self-directed or hybrid) and safety-critical flag.
  2. Direct prerequisites are listed per module, each marked as held or not held for the signed-in member.
  3. External material links (for example a Google Drive folder) are shown on the module page for every delivery mode.
  4. Draft modules are visible only to department leads and administrators; members and trainers never see them in the catalogue, search or what's-next.
  5. Retired modules remain visible in history views (a record's module link still resolves) but cannot be requested, scheduled or signed up for.
  6. Self-directed and hybrid modules are marked as such in the catalogue from MVP even though their online assessment ships in V2.
- Source: Prompt Book G-1, G-4; audit TR-1, TR-7; Get-In constraint 6

## G-104: Module requests and the demand board

- Role: Member
- Phase: MVP
- Story: As a member, I want to request training I cannot yet book so that demand reaches whoever can run a session.
- Depends on: G-103
- Acceptance criteria:
  1. A member may hold at most one open request per module, enforced by a database constraint, not an application read; withdrawing a request frees a re-ask.
  2. Leads and administrators see a demand board ordered by request volume per module, with the requesters listed.
  3. Declining a request requires a reason, and the requester is shown that reason; a decline with no reason is refused.
  4. Requests for a module resolve automatically when a matching session becomes visible to members (opened for sign-up, not merely created), and each requester is emailed once.
  5. A request is a demand signal only: it confers no queue position, priority or place in any session.
  6. Requests for draft or retired modules are refused.
- Source: Prompt Book G-1; audit TR-2

## G-105: Session sign-up with derived places

- Role: Member
- Phase: MVP
- Story: As a member, I want to sign up for a scheduled session and know exactly where I stand so that turning up is worth my evening.
- Depends on: G-112
- Acceptance criteria:
  1. Sign-up never refuses for fullness: a member's place or waitlist position is derived purely from sign-up order against the session's capacity; no waitlist is ever stored.
  2. Withdrawing and re-joining places the member at the back of the order.
  3. A gap in a safety-critical module's prerequisites blocks sign-up with a 422-style refusal naming the missing modules; a gap in an ordinary module's prerequisites warns but allows.
  4. The sign-up confirmation states either the place or the exact waitlist position at the moment of signing up.
  5. Sign-up closes when the register opens, when the configured close time passes, or when the session date arrives, whichever is first; withdrawal remains open while the register is open.
  6. EXPIRING prerequisite records count as held for both the block and the warning.
- Source: Prompt Book G-2; audit TR-3

## G-106: Promotion notifications claimed at most once

- Role: System
- Phase: MVP
- Story: As the system, I want waitlist promotions to be claimed at most once so that nobody is ever told twice that they have a place.
- Depends on: G-105
- Acceptance criteria:
  1. When a withdrawal or a capacity rise moves a member from the derived waitlist into a place, the next member in order is notified by email.
  2. The notification is claimed via a unique-index insert into the notification ledger before sending; a second process attempting the same promotion finds the claim and sends nothing.
  3. Two concurrent withdrawals produce exactly one notification per newly promoted member, proven by a named concurrency test.
  4. The notification ledger rows are retained as idempotency evidence and pruned only by the standard 24-month ledger pruning.
  5. Promotion notifications are transactional and send regardless of any dry-run mode on the sweeps.
- Source: Prompt Book G-2; audit TR-3, TR-9

## G-107: Module administration

- Role: Training officer
- Phase: MVP
- Story: As the training officer, I want to create and edit modules with kind, mode, materials and lifecycle so that the catalogue reflects what the theatre actually teaches.
- Depends on: none
- Acceptance criteria:
  1. A module carries a published human id (unique, immutable once created), title, department, kind (module, certification or brief), safety-critical flag, delivery mode (in-person, self-directed or hybrid) and zero or more external material links.
  2. Delivery mode and material links are first-class schema fields from MVP; a safety-critical module may not be saved with a fully self-directed mode, refused at the write path.
  3. Lifecycle is draft, active, retired: drafts are invisible to members (G-103), and retiring a module blocks new sessions, sign-offs and requests while leaving existing records readable.
  4. Briefs cannot carry an expiry policy, cannot be prerequisites and cannot grant trainer or supervisor standing; the write path refuses each.
  5. Material links are owned by the module's department and editable by its leads as well as administrators.
- Source: Prompt Book G-3, G-4; audit TR-7; Get-In constraint 6

## G-108: Prerequisites as direct edges with cycle detection

- Role: Training officer
- Phase: MVP
- Story: As the training officer, I want prerequisites declared as direct edges with cycle detection so that the gate graph stays sound.
- Depends on: G-107
- Acceptance criteria:
  1. Prerequisites are direct edges only: module A requires module B; there is no transitive or grouped expression.
  2. Adding an edge that would create a cycle (directly or through any path) is refused with a message naming the cycle.
  3. A brief cannot be the target of a prerequisite edge.
  4. A module cannot require itself.
  5. Prerequisite checks everywhere (sign-up, sign-off, what's-next) evaluate only direct edges against currently held records, with EXPIRING counting as held.
- Source: Prompt Book G-1; audit TR-6, TR-7

## G-109: Kind and grants frozen while records exist

- Role: Training officer
- Phase: MVP
- Story: As the training officer, I want a module's safety semantics frozen while records depend on them so that meaning changes deliberately, never by accident.
- Depends on: G-107
- Acceptance criteria:
  1. While any unrevoked record exists against a module, changing its kind is refused with a 409 whose message says to retire and recreate.
  2. The same freeze applies to the module's trainer-granting and supervisor-granting flags.
  3. Once every record against the module is revoked, the frozen fields become editable again.
  4. Retiring a module and creating a successor is the documented path; the successor takes a new human id and carries no records.
  5. The refusal and the retire-and-recreate path are covered by tests, since this rule protects what every existing record means.
- Source: Prompt Book G-3; audit TR-7

## G-110: Department leads

- Role: Administrator
- Phase: MVP
- Story: As an administrator, I want department leads assigned per department so that stewardship of modules, sign-offs and demand is scoped to the people who own them.
- Depends on: none
- Acceptance criteria:
  1. A lead assignment names a person and a department; a person may lead more than one department.
  2. Lead standing is checked live at every leads-only surface: module editing for their department, the demand board, sign-offs, draft visibility.
  3. Lead assignments follow the committee year: they default to expiry at handover (31 July, Europe/London) in line with the platform role model, and an expired assignment confers nothing.
  4. Removing a lead takes effect on their next request; nothing is cached beyond the session staleness window.
  5. Lead assignment and removal are audited with actor and target.
- Source: Prompt Book module 0 (P3), G-3; audit TR roles table

## G-111: Trainer standing derived live

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want my standing derived from a current trainer-granting certification so that nothing needs remembering to revoke.
- Depends on: G-107
- Acceptance criteria:
  1. Trainer standing exists if and only if the person currently holds a valid or expiring record on a module flagged trainer-granting; it is never stored as a role or flag.
  2. Standing dies the moment the underlying record expires or is revoked; the next request to any trainer surface is refused.
  3. Standing confers: scheduling sessions, logging retrospective deliveries, marking registers, and looking up attendees for their sessions.
  4. Supervisor-granting certifications derive supervisor standing by the same mechanism.
  5. A test pins the derivation: revoking the certification removes trainer access with no other write.
- Source: Prompt Book module 0 (P3), G-2; audit TR-4

## G-112: Schedule a training session

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want to schedule a session with capacity and timed opening so that teaching is planned and sign-up is orderly.
- Depends on: G-107, G-111
- Acceptance criteria:
  1. A session names one or more active modules it teaches, a future date, wall-clock start and end times interpreted in Europe/London, and a capacity between 1 and 60.
  2. Sign-up opens now or at a chosen later time; a session invisible to members resolves no requests (G-104) until it opens.
  3. Retired modules and sign-off-only modules cannot be taught by session; the write path refuses them.
  4. Draft modules cannot be attached to a session visible to members.
  5. Sessions survive DST transitions: a 19:00 session is 19:00 London time on either side of a clock change, pinned by a named regression test.
- Source: Prompt Book G-2; audit TR-4; Get-In part 5 (DST arithmetic)

## G-113: Cancel a session with reason and notification

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want to cancel a session with a reason so that everyone signed up hears it from us, not from a locked door.
- Depends on: G-112, G-105
- Acceptance criteria:
  1. Cancellation requires a reason; a cancellation without one is refused.
  2. Every signed-up member (placed and waitlisted alike) is emailed the cancellation with the reason.
  3. A cancelled session awards nothing, its register can never be opened, and it stops resolving module requests.
  4. Cancellation emails are transactional and send regardless of sweep dry-run modes.
  5. A session whose register has already been opened cannot be cancelled; the edit window (G-114) is the correction path.
- Source: Prompt Book G-2; audit TR-3

## G-114: Session edit window with atomic revoke-and-reissue

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want a limited window to correct a delivered session so that a marking mistake is fixable without breaking append-only records.
- Depends on: G-116
- Acceptance criteria:
  1. A delivered session is editable for 14 days after its held-on date; the window length is configuration, not code.
  2. An edit revokes the session's issued records and re-issues the corrected set in one atomic batch; no intermediate state is ever readable in which a person has lost a record they will get back.
  3. Attendees dropped by the edit keep their absence marked as evidence; nothing about them is deleted.
  4. After the window closes, the only correction is administrator revocation (G-122) plus re-grant.
  5. Re-issued records keep the session's held-on date as their award date.
  6. Every edit is audited with actor, session and a diff of marks.
- Source: Prompt Book G-2; audit TR-4

## G-115: Open the register

- Role: Trainer
- Phase: MVP
- Story: As a trainer on the door of a session, I want to open the register on the day so that awards can only ever be dated to a session that has happened.
- Depends on: G-112
- Acceptance criteria:
  1. The register can be opened only on or after the session day (Europe/London): records stamp from the held-on date, and a future-dated record would read as valid to every gate.
  2. Opening the register freezes the set of modules the session teaches; subsequent changes to the session's modules are refused.
  3. Opening the register closes sign-up.
  4. Two devices opening the same register concurrently result in one open register, pinned by a regression test: the stamp is a conditional write, so the loser's update matches nothing.
  5. Withdrawal remains open to members while the register is open.
- Source: Prompt Book G-2; audit TR-5, TR-10

## G-116: Mark the register, the single act that awards

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want a phone-first register where marking attendance is the single act that awards records so that the record and the room always agree.
- Depends on: G-115
- Acceptance criteria:
  1. Everyone on the register defaults to absent; submission requires a mark for every person, covering the register exactly: no strangers, no duplicates, nobody skipped.
  2. Submitting a register with everyone absent requires its own explicit confirmation.
  3. A present mark awards one record per module the session teaches, dated to the held-on date, in one batch; an absent mark produces no record of any kind, and the absentee receives a follow-up email.
  4. Two racing submissions resolve to exactly one award set: one submission wins, the loser receives a 409 and no duplicate records exist afterwards; this is a named regression case.
  5. Marking an old register still awards, with records dated to the session day, never the marking day.
  6. The screen meets the phone-first standard: usable one-handed, no action depends on a hover or a wide viewport.
- Source: Prompt Book G-2, module K (K-1); audit TR-5

## G-117: Walk-ins at the register

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want to add a walk-in to an open register so that someone who turned up untracked still leaves with a record.
- Depends on: G-115
- Acceptance criteria:
  1. A walk-in can be added by directory search or by email address while the register is open.
  2. An email with no matching account mints a shadow account, claimable later by registration with the same address.
  3. A walk-in joins the register like any signed-up attendee: defaults absent, must be marked, and is subject to the exact-cover rule.
  4. Safety-critical prerequisite gaps block adding the walk-in for that module with a refusal naming the gaps; ordinary gaps require the trainer to acknowledge a warning.
  5. Walk-in additions are recorded on the register as such, distinguishable from sign-ups in reporting.
- Source: Prompt Book G-2; audit TR-5

## G-118: Retrospective delivery logging with dry-run

- Role: Trainer
- Phase: MVP
- Story: As a trainer, I want to log a session already delivered, previewing exactly what it will create, so that off-system teaching still ends in records.
- Depends on: G-111, G-107
- Acceptance criteria:
  1. The log names the modules taught, the held-on date (not in the future) and the attendees.
  2. A dry-run always runs first and shows the exact records that would be created, per person per module, before anything is written.
  3. Safety-critical prerequisite gaps block the log absolutely, with no acknowledgement path; ordinary gaps require explicit acknowledgement per gap before submission.
  4. On confirmation, all attendees-times-modules records land in one batch, awarded at the held-on date.
  5. The dry-run and the write compute from the same code path, so the preview can never disagree with the result.
- Source: Prompt Book G-2; audit TR-4

## G-119: Unmarked register nags

- Role: System
- Phase: MVP
- Story: As the theatre, I want unmarked registers chased automatically so that a taught session never silently fails to award.
- Depends on: G-115
- Acceptance criteria:
  1. From day 2 after the session, the trainer is nagged weekly by email that the register is unmarked.
  2. Nags stop at 60 days, but the register remains listed as stale to leads and administrators indefinitely, until marked.
  3. Marking a stale register still awards, dated to the session day (G-116).
  4. The nag runs in the scheduled sweep and respects the sweep's dry-run mode; in dry-run it reports what it would send without sending.
  5. Nothing on any schedule ever marks a register or awards a record; the sweep only notices and nags.
- Source: Prompt Book G-2, module 0 (P6); audit TR-5, TR-9

## G-120: Department-scoped sign-offs

- Role: Department lead
- Phase: MVP
- Story: As a department lead, I want to sign off certifications and modules in my department so that competence proven outside a session still counts, on our terms.
- Depends on: G-110, G-108
- Acceptance criteria:
  1. Sign-off is scoped to the module's owning department; a lead of another department is refused, and administrators bypass the scope.
  2. Every direct prerequisite must be currently held (EXPIRING counts), with a 422-style refusal naming the gaps; certification sign-off has no acknowledgement or override path at all.
  3. The award date cannot be in the future.
  4. An explicit expiry must fall after the award date and within the module's policy cap, itself bounded by the catalogue-wide 120-month cap.
  5. "Never expires" on a sign-off is a break-glass administrator permission, deliberately absent from the UI, and every use is audited.
  6. A sign-off is an append-only record like any other: renewal is a newer record superseding the old, and correction is revoke plus re-grant.
- Source: Prompt Book G-3; audit TR-6

## G-121: External certificates

- Role: Department lead
- Phase: MVP
- Story: As a department lead, I want to record external certificates against modules that accept them so that competence earned elsewhere counts without pretending we assessed it.
- Depends on: G-120
- Acceptance criteria:
  1. Accepting external certificates is opt-in per module; recording one against a module that has not opted in is refused.
  2. An evidence reference (certificate number, issuing body, or a document reference) is mandatory; a record without one is refused.
  3. An external certificate record always carries an explicit expiry override; it never inherits the module's expiry policy, and the override must respect the 120-month cap.
  4. The record is marked EXTERNAL as its source, distinguishable in every view and export from session awards and sign-offs.
  5. The same prerequisite, award-date and append-only rules as sign-offs apply.
- Source: Prompt Book G-3; audit TR-6

## G-122: Revocation

- Role: Administrator
- Phase: MVP
- Story: As an administrator, I want revocation with a mandatory reason so that the only way to take a record away is deliberate, attributed and repeatable.
- Depends on: G-101
- Acceptance criteria:
  1. Revocation is administrator-only; trainers and leads cannot revoke.
  2. A reason is mandatory; revocation without one is refused.
  3. Revocation is idempotent: revoking an already-revoked record succeeds without a second audit entry or a changed outcome.
  4. A revoked record immediately stops counting at every gate, and derived standings (trainer, supervisor) fall with it (G-111).
  5. Records are never deleted: revoke plus re-grant is the only correction path, and revoked history remains visible to leads and administrators.
  6. Revocation reasons are reachable by GDPR erasure scrubbing, so free text about a person never outlives them.
- Source: Prompt Book G-3, module 0 (P2); audit TR-6, EW-2

## G-123: Expiry policy per module

- Role: Training officer
- Phase: MVP
- Story: As the training officer, I want each module's expiry policy declared once and stamped at award so that a record's lifetime is fixed the day it is earned.
- Depends on: G-107
- Acceptance criteria:
  1. Expiry modes are: never; a number of months from award; or academic-year, expiring at the configured year end.
  2. Academic-year expiries carry over: an award within 60 days of the year boundary rolls to the following year's end, so a late-summer award is never worth less than a term.
  3. The expiry date is computed and stamped onto the record at award and is never recomputed implicitly by any later policy change.
  4. Months-based policies are capped at 120 months; a policy or explicit expiry beyond the cap is refused.
  5. An impossible year-boundary configuration (for example 02-29) is refused at the config write, because a date that parses as NaN would read as valid forever.
  6. Briefs cannot carry any expiry policy (G-107).
- Source: Prompt Book G-3; audit TR-7, TR-9

## G-124: Previewed, count-confirmed recalculation

- Role: Administrator
- Phase: Resolved, withdrawn (0041, 2 September 2026)
- Story: Withdrawn. It was built and then removed: it answers a question the theatre does not ask.
- Resolution:
  1. A module's expiry policy is the least likely thing about it to change, and the committee's own rule is that a lifetime is fixed the day it is earned, so leaving every existing record alone is the honest answer to a policy that moved.
  2. What actually changes is the content of a module, and no restatement of a date can express that: the record is not late, it is wrong. G-209 invalidates instead, and G-210 bootstraps what invalidation would otherwise cost.
  3. A stamped `expires_on` is now final from every path, enforced by the append-only trigger rather than by convention. G-123 criterion 3 stands with no exception at all.
  4. Between now and G-209, a material change is handled by revoking the affected records one at a time. If that proves painful, it argues for pulling G-209 forward, not for restoring this.
- Source: Prompt Book G-3; audit TR-7; withdrawn by 0041

## G-125: Expiry warnings and monthly digests

- Role: System
- Phase: MVP
- Story: As the theatre, I want expiry noticed by clockwork and reported even when there is nothing to report so that a silent sweep is itself an alarm.
- Depends on: G-123
- Acceptance criteria:
  1. A daily sweep emails each member a grouped warning when a record enters the 60-day window, and again at 14 days before expiry; each warning sends once per record and window, held by the notification ledger.
  2. Monthly digests go to each department's leads (their departments) and to administrators and the safety officer (everything), on the first days of the month.
  3. Digests are sent even when empty, because the digest's absence is itself the alert.
  4. The sweep ships in dry-run mode: it computes and reports what it would send until the mode is deliberately armed, and the arming is audited.
  5. Nothing in the sweep ever changes a record: expiry happens because the calendar moved, and the sweep merely notices.
  6. The notification ledger is pruned at 24 months in every mode.
- Source: Prompt Book G-3, module 0 (P6); audit TR-9

## G-126: Practice targets and windows

- Role: Training officer
- Phase: Resolved, withdrawn (0042, 2 September 2026)
- Story: Withdrawn. It was built and then removed: nothing ever read a practice window.
- Resolution:
  1. The gate that would have enforced a window had no caller anywhere, there was no member-facing practice surface, and the sandboxes that would have consumed it (G-206) are V2 and unbuilt. It wrote and expired rows nothing asked about.
  2. It also put the decision in the wrong place: a window was granted to a member by somebody else finishing an administrative act, for a length configured months earlier. The person who knows whether they want to rehearse is the member.
  3. G-211 replaces it: practice mode is entered from the screen of the tool itself, gated on the record held, with no window to hand out and nothing to close on a timer.
  4. The three tables are dropped and the per-target window length leaves the workshop register. No member's access changes, because no window was ever read.
- Source: Prompt Book G-5; audit TR-5, TR-7, TR-8; withdrawn by 0042

## G-127: Legacy data import as LEGACY records

- Role: Administrator
- Phase: Resolved, won't build (committee decision, 26 August 2026)
- Story: Withdrawn. The legacy records do not map to today's module system in any usable way, so no import runs.
- Resolution:
  1. Historical training standing starts clean in the unified system; anyone with current competence is re-recorded through sign-offs, sessions or external certificates against the real catalogue.
  2. The old data stays readable in the archived old estate for any historical question.
  3. The LEGACY record source stays in the schema vocabulary but nothing writes it; reviving it would need a superseding decision.
- Source: Committee direction, 26 August; audit TR-10 (the import was never written in the old estate either).

## G-201: Self-directed module delivery

- Role: Member
- Phase: V2
- Story: As a member, I want self-directed modules I can take online so that not everything needs a trainer's evening.
- Depends on: G-103, G-107
- Acceptance criteria:
  1. A self-directed module is open to anyone with an account, free, with structured content pages and its external material links presented in-context.
  2. Progress through the content is saved per person and resumable.
  3. A module flagged safety-critical cannot be delivered fully self-directed; the mode validation from G-107 holds, and its online content can only gate or complement an in-person assessed component.
  4. Self-directed modules appear in the catalogue and what's-next like any other, with prerequisites enforced the same way (safety-critical gaps block, ordinary gaps warn).
  5. Completion alone awards nothing; the award comes from the quiz (G-202) or, for hybrids, both halves (G-203).
- Source: Prompt Book G-4; Get-In constraint 6

## G-202: Quiz assessment with pass mark and cooldown

- Role: Member
- Phase: V2
- Story: As a member, I want a quiz that awards my record automatically on a pass so that self-directed training ends in a record, not an email thread.
- Depends on: G-201
- Acceptance criteria:
  1. Each self-directed module's quiz has a configurable pass mark and a configurable cooldown between attempts, both per module.
  2. An attempt during the cooldown is refused, stating when the next attempt opens.
  3. A passing attempt awards the record automatically, dated to the attempt; expiry stamps from the module's policy as at that date.
  4. The complete attempt history (score, date, pass or fail) is kept per person and visible to the person, the department's leads and administrators.
  5. Two concurrent passing submissions award exactly one record, by the same race discipline as the register.
  6. A quiz on a safety-critical module can gate or complement the in-person component; passing it alone never awards the record.
- Source: Prompt Book G-4; Get-In constraint 6

## G-203: Hybrid completion

- Role: Member
- Phase: V2
- Story: As a member, I want hybrid modules to award only when both halves are complete so that the record always means the whole thing was done.
- Depends on: G-201, G-202, G-116
- Acceptance criteria:
  1. A hybrid module declares an online component (content plus quiz) and an in-person assessed component (session register or sign-off).
  2. The record awards only when both halves are complete, whichever completes second triggers the award, dated to that completion.
  3. Each half's completion is visible to the member separately, so "waiting on the other half" is never a mystery.
  4. Completing one half confers nothing at any gate until the record exists.
  5. The in-person half follows every register rule from G-115 and G-116 unchanged.
- Source: Prompt Book G-4; Get-In constraint 6

## G-204: Question channel to department leads

- Role: Member
- Phase: V2
- Story: As a member working through online content, I want to ask a question in context so that being stuck reaches someone who can unstick me.
- Depends on: G-201, G-110
- Acceptance criteria:
  1. Every self-directed and hybrid module offers an in-context question form; questions route to the owning department's current leads.
  2. Leads see open questions per module and answer in-thread; the asker is notified of the answer.
  3. Questions reference the content section they were asked from, so the lead sees the context without asking.
  4. Unanswered questions surface on the lead's dashboard and in the monthly digest after a configurable age.
  5. Question text about a person is reachable by GDPR erasure scrubbing.
- Source: Prompt Book G-4; Get-In constraint 6

## G-205: Material link rot checking

- Role: Department lead
- Phase: V2
- Story: As a department lead, I want external material links checked for rot so that a dead Google Drive folder is my dashboard's problem, not a learner's dead end.
- Depends on: G-107
- Acceptance criteria:
  1. A scheduled check requests every module's external material links and records reachable or unreachable per link, with the last-checked time.
  2. Unreachable links surface on the owning department lead's dashboard and in the monthly digest.
  3. The check never edits or removes a link; humans decide.
  4. A link that requires sign-in (as Drive links may) is marked unverifiable rather than broken.
- Source: Prompt Book G-4; audit TR-9 (sweeps notice, never act)

## G-206: Practice sandboxes

- Role: Member
- Phase: V2
- Story: As a new volunteer, I want practice modes of the till, door scan and Challenge 25 so that my first sale is not my first attempt.
- Depends on: G-211
- Acceptance criteria:
  1. A practice mode appears only while the person holds an open practice window for the matching target; with no window there is no tile and no hint the feature exists.
  2. Sandboxes mirror the till, door scan and Challenge 25 flows against practice data only, isolated by schema namespace from every operational table, and the isolation is enforced by a CI check.
  3. While a person's sandbox run is open, operational surfaces for those tools are locked for that person.
  4. Expired practice runs purge automatically, and GDPR erasure deletes practice history outright.
  5. A printable practice-ticket sheet supports door lessons.
- Source: Prompt Book G-5; audit PR-14; Get-In disposition (sandboxes defer to V2)

## G-207: Training operations reporting

- Role: Training officer
- Phase: V2
- Story: As the training officer, I want reporting across records, sessions and demand so that the year can be reviewed and the catalogue planned on numbers.
- Depends on: G-101, G-104, G-116
- Acceptance criteria:
  1. Reports cover records awarded per module and per period, session attendance against capacity, current holder counts per module, and open demand from the request board.
  2. Expiry forecasting lists records due to expire per department per month, so sessions can be scheduled ahead of the cliff.
  3. Exports are CSV, paginate at the API, and contain ids and names, never email addresses.
  4. Counts include LEGACY and EXTERNAL sources, distinguishable per source.
- Source: Prompt Book G-3; audit TR-8 (no-email payloads)

## G-208: QR self-registration for get-in and get-out briefs

- Role: Member
- Phase: V2
- Story: As a member arriving for a get-in, I want to scan a QR code on the wall of the room to register that I received the brief so that attendance records itself without a trainer holding a register.
- Depends on: G-103, G-118
- Acceptance criteria:
  1. A module of kind BRIEF can be marked self-registrable; only briefs qualify, because briefs never expire and never gate anything, so self-registration can never confer a safety-bearing record. Modules, certifications and anything safety-critical are refused the flag at the write path.
  2. An administrator or lead generates a printable poster per self-registrable brief carrying a QR that encodes a stable signed link; posters can be regenerated (rotating the signature) without reprinting invalidating history.
  3. Scanning while signed in shows the brief's content and one confirm action; confirming writes a brief-attendance record dated to that moment, attributed to the member, with the registration source distinguishable from a trainer-marked register in every view and export.
  4. Scanning while signed out routes through sign-in and back to the confirm screen; re-scanning after registering shows the last-attended date instead of a second confirm, and a repeat confirmation on the same day is idempotent.
  5. An optional active window per poster (for example the get-in fortnight) refuses registrations outside it with the window quoted; leads see who registered, when, per production period.
- Source: Committee direction 26 August (new capability); Prompt Book G-1 (briefs never expire and never gate); audit TR-1 (brief semantics).

## G-209: A material change invalidates a module's existing training

- Role: Training officer
- Phase: V2
- Story: As the training officer, I want to declare a change to a module material and invalidate the training people hold from it so that a module taught on equipment we no longer own stops counting.
- Depends on: G-107, G-122
- Acceptance criteria:
  1. Editing a module offers invalidation as a deliberate, separately confirmed act; an ordinary edit (a typo, a material link, a description) never invalidates anything.
  2. Invalidation is revocation with a reason naming the change, so the append-only table is respected: no record is deleted, no record is edited, and each keeps its award date and its stamped expiry.
  3. It previews every record it would invalidate, naming the person and the award date, and the affected-row count is echoed back before it writes; a count that moved between the preview and the write aborts the run quoting both figures.
  4. Already-revoked records are skipped, so running it twice invalidates nothing the second time and is refused for a count of zero.
  5. Everybody who loses a record is told once, naming the module and why, with the claim held by the notification ledger.
  6. The audit entry is written in the same batch as the revocations, so a partial run cannot exist unaudited; it names the module and the count, and no person.
  7. Invalidating a module that grants trainer or supervisor standing removes that standing live, because standing derives from a current record (G-111).
- Source: 0041; committee direction, 2 September 2026

## G-210: Bootstrap a new or materially changed module

- Role: Training officer
- Phase: V2
- Story: As the training officer, I want to grant a module to the people who already know it so that creating a module, or invalidating one, does not mean re-teaching the whole theatre.
- Depends on: G-107, G-120, G-209
- Acceptance criteria:
  1. A module that is new, or that has just been invalidated, offers a bootstrap: the officer picks people from the directory and grants them the module in one action.
  2. The grant is previewed before it writes, one line per person, showing the award date and the expiry each record would carry; the affected-row count is echoed back, and a mismatch at the write aborts the run.
  3. Records are written with a source that says they were bootstrapped rather than taught, so a bootstrapped record is never mistaken for an assessed one.
  4. Anybody already holding a current unrevoked record for that module is shown as already recorded and is not written again.
  5. Prerequisites are enforced as they are for a sign-off: a safety-critical gap blocks outright, and an ordinary gap is acknowledged per person.
  6. Every grant is audited in the same batch, naming the module and the count and no person, and each person is told what they now hold.
  7. Bootstrapping is the training officer's, not every lead's, because it awards without assessing.
- Source: 0041; committee direction, 2 September 2026

## G-211: Practice mode is entered from the tool

- Role: Member
- Phase: V2
- Story: As a member who has been trained on the till, I want to enter practice mode from the till itself when I want to rehearse so that practising is my decision rather than a window somebody handed me.
- Depends on: G-101, G-111
- Acceptance criteria:
  1. A screen for a tool that has a practice mode offers it to a member who holds the qualifying module, and shows nothing at all to a member who does not.
  2. Eligibility derives from the record held, read live at the moment of entry; there is no window row, nothing to grant and nothing to expire on a timer.
  3. Entering and leaving practice mode is the member's own act, repeatable as often as they like.
  4. Whether a lapsed record still qualifies somebody to rehearse is settled by this story and stated in one place, because the answer differs from whether it qualifies them to work.
  5. While a member is in practice mode, the operational surface for that tool is locked for them, so a rehearsal cannot be mistaken for a real transaction.
  6. Entering practice mode is not an audited privileged act, because it grants nothing: it is audited only where it locks an operational surface.
- Source: 0042; committee direction, 2 September 2026

## G-301: Certification auto-suspension (stub)

- Role: Training officer
- Phase: Later
- Story: As the training officer, I want a decision on whether a certification suspends when a constituent module lapses so that compound competence cannot quietly outlive its parts.
- Depends on: G-123
- Acceptance criteria:
  1. The old system deliberately only flags lapsed constituents; whether it should ever suspend is a committee decision (open question 2), and this stub holds the place until it is made.
- Source: audit TR-10

## G-302: External training API (stub)

- Role: Administrator
- Phase: Later
- Story: As an administrator, I want a read-only training API revivable for an external consumer so that a future integration does not force a redesign.
- Depends on: G-101
- Acceptance criteria:
  1. The internal seam dissolves with the unified database; a service-token read surface (modules, holders, eligibility, practice windows) is specified only if a real external consumer appears, keeping the old contract's rules: fail closed, no-store practice reads, no email addresses in any payload.
- Source: audit TR-8; Get-In disposition (consumer API retires)
