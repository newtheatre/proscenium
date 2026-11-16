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

**Cancelling, rescheduling or moving a performance with tickets** (integration ruling R-11). Box office's contribution to `core.change-guard` refuses the core's change while the performance has live tickets or reservations and no decision is recorded, and the refusal links to the Bulk cancellation screen. There a person with `box-office.performance.manage` records the decision on the sales record: refund all, offer exchange, or keep (not offered for a cancellation). The core's change then goes through, and its event runs the recorded decision as jobs (see Cancelling). Box office never refunds without that decision.

**Capacity.** The core owns a performance's capacity, read through `capacityOf(performance)`, which falls back to the space's own. Box office owns the pools that divide it into bands. The pools of a performance may not sum to more than `capacityOf` unless a person with `box-office.performance.exceed-venue` confirms it, which is recorded on the pool. A change the core makes to capacity is checked the other way, through the change guard: Box office refuses a figure below the seats already claimed and quotes the number. Box office never alters a pool on its own. When the core's capacity falls below the pools' total, or the performance moves to a smaller space, the performance is flagged on the on-sale checklist for a person to resolve.

## An order

```mermaid
---
title: "A reserved order holds its seats; an order is confirmed only when paid"
---
flowchart LR
  basket["Basket"]
  awaiting["Awaiting payment"]
  confirmed["Confirmed"]
  cancelled["Cancelled"]
  expired["Expired"]
  reserved["Reserved<br/>seats held, not paid"]
  basket -->|"check out"| awaiting
  awaiting -->|"payment settles"| confirmed
  confirmed -->|"last line cancelled"| cancelled
  basket -->|"nothing to pay: confirmed at once"| confirmed
  basket -->|"hold runs out"| expired
  awaiting -->|"payment window ends"| expired
  basket -->|"reserve"| reserved
  reserved -->|"released unclaimed"| expired
  reserved <-->|"desk takes payment; back to reserved if it fails"| awaiting
  reserved -->|"cancelled before paying: no refund"| cancelled
  note["Every arrow is one database batch. Confirmed and cancelled orders are never deleted."]
  cancelled ~~~ note
  classDef note stroke-dasharray: 4 4
  class note note
```

*order life cycle · 6 states*

| Transition | Guard | In the same batch |
| --- | --- | --- |
| (none) to basket | Performance is on sale and inside its window; party size within the order cap; the claim batch succeeds | Hold, claims, order, lines |
| basket to awaiting payment | Order is unexpired; the total the screen sent equals the total computed from the lines, else refused quoting both figures; contact details present for the channel | Intent created through Payments with one part for the order; hold kind becomes `payment` and the claims' expiry moves to the payment window |
| basket to confirmed | Total is zero | Claims confirmed, tickets issued, event announced. No intent, no posting |
| awaiting payment to confirmed | The intent has settled for exactly the order total; every claim of the order is still live | Claims confirmed, tickets issued, ledger posting sealed, event announced |
| basket or awaiting payment to expired | `expires_at` has passed and no attempt is pending or unknown | Claims released, promo and pass redemptions released, intent cancelled |
| confirmed to cancelled | The last live line is cancelled | See Cancelling |

### Reserving now and paying on arrival

Some theatres take no money online: people reserve weeks ahead and pay at the desk on the night, on the theatre's card reader. The Nottingham New Theatre sells this way. The order state `reserved` covers it: seats claimed, nothing paid.

**When it applies.** The setting `box-office.checkout.payment-timing` is `pay-now`, `reserve` or `buyer-chooses`. A theatre with no online payment provider connected can only be `reserve`, and the settings screen says why. A performance can override the theatre's value with `payment_timing` on its sales record.

| Transition | Trigger | Guards | Effects, one batch |
| --- | --- | --- | --- |
| basket to reserved | Buyer presses Reserve online, or staff reserve at the desk or by phone | Account present; email confirmed if `box-office.reservations.confirm-email` is on; within the per-order and per-person limits; holds still live; expected total matches | Every claim moves from `held` to `confirmed` and its `expires_at` is cleared; the hold's kind becomes `reservation`; lines fix their price rows; the order gets its reference and desk code; `box-office.order.reserved` is announced; the confirmation message is queued. No payment intent, no tickets, no ledger posting |
| reserved to reserved (amended) | Buyer reduces from the link; staff reduce, add or change a ticket type at the desk | Adding needs free capacity through the ordinary claim; a change of type re-prices that line at the price current when reserved | Claims released or added; lines superseded; amount due recomputed |
| reserved to awaiting payment | Staff press Take payment at the desk | Ability `box-office.order.take-payment`; open till session; expected total matches | Payment intent created for the amount due, with one part for the order and one for each other module's panel in the till. The attempt is then started, its provider call going through `externalCall` |
| awaiting payment to confirmed | Provider or staff report success | As the ordinary settle batch | The settle batch below in its reserved form: the claims are already `confirmed`, so they are asserted and not changed; tickets issued; ledger posting. When staff chose Pay and admit, the tickets are marked admitted in the same batch |
| awaiting payment to reserved | Payment failed or was cancelled | Attempt is final and not succeeded | Order returns to `reserved`; its claims stay `confirmed`; staff may try again or use another method |
| reserved to cancelled | Buyer cancels from the link; staff cancel | None beyond ownership or ability | Claims released; waiting list offered the seats; cancellation row appended; `box-office.order.cancelled` announced. No refund, because nothing was paid |
| reserved to expired | The task `box-office.release-reservations` at the release time; or staff release by hand | Order still reserved; no attempt in flight; not marked `keep` by staff | Claims released; seats go to the waiting list and the door; `box-office.order.expired` announced; buyer told by message |

**Rules.**

- A reserved order claims seats exactly as a paid one does. Its claims are `confirmed` with no expiry, under a hold of kind `reservation`, so capacity, the last-seat guarantee and the seat index do not know the difference and no sweep can take the seats. Only cancelling or releasing the reservation releases them.
- A reserved order has no ledger effect. The ledger records money, and none has moved. Payment at the desk posts to deferred ticket income like any other sale, and the income is recognised by the daily task after the performance has taken place.
- An order whose total is zero (a pass, a complimentary ticket, a free event) never rests in `reserved`: it is confirmed and its tickets issued at once.
- The desk code in the message identifies the order and is stored hashed. It is not an admission ticket, and the door scanner answers "Not paid. Send to the desk" if it is shown there.
- An attempt with no answer leaves the order in `awaiting_payment` and is listed under Needs attention like any other unknown attempt. The release task never releases an order with an attempt in flight.
- Release time is `box-office.reservations.release-before` ahead of the performance's start. Unset means never release automatically. Staff can mark one reservation `keep` (a known latecomer) and can release any by hand.
- Limits: `box-office.reservations.max-tickets-per-order` and `box-office.reservations.max-tickets-per-person` (per performance, across that account's live reservations).
- A reminder is sent `box-office.reservations.remind-before` ahead, with the amount due and the cancel link. The task `box-office.send-reservation-reminders` queues it.
- Payment methods at the desk are whatever Payments has connected: the reader driven from the screen, cash, or a card payment attested by staff when the reader is used on its own.

### One payment for tickets and something else

A theatre with one card reader often sells drinks and snacks in the same card transaction as the tickets, as the Nottingham New Theatre does. Payments therefore takes one payment for several things owned by different modules. The Bar module is specified in its own document; nothing here knows what a drink is.

- A payment intent has one or more **parts**. Each part names its owner (module and record) and its amount. The parts always add up to the intent's amount, checked in the batch that writes them. An ordinary ticket order is an intent with one part.
- The customer sees one total and the reader takes one payment. One attempt, one provider reference.
- The settle batch calls `payments.settlement` once for each part, all in the same batch. The tickets are issued and the other module's sale is completed together, or neither is. A failed attempt leaves every part unsettled and the reservation intact.
- Each owner returns the ledger entries for its part and Payments writes the one sealed posting: the money received, plus every part's entries to its owner's accounts. Ticket income and bar income never mix.
- A refund names a part. The limit that a refund cannot exceed what was paid is kept per part as well as per attempt, so cancelling a ticket cannot refund the drinks.
- The till has a point, `payments.desk-basket`, through which a module adds its own lines to the payment being taken. Box office does not know what a drink is, and a bar module does not know what a ticket is. Each owns its part.
- A payment with no ticket part at all (drinks only) is the same mechanism with one part, so one reader and one till session serve both.

Left to the owning modules: their stock and prices, and whether their items can be added to a reservation in advance.

**Rules for every owner** (contracts in part 4):

- Each owner prepares its own unpaid sale in the batch that creates the intent, and releases it if the payment is cancelled, fails for good or expires.
- Settlement is all parts or none. A refusal by any owner after money was taken makes the intent unfulfilled and refunds the whole payment.
- Each owner returns its ledger entries; Payments writes the one sealed posting. A part's entries total the part.
- A refund names one part and cannot exceed it. Refund abilities belong to Payments and are not worded around orders.
- The till is Payments' component. Box office is one contributor to it among others.

**When the hold starts, and changing a basket.** The hold starts when the first claim batch runs: the buyer presses Hold tickets on Choose tickets, or a seller adds the first ticket. The basket's expiry is set then. Adding tickets is a new claim batch on the same hold; removing one releases that claim. Editing the basket never moves the expiry, so a basket cannot be kept alive for ever. The countdown is shown to the buyer throughout.

**One extension.** In the basket's last minute the buyer is offered a button to extend the hold. One batch moves the order's `expires_at` and the `expires_at` of every claim of its hold forward by `box-office.baskets.extend-by` and sets the order's `extended_at`, guarded on the order being an unexpired basket whose `extended_at` is null, so it happens at most once. Setting the length to zero removes the button.

**After expiry.** An expired basket holds nothing. The browser remembers the lines so that Try again can run a fresh claim batch, which succeeds only if the seats are still free.

**The total.** A line's amount is its list price less its discount, both fixed when the line is written. The order total is the sum of live lines, rewritten in the same batch as any line change. Booking fees are lines, so the total a buyer sees is the total they pay.

## A claim

```mermaid
---
title: "A claim counts against capacity until it is released, and release is final"
---
flowchart LR
  held["Held<br/>counts; has an expiry"]
  confirmed["Confirmed<br/>counts; no expiry"]
  released["Released<br/>frees one unit; final"]
  held -->|"order confirmed"| confirmed
  confirmed -->|"cancelled or exchanged"| released
  held -->|"expired, abandoned, or payment failed"| released
  note["Only triggers move the pool counter: plus one for a live claim, minus one on release."]
  released ~~~ note
  classDef note stroke-dasharray: 4 4
  class note note
```

*claim life cycle · 3 states*

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
| Basket | The first claim batch: Hold tickets online, or the first ticket added at the desk | `box-office.baskets.hold-for` later, plus one extension of `box-office.baskets.extend-by`; or checkout |
| Payment | Payment starts | `box-office.baskets.pay-within` later, or the attempt's answer |
| Reservation | A basket is reserved | No expiry on its claims. Ended by payment at the desk, cancellation, or release (`box-office.reservations.release-before`, or by hand) |
| Staff | A person holds seats, with a label | A date they set, or never; released by hand or sold from |
| Waiting-list offer | An offer is made | `box-office.waiting-list.offer-for` later, or acceptance |

## A ticket

| Transition | Guard | Notes |
| --- | --- | --- |
| (none) to valid | Order confirmed | One per ticket line, with a fresh random code. The signed code goes to the buyer; the database keeps only its hash |
| valid to void | Line cancelled or exchanged, ticket reissued, or performance cancelled | A reissue voids the old code and writes a new ticket, so a forwarded or lost ticket can be killed |
| valid to admitted | `admitted_at` is null; the scanner is set to this ticket's performance; doors are open | One conditional update. A second scan matches no row and is recorded as `already_admitted`, showing when and at which door |
| admitted to not admitted | `box-office.ticket.admit` and a reason code | Writes a `reversed` scan. For a mis-scan at the door |

**Finding a ticket from a scan.** A scanned code is checked for its signature, then hashed, and the ticket is found by `code_hash`. No table stores a code in the clear.

**Scanning offline.** The door device downloads a manifest for one performance: ticket ids, code hashes and states, the signing public keys, and no names unless the theatre turns on `box-office.scanning.names-on-device`. With names off, Find by name works only while online. Offline, the device checks the signature on the code, hashes it, looks it up in its own list, admits locally and queues the scan. Each queued scan has an id the device made in the standard form (`scan_` and 26 characters), so a scan sent twice is stored once. On reconnection two things are flagged on the door report: a ticket two devices both admitted offline (the earlier `scanned_at` wins the admission and the later is stored as `already_admitted`), and a ticket that was voided after the manifest was downloaded and admitted all the same (stored as `void`, with `offline` set). Offline scanning accepts these small risks in exchange for a door that never stops; the setting `box-office.scanning.offline` turns it off for a theatre that would rather not.

## A payment

An **intent** is the decision to collect an amount. An **attempt** is one try at collecting it.

```mermaid
---
title: "A payment attempt always ends in a recorded answer"
---
flowchart LR
  started["Started"]
  pending["Pending<br/>with the provider"]
  succeeded["Succeeded<br/>settles the intent"]
  unknown["Unknown<br/>holds are kept"]
  failed["Failed<br/>buyer may retry"]
  cancelled["Cancelled"]
  started -->|"sent"| pending
  pending -->|"paid"| succeeded
  pending -->|"timed out"| unknown
  pending -->|"declined"| failed
  unknown -->|"reconciled as paid"| succeeded
  unknown -->|"reconciled as not paid"| failed
  started -->|"stopped first"| cancelled
  pending -->|"stop confirmed"| cancelled
  note["Succeeded, failed and cancelled are final. An answer comes from the provider or from a named person."]
  failed ~~~ note
  classDef note stroke-dasharray: 4 4
  class note note
```

*payment attempt life cycle · 6 states*

| Intent transition | Guard |
| --- | --- |
| open to succeeded | Succeeded attempts sum to exactly the intent amount. In the same batch every part's settle handler runs (below) |
| open to cancelled | No attempt is pending, unknown or succeeded |
| open to expired | `expires_at` passed and no attempt is pending or unknown |
| open to unfulfilled | An attempt succeeded but an owner could not settle its part (below) |

| Attempt rule | Detail |
| --- | --- |
| Nothing is written as paid before an answer | A reader or online attempt stays `pending` until the provider answers; a cash or attested attempt is written only when the person confirms it |
| Every answer has a source | The provider (webhook or poll), a named person (attested), or the system (timeout) |
| A timeout is not a failure | An attempt with no answer inside `payments.attempts.answer-within` becomes `unknown`. Its hold is kept. A scheduled task asks the provider until it gets a final answer; a person with `payments.attempt.reconcile` can answer it from the provider's dashboard |
| One live attempt per reader | Unique index |
| A retry is a new attempt | With a new idempotency key. The same key is reused only to repeat the same request after a lost connection |
| Split payment | Several attempts on one intent, desk only; the intent succeeds when they sum to it. If the buyer walks away part-paid, the paid attempts are refunded and the intent cancelled |

**Cancelling at the reader.** Pressing Cancel while a reader attempt is `pending` asks the provider to stop. The attempt becomes `cancelled` only when the provider confirms it stopped. If the reader had already taken the payment, the provider answers paid and the attempt becomes `succeeded` as usual: the provider's answer wins over the press of Cancel, and the seller sees "The reader had already taken the payment". With no answer either way the attempt stays `pending` and then becomes `unknown`. So the moves out of `pending` are to `succeeded`, `failed`, `cancelled` and `unknown`.

### Settling: payment and tickets in one batch

When an attempt's answer makes the intent whole, Payments calls `settle(unit, part)` for every part of the intent (each a contribution to the point `payments.settlement`), inside the one unit of work that records the answer. For a ticket order the single batch holds:

1. Attempt to `succeeded`, guarded on its current state.
2. Intent to `succeeded`, guarded on the sum, and each part's `settled_at` set.
3. Order to `confirmed`, guarded on `awaiting_payment`.
4. Every claim of the order still `held` to `confirmed`, with its `expires_at` cleared and the hold's kind unchanged. For an order paid at checkout this changes every claim. For an order that was reserved it changes none, because its claims have been `confirmed` since it was reserved.
5. An assertion that the order now has exactly as many `confirmed` claims as live ticket lines. It covers both paths, and fails the batch if any claim was released in the meantime.
6. Tickets inserted.
7. Box office returns its ledger entries for the part; Payments writes the posting, its entries and its seal.
8. Audit entry and the events `payments.intent.succeeded` and `box-office.order.confirmed`.

If any statement fails, none of it happened and the attempt is still pending, so the same answer can be processed again safely. A webhook delivered twice finds the attempt already final and changes nothing.

### Money arrives after the seats have gone

It should not happen, because a hold with a pending or unknown attempt is never swept and a reservation with an attempt in flight is never released. It still can: a provider answers days late, or a person released the hold by hand. Then step 5's assertion fails. Payments catches that one named failure and commits a different batch: attempt `succeeded`, intent `unfulfilled`, a ledger posting to the `payments.unfulfilled` account, an automatic full refund requested, and an alert to the box office. The buyer is told the booking did not complete and that their money is on its way back. Nothing is oversold and no money is unaccounted for.

## A refund

| Transition | Guard |
| --- | --- |
| (none) to requested | The attempt succeeded; the amount is above zero; the refund names one part of the intent. The owning module checks its own ability first (`box-office.order.refund` for an order) and then calls Payments. A person starting a refund from Payments' own screens needs `payments.refund.request`. The value of `payments.refunds.self-approve-up-to` at that moment is copied onto the refund as `self_approve_limit_minor` |
| requested to approved | The amount fits within what remains on the part and on the attempt (their CHECKs). The approver is not the requester, unless the amount is at or under the limit stored on the refund: one CHECK on the refund states both halves, so a later change to the setting cannot loosen a refund already requested. Approving needs `payments.refund.approve` |
| approved to sent | Integrated provider: the refund call is made with the refund's idempotency key. Cash or attested: a person confirms they handed the money back |
| sent to succeeded | The provider's answer, or the person's confirmation. The owner's `refunded(unit, part, refund)` returns its entries and Payments writes the posting here |
| sent to failed | The provider refused. The amount is given back to the part's and the attempt's counters and the box office is alerted |
| requested to declined | By an approver, with a reason from the theatre's list. A declined refund was never counted, so no counter changes |

- A refund always goes back by the method that paid. Refunding a card payment in cash is not offered.
- A refund names one part and can never exceed it. A refund across two owners is two refunds, each approved on its own.
- A refund at or under its stored self-approve limit moves from requested to approved in one step, with the requester recorded as the approver.
- An automatic refund (unfulfilled payment, or a bulk cancellation a person has confirmed) is requested by the system, has no requester and needs no second approver.
- Two people refunding the same payment at once cannot both succeed past the amount paid: the counter's CHECK refuses the second.

## Cancelling and exchanging

| Case | Rule |
| --- | --- |
| Buyer cancels online | Allowed only if `box-office.cancellations.by-buyer` is on and the performance is more than `box-office.cancellations.until-before` away. The fee setting is deducted |
| Staff cancel | Cancelling needs `box-office.order.cancel`. Refunding as well needs `box-office.order.refund`, which cancelling does not imply: staff with both choose refund in full or refund less the fee; staff with only the first cancel with no refund, and a refund can be asked for afterwards by someone who holds the second |
| Part of an order | Any subset of lines. A companion ticket cannot remain without a paid ticket |
| Performance cancelled | The decision was recorded before the core would cancel (see A performance on sale). `core.performance.cancelled` runs it: for refund all, every confirmed order is cancelled and refunded in full, booking fee included unless `box-office.cancellations.refund-fee-on-cancelled-show` is off, and every reservation is cancelled. Processed as jobs, one order each, so a failure stops one order and not the run |
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
| counting to closed | Counted cash is entered. If it differs from expected, a variance reason is required and the difference is posted to `payments.cash-variance`. Closing your own session with a variance above `payments.sessions.variance-needs-second-person` needs a second person with `payments.session.close-any` |

Expected cash is the float, plus cash attempts, less cash refunds, in that session.

## What is posted to the ledger, and when

Positive is a debit, negative a credit. Account keys are `<module>.<key>`, declared by the module that posts to them (part 4, `finance.system-account`). `clearing` means `payments.cash` for cash and the provider account's `payments.card-clearing` otherwise.

| Fact | Posted when | Written by | Entries |
| --- | --- | --- | --- |
| Ticket order paid | The settle batch | Payments, from the entries Box office returns | + clearing (total); - `box-office.deferred-ticket-income` (tickets, per performance); - `box-office.booking-fee-income` (fees); - `box-office.donation-income`; - `box-office.pass-liability` (passes sold) |
| Performance takes place | The daily task `box-office.recognise-income`, for each performance the core reports completed and not yet recognised | Box office | + `box-office.deferred-ticket-income`; - `box-office.ticket-income`, per performance |
| Ticket bought with a pass | The confirm batch | Box office | + `box-office.pass-liability`; - `box-office.deferred-ticket-income`, at the pass's per-use value |
| Refund succeeded | The refund's success batch | Payments, from the entries the owner returns | + the income or deferred account the sale credited; - clearing |
| Cancellation fee kept | The cancellation batch | Box office | + `box-office.deferred-ticket-income`; - `box-office.booking-fee-income` |
| Provider fee learned | When the provider reports it | Payments | + `payments.provider-fees`; - clearing |
| Provider pays out | When reported, or entered by hand | Payments | + `payments.bank`; - clearing |
| Cash variance | Session close | Payments | + or - `payments.cash-variance` against `payments.cash` |
| Unfulfilled payment | The unfulfilled batch | Payments | + clearing; - `payments.unfulfilled`; reversed by its refund |

- Every posting carries an idempotency key built from its source (`box-office:order:<id>:paid`), so replaying a batch cannot post twice.
- Ticket income is always deferred until the performance takes place (Matt, question 4). It is one fixed rule with one trigger, the daily task; no event posts it. Advance sales for a show that is later cancelled are therefore never reported as income.
- A correction is a new posting that reverses the old one (`reverses_id`) and, if needed, a second that states the right figures. Nothing is edited.

## Closing a period

| Transition | Guard |
| --- | --- |
| open to closed | `finance.period.close`; every earlier period is closed; no till session that opened in the period is still open; no intent from the period is unfulfilled without a refund; the ledger's total for the period is zero. The close row records the period's debit and credit totals |
| closed to open | `finance.period.reopen`, a privileged ability, with a reason code. A new row; the old close stays in the history |

A posting whose `occurred_at` falls in a closed period is written into the earliest open period instead, keeping its true `occurred_at`, so late facts (a provider fee, a refund) never reopen the books.
