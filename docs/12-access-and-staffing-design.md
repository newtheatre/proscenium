# Access needs, show staffing and end-of-night — design

**Status: agreed, not yet built.** Drafted August 2026 by Matt Adcock (ITM 26/27); agreed
2026-08-21 and reconciled against the code the same day. Companion to the
[show night screen design](./11-show-night-screen-design.md), which consumes all three systems
designed here, and to the [bar design](./13-bar-design.md), which consumes the rota's `BAR` shift
and feeds the end-of-night report. **§5 is the programme order for all three documents**, and the
issue tracker mirrors it.

**Pending committee input:** access ticket pricing (whether access tickets differ from standard
and whether essential companions are free). Everything here parameterises price rather than
assuming it, so the design does not block on that conversation.

## 1. Why these three things are one document

The access system's consent model is "the people working that night can see my needs". That is
only enforceable if the system knows who is working that night — so the staffing record is a
*prerequisite* of the access system, not a separate feature. And once the system knows who the
duty manager is, the end-of-night report has an author and a recipient. The three designs form
one dependency chain, so they are specified together.

## 2. Access needs

### 2.1 Principles

- **Account-level, verified once.** Needs attach to the user account, not to a booking. One
  verification conversation, then every future booking just works.
- **Structured, not free-form.** Needs are recorded as the nine Access Card symbols (see §2.2),
  because they are operational statements ("needs level access") rather than medical ones. We
  never record a diagnosis.
- **Consent-gated.** Nothing is visible to show-night staff without the user's explicit,
  recorded consent, and then only to people rostered on a performance they hold a booking for.
- **Evidence is viewed, never stored.** The FOH manager looks at whatever the person offers and
  records only the conclusion. No documents, card scans or letters enter the system, ever.

### 2.2 The Access Card as vocabulary

The [Access Card](https://www.accesscard.online/how-it-works/) (Nimbus Disability, £15/3 years,
with a free Digital Access Pass tier) encodes needs as nine symbols: difficulty standing,
difficulty with crowds, level access, distance, urgent toilet needs, essential companion(s)
(+1/+2), visual information, audible information, and miscellaneous. We adopt these symbols as our
schema whether or not the person holds a card — a card holder is verified by reading their card; a
non-holder is verified by conversation and the FOH manager's judgement, recorded in the same
symbols. **Holding a Nimbus card is a fast path, never a requirement** — not everyone who needs a
companion seat has £15 and a registration.

**The wording is ours; the vocabulary is theirs.** The symbols are stored under the Access Card's
names, but presented as *what someone finds difficult* rather than what they would like provided.
That is not decoration. "Visual information" reads as a preference, so a deaf person will reasonably
tick it — it is what they *want* — when the symbol means the opposite. Every label is therefore
phrased "I find it hard to hear spoken announcements", "I find it hard to read printed information",
and so on.

The ninth symbol, *miscellaneous*, is not offered as a tick at all. A checkbox called "something
else" tells the verifier nothing, so it is replaced by a free-text box: **what you need from us,
rather than why**. That text (`requesterNote`) goes to the verifier for the conversation and is
**never shown to the door** — the door sees the symbols and the agreed `fohNote`, which is the
distinction that keeps a diagnosis out of a foyer.

Nimbus [registers venues free of charge](https://www.nimbusdisability.com/services/access-card-and-nos/)
and offers card-number verification to registered venues (there is also a ticketing API). Action
for the FOH manager: register the theatre and confirm the exact verification mechanism. Until
then, sight of the card (physical or in the holder's app) is sufficient.

### 2.3 Data model

```
access_profiles
  userId            UNIQUE FK → users        -- one profile per account
  status            PENDING | VERIFIED | EXPIRED | DECLINED | WITHDRAWN
  accessCardNumber  nullable                 -- recorded only if the holder offers it
  needs             the nine symbol flags
  companions        0 | 1 | 2                -- essential companion entitlement (+1 / +2)
  fohNote           short staff-facing text, written *with* the user, visible *to* the user
  consentFohAt      timestamp of explicit consent (null = no consent, nothing shown to FOH)
  verifiedByUserId, verifiedAt, expiresAt
```

`fohNote` is for operational lines like "transfers from chair to aisle seat; chair stored at kiosk"
— agreed wording, no surprises for the person it describes. `expiresAt` follows the card expiry
where there is a card, otherwise three years, matching the card's own cycle.

### 2.4 Verification workflow

1. User requests verification from their account page (ticks needs, optionally gives a card
   number, gives consent — see §2.5). Profile → `PENDING`.
2. Notification goes to a new **`access@newtheatre.org.uk`** alias (routing into the existing
   Workspace/GAM setup), read by the FOH manager. A dedicated alias rather than `boxoffice@`
   because these emails can contain health-adjacent conversation and deserve a narrower audience;
   it also gives the theatre a public access contact address, which it should have anyway.
3. FOH manager verifies: Nimbus card number (once venue registration exists), sight of card, or
   their own judgement from a conversation. They set the symbols, companion count and note, and
   mark `VERIFIED`.
4. Confirmation email to the user stating exactly what was recorded and what it entitles them to.

Verification is a new permission, **`access.verify`**, declared in `shared/utils/appManifest.ts`
and carried by a role granted to the FOH manager. It is deliberately *not* bundled into
`BOX_OFFICE`, because seeing access profiles outside show night should be a one-or-two-people
privilege. Permission keys in this app are dotted and role-mapped in the manifest; there are no
ad-hoc ability strings.

### 2.5 Consent and GDPR

Access needs are health-adjacent — treat them as **special category data** and take the strict
path ([ADR-0022](./decisions/0022-access-needs-are-special-category-data.md)): lawful basis is
explicit consent (UK GDPR Art 9(2)(a)), collected at request time with copy
along the lines of *"the staff team working any performance you book will be able to see your
access requirements on the night, so they can meet them."*

- **Visibility rule, enforced server-side:** a user's needs are visible only to (a) staff with a
  confirmed shift on a performance the user holds a booking for, on the day of that performance,
  and (b) the holders of the verify ability. Nobody else, including general `BOX_OFFICE`. The
  code-authenticated backstage page (show night screen design §5) can never see access data —
  its session type has no path to it.
- **Withdrawal:** a "remove my access profile" action on the account page, no questions asked.
  Status → `WITHDRAWN`, needs data deleted, any future bookings simply stop offering access
  ticket types. Already-booked £0 companion tickets stay valid — withdrawal is not a penalty.
- **Retention:** profiles expire with `expiresAt`; expired and withdrawn profiles are swept on the
  same cycle as the guest-account sweep. Add a line to the Workspace & Data Retention Policy
  naming this data, its basis, and its retention.
- **The estate hooks are part of this feature, not follow-up work.** An access profile is personal
  data this app holds, so `access_profiles` joins the subject-access `export` hook, is **deleted**
  rather than merely anonymised by the `anonymise` hook, and both of its user columns join
  `mergeUser` ([ADR-0025](./decisions/0025-every-user-reference-joins-the-estate-hooks.md)). A
  profile that survives an erasure is the worst bug this system can have.
- **The end-of-night report never contains needs data** — counts only (§4.3).

### 2.6 Access ticket types and booking

Two new ticket types, priced by the committee (parameterised, like every other price in the
override chain — see [06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md)):

- **Access** — the holder's own ticket. Likely standard price; exists as a distinct type so the
  booking is *flagged* and reportable, not to change the money.
- **Essential companion** — expected £0, up to `companions` per performance for that profile.

Gating, in one server-side function (`canBookAccessTickets(user, performance)` — same single-copy
discipline as `canRedeem` in the passes design): available only to logged-in users with a
`VERIFIED`, unexpired profile; companion count capped by the profile.

**The cap is per performance, counted across every booking**, not per basket. It returns what is
*left* at that performance, so a second booking cannot spend an entitlement the first already used.
An access ticket is the holder's own seat, so it is capped at one per performance on the same
count. Editing a booking excludes that booking's own tickets, because the basket replaces them
rather than adding to them, and a `CANCELLED` or `NO_SHOW` booking gives the entitlement back. Guests cannot book them —
verification is account-level, which is the point (and consistent with passes' account-binding).
Box office staff can add them to a walk-in or phone booking against a looked-up verified account.

Both are ordinary `SINGLE` ticket types in the existing `kind` enum, because both occupy a seat.
So every path that creates one calls `assertCapacity`, the £0 companion included
([ADR-0007](./decisions/0007-one-seat-counting-rule.md)). A free ticket is still a seat.

On the show night screen: **Tonight at a glance** gains its "Access tonight" block for real —
first name, party size, symbols and note for each consented access booking — and the scanner
result shows the symbols on scan. Both surfaces obey the §2.5 visibility rule.

### 2.7 Deliberately out of scope for v1

Per-venue wheelchair-space capacity (the auditorium has finitely many chair positions; for now the
"Access tonight" readout plus human judgement covers it — flagged as a future refinement), relaxed
performance scheduling, and any Nimbus API booking integration.

## 3. Show staffing and the volunteer rota

### 3.1 What a duty manager is

The **duty manager (DM)** is the named person in charge of front of house for one performance: the
person the door defers to, the owner of any incident, the one who makes the "do we hold the house"
call, and the one who closes the night (§4). Today this role exists informally — someone from
committee is "on" — with no record of who. This design makes it a recorded, per-performance
assignment. **Exactly one confirmed DM per performance** is the invariant; the admin screen warns
loudly about any performance inside 7 days without one.

### 3.2 Model

```
performance_shifts
  performanceId  FK
  role           DUTY_MANAGER | DOOR | BAR      -- extensible; FOH roles only for now
  userId         nullable FK → users            -- null = open slot
  status         OPEN → CLAIMED → CONFIRMED  (| DECLINED)
  assignedByUserId, timestamps
```

A shift template per venue/performance-type (e.g. 1 DM + 2 door + 1 bar) stamps slots onto new
performances automatically, so publishing a rota is zero-effort by default.

### 3.3 The rota, self-service

Chosen scope: a full volunteer rota, not just a staffing record.

- **Members see** an upcoming-shifts page: performances, open slots, who's already on.
- **Claiming:** any member with an account can claim `DOOR`/`BAR`; `DUTY_MANAGER` is claimable
  only by users the training system reports as eligible. **That system exists and is live** —
  this is the correction that most changes the build. `rehearsal` (`training.newtheatre.org.uk`)
  answers `GET /api/v1/eligibility/:key?userId=` with `{ eligible, missing, expiring }`; its rules
  are committee-editable data rather than code (its ADR-0006); and its `docs/consuming-the-api.md`
  already names this rota as the reference consumer, down to the seam's name. Three consequences:
  the rule keys `duty-manager`, `door` and `bar` are **created in rehearsal's admin UI, not here**;
  every call goes behind one seam, `isEligible(userId, ruleKey)`, so the rota never encodes what a
  rule requires; and the failure direction when the API is unreachable is a choice this repo must
  state, document and test, which it does in
  [ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md).
- **Confirmation:** claims either auto-confirm or require FOH-manager confirmation — a per-season
  toggle, because trust levels differ year to year. The manager can always assign, reassign or
  bump directly.
- **Reminders:** email the day before (existing Resend machinery) with an ICS attachment. A claim
  is a promise; the reminder is the system keeping its half.
- **Show night:** being `CONFIRMED` on tonight's rota is what scopes the FOH screen — it is the
  membership test for the access-needs visibility rule (§2.5), it puts your name in the incident
  log and backstage messages, and it lists you in "who's on tonight" under Contacts.

Deliberately not built: shift swaps (reassignment via the manager covers it), hours tracking,
and any rota for backstage/tech crew — that belongs to each production, not to FOH. (Backstage
crew reach the comms board via the nightly code — show night screen design §5 — which is
accountless and night-scoped by design, not rostered.)

### 3.4 Roles and abilities

The `FRONT_OF_HOUSE` role (show night screen design §4) is *held* as a role but *scoped* by the
rota: rostered tonight → tonight's performances light up; not rostered → the screen politely shows
nothing, and says why. `BOX_OFFICE`+ bypasses the rota scope as now. Enforce the scope server-side;
the reasoning, and why the rota rather than the role is the real boundary, is
[ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md).

The FOH manager gets rota administration (**`shift.manage`**) and access verification
(**`access.verify`**), both declared as permission keys in `shared/utils/appManifest.ts`.
Backstage is deliberately not a role at all: it is a code-granted session type with a far smaller
ability set, specified in the show night screen design §5 and
[ADR-0020](./decisions/0020-backstage-joins-by-a-nightly-code.md).

## 4. The end-of-night report

### 4.1 Trigger

A **Close the night** action inside Tonight at a glance, visible to tonight's DM (and
`BOX_OFFICE`+). It runs a short checklist — no-shows released, incidents reviewed, anything to
add — then generates the report, stores it, and emails it. Closing the night also revokes all
backstage code sessions for the performance (show night screen design §5.1). If nobody closes
the night by noon the next day, a scheduled job auto-closes with the banner
*"auto-closed — no duty manager sign-off"*, so gaps are visible rather than silent.

### 4.2 Recipients

The DM who closed it, `boxoffice@` (the standing archive), and the IT Manager/Archivist (review
copy while the system beds in — expect to drop this one after a term). Stored in a
`performance_reports` table regardless, so the email is a courtesy copy of a record, not the
record itself.

### 4.3 Contents

Attendance (sold / collected / no-shows / walk-ups / pass admissions), takings summary at
whatever detail the committee is happy landing in a DM's inbox, **access bookings as counts only**
(never needs or names — §2.5), the incident log entries in full, the night's timing milestones
from the backstage comms presets (clearance, house open, show start, interval, end — the theatre's
first curtain-up data; see show night screen design §5.5), who was rostered and who actually
worked, and the DM's closing note. One screen of email; the point is that the next person can
reconstruct the night without asking anyone.

## 5. Programme order

This is the build order for **all three designs** (11, 12 and 13), because they interleave: the
rota gates the FOH screen, the FOH screen hosts the bar, and the end-of-night report cannot be
written until the things it aggregates exist. Each row below is one pull request. The issue
tracker mirrors this table, one issue per row, under three tracking issues.

Two tracks have no dependencies at all and can be picked up by anyone at any time: **D1**
(emergency and contacts) and **G1** (Challenge 25). If someone has an afternoon and no context,
point them at those.

### A. Foundations

| # | Pull request | Why first |
|---|---|---|
| A1 | A CI check that every user-referencing column is wired into the estate hooks | These three designs add roughly twenty user references to an app that has four. The hooks are enumerated by hand, so the twenty-first will be forgotten. [ADR-0025](./decisions/0025-every-user-reference-joins-the-estate-hooks.md) |
| A2 | `FRONT_OF_HOUSE` role and the `shift.manage`, `access.verify`, `bar.manage` permission keys in the manifest | Everything after this guards on them. Small, and it is the change the auth service has to see first. [ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md) |

### B. The rota (§3) — blocks C, F and G

| # | Pull request | Notes |
|---|---|---|
| B1 | `performance_shifts`, shift templates, manager assignment, the admin screen, the one-confirmed-DM invariant and the 7-day warning | Ship assignment-by-manager alone; it is useful the day it lands |
| B2 | The `isEligible(userId, ruleKey)` seam against rehearsal's API | [ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md). Needs a service token and the rule keys, both prerequisites in rehearsal |
| B3 | Self-service claiming: the members' upcoming-shifts page, claim and confirm, the per-season auto-confirm toggle | The claim filter consumes B2 |
| B4 | Day-before reminder email with an ICS attachment | Existing Resend machinery |

### C. The show night shell (11 §6)

| # | Pull request | Notes |
|---|---|---|
| C1 | The `/foh` route, its six-button home, and the rota scope enforced server-side | Consumes B1 |
| C2 | QR in the confirmation email, and the `/t/<ref>` redirect | Independent of C1; touches the email templates |
| C3 | The scanner, the role-aware result, and the one shared paid/unpaid function | The function is shared with the till (13 §2.1) and must not be written twice |

### D. Show night surfaces (11 §2)

| # | Pull request | Notes |
|---|---|---|
| D1 | Emergency page (cached, works with no signal) and contacts, plus the append-only incident log | **No dependencies.** Could be the first thing built |
| D2 | Tonight at a glance: the numbers and the show info card | Pass pressure lands with the passes build; Access tonight with F3 |

### E. Backstage comms (11 §5)

| # | Pull request | Notes |
|---|---|---|
| E1 | The nightly code: generation, hashed storage, joining, rate limiting, the device list, the kill switch | [ADR-0020](./decisions/0020-backstage-joins-by-a-nightly-code.md) |
| E2 | The board: presets both ways, acknowledgements, the polling endpoint, the backstage display and performance mode | [ADR-0021](./decisions/0021-show-night-comms-poll-rather-than-hold-a-socket.md) |
| E3 | The timing record from preset transitions (§4.3, 11 §5.5) | Feeds H1 |

### F. Access needs (§2)

| # | Pull request | Notes |
|---|---|---|
| F1 | `access_profiles`, the account-page request flow, consent capture, withdrawal, retention | [ADR-0022](./decisions/0022-access-needs-are-special-category-data.md). Needs the `access@` alias, a process step doable today |
| F2 | The verification surface behind `access.verify`, and the confirmation email | |
| F3 | The visibility rule server-side, the Access tonight block, symbols on scan | Consumes B1 and C3 |
| F4 | The Access and Essential companion ticket types, and `canBookAccessTickets` | **Blocked on the committee's pricing decision** (§6) |

### G. The bar (13 §7)

| # | Pull request | Notes |
|---|---|---|
| G1 | Challenge 25: append-only `age_checks`, the trigger, the tally, the form, the register export | **No dependencies** beyond the FOH shell. Ship it before Freshers' if the paper book is the priority |
| G2 | The catalogue: categories, products, date-effective prices, discounts | |
| G3 | **The payment record**: `transactions` and `transaction_lines`, collection and walk-up refactored into statement builders, the desk writing through, desk parity | [ADR-0023](./decisions/0023-money-taken-is-recorded-as-a-transaction.md). The riskiest change in the programme, and reviewable alone |
| G4 | The till: two tabs over one basket, tenders, the per-night session, the per-day reconciliation | Consumes G2 and G3 |
| G5 | Comps: the request, the duty manager's approval, expiry | Consumes G4 and B1 |
| G6 | Stock: the movements ledger, deliveries, par flags, stocktakes, variance | |
| G7 | Reports and exports | |
| G8 | The shift-scoped FOH home and the training soft gate | Consumes B2 |

### H. End of night (§4)

| # | Pull request | Notes |
|---|---|---|
| H1 | `performance_reports`, Close the night, the checklist, revoking backstage sessions, the report itself | Last by construction: it aggregates D1, E3, G4 and the rota |
| H2 | The noon auto-close job and the "no sign-off" banner | |

### Prerequisites outside this repo

None of these are code, and all of them will be discovered mid-build if they are not done first.

| What | Where | Blocks |
|---|---|---|
| Create the `door` and `bar` eligibility rules; confirm what `duty-manager` requires | rehearsal admin UI | B2, B3, G8 |
| Issue Proscenium a training API service token, and add it as a worker secret | rehearsal operations, then Cloudflare | B2 |
| Add access profiles and backstage messages to the Workspace & Data Retention Policy | stage-door `docs/gdpr-retention.md` | F1, E2 |
| Create the `access@newtheatre.org.uk` alias | Workspace/GAM | F1 |
| Register the theatre with Nimbus and confirm the verification mechanism | FOH manager | F2 (soft: sight of card works meanwhile) |
| Decide access ticket pricing and companion policy | Committee | F4 |

## 6. Open questions

- **Committee:** access ticket pricing, and companion policy (£0 assumed here). **The mechanism is
  built and does not wait on this**: both types are ordinary ticket types carrying an `accessKind`,
  so the price is a number an admin sets through the usual override chain. What is outstanding is
  the number, not the code.
- **Nimbus venue registration** — who signs up, and what verification mechanism we actually get.
- **DM eligibility** — which modules the `duty-manager` rule requires, and what the new `door` and
  `bar` rules require. This is committee policy expressed as data in rehearsal's admin UI, not a
  question for this repo (§3.3).
- **Wheelchair-space capacity per venue** — revisit once real bookings show whether human
  judgement suffices.
- **Claim confirmation default** — auto-confirm vs manager-confirm for the first season.
