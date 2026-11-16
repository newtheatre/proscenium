# 6. Settings and abilities

## How to read this part

Written in the Foundations registry formats. Every operational number in parts 3 and 5 is a setting here; none is a constant in code. Defaults are proposals for a small theatre and are meant to be argued with. Settings are site-wide (Foundations draft 1); where a value varies by performance it is a column on the performance's sales record whose default is the setting, and the table says so.

"Changed by" names the ability. Three abilities cover all settings: `box-office.settings.manage`, `payments.settings.manage` and `finance.settings.manage`, shortened below to BO, PAY and FIN.

## Settings: box office

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `box-office.baskets.hold-for` | duration | 10m | 2m to 60m | BO | public | Yes | How long seats are held in a basket. Per performance: `hold_minutes` |
| `box-office.baskets.pay-within` | duration | 15m | 5m to 60m | BO | public | No | How long a hold is extended once payment starts |
| `box-office.orders.seat-cap` | integer (seats) | 8 | 1 to 50 | BO | public | Yes | Most tickets in one online order. Per performance: `max_per_order` |
| `box-office.orders.desk-seat-cap` | integer (seats) | 30 | 1 to 500 | BO | staff | No | Most tickets in one desk order, for group bookings |
| `box-office.sales.close-before` | duration | 0m | 0m to 7d | BO | public | Yes | How long before curtain online sales close. Per performance: `off_sale_at` |
| `box-office.sales.desk-until-after` | duration | 30m | 0m to 4h | BO | staff | No | How long after curtain the desk may still sell, for latecomers |
| `box-office.availability.show-remaining-under` | integer (seats) | 20 | 0 to 1000 | BO | public | No | Show "N left" only at or under this many; 0 never shows it |
| `box-office.fees.booking-fee` | money | 0 | 0 to 2000 | BO | public | Yes | Booking fee per order online; 0 for none |
| `box-office.fees.booking-fee-per` | choice | order | order, ticket | BO | public | No | Whether the fee is charged once or per ticket |
| `box-office.fees.booking-fee-at-desk` | boolean | false |  | BO | staff | No | Whether the desk charges the fee too |
| `box-office.cancellations.by-buyer` | boolean | false |  | BO | public | Yes | Buyers may cancel their own tickets online |
| `box-office.cancellations.until-before` | duration | 24h | 0m to 30d | BO | public | Yes | Latest a buyer may cancel or exchange |
| `box-office.cancellations.fee` | money | 0 | 0 to 5000 | BO | public | Yes | Fee kept per ticket on a buyer's cancellation |
| `box-office.cancellations.refund-fee-on-cancelled-show` | boolean | true |  | BO | public | Yes | Refund the booking fee too when the theatre cancels |
| `box-office.exchanges.by-buyer` | boolean | false |  | BO | public | Yes | Buyers may exchange online (later release) |
| `box-office.exchanges.fee` | money | 0 | 0 to 5000 | BO | public | Yes | Fee per ticket exchanged |
| `box-office.waiting-list.enabled` | boolean | true |  | BO | public | No | Offer a waiting list when sold out |
| `box-office.waiting-list.offer-for` | duration | 2h | 10m to 48h | BO | public | Yes | How long a waiting-list offer holds seats |
| `box-office.waiting-list.stop-before` | duration | 2h | 0m to 7d | BO | public | No | Stop automatic offers this long before curtain |
| `box-office.comps.per-request` | integer (tickets) | 4 | 1 to 50 | BO | staff | No | Most complimentary tickets in one request |
| `box-office.comps.per-performance` | integer (tickets) | unset | 0 to 1000 | BO | staff | No | Cap on approved complimentary tickets per performance; unset means no cap |
| `box-office.scanning.offline` | boolean | true |  | BO | staff | No | Door devices may admit while offline |
| `box-office.scanning.opens-before` | duration | 60m | 0m to 12h | BO | staff | No | How long before curtain scanning opens when no doors time is set |
| `box-office.scanning.names-on-device` | boolean | false |  | BO | staff | No | Whether the offline manifest includes buyers' names |
| `box-office.tickets.reminder-before` | duration | unset | 1h to 14d | BO | staff | No | Send a reminder this long before; unset sends none |
| `box-office.checkout.ask-phone` | choice | optional | hidden, optional, required | BO | public | No | The phone field at checkout |
| `box-office.checkout.ask-access` | boolean | true |  | BO | public | No | Offer the access-needs field |
| `box-office.retention.orders` | duration | 2555d | 365d to 3650d | BO | staff | No | How long after the performance an order keeps its contact details (default seven years, for financial records) |
| `box-office.retention.baskets` | duration | 30d | 1d to 365d | BO | staff | No | How long an expired basket is kept before its contact details are cleared |
| `box-office.retention.waiting-list` | duration | 30d | 0d to 365d | BO | staff | No | How long after the performance waiting-list entries are kept |
| `box-office.retention.comp-requests` | duration | 365d | 30d to 3650d | BO | staff | No | How long a complimentary request keeps the recipient's name |
| `box-office.retention.holds` | duration | 90d | 0d to 3650d | BO | staff | No | How long after the performance a staff hold keeps its label |

Rules across settings: `baskets.pay-within` is at least `baskets.hold-for` less five minutes is **not** required; the two are independent. One rule is checked: `waiting-list.offer-for` must be shorter than `waiting-list.stop-before` plus `sales.close-before`, or an offer could outlive the sale.

## Settings: payments

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `payments.attempts.answer-within` | duration | 3m | 1m to 30m | PAY | staff | No | How long to wait for a provider's answer before an attempt is marked unknown |
| `payments.attempts.alert-unknown-after` | duration | 60m | 5m to 48h | PAY | staff | No | When an unknown attempt appears on the health screen and alerts staff |
| `payments.refunds.self-approve-up-to` | money | 0 | 0 to 100000 | PAY | staff | No | Largest refund one person may request and approve alone; 0 means always two people |
| `payments.refunds.window` | duration | 180d | 1d to 730d | PAY | staff | No | How long after payment a refund may be requested |
| `payments.sessions.variance-needs-second-person` | money | 500 | 0 to 100000 | PAY | staff | No | Cash variance above which a second person must close the session |
| `payments.sessions.default-float` | money | 0 | 0 to 100000 | PAY | staff | No | Float suggested when opening a session |
| `payments.cash.enabled` | boolean | true |  | PAY | staff | No | Whether cash is offered at the desk |
| `payments.desk.attested-card` | boolean | true |  | PAY | staff | No | Whether a person may record a card payment taken on a standalone machine |
| `payments.retention.webhooks` | duration | 90d | 7d to 730d | PAY | staff | No | How long webhook receipts are kept |

## Settings: finance

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `finance.income.recognise` | choice | at-performance | at-sale, at-performance | FIN | staff | No | When ticket money becomes income. Question for Matt in part 9 |
| `finance.periods.length` | choice | month | month, quarter | FIN | staff | No | The length of an accounting period |
| `finance.year.starts` | text | 08-01 | a month and day | FIN | staff | No | First day of the financial year |
| `finance.tax.registered` | boolean | false |  | FIN | staff | No | Whether the theatre charges tax on sales. True is not supported in the first release and the screen says so |

The currency is the core's organisation setting (workstream 3), read here and never redeclared.

**Preset differences.** `student-society`: `box-office.comps.per-performance` 10; `finance.year.starts` 08-01. `amateur-company`: `box-office.fees.booking-fee` 0; `finance.year.starts` 01-01. `small-venue`: `box-office.cancellations.by-buyer` true; `box-office.orders.desk-seat-cap` 60; `finance.periods.length` month. All else is the default.

## Record types

| Record type | Table | Parent | Owner column | Holds when |
| --- | --- | --- | --- | --- |
| `box-office.order` | `box_office_orders` | `core.performance` (of its first line) | `account_id` | A buyer owns their own order |
| `box-office.ticket` | `box_office_tickets` | `box-office.order` |  |  |
| `box-office.comp-request` | `box_office_comp_requests` | `core.performance` | `requested_by` | The requester owns the request |
| `box-office.pass` | `box_office_passes` |  | `account_id` |  |
| `payments.session` | `payments_sessions` |  | `opened_by` | The cashier owns their session |
| `payments.refund` | `payments_refunds` |  | `requested_by` | The requester owns the request |
| `finance.period` | `finance_periods` |  |  |  |

A grant on a production covers its performances and so their orders: a visiting company's manager can be given `box-office.order.view` and `finance.ledger.view` on one production and nothing else.

## Abilities: box office

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `box-office.order.view` | `box-office.order` | normal | grants |  | See an order and its tickets | Box-office staff; fact `front-of-house.on-shift` |
| `box-office.order.view-access-note` | `box-office.order` | privileged | grants | `order.view` | Read the access note | Box-office manager; duty manager |
| `box-office.order.sell` | `core.performance` | normal |  | `order.view` | Sell at the desk and by phone | Box-office staff; fact `front-of-house.on-shift` if the theatre maps it |
| `box-office.order.cancel` | `box-office.order` | privileged | refuses | `order.view` | Cancel lines and choose the refund | Box-office manager |
| `box-office.order.exchange` | `box-office.order` | normal | refuses | `order.view` | Exchange tickets for a buyer | Box-office staff |
| `box-office.order.resend` | `box-office.order` | normal | grants | `order.view` | Resend or reissue tickets | Box-office staff |
| `box-office.ticket.admit` | `core.performance` | normal |  |  | Scan and admit; see the door list | Fact `front-of-house.on-shift`; box-office staff |
| `box-office.performance.manage` | `core.performance` | normal |  |  | Set up sales, capacity and the on-sale window; confirm a bulk cancellation | Box-office manager; production's producer by grant on the production |
| `box-office.performance.exceed-venue` | `core.performance` | privileged |  |  | Confirm capacity above the space's own | Box-office manager |
| `box-office.pricing.manage` | `core.production` | normal |  |  | Ticket types and prices | Box-office manager |
| `box-office.hold.manage` | `core.performance` | normal |  |  | Hold, label and release seats | Box-office staff |
| `box-office.waitlist.manage` | `core.performance` | normal |  |  | See the queue and make offers by hand | Box-office staff |
| `box-office.promo.manage` |  | normal |  |  | Promo codes | Box-office manager; marketing |
| `box-office.comp.request` | `core.performance` | normal |  |  | Ask for complimentary tickets | Production team by grant on the production |
| `box-office.comp.approve` | `box-office.comp-request` | privileged | refuses |  | Approve or decline; never your own | Box-office manager |
| `box-office.pass.manage` |  | normal |  |  | Pass types and passes | Box-office manager |
| `box-office.plan.manage` |  | normal |  |  | Seating plans | Box-office manager |
| `box-office.report.view` | `core.production` | normal |  |  | Sales reports | Box-office manager; treasurer; producer by grant |
| `box-office.settings.manage` |  | privileged |  |  | Change box-office settings | Administrator |

## Abilities: payments

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `payments.session.open` |  | normal |  |  | Open and close your own till session | Anyone who may sell |
| `payments.session.view` | `payments.session` | normal | grants |  | See sessions and their counts | Treasurer; box-office manager |
| `payments.session.close-any` | `payments.session` | privileged | refuses | `session.view` | Close someone else's session, or countersign a variance | Treasurer; duty manager |
| `payments.refund.request` | `box-office.order` | normal |  |  | Ask for a refund | Box-office staff |
| `payments.refund.approve` | `payments.refund` | privileged | refuses |  | Approve a refund; never your own above the limit | Box-office manager; treasurer |
| `payments.attempt.reconcile` |  | privileged |  |  | Answer an unknown attempt from the provider's own records | Treasurer; box-office manager |
| `payments.attempt.attest` |  | normal |  |  | Record a cash or standalone-card payment | Anyone who may sell |
| `payments.provider.manage` |  | privileged |  |  | Add providers, pair readers, switch test mode | Administrator; treasurer |
| `payments.settings.manage` |  | privileged |  |  | Change payments settings | Administrator |

## Abilities: finance

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `finance.ledger.view` | `core.production` | normal |  |  | Read the ledger and statements | Treasurer; a producer by grant on their production |
| `finance.ledger.export` |  | privileged |  | `ledger.view` | Export postings | Treasurer |
| `finance.posting.correct` |  | privileged |  | `ledger.view` | Post a reversal or correction by hand | Treasurer |
| `finance.account.manage` |  | privileged |  |  | Rename and recode accounts | Treasurer |
| `finance.period.close` | `finance.period` | privileged |  | `ledger.view` | Close a period | Treasurer |
| `finance.period.reopen` | `finance.period` | privileged |  |  | Reopen a closed period, with a reason | Treasurer, and the theatre may require a second role |
| `finance.settings.manage` |  | privileged |  |  | Change finance settings | Administrator |

Role names are illustrations until workstream 2 publishes its preset roles. No module here declares a role.

## Facts

These modules declare **no facts**. They rely on one from another module: `front-of-house.on-shift` (holds for an account on a performance during its confirmed shift). A theatre maps `box-office.ticket.admit` and `box-office.order.view` to it, so tonight's stewards can scan tonight's show and nobody needs a standing grant. Because it is a `uses` link, the box office works without it: with Front of house switched off, admission needs an ordinary grant.

## Secrets and credentials

| Name | Kind | Needed | For |
| --- | --- | --- | --- |
| `BOX_OFFICE_TICKET_SIGNING_KEY` | secret | always | Signing ticket QR codes so a door device can check one offline. Versioned by `key_version`, so it can be rotated without voiding tickets already sent |
| `PAYMENTS_<PROVIDER>_SECRET_KEY`, `PAYMENTS_<PROVIDER>_WEBHOOK_SECRET` | secret | when-used | An integrated provider joined by API key |
| `payments.<provider>` | credential (`oauth` or `api-key`) | when-used | An integrated provider connected from inside the app, held in the core's encrypted credential store (Foundations ruling, 16 November) |

The access note uses the kit's `col.special` encryption and needs no secret of its own.

## Added 16 November: reserve now, pay on arrival

Settings, all in module `box-office`. The numbers are proposals for the workshops, not decisions.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `box-office.checkout.payment-timing` | `pay-now`, `reserve`, `buyer-chooses` | `pay-now` when an online provider is connected, otherwise `reserve` | Whether an online order is paid at checkout or reserved and paid at the desk. A performance may override it |
| `box-office.reservations.confirm-email` | boolean | true | A reservation holds seats only once the buyer has confirmed their email address by link |
| `box-office.reservations.max-tickets-per-order` | whole number | 8 | Most tickets in one reservation |
| `box-office.reservations.max-tickets-per-person` | whole number | 8 | Most reserved tickets one person may hold for one performance |
| `box-office.reservations.release-minutes-before` | whole number or unset | unset | Unclaimed reservations are released this many minutes before the start. Unset means staff release by hand |
| `box-office.reservations.reminder-hours-before` | whole number or unset | 24 | When the reminder with the amount due and the cancel link is sent |

Abilities.

| Ability | Lets a person |
| --- | --- |
| `box-office.order.reserve` | Reserve for a customer at the desk or by phone |
| `box-office.order.take-payment` | Take payment for a reserved order, and adjust it first |
| `box-office.order.release` | Release a reservation by hand, or mark one to keep |

Job `box-office.release-reservations` runs from the one cron, and `box-office.send-reservation-reminders` beside it.

## Changed 16 November: Matt's answers

- `finance.income.recognise` is **removed**. Ticket income is always recognised when the performance takes place (question 4). Rows for it in the tables above no longer apply, and the test plan keeps only the at-performance path.
- Buyer self-service cancellation is built in the first release; its settings above stay as drafted and ship off (question 6).
- Every other setting default above stands as recommended (questions 5, 7, 8, 10 and 11).

* Added from the check against Interface's conventions (part 5): `box-office.checkout.hold-extension-minutes` (whole number, proposed 5; 0 switches it off). A buyer may extend their seat hold once, by a button offered in its last minute. Editing the basket still never extends it.
