# Module J: Governance and handover

The committee turns over every year, and the system treats that as its most important scheduled
event. This module carries the machinery that outlives any one committee: the append-only audit
trail, policy as validated configuration with preview and revert, health and backup operations
with a tested restore drill, and operator documentation that lives in the app. The old estate's
audit history is not imported in any shape (0030), which is what withdrew J-108. Handover mode itself is V2, shipping before July 2027 so the
2027/28 committee is the first to be handed the system by the system.

Stories: 13 (9 MVP, 3 V2, 1 resolved: J-108 superseded by 0030).

## Open questions

1. The wide-blast-radius list: which settings require preview and typed confirmation (refund
   policy and retention arming are certain; hold expiry, tab cap and room rules are candidates)?
   To be settled at the configuration workshop.
2. Signing a manual audit entry: is a fresh MFA-verified session sufficient, or does entry require
   an explicit re-authentication at the moment of signing?
3. Audit archive vocabulary: do the four apps' action names map onto the unified taxonomy at
   import, or import verbatim per source app with the taxonomy applied only to new entries?
4. Mid-year role changes (resignations, by-elections): does a single-role flip reuse the handover
   run mechanism or need a lighter path?
5. The restore drill: run by the IT Manager alone, or witnessed and countersigned by a second
   officer?

## J-101: The append-only audit trail

- Role: Administrator
- Phase: MVP
- Story: As the Theatre Manager, I want every privileged action in one append-only audit trail so that accountability survives the people involved.
- Depends on: none
- Acceptance criteria:
  1. Every privileged mutation writes an audit entry recording actor, action, target, timestamp and a structured before/after diff, in the same transaction as the mutation itself.
  2. Scheduled and automated actions attribute to system, never to a person; a system entry is visually and structurally distinct from a human one.
  3. The trail is append-only, enforced at the database layer; UPDATE and DELETE are refused by trigger, with erasure redaction (J-102) as the single sanctioned exception.
  4. Diffs are structured field-by-field (from and to values), machine-readable, not prose.
  5. A privileged endpoint lacking an audit write where its peers have one is a named review-checklist failure, and the audit-coverage list is a maintained test fixture.
- Source: Prompt Book J-1, P2; audit SD-9 (from/to diffs), SD-11, EW-1 (system actor rows)

## J-102: Audit hygiene and erasure redaction

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want personal free text kept out of audit details and erasure limited to redacting identifying values so that the trail never becomes a GDPR liability.
- Depends on: J-101
- Acceptance criteria:
  1. Audit details carry identifiers and structured values only; free text about a person (notes, reasons, descriptions) is referenced by id, never inlined, and an automated audit-hygiene property test enforces this on every entry type.
  2. Erasure redacts identifying values in that person's historical entries; this is the sole edit the trail ever accepts, and the redaction itself writes an audit entry.
  3. Redaction is idempotent: a retried erasure neither double-redacts nor fails.
  4. After an erasure completes, no audit entry, native or archived, can reproduce the person's name or email; a test seeds entries across entry types and asserts this.
  5. No API or admin surface offers any other modification of an audit entry.
- Source: Prompt Book J-1, K-1 (no personal free text in logs); audit SD-10 (the audit log's single sanctioned edit), TR-10 (pre-cutover free-text lesson)

## J-103: Search, filters and signed manual entries

- Role: Administrator
- Phase: MVP
- Story: As the Theatre Manager, I want to search the trail and record actions taken outside the system so that the record of what happened is complete and findable.
- Depends on: J-101
- Acceptance criteria:
  1. The trail is filterable by actor, action, target, source module and date range; results page in SQL and return a pagination envelope, never a bare array.
  2. Manual entries record actions taken outside the system and are namespaced (manual.*) at the write path, so a manual entry claiming a system or application action type is refused.
  3. A manual entry is signed: written against the authenticated officer entering it, from an MFA-verified session, with the stated real-world actor and date carried as structured fields distinct from the signer. Amended 29 August 2026: the real-world actor is an account reference and never a name, because a name is personal free text and the trail's only sanctioned edit is redaction. A person with no account cannot be named (0028).
  4. Manual entries are append-only under the same trigger as the rest of the trail.
  5. Search results export as CSV, and the export is itself audited.
- Source: Prompt Book J-1 (signed manual entries, namespaced); audit SD-11 (manual.* namespace)

## J-104: The configuration surface

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want every folklore number as a validated setting so that the theatre's rules change by decision, not by deploy.
- Depends on: J-101
- Acceptance criteria:
  1. Every number the backlog calls configurable (booking windows, hold expiry, room rules and caps, refund policy, tab cap, comp authority, expiry and retention windows, nag cadences) lives in one settings surface, seeded from the Phase 0 workshop defaults; no policy number is hardcoded.
  2. Each setting displays its default, its current value, and who last changed it and when.
  3. Values are validated per key (type, range, cross-field rules); an invalid value is refused and never stored, and an impossible date such as a 29 February year boundary is a named refusal case.
  4. Enforcement reads the setting at the write path, so the published policy and the enforced policy are the same document; a changed value takes effect without a deploy.
  5. Every change writes an audit entry with the from and to values.
- Source: Prompt Book J-3, P5; audit TR-7 (per-key validation, 02-29 refusal), RM-1 (the unenforced-policy failure this design prevents)

## J-105: Blast-radius preview, typed confirmation and one-action revert

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want dangerous configuration changes previewed and reversible so that a wide-reaching mistake is hard to make and cheap to undo.
- Depends on: J-104
- Acceptance criteria:
  1. Settings flagged wide-blast-radius (refund policy and retention arming at minimum) require a live preview before saving: the count and category of records and people the change affects.
  2. Saving a flagged change requires a typed confirmation echoing the previewed count or the setting name; the confirmation text is validated, not a checkbox.
  3. Any setting reverts to its prior value in one action, and the revert is itself an audited change.
  4. Retention arming specifically is refused until a reviewed dry-run digest exists, carrying forward the old estate's dry-run-first discipline.
  5. The wide-blast-radius flag on a setting is itself configuration, changeable only by an administrator and audited.
- Source: Prompt Book J-3, A-5 (retention arming); audit SD-12 (dry-run sweep awaiting an explicit arming)

## J-106: The health endpoint

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want a public health endpoint that detects a schema behind the code so that a deploy outrunning its database fails loudly instead of breaking logins silently.
- Depends on: none
- Acceptance criteria:
  1. A public GET /api/health requires no authentication and returns 200 when healthy.
  2. The endpoint compares the compiled migration journal to the applied-migrations ledger and returns 503 naming the pending files when the schema is behind the code.
  3. The deploy pipeline checks health after every deploy and after every migration apply; an unhealthy result raises an alert rather than passing silently.
  4. The response exposes no internal detail beyond migration filenames: no secrets, no dependency versions, no stack traces.
  5. Sustained unhealthiness beyond a configurable window notifies the IT Manager through the notification centre.
- Source: Prompt Book K-1 (schema-ahead-of-code detection); audit EW-3

## J-107: Backups, point-in-time restore and the termly drill

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want backups I have actually restored so that one database being one blast radius is a bounded risk, not a standing threat.
- Depends on: J-101
- Acceptance criteria:
  1. Point-in-time restore is available for the production database, and a restore point is taken automatically before every migration apply.
  2. A full export runs weekly to storage independent of the primary database, and a failed export alerts rather than vanishing.
  3. A restore drill runs on a configured interval (a number of days, not a term: no term dates exist anywhere in the system, 0034): restore into an isolated environment and reconcile row counts and money totals against production; the outcome (date, operator, result) is recorded in the audit trail.
  4. The operations dashboard shows the date of the last successful drill and flags it when the configured interval has passed without one.
  5. The drill procedure lives in the in-app operator documentation (J-109), current enough that a successor can run it cold.
- Source: Prompt Book K-1 (tested restore each term), P7; audit EW-3 (Time Travel restore points, weekly exports); Get-In part 6 (one blast radius)

## J-108: The audit archive import (superseded)

- Role: Administrator
- Phase: Resolved, superseded (0030, 30 August 2026)
- Story: As the IT Manager, I want the four old apps' audit logs imported as a read-only archive so that accountability does not reset at cutover.
- Depends on: J-101, J-102, J-103
- Acceptance criteria:
  1. Audit history from stage-door, proscenium, rooms and rehearsal imports read-only with original timestamps and actors preserved, namespaced by source app so an archived entry can never be mistaken for a unified-system entry.
  2. The documented cleanup for rehearsal's pre-cutover rows carrying personal free text is applied before import.
  3. The import is checksummed and reconciled by row counts per source; a mismatch aborts.
  4. Archived entries are searchable through the same surface as native ones (J-103), filterable by source app.
  5. Erasure redaction (J-102) reaches archived entries exactly as it reaches native ones, and actors already anonymised in the source import as anonymised.
- Superseded 30 August 2026 by decision 0030: the old estate's audit history is not imported in any
  shape. Criterion 2 already named the free text this story would have had to clean, and criterion 5
  would have made every later erasure reach into another system's records. The history stays in the
  old estate, which remains readable until it is archived.
- Source: Prompt Book J-1; audit SD-11, TR-10 (free-text cleanup SQL); Get-In part 2 (audit history imports as a read-only archive)

## J-109: Operator documentation in-app

- Role: Committee
- Phase: MVP
- Story: As a committee member who started last week, I want each module's operator documentation inside the app so that running my area never depends on a predecessor's folder.
- Depends on: none
- Acceptance criteria:
  1. Every module ships with operator documentation in-app, reachable from the screens it documents.
  2. Documentation is Nuxt Content, committee-editable through the same Studio-style rich-text pipeline as the public pages (D-103): draft, preview, publish commits and deploys; the deploy dependency is stated, not hidden.
  3. Each page shows when it was last updated and by whom; edits to published pages are audited.
  4. A report-drift action on every page files a defect visible to the IT Manager, and documentation drift is triaged as a defect, not a chore.
  5. Behaviour changes update the matching page in the same change, enforced by the review checklist in the engineering standards.
- Source: Prompt Book K-1 (operator documentation in-app, drift is a defect), P7; audit RM-7 (documentation selling a product the code does not contain)

## J-110: Policy pages quote the live configuration

- Role: Member
- Phase: MVP
- Story: As a member reading the booking policy, I want every number on the page to be the number the system enforces so that the published rules and the real rules are the same document.
- Depends on: J-104
- Acceptance criteria:
  1. Policy pages are Nuxt Content markdown, committee-editable like any other content page, with placeholder tokens (for example, a token naming ROOM_MAX_HOURS) in the prose.
  2. At render, each token resolves to the live value of the named configuration key, formatted for its type (hours, pence, days); changing the setting changes the page immediately with no content edit.
  3. CI validates every token in content against the configuration schema; a token naming an unknown or renamed key fails the build.
  4. At runtime, an unresolvable token renders as a visible error, never as blank or stale text.
  5. A rule the committee has stated but the system does not yet enforce is marked unenforced on the page, from a flag on the configuration key, so honesty about enforcement is part of the rendering.
- Source: Decision 0012 (mechanism, amended 26 August); audit RM-1 and RM-7 (the unenforced policy document this exists to prevent).

## J-201: The handover run and the atomic access flip

- Role: Committee
- Phase: V2
- Story: As the outgoing committee, I want to name incoming officers per role and have access flip atomically at the boundary so that the yearly turnover is a guided process, not an oral tradition.
- Depends on: J-101; module A (roles with committee-year expiry)
- Acceptance criteria:
  1. A handover run names an incoming holder per officer role, effective on a date defaulting to the committee-year boundary (midnight into 1 August, Europe/London).
  2. At the boundary, outgoing grants expire and incoming grants activate in one transaction; the flip is effective on privileged surfaces within one minute, and both cohorts are notified.
  3. A run that would leave zero administrators is refused at creation, not discovered at the flip; the last-admin guard holds throughout.
  4. An incoming officer who has not completed MFA enrolment by the boundary receives a grant that stays locked until enrolment completes.
  5. The whole run is audited: who named whom, when the flip executed, and any grant that failed to activate.
- Source: Prompt Book J-2, A-4, P3; audit SD-9 (expiry and last-admin guard)

## J-202: Living handover pages

- Role: Committee
- Phase: V2
- Story: As an outgoing officer, I want a living handover page for my role that nags me in my final month so that my successor inherits current knowledge, not archaeology.
- Depends on: J-201
- Acceptance criteria:
  1. Each officer role carries a handover page covering duties, the role's calendar, references to credentials held in the password manager, and current open items.
  2. Open items the system already knows (unmarked registers, pending approvals, unreconciled days, unsettled tabs) populate automatically and stay live.
  3. During the holder's final month the system nags them to update the page on a configurable cadence; nags stop once the page has been edited within the nag window.
  4. Pages are versioned; the incoming holder sees when the page was last updated and by whom.
  5. The credentials section accepts password-manager references only; the editor states plainly that secret values must never be entered, and pages are excluded from any public surface.
- Source: Prompt Book J-2, P7; audit SD-13 (lapse warnings and digests)

## J-203: Role-specific first-login orientation

- Role: Officer roles
- Phase: V2
- Story: As an incoming officer, I want my first login to land on an orientation for my role so that I start from my duties, not from a blank dashboard.
- Depends on: J-201, J-202
- Acceptance criteria:
  1. The first login after the access flip lands on a role-specific orientation showing the officer's permissions, their dashboards, their outstanding items and their role's handover page.
  2. Orientation content per role is committee-editable through the same tooling as operator documentation (J-109).
  3. The orientation states the role's expiry date (the next committee-year boundary) up front.
  4. The orientation is dismissible and permanently re-reachable, and completion is recorded per person per role.
- Source: Prompt Book J-2, P7; audit SD-8 (handover starting from an accurate register)
