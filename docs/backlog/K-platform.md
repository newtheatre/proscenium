# Module K: Platform foundations and migration

Cross-cutting requirements every other module assumes, plus the migration itself expressed as
stories with acceptance criteria. Nothing here is optional polish: these are the conditions under
which show night can trust one database, and the conditions under which four databases become one
without losing a row that matters. Phasing follows the roadmap: the platform stories land in
Phase 1, the migration stories rehearse weekly through Phase 2 and complete at the 31 October
cutover.

Stories: 22. Phases: 19 MVP, 0 V2, 0 Later, 3 resolved.

## Open questions

- Answered 26 August: SP-5 settled the database as D1 (decision 0003), so K-105 and K-109 are
  predicate-and-assert work in the old estate's proven style: conditional writes, unique
  indexes and batch atomicity. The stories were written mechanism-neutral and hold as written.
- Answered 26 August: there is no legacy training import (K-117 and G-127 resolved); the
  records do not map to the current module system.
- Whether historical pass revenue is backfilled into the ledger or documented as a pre-migration
  gap (K-114); the old estate never wrote pass-sale transactions.
- Whether offline tolerance (K-103, K-104) is built on a service worker, and if so what its
  update and cache-invalidation policy is; a stale service worker on show night is its own risk.
- Who owns the termly restore drill (K-108) after handover; proposed: the IT Manager, as a named
  duty on that role's handover page.

## K-101: Accessibility baseline

- Role: Visitor
- Phase: MVP
- Story: As a visitor using assistive technology, I want every public and operational screen to
  meet WCAG 2.2 AA so that booking a ticket or working a shift never depends on how I read a
  screen.
- Depends on: none
- Acceptance criteria:
  1. Automated accessibility checks run in CI against a named list of key screens (booking flow,
     door screen, till, register marking, room calendar) and fail the build on any WCAG 2.2 AA
     violation.
  2. The booking flow, a room request and a shift claim can each be completed keyboard-only and
     with a screen reader; all three journeys are scripted accessibility tests, not manual
     checks.
  3. Colour is never the only carrier of state: availability, validity and connection indicators
     pair colour with text or shape, verified by the CI checks above.
  4. Focus order, visible focus and minimum contrast are enforced by design-system tokens, so a
     new screen inherits compliance by default rather than opting into it.
- Source: Prompt Book K-1 (accessibility); audit PR-5, PR-9 (as-built operational screens);
  Get-In part 5 (standards)

## K-102: Phone-first operational screens

- Role: Shift authority
- Phase: MVP
- Story: As tonight's door volunteer, I want every operational screen designed for one hand on a
  phone in a dark foyer so that the tool fits the conditions it is actually used in.
- Depends on: K-101
- Acceptance criteria:
  1. Operational screens (door, till, registers, tonight view) lay out for a 360 px phone
     viewport first; the desktop layout is the adaptation, never the other way round.
  2. Primary actions (admit, sell, mark, refuse) sit in the bottom third of the screen, have
     touch targets of at least 48 by 48 px, and never rely on hover, long-press or multi-touch.
  3. Show-night screens default to a dark theme that still meets AA contrast.
  4. A scripted walkthrough of the admit, sale and age-check flows is run one-handed on a
     physical phone before any release that changes those screens, and the walkthrough is part
     of the release checklist.
- Source: Prompt Book K-1, P8 (show night is hostile territory); audit PR-5, PR-9; Get-In part 5
  (standards)

## K-103: Offline reads for the show-night critical path

- Role: Shift authority
- Phase: MVP
- Story: As tonight's duty manager, I want the door screen, till and emergency card to render
  from cache so that venue Wi-Fi dropping never blanks the screens that matter at 19:25.
- Depends on: none
- Acceptance criteria:
  1. Opening the door screen, till or tonight view caches everything the night needs on the
     device at that moment: the admit list, the product catalogue with prices, the checklists
     and the emergency card.
  2. With the network then unavailable, each of those screens still renders fully from cache; an
     automated test loads each named screen with all network requests stubbed to fail and
     asserts a complete render with no spinner.
  3. The emergency card is cached from the start of the shift, not from the first visit to the
     card, closing the old estate's offline-first-load gap.
  4. Cached data is honestly labelled with its sync time (for example "last synced 19:12"); no
     cached screen presents itself as live.
- Source: Prompt Book K-1 (resilience), E-2; audit PR-9 (emergency card mirrors to localStorage
  but not on a cold load); Get-In part 6 (one database is one blast radius)

## K-104: Queued writes with honest reconciliation

- Role: Shift authority
- Phase: MVP
- Story: As box office on the door, I want scans and sales made offline to queue and reconcile
  so that a connection hole costs nothing and hides nothing.
- Depends on: K-103
- Acceptance criteria:
  1. Scans, admits and till sales made while offline queue on the device and submit in order on
     reconnection; navigating within the app never loses a queued item.
  2. Every queued action is visibly pending, and the screen shows one honest connection state
     (online, or offline with the queued count); the state never reads as synced while the queue
     is non-empty.
  3. Reconciliation is conflict-aware: a scan queued offline that duplicates an admit taken on
     another device is flagged for a human decision, never silently merged; a queued sale that
     fails a server invariant is surfaced for re-entry, never dropped.
  4. An automated test simulates offline capture, reconnection and a conflicting concurrent
     write, and asserts the queue drains to zero with the conflict reported.
- Source: Prompt Book K-1 (resilience), D-5 (queued scans); audit PR-5; Get-In part 6

## K-105: Contended invariants held by the database

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want every contended invariant guaranteed by database constraints
  so that simultaneous writes can never corrupt seats, shifts, register marks or stock.
- Depends on: none
- Acceptance criteria:
  1. Capacity: overselling a performance is impossible; the claim is a database constraint or an
     atomic conditional write, never an application read-then-write (the old estate's documented
     capacity race is the named anti-pattern).
  2. Shifts: at most one confirmed duty manager per performance, and no shift claimable by two
     people, both held by unique constraints or atomic claim predicates.
  3. Register marks: two racing submissions of the same register resolve to exactly one set of
     awards; the loser receives a conflict response and no partial award exists.
  4. Stock: on-hand is always the sum of movements, and a sale's payment, lines and stock
     movements commit atomically.
  5. Each of the four invariants has a racing test that fires concurrent requests and asserts
     exactly one winner; all four run in CI on every merge.
- Source: Prompt Book K-1 (concurrency), C-1, D-2, E-1, G-2; audit PR-2 (capacity race defect),
  PR-13, RM-4, TR-5; Get-In part 5 (named regression cases)

## K-106: Europe/London time discipline

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want every domain date computed with Europe/London pinned so that
  a runtime running in UTC is never wrong for half the year.
- Depends on: none
- Acceptance criteria:
  1. Every date the theatre reasons about (booking windows, expiry, recurrence, season and
     committee-year boundaries) is computed with Europe/London pinned; no domain logic reads the
     runtime clock unpinned.
  2. The show night runs 04:00 to 04:00 London; the committee year ends at the last London
     instant of 31 July; both are asserted by tests.
  3. DST transitions are named test cases: a 19:00 weekly rehearsal stays 19:00 wall clock
     across both clock changes; a record expiring on a transition day expires on its date; the
     academic-year carry-over arithmetic matches the behaviour pinned by the old training
     module's suite.
  4. Formatting and comparison helpers refuse a date without an explicit zone, so an unpinned
     date is a test failure rather than a silent seasonal error.
- Source: Prompt Book K-1 (time); audit RM-1 (wall-clock recurrence), TR-9 (carry-over), PR-9
  (04:00 night boundary); Get-In part 5 (data standards)

## K-107: Deploy pipeline with health checks and migration gating

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want deploys that outrun their database to fail loudly so that a
  schema mismatch never silently breaks the estate again.
- Depends on: none
- Acceptance criteria:
  1. A public GET /api/health compares the compiled migration journal to the applied-migrations
     ledger and returns 503 naming the pending files whenever the schema is behind the code.
  2. Migrations apply from CI on merge to main; the job takes a restore point first and re-reads
     the ledger afterwards rather than trusting the tool's exit code.
  3. A CI check refuses a generated migration that rebuilds an append-only table or omits a
     column from a copying INSERT; destructive changes are applied by hand before merge, per a
     documented runbook.
  4. A deploy that lands ahead of its schema turns the health endpoint red and raises an alert;
     losing the ordering race is visible within one minute, never silent.
- Source: Prompt Book K-1 (operations); audit EW-3; Get-In part 5 (CI gates)

## K-108: Backups and the termly restore drill

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want scheduled backups proven by a termly restore drill so that
  the backup we rely on is one we have actually restored.
- Depends on: none
- Acceptance criteria:
  1. Automated database exports run on a schedule, and point-in-time restore is available and
     documented in operations.
  2. Once per term, a drill restores a backup into a scratch environment and verifies it by row
     counts, money totals and register checksums against the source.
  3. Each drill is recorded with date, operator, outcome and time-to-restore; a missed or failed
     drill stays on the committee dashboard until resolved.
  4. The first drill runs before the December break.
- Source: Prompt Book K-1 (operations); audit EW-3 (weekly exports as built); Get-In part 6
  (blast-radius mitigation)

## K-109: Single-transaction erasure

- Role: Audience account
- Phase: MVP
- Story: As anyone with an account, I want erasure to complete in one transaction so that my
  right to be forgotten does not depend on four services agreeing.
- Depends on: none
- Acceptance criteria:
  1. Erasure anonymises across every module in a single database transaction; no partial erasure
     state is ever observable, and a failure rolls back completely.
  2. Sales, attendance and safety statistics survive as anonymous rows; free text about the
     person is scrubbed; consent-based data (access profiles, marketing consent) is deleted
     outright.
  3. Anonymised rows are tombstoned and can never be written back over.
  4. Erasure is idempotent, and an automated completeness test erases a fixture person with data
     in every module and asserts no identifying value remains anywhere. This is the named
     erasure-completeness regression case.
- Source: Prompt Book A-5; audit EW-2, SD-7, SD-10; Get-In part 2 (GDPR hooks retired: erasure
  becomes a single-database operation)

## K-110: Data export bundle

- Role: Audience account
- Phase: MVP
- Story: As anyone with an account, I want one export covering every module so that my rights do
  not depend on knowing the system's architecture.
- Depends on: none
- Acceptance criteria:
  1. One self-service action produces a bundle (JSON, with CSV for tabular data) covering every
     module: bookings, payments, passes, room bookings, training records, shifts and message
     metadata.
  2. The bundle contains only the requester's data; special-category data appears in nobody's
     export but the person's own; every export is audited.
  3. A test asserts that every module registers an export contributor, so a new module cannot
     ship without joining the bundle.
- Source: Prompt Book A-5; audit SD-7, EW-2; Get-In part 2

## K-111: Retention sweep, dry-run by default

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want retention automation that warns twice and ships disarmed so
  that the theatre stops holding personal data forever without any timer ever surprising anyone.
- Depends on: K-109
- Acceptance criteria:
  1. Inactivity periods are configuration; a person approaching the threshold receives two
     warnings before anonymisation, and a sign-in clears the warning trail.
  2. Active members, current role holders and people with unsettled money are exempt, and each
     run caps how many accounts it touches.
  3. The sweep ships in dry-run: it computes, reports and emails a digest without changing data.
     Arming it is an explicit, audited configuration change with a preview of who is affected
     and a typed confirmation.
  4. Arming happens only after a reviewed dry-run digest, planned for December per the roadmap.
- Source: Prompt Book A-5; audit SD-12 (dry-run sweep as built); Get-In part 2 (retention
  rebuilt once, dry-run-first)

## K-112: User import, re-runnable weekly

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want the identity import to run weekly from fresh exports so that
  by cutover it is a rehearsed routine, not a first attempt.
- Depends on: none
- Acceptance criteria:
  1. All users import from stage-door with scrypt password hashes and TOTP secrets intact;
     nobody is forced to reset a password by the migration.
  2. Role grants map through a written vocabulary table agreed with the committee; provenance
     and expiry dates carry; the old audit log imports as a read-only archive.
  3. Anonymised tombstones import as tombstones and remain guarded against rewrite.
  4. The import is re-runnable weekly against a fresh export: keyed upsert by canonical id, zero
     duplicates, and a reconciliation report of row counts per table after every run.
  5. Two consecutive green rehearsal runs are part of the Phase 2 gate.
- Source: Prompt Book P1 (one person, one record); audit SD-1 to SD-13 (as-built identity);
  Get-In part 3 (inventory), part 4 (Phase 1 first import)

## K-113: Keyed merge on canonical ids

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want every module's import keyed on the canonical stage-door id so
  that joining four databases is a merge, not entity resolution.
- Depends on: K-112
- Acceptance criteria:
  1. Every imported row that references a person joins on the canonical stage-door user id that
     all four apps already share; no import ever matches on name or email.
  2. A row whose person id has no imported user fails into an exceptions report; nothing is
     silently skipped and nothing is guessed.
  3. Imported rows take fresh ids and the live schema carries no legacy-id columns (decision
     0015, amended): the source-to-new id mapping lives only in the migration tooling's working
     artefacts, kept with the read-only old estate and archived with it, so historical
     questions trace through the reconciliation reports rather than the database.
- Source: Prompt Book P1; audit EW-2 (shared canonical ids); Get-In part 3 ("a keyed merge, not
  entity resolution")

## K-114: Money history import with reconciliation

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want every historical transaction posted into the unified ledger
  and reconciled to the penny so that six years of accounts survive the crossing intact.
- Depends on: K-113
- Acceptance criteria:
  1. All historical transactions post into the unified ledger in integer pence with their
     original dates, and with their source system marked on every entry.
  2. Per-period totals, by London day and by season, reconcile against the source databases to
     the penny; every discrepancy is listed as an exception with an explanation or a fix, never
     absorbed into an average.
  3. The documented pre-migration repairs run before export: bar container sizes, zeroed
     stocktakes, double-voided tab charges and placeholder-email customers.
  4. Known irreducible blur is recorded in the data dictionary: pre-migration walk-ins are
     indistinguishable from web bookings, and the committee's decision on backfilling historical
     pass revenue is recorded whichever way it goes.
  5. Six-year sales retention obligations carry with the imported data.
- Source: Prompt Book P4, I-1; audit PR-5 (walk-in source defect), PR-8 (missing pass-sale
  ledger rows), PR-12 (recorded data damage); Get-In part 3

## K-115: Licensing registers imported losslessly

- Role: Theatre Manager
- Phase: Resolved, not needed (committee confirmation, 26 August 2026)
- Story: Withdrawn. The old estate's incident log, Challenge 25 register and night reports hold
  no entries yet, so there is nothing to import.
- Resolution:
  1. The new registers start clean and are append-only from their first row (decision 0010).
  2. The migration tooling's reconciliation report still counts these tables at cutover as a
     guard: if any rows have appeared by then, this story revives as written rather than the
     rows being dropped.
- Source: Committee confirmation, 26 August; Get-In part 3.

## K-116: Bar opening balances by physical stocktake

- Role: Bar officer
- Phase: MVP
- Story: As the bar manager, I want cutover stock levels established by a physical count so that
  the new ledger opens on what is actually on the shelf, not on damaged history.
- Depends on: K-113
- Acceptance criteria:
  1. The historical stock ledger imports as opening history after the documented repairs run;
     damaged rows are repaired or explicitly written off before export, never carried as fact.
  2. Products are re-expressed as serving-size variant sets during import, replacing the old
     estate's damaged container semantics.
  3. A physical stocktake at cutover posts the trusted opening balance as stocktake movements;
     variance against the imported ledger posts as an explicit adjustment, so post-cutover
     on-hand equals what was counted.
  4. Blank counts are distinguishable from zero counts, and a finished stocktake posts its
     adjustments atomically.
- Source: Prompt Book F-2; audit PR-12 (container damage, stocktake blanks); Get-In part 3,
  constraint 5

## K-117: Legacy Heroku training data import

- Role: Training officer
- Phase: Resolved, won't build (committee decision, 26 August 2026)
- Story: Withdrawn. The legacy records do not map to today's module system in any usable way;
  training standing starts clean and current competence is re-recorded against the real
  catalogue (G-127 carries the same resolution).
- Resolution:
  1. No mapping table, no import; the Heroku data stays readable wherever it is archived.
  2. Get-in and get-out brief attendance gains a lighter future path instead: QR
     self-registration (G-208, V2).
- Source: Committee direction, 26 August; audit TR-10.

## K-118: Passkey re-enrolment prompt

- Role: Member
- Phase: Resolved, won't build (SP-4 outcome, 26 August 2026)
- Story: Withdrawn. SP-4 counted exactly one account holding passkeys on the old estate.
- Resolution:
  1. Legacy passkey rows are not migrated; the one affected holder re-enrols manually after
     cutover; no prompt, tracking report or announcement copy is built.
  2. Mirrors A-106's resolution; decision 0008 records it.
- Source: SP-4 outcome in `../spikes.md`; decision 0008; Get-In part 3.

## K-119: Read-only old estate and the rollback plan

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want the old estate frozen read-only with a rehearsed rollback so
  that cutover is reversible for a season and irreversible only by choice.
- Depends on: K-112, K-114, K-115, K-116
- Acceptance criteria:
  1. At cutover the old estate flips read-only: every write path refuses with a message pointing
     at the new system, while reads keep working as a reference.
  2. During transition, each show is assigned to exactly one system for its whole run, so no
     night's door or money ever splits across two records.
  3. The rollback runbook re-arms the old estate within one day if a cutover-blocking defect
     appears, and the runbook is rehearsed once before cutover, not written for the drawer.
  4. After one term read-only, the old estate is exported, archived and shut down; DNS collapses
     to one domain, and the archive's location is recorded in operations documentation.
- Source: Prompt Book K-1 (operations); audit EW-1 to EW-4 (the estate being retired); Get-In
  part 3 (cutover strategy), part 4 (Phase 3 rollback gate)

## K-120: Seed and test-data tooling that refuses production

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want seed tooling that cannot touch production so that realistic
  test data is one command and a catastrophic mistake is impossible by construction.
- Depends on: none
- Acceptance criteria:
  1. Seed scripts generate random credentials at runtime and print them exactly once; nothing is
     committed, and no fixture contains a real secret or a real person.
  2. Every seed and test-data script checks its target and refuses to run against production or
     any remote database, exiting non-zero with a stated refusal; a test proves the refusal.
  3. Seeded people use reserved undeliverable domains and obviously synthetic names, so test
     data can never be mistaken for, or mailed to, a real person.
- Source: Prompt Book P7; audit PR-14 (sandbox isolation precedent); Get-In part 5 (standards)

## K-122: Bootstrap the first administrator in a new environment

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want a documented way to create the first administrator in an
  environment that has none, so that a fresh deployment is not locked out of itself.
- Depends on: K-107
- Acceptance criteria:
  1. Granting the administrator role requires a permission only an administrator holds, so an
     environment with no administrator cannot be administered; this story is the only way in and
     says so.
  2. Locally, one command grants the role to an existing account and refuses any target that is
     not a local database, with a test proving the refusal.
  3. In production, the runbook names the operator, the command and the approval needed; the
     grant is audited with the actor recorded as the bootstrap rather than as a person.
  4. The bootstrap is refused where a usable administrator already exists, so it cannot be used
     to grant quietly around the ordinary path.
  5. Operations documents the whole sequence for a new environment, and a successor can follow
     it without asking anyone.
- Source: Found while building A-120; the guard protects the last administrator and nothing
  created the first.

## K-121: The named regression suite

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want the regression cases named and gating from the first commit
  so that the defects the old estate taught us are the ones this system can never reproduce.
- Depends on: none
- Acceptance criteria:
  1. The suite exists before the first feature and CI blocks merge on it with no exemption path;
     the named cases are present from day one: the register race, the double refund, DST
     arithmetic, the capacity race and erasure completeness.
  2. The pinned behaviours of the old training module's suite (register races, expiry
     arithmetic, academic-year carry-over, notification idempotency) are ported as named cases
     before the training module is built.
  3. Development follows spec-and-test-driven order everywhere, enforced in review: the
     backlog story or decision record is the spec; failing unit and integration tests
     reflecting it land first; the implementation follows; the tests pass. Money, capacity,
     register-marking, expiry and erasure paths admit no exception to this order.
  4. Every defect recorded in the audit (capacity race, walk-in source blur, missing pass-sale
     ledger rows, the admin email-change epoch gap) maps to a case proving the new system does
     not reproduce it, and every defect found in hardening adds a named case in its fixing pull
     request.
- Source: Prompt Book K-1 (testing); audit TR-10 (the estate's best-tested module), PR-2, PR-5,
  PR-8, SD-14; Get-In part 5 (the defect list doubles as the regression checklist)
