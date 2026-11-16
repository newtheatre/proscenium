# 9. Questions for Matt

## The answers

Eleven questions, all answered by Matt on 16 November. He accepted every recommendation except on question 6. Parts 2 to 8 are written to these answers; the options he chose between are kept below as the record.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Run the proof on a real D1 database? | A. Yes, in his personal Cloudflare account. Done; it passed |
| 2 | Which payment providers ship first? | A. Cash and attested card, Stripe online, SumUp reader, built in that order |
| 3 | Connect providers inside the app, or by secrets only? | A. Secrets only in the first release; in-app connection later as the friendlier option |
| 4 | When does ticket money become income? | A. When the performance takes place, as one fixed rule with no setting |
| 5 | Who approves refunds? | A. Two people, with a self-approval limit that ships at zero |
| 6 | May buyers cancel or exchange their own tickets? | **B, against the recommendation.** Built in the first release, off by default |
| 7 | Booking fee by default? | A. None; a theatre may set one |
| 8 | Allow door scanning offline? | A. Yes, on by default |
| 9 | What to cut first if the first release must shrink? | The cut order as listed |
| 10 | Release unclaimed reservations automatically? | A. At a time each theatre sets; unset means by hand |
| 11 | Confirm an email address before a reservation holds seats? | A. Yes, as a setting that is on by default |

## 1. Run the last-seat proof on a real D1 database?

The proof passed 11 of 11 cases on local D1. Integration asked for a run on a deployed database before the proof was called done, because local and deployed D1 can differ under concurrency. Matt chose A. The run was made on 16 November, passed all 11 cases, and both throwaway resources were deleted; the Proof tab has the results.

| Option | What happens |
| --- | --- |
| **A. Yes, in your personal Cloudflare account (recommended)** | I create one throwaway D1 database and one Worker, run the same script, record the results in the Proof tab, and delete both. Cost is pennies |
| B. Yes, in the New Theatre account | The same, there |
| C. Not now | The proof stays local and says so; the deployed run becomes the first task of the build |

## 2. Which payment providers ship in the first release?

You said the first provider does not matter much, so this is about order of work, not principle. Any provider is a contribution to one point; adding another later touches nothing else.

| Option | Covers | Cost |
| --- | --- | --- |
| **A. Cash, attested card, Stripe online, SumUp reader (recommended)** | Online sales for any theatre; the reader NNT already owns | Two integrations to build and test |
| B. Cash, attested card, Stripe online and Stripe reader | One provider for everything | NNT could not use its SumUp reader at the desk except as attested |
| C. Cash, attested card, SumUp online and SumUp reader | One provider, NNT's own | SumUp's online checkout is less widely used; fewer theatres served |
| D. Cash and attested card only | The desk works on day one with no accounts anywhere | No online sales, which fails the phase's purpose |

Recommendation A, built in the order: cash and attested, then Stripe online (the gate needs a real paid booking and refund), then the SumUp reader.

## 3. Connect a provider from inside the app, or by secrets only?

Foundations has agreed an encrypted credential store, so both are possible.

| Option | For the theatre | Risk |
| --- | --- | --- |
| **A. Secrets only in the first release (recommended)** | Paste two keys into the Cloudflare dashboard once, guided by setup | Least to build; nothing sensitive in the database |
| B. In-app connection ("Connect with Stripe") | Friendlier: no dashboard visit | Tokens stored in the database (encrypted); a token-refresh job; a registered platform application with each provider, which someone must own |
| C. Both from the start | Either | The cost of B now |

Recommendation A now, B later for whichever provider theatres ask for.

**Decided by Matt, 16 November: A.** Provider keys are secrets only in the first release. Connecting a provider from inside the application (B) is to be supported later as the friendlier option, so the provider contract keeps its `credentials` declaration and nothing in the first release may assume a key can only ever come from a secret.

## 4. When does ticket money become income?

| Option | Meaning | Effect |
| --- | --- | --- |
| **A. When the performance takes place (recommended)** | Advance sales sit in "deferred ticket income" until the show happens | A cancelled show never appears as income. A period's income is what was performed in it. One more scheduled posting |
| B. When the ticket is sold | Simpler to explain | A period's income includes shows not yet performed; cancellations reverse earlier income |
| C. A setting, default A | A theatre chooses | Both paths must be tested for ever |

**Decided by Matt, 16 November: A, as one fixed rule.** There is no setting. Box office credits ticket sales to `box-office.deferred-ticket-income`, and its daily task `box-office.recognise-income` moves them to income once the core reports the performance completed. The rule is Box office's own and binds no other module (part 4).

## 5. Who approves a refund?

| Option | Rule |
| --- | --- |
| **A. Two people, with a limit a theatre may raise (recommended)** | Requester and approver must differ, except at or under `payments.refunds.self-approve-up-to`, which ships at zero |
| B. One person with the ability | Fast, and how most small box offices work today; no check on a mistaken or dishonest refund |
| C. Two people always, no limit | Strictest; a lone duty manager cannot refund a single ticket on the night |

A covers B and C by setting the limit high or leaving it at zero.

## 6. May buyers cancel or exchange their own tickets online?

| Option | Rule |
| --- | --- |
| **A. Off by default, built after the first release (recommended)** | The first release has staff cancellation and refund only. The settings and rules are designed now |
| B. In the first release, off by default | More to build before the gate |
| C. Never | Staff only, for good |

**Decided by Matt, 16 November: B.** Buyers cancelling their own paid tickets is built in the first release and is off by default. The question covered exchanging as well, so three stories are in the first release in part 7: the cancel half of BO-22, BO-55, and BO-54 (staff exchange), which BO-55 is built on. Cancelling an unpaid reservation from the email link is separate and is always available (part 3).

## 7. Is there a booking fee by default?

| Option | Rule |
| --- | --- |
| **A. None; a theatre may set one (recommended)** | `box-office.fees.booking-fee` ships at zero. When set, it is shown as a line from the first basket |
| B. A default fee sized to cover a typical card fee | Recovers costs out of the box; surprises buyers of a society that never charged one |
| C. No fee feature at all | Simplest; a theatre that wants to pass on card costs must raise prices |

## 8. May the door admit people while offline?

| Option | Rule |
| --- | --- |
| **A. Yes, on by default (recommended)** | The door never stops. Two devices could each admit the same ticket while both are offline; that is detected and flagged afterwards |
| B. Off by default | No double admission is possible; a wifi failure stops the door or forces the paper list |
| C. Not built | Less work; the same weakness as B with no choice |

## 9. What goes first if the first release must shrink?

In the order I would cut, least harm first. Nothing above the line touches the roadmap's gate.

| Cut | Stories | What is lost |
| --- | --- | --- |
| 1. Season passes | BO-64 | Already later; listed for completeness |
| 2. Split payments at the desk | BO-35 | Already later |
| 3. More time on a basket | BO-24 | The countdown simply ends; the buyer starts again |
| 4. Automatic waiting-list offers | BO-61 | Staff offer returned seats by hand from the queue; joining the list (BO-60) stays |
| 5. Phone orders held unpaid until a time the seller sets | BO-34, in part | A phone booking is paid at once or made as an ordinary reservation. The reservation path itself is not cut |
| 6. Promo codes | BO-17 | No discounts or early-access codes |
| 7. One payment for several owners at the till | PAY-07 | Tickets and bar items are paid one after the other. The parts model stays in the schema |
| 8. Offline scanning | BO-41 | The door needs a connection; the printable door list is the fallback |
| 9. Member pricing through requirements | BO-20, BO-45 | Members pay the public price until it is built |
| 10. The SumUp reader | part of BO-30 | The desk takes cash and attested card; a card reader is used standalone |
| 11. Production statements and the ledger export | FIN-04, FIN-05 | The treasurer reads the ledger screen only |
| **Not to be cut** | BO-10 to BO-16, BO-30, BO-31, BO-40, BO-50, BO-51, R-1 to R-7, PAY-05, FIN-01, FIN-02 | These are the gate: a reservation paid on arrival, a paid booking, a refund and a period close that reconcile, and a last seat sold once |

Matt approved this order before cuts 3 and 7 existed. Their places in it are proposals.

## Decided without asking, for you to overrule

| Choice | Why | Where |
| --- | --- | --- |
| Three modules: Box office, Payments, Finance | Bar and Membership will need Payments and the ledger without the box office | Part 1 |
| One order line per ticket, never a quantity | Each ticket can be refunded, exchanged and scanned alone | Part 2 |
| A basket's countdown is never extended by editing it | Otherwise seats can be held for ever | Part 3 |
| Refunds only by the method that paid | Card rules, and it keeps the ledger simple | Part 3 |
| The ledger is double entry | A single list of amounts cannot show where money is, only that it moved | Part 2 |
| Tax columns exist but only "no tax" is built | A later VAT theatre needs no ledger migration | Part 2 |
| No card data ever touches the platform | The provider holds it; keeps every theatre out of card-security audits | Parts 2 and 4 |
| Complimentary tickets are ordinary zero-price tickets needing a second person | Counted, scanned and audited like any other | Part 3 |

## Two questions on reservations

These follow from reserve now, pay on arrival (part 3).

### 10. Should unclaimed reservations be released automatically before the start?

| Option | What happens |
| --- | --- |
| A. Yes, at a time each theatre sets (recommended) | The setting `box-office.reservations.release-before` gives how long before the start; unset means staff release by hand. Staff can mark a latecomer to keep |
| B. Never automatically | Staff always release by hand |
| C. Always, at a fixed time | Simpler, but no theatre agrees on the time |

Recommendation: A. It costs one setting and one scheduled task, and a theatre that distrusts it leaves it unset.

### 11. Must a buyer confirm their email address before a reservation holds seats?

| Option | What happens |
| --- | --- |
| A. Yes, by default, as a setting (recommended) | The seats are held for a few minutes while the buyer clicks a link in an email; a signed-in buyer skips it |
| B. No | Fewer steps, but anyone can block a house with invented addresses, since no money is taken |
| C. Require sign-in to reserve | Strongest, but against the rule that the audience never needs an account |

Recommendation: A. Payment is what normally stops fake bookings, and a reservation has none.
