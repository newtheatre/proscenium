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

## Added 16 November: what Communications asked for (its N7)

Agreed, with the rulings below. The sources ship with the Communications module; the column and the point are designed in now.

**Audience sources contributed to `communications.audience-source`.** Each returns account ids, never names or addresses. Consent and the suppression list are applied by Communications and the core, not here.

| Source | Who it returns | Limits |
| --- | --- | --- |
| `box-office.ticket-holders-of-performance` | Accounts with a confirmed or reserved order for the performance | Cancelled and expired orders excluded |
| `box-office.ticket-holders-of-production` | The same across a production's performances | The same |
| `box-office.booked-recently` | Accounts with a confirmed order in the last N months | N cannot exceed the order retention period |
| `box-office.waiting-list-of-performance` | Waiting-list entries for the performance | Returns email subjects, since an entry has no account. Usable only for a message about that performance, never for marketing: the source declares `purpose: 'service'` |

An order with no account (an anonymous desk sale) appears in no source. There is nobody to write to.

**The point `box-office.checkout-consent`.** Another module contributes consent questions to the details step of checkout, each with a key (an id from the core's vocabulary), wording and whether it starts ticked (it never may). Box office shows them, stores the keys that were ticked, and knows nothing of what they mean.

- Stored on the order as `checkout_consent_keys` (personal; cleared on erasure): the ids ticked and nothing else. The lasting consent record belongs to Communications; this column is the evidence of what was ticked at this checkout.
- **Keys are not carried in any event payload.** Order events are deliverable to outgoing webhooks, and a list of what one buyer agreed to is about a person. The event carries the order id; Communications reads `checkoutConsent(orderId)`, a service returning the account id and the ticked keys.
- The event name is `box-office.order.confirmed`, not `order.paid`: an order with nothing to pay is confirmed without a payment. A reservation announces **`box-office.order.reserved`** (new; `internal: false`; payload `orderId`, `performanceIds`), and consent is read then, because that is when the buyer ticked. It is not read again when the reservation is later paid.
- A desk or phone sale shows no consent questions in the first release, so the column is null: consent ticked by a seller on someone's behalf is weak evidence. An anonymous order can never hold keys: `CHECK (account_id IS NOT NULL OR checkout_consent_keys IS NULL)`.
- Never-regress cases: `consent-keys-never-in-a-payload` and `anonymous-order-holds-no-consent`.

**Corrected the same day, after Communications replied.** A module that only `uses` another may not call its services (Foundations), so `checkoutConsent(orderId)` cannot exist and the list above is replaced by this:

- `box-office.checkout-consent` is a **code point**. A contribution supplies its questions (key, wording, never pre-ticked) and a function `record({ orderId, accountId, keys })` that returns statements.
- Box office calls `record` once, when the order is first confirmed or first reserved, and adds the statements to that batch. Consent is written with the order or not at all, exactly once, with no listener and no second read. This is the pattern Foundations approved for forms.
- The order has no consent column. The contributing module holds the record, including the exact wording shown, and answers for its erasure.
- Still true from above: no keys in any event payload; `box-office.order.reserved` is a new deliverable event; desk and phone sales show no consent questions in the first release; an order with no account is never passed to `record`.
- Rules on a contribution, enforced by the kit's point contract: `record` returns statements only and may not read or commit; a contribution that throws fails the checkout with a plain message, since silently dropping a consent the buyer gave would be worse than asking them to try again.
- Never-regress cases, replacing the two named above: `consent-recorded-in-the-order-batch`, `consent-recorded-once-for-a-reservation-later-paid`, `consent-keys-never-in-a-payload`, `anonymous-order-records-no-consent`.

## Added 16 November: requirements, and what Front of house asked for

**The point `box-office.eligibility` is withdrawn.** Foundations ruled one point for every per-person condition, `core.requirement`, and no module declares its own. Member pricing (BO-20) now works like this:

- A ticket type holds `requirement_refs`: plain-text references such as `membership:<the type's id>` or `fact:<name>`, chosen from the kit's picker. Box office never reads inside one and holds no foreign key.
- When a buyer adds that ticket type, and again in the batch that confirms or reserves the order, Box office calls `requirements.check(refs, { account, at, record })` with the performance as the record.
- **Met:** the type is offered. **Unmet:** it is not sold, and the reason the provider gives is shown. A buyer with no account is unmet and sees "sign in to use this price" where the theatre chooses to show the type at all.
- **Unavailable** (the providing module is off or absent): see the open point below.
- A reservation is checked when it is made and its price fixed then. It is not checked again at the desk; staff can change the ticket type there.
- At the desk a seller with `box-office.ticket-type.override-requirement` may sell the type to someone who is unmet (a member who has not yet been recorded). The override is audited with who allowed it.
- A concession that depends on proof shown at the door (a student card) is not a requirement. It stays a `proof_note` on the ticket type.

*Open with Foundations:* its ruling says an unavailable requirement is never enforced. For a duty (who may work a shift) that is right. For a price it would hand the member price to everyone the day Membership is switched off. This specification withholds a ticket type whose requirement is unavailable, shows why on the on-sale checklist, and has asked Foundations to allow a host to withhold a benefit in that case.

*Closed the same day:* Foundations withdrew "never enforced". The kit only reports unavailable and the host chooses per use. Withholding the ticket type, and saying why on the on-sale checklist, stands.

**BO-44, scanning on shift.** The ability `box-office.ticket.admit` is mapped to the fact `front-of-house.on-shift` on record type `core.performance`, so a confirmed shift lets a steward scan that performance only. With Front of house off, the ability comes from a role as usual.

**Contributions to Front of house**, declared under `uses`, so they do nothing while that module is absent. Numbers and ids only.

| Point | From | What it gives for a performance |
| --- | --- | --- |
| `front-of-house.tonight-figure` | Box office | Sold, reserved and not yet paid, admitted, still to come, remaining capacity |
| `front-of-house.tonight-figure` | Box office | Ticket takings so far by method (reader, cash, attested card, online), from Payments, which Box office requires |
| `front-of-house.report-section` | Box office | The same figures as final numbers, plus counts of reservations released unclaimed, complimentary tickets, refunds on the night, and tickets admitted offline and flagged as duplicates |
| `front-of-house.report-section` | Payments | Till sessions closed on that operating day: expected cash, counted cash, difference, by session id |

Payments does not know what a performance is, so it answers by the performance's operating day (the core's calendar helper); takings by performance come from Box office. Finance contributes nothing: the ledger is not a night report.

**`front-of-house.night-report.signed-off`: not listened to.** Income is recognised on `core.performance.completed`, and a till session closes by its own cash-up. Tying money to a volunteer signing a report would let a forgotten signature hold up the books.

## Added 16 November: the contracts for one payment with several owners

Fixed after the Bar specification's five points. The rules behind them are in part 3, "One payment for tickets and something else".

**The till.** Payments owns a small desk component, the till, which hosts `payments.desk-basket`, shows the one total and takes the payment. Box office's desk screen is the till with Box office's own panel first. Box office contributes to the point on the same terms as any other module, so a theatre with a bar and no box office still has a till, and the contract is proved by its first user.

**`payments.desk-basket` (code point).** A contribution gives:

| Member | Meaning |
| --- | --- |
| `id`, `label` | Kebab-case id and the panel's name |
| `ability` | The ability a seller needs to see and use the panel |
| `panel` | The component shown in the till |
| `summary(context)` | Lines and an amount for display. Reads only |
| `prepare(unit, context)` | Adds to the unit of work whatever makes the sale real but unpaid, and returns `{ owner: { module, record }, amountMinor }` with `amountMinor` above zero. Called in the batch that creates the intent |
| `release(unit, owner)` | Undoes `prepare`. Must be safe to call twice |

Payments makes one intent with one part per owner. `release` is called for every part when the payment is cancelled, fails for good, or the intent expires; the intent-expiry job is the backstop, so a crash between `prepare` and payment cannot strand stock or seats.

**`payments.settlement` (code point), extended.** A handler's `settle(unit, part)` and `refunded(unit, part, refund)` add their own statements and **return their ledger entries**. Payments writes one sealed posting: the money line, plus every part's entries.

- A part's entries must total exactly that part's amount, or Payments refuses the batch. The seal then checks the whole posting balances.
- A handler may post only to accounts its own module declared (below).
- A handler never commits and never calls a provider.

**No partial settlement, in both directions.** If any handler refuses or throws, nothing settles: no tickets, no bar sale, no posting. The attempt's money is real, so the intent becomes unfulfilled and the ordinary unfulfilled-payment path refunds it in full. If the bar's part refuses, the reservation stays reserved; if the tickets' part refuses, the drinks are not sold.

**Refunds are per part, and the abilities are owner-neutral.** `payments.refund.request` and `payments.refund.approve` belong to Payments and say nothing of orders. The owning module decides who may start a refund of its own record with its own ability (`box-office.order.refund` here), then calls Payments with the part. A refund can never exceed its part, and a refund spanning two owners is two refunds, each approved on its own.

**`finance.system-account` (data point).** A module declares the ledger accounts it posts to: `{ key, name, kind }`, where `kind` is income, liability, asset or expense. Finance creates each as a locked account keyed `<module>.<key>`, for example `bar.income`, and a module that requires Finance obtains it with `accountFor('bar.income')`. Box office declares `box-office.ticket-income` and `box-office.deferred-ticket-income` the same way, and Payments its clearing, cash and fee accounts. No module names another's account.

An account belongs to one module. `finance_accounts` gains `module` (internal, keep): set by Finance for a declared account, and chosen by the administrator when they add an account of their own to the chart (for example a snacks income account given to the bar). A handler may post to any account whose `module` is its own, and to no other. So a treasurer shapes the chart, a module offers only its own accounts in its pickers, and still no module can post into another's.

Never-regress cases added to part 8's list by reference: `prepare-without-payment-is-released`, `part-entries-must-total-the-part`, `handler-posts-only-to-its-own-accounts`, with the four multi-part cases already there.

## Added 16 November: what Membership asked for

- **Member pricing.** A ticket type's `requirement_refs` may hold `membership:<scheme id>` or `membership:any`. Box office checks it against the buyer's account when the ticket type is added and again immediately before the batch that confirms or reserves. A reservation is checked when it is made, not when it is paid at the desk weeks later, so someone whose membership lapses in between keeps the price they reserved at. Unavailable withholds the ticket type.
- **Any module can own a payment.** An intent part's owner is a module and a record, with nothing special about orders, so `membership-fees.charge` is an owner like any other. Online, the owner calls Payments' `collect` with its parts and gets the provider's payment step back. At the desk it contributes a panel to `payments.desk-basket` and is paid inside the seller's till session, alone or beside tickets. Its settlement handler adds its own statements (marking the fee paid) and returns its entries.
- **Accounts and tax.** `membership-fees.income` is declared through `finance.system-account`. A declaration may name a default tax code; in the first release only the no-tax code exists, so it is the default for everyone.
- **When income counts is the owner's choice, not Finance's.** Finance has no recognition rule. An owner that returns entries crediting its income account at settlement has recognised the income when paid. An owner that credits a liability account it declared, and later posts the move to income itself, has deferred it. "At the performance" is Box office's rule for tickets and binds nobody else.
