# 3. States and rules

## The rule behind every rule

Every change of state below is **one unit of work, committed as one D1 batch** (Foundations draft 1). A guard is written on the statement itself, as a `WHERE` clause, a CHECK or a trigger, never as a read followed by a write. Where a guarded update could match no rows without raising an error, the batch carries a final assertion that fails it, so a transition either happens whole or leaves nothing behind.

## A performance on sale

| From | To | Guard | Who |
| --- | --- | --- | --- |
| draft | on sale | At least one pool with capacity above zero; every pool's band has at least one price; if any price is above zero, a payment provider is active for the online channel or the performance is desk-only | `box-office.performance.manage`, or automatically at `on_sale_at` |
| on sale | paused | None. New baskets are refused; open baskets may finish | `box-office.performance.manage` |
| paused | on sale | Same as draft to on sale | `box-office.performance.manage` |
| on sale, paused | closed | Automatically at `off_sale_at` online; the desk may sell until the performance ends | system |

When the core announces `core.performance.cancelled`, the box office pauses sales and opens a bulk cancellation for a person to confirm (see Cancelling). It does not refund on its own.

## An order

&#91;embedded content: order life cycle · 5 states\]

| Transition | Guard | In the same batch |
| --- | --- | --- |
| (none) to basket | Performance is on sale and inside its window; party size within the order cap; the claim batch succeeds | Hold, claims, order, lines |
| basket to awaiting payment | Order is unexpired; the total the screen sent equals the total computed from the lines, else refused quoting both figures; contact details present for the channel | Intent created through Payments; hold kind becomes `payment` and its expiry is extended to the payment window |
| basket to confirmed | Total is zero | Claims confirmed, tickets issued, event announced. No intent, no posting |
| awaiting payment to confirmed | The intent has settled for exactly the order total; every claim of the order is still live | Claims confirmed, tickets issued, ledger posting sealed, event announced |
| basket or awaiting payment to expired | `expires_at` has passed and no attempt is pending or unknown | Claims released, promo and pass redemptions released, intent cancelled |
| confirmed to cancelled | The last live line is cancelled | See Cancelling |

### Reserving now and paying on arrival

Added 16 November after Matt described how the Nottingham New Theatre sells: people reserve weeks ahead and pay at the desk on the night, on the theatre's card reader. Draft 1 assumed payment followed the basket within minutes. This section adds one order state, `reserved`, which the order diagram above now shows.

**When it applies.** The setting `box-office.checkout.payment-timing` is `pay-now`, `reserve` or `buyer-chooses`. A theatre with no online payment provider connected can only be `reserve`, and the settings screen says why. A performance can override the theatre's value (a record field defaulting from the setting).

| Transition | Trigger | Guards | Effects, one batch |
| --- | --- | --- | --- |
| basket to reserved | Buyer presses Reserve online, or staff reserve at the desk or by phone | Account present; email confirmed if `box-office.reservations.confirm-email` is on; within the per-order and per-person limits; holds still live; expected total matches | Claims held to confirmed; lines fix their price rows; order gets its reference and desk code; confirmation email queued. No payment intent, no tickets, no ledger posting |
| reserved to reserved (amended) | Buyer reduces from the link; staff reduce, add or change a ticket type at the desk | Adding needs free capacity through the ordinary claim; a change of type re-prices that line at the price current when reserved | Claims released or added; lines superseded; amount due recomputed |
| reserved to awaiting payment | Staff press Take payment at the desk | Ability `box-office.order.take-payment`; open till session; expected total matches | Payment intent created for the amount due; attempt started through `externalCall` |
| awaiting payment to confirmed | Provider or staff report success | As the ordinary settle batch | The ordinary settle batch: attempt, intent, order, tickets issued, ledger posting; plus, when staff chose Pay and admit, the tickets are marked admitted in the same batch |
| awaiting payment to reserved | Payment failed or was cancelled | Attempt is final and not succeeded | Order returns to reserved; seats stay claimed; staff may try again or another method |
| reserved to cancelled | Buyer cancels from the link; staff cancel | None beyond ownership or ability | Claims released; waiting list offered the seats; cancellation row appended. No refund, because nothing was paid |
| reserved to expired | The release job at the release time; or staff release by hand | Order still reserved; no attempt in flight; not marked `keep` by staff | Claims released; seats go to the waiting list and the door; buyer told by email |

**Rules.**

- A reserved order claims seats exactly as a paid one does. Capacity, the last-seat guarantee and the seat index do not know the difference.
- A reserved order has no ledger effect. The ledger records money, and none has moved. Income is posted when the desk takes payment, which is on the performance day, so it is recognised at once.
- An order whose total is zero (a pass, a complimentary ticket, a free event) never rests in `reserved`: it is confirmed and its tickets issued at once.
- The desk code in the email identifies the order. It is not an admission ticket, and the door scanner answers "not paid, send to the desk" if it is shown there.
- An attempt with an unknown outcome leaves the order in awaiting payment and raises the ordinary unfulfilled-payment task. The release job never releases an order with an attempt in flight.
- Release time is `box-office.reservations.release-minutes-before` minutes before the performance starts. Unset means never release automatically. Staff can mark one reservation `keep` (a known latecomer) and can release any by hand.
- Limits: `box-office.reservations.max-tickets-per-order` and `box-office.reservations.max-tickets-per-person` (per performance, across that account's live reservations).
- A reminder is sent `box-office.reservations.reminder-hours-before` hours ahead, with the amount due and the cancel link.
- Payment methods at the desk are whatever Payments has connected: the reader driven from the screen, cash, or a card payment attested by staff when the reader is used on its own.

### One payment for tickets and something else

Added 16 November. The Nottingham New Theatre has one card reader, and the desk often sells drinks and snacks in the same card transaction as the tickets. How a bar or shop is modelled is for a later round, and no bar module is specified here. What this specification guarantees now is that Payments can take one payment for several things owned by different modules.

- A payment intent has one or more **parts**. Each part names its owner (module and record) and its amount. The parts always add up to the intent's amount, checked in the batch that writes them. Draft 1's intent with a single owner is an intent with one part.
- The customer sees one total and the reader takes one payment. One attempt, one provider reference.
- The settle batch calls `payments.settlement` once for each part, all in the same batch. The tickets are issued and the other module's sale is completed together, or neither is. A failed attempt leaves every part unsettled and the reservation intact.
- The ledger posting for the payment has one line for the money received and one line per part to that owner's account, so ticket income and bar income never mix.
- A refund names a part. The limit that a refund cannot exceed what was paid is kept per part as well as per intent, so cancelling a ticket cannot refund the drinks.
- The desk screen gets a point, `payments.desk-basket`, through which another module adds its own lines to the payment being taken. Box office does not know what a drink is, and a bar module does not know what a ticket is. Each owns its part.
- A payment with no ticket part at all (drinks only) is the same mechanism with one part, so one reader and one till session serve both.

Cost now: one table (`payments_intent_parts`), the owner columns move from the intent to the part, and the settle batch loops. Left for later: the bar or shop module itself, its stock and prices, and whether items can be added to a reservation in advance.

**Changing a basket.** Adding tickets is a new claim batch on the same hold; removing one releases that claim. The basket's expiry is set when the first ticket is added and is **not** extended by later changes, so a basket cannot be kept alive for ever. The countdown is shown to the buyer throughout.

**The total.** A line's amount is its list price less its discount, both fixed when the line is written. The order total is the sum of live lines, rewritten in the same batch as any line change. Booking fees are lines, so the total a buyer sees is the total they pay.

## A claim

&#91;embedded content: claim life cycle · 3 states\]

| Rule | How it is enforced |
| --- | --- |
| A pool never holds more live claims than its capacity | CHECK on the pool, fed by triggers (Proof, cases 2, 3 and 7) |
| A seat has one live claim | Partial unique index (Proof, cases 5 and 6) |
| A party is seated whole or not at all | All of its claims are in one batch (Proof, cases 3 and 4) |
| An expired hold never blocks a sale | Every claim batch first releases the pool's expired holds (Proof, case 8) |
| Capacity cannot be cut below what is sold | The same CHECK (Proof, case 10) |
| A released claim cannot come back | Trigger (Proof, case 10) |
| A hold being paid for is not swept | The sweep and the lazy release both skip a hold whose order has an attempt that is pending or unknown |

**Kinds of hold and how long they last.**

| Kind | Starts | Ends |
| --- | --- | --- |
| Basket | First ticket added | `box-office.baskets.hold-for` later, or checkout |
| Payment | Checkout | `box-office.baskets.pay-within` later, or the attempt's answer |
| Staff | A person holds seats, with a label | A date they set, or never; released by hand or sold from |
| Waiting-list offer | An offer is made | `box-office.waiting-list.offer-for` later, or acceptance |

## A ticket

| Transition | Guard | Notes |
| --- | --- | --- |
| (none) to valid | Order confirmed | One per ticket line, with a fresh random code |
| valid to void | Line cancelled or exchanged, ticket reissued, or performance cancelled | A reissue voids the old code and writes a new ticket, so a forwarded or lost ticket can be killed |
| valid to admitted | `admitted_at` is null; the scanner is set to this ticket's performance; doors are open | One conditional update. A second scan matches no row and is recorded as `already_admitted`, showing when and at which door |
| admitted to not admitted | `box-office.ticket.admit` and a reason code | Writes a `reversed` scan. For a mis-scan at the door |

**Scanning offline.** The door device downloads a manifest for one performance: ticket ids, code hashes and states, no names unless the theatre turns names on. Offline, it checks the signature on the QR code and its own list, admits locally and queues the scan. When it reconnects, queued scans are sent with their device-made ids. Two devices that admitted the same ticket offline both keep their record: the earlier `scanned_at` wins the admission, the later is stored as `already_admitted` and flagged on the door report. Offline scanning accepts this small risk in exchange for a door that never stops; the setting `box-office.scanning.offline` turns it off for a theatre that would rather not.

## A payment

An **intent** is the decision to collect an amount. An **attempt** is one try at collecting it.

&#91;embedded content: payment attempt life cycle · 6 states\]

| Intent transition | Guard |
| --- | --- |
| open to succeeded | Succeeded attempts sum to exactly the intent amount. In the same batch the owner's settle handler runs (below) |
| open to cancelled | No attempt is pending, unknown or succeeded |
| open to expired | `expires_at` passed and no attempt is pending or unknown |
| open to unfulfilled | An attempt succeeded but the owner could not settle (below) |

| Attempt rule | Detail |
| --- | --- |
| Nothing is written as paid before an answer | A reader or online attempt stays `pending` until the provider answers; a cash or attested attempt is written only when the person confirms it |
| Every answer has a source | The provider (webhook or poll), a named person (attested), or the system (timeout) |
| A timeout is not a failure | An attempt with no answer inside `payments.attempts.answer-within` becomes `unknown`. Its hold is kept. A scheduled task asks the provider until it gets a final answer; a person with `payments.attempt.reconcile` can answer it from the provider's dashboard |
| One live attempt per reader | Unique index |
| A retry is a new attempt | With a new idempotency key. The same key is reused only to repeat the same request after a lost connection |
| Split payment | Several attempts on one intent, desk only; the intent succeeds when they sum to it. If the buyer walks away part-paid, the paid attempts are refunded and the intent cancelled |

### Settling: payment and tickets in one batch

When an attempt's answer makes the intent whole, Payments calls the owning module's **settle handler** (a contribution to the point `payments.settlement`) inside its own unit of work. For a ticket order the single batch holds:

1. Attempt to `succeeded`, guarded on its current state.
2. Intent to `succeeded`, guarded on the sum.
3. Order to `confirmed`, guarded on `awaiting_payment`.
4. Every claim of the order to `confirmed`, guarded on `held`.
5. An assertion that step 4 changed exactly as many claims as the order has ticket lines.
6. Tickets inserted.
7. Ledger posting, entries and seal.
8. Audit entry and the events `payments.intent.succeeded` and `box-office.order.confirmed`.

If any statement fails, none of it happened and the attempt is still pending, so the same answer can be processed again safely. A webhook delivered twice finds the attempt already final and changes nothing.

### Money arrives after the seats have gone

It should not happen, because a hold with a pending or unknown attempt is never swept. It still can: a provider answers days late, or a person released the hold by hand. Then step 4's assertion fails. Payments catches that one named failure and commits a different batch: attempt `succeeded`, intent `unfulfilled`, a ledger posting to the `unfulfilled_payments` account, an automatic full refund requested, and an alert to the box office. The buyer is told the booking did not complete and that their money is on its way back. Nothing is oversold and no money is unaccounted for.

## A refund

| Transition | Guard |
| --- | --- |
| (none) to requested | The attempt succeeded; amount is above zero. Requesting needs `payments.refund.request` |
| requested to approved | The amount fits within what remains on the attempt (the CHECK); the approver is not the requester (the CHECK), unless the amount is at or under `payments.refunds.self-approve-up-to`; approving needs `payments.refund.approve` |
| approved to sent | Integrated provider: the refund call is made with the refund's idempotency key. Cash or attested: a person confirms they handed the money back |
| sent to succeeded | The provider's answer, or the person's confirmation. The ledger posting is written here |
| sent to failed | The provider refused. The amount is released from the attempt's counter and the box office is alerted |
| requested to declined | By an approver, with a reason code |

- A refund always goes back by the method that paid. Refunding a card payment in cash is not offered.
- A refund at or under the self-approve limit moves from requested to approved in one step.
- An automatic refund (unfulfilled payment, or a bulk cancellation a person has confirmed) is requested by the system and needs no second approver.
- Two people refunding the same payment at once cannot both succeed past the amount paid: the counter's CHECK refuses the second.

## Cancelling and exchanging

| Case | Rule |
| --- | --- |
| Buyer cancels online | Allowed only if `box-office.cancellations.by-buyer` is on and the performance is more than `box-office.cancellations.until-before` away. The fee setting is deducted |
| Staff cancel | `box-office.order.cancel`. Staff choose: refund in full, refund less the fee, or no refund |
| Part of an order | Any subset of lines. A companion ticket cannot remain without a paid ticket |
| Performance cancelled | A person with `box-office.performance.manage` confirms a bulk cancellation. Every confirmed order is cancelled and refunded in full, booking fee included unless `box-office.cancellations.refund-fee-on-cancelled-show` is off. Processed as queued jobs, one order each, so a failure stops one order and not the run |
| Exchange | Old lines become `exchanged` and their claims released; new lines are claimed on the target performance; all in one batch, so the buyer never loses the old seats without getting the new. A price rise creates an intent for the difference and the exchange completes when it settles; a price fall creates a refund |

In every case one batch releases the claims, voids the tickets, updates the lines and total, writes the cancellation row and requests any refund.

## The waiting list

| Transition | Guard |
| --- | --- |
| join | The performance cannot seat the party: the pool has fewer free units than the party size. A party the house can seat is sent to buy instead |
| waiting to offered | Capacity was released and the entry is the earliest that fits. One batch claims the seats under a waiting-list hold and marks the entry; if the claim fails the next entry is tried |
| offered to accepted | The buyer checks out before the offer expires. The hold becomes their basket |
| offered to lapsed | Offer expired. Seats are released and the next entry is offered |
| waiting to left | The person leaves, or is erased |
| any to closed | The performance closes |

Offers go in queue order by `joined_at`, skipping entries too large for what is free. Automatic offers stop `box-office.waiting-list.stop-before` ahead of the performance, after which freed seats simply return to sale.

## Complimentary tickets

| Transition | Guard |
| --- | --- |
| requested | `box-office.comp.request`; quantity within `box-office.comps.per-request` |
| requested to approved | `box-office.comp.approve`; the approver is not the requester (CHECK); the performance's approved complimentary total stays within `box-office.comps.per-performance` |
| approved to issued | The claim batch succeeds. A zero-value order is confirmed and its tickets sent |
| requested to declined, withdrawn | By the approver or the requester |

A complimentary ticket is an ordinary ticket at zero price on a `complimentary` ticket type, so it is scanned and counted like any other and shows separately in sales reports.

## A till session

| Transition | Guard |
| --- | --- |
| open | The person has no other open session; a float is entered (zero is allowed) |
| open to counting | No attempt in the session is pending or unknown |
| counting to closed | Counted cash is entered. If it differs from expected, a variance reason is required and the difference is posted to `cash_variance`. Closing your own session with a variance above `payments.sessions.variance-needs-second-person` needs a second person with `payments.session.close-any` |

Expected cash is the float, plus cash attempts, less cash refunds, in that session.

## What is posted to the ledger, and when

Positive is a debit, negative a credit. `clearing` means `cash` for cash and the provider's `card_clearing` account otherwise.

| Fact | Posted when | Entries |
| --- | --- | --- |
| Ticket order paid | The settle batch | + clearing (total); - `deferred_ticket_income` (tickets, per performance); - `booking_fee_income` (fees); - `donation_income`; - `pass_liability` (passes sold) |
| Performance takes place | A scheduled task after the performance ends | + `deferred_ticket_income`; - `ticket_income`, per performance |
| Ticket bought with a pass | The confirm batch | + `pass_liability`; - `deferred_ticket_income`, at the pass's per-use value |
| Refund succeeded | The refund's success batch | + the income or deferred account the sale credited; - clearing |
| Cancellation fee kept | The cancellation batch | + `deferred_ticket_income`; - `booking_fee_income` |
| Provider fee learned | When the provider reports it | + `provider_fees`; - clearing |
| Provider pays out | When reported, or entered by hand | + `cash` (bank); - clearing |
| Cash variance | Session close | + or - `cash_variance` against `cash` |
| Unfulfilled payment | The unfulfilled batch | + clearing; - `unfulfilled_payments`; reversed by its refund |

- Every posting carries an idempotency key built from its source (`box-office:order:<id>:paid`), so replaying a batch cannot post twice.
- Whether income is deferred until the performance or recognised at sale is the setting `finance.income.recognise`, and a question for Matt in part 9. Deferred is drafted as the default because advance sales for a show that is later cancelled are then never reported as income.
- A correction is a new posting that reverses the old one (`reverses_id`) and, if needed, a second that states the right figures. Nothing is edited.

## Closing a period

| Transition | Guard |
| --- | --- |
| open to closed | `finance.period.close`; every earlier period is closed; no till session that opened in the period is still open; no intent from the period is unfulfilled without a refund; the ledger's total for the period is zero. The close row records the period's debit and credit totals |
| closed to open | `finance.period.reopen`, a privileged ability, with a reason code. A new row; the old close stays in the history |

A posting whose `occurred_at` falls in a closed period is written into the earliest open period instead, keeping its true `occurred_at`, so late facts (a provider fee, a refund) never reopen the books.
