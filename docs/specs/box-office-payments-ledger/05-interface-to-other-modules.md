# 4. Interface to other modules

## Dependencies

| Module | `requires` | `uses` | Why |
| --- | --- | --- | --- |
| `finance` | none | none | The ledger stands alone. Any module that handles money requires it |
| `payments` | `finance` | none | Posts fees, payouts, variances and unfulfilled payments |
| `box-office` | `payments`, `finance` | `membership`, `front-of-house`, `communications` | Calls Payments to collect and refund, and Finance to post sales. The soft links run through points and facts only |

No loop: Payments never imports Box office. It reaches the owner of an intent through the point `payments.settlement`, which Box office contributes to. This follows the Foundations rule that Box office and Bar each require Payments, with no either-or dependency.

## Services

Every service that writes takes the caller's unit of work and adds statements to it; none commits on its own (Foundations draft 1). Reads are plain functions.

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
| `createIntent(uow, { owner, amount, currency, channel, expiresAt, sessionId? })` | write | Adds an open intent. One open intent per owner |
| `cancelIntent(uow, intentId)` | write | Guarded: no attempt pending, unknown or succeeded |
| `startAttempt(intentId, { method, providerAccountId, readerId?, amount? })` | own unit of work | Writes the attempt, then calls the provider. Returns what the screen needs next: a redirect, a client secret, "waiting for the reader", or nothing for cash |
| `answerAttempt(attemptId, answer, source)` | own unit of work | Records an answer. If it completes the intent, runs the owner's settle handler in the same batch |
| `requestRefund(uow, { attemptId, amount, owner, requestedBy })` | write | Adds a refund in `requested`, or `approved` when the rules allow one step |
| `intentStatus(intentId)` | read | State, amounts paid and refunded, and whether anything is pending or unknown |
| `methodsFor(channel)` | read | The payment methods on offer, from active provider accounts and their capabilities |
| `openSession(uow, …)`, `closeSession(uow, …)` | write | Till sessions |

`startAttempt` and `answerAttempt` own their unit of work because they sit either side of a call to a provider, which cannot be inside a database batch.

### `#modules/box-office`

| Service | Kind | Does |
| --- | --- | --- |
| `availability(performanceId)` | read | Per band: capacity, free units, lowest price, and the sale state. For public pages and the season calendar |
| `salesSummary(filter)` | read | Counts and face value by performance, band, ticket type and channel. For production and finance reports |
| `ticketsFor(accountId)` | read | A person's upcoming and past tickets, for their account page |
| `attendance(performanceId)` | read | Sold, admitted and not yet arrived, for front of house |
| `claimSeats(uow, …)`, `releaseHold(uow, holdId, reason)` | write | For a later module that sells into the same house (a membership benefit, a workshop place) |

## Extension points

### Offered by Payments

| Point | Kind | A contribution is |
| --- | --- | --- |
| `payments.provider` | code | A payment provider. Contract below |
| `payments.settlement` | code | An owner module's handlers for its intents: `settle(uow, intent)`, `cannotSettle(intent)` and `refunded(uow, refund)`. Box office contributes one for `order`; Bar will contribute one later |

**The provider contract.** A provider declares what it can do and implements only that.

| Member | Required | Meaning |
| --- | --- | --- |
| `capabilities` | yes | Any of: `online-card`, `reader`, `cash`, `attested`, `refund`, `partial-refund`, `fees-reported`, `payouts-reported`, `webhooks`, `test-mode` |
| `start(attempt)` | yes | Begin a payment. Returns the next step for the screen, and a provider reference if there is one |
| `status(attempt)` | if not attested | Ask the provider for the truth now. Used by the poll, by reconciliation and after every webhook |
| `cancel(attempt)` | if `reader` | Stop a payment waiting on a reader |
| `refund(refund)` | if `refund` | Send money back, with the refund's idempotency key |
| `verifyWebhook(request)` | if `webhooks` | Check the signature and return the provider's event id, type and the attempt it concerns |
| `fees(attempt)`, `payouts(since)` | if reported | For the fee and payout postings |
| `secrets`, `setupStep` | yes | The Worker secrets it needs (`when-used`) and its page in guided setup |

Two families fall out of the capabilities. An **integrated** provider answers for itself (Stripe online; a SumUp reader through its cloud API, which reports the result by webhook and by status call, [SumUp Cloud API](https://developer.sumup.com/terminal-payments/cloud-api)). An **attested** provider has no API in the loop: a person states the outcome (cash; a standalone card machine). An attested card payment records who attested it and can be refunded only by a person attesting the refund.

Providers shipped in the first release are a question for Matt (part 9). Whatever the answer, `cash` and `attested-card` ship, because they need no account anywhere and make the desk usable on day one.

### Offered by Box office

| Point | Kind | A contribution is |
| --- | --- | --- |
| `box-office.eligibility` | code | A rule that decides whether a buyer may have a ticket type or price, such as "is a current member". Membership contributes one; Box office never names Membership |
| `box-office.checkout-question` | data | A form (from the form builder) asked at checkout for a production, such as dietary needs for a dinner show. Later release |
| `box-office.ticket-delivery` | code | A way to deliver a ticket. Email with a QR code ships; wallet passes and print-at-desk are later contributions |

### Contributed by these modules to other modules' points

| Point | From | Contribution |
| --- | --- | --- |
| `core.booking-action` | Box office | The "Book now", "Sold out, join the waiting list", "On sale Friday 10 am" or "Sales closed" action for a performance on public pages |
| `core.change-impact` | Box office | What a change to a performance would touch: "42 tickets in 17 orders, £504 paid" |
| `core.change-guard` | Box office | Refuses cancelling or moving a performance with sold tickets until a person has chosen what happens to them: refund all, offer exchange, or keep (for a moved time) |
| `core.navigation` | all three | Console entries: Box office (Sell, Orders, Door, Performances, Complimentary, Reports), Payments (Sessions, Refunds, Providers), Finance (Ledger, Periods, Accounts). Account shell: My tickets |
| `core.setup-step` | all three | Finance: confirm currency and accounts. Payments: add a provider. Box office: first ticket types and prices |
| `core.health-check` | all three | Unsealed postings (expect zero); attempts unknown for more than an hour; intents unfulfilled without a refund; pool counters that differ from a count of live claims (expect zero); hold sweep last ran; each provider answered today |
| `core.erasure-handler` | Box office, Payments | Blanks the columns part 2 marks, deletes waiting-list rows, and asks each integrated provider to delete its customer record where it holds one |
| `core.record-resolver` | all three | Titles and links for order, ticket, refund, session, posting and period |
| `front-of-house.eligibility` | none | Nothing: the box office does not decide who may work a shift |

Added after workstream 2's ruling on people without a sign-in (16 November):

| Point | From | Contribution |
| --- | --- | --- |
| `core.erasure-hold` | Box office, Payments | Erasure of an account waits while it has a ticket for a performance still to come, a payment that is pending or unknown, or a refund not yet completed, and says which |
| `core.account-section` | Box office | "Tickets and orders" on the audience side of a person's account |

**Service used from identity.** `findOrCreateAccount(address, name, origin)` at checkout and at the desk, so every order for a named person is keyed to an account, claimed or not. The box office stores no name or address of its own. The one exception this workstream keeps is an anonymous walk-up sale at the desk, where the buyer gives no details and the order has no account; raised with workstream 2.

## Events

An event row rides in the same batch as the change (Foundations). Payloads are identifiers only.

### Announced

| Event | When | Payload |
| --- | --- | --- |
| `box-office.performance.opened`, `.paused`, `.closed` | Sale state changes | `performanceId` |
| `box-office.performance.sold-out`, `.available-again` | A pool reaches zero free, or leaves it | `performanceId`, `bandId` |
| `box-office.order.confirmed` | Paid, or free and confirmed | `orderId`, `performanceIds` |
| `box-office.order.cancelled` | Lines cancelled | `orderId`, `cancellationId` |
| `box-office.order.exchanged` | Exchange completed | `orderId`, `cancellationId` |
| `box-office.order.expired` | Basket or unpaid order lapsed | `orderId` |
| `box-office.ticket.admitted` | Admitted at the door | `ticketId`, `performanceId` |
| `box-office.waitlist-entry.offered`, `.lapsed` | Waiting-list movement | `entryId` |
| `box-office.comp-request.requested`, `.decided` | Complimentary tickets | `requestId` |
| `payments.intent.succeeded`, `.unfulfilled`, `.expired` | Intent state | `intentId`, owner |
| `payments.attempt.unknown` | No answer in time | `attemptId` |
| `payments.refund.requested`, `.succeeded`, `.failed` | Refund state | `refundId`, owner |
| `payments.session.closed` | Cashed up | `sessionId` |
| `finance.period.closed`, `.reopened` | Period close | `periodId` |

### Which events reach outgoing webhooks

Foundations rules E6 and E7 (16 November): every announced event is deliverable to an outgoing webhook unless it declares `internal: true` in `events.announces`, and an event on a record type whose table has a subject must state `internal` either way. A webhook delivery carries the event's name, time, ids and the record's public title. So every event below states it, and the payload rule above is binding: ids only, never a name, an address, an amount tied to a person, or free text. The public title of an order, ticket or refund is its reference number, never the buyer's name.

| Event | `internal` | Why |
| --- | --- | --- |
| `box-office.performance.opened`, `.paused`, `.closed` | false | Sale state is public; useful to a website or a listings feed |
| `box-office.performance.sold-out`, `.available-again` | false | Public availability |
| `box-office.order.confirmed`, `.cancelled`, `.exchanged` | false | The sales feed an outside system most plausibly wants (accounts, reporting). Carries the order reference and performance ids only, so it says a sale happened, not who bought |
| `box-office.order.expired` | true | An abandoned basket is noise outside, and a trace of someone who did not buy |
| `box-office.ticket.admitted` | true | One person's attendance at one time; frequent on the night; nothing outside needs it |
| `box-office.waitlist-entry.offered`, `.lapsed` | true | About one named person's request |
| `box-office.comp-request.requested`, `.decided` | true | About a named recipient and a staff decision |
| `payments.intent.succeeded`, `.unfulfilled`, `.expired` | true | Plumbing between Payments and the owning module; the order event is the outward fact |
| `payments.attempt.unknown` | true | Operational alarm for staff |
| `payments.refund.requested`, `.failed` | true | In-flight states, approval and provider trouble |
| `payments.refund.succeeded` | false | Money left; the counterpart of the order feed. Refund reference and owner ids only |
| `payments.session.closed` | false | Till cashed up; no subject |
| `finance.period.closed`, `.reopened` | false | Books closed; no subject |

Never-regress case `webhook-payload-carries-no-person` (part 8): for every event marked false, the delivered body is checked against the data-class registry and fails if any field is of a personal, free-text or person-tied money class.

### Heard

| Event | By | Reaction |
| --- | --- | --- |
| `core.performance.cancelled` | Box office | Pause sales; open the bulk cancellation the change guard already collected a decision for |
| `core.performance.rescheduled` | Box office | Recompute on-sale and off-sale times; message ticket holders; open exchanges or refunds per the decision |
| `core.performance.completed` | Box office | Close sales and the waiting list; queue income recognition |
| `core.account.merged` | Box office | Move orders, passes and waiting-list entries to the surviving account |
| `core.setting.changed` | Box office | Nothing stored depends on a setting, so only the public availability cache is cleared |

**Messages to audiences are Box office's job.** The core tells nobody when a performance is cancelled or moved, because only the box office knows the ticket holders (workstream 3). Box office sends: order confirmation with tickets, a reminder (optional), cancelled, rescheduled, refund sent, waiting-list offer, and "your payment did not complete". Each is queued as a job through the communications service and respects the core's suppression list for anything that is not transactional.

## Jobs and scheduled tasks

| Name | Kind | Does |
| --- | --- | --- |
| `box-office.sweep-holds` | task, every 5 minutes | Releases expired holds that no purchase has cleaned up lazily; expires their orders; makes the next waiting-list offers |
| `box-office.open-sales` | task, every 5 minutes | Puts performances on sale at `on_sale_at` and closes them at `off_sale_at` |
| `box-office.recognise-income` | task, daily | Posts deferred income for performances that have completed |
| `box-office.cancel-order` | job | One order of a bulk cancellation |
| `box-office.send-tickets` | job | Builds and sends one order's tickets |
| `payments.reconcile-attempts` | task, every 5 minutes | Asks providers about pending and unknown attempts |
| `payments.handle-webhook` | job | Processes one stored webhook event |
| `payments.send-refund` | job | Calls the provider for one approved refund |
| `payments.fetch-fees` | task, daily | Fees and payouts from providers that report them |
| `payments.prune-webhooks` | task, daily | Deletes webhook rows past retention |

All are safe to run twice: each is a guarded transition or carries an idempotency key.

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
| Foundations (1) | Unit of work; points with code contracts; secrets as `when-used`; one queue and one cron | Matches draft 1 |
| Foundations (1) | The data-class column layout | Sub-tab still empty; part 2 uses its own layout until then |
| Identity (2) | Guest checkout without an account, and a later "claim this order" into an account; preset role names for part 6 | Assumed |
| Core domain (3) | `core.booking-action`, `core.change-impact`, `core.change-guard`; vocabularies; the suppression list; `operatingDayOf` and `dayBounds`; performance events | Agreed by relay |
| Core domain (3) | A space's own capacity, to compare a pool against | Assumed |
| Form builder (5) | A form attachable to a checkout | Later release |
| Interface (6) | The shells; an offline-capable page pattern for the door; a countdown component | Assumed |

## Points raised for the integrating thread

1. **Provider credentials.** Foundations rules that secrets are Worker secrets and never in the database. That fits API keys. It does not fit a provider joined by an OAuth connection, where the token is issued at runtime. Part 9 asks Matt; if in-app connection is wanted, Foundations needs an encrypted-credential store.
2. **Erasure of append-only columns.** Two columns in append-only tables hold personal free text and must be blanked on erasure. The trigger allows that one update. Foundations' data-class format should have a way to say so.
3. **A service with its own unit of work.** `startAttempt` and `answerAttempt` commit themselves, because a provider call sits between their writes. This is the one exception to "a service never commits" and is declared here so the lint rule can allow it by name.
