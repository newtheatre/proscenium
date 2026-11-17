# 4. Interface to other modules

## Dependencies

| Module | `requires` | `uses` | Why |
| --- | --- | --- | --- |
| `finance` | none | none | The ledger stands alone. Any module that handles money requires it |
| `payments` | `finance` | `front-of-house` | Posts fees, payouts, variances and unfulfilled payments. Contributes till figures to the night report when Front of house is on |
| `box-office` | `payments`, `finance` | `front-of-house`, `communications`, `forms` | Calls Payments to collect and refund, and gives it the entries for sales. The soft links run through points and facts only, and Box office calls no service of a module it only uses |

Box office does not name Membership at all. A member price is a requirement reference checked through the kit, so it works with any module that provides requirements and needs no `uses` link.

No loop: Payments never imports Box office. It reaches the owner of an intent through the point `payments.settlement`, which Box office contributes to. This follows the Foundations rule that Box office and Bar each require Payments, with no either-or dependency.

## Services

Every service that writes takes the caller's unit of work and adds statements to it; none commits on its own. The one exception Foundations allows is a call to an outside system through `externalCall`, which `startAttempt` uses. Reads are plain functions.

### `#modules/finance`

| Service | Kind | Does |
| --- | --- | --- |
| `postEntries(uow, posting)` | write | Adds a posting, its entries and its seal. Refuses in the batch if the entries do not sum to zero, the period is closed, or the idempotency key exists. Resolves a closed period to the earliest open one |
| `reversePosting(uow, postingId, reason)` | write | Adds the mirror-image posting with `reverses_id` set |
| `accountFor(systemKey, scope?)` | read | The account id behind a system key, such as the clearing account of a provider account |
| `balances(filter)` | read | Totals by account, period, production or performance. The only way another module reads the ledger |
| `isPeriodOpen(date)` | read | For screens that warn before a late posting |

### `#modules/payments`

| Service | Kind | Does |
| --- | --- | --- |
| `createIntent(unit, { parts, currency, channel, expiresAt, sessionId? })` | write | Adds an open intent and one part for each entry of `parts`, each `{ owner: { module, record }, amountMinor }`. The intent's amount is the sum of its parts. Refused in the batch if any of those records already has an open intent |
| `collect(unit, { parts, currency, expiresAt })` | write | The online counterpart of the till, for an owner with its own checkout page such as a membership fee: `createIntent` on the online channel. The page then calls `startAttempt` with the intent it returns |
| `cancelIntent(unit, intentId)` | write | Guarded: no attempt pending, unknown or succeeded |
| `startAttempt(intentId, { method, providerAccountId, readerId?, amount? })` | `externalCall` | Writes the attempt, calls the provider through the kit's `externalCall`, and records what came back. Returns what the screen needs next: a redirect, a client secret, "waiting for the reader", or nothing for cash |
| `answerAttempt(unit, attemptId, answer, source)` | write | Records an answer in the caller's unit of work: the webhook job, the reconcile task or the attest route creates it. If the answer completes the intent, every part's settle handler adds to the same unit |
| `requestRefund(unit, { partId, attemptId, amount, requestedBy })` | write | Adds a refund of one part in `requested`, or `approved` when the stored limit allows one step |
| `intentStatus(intentId)` | read | State, amounts paid and refunded by part, and whether anything is pending or unknown |
| `methodsFor(channel)` | read | The payment methods on offer, from active provider accounts and their capabilities |
| `openSession(unit, …)`, `closeSession(unit, …)` | write | Till sessions |

`startAttempt` is the only service here that commits on its own, and it does so through `externalCall`, because a call to a provider cannot sit inside a database batch. Payments' manifest declares each provider's calls under `calls`, as Foundations requires. `answerAttempt` is an ordinary write: the answer, the settlement and the posting are one batch in the caller's unit of work.

### `#modules/box-office`

| Service | Kind | Does |
| --- | --- | --- |
| `availability(performanceId)` | read | Per band: capacity, free units, lowest price, and the sale state. For public pages and the season calendar |
| `salesSummary(filter)` | read | Counts and face value by performance, band, ticket type and channel. For production and finance reports |
| `ticketsFor(accountId)` | read | A person's upcoming and past tickets, for their account page |
| `attendance(performanceId)` | read | Sold, admitted and not yet arrived, for front of house |
| `claimSeats(uow, …)`, `releaseHold(uow, holdId, reason)` | write | For a later module that sells into the same house (a membership benefit, a workshop place) |

## Extension points

### Offered by Payments and Finance

| Point | Kind | A contribution is |
| --- | --- | --- |
| `payments.provider` | code | A payment provider. Contract below |
| `payments.settlement` | code | An owner module's handlers for its parts: `settle(unit, part)` and `refunded(unit, part, refund)`. Each adds its own statements and returns its ledger entries. Box office contributes one for orders; Bar and Membership fees contribute their own |
| `payments.desk-basket` | code | A module's panel in the till, with `prepare` and an optional `attach`. Contract under "One payment with several owners" below |
| `finance.system-account` | data | A ledger account a module posts to: `{ key, name, kind, taxCode? }`. Finance creates it locked, keyed `<module>.<key>` |

**The provider contract.** A provider declares what it can do and implements only that.

| Member | Required | Meaning |
| --- | --- | --- |
| `capabilities` | yes | Any of: `online-card`, `reader`, `cash`, `attested`, `refund`, `partial-refund`, `fees-reported`, `payouts-reported`, `webhooks`, `test-mode` |
| `start(attempt)` | yes | Begin a payment. Returns the next step for the screen, and a provider reference if there is one |
| `status(attempt)` | if not attested | Ask the provider for the truth now. Used by the reconcile task, by reconciliation and after every webhook |
| `cancel(attempt)` | if `reader` | Ask the provider to stop a payment waiting on a reader. The attempt is cancelled only when the provider confirms |
| `refund(refund)` | if `refund` | Send money back, with the refund's idempotency key. The refund carries what Payments has already seen refunded, so a provider with no keys can compare and send nothing twice |
| `verifyWebhook(request)` | if `webhooks` | Check the signature, or the provider's own proof where it signs nothing, and return the provider's event id, type and the attempt it concerns. It is given the request's address and the provider account |
| `fees(attempt)`, `payouts(since)` | if reported | For the fee and payout postings |
| `secrets` | yes | The Worker secrets it needs (`when-used`). The first release connects every provider this way |
| `credentials` | optional | A credential (`oauth` or `api-key`) held in the core's encrypted credential store, for connecting from inside the application. Declared now and built later (Matt, question 3), so nothing may assume a key only ever comes from a secret |
| `calls` | if it calls out | The outside hosts it reaches, for the manifest's `calls` entry |
| `setupStep` | yes | Its page in guided setup |

Two families fall out of the capabilities. An **integrated** provider answers for itself (Stripe online; a SumUp reader through its cloud API, which reports the result by webhook and by status call, [SumUp Cloud API](https://developer.sumup.com/terminal-payments/cloud-api)). An **attested** provider has no API in the loop: a person states the outcome (cash; a standalone card machine). An attested card payment records who attested it and can be refunded only by a person attesting the refund.

**A provider that keeps no idempotency keys or signs no webhooks** (the SumUp reader is both) must reach the same two guarantees another way, and the contract allows for it:

- Asked once. The attempt's id travels with the request as the provider's own reference, and a repeated start looks the transaction up by that reference before asking again. A refund compares what the provider has already refunded with the refunds Payments has recorded as succeeded, and sends nothing the provider already has.
- Told truthfully. An unsigned webhook is only a prompt: its address carries a token Payments can verify, and the job then reads the transaction from the provider. Nothing settles on the webhook's own word.
- A provider with `reader` also implements `pairReader`. Cancelling at the reader is `cancelAttempt`, and the attempt becomes cancelled only when the provider says so: if the payment went through first, the provider's answer wins and the attempt succeeds.
- A reader request with no transaction ten minutes after it was sent fails as not started. The seller is not held for that time: they may cancel and take the payment another way, and a late success on the abandoned attempt is refunded as money for an unfulfilled intent. Cancelling an intent whose attempt is still in flight asks the reader to stop as a best effort and does not wait for its answer; the intent stays cancelled whatever arrives. A till session cannot close while one of its attempts is still in flight, so its totals are final when it does; the close screen names the attempt and the latest time it can resolve.

**Two SumUp providers.** A SumUp account that cannot use the Cloud API (the Nottingham New Theatre's is the students' union's, which works only with SumUp's older app hand-off, Payment Switch) is served by a second provider. Each provider account is one or the other, and a till offers the reader method of every account it has, so it may offer either or both.

- `sumup` is the Cloud API, an integrated provider as described above.
- `sumup-handoff` opens the SumUp app on the till's device with the total, the currency and the attempt's id as the app's reference. The contract's next step for it is `{ kind: 'handoff', url }`. The app returns to an address for that one attempt, signed with the kit's signing keys under the purpose `payments.handoff`.
- The app's answer is unsigned by SumUp, so it is recorded as a claim by the person at the till, exactly as an attested card payment is: success makes the attempt succeed, anything else fails it, and SumUp's transaction code is kept for reconciliation against the SumUp statement.
- An attempt with no answer becomes unknown through the reconcile task and is resolved by a person. Refunds are made in the SumUp app and confirmed by a person, as for attested.

Matt chose the first providers (part 9, question 2): cash and attested card, then Stripe online, then the SumUp reader. `cash` and `attested-card` need no account anywhere and make the desk usable on day one.

**Test mode.** A provider account is `live` or `test` (part 2), and test money never touches a live record or the ledger:

- `startAttempt` refuses a test account for any intent with a part owned by a module other than Payments. Nothing a customer or seller can reach offers a test account.
- Settling checks the account's mode again, as a backstop for an account switched part-way. If it is `test`, no owner's handler runs, the intent is left unfulfilled and the payment is refunded, so no live order, tab or fee is ever confirmed by test money.
- The "test payment" in guided setup (PAY-01) is an intent with one part that Payments itself owns, for the record `payments.test-payment`. Its handler returns no entries, and Payments writes no posting for a test-mode payment or its refund. There is no test account in the ledger: the clearing accounts hold only real money, so reconciliation needs no exclusions.
- The attempt and its events are kept as for any payment and show as test on the provider's page. Sales figures, reconciliation and payout matching read live accounts only.

### Offered by Box office

| Point | Kind | A contribution is |
| --- | --- | --- |
| `box-office.checkout-consent` | code | Consent questions shown at the details step of checkout, and the statements that record the answers. Contract under "Checkout consent" below |
| `box-office.door-code` | code | Another kind of code the door screen can read, such as a membership card. Contract under "The door" below |
| `box-office.ticket-delivery` | code | A way to deliver a ticket. Email with a QR code ships. Wallet passes and print-at-desk are unscheduled |

**Checkout questions are not a point of Box office's** (integration ruling R-17). Form builder owns `forms.slot`, and Box office contributes one slot to it, `box-office.checkout-questions`, whose subject is a ticket type; part 6 declares the record type `box-office.ticket-type` for it. It is a later story in both specifications, and the exact call is settled when that story is specified, within the rule that a module which only uses another may not call its services. Member prices and other per-person conditions are not a point either: they are requirement references checked through the kit (below).

### Contributed by these modules to other modules' points

| Point | From | Contribution |
| --- | --- | --- |
| `core.booking-action` | Box office | The booking action for a performance on public pages, in one of the core's five states (mapping below) |
| `core.change-impact` | Box office | What a change to a performance would touch: "42 tickets in 17 orders, £504 paid" |
| `core.change-guard` | Box office | Refuses cancelling, rescheduling or moving a performance with live tickets or reservations until a decision is recorded on Box office's Bulk cancellation screen, and links to it. Refuses a capacity below the seats claimed (part 3) |
| `core.navigation` | all three | Each entry names its menu in the field `menu`. Menu `console`, group Box office: Sell, Orders, Performances, Complimentary, Reports. Menu `console`, group Money: Payments' Sessions, Needs attention, Refunds and Providers, and Finance's Ledger, Periods and Accounts; there is no Payments or Finance group. Menu `live`: Door, at `/live/door`. Menu `account`: My tickets. Counts registered: `payments.refunds-awaiting` on Refunds and `payments.needs-attention` on Needs attention |
| `core.tonight-tile` | Box office | The Door tile on the Tonight hub, shown to anyone who may admit for tonight's performance. A Sell at the desk tile opens the console desk |
| `core.record-tab` | Box office | A Tickets tab on a production: sold and free by performance, a link to set-up, and the price grid |
| `core.search-source` | Box office | Orders, by reference. A search by a person's name goes through their account |
| `core.quick-action` | Box office | Sell tickets |
| `core.home-card` | Payments | "4 refunds awaiting approval" and "2 payments need attention", each to holders of the matching ability |
| `core.account-section` | Box office | "Tickets and orders", target `account`, on the audience side |
| `core.notification-type` | Box office, Payments | The message types listed under Events below |
| `core.setup-step` | all three | Finance: confirm currency and accounts. Payments: add a provider. Box office: first ticket types and prices |
| `core.health-check` | all three | Unsealed postings (expect zero); attempts unknown for more than an hour; intents unfulfilled without a refund; pool counters that differ from a count of live claims (expect zero); when each task last ran; each provider answered today |
| `core.erasure-handler` | Box office, Payments | Clears the columns part 2 marks, deletes waiting-list rows, and asks each integrated provider to delete its customer record where it holds one |
| `core.erasure-hold` | Box office, Payments | Erasure of an account waits while it has a ticket for a performance still to come, a payment that is pending or unknown, or a refund not yet completed, and says which |
| `core.privacy-record` | all three | What each module holds about a person and why, from the data classes in part 2 |
| `core.export-contributor` | Box office | A person's orders, tickets, passes and complimentary requests, for "download my data" |
| `core.record-resolver` | all three | Titles and links for order, ticket, refund, session, posting and period |
| `forms.slot` | Box office | `box-office.checkout-questions`, subject a ticket type. Later |
| `communications.audience-source`, `front-of-house.tonight-figure`, `front-of-house.report-section` | Box office, Payments | Listed in their own sections below |

**The booking action in the core's states.** The core defines five states for a booking action. Box office maps its sales record onto them:

| Sales record | Core state | Label |
| --- | --- | --- |
| No sales record, or `draft` with no `on_sale_at` | none | Box office contributes nothing; the core shows its external booking link, or no action |
| `draft` with `on_sale_at` set | `not-yet` | "On sale Friday 10 am" |
| `on_sale`, free seats above `box-office.availability.show-remaining-under` | `available` | "Book now" |
| `on_sale`, free seats at or under it | `limited` | "14 seats left" |
| `on_sale`, no pool has a free seat | `sold-out` | "Sold out", with "Join the waiting list" when the waiting list is on |
| `paused` | `closed` | "Sales paused" |
| `closed` | `closed` | "Sales closed" |

**Service used from identity.** `findOrCreateAccount(address, name, origin)` at checkout and at the desk, so every order for a named person is keyed to an account, claimed or not. The box office stores no name or address of its own. The one exception is an anonymous walk-up sale at the desk, where the buyer gives no details and the order has no account (integration ruling R-15; part 2).

## Events

An event row rides in the same batch as the change (Foundations). Payloads are identifiers only.

### Announced

| Event | When | Payload |
| --- | --- | --- |
| `box-office.performance.opened`, `.paused`, `.closed` | Sale state changes | `performanceId` |
| `box-office.performance.sold-out`, `.available-again` | A pool reaches zero free, or leaves it | `performanceId`, `bandId` |
| `box-office.order.reserved` | A basket is reserved, seats claimed and nothing paid | `orderId`, `performanceIds` |
| `box-office.order.confirmed` | Paid, or free and confirmed. Announced once, including for a reservation paid later | `orderId`, `performanceIds` |
| `box-office.order.cancelled` | Lines cancelled, on a paid order or a reservation | `orderId`, `cancellationId` |
| `box-office.order.exchanged` | Exchange completed | `orderId`, `cancellationId` |
| `box-office.order.expired` | A basket or unpaid order lapsed, or a reservation was released unclaimed | `orderId` |
| `box-office.ticket.admitted` | Admitted at the door | `ticketId`, `performanceId` |
| `box-office.waitlist-entry.offered`, `.lapsed` | Waiting-list movement | `entryId` |
| `box-office.comp-request.requested`, `.decided` | Complimentary tickets | `requestId` |
| `payments.intent.succeeded`, `.unfulfilled`, `.expired` | Intent state | `intentId`, and each part's owner |
| `payments.attempt.unknown` | No answer in time | `attemptId` |
| `payments.refund.requested`, `.succeeded`, `.failed` | Refund state | `refundId`, `partId`, owner |
| `payments.session.closed` | Cashed up | `sessionId` |
| `finance.period.closed`, `.reopened` | Period close | `periodId` |

### Which events reach outgoing webhooks

Foundations rules E6 and E7 (16 November): every announced event is deliverable to an outgoing webhook unless it declares `internal: true` in `events.announces`, and an event on a record type whose table has a subject must state `internal` either way. A webhook delivery carries the event's name, time, ids and the record's public title. So every event below states it, and the payload rule above is binding: ids only, never a name, an address, an amount tied to a person, or free text. The public title of an order, ticket or refund is its reference number, never the buyer's name.

| Event | `internal` | Why |
| --- | --- | --- |
| `box-office.performance.opened`, `.paused`, `.closed` | false | Sale state is public; useful to a website or a listings feed |
| `box-office.performance.sold-out`, `.available-again` | false | Public availability |
| `box-office.order.reserved`, `.confirmed`, `.cancelled`, `.exchanged` | false | The sales feed an outside system most plausibly wants (accounts, reporting). Carries the order reference and performance ids only, so it says a booking happened, not who made it |
| `box-office.order.expired` | true | An abandoned basket or an unclaimed reservation is noise outside, and a trace of someone who did not buy |
| `box-office.ticket.admitted` | true | One person's attendance at one time; frequent on the night; nothing outside needs it |
| `box-office.waitlist-entry.offered`, `.lapsed` | true | About one named person's request |
| `box-office.comp-request.requested`, `.decided` | true | About a named recipient and a staff decision |
| `payments.intent.succeeded`, `.unfulfilled`, `.expired` | true | Plumbing between Payments and the owning modules; the owner's own event is the outward fact |
| `payments.attempt.unknown` | true | Operational alarm for staff |
| `payments.refund.requested`, `.failed` | true | In-flight states, approval and provider trouble |
| `payments.refund.succeeded` | false | Money left; the counterpart of the order feed. Refund reference and owner ids only |
| `payments.session.closed` | false | Till cashed up; no subject |
| `finance.period.closed`, `.reopened` | false | Books closed; no subject |

Never-regress case `webhook-payload-carries-no-person` (part 8): for every event marked false, the delivered body is checked against the data-class registry and fails if any field is of a personal, free-text or person-tied money class.

### Heard

| Event | By | Reaction |
| --- | --- | --- |
| `core.performance.cancelled` | Box office | Pause sales and run the decision recorded before the core would cancel: one `box-office.cancel-order` job per order |
| `core.performance.rescheduled` (a new time) | Box office | Recompute on-sale and off-sale times; tell ticket holders the new time; tickets stay valid; run the recorded decision (keep, offer exchange, or refund) |
| `core.performance.moved` (a new space) | Box office | Tell ticket holders the new place; read `capacityOf` again and flag the on-sale checklist if the pools now exceed it. An allocated performance stays paused until it has a plan for the new space |
| `core.performance.capacity-changed` | Box office | Compare the pools' total with the new figure and flag the on-sale checklist if it is exceeded. No pool is changed automatically |
| `core.performance.scheduled` with `reinstated` | Box office | Sales stay paused until a person resumes them. Orders cancelled while it was cancelled are not revived |
| `core.performance.completed` | Box office | Close sales and the waiting list. Income recognition is the daily task's, not this listener's |
| `core.setting.changed` | Box office | Nothing stored depends on a setting, so only the public availability cache is cleared |

An account merge needs no listener. Identity moves or aliases every row from the column declarations in part 2 alone. A waiting-list entry has no account and is not moved.

**Messages to audiences are Box office's job.** The core tells nobody when a performance is cancelled, rescheduled or moved, because only the box office knows the ticket holders. Every message is sent with the core's `notify`, inside the unit of work that causes it, and each kind is declared as a contribution to `core.notification-type`. Nothing is sent any other way, and Communications, which is for mailings, is not involved.

| Type | Sent to | When |
| --- | --- | --- |
| `box-office.order-confirmed` | the buyer | Confirmed, with tickets |
| box-office.reservation-confirm | the buyer | The link a buyer who is not signed in must press before their basket becomes a reservation (part 3, "Confirming by email"). Email only: the link is a sealed variable. Sent with notifyAddress to the address the basket holds, because no account exists until the link is pressed. A sealed message cannot be sent again once cleared, so "send it again" issues a new link |
| `box-office.order-reserved`, `box-office.reservation-reminder`, `box-office.reservation-released` | the buyer | Reserved, by email only because it carries the desk code and the order's link, both declared as sealed variables (Core part 4, "A variable that carries a secret"); the reminder with the amount due; released unclaimed |
| `box-office.order-cancelled` | the buyer | Lines cancelled, with any refund; email and inbox |
| `box-office.performance-cancelled`, `box-office.performance-rescheduled`, `box-office.performance-moved` | every ticket holder | The core's change, with what happens to their tickets |
| `box-office.ticket-reminder` | the buyer | `box-office.tickets.reminder-before` ahead, when set |
| `box-office.waiting-list-joined`, `box-office.waiting-list-offer` | the address on the entry | Joined; seats offered |
| `box-office.payment-not-completed` | the buyer | An unfulfilled payment, with the refund on its way |
| `payments.refund-sent` | the payer | A refund succeeded |
| `payments.attempt-unknown`, `payments.refund-awaiting-approval` | staff holding the matching ability | The alarms behind Needs attention and Refunds |

All are on the audience side except the two staff alarms, and all are service messages, never marketing. A waiting-list entry has no account, so its two messages go through `notifyAddress`; an anonymous desk sale has nobody to write to. The core applies its suppression list to every delivery, service messages included, and Box office adds no rule of its own.

## Jobs and scheduled tasks

| Name | Kind | Does |
| --- | --- | --- |
| `box-office.sweep-holds` | task, every 5 minutes | Releases expired holds that no purchase has cleaned up lazily; expires their orders; makes the next waiting-list offers |
| `box-office.open-sales` | task, every 5 minutes | Puts performances on sale at `on_sale_at` and closes them at `off_sale_at` |
| `box-office.release-reservations` | task, every 5 minutes | Expires reserved orders whose `release_at` has passed, skipping any marked `keep` or with an attempt in flight |
| `box-office.send-reservation-reminders` | task, every 15 minutes | Queues the reminder for reservations that have reached `box-office.reservations.remind-before` |
| `box-office.send-ticket-reminders` | task, hourly | Queues the optional reminder for paid tickets |
| `box-office.recognise-income` | task, daily | Posts deferred income for performances the core reports completed. The one trigger for recognition |
| `box-office.apply-retention` | task, daily | Clears what the retention settings in part 6 say to clear |
| `payments.reconcile-attempts` | task, every 5 minutes | Asks providers about pending and unknown attempts |
| `payments.expire-intents` | task, every 5 minutes | Expires open intents past `expires_at` with no attempt pending or unknown, and calls `release` for each part. The backstop for a sale prepared and never paid |
| `payments.fetch-fees` | task, daily | Fees and payouts from providers that report them |
| `payments.prune-webhooks` | task, daily | Deletes webhook rows past retention |
| `box-office.cancel-order` | job | One order of a bulk cancellation |
| `box-office.send-tickets` | job | Builds and sends one order's tickets |
| `payments.handle-webhook` | job | Processes one stored webhook event |
| `payments.send-refund` | job | Calls the provider for one approved refund |

In Foundations' words a task runs on the one cron and a job is one piece of queued work. All are safe to run twice: each is a guarded transition or carries an idempotency key.

## Routes that are not behind an ability

| Route | Declared as | Protection |
| --- | --- | --- |
| `GET /api/box-office/availability/…` | public | Read rate limit; cached briefly |
| `POST /api/box-office/baskets` and its children | public | Write rate limit per address and per basket; Turnstile on basket creation when the secret is set; the order cap |
| `GET /api/box-office/orders/by-token/…` | public | The guest token from the confirmation email, stored hashed |
| `POST /api/payments/webhooks/<provider-account>` | public | The provider's signature; unverified events are stored and never acted on |

## What this workstream needs from the others

| From | Need | Status |
| --- | --- | --- |
| Foundations (1) | Unit of work; points with code contracts; `externalCall` and manifest `calls`; secrets as `when-used` and the encrypted credential store; one queue and one cron; the data-class column layout; erasable columns in append-only tables | Ruled |
| Foundations (1) | `core.requirement` with presented values, evidence, `summary` and `holder`; kit signing (story F-37) | Ruled |
| Identity (2) | `findOrCreateAccount`; the order with no account listed under "People without a sign-in" (R-15); merge by column declaration; the preset role keys used in part 6 | Agreed |
| Core domain (3) | `core.booking-action`, `core.change-impact`, `core.change-guard`; vocabularies; `notify`, `notifyAddress` and `core.notification-type`; `operatingDayOf`, `dayBounds`, `capacityOf`, `spaceCapacity` and `doors_at`; the performance events, including moved, capacity-changed and reinstated | Agreed, including the change guard and the decision it waits for (R-11) |
| Form builder (5) | `forms.slot`, for checkout questions | Later release (R-17) |
| Interface (6) | The shells; the Live page pattern for the door; `core.tonight-tile`; a countdown component | Agreed (R-22) |
| Communications | `communications.audience-source`; a contribution to `box-office.checkout-consent` | Agreed |
| Membership, Bar, Front of house | The contracts in the sections below | Agreed with each |

## One payment with several owners

The rules are in part 3, "One payment for tickets and something else". These are the contracts, agreed with the Bar and Membership specifications.

**The till.** Payments owns a small desk component, the till, which hosts `payments.desk-basket`, shows the one total and takes the payment. Box office's desk screen is the till with Box office's own panel first. Box office contributes to the point on the same terms as any other module, so a theatre with a bar and no box office still has a till.

**`payments.desk-basket` (code point).** A contribution gives:

| Member | Meaning |
| --- | --- |
| `id`, `label` | Kebab-case id and the panel's name |
| `ability` | The ability a seller needs to see and use the panel |
| `panel` | The component shown in the till |
| `summary(context)` | Lines and an amount for display. Reads only |
| `prepare(unit, context)` | Adds to the unit of work whatever makes the sale real but unpaid, and returns `{ owner: { module, record }, amountMinor }` with `amountMinor` above zero. Called in the batch that creates the intent |
| `attach(unit, record, intentId)` | Optional. Called after the intent is created, in the same unit, so the owner can write the intent's id onto its own record. Box office uses it to set the order's intent |

Payments makes one intent with one part per owner. Undoing `prepare` is not the panel's job: it is `release` on the owner's `payments.settlement` handler (below), because an owner paid online with no desk panel needs it too. `release` is called for every part when the payment is cancelled, fails for good, or the intent expires; the task `payments.expire-intents` is the backstop, so a crash between `prepare` and payment cannot strand stock or seats.

**Online, any module can own a payment.** A part's owner is a module and a record, with nothing special about orders. An owner with its own checkout page, such as a membership fee, calls `collect` with its parts and then `startAttempt`; at the desk it contributes a panel and is paid inside the seller's till session, alone or beside tickets.

**Who starts an online payment.** Payments has no public route for starting an attempt, and should not: only the owner knows who may pay for its record. The owner's own route does it. For Box office, checkout creates the intent with `collect` (one part owned by `box-office`), and a second route starts the attempt with `startAttempt` for whoever holds the basket's token, using the first online method or a provider account the page named. A buyer who is not signed in has their account found or made at checkout with no email confirmation, since paying is the proof a reservation lacks.

**Finding an order by a person.** Box office never searches accounts itself. Wherever a screen finds orders or tickets by a person's name or email (the desk, the Orders list, Find by name at the door), it calls Identity's `findAccounts(text)`, exported from the core's services, which answers a subquery of account ids that Box office passes to `inAccountScope` on the order's account. It searches names and verified emails only, needs at least three letters, and follows merges. The call needs the ability core.account.find and writes one audited read that names the list and never holds the text typed. box-office.order.view implies that ability (part 6), so anyone who may open the orders list or the door list may search it by name, and no role needs it granted separately. Each call names the list it serves by its registered id, box-office.orders for the Orders list and the desk and box-office.door-list for Find by name at the door; an unknown id is refused. Search by order reference, by desk code and by scanning needs none of this. Until `findAccounts` lands, the desk ships with reference and desk code only, and the screens say that search by name is not yet available. A basket waiting for its email to be confirmed has no account, so it is found by reference only.

**`payments.settlement` (code point).** A handler's `settle(unit, part)` and `refunded(unit, part, refund)` add their own statements and return their ledger entries. Payments writes one sealed posting: the money line, plus every part's entries. A handler may also give `release(unit, part)`, which undoes whatever made the sale real but unpaid and must be safe to call twice; an owner with nothing to undo leaves it out.

- A part's entries must total exactly that part's amount. The seal then checks the whole posting balances.
- A handler may post only to accounts whose `module` is its own.
- A handler never commits and never calls a provider. A handler that breaks either rule above is treated as an owner refusing, not as an error: the provider's answer is still recorded, nothing settles, and the intent becomes unfulfilled with the money held in payments.unfulfilled and refunded. An attempt always ends in a recorded answer, even when an owner's code is wrong.

**No partial settlement, in both directions.** If any handler refuses or throws, nothing settles: no tickets, no bar sale, no posting. The attempt's money is real, so the intent becomes unfulfilled and the ordinary unfulfilled-payment path refunds it in full. If the bar's part refuses, the reservation stays reserved; if the tickets' part refuses, the drinks are not sold.

**Refunds are per part, and Payments' abilities are owner-neutral.** `payments.refund.request` and `payments.refund.approve` belong to Payments and say nothing of orders. The owning module decides who may start a refund of its own record with its own ability (`box-office.order.refund` here), then calls `requestRefund` with the part. A refund can never exceed its part, and a refund spanning two owners is two refunds, each approved on its own.

**`finance.system-account` (data point).** A module declares the ledger accounts it posts to: `{ key, name, kind, taxCode? }`, where `kind` is income, liability, asset or expense. Finance creates each as a locked account keyed `<module>.<key>`, and the module obtains it with `accountFor`. Part 2 lists what Box office and Payments declare. In the first release only the no-tax code exists, so it is every declaration's default.

An account belongs to one module (`finance_accounts.module`): set by Finance for a declared account, and chosen by the administrator for an account they add to the chart, such as a snacks income account given to the bar. So a treasurer shapes the chart, a module offers only its own accounts in its pickers, and no module can post into another's.

**`finance.period-close-check` (code point).** Finance requires no other module, so it cannot look in their tables to see what should hold up a close. A contribution is given a period and returns blockers, each `{ sentence, link }`; it reads only and never commits. Payments contributes two: a till session opened in the period and still open, and an intent from the period that is unfulfilled without a refund. Box office contributes one: a performance completed in the period whose income the task `box-office.recognise-income` has not yet moved. The close screen lists every blocker and the close is refused while any remains.

**When income counts is the owner's choice, not Finance's.** Finance has no recognition rule. An owner that returns entries crediting its income account at settlement has recognised the income when paid. An owner that credits a liability account it declared, and later posts the move to income itself, has deferred it. "At the performance" is Box office's rule for tickets and binds nobody else.

## Checkout consent and audience sources

Agreed with Communications. The sources ship with the Communications module; the point is designed in now.

**The point `box-office.checkout-consent`** (code). A contribution supplies its questions (a key, the wording, never pre-ticked) and a function `record({ orderId, accountId, keys })` that returns statements.

- Box office shows the questions at the details step and calls `record` once, when the order is first confirmed or first reserved, adding the statements to that batch. Consent is written with the order or not at all, exactly once. It is not read again when a reservation is later paid.
- The order has no consent column. The contributing module holds the record, including the exact wording shown, and answers for its erasure.
- No consent key is carried in any event payload: order events are deliverable to outgoing webhooks, and a list of what one buyer agreed to is about a person.
- A desk or phone sale shows no consent questions in the first release: consent ticked by a seller on someone's behalf is weak evidence. An order with no account is never passed to `record`.
- `record` returns statements only and may not read or commit. A contribution that throws fails the checkout with a plain message, since silently dropping a consent the buyer gave would be worse than asking them to try again.

**Audience sources contributed to `communications.audience-source`.** Each returns account ids, never names or addresses. Consent and the suppression list are applied by Communications and the core, not here.

| Source | Who it returns | Limits |
| --- | --- | --- |
| `box-office.ticket-holders-of-performance` | Accounts with a confirmed or reserved order for the performance | Cancelled and expired orders excluded |
| `box-office.ticket-holders-of-production` | The same across a production's performances | The same |
| `box-office.booked-recently` | Accounts with a confirmed order in the last N months | N cannot exceed the order retention period |
| `box-office.waiting-list-of-performance` | Waiting-list entries for the performance | Returns email subjects, since an entry has no account. Usable only for a message about that performance, never for marketing: the source declares `purpose: 'service'` |

An order with no account appears in no source. There is nobody to write to.

## Requirements: member prices and the check at entry

Foundations ruled one point for every per-person condition, `core.requirement`, and no module declares its own. Box office names no module that provides one.

**Selling.**

- A ticket type holds `requirement_refs`: plain-text references such as `membership:<scheme id>`, `membership:any` or `fact:<name>`, chosen from the kit's picker.
- When a buyer adds that ticket type, and again in the batch that confirms or reserves the order, Box office calls `requirements.check(refs, { account, at, record })` with the performance as the record.
- **Met:** the type is offered. **Not met:** it is not sold, and the reason the source gives is shown. **Unavailable** (the providing module is off or absent): the kit only reports it and the host chooses, and Box office withholds the ticket type and says why on the on-sale checklist. Otherwise switching Membership off would hand the member price to everyone.
- A reservation is checked when it is made and its price fixed then.
- At the desk a seller with `box-office.ticket-type.override-requirement` may sell the type to someone who does not meet it, such as a member not yet recorded. The override needs a reason and is audited with who allowed it.
- A concession that depends on proof shown at the door (a student card) is not a requirement. It stays a `proof_note` on the ticket type.

**Buying by reference.** A requirement may be presentable: the source describes a value a person can type, with a label and a shape. A buyer whose account does not meet such a requirement still sees the ticket type listed, and on choosing it sees one field inside it, labelled with the whole phrase from `requirements.describe` printed unchanged (for the Nottingham New Theatre, "NNT member? Enter your University of Nottingham student ID"). The field never appears as a general box on the order, nor on a ticket type without that requirement. A seller at the desk sees the same field. Box office passes the value to `requirements.check` and keeps only the evidence id it returns. The value itself is never stored, logged or put in an event, and the kit rate limits a check that carries one.

- A well-formed miss shows the source's message and help link, and the ticket type stays withheld.
- **Tickets for friends.** Each ticket of such a type is met on its own. The buyer's account meets at most one; every further ticket shows its own field, labelled for another person. An order may hold several member tickets, each with its own evidence id.
- **One membership, one ticket.** `max_per_holder` (default 1) limits live tickets of the type per performance for one holder, counted on both keys: by account, on the kit's account scope (the survivor and its aliases), whenever the ticket keeps one, and by evidence id whenever it keeps one. A claim is refused when a live ticket matches on either key, as a conditional write inside the claim batch. A source returns the same evidence for a person whether they were checked by account or by typed reference, so one membership cannot be used twice by two routes. Counting by account as well covers a person who holds two memberships of one scheme after an account merge: two evidence ids, one account, one ticket. A ticket met by a typed reference keeps the holder's account as well as the evidence whenever the source's answer names one (the met answer's holderAccountId, which Membership returns when the membership belongs to an account; the name awaits Foundations' confirmation), so the same person is caught by that route too; a holder with no account is counted by evidence alone.

**What the ticket keeps.** `requirement_ref`, and at least one of `requirement_account_id` and `requirement_evidence_id` (part 2).

**Checking again at entry.** When the ticket type has `recheck_at_entry` (the default), and always for a ticket met by evidence, the scan calls `requirements.check` again with what the ticket kept.

| Answer | At the door |
| --- | --- |
| Met | Admitted as usual |
| Not met | Not admitted; the scan is stored as `requirement_not_met` and shows the source's words, such as "Membership not current". The steward sends the person to the desk, where the seller exchanges the ticket for one they qualify for and takes the difference. Someone holding `box-office.ticket-type.override-requirement` sees "Admit anyway" (below) |
| Unavailable, or the device is offline | Admitted, and listed on the night report as unchecked. A source being down must not hold the queue |

A reservation still holds its price until the night, but the check at entry applies to it; where payment is taken at the desk on arrival, the seller simply changes the ticket type before taking payment.

## The door

The door screen, the scan route, the offline data and the code format belong to Box office (confirmed with Front of house). The door is a Live page at `/live/door` (integration ruling R-22).

**Outcomes and the one override** (integration ruling R-30). Every scan ends in one of the results in `box_office_scans.result`. Only one of them offers an override at the door:

| Outcome | Shown | Action offered |
| --- | --- | --- |
| Admitted | "Admitted" | None |
| Already admitted | "Already in", with when and at which door | Undo a mis-scan: `box-office.ticket.admit` and a reason. No second admission |
| Requirement not met | The source's words | "Admit anyway", for a holder of `box-office.ticket-type.override-requirement`, with a reason from the theatre's list. Without the ability: "Send to the desk" |
| Wrong performance | Which performance the ticket is for | None; the desk can exchange it |
| Void (cancelled, refunded, exchanged or reissued) | Which | None |
| A desk code or reservation reference | "Not paid. Send to the desk" | None. No scan row is written |
| Unknown code, bad signature | "Not one of our tickets" | None |

An override is audited with who allowed it and why, stored on the scan row, and refused when the ticket is on the overrider's own order or was met by their own account. Nobody lets themselves in.

**Sound** (integration ruling R-29). `box-office.scanning.result-sound` is off by default. When on, the device plays one sound per scan result.

**One line about the requirement.** When a scanned ticket has a `requirement_ref`, the screen shows one line under the result, and the words are the source's: Box office shows the answer's `summary` and adds nothing, for example "Member: current until 14 March 2027". For a ticket met by evidence the line always ends by asking to see the card, and the steward may scan or enter the reference to compare evidence ids.

**The name at the door** (Matt, 16 November: names help prevent misuse). For a ticket that keeps an evidence id, the door screen and the desk call `requirements.holder(ref, evidence)` when online and show "Card should be in the name of …" under the result. The kit applies the ability the source declared (for Membership, `membership.verification-list.check`, granted to stewards through the on-shift fact) and records the read without the name. The name is never written to the scan row, the ticket, the offline data, an event, a job or a log, and a buyer never sees it. When the call returns nothing, or the device is offline, the screen shows the summary alone and says the name could not be fetched.

**Offline.** The offline data for a performance is built when the device opens the door screen and refreshed while it is connected: ticket ids, code hashes and states, the signing public keys, and for each ticket with a requirement the last answer's summary and the time it was made. Offline, the screen shows that line with its time ("as of 18:40"). A ticket with no stored answer, and every ticket met by evidence, shows "Ask to see the card". These scans are listed on the night report as unchecked.

**Code format, and other modules' codes.** Every code the door screen reads has four parts joined by full stops: `<kind>.<key id>.<code>.<signature>`. The kind is a short lower-case word, the code is 128 random bits in base32, and the signature is made by the kit's signing service over the first three parts, so a device can verify any code offline with the public keys in its offline data. Tickets use the kind `tkt`. The database stores the hash of the code part, which is all a scan or a device ever uses, and an encrypted copy kept only to show the ticket again (part 2). A module adds a kind through the code point `box-office.door-code`: its contribution gives the kind, the ability needed to scan it, and `resolve(code)` returning a headline and one line to show. Scanning a code of another kind never admits anyone and writes no scan row; it only shows what the contribution returns. Offline, a contributed code is verified as genuine and shown as "Genuine card, not checked".

**Signing** (Foundations, story F-37). The kit owns the keys; there is no signing secret of Box office's own. Box office declares the signing purpose `box-office.door-code` in its manifest and calls `signing.sign`, `signing.verify` and `signing.publicKeys`; kinds added through the code point are signed under the same purpose, through the point, so no other module handles a key. A signature proves only that the theatre issued the code, so the list of live tickets is still what decides admission. Proposed values: `rotateEvery` 90 days and `keepFor` 48 months, because a key must outlast the longest-lived thing signed under it and a membership card can run for 36 months. Retiring a key at once invalidates every code it signed, tickets and cards alike, and the administrator's screen must say so.

## Front of house

**Scanning on shift (BO-44).** The ability `box-office.ticket.admit` is mapped to the fact `front-of-house.on-shift` on record type `core.performance`, so a confirmed shift lets a steward scan that performance only. With Front of house off, the ability comes from a role as usual.

**Contributions to Front of house**, declared under `uses` by both modules, so they do nothing while it is absent. Numbers and ids only.

| Point | From | What it gives for a performance |
| --- | --- | --- |
| `front-of-house.tonight-figure` | Box office | Sold, reserved and not yet paid, admitted, still to come, remaining capacity |
| `front-of-house.tonight-figure` | Box office | Ticket takings so far by method (reader, cash, attested card, online), from Payments, which Box office requires |
| `front-of-house.report-section` | Box office | The same figures as final numbers, plus counts of reservations released unclaimed, complimentary tickets, refunds on the night, tickets admitted unchecked or by override, and tickets admitted offline and flagged |
| `front-of-house.report-section` | Payments | Till sessions closed on that operating day: expected cash, counted cash, difference, by session id |

Payments does not know what a performance is, so it answers by the performance's operating day (the core's calendar helper); takings by performance come from Box office. Finance contributes nothing: the ledger is not a night report.

**`front-of-house.night-report.signed-off` is not listened to.** Income is recognised by the daily task once the core reports the performance completed, and a till session closes by its own cash-up. Tying money to a volunteer signing a report would let a forgotten signature hold up the books.

## Access needs

Access needs are a part of the core that Identity specifies as the access scheme: a person applies once, and while their application is accepted the fact `core.access-scheme` is true for them and their needs are on record, drawn from the vocabulary `core.access-need`. Box office neither owns that record nor reads it freely, and nobody ticks needs at checkout.

- **The purpose.** Box office declares one purpose through the point `core.access-purpose`: id `box-office.booking`, side audience, a sentence explaining that the theatre uses the needs to prepare for the visit, and the ability a member of staff must hold to read through it, `box-office.order.view-access-note`. Applying to the scheme agrees to this purpose.
- **At checkout** a signed-in buyer on the scheme has their needs carried onto the booking and is shown that this is happening. A buyer who is not on the scheme books as anyone does and is pointed to the application.
- **At the desk and by phone** a seller holding the ability calls `accessNeedsFor(actor, accountId, 'box-office.booking', performance)`, which answers for an accepted person. For anyone else the seller asks and types.
- **The order keeps its own copy** in `access_note` (part 2), a special-category column with Box office's own retention, so a booking is honoured as it was made. A later change to the person's record does not change the order, and an exchange carries the copy to the new performance. An order with no account never holds one, because nothing could later find it to erase it.
- **The named list of tonight's needs stays on Box office's own screen (integration ruling R-32).** It is read through the service `accessNeedsOf(performanceId)`, which only Box office's own screens call. Front of house does not depend on Box office and calls nothing of its. The named list is Box office's access list for a performance, a Live page at /live/door/\<performance>/access that works on a phone, guarded by the same ability and audited as a read. Box office contributes a count per need to front-of-house.tonight-figure, numbers only, and sets that figure's link (its to field) to the access list, so a front-of-house manager opens it from Tonight and no name crosses into Front of house's tables or the night report.
- **The door** shows a mark on the scan result when the ticket's order holds access needs. Every scanner sees the mark, because it carries no detail and tells the steward to fetch whoever can help. A scanner holding box-office.order.view-access-note can tap it to open the needs for that order, and each opening is recorded as a read. A scanner without the ability sees the mark and the words "Ask the front-of-house manager", and the tap does nothing. Offline, the mark is in the offline data and the detail is not, so the tap says it needs a connection. No need, term or note is carried in any event, job payload or log.
- **A need reserves nothing.** A wheelchair space, a transfer seat and a companion ticket are booked as tickets (part 3, "Wheelchair spaces, transfer seats and companions").
- **What Box office names from the scheme.** The fact `core.access-scheme`, for a ticket type the theatre keeps for people on the scheme, and the value `core.access-scheme.companions`, for the companion allowance. Both are named in a ticket type's `requirement_refs` and checked through `core.requirement` like any other requirement, for the buyer's own session at checkout. Accepted is enough to book; verified is Identity's separate mark and Box office does not ask for it unless the theatre's setting makes the allowance depend on it. The companion answer carries a quantity (Foundations), which Box office copies onto the order line and uses as the condition on its claim statement; it goes in no summary, event or job. The scheme's sources are guarded by an ability, so they are checked once, in the buyer's or seller's session, and the result is stored: a ticket met by them is not checked again at entry, whatever the ticket type's recheck setting, because a steward or a job would be answered not met. A seller checking for a customer needs box-office.order.view-access-note, and the check is recorded as a read.
