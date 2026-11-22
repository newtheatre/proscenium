# 8. Test plan

## How to read this part

Named cases, filed under the tier that runs them, as Foundations asks. A **never-regress** case guards a promise the theatre makes to its audience or its treasurer; it may not be skipped, weakened or deleted without a decision record. Each names the story it proves. There are 97 never-regress cases in the eleven tables below.

| Tier | Runs on | Used here for |
| --- | --- | --- |
| Unit | Plain functions, no database | Price and total arithmetic, state tables, signature checks |
| Integration | The built Worker with a real local D1 (workerd) | Everything that depends on a constraint, a trigger or a batch |
| End to end | A browser against the built Worker with a fake provider | The journeys in part 5 |

**A rule for every concurrency test, learned from the proof.** Racing attempts must be started inside one Worker isolate in the same turn (the proof's `/race` endpoint). Separate local requests arrive milliseconds apart and can pass a design that is broken. Each concurrency case also runs a control that is expected to fail, so the test is known to have teeth.

**The fake provider.** A contribution to `payments.provider` used only in tests. It can be told to succeed, decline, never answer, answer late, answer twice, answer out of order, and send a forged webhook.

## Never-regress cases

### Capacity (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `last-seat-sells-once` | BO-13 | 40 buyers race for 1 seat in one isolate: 1 holds it, 39 are refused as sold out, the counter equals live claims. 20 rounds |
| `full-house-never-oversells` | BO-13 | 300 parties of 1 to 4 race for 120 seats: live claims never exceed 120 and no party is partly seated |
| `party-is-whole-or-nothing` | BO-14 | A party of 3 for 2 seats takes none; a party of 2 then succeeds |
| `one-seat-one-claim` | BO-71 | 40 buyers race for seat A1; overlapping pairs race along a row: no seat has two live claims |
| `expired-hold-does-not-block` | BO-11 | The last seat is held by a lapsed basket nobody swept: it is resold exactly once |
| `released-seat-resells-once` | BO-50 | A cancelled seat with 40 buyers waiting is resold exactly once |
| `capacity-cannot-drop-below-sold` | BO-04 | Setting capacity under tickets sold is refused by the database |
| `claims-are-never-deleted-or-revived` |  | DELETE on a claim and released-to-live are refused by trigger |
| `counter-matches-claims` |  | After every other capacity case, each pool's counter equals a count of its live claims |
| `paying-hold-is-not-swept` | BO-21 | A hold whose order has a pending or unknown attempt survives its expiry, the sweep and a competing purchase |
| `promo-last-use-given-once` | BO-17 | 20 baskets race for a code with 1 use left: 1 gets it |
| `pass-last-use-given-once` | BO-64 | The same for a pass's last use |

### Money in (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `paid-means-ticketed` | BO-12 | A succeeded attempt confirms the order, confirms its claims, issues tickets and seals a posting, all or none. Failing any statement in the batch leaves the attempt pending and nothing else changed |
| `payment-after-hold-released` | BO-12 | The hold is released by hand, then the provider says paid: the intent becomes unfulfilled, nothing is oversold, a full refund is requested, the money sits in `payments.unfulfilled`, staff are alerted |
| `webhook-twice-changes-nothing` | PAY-05 | The same provider event delivered twice, and two different events for the same success: one confirmation, one posting |
| `webhook-out-of-order` | PAY-05 | Failed then succeeded, and succeeded then failed, both end in the state the provider reports when asked |
| `forged-webhook-ignored` | PAY-05 | A bad signature is stored with `signature_ok` false and no state changes |
| `nothing-paid-before-an-answer` | BO-30 | While a reader attempt is pending, the order is not confirmed and no posting exists |
| `no-answer-is-unknown-not-failed` | BO-32 | The provider never answers: the attempt becomes unknown, the hold is kept, and a later "paid" confirms the order |
| `one-payment-per-reader` | BO-30 | A second attempt on a busy reader is refused by the unique index |
| `total-mismatch-refuses` | BO-15 | A checkout sending a total that differs from the lines is refused, quoting both |
| `price-change-does-not-touch-baskets` | BO-03 | A price row added mid-basket leaves the basket's lines unchanged |
| `retry-does-not-charge-twice` | BO-12 | A lost connection during `start` is retried with the same idempotency key: the provider is asked once for money |
| `test-mode-never-settles-live` | PAY-01 | An attempt on a test-mode provider account cannot confirm a live order |

### Money out (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `double-refund-refused` | BO-51 | Two full refunds of one payment race: one is approved, the other fails the CHECK on the part's and the attempt's refunded amount |
| `refunds-never-exceed-payment` | BO-51 | Any sequence of partial refunds stops at the amount paid; a failed refund gives its amount back to the allowance |
| `declined-refund-moves-no-counter` | BO-51 | Declining a requested refund changes neither the part's nor the attempt's refunded amount. Only approval adds and only failure subtracts |
| `own-refund-not-approved` | BO-51 | Requester and approver equal is refused by ability and by CHECK when the amount is above the limit stored on the refund; at or under it, the same person may approve |
| `self-approve-limit-is-fixed-at-request` | BO-51 | Raising `payments.refunds.self-approve-up-to` after a refund is requested does not let its requester approve it |
| `refund-goes-back-the-way-it-came` | BO-50 | A card payment cannot be refunded as cash |
| `cancel-is-all-or-nothing` | BO-50 | Cancelling releases claims, voids tickets, updates the total, writes the cancellation and requests the refund in one batch; a failure leaves all as it was |
| `bulk-cancel-survives-one-failure` | BO-52 | 50 orders, the provider refuses one refund: 49 complete, 1 is listed, rerunning touches only that 1 |
| `exchange-never-loses-seats` | BO-54 | The target performance sells out mid-exchange: the buyer keeps the original seats |

### The ledger (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `posting-balances-or-does-not-exist` | FIN-01 | A posting a penny out, with one entry, or in mixed currencies fails its batch and leaves no row |
| `ledger-is-append-only` | FIN-03 | UPDATE and DELETE on postings, entries, seals and period closes are refused |
| `nothing-posts-twice` | FIN-01 | Replaying every job, webhook and settle batch of a scenario adds no posting |
| `closed-period-refuses-postings` | FIN-02 | A posting into a closed period is refused by trigger; the service routes a late fact to the next open period with its true date |
| `sales-reconcile-to-the-penny` | FIN-01 | After a generated season of sales, refunds, cancellations, fees and exchanges, box office totals equal ledger movements per performance and overall, and every clearing account equals payments less refunds less payouts |
| `deferred-income-clears` | FIN-01 | After every performance has completed, `box-office.deferred-ticket-income` is zero |
| `reversal-is-exact-and-once` | FIN-03 | A reversal mirrors the original; a second reversal of the same posting is refused |

### The door (integration and unit)

| Name | Proves | Case |
| --- | --- | --- |
| `ticket-admits-once` | BO-40 | Two devices scan one ticket at once, online: one admits, one sees already in |
| `void-ticket-refused` | BO-50 | A cancelled, exchanged or reissued ticket's old code is refused |
| `wrong-performance-refused` | BO-40 | A valid ticket for another performance is refused, naming it |
| `forged-code-refused` (unit) | BO-40 | A code with a bad signature, or signed by a key the kit no longer keeps, is refused offline. A code signed by a rotated key that is still kept verifies |
| `offline-scan-syncs-once` | BO-41 | A queued scan sent three times is stored once |
| `offline-double-admission-flagged` | BO-41 | Two offline devices admit one ticket: the earlier wins, the later is flagged on the door report |

### Privacy and permission (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `erasure-keeps-the-books` |  | Erasing a buyer clears their name, email, phone, access note and free text, deletes waiting-list rows, and leaves every ledger total and sales count unchanged |
| `guest-erased-by-email` |  | A buyer who never signed in is erased by verified address |
| `access-note-is-encrypted-and-guarded` | BO-19 | The stored value is not the plain text; reading it without the ability is refused; the door shows only that one exists; a seller reads a person's needs only when that person is accepted on the access scheme; changing the record afterwards leaves the order's copy as it was |
| `events-carry-no-personal-data` |  | Every announced payload validates against a schema of identifiers only |
| `webhook-payload-carries-no-person` |  | Every event that part 4 marks `internal: false` is delivered to a test webhook and its body checked against the data-class registry; a personal, free-text or person-tied money field fails. Every event marked `internal: true` is confirmed never to be delivered |
| `no-card-data-anywhere` |  | No column, log line or event contains a card number pattern after a full scenario |
| `code-stored-only-as-hash` | BO-16 | After a full scenario no column holds a ticket code, pass code, desk code or order-link token in the clear; a scanned code is found by hashing it |
| `production-grant-is-scoped` | FIN-04 | A grant on one production shows that production's orders and statement and refuses another's |
| `own-comp-not-approved` | BO-62 | Requester and approver equal is refused by ability and by CHECK |
| `audience-shell-has-no-member-words` | BO-10 | Signed out, the checkout pages contain no membership wording or links, except the provider's own phrase inside a ticket type that carries a requirement |
| `online-order-always-has-an-account` | BO-10 | An online or phone order cannot be confirmed or reserved with a null account (refused by CHECK); a desk order with a null account cannot carry an access note |
| `consent-is-written-once-with-the-order` | BO-10 | A ticked consent question is recorded in the batch that first confirms or first reserves the order, and not again when a reservation is paid. If that batch fails, no consent exists |
| `consent-never-leaves-in-an-event` |  | No order event payload carries a consent key |
| `no-consent-at-the-desk-or-without-an-account` | BO-30 | A desk or phone sale shows no consent questions, and an order with no account is never passed to a consent contribution |

### Reserve now, pay on arrival (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `reservation-claims-like-a-sale` | R-1 | The last-seat cases pass unchanged when the winning order is reserved, not paid |
| `reservation-posts-nothing` | R-1 | Creating, amending, cancelling and releasing a reservation leave the ledger untouched |
| `reservation-needs-an-account` | R-1 | A reserved order with a null account is refused on every channel |
| `reservation-limits-hold-under-concurrency` | R-7 | Parallel reservations by one account cannot exceed the per-person limit |
| `zero-total-never-rests-reserved` | R-1 | An order with nothing to pay is confirmed at once |
| `reserved-then-paid-confirms-cleanly` | R-5 | Paying a reserved order settles in one batch: its claims, already confirmed, stay confirmed; the batch asserts that confirmed claims equal live ticket lines; tickets are issued and one posting is sealed |
| `desk-payment-settles-once` | R-5 | Two desks taking payment for the same reservation produce one confirmed order and one posting |
| `failed-desk-payment-keeps-the-seats` | R-5 | A failed or cancelled attempt returns the order to reserved with its claims intact |
| `release-skips-payment-in-flight` | R-6 | The task `box-office.release-reservations` never releases an order that is awaiting payment or marked keep |
| `release-and-payment-race` | R-6 | Release and Take payment started together end with exactly one of expired or awaiting payment, never both |
| `desk-code-does-not-admit` | BO-40 | The door refuses a desk code and a reserved order's reference, and writes no scan row |

### One payment with several owners (integration)

Tested with a stand-in second owner, so the cases do not wait for the Bar module.

| Name | Proves | Case |
| --- | --- | --- |
| `parts-sum-to-the-intent` | PAY-07 | An intent whose parts do not add up to its amount is refused when it is created |
| `one-open-intent-per-record` | PAY-07 | Two intents racing for the same owner record: one is created, the other is refused by the unique index on open parts |
| `prepare-without-payment-is-released` | PAY-07 | A part prepared and never paid, at the desk or online, has its settlement handler's `release` called for every part when the intent is cancelled or expires, and calling it twice changes nothing |
| `all-parts-settle-or-none` | PAY-07 | If one owner's settlement refuses, no part settles, no ticket is issued, nothing is posted, and the money is refunded as unfulfilled |
| `part-entries-must-total-the-part` | PAY-07 | A handler returning entries that do not total its part's amount is treated as refusing: the answer is recorded, nothing settles, and the intent is unfulfilled and refunded |
| `handler-posts-only-to-its-own-accounts` | PAY-07 | A handler returning an entry for another module's account is treated the same way, and no entry reaches that account |
| `posting-splits-by-part` | PAY-07 | The one sealed posting credits each owner's account with its own part and balances |
| `refund-stays-inside-its-part` | PAY-07 | Refunding more than a part's amount is refused even when the intent as a whole has room |

### Requirements and the check at entry (integration)

Tested with a stand-in requirement source, so the cases do not wait for the Membership module.

| Name | Proves | Case |
| --- | --- | --- |
| `presented-value-is-never-stored` | BO-20 | After buying by reference, the typed value is in no column, log line, job or event; only the evidence id is kept |
| `unavailable-at-sale-withholds-the-type` | BO-20 | With the source switched off, a ticket type that carries its requirement is not sold to anyone and the on-sale checklist says why |
| `holder-limit-holds-under-concurrency` | BO-20 | Parallel baskets for one holder cannot take more live tickets of the type than `max_per_holder` for a performance |
| `one-membership-one-ticket-whichever-route` | BO-20 | A holder met by account in one basket and by typed reference in another is counted once |
| `by-reference-ticket-always-rechecked` | BO-45 | A ticket met by evidence is checked again at the scan even when the ticket type has `recheck_at_entry` off |
| `not-met-at-entry-does-not-admit` | BO-45 | A scan answered not met stores `requirement_not_met`, admits nobody and shows the source's words |
| `unavailable-at-entry-admits-and-reports` | BO-45 | With the source unreachable or the device offline, the ticket is admitted and listed on the night report as unchecked |
| `override-never-for-own-ticket` | BO-45 | "Admit anyway" needs the ability and a reason, is stored on the scan row, and is refused for a ticket on the overrider's own order or met by their own account |
| `holder-name-is-never-stored-or-cached` | BO-45 | After the door shows the name a card should carry, the name is in no scan row, ticket, offline data, event, job or log |

### Holds and changes made by the buyer (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `hold-extends-once-only` | BO-24 | An extension moves the hold's and every claim's expiry in one batch; a second request is refused; with `box-office.baskets.extend-by` at zero none is given |
| `self-cancel-respects-the-cut-off` | BO-22 | With the setting on, a buyer cancels before the cut-off and is refunded less the stated fee; after it, and with the setting off, the request is refused |
| `buyer-exchange-charges-the-stated-fee` | BO-55 | A buyer's exchange collects the price difference and the stated fee, or refunds the difference less the fee, and keeps the original seats if the new ones cannot be had |
| `voided-after-download-is-flagged` | BO-41 | A ticket cancelled after a device loaded its offline data and then admitted offline is flagged on the door report when the scan syncs |

### Wheelchair spaces and companions (integration)

| Name | Proves | Case |
| --- | --- | --- |
| `wheelchair-space-takes-its-seats-or-nothing` | BO-18 | A space that removes 2 seats, with 1 seat left in the seating pool: no claim is made in either pool. With 2 left: one wheelchair claim and two displaced claims, and the seating pool is full |
| `last-seats-space-or-seat-not-both` | BO-18 | 20 buyers for the last 2 seats race 20 buyers for a space that needs them: either the space is sold or the seats are, never both, and both counters equal their live claims |
| `displaced-seats-return-with-the-space` | BO-18 | Cancelling, expiring or exchanging a wheelchair space releases its displaced claims in the same batch, and the seats resell |
| `permanent-space-touches-no-seat` | BO-18 | A space in a band with no displaced band claims one unit of its own pool and leaves every seating counter unchanged |
| `companion-allowance-holds-under-concurrency` | BO-18 | A holder allowed 1 companion opens two baskets at once for one performance: one companion ticket is issued. An allowance of 0 issues none, and a companion ticket never outlives the ticket it accompanies |

## Ordinary cases

### Unit

- Price selection: the newest effective price wins; a performance price beats a production price; a withdrawn price removes the ticket type.
- Discounts: percent, amount and set-price codes; rounding is half-up to the minor unit, per ticket; a discount never takes a line below zero.
- Booking fee: per order and per ticket; none at the desk unless set; refunded or kept per setting.
- Expected cash: float plus cash in less cash out.
- State tables: every transition in part 3 allowed, every other refused.
- Waiting-list order: earliest that fits, skipping parties too large.
- Period routing: which period a date falls in, across a year end and a daylight-saving change.
- Reference codes: no ambiguous characters, no offensive words from a block list.

### Integration

- Every setting in part 6 is read at the write path: change it, and the next write obeys it.
- Every ability in part 6 guards its routes: without it, refused with a reason.
- Every scheduled task run twice in a row changes nothing the second time.
- Module switches: with Box office off, its routes answer 404 and Payments and Finance still work; Box office refuses to switch on without Payments and Finance.
- With Front of house off, admission needs an ordinary grant and nothing errors.
- `core.change-guard` refuses cancelling, rescheduling or moving a performance with tickets until a decision is recorded; the refusal carries the question for a person who may answer it and none for anyone else; the core's event then runs that decision.
- Waiting list: offer, accept, lapse, next offer, stop before curtain.
- Complimentary tickets: request, approve within cap, refuse over cap, issue.
- Sessions: one open per person; close blocked by a pending attempt; variance posting.

### End to end

| Journey | Checks |
| --- | --- |
| Guest buys two tickets on a phone | Three screens, countdown, email with two codes, order link works signed out |
| Guest reserves, then pays at the desk | Email confirmation step, reference and desk code, found at the desk in three letters, one press takes payment and admits |
| Sold out while choosing | Honest message, waiting-list offer |
| Card declined, then succeeds | Seats still held between tries; one order |
| Returning before the provider answers | Waiting screen, then confirmation |
| Countdown nearly over | One offer of more time, then none |
| Desk sale by reader, by cash | Session bar, change shown, tickets emailed |
| Reader gives no answer | The honest screen and its three choices |
| Door: admit, already in, wrong night | One word and colour each; counts move |
| Door: requirement not met | The source's words, Send to the desk, and Admit anyway only for a holder of the ability |
| Door offline | Banner, queue count, sync on return |
| Cancel and refund from the order screen | Second approver, seats back on sale |
| Buyer cancels from the email link | Offered only when the setting is on and before the cut-off; fee shown before confirming |
| Close a period | Blockers listed, close, late posting lands in the next period |

Every end-to-end journey is also run with a keyboard only and through an automated accessibility check; the countdown and the scan result are checked with a screen reader script.

## Load and deployed checks

Not part of every run. Before the first release, and after any change to the claim batch:

| Check | Target |
| --- | --- |
| The capacity cases against a deployed D1 database | Same results as local |
| An on-sale rush: 500 baskets opened in 10 seconds for a 150-seat performance | No oversell; refusals are sold-out answers, not errors; median claim under one second |
| A full season's ledger reconciliation at realistic volume | Completes within a scheduled task's limits |

## What the tests cannot show

- A real provider's behaviour under its own outages. The fake provider models what the providers document; a manual test script against each real provider's test mode is part of adding that provider.
- A real card reader. Pairing and a live tap are a manual checklist.
- Email delivery. Tests assert the job was queued with the right content, not that it arrived.
