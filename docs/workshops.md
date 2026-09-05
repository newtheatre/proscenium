# Workshops and the configuration defaults register

Three sessions in the week of 31 August. Their job is to turn folklore into configuration:
every number below currently lives in an unenforced policy document, a habit, or nowhere.
The proposed values become the shipped defaults; all remain admin-editable afterwards
(`decisions/0012`), so a wrong guess costs a settings change, not a release.

## Session 1: money and box office (90 minutes)

| Setting | Current folklore | Proposed default | Notes |
| --- | --- | --- | --- |
| Reservation hold expiry | none (holds live forever) | 15 minutes before curtain | Per-show override allowed |
| Per-order seat cap (public) | 10 | 10 | Box office uncapped |
| Refund policy | undocumented, ad hoc | free cancellation while unpaid; paid refunds in person, manager approval | Constraint: money moves in person only |
| Comp authority | tonight's duty manager or staff | unchanged | Comp request expiry 10 minutes |
| "Limited availability" threshold | none: the old listing said available or sold out | last 10 per cent of the house | What the public listing calls limited rather than available (D-101 criterion 2). Honest either way; the question is how early the theatre wants to create urgency |
| Pass products for 2026/27 | set yearly | to be listed in session | Entered through the box office screens, not settings: prices are dated and append-only (0025, D-123) |
| Bar tab cap | £20 soft nag | £20 hard cap, manager override | Old soft cap never blocked |
| Discount codes | none | none at launch | Capability exists, unused until wanted |
| Season boundary | 1 August to 31 July | unchanged | Drives reporting and role expiry |

## Session 2: spaces and training (90 minutes)

| Setting | Current folklore | Proposed default | Notes |
| --- | --- | --- | --- |
| Room minimum booking | 30 minutes (policy doc, unenforced) | 30 minutes | |
| Room maximum booking | 4 hours (unenforced) | 4 hours, admins exempt | |
| Advance notice | 4 working days (unenforced) | 48 hours for auto-approval; shorter goes to the queue | The old rule was widely ignored; pick one that will be kept |
| Booking horizon | none | 12 weeks ahead | Weeks rather than end of term: no term dates exist anywhere in the system, so that rule could not be enforced (0034) |
| Active bookings per member | 10 (unenforced) | 10, series counts each occurrence | |
| Request escalation | none: requests sat forever | approvers told after 48 hours | The old app had no escalation and no expiry, so a request nobody saw stayed open indefinitely |
| Request expiry | none | lapses after 7 days, requester told | Long enough that a holiday does not lose a request, short enough that the queue is not archaeology |
| Calendar feed horizon | none: no calendar was ever built | 26 weeks ahead | How far a subscribed phone carries bookings. A feed is polled forever, so the bound is what stops it growing without end (RM-7) |
| Availability sweep bound | 1,000 rows (old app) | 1,000 rows, refusing rather than truncating | A technical guard rather than a policy number: a sweep that silently returned half the bookings would show a taken slot as free |
| Recurring series maximum | 12 occurrences (UI) / 52 (API) | 12 | |
| No-show ladder | none | recorded at 2, pre-approval required at 3 | Constraint 2 of the old policy doc, now real. Not "per term": no term dates exist anywhere in the system (0034), so the reach is the window below |
| No-show window | none | 365 days, and it clears at the committee year end | Whichever reaches less far back. A member does not carry a first-term no-show into the summer, and the handover wipes the slate |
| Notice for a room we do not manage | 4 working days, by convention | 3 working days, counted from the member's ask | Working days exclude Saturdays, Sundays and bank holidays; the booking itself may still be for one of those days, because only the gap before it is judged. Owner: IT Manager, from the Theatre Manager's account of the form (C-121, 0038) |
| Booking purposes | none: the old app asked what a booking was called, never what it was for | rehearsal, meeting, workshop, audition, read-through, get-in, social, storage | What a room is needed for, which is what makes an SU room suitable or not (C-119). Distinct from priority |
| Priority tiers | production > committee > rehearsal > general (unenforced) | as stated, with bumping and notification | |
| Opening hours per room | none | per-room, set in session | Held on the room rather than in settings, so a room can be renamed or archived with them (0025, C-101) |
| Training expiry warning window | 60 days | 60 days | Final warning at 14 days |
| Academic year boundary | 31 August | **30 September** | Changed from 31 August: the committee's own catalogue draft of 10 August 2026 defines an academic-year expiry as 30 September, and seven modules use it. A day that exists in every year, so never 29 February. The carry-over window keeps its old value but is a setting rather than a constant, and an award inside it rolls to the following year |
| Session sign-up close | none: the old app took sign-ups until the door | 24 hours before the session starts | New setting. The session day arriving closes sign-up anyway, so this is only how much *more* notice a trainer wants; anything shorter than the gap from midnight to the start has no effect. Owner: IT Manager |
| Session edit window | 14 days | 14 days | Now enforced: past it a marked register can only be corrected by an administrator revoking the record and granting it again (G-114) |
| Register nag cadence | from day 2, weekly, stop at 60 days | unchanged | |
| Expiry sweep armed | none: the old app sent from day one | **off**, armed deliberately | New setting. The sweep computes and reports what it would send until somebody turns it on, so arming it later still warns everybody who was due. Turning it on is a settings change and is audited. Owner: IT Manager |
| Notification ledger retention | none: the old app kept everything | 24 months | New setting. The ledger holds the claims that stop a warning being sent twice, so it is evidence rather than logging; pruned in every mode, armed or not |
| Shift eligibility mapping | none: the old estate faked this with a 45-second cached call to stage-door and admitted everyone on failure | none confirmed; ships refusing every role until named | Three settings, one per shift role (duty manager, door, bar), each naming the training module that gates it. Until the session names them, the shift list refuses eligibility rather than admitting everyone, which is the safer failure (E-103 criterion 4, module E open question 2) |

## Session 3: people, communications and cutover (60 minutes)

| Setting | Current folklore | Proposed default | Notes |
| --- | --- | --- | --- |
| Membership year and evidence | SU records, manual | Manual grant, plus a hand-uploaded SU export where available (SP-2: no automatic access) | |
| Notification topics | per-app ad hoc | bookings, shifts, training, rooms, announcements | Fixed in the schema rather than configured; changing the list is a migration (0025) |
| Membership grace window | none: nobody tracked an expiry | 14 days past expiry still counts | Owner: IT Manager. A renewal in hand should not be a refusal at the desk (0031) |
| Membership renewal notice | none | remind 21 days before a person's own expiry | Owner: IT Manager. Each membership has its own date, so this is not a year-end chase |
| Retention periods | 2 years full accounts, 3 years guests (dry-run) | unchanged, armed in December | |
| Unverified account expiry | none: an unproven address held an account forever | 30 days, then anonymised, capped at 200 a run | Owner: IT Manager. An account that never proved its address cannot sign in and expires on its own rule (0026) |
| Night report recipients | configured list | confirm the list | |
| Role vocabulary mapping | four namespaces | one officer model, mapping table agreed in session | Needed by the Phase 1 import |
| Cutover communications | none | announcement plan for members and audiences | Who says what, when |

## Standing rule

Any value not settled in a session gets the proposed default and a named owner; absence of a
decision does not block the gate, it ships the default.

The proposed values are shipped in `shared/utils/config.ts`, one validated key each, and a workshop
amending one is a settings change rather than a release (0012, 0019). Two rows above have no
proposed value: the night report recipients, which ships unset until a session confirms it, and
the shift eligibility mapping, which ships a default of null per role, refusing rather than
guessing until a session names each module (0019, E-103).

Three rows are decisions the committee still makes and settings the system does not hold: the pass
products and the per-room opening hours are records rather than rules, entered through the screens
that own them, and the notification topics are fixed in the schema (0025). The role vocabulary
mapping is the migration's, in `migration/role-map.json`, and is not a runtime setting either.
