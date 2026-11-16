# Box office, payments and ledger (workstream 4) consistency findings

Reviewer: area owner for `docs/specs/box-office-payments-ledger/`. All 11 files read in full; Foundations `02-formats.md` (all rulings), foundations prefix index, core, identity, forms, interface (journeys, shells, wireframes, navigation) and the design paper (catalogue, roadmap, decisions, status, backlog) checked on shared ground.

Path shorthand used below (all under `/home/user/proscenium/docs/`):
BO = `specs/box-office-payments-ledger/`, FND = `specs/foundations/`, CORE = `specs/core-domain-and-public-site/`, ID = `specs/identity/`, FORMS = `specs/form-builder/`, UI = `specs/interface-and-wireframes/`, PAPER = `design-paper/`.

## Summary

Counts: 8 HIGH, 31 MEDIUM, 13 LOW (52 findings; F49 and F54 were withdrawn on re-check and their numbers are unused).

The three most important:
1. **F1 (HIGH).** The settle batch guards the claims on `held`, but a reserved order's claims are already `confirmed`. Taken literally, every reservation paid at the desk fails its own assertion and is auto-refunded as "money arrived after the seats had gone".
2. **F2 and F3 (HIGH).** The refund rules contradict themselves. A CHECK `approved_by <> requested_by` makes the self-approve limit unusable, and the counter trigger subtracts on `declined`, which never added.
3. **F7 and F8 (HIGH).** Shared names that will not build. The Interface navigation uses `box-office.order.read` (the spec says `.view`) and puts the Door in the Live shell (`/live/door`) while the spec puts it in the console. Orders have a nullable `account_id` without the `unlinked` declaration the Foundations schema check demands.

The rest is mostly stale wording left behind by the 16 November rulings: counts, "waits on" statuses, the withdrawn `eligibility` point, the removed income setting and the first version of consent. The core, identity and Interface contracts the spec relies on are only partly mirrored back, and Box office declares few of the contributions the others expect.

---

## HIGH

### F1. HIGH. Reserved order's claims vs the settle batch
- A: BO/04-states-and-rules.md:66 (basket to reserved, Effects): "Claims held to confirmed; lines fix their price rows; order gets its reference and desk code ... No payment intent, no tickets, no ledger posting".
- B: BO/04-states-and-rules.md:216 (settle batch, "ordinary settle batch" reused by reserved at :69): "4. Every claim of the order to `confirmed`, guarded on `held`. 5. An assertion that step 4 changed exactly as many claims as the order has ticket lines." Then :226: a failed step-4 assertion is the "Money arrives after the seats have gone" path, so intent `unfulfilled` and an automatic full refund.
- Also: :76 "A reserved order claims seats exactly as a paid one does", yet a paid order's claims are `held` with an `expires_at` until settle (BO/03-data-model.md:183). The hold-kind table (04:145-150) has no kind for a reservation, and `box_office_holds.kind` (03:168) has only `basket, payment, staff, waitlist_offer`.
- Prevail: the reservation rules are newer and are the intent. Decide and write down the claim state and hold kind of a reserved order (either `confirmed` with no expiry, as :66 says, or a new hold kind). Then change step 4 to "guarded on `held` or, for a reserved order, `confirmed`", with the assertion counting both. Add a never-regress case for "reserved, then paid at the desk, ends confirmed with no unfulfilled intent".
- Owner: BO 03 and 04.

### F2. HIGH. The refund CHECK forbids the self-approve limit
- A: BO/03-data-model.md:531: "`approved_by` ... **CHECK (approved\_by IS NULL OR approved\_by <> requested\_by)**".
- B: BO/04-states-and-rules.md:233: "the approver is not the requester (the CHECK), unless the amount is at or under `payments.refunds.self-approve-up-to`"; :239 "A refund at or under the self-approve limit moves from requested to approved in one step"; BO/07:54 `payments.refunds.self-approve-up-to` ("Largest refund one person may request and approve alone"). Test BO/09:59 "refused above the limit by ability and by CHECK".
- A table CHECK cannot read a setting, so a one-person approval under the limit is refused by the database. Settings, stories (Q5 decided A) and the rule all say it must be allowed.
- Prevail: the decided behaviour (Q5 A). Replace the CHECK with a guard in the transition, for example a guard row or trigger that reads the limit stored on the refund when it is requested, or let the requester equal the approver only when `approved_by` is recorded with a `self_approved` flag whose use is bounded by a stored limit. Fix the test wording.
- Owner: BO 03, 04, 09.

### F3. HIGH. Refund counter trigger subtracts on `declined`
- A: BO/03-data-model.md:534: "a refund entering `approved` adds its amount to the attempt's `refunded_minor`; one entering `failed` or `declined` subtracts it."
- B: BO/04-states-and-rules.md:237: "requested to declined | By an approver, with a reason code". A declined refund goes from `requested`, so it never added anything, and subtracting would break `CHECK (refunded_minor >= 0)` or silently free someone else's refund allowance. Only `sent to failed` (:236) should subtract.
- Also unspecified: the same counter on `payments_intent_parts.refunded_minor` (03:419; 04:94 "kept per part as well as per intent"). Only the attempt trigger is described.
- Prevail: the state table (04). Fix the trigger to "`failed` subtracts" and say which trigger keeps the part counter.
- Owner: BO 03.

### F4. HIGH. Interface and box office disagree on the door's shell, route and navigation entry
- A: UI/05-3-key-journeys.md:12: "| 4 | Scan at the door | Front-of-house volunteer | Live | Phone | W5 |"; UI/05-1-shells-and-navigation.md:56: "Door, till, tonight board and checklists belong to live mode"; :94 "`/live` | Live mode | `/live/door`"; UI/04-interface-to-other-modules.md `shell`: "`live` is a tile on the Tonight hub".
- B: BO/06-screens.md:80 "## Console shell: the door", :53 "Door | `/console/box-office/door/<performance>`", :54 "Door list | `/console/box-office/door/<performance>/list`". BO/05-interface-to-other-modules.md:93 lists the Door among box office's console entries.
- Also, Interface contradicts itself on the desk: UI/05-3-key-journeys.md:11 "Sell at the desk ... Console | Laptop" and UI/05-1:56 "Desk sales belong to the console", against UI/05-4-wireframes.md:29 "The desk is a Live page: the sidebar is gone". BO follows journey 3 (06:126). BO also says at :75 that the "Door runs in live mode, dark" (06:159 "Agrees"), which does not match its own `/console` route.
- Prevail: Interface (owner of shells), plus the Foundations rule that a navigation entry's `to` sits under its shell's prefix. Door and door list become `/live/box-office/...` (or `/live/door/<performance>`), contributed with `shell: 'live'`; the sheet heading changes. Interface must first settle whether the desk is Console or Live; Box office then follows.
- Owner: BO 05 and 06; Interface 05-4 W4 vs 05-3 journey 3.

### F5. HIGH. Ability name and nav count in Interface's contract example
- A: UI/04-interface-to-other-modules.md:38: "ability: 'box-office.order.read'" and :40 "count: 'box-office.refunds-awaiting'" (for the entry `to: '/console/box-office/orders'`).
- B: BO/07-settings-and-abilities.md:93 declares `box-office.order.view`; BO/06:51 Orders screen uses `box-office.order.view`. There is no `.read` anywhere in BO, and no count named `box-office.refunds-awaiting`. Refunds awaiting approval are Payments' (`/console/payments/refunds`, `payments.refund.approve`).
- Prevail: Box office owns its ability names. Interface example to use `box-office.order.view` and a Payments count (`payments.refunds-awaiting`). Box office should also declare the count it registers (Interface 05-1:109 "Counts are opt-in").
- Owner: UI 04; BO 05 (declare the count and its home).

### F6. HIGH. Nullable account subject on orders needs `unlinked`, and the "anonymous desk sale" is still described as unresolved
- A: FND/02-formats.md:163: "The schema check refuses a nullable account subject without it" (`subject: { account: 'account_id', unlinked: 'staff' }`); :139 "Rows holding money, a ticket or a booking key to an account, which may be unclaimed."
- B: BO/03-data-model.md:202 `account_id` "null for a basket not yet checked out and for an anonymous desk sale"; :216 "An order with no account is valid in exactly one case: a desk sale ...". The words table (03:33) gives orders subject `account_id` with no `unlinked`. ID has no record of an anonymous order (ID/05:51 gives only "A person with no address (a name on the door list): an unclaimed account with no address"). BO/01-overview.md:73 still lists as an open wait "Identity: whether an anonymous desk sale may have no account"; BO/02-scope.md:47 "Open: an anonymous desk sale with no account"; BO/05:198 "Assumed".
- Prevail: Foundations' schema check, plus Identity's existing no-address account. Either declare `unlinked` on `box_office_orders` and list it in Identity's manual-step checklist, or drop the exception and make a desk sale with no details use an unclaimed no-address account (which also removes the extra CHECK and the "appears in no audience source" caveat). Needs Matt or integration to choose; either way the three "waits on" statements must change to "decided".
- Owner: BO 01, 02, 03, 05; ID 05 (record the ruling).

### F7. HIGH. `payments_intents` still carries owner columns, and the base service and point contracts predate parts
- A: BO/03-data-model.md:419: "`owner_module` and `owner_record` (internal; moved here from `payments_intents`, which no longer has them)". Also BO/09:120 "cannot leave `created`".
- B: BO/03-data-model.md:471: `payments_intents` still lists "`owner_module`, `owner_type`, `owner_id` | ... unique together among open intents". The state list (03:475; 04:193) has no `created`, only `open, succeeded, cancelled, expired, unfulfilled`. BO/05-interface-to-other-modules.md:31 `createIntent(uow, { owner, amount, ... })` "One open intent per owner"; :59 `settle(uow, intent)`, `cannotSettle(intent)` and `refunded(uow, refund)`, against :292 `settle(unit, part)` and `refunded(unit, part, refund)` (no `cannotSettle`; "unit" vs "uow"); :35 `requestRefund(... attemptId, amount, owner ...)` has no part although `payments_refunds` gains `part_id`.
- Another loss: the uniqueness "one open intent per owner" lived on `payments_intents`. The part table's unique key (`intent_id`, `owner_module`, `owner_record`) is per intent, so two open intents for one order are no longer prevented, and `box_office_orders.intent_id` can point at only one.
- Prevail: the later (parts) design, since Bar and Membership contract against it. Rewrite the intents table, `createIntent` (takes `parts`), the first settlement row, `requestRefund` (takes `partId`) and the test wording ("leave `open`"). Restate where the one-open-intent-per-owner guarantee lives.
- Owner: BO 03, 04, 05, 09.

### F8. HIGH. Id-prefixed secret: ticket code stored in the clear
- A: BO/03-data-model.md:59: "a ticket's scan code, an order's link token and a waiting-list offer token are separate random values stored as hashes"; FND/06-interface-to-other-modules.md:96: "Anything that grants access by being known (... a scan code ...) is a separate random token on the row, stored hashed".
- B: BO/03:249 `box_office_tickets.code` "unique; 128 random bits; what the QR code carries with a signature" (plain, no hash); BO/03:338 `box_office_passes.code` "unique" (also plain). Orders (`link_token_hash`, `desk_code_hash`) and waiting-list (`offer_token_hash`) do follow the rule. BO/04:161 says the device manifest holds "code hashes", which implies the server holds hashes too.
- Prevail: Foundations rule and BO's own :59. Rename to `code_hash` (tickets and passes) and say how the server finds a ticket from a scanned code (hash then look-up).
- Owner: BO 03.

---

## MEDIUM

### F9. Stale counts and statuses in the overview and elsewhere
- A: BO/01-overview.md:15: "**Size:** 37 tables, 59 stories (51 in the first release), 52 named never-regress tests, 9 questions for Matt."; :76 "Nine questions"; BO/03-data-model.md:5 "Three modules, 37 tables"; BO/10-questions-for-matt.md:5 "Nine questions, most important first".
- B: BO/03:83 "A 38th table was added later the same day" and PAPER/12-build-backlog-and-glossary.md:112-114 (22 + 9 + 7 = 38); BO/08-stories.md:9 "67 stories ... 61 in the first release (17 of them Gate ...)" (checked: 46 BO + 7 PAY + 7 FIN + 7 R = 67; 17 Gate; PAPER/12:12 agrees at 67/17/44); BO/10:7 "All eleven questions are answered"; BO/09-test-plan.md names 52 cases in tables plus 1 (`online-order-always-has-an-account`) + 1 (`webhook-payload-carries-no-person`) + 10 reservation + 4 parts = 68, and BO/05:240 and :306 add 4 consent cases (not in 09) and 3 more by reference.
- Prevail: the content. Overview should say 38 tables, 67 stories (61 in the first release), a real count of never-regress cases (68 in part 8 alone; 75 with the part 4 additions, once they are moved into part 8), 11 questions. Part 9 line 5 "Nine questions" to "Eleven". Also 03:5 "37" to "38" and the overview Status row 9.
- Owner: BO 01, 03, 10.

### F10. Overview and proof statuses are out of date
- A: BO/01-overview.md:10 "A run on a deployed database is waiting on a yes from Matt."; :77 "Proof: last seat on D1 | Passed locally | Matt's yes to a run on a deployed database"; BO/11-proof-last-seat-on-d1.md:7 "It has not yet been run against a deployed D1 database; see Limitations."; :82 limitation "Local D1 only ... question for Matt (part 9)"; :83 "Modest volume".
- B: BO/11:9 "**Confirmed on deployed D1, 16 November:** the same 11 cases passed", :66 "The limitation 'not run on deployed D1' below is closed"; PAPER/11-design-stage-questions-and-status.md:20 "11 of 11 cases passed on a deployed D1 database"; BO/10:11 (Q1 answered A).
- Prevail: the deployed result. Update overview lines 10 and 77, proof line 7 and the first limitations row. Also PAPER/11:9 still says "D5 sits beside B1 as something only you can do: together they unblock the two remaining proofs" while B1 is answered and the proof is done.
- Owner: BO 01, 11; PAPER 11 line 9.

### F11. "Waits on / assumed / open" statuses that other documents have closed
- BO/01-overview.md:73 Part 4 "Waits on: Identity: ..." (see F6). BO/01-overview.md:74 Part 6 "Waits on: Workstream 2 for preset role names", but ID/07-settings-and-abilities.md:145-165 publishes the preset roles (see F23). BO/01:73 Part 5 "Workstream 6 for the shells and the look", but the shells are fixed (UI/05-1).
- BO/05-interface-to-other-modules.md:196-202 "What this workstream needs": "Sub-tab still empty; part 2 uses its own layout until then" (the Foundations data-class tab exists; BO/03:5 says the layouts "differ in wording only"); "Matches draft 1"; "Assumed"; "Agreed by relay".
- BO/05:204-208 "Points raised for the integrating thread" are all answered by rulings: the encrypted credential store (FND/02-formats.md:136 `credentials`; BO/07:151 uses it), erasable columns in append-only tables (FND/02-formats.md:138), and the self-committing service (see F13).
- BO/10-questions-for-matt.md:70 says "the provider contract keeps its `credentials` declaration", but the contract at BO/05:61-72 lists `secrets`, `setupStep`, no `credentials` member.
- Prevail: Foundations rulings and the later specs. Reword to "agreed"/"ruled", delete the three resolved points, and add `credentials` (optional) to the provider contract.
- Owner: BO 01, 05, 10.

### F12. `externalCall` is the one allowed self-committing exception, but BO declares two others
- A: FND/02-formats.md:111 "A service that writes adds statements to the caller's unit of work and never commits. This is the general rule for every cross-module write, not an exception"; :137 "`externalCall({ attempt, call, outcome })` is the one self-committing exception to the unit of work"; :199 `calls` section in the manifest, `externalCall(name, { reference, key?, attempt?, call })`.
- B: BO/05-interface-to-other-modules.md:40 and :208 "`startAttempt` and `answerAttempt` commit themselves ... This is the one exception to 'a service never commits' and is declared here so the lint rule can allow it by name." BO/02-scope.md:46 on the other hand says it relies on "`externalCall` for provider calls". `answerAttempt` makes no provider call between its writes at all (it records an answer and runs the settle handler), so the stated reason does not apply to it.
- Prevail: Foundations. `startAttempt` should use `externalCall` for the provider call (declared in a manifest `calls` entry); `answerAttempt` should take the caller's unit of work (the webhook job creates it). BO does not declare any `calls`.
- Owner: BO 05.

### F13. Withdrawn `box-office.eligibility` point and old consent column still appear as live
- A: FND/02-formats.md:175 "No separate eligibility points ... membership pricing check use `core.requirement`"; :177 reference format `<source>:<id>`, result `met`, `not-met` or `unavailable`; :185-187 `requirements.check` takes a required `whenUnavailable` argument (`not-met` for a benefit).
- B: BO/05-interface-to-other-modules.md:82 still lists `box-office.eligibility` as a point Box office offers ("Membership contributes one"); BO/02-scope.md:37 "Membership contributes a rule to the point box-office.eligibility"; BO/06-screens.md:5 "any member price already applied through the eligibility point"; BO/08-stories.md:36 BO-20 "a ticket type with an eligibility rule I meet"; BO/10-questions-for-matt.md:130 "Member pricing through the eligibility point"; BO/03-data-model.md:126 still lists the `eligibility` column in the table (only a note above says it is replaced); PAPER/12-build-backlog-and-glossary.md:70 "member pricing (BO-20) waits on Membership's eligibility point".
- Wording on BO/05:244-256 uses `unmet`/`Met` where Foundations says `not-met`, gives `requirements.check(refs, { account, at, record })` (one account) where the amended contract takes several accounts and refs, never names the required `whenUnavailable: 'not-met'`, and uses `membership:any`/`membership:<scheme id>` where Membership's source is `membership` with ids like `mty_...`.
- Same pattern for consent: BO/05:227 "Stored on the order as `checkout_consent_keys` (personal; cleared on erasure)" and :230 "so the column is null" still stand above the correction at :233-240 ("The order has no consent column"), and BO/03:220 says the column was withdrawn. The test plan (BO/09) has none of the four consent cases named at BO/05:240, nor a consent story.
- Prevail: Foundations, then BO's own later correction. Rewrite or delete the superseded text rather than leaving it above its correction; update scope, screens, stories, cut list, the data-model column list and the paper's backlog line. Move the consent and `prepare/part/own-account` cases into part 8.
- Owner: BO 02, 03, 05, 06, 08, 09, 10; PAPER 12 line 70.

### F14. Removed income setting is still described
- A: BO/10-questions-for-matt.md:14 "The setting `finance.income.recognise` is removed"; BO/07-settings-and-abilities.md:180 "`finance.income.recognise` is **removed** ... Rows for it in the tables above no longer apply".
- B: BO/07:66 the row is still in the table; BO/04-states-and-rules.md:307 "Whether income is deferred until the performance or recognised at sale is the setting `finance.income.recognise`, and a question for Matt in part 9. Deferred is drafted as the default".
- Also: BO/04:77 "Income is posted when the desk takes payment, which is on the performance day, so it is recognised at once", but the fixed rule (Q4) is deferred income then recognition after the performance (04:296-297 and test `deferred-income-clears`). A reservation paid before curtain posts to `deferred_ticket_income` and is recognised later.
- Prevail: the decision (Q4 A, fixed rule). Delete the row and the sentence; correct :77.
- Owner: BO 04, 07.

### F15. `payments.refund.request` names a Box office record; owner-neutral refund abilities are incomplete
- A: BO/05-interface-to-other-modules.md:300 "`payments.refund.request` and `payments.refund.approve` belong to Payments and say nothing of orders ... (`box-office.order.refund` here)".
- B: BO/07-settings-and-abilities.md:120 `payments.refund.request | Acts on: box-office.order` (Payments cannot name a record type of a module it does not require); BO/07 has no `box-office.order.refund` (BO/04:249 uses `box-office.order.cancel`; FND examples use `box-office.order.refund`). `box-office.ticket-type.override-requirement` (BO/05:251) is also not declared in part 6.
- Prevail: BO/05 (owner-neutral Payments). Make `payments.refund.request` act on `payments.session`-style neutral record or none, declare `box-office.order.refund` and `box-office.ticket-type.override-requirement` in part 6, and decide how `order.cancel` relates to `order.refund`.
- Owner: BO 07.

### F16. Preset roles are published but Box office maps nothing to them
- A: BO/07-settings-and-abilities.md:139 "Role names are illustrations until workstream 2 publishes its preset roles. No module here declares a role." Suggested holders use "treasurer", "duty manager", "marketing", "producer by grant".
- B: ID/07-settings-and-abilities.md:147-160 publishes keys `box-office-manager`, `box-office-staff`, `finance-officer` (display "Treasurer"), `communications-officer`, `production-lead`, `visiting-company`; ID:163 "Every other workstream adds its own abilities to these keys in its manifest's presets"; FND/02-formats.md:220 presets carry "role mappings". There is no `duty-manager` role (ID: "a duty manager ... get their authority from the shift fact").
- Prevail: Identity's keys. BO presets (per `student-society`, `amateur-company`, `small-venue`) should map abilities to those keys; replace "Treasurer; duty manager; marketing" with role keys or facts.
- Owner: BO 07.

### F17. Core's change-guard cannot "collect a decision"; two flows for a cancelled performance
- A: CORE/05-interface-to-other-modules.md:120-121: `core.change-impact` "Given a record and a proposed change, counts in plain words"; `core.change-guard` "allow or refuse with a reason"; CORE/04-states-and-rules.md:177 "A module may refuse the change with a reason: 'Refund or move the 42 tickets first'. Core runs every guard inside the batch and stops on the first refusal"; CORE state table: "Scheduled to Cancelled | `core.performance.cancel` | A reason is chosen. No other module refuses."
- B: BO/05-interface-to-other-modules.md:92 `core.change-guard` "Refuses cancelling or moving ... until a person has chosen what happens to them: refund all, offer exchange, or keep"; :158 "open the bulk cancellation the change guard already collected a decision for"; BO/04-states-and-rules.md:16 "When the core announces `core.performance.cancelled`, the box office pauses sales and opens a bulk cancellation for a person to confirm" and :251 "A person with `box-office.performance.manage` confirms a bulk cancellation"; BO/06:65 Bulk cancellation "reached from the core's cancel flow".
- Problems: (1) a guard returns allow or refuse only, so there is no place to collect refund-all/exchange/keep; (2) if the guard refuses until chosen, the performance is never `cancelled` with unresolved tickets, so "when core announces cancelled, open the bulk cancellation" is either a no-op or a second confirmation; (3) the person cancelling needs `core.performance.cancel`, not `box-office.performance.manage`, so a core canceller may be unable to make the choice; (4) core's "No other module refuses" in the state table contradicts its own guard point.
- Prevail: unclear; needs integration. Simplest: guard refuses until the box office's own screen has recorded a decision for that performance (a small decision record owned by BO), the person opens that screen from the refusal's link, and `core.performance.cancelled` then triggers the queued cancellations. Both documents should say so.
- Owner: BO 04 and 05; CORE 04 (state table wording).

### F18. Capacity is owned twice, and core's capacity events and reinstatement are not handled
- A: CORE/03-data-model.md:117 `capacity | Null takes the space's. 0 is a closed house.`; CORE/05:40 `capacityOf(performanceId)`; CORE/04-states-and-rules.md:91 "New capacity | Not below what Box office says is already held or sold. | `core.performance.capacity-changed`"; CORE/05:93 the event; CORE state table: "Cancelled to Scheduled" (reinstatement, announced as `core.performance.scheduled` with `reinstated`); CORE/05:92 `core.performance.moved`.
- B: BO/03-data-model.md:158 `box_office_pools.capacity` per band, with `over_venue_confirmed_by` "set when capacity is raised above the space's own capacity"; BO/05:200 "A space's own capacity ... Assumed"; BO "Heard" events (05:154-162) list only cancelled, rescheduled, completed, account.merged and setting.changed.
- Gaps: nothing says whether the sum of pools must equal or stay under core's performance `capacity`, which way the "not below sold" check runs (core asks Box office through which point? not `change-guard`, which is for cancel/withdraw/reschedule/move), and BO does not use `capacityOf`. BO does not hear `core.performance.moved` (a space change alters the "space's own capacity" ceiling and the seating plan), nor `core.performance.scheduled` with `reinstated: true` (sales stay paused after a reinstated show), nor `capacity-changed`.
- Prevail: core owns the performance's capacity field; BO owns pools. Specify the relationship (pools sum is bounded by `capacityOf`; core's change is guarded through `change-guard` and counts from `salesSummary`), and add the three heard events.
- Owner: BO 03, 05; CORE 04 (name the mechanism).

### F19. Messaging: BO routes through "the communications service" but core owns notifications; core's guest-booking text is stale
- A: BO/05-interface-to-other-modules.md:164 "Each is queued as a job through the communications service and respects the core's suppression list for anything that is not transactional"; BO/05:9 `uses` communications. FND/02-formats.md:146 "A soft dependency (`uses`) never calls the other module's services". CORE/05:68-70 `notify(typeKey, ...)`, `notifyAddress` ("such as a guest booking"), CORE:149 and :152 `core.notification-type` contributed by modules.
- B: BO does not contribute any `core.notification-type` (confirmation, reminder, cancelled, rescheduled, refund sent, waiting-list offer, payment did not complete, reservation reminder and release). CORE/05:275 "Guests who book without an account are reachable by `notifyAddress`", but with the accounts ruling (ID/05:46-56; BO/03:53) every named guest has an account, so `notify` applies and only the waiting-list entry needs `notifyAddress`.
- Prevail: core's `notify` and `core.notification-type` (owner of messaging; Communications is for mailings). Fix BO 05:164 and add the type contributions. Core's line 275 should say only a waiting-list entry (and a no-account desk sale, which gets nothing) uses `notifyAddress`.
- Owner: BO 05; CORE 05 line 275.

### F20. Contributions that Interface, Foundations and Core expect from Box office are absent
- A: UI/04-interface-to-other-modules.md:16-19 `core.record-tab` ("Tickets on a production"), `core.search-source` ("orders"), `core.quick-action` ("Sell tickets"), `core.home-card` (UI/05-2:62 "4 refunds awaiting approval. Review."); UI/05-3 journey 6 "Tickets tab" and "Open sales"; CORE/05:124-ish `core.production-section` "(Box office's sales summary ...)"; FND/02-formats.md:110 and 02-4:`core.privacy-record`; ID/05:159 `core.export-contributor`.
- B: BO/05-interface-to-other-modules.md:86-98 "Contributed by these modules": only `core.booking-action`, `change-impact`, `change-guard`, `navigation`, `setup-step`, `health-check`, `erasure-handler`, `record-resolver`, `erasure-hold`, `account-section`. Journey 6 also speaks of "a price list" where BO has a site-wide ticket-type list and a per-production price grid (BO/06:59).
- Prevail: Interface and Foundations lists. Add the missing contributions to BO's table (or say they are later), and align "price list" wording.
- Owner: BO 05; UI 05-3 (journey 6 wording).

### F21. Forms slot for checkout questions has two different names and shapes
- A: BO/05-interface-to-other-modules.md:83 "`box-office.checkout-question` | data | A form (from the form builder) asked at checkout for a production ... Later release" (a point offered by Box office).
- B: FORMS/05-interface-to-other-modules.md:29 and :48 "`box-office.checkout-questions` | submission | An order containing the ticket type is placed" (a slot Box office contributes to `forms.slot`, attached to a ticket type, `scope` one record or all); FORMS/08-stories.md:217 "`box-office.checkout-questions` is added to the box office after both exist".
- Differences: singular vs plural; point offered vs slot contributed to `forms.slot`; per production vs per ticket type; BO's `uses` omits forms. Forms is `switchable: false`, so BO may `requires`/`uses` it freely.
- Prevail: Forms owns `forms.slot`; Box office contributes one slot. Rename to `box-office.checkout-questions`, attach to ticket type (as Forms says) or document the production scope, and list it as a contribution to `forms.slot`. Also note FORMS asks BO for a charge service (FORMS/02-scope.md:57, 05:167) which BO's Payments has under no such name (see F22).
- Owner: BO 05; FORMS 05 line 167 for the charge name.

### F22. Undefined service `collect` and unaccounted `finance.system-account` model
- A: BO/05-interface-to-other-modules.md:311 "Online, the owner calls Payments' `collect` with its parts and gets the provider's payment step back." BO/05:31-38 Payments services have no `collect`.
- B: BO/05:302 "Finance creates each as a locked account keyed `<module>.<key>` ... Box office declares `box-office.ticket-income` and `box-office.deferred-ticket-income`"; BO/05:304 "`finance_accounts` gains `module`". BO/03-data-model.md:555-563 `finance_accounts` has no `module` column and names the system accounts `cash`, `card_clearing`, `ticket_income`, `deferred_ticket_income`, `booking_fee_income`, `donation_income`, `pass_liability`, `provider_fees`, `refunds_payable`, `cash_variance`, `unfulfilled_payments`; BO/04:296-304 posts to those unprefixed names. `booking_fee_income`, `donation_income`, `pass_liability` and `unfulfilled_payments` are not in the declared list at 05:302, and "a handler may post only to accounts its own module declared" would forbid Box office from posting `pass_liability` unless it owns it.
- Prevail: part 4's later contract (modules declare accounts). Add the `module` column to part 2, rename system keys to `<module>.<key>`, say who owns each account, and name the online counterpart of the desk basket (`createIntent` with parts, or a new `collect`). Also the ledger `kind` list (03:571) lacks kinds for unfulfilled payments, pass use and cancellation fees.
- Owner: BO 03, 04, 05.

### F23. Public routes outside the reserved prefixes, and a route shape that differs from Interface
- A: FND/02-formats.md:116 reserved prefixes: `/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api`, underscore; later `/files`, `/whats-on`, `/shows`, `/mailing`. "A check refuses a theatre page under one."
- B: BO/06-screens.md:24 "Manage booking | `/orders/<token>`"; :27 "Buy a pass | `/passes`". Neither is under a reserved prefix, so a theatre page `/passes` could collide, and the build check does not protect them. UI/05-1-shells-and-navigation.md:90 gives `/book/hamlet/thu-14-mar` (production and date), while BO uses `/book/<performance>` and `/book/basket` (a performance slug "basket" is possible).
- Prevail: Foundations rule. Move to `/book/order/<token>` and `/book/passes` (or `/account/...` for signed-in), and settle with Interface the performance segment of `/book`.
- Owner: BO 06; UI 05-1 (example).

### F24. `core.account.merged` listener contradicts the declared merge, and a waiting-list row has no account
- A: BO/05-interface-to-other-modules.md:161 "`core.account.merged` | Box office | Move orders, passes and waiting-list entries to the surviving account".
- B: ID/05:40 "Moves or aliases every other module's rows from the column declarations alone"; CORE/05 "Nothing by event: the merge moves core's rows in its own batch ... Listed so the dependency is visible"; BO/03:27 declares `onMerge: 'move'` and `'alias'`; BO/03:43 and :373 waitlist entries are email-subject rows with no account column to move.
- Prevail: Identity's column declarations. Delete the listener or say it does nothing; waiting-list rows are not moved.
- Owner: BO 05.

### F25. Design paper catalogue contradicts the dependency rule BO relies on
- A: PAPER/04-2-module-catalogue.md:24 "| Payments | Pluggable providers for taking and returning money | Box office or Bar |"; :23 "| Box office | ... | Core |".
- B: FND/02-formats.md:89 "'Payments needs Box office or Bar' | Box office and Bar each require Payments; no either-or dependencies"; BO/05:5-11 (box-office requires payments, finance; payments requires finance); PAPER/05-part-b-conventions.md:86 "Box office and Bar each require Payments".
- Prevail: Foundations and BO. Catalogue "Needs": Box office: Payments, Finance; Payments: Finance; and keep "Finance: Core" only if core counts as a dependency. The catalogue also lists "Reports" etc., unaffected.
- Owner: PAPER 04-2.

### F26. Jobs and tasks list is incomplete, and jobs and tasks are mixed
- A: BO/05-interface-to-other-modules.md:166-181 lists `box-office.sweep-holds`, `open-sales`, `recognise-income`, `cancel-order`, `send-tickets`, `payments.reconcile-attempts`, `handle-webhook`, `send-refund`, `fetch-fees`, `prune-webhooks`.
- B: BO/07-settings-and-abilities.md:176 "Job `box-office.release-reservations` runs from the one cron, and `box-office.send-reservation-reminders` beside it" (cron-run, so tasks in Foundations' terms; FND/02-formats.md:47 and :25 distinguish jobs from tasks); BO/05:290 "the intent-expiry job is the backstop" with no such task in the table (the event `payments.intent.expired` exists, and BO/05:170 `sweep-holds` only expires orders). BO/04:307 / 05:171 describe recognition as both a daily task and "queue income recognition" on `core.performance.completed` (05:160) and "A scheduled task after the performance ends" (04:297).
- Prevail: Foundations vocabulary. Add the two reservation tasks and an intent-expiry task to part 4, call them tasks, and pick one trigger for income recognition.
- Owner: BO 04, 05, 07.

### F27. Events list: `box-office.order.reserved` missing from the tables that must state it
- A: BO/05-interface-to-other-modules.md:134 "every event below states it" (`internal`), with the announced list at :113-130 and the webhook table at :137-150.
- B: `box-office.order.reserved` appears only at :229 and :238 ("new; `internal: false`"), and in FND/06-interface-to-other-modules.md:92. It is in neither table. Also absent: events for reserved-order cancellation, release and payment (BO uses `box-office.order.cancelled` / `expired` for them?), which `core.notification-type` and `front-of-house.tonight-figure` need.
- Prevail: Foundations rule E6/E7 (every announced event states `internal`). Add the row to both tables and state how reservation cancel and release announce.
- Owner: BO 05.

### F28. Attempt state diagram versus reader cancel
- A: BO/04-states-and-rules.md:184 "started -->|"stopped first"| cancelled" (only `started` can be cancelled); the note at :185 "Succeeded, failed and cancelled are final".
- B: BO/05:68 provider member "`cancel(attempt)` | if `reader` | Stop a payment waiting on a reader"; BO/06-screens.md:75 "After it is pressed the screen says 'Waiting for the reader' with a Cancel button"; BO/04:196 "open to cancelled | No attempt is pending, unknown or succeeded" (so a pending reader attempt must first leave `pending`); BO/03:503 unique index on `reader_id` where `started` or `pending`.
- Prevail: the screen and provider contract. Add `pending -> cancelled` (provider confirmed stop) to the diagram and the state trigger text (03:504), and say what happens if the reader answered "paid" first.
- Owner: BO 04, 03.

### F29. Retention settings still describe data the orders no longer hold
- A: BO/07-settings-and-abilities.md:40 `box-office.retention.orders` "How long after the performance an order keeps its contact details"; :41 `retention.baskets` "before its contact details are cleared"; :43 `retention.comp-requests` "keeps the recipient's name".
- B: BO/03-data-model.md:53 "Orders, passes and complimentary requests are therefore keyed to an account and **store no name, email or phone of their own**"; the words table (03:33, :42) gives orders "keep-row" and comp requests "keep-row" with no retention declaration pointing to those settings. FND/02-4-data-class-registry.md:124 still shows the draft-1 order with `booking_name` and `email` and `retention: 'box-office.retention.orders'`.
- Prevail: the accounts ruling. Either drop these three settings or restate what the sweep does (for example: unclaimed accounts are anonymised by identity's `core.retention.unclaimed-after`; order retention governs when the access note, token hashes and attendee names are cleared). Foundations' worked example should drop `booking_name`, `email`.
- Owner: BO 03 and 07; FND 02-4 example.

### F30. Offline door manifest, names and flags differ from Interface
- A: UI/02-data-model.md:62 "Live data | ... tonight's ticket list ... | Personal: names and ticket codes; no payment details, no special-category data"; UI/05-3-key-journeys.md:99 "A ticket was refunded after the list was loaded | When online, refused. When offline, admitted and flagged on reconnect"; UI journey 4 step 4 "Search by name is one tap away".
- B: BO/04-states-and-rules.md:161 manifest has "ticket ids, code hashes and states, no names unless the theatre turns names on" (`box-office.scanning.names-on-device` default false, BO/07:36); BO/06-screens.md:92 "Find by name"; BO/03:265 scan `result` has `void` but nothing for "admitted offline, voided since" (only offline duplicates are flagged, 04:161).
- Prevail: BO for privacy (names off by default), but then "find by name" is online-only by default and Interface should say so; BO must add the reconnect flag for tickets voided after download, and state whether codes or hashes are on the device.
- Owner: BO 04; UI 02, 05-3.

### F31. Complimentary tickets at the desk
- A: UI/05-3-key-journeys.md:74 "Take payment: card on the reader, cash or complimentary, in one payment"; :82 "The seller is not allowed to issue a complimentary ticket | The option is shown with why, and 'Request approval'".
- B: BO/06-screens.md:78 "Complimentary tickets cannot be typed in. The row opens the approved requests waiting to be issued."; BO/10:146 "Complimentary tickets are ordinary zero-price tickets needing a second person"; BO/03:361 `decided_by <> requested_by`. No seller issues one on the spot.
- BO's own "Checked against Interface's conventions" table (06:146-160) does not list this difference.
- Prevail: BO (decided rule). Interface to change journey 3: complimentary is "pick an approved request", with "Request approval" always offered.
- Owner: UI 05-3; BO 06 (add a row).

### F32. Core's `core.booking-action` state mapping is incomplete
- A: CORE/05-interface-to-other-modules.md:124 states `available`, `limited`, `sold-out`, `not-yet`, `closed`.
- B: BO/05:90 "Book now", "Sold out, join the waiting list", "On sale Friday 10 am", "Sales closed"; BO/03:96 sale states `draft`, `on_sale`, `paused`, `closed`. `draft` and `paused` have no stated mapping (BO/08-stories.md:19 says only that baskets are refused while paused), and the "join the waiting list" link, `limited` ("14 seats left") and the on-sale timestamp are not mapped.
- Prevail: Core's five states. Add the mapping table (draft: absent; paused: `closed` with its own label or `limited`?) in BO 05.
- Owner: BO 05.

### F33. Scope refers to content that does not exist
- A: BO/02-scope.md:34 "Embeddable booking widget, wallet tickets, agent and promoter allocations | Later items in the catalogue | Listed in the later backlog in part 7"; :33 "Order lines already allow both kinds".
- B: BO/08-stories.md has no later backlog of those items (the closest is "Not stories of these modules" at :115-123, which lists bar, Gift Aid, memberships, expenses, marketing); BO/03:229 order-line kinds are `ticket`, `booking_fee`, `donation`, `pass_sale`, `exchange_fee`, `adjustment`, with no voucher kind.
- Prevail: the content. Add the backlog rows (or point to the paper) and add a voucher line kind or drop "both".
- Owner: BO 02, 08.

### F34. Cut order omits the reservation stories that the backlog calls gate
- A: BO/10-questions-for-matt.md:133 "Not to be cut | BO-10 to BO-16, BO-30, BO-31, BO-40, BO-50, BO-51, PAY-05, FIN-01, FIN-02"; :127 cut 4 "Phone orders held unpaid | BO-34, in part".
- B: PAPER/12-build-backlog-and-glossary.md:59 "Box office's own gate inside phase 3 is BO-10, 12, 13, 30, 40, 50, 51, PAY-05, FIN-01, FIN-02 and R-1 to R-7"; BO/08:127 R-1 to R-7 are "all Gate stories"; BO/08:49 BO-34 is held-unpaid phone orders, now the reservation path (BO/04:66 "staff reserve at the desk or by phone").
- Prevail: backlog and the story list (R-1 to R-7 are gate). Add R-1 to R-7 to "Not to be cut" and reword cut 4 so it cannot cut the reservation path.
- Owner: BO 10.

### F35. Other settings and kinds not in Foundations' format
- BO/07-settings-and-abilities.md:159-166 reservation settings use a "Type" column with "whole number or unset" and `release-minutes-before`, `reminder-hours-before`, while every other duration is `duration` kind (FND/02-2-settings-registry.md:43 `duration`; there is also `box-office.tickets.reminder-before` as a duration). The table omits Limits, Changed by, Audience and Quotable; the added `box-office.checkout.hold-extension-minutes` (BO/07:184) is a stray bullet with no limits and sits in `checkout` while hold times sit in `baskets` (`box-office.baskets.hold-for`). Neither the extension nor its test has a story or test.
- BO/07:46 is garbled: "`baskets.pay-within` is at least `baskets.hold-for` less five minutes is **not** required". The settings are also stated as site-wide "Foundations draft 1" (07:5) while per-performance columns are explained.
- Prevail: Foundations settings format. Re-express as `duration` settings in the standard table, and give the hold extension a row, a story and a test.
- Owner: BO 07, 08, 09.

### F36. Hold-extension and expiry story text
- BO/04-states-and-rules.md:108 "The basket's expiry is set when the first ticket is added and is **not** extended by later changes" and BO/08:27 "Changing my basket does not restart it" agree with each other, but the added extension (BO/06:150, :155, 07:184, "one extension by button") is not in the rules, the claim `expires_at` rules, or the hold kinds table, and an extension must update claim `expires_at` in one batch. Also BO/06:151 says an expired basket is "remembered in the browser; nothing is held" while UI/05-3:57 says "The basket is kept as a wish". Fine for the second, but the first needs a rule line in part 3.
- Owner: BO 04.

### F37. Term used for "consent held by the core"
- BO/08-stories.md:123 "Marketing emails to bookers | Communications; the box office exposes who booked, subject to consent held by the core". BO/05-interface-to-other-modules.md:227 and :237 say the lasting consent record "belongs to Communications" / "The contributing module holds the record". Prevail: Communications. Fix 08.
- Owner: BO 08.

### F38. Overview diagram says Box office posts to the ledger; part 4 says Payments writes the posting
- A: BO/01-overview.md:54 "4 Box office posts sales, refunds and earned income, each tagged with its performance." and "3 Payments posts fees, payouts and cash differences".
- B: BO/05-interface-to-other-modules.md:292 "A handler's `settle(unit, part)` and `refunded(unit, part, refund)` ... **return their ledger entries**. Payments writes one sealed posting". BO/04:219 step 7 "Ledger posting, entries and seal" inside the order's settle batch.
- Prevail: part 4. Rewrite key line 4 to "Box office returns the entries for sales and refunds; Payments writes the one sealed posting; Box office posts earned income itself".
- Owner: BO 01.

### F39. Payments' contributions to Front of house contradict its own `uses`
- A: BO/05-interface-to-other-modules.md:8 `payments | requires finance | uses none`.
- B: BO/05:267 "`front-of-house.report-section` | Payments | Till sessions closed on that operating day" ("Contributions to Front of house, declared under `uses`").
- Prevail: part 4's own rule. Add `front-of-house` to Payments' `uses`. (FND/02-formats.md:165 front-of-house is a reserved id.)
- Owner: BO 05.

---

## LOW

### F40. Order diagram caption and states
BO/04-states-and-rules.md:47 "*order life cycle · 5 states*" but the diagram draws six (adds `reserved`); BO/03:201 `state` lists five and relies on the paragraph at :218 for `reserved`. Update caption and column. Owner: BO 03, 04.

### F41. Webhook table kind
BO/03-data-model.md:536 "`payments_webhook_events` (guarded, with a retention sweep)", the words table (03:49) "no" append-only, but :547 "this is the one deletion the append-only trigger allows". It is not append-only. Reword. Owner: BO 03.

### F42. Account columns' class is Internal for subjects, Personal for actors
BO/03-data-model.md:12 "A column that names an account ... class Personal"; rows `box_office_orders.account_id` (:202), `passes.account_id` (:337), `comp_requests.for_account_id` (:357), `requested_by`/`decided_by` (:359-361) say Internal, while `held_by` (:171), `set_by` (:144), `scanned_by` (:266) say Personal. Pick one (FND/02-4:87 shows `col.account` without a class). Owner: BO 03.

### F43. Door timing settings overlap core
BO/03-data-model.md:101 `doors_open_at` "copied from the core when set on sale"; CORE/03-data-model.md:113 `doors_at` with default from `core.programme.doors-before`; BO/07:35 `box-office.scanning.opens-before` "when no doors time is set" (core always has one by default, so it never applies). A reschedule would also leave the copy stale (BO/05:159 recompute handles on-sale and off-sale times only). Prevail: core; read `doors_at` through the performance service. Owner: BO 03, 07.

### F44. Reasons: fixed list vs vocabulary
BO/03-data-model.md:103 "Lists a theatre edits (concession kinds, complimentary reasons, cancellation reasons) are the core's vocabularies ... the column stores a `core_terms` id"; :280 `cancellations.reason_code` "from a fixed list (illness, cannot attend, booked in error, other)"; UI/05-3-key-journeys.md:57 "Reason, from the theatre's list". BO declares no vocabulary (comp reasons, cancel reasons, concession kinds) although CORE/03:240 says a module declares its vocabularies in its manifest; `ticket_types.kind` (:113) is a fixed list too. Prevail: Interface and the line at 03:103; declare the vocabularies in part 6 and make `reason_code` a `reason_term_id`. Owner: BO 03, 07.

### F45. Export ability
UI/06-settings-and-abilities.md:68 "Export is not one ability. Each module declares `<module>.<record>.export`". BO/06-screens.md:64 Sales report "export" under `box-office.report.view`; Orders list (06:51) has no export ability. Add `box-office.order.export`/`box-office.report.export`. Owner: BO 06, 07.

### F46. Navigation groups
BO/05-interface-to-other-modules.md:93 gives Box office, Payments and Finance as three console entries; UI/05-1-shells-and-navigation.md:111 fixes group order "Tonight, Box office, Front of house, Bar, Spaces, Training, Membership, People, Money, ..." with no Payments or Finance group (UI/04:53 "Payments under Money"). Say that Payments and Finance entries join `Money`. Owner: BO 05.

### F47. Preset differences equal the defaults
BO/07-settings-and-abilities.md:73: `amateur-company: box-office.fees.booking-fee 0` (default 0, :20); `small-venue: finance.periods.length month` (default month, :67); `student-society ... finance.year.starts 08-01` (default 08-01, :68). They do not differ. Either change the default or drop the rows. Owner: BO 07.

### F48. Missing tests for features moved into the first release
BO/08-stories.md:145-147 moves buyer cancellation and exchange (BO-22, BO-54, BO-55) into the first release "tested behind its setting", and BO/07:184 adds hold extension, but BO/09 names no case for self-cancel cut-off, buyer exchange fee, or hold extension; the consent cases (F13) and `prepare-without-payment-is-released`, `part-entries-must-total-the-part`, `handler-posts-only-to-its-own-accounts` (named in 05:306) are not in 09. Owner: BO 09.

### F50. Foundations examples now wrong for box office
FND/02-formats.md:45 example event `box-office.order.paid` (BO uses `box-office.order.confirmed` with a reason at 05:229); FND/02-4-data-class-registry.md:12-22 and :124-130 order with `booking_name`, `email` and `Null for a guest order`; FND/02-formats.md:41 `box-office.holds.release-before` vs BO `box-office.reservations.release-minutes-before`. Examples only, but they are copied. Prevail: BO. Owner: FND 02-formats, 02-4.

### F51. Roadmap lists "customer records" for phase 3
PAPER/07-roadmap.md:10 "... waiting list, complimentary tickets, customer records." BO has no customer-record entity (the account is the person; BO exposes `ticketsFor(accountId)`, and BO/02-scope.md:38 puts mailing segments in Communications). Prevail: BO. Reword roadmap ("order history on the account"). Owner: PAPER 07.

### F52. Interface journeys show a donation or programme extra at the basket
UI/05-3-key-journeys.md:42 "Optional extras the theatre has enabled appear here once: a donation, a programme"; BO/02-scope.md:33 "Gift vouchers and a donation at checkout | Roadmap phase 6". Minor timing difference ("enabled" covers it); note only. Owner: UI 05-3.

### F53. Scan id shape
BO/03-data-model.md:262 `box_office_scans.id` "generated on the device"; the prefix rule (03:59, FND ruling at 02-formats.md:159) says every id is `<prefix>_<26 chars>` from `col.id()`. State that devices generate `scan_` ids in that form. Owner: BO 03.

---

## Checked and consistent

- Module ids and prefixes: `box-office`/`box_office_`, `payments`/`payments_`, `finance`/`finance_`. All 38 id prefixes (22 + 9 + 7, including `pip`) match FND/06-interface-to-other-modules.md:68-70, with no clash against core, identity, forms, bar, membership, training, spaces, communications, front-of-house prefixes. The 22/9/7 table counts match PAPER/12:112-114.
- Story counts in BO/08 (67, 61 first-release, 17 Gate, 3 later, 3 seating) match PAPER/12:12; the R-1 to R-7 gate list matches PAPER/12:59.
- Dependencies: Box office requires Payments and Finance; Payments requires Finance; no either-or; matches FND/02-formats.md:89 and PAPER/05-part-b-conventions.md:86.
- Sale state belongs to Box office; core states draft, scheduled, cancelled, completed (CORE/04); performance events `cancelled`, `rescheduled`, `completed` exist with the names BO hears. Core's quotable `box-office.orders.seat-cap` matches BO/07:15. `operatingDayOf`, `dayBounds` and `capacityOf` exist in CORE/05.
- Identity: `findOrCreateAccount(address, name, origin)` and the origin `named-by-other` (ID/05:18, :53); `core.erasure-hold`, `core.account-section`, `core.erasure-handler`, `core.record-resolver`; the audience-side "Tickets and orders" section (ID/05:223); `col.account` roles and `onMerge: alias` for append-only tables (FND/02-formats.md:114).
- Foundations: events `internal` flags per E6/E7 on every listed event; `box-office.checkout-consent` is a code point (FND/02-formats.md:189); `box-office.order.reserved` as a deliverable event (FND/06:92); credential store (`credentials`) and erasable columns on append-only tables (FND:136, :138) are used as ruled; the `externalCall` idea is used (but see F12); reserved id, scoped-id rule applied to every table; sub-tab terms (British English spellings checked: no US spellings found).
- Hold vs claim wording (seat hold and capacity claim) matches the glossary (PAPER/12:84-85); "sale state" vs "performance state" matches PAPER/12:90.
- Roadmap phase 3 content and gate ("a paid booking, a refund and a period close reconcile to the penny, and a full house sells its last seat once"), allocated seating and vouchers in phase 6, self-service cancellation off by default, season passes later: consistent between PAPER/07, PAPER/12 and BO/08.
- Decisions: Q1 to Q11 answers in BO/10 match PAPER/11 (B3, B4, B6, B7, B8, B10, B11); B6 move of BO-22/54/55 is applied in BO/08; B4's removal of the setting is applied except F14.
- Interface conventions compared in BO/06:146-160 (checkout steps, reserve ending, money-screen totals, anonymous desk sale, reader no-answer wording, refund of own order): the BO side agrees with Interface except as raised in F4, F20, F30 and F31.
- Ledger/proof: append-only, seal and CHECK design is described the same way in 01, 03, 04, 09 and 11; proof case list (11 cases) matches the 11 named cases in 09 and the table in 11.
