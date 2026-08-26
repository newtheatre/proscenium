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
| Pass products for 2026/27 | set yearly | to be listed in session | Names, prices, caps, covered shows |
| Bar tab cap | £20 soft nag | £20 hard cap, manager override | Old soft cap never blocked |
| Discount codes | none | none at launch | Capability exists, unused until wanted |
| Season boundary | 1 August to 31 July | unchanged | Drives reporting and role expiry |

## Session 2: spaces and training (90 minutes)

| Setting | Current folklore | Proposed default | Notes |
| --- | --- | --- | --- |
| Room minimum booking | 30 minutes (policy doc, unenforced) | 30 minutes | |
| Room maximum booking | 4 hours (unenforced) | 4 hours, admins exempt | |
| Advance notice | 4 working days (unenforced) | 48 hours for auto-approval; shorter goes to the queue | The old rule was widely ignored; pick one that will be kept |
| Booking horizon | none | end of current term | |
| Active bookings per member | 10 (unenforced) | 10, series counts each occurrence | |
| Recurring series maximum | 12 occurrences (UI) / 52 (API) | 12 | |
| No-show ladder | none | recorded at 2, pre-approval required at 3 per term | Constraint 2 of the old policy doc, now real |
| Priority tiers | production > committee > rehearsal > general (unenforced) | as stated, with bumping and notification | |
| Opening hours per room | none | per-room, set in session | |
| Training expiry warning window | 60 days | 60 days | Final warning at 14 days |
| Academic year boundary | 31 August | 31 August | Carry-over window stays a 60-day constant |
| Session edit window | 14 days | 14 days | |
| Register nag cadence | from day 2, weekly, stop at 60 days | unchanged | |
| Practice window grace | 4 hours | 4 hours | Flagged as a guess in the old docs; confirm |

## Session 3: people, communications and cutover (60 minutes)

| Setting | Current folklore | Proposed default | Notes |
| --- | --- | --- | --- |
| Membership year and evidence | SU records, manual | Manual grant, plus a hand-uploaded SU export where available (SP-2: no automatic access) | |
| Notification topics | per-app ad hoc | bookings, shifts, training, rooms, announcements | Transactional always delivers |
| Retention periods | 2 years full accounts, 3 years guests (dry-run) | unchanged, armed in December | |
| Night report recipients | configured list | confirm the list | |
| Role vocabulary mapping | four namespaces | one officer model, mapping table agreed in session | Needed by the Phase 1 import |
| Cutover communications | none | announcement plan for members and audiences | Who says what, when |

## Standing rule

Any value not settled in a session gets the proposed default and a named owner; absence of a
decision does not block the gate, it ships the default.
