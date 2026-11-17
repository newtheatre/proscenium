# 6. Settings and abilities

## How to read this part

Written in the Foundations registry formats. Every operational number in parts 3 and 5 is a setting here; none is a constant in code. Defaults are proposals for a small theatre and are meant to be argued with. A setting holds one value for the whole theatre; where a value varies by performance it is a column on the performance's sales record whose default is the setting, and the table says so.

"Changed by" names the ability. Three abilities cover all settings: `box-office.settings.manage`, `payments.settings.manage` and `finance.settings.manage`, shortened below to BO, PAY and FIN.

**Where each setting is found** (integration ruling R-37; Foundations, Settings registry). No setting carries a scope. Each module's manifest declares its groups in `settingGroups`, a group being the first segment of the short key (`sales`, `baskets`, `checkout`, `reservations`, `cancellations` and so on), and every setting has exactly one home:

- Box office, Payments and Finance each keep their own generated page in the console, beside the work it governs: `/console/box-office/settings`, `/console/payments/settings` and `/console/finance/settings`. Every group in the tables below is on its module's page, in the console, unless named in the next two lines.
- `box-office.retention` stays on Box office's page, as its last section. How long orders, baskets and waiting-list entries are kept is the theatre's data-protection decision, taken by the people who run the box office, not an engineering limit.
- `payments.retention` is marked `advanced`, so it is drawn on the Advanced page in Site administration under the heading Payments. How long webhook receipts are kept is an engineering limit.
- None of these modules manages a setting on a screen of its own, so none declares `screen`. Provider accounts, readers, ledger accounts and periods are records, not settings.

On saving, a fresh sign-in follows the setting and not the ability, so each setting whose silent change could cost money, mislead a buyer or delete data declares onChange confirm: the save shows what will change, asks again, and asks for a fresh sign-in. They are, in Box office: checkout.payment-timing; fees.booking-fee, fees.booking-fee-per and fees.booking-fee-at-desk; cancellations.by-buyer, cancellations.fee and cancellations.refund-fee-on-cancelled-show; exchanges.by-buyer and exchanges.fee; reservations.release-before; scanning.names-on-device; and all five retention settings. In Payments: refunds.self-approve-up-to, refunds.window, sessions.variance-needs-second-person, cash.enabled, desk.attested-card and retention.webhooks. Every retention period is on the list by rule, in every module, because shortening one lets the next retention run delete rows for good. In Finance: periods.length, year.starts and tax.registered. None asks for a reason. Every other setting saves with no prompt. A payment provider, its mode and its readers are records on the Providers screen, not settings, and stay guarded by their privileged ability. One setting's history is visible to whoever may change it; the whole history needs core.audit.view. Every duration is entered with the kit's `DurationInput` and stored as whole seconds, as before; the limits in the tables are what that control offers. A duration is shown in the largest unit that divides it exactly, so no label or help line below names a unit.

## Settings: box office

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `box-office.checkout.payment-timing` | choice | `pay-now`; while no online payment method is connected the value in force is `reserve` | pay-now, reserve, buyer-chooses | BO | public | No | Whether an online order is paid at checkout or reserved and paid at the desk. Per performance: `payment_timing` |
| `box-office.baskets.hold-for` | duration | 10m | 2m to 60m | BO | public | Yes | How long seats are held in a basket. Per performance: `hold_minutes` |
| `box-office.baskets.extend-by` | duration | 5m | 0m to 30m | BO | public | No | The one extension a buyer may take by button as the hold is about to end; zero removes the button |
| `box-office.baskets.pay-within` | duration | 15m | 5m to 60m | BO | public | No | How long a hold lasts once payment starts |
| `box-office.orders.seat-cap` | integer (seats) | 8 | 1 to 50 | BO | public | Yes | Most tickets in one online order. Per performance: `max_per_order` |
| `box-office.orders.desk-seat-cap` | integer (seats) | 30 | 1 to 500 | BO | staff | No | Most tickets in one desk order, for group bookings |
| `box-office.reservations.confirm-email` | boolean | true |  | BO | public | No | A reservation holds seats only once the buyer has confirmed their email address by link; a signed-in buyer skips it |
| `box-office.reservations.max-tickets-per-order` | integer (tickets) | 8 | 1 to 50 | BO | public | Yes | Most tickets in one reservation |
| `box-office.reservations.max-tickets-per-person` | integer (tickets) | 8 | 1 to 50 | BO | public | Yes | Most reserved tickets one person may hold for one performance |
| `box-office.reservations.release-before` | duration | unset | 0m to 24h | BO | public | Yes | Unclaimed reservations are released this long before the start. Unset means staff release by hand |
| `box-office.reservations.remind-before` | duration | 24h | 1h to 14d | BO | staff | No | When the reminder with the amount due and the cancel link is sent; unset sends none |
| `box-office.sales.close-before` | duration | 0m | 0m to 7d | BO | public | Yes | How long before curtain online sales close. Per performance: `off_sale_at` |
| `box-office.sales.desk-until-after` | duration | 30m | 0m to 4h | BO | staff | No | How long after curtain the desk may still sell, for latecomers |
| `box-office.availability.show-remaining-under` | integer (seats) | 20 | 0 to 1000 | BO | public | No | Show "N left" only at or under this many; 0 never shows it |
| `box-office.fees.booking-fee` | money | 0 | 0 to 2000 | BO | public | Yes | Booking fee per order online; 0 for none |
| `box-office.fees.booking-fee-per` | choice | order | order, ticket | BO | public | No | Whether the fee is charged once or per ticket |
| `box-office.fees.booking-fee-at-desk` | boolean | false |  | BO | staff | No | Whether the desk charges the fee too |
| `box-office.cancellations.by-buyer` | boolean | false |  | BO | public | Yes | Buyers may cancel their own paid tickets online. Built in the first release, shipped off (Matt, question 6) |
| `box-office.cancellations.until-before` | duration | 24h | 0m to 30d | BO | public | Yes | Latest a buyer may cancel or exchange |
| `box-office.cancellations.fee` | money | 0 | 0 to 5000 | BO | public | Yes | Fee kept per ticket on a buyer's cancellation |
| `box-office.cancellations.refund-fee-on-cancelled-show` | boolean | true |  | BO | public | Yes | Refund the booking fee too when the theatre cancels |
| `box-office.exchanges.by-buyer` | boolean | false |  | BO | public | Yes | Buyers may exchange their own tickets online |
| `box-office.exchanges.fee` | money | 0 | 0 to 5000 | BO | public | Yes | Fee per ticket exchanged |
| `box-office.waiting-list.enabled` | boolean | true |  | BO | public | No | Offer a waiting list when sold out |
| `box-office.waiting-list.offer-for` | duration | 2h | 10m to 48h | BO | public | Yes | How long a waiting-list offer holds seats |
| `box-office.waiting-list.stop-before` | duration | 2h | 0m to 7d | BO | public | No | Stop automatic offers this long before curtain |
| `box-office.comps.per-request` | integer (tickets) | 4 | 1 to 50 | BO | staff | No | Most complimentary tickets in one request |
| `box-office.comps.per-performance` | integer (tickets) | unset | 0 to 1000 | BO | staff | No | Cap on approved complimentary tickets per performance; unset means no cap |
| `box-office.scanning.offline` | boolean | true |  | BO | staff | No | Door devices may admit while offline |
| `box-office.scanning.names-on-device` | boolean | false |  | BO | staff | No | Whether the offline data includes buyers' names. Off means Find by name works only while online |
| `box-office.scanning.result-sound` | boolean | false |  | BO | staff | No | Play one sound per scan result on the door device (integration ruling R-29) |
| `box-office.tickets.reminder-before` | duration | unset | 1h to 14d | BO | staff | No | Send a reminder for paid tickets this long before; unset sends none |
| `box-office.checkout.ask-phone` | choice | optional | hidden, optional, required | BO | public | No | The phone field at checkout |
| `box-office.checkout.ask-access` | boolean | true |  | BO | public | No | Offer the access-needs field |
| `box-office.retention.orders` | duration | 2555d | 365d to 3650d | BO | staff | No | How long after the performance an order keeps its access note, its link and desk code hashes and its tickets' stored codes and attendee names. The rows stay for the ledger. The buyer's contact details are on their account and follow Identity's retention |
| `box-office.retention.baskets` | duration | 30d | 1d to 365d | BO | staff | No | How long an expired basket that never became an order is kept before it is deleted |
| `box-office.retention.waiting-list` | duration | 30d | 0d to 365d | BO | staff | No | How long after the performance waiting-list entries are kept |
| `box-office.retention.comp-requests` | duration | 365d | 30d to 3650d | BO | staff | No | How long a complimentary request is kept before its link to the recipient's account is removed |
| `box-office.retention.holds` | duration | 90d | 0d to 3650d | BO | staff | No | How long after the performance a staff hold keeps its label |

When scanning opens is not a setting here: it is the core's `doors_at` for the performance, which the core defaults from its own setting.

**Rules across settings.** `baskets.hold-for` and `baskets.pay-within` are independent; neither limits the other. Two rules are checked when a setting is saved. `waiting-list.offer-for` must be shorter than `waiting-list.stop-before` plus `sales.close-before`, or an offer could outlive the sale. `checkout.payment-timing` may be `pay-now` or `buyer-chooses` only while an online provider is connected.

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
| `finance.periods.length` | choice | month | month, quarter | FIN | staff | No | The length of an accounting period |
| `finance.year.starts` | text | 08-01 | a month and day | FIN | staff | No | First day of the financial year. Finance's own; it is not the committee year end |
| `finance.tax.registered` | boolean | false |  | FIN | staff | No | Whether the theatre charges tax on sales. True is not supported in the first release and the screen says so |

There is no setting for when ticket money becomes income. It is one fixed rule: when the performance takes place (Matt, question 4).

The currency is the core's organisation setting (workstream 3), read here and never redeclared.

**Preset differences.** Only values that differ from the defaults are listed. `student-society`: `box-office.comps.per-performance` 10. `amateur-company`: `finance.year.starts` 01-01. `small-venue`: `box-office.cancellations.by-buyer` true; `box-office.orders.desk-seat-cap` 60. All three presets map abilities to Identity's preset roles in the same way, as the Suggested holders columns below show.

## Vocabularies

Lists a theatre edits, declared in the modules' manifests and kept as the core's terms. Each ships with the starting terms shown.

| Vocabulary | Module | Starting terms | Used by |
| --- | --- | --- | --- |
| `box-office.cancellation-reason` | Box office | Illness, cannot attend, booked in error, other | `box_office_cancellations.reason_term_id` |
| `box-office.comp-reason` | Box office | Cast, crew, press, reviewer, sponsor, other | `box_office_comp_requests.reason_term_id` |
| `box-office.door-reason` | Box office | Scanned by mistake, wrong person, membership seen at the door, other | `box_office_scans.reason_term_id`, for an undone admission and for "Admit anyway" |
| `payments.refund-decline-reason` | Payments | Not eligible, duplicate request, other | `payments_refunds.decline_reason_term_id` |
| `finance.reopen-reason` | Finance | Late correction, posted in error, other | `finance_period_closes.reason_term_id` |

## Record types

| Record type | Table | Parent | Owner column | Holds when |
| --- | --- | --- | --- | --- |
| `box-office.order` | `box_office_orders` | `core.performance` (of its first line) | `account_id` | A buyer owns their own order |
| `box-office.ticket` | `box_office_tickets` | `box-office.order` |  |  |
| `box-office.ticket-type` | `box_office_ticket_types` |  |  | Declared so that a form slot can take a ticket type as its subject (R-17) |
| `box-office.comp-request` | `box_office_comp_requests` | `core.performance` | `requested_by` | The requester owns the request |
| `box-office.pass` | `box_office_passes` |  | `account_id` |  |
| `payments.session` | `payments_sessions` |  | `opened_by` | The cashier owns their session |
| `payments.refund` | `payments_refunds` |  | `requested_by` | The requester owns the request |
| `finance.period` | `finance_periods` |  |  |  |

A grant on a production covers its performances and so their orders: a visiting company's manager can be given `box-office.order.view` and `finance.ledger.view` on one production and nothing else.

## Abilities: box office

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `box-office.order.view` | `box-office.order` | normal | grants | `core.account.find` (Identity's, for search by name or email) | See an order and its tickets | `box-office-staff`; fact `front-of-house.on-shift` |
| `box-office.order.view-access-note` | `box-office.order` | privileged | grants | `order.view` | Read access needs: the order's copy, the access list for a performance, and a check of the access scheme on a customer's behalf. Declared with audit 'read', and the ability of the purpose box-office.booking | `box-office-manager`, `front-of-house-manager` |
| `box-office.order.sell` | `core.performance` | normal |  | `order.view` | Sell at the desk and by phone | `box-office-staff` |
| `box-office.order.reserve` | `core.performance` | normal |  | `order.view` | Reserve for a customer at the desk or by phone | `box-office-staff` |
| `box-office.order.take-payment` | `box-office.order` | normal |  | `order.view` | Take payment for a reserved order, and adjust it first | `box-office-staff` |
| `box-office.order.release` | `box-office.order` | normal |  | `order.view` | Release a reservation by hand, or mark one to keep | `box-office-staff` |
| `box-office.order.cancel` | `box-office.order` | privileged | refuses | `order.view` | Cancel lines of a paid order. Does not imply a refund | `box-office-manager` |
| `box-office.order.refund` | `box-office.order` | privileged | refuses | `order.view` | Ask Payments to refund an order's part, with or after a cancellation. Approval is still Payments' | `box-office-manager` |
| `box-office.order.exchange` | `box-office.order` | normal | refuses | `order.view` | Exchange tickets for a buyer | `box-office-staff` |
| `box-office.order.resend` | `box-office.order` | normal | grants | `order.view` | Show, resend or reissue tickets. Showing or resending reads the ticket's stored code and is an audited read | `box-office-staff` |
| `box-office.order.export` | `core.production` | privileged |  | `order.view` | Export a list of orders | `box-office-manager` |
| `box-office.ticket.admit` | `core.performance` | normal |  |  | Scan and admit; undo a mis-scan with a reason; see the door list | Fact `front-of-house.on-shift`; `box-office-staff` |
| `box-office.ticket-type.override-requirement` | `core.performance` | privileged |  |  | Sell a ticket type to someone who does not meet its requirement, or admit one at the door with "Admit anyway". Needs a reason, is audited, and never applies to one's own ticket | `box-office-manager`, `front-of-house-manager` |
| `box-office.performance.manage` | `core.performance` | normal |  |  | Set up sales, capacity and the on-sale window; record the decision for a cancelled, rescheduled or moved performance | `box-office-manager`; `production-lead` by grant on the production |
| `box-office.performance.exceed-venue` | `core.performance` | privileged |  |  | Confirm capacity above the core's own figure | `box-office-manager` |
| `box-office.pricing.manage` | `core.production` | normal |  |  | Ticket types and prices | `box-office-manager` |
| `box-office.hold.manage` | `core.performance` | normal |  |  | Hold, label and release seats | `box-office-staff` |
| `box-office.waitlist.manage` | `core.performance` | normal |  |  | See the queue and make offers by hand | `box-office-staff` |
| `box-office.promo.manage` |  | normal |  |  | Promo codes | `box-office-manager`, `communications-officer` |
| `box-office.comp.request` | `core.performance` | normal |  |  | Ask for complimentary tickets | `production-lead` and `visiting-company`, by grant on the production |
| `box-office.comp.approve` | `box-office.comp-request` | privileged | refuses |  | Approve or decline; never your own | `box-office-manager` |
| `box-office.pass.manage` |  | normal |  |  | Pass types and passes | `box-office-manager` |
| `box-office.plan.manage` |  | normal |  |  | Seating plans | `box-office-manager` |
| `box-office.report.view` | `core.production` | normal |  |  | Sales reports | `box-office-manager`, `finance-officer`; `production-lead` and `visiting-company` by grant |
| `box-office.report.export` | `core.production` | privileged |  | `report.view` | Export a sales report | `box-office-manager`, `finance-officer` |
| `box-office.settings.manage` |  | privileged |  |  | Change box-office settings | `administrator` |

## Abilities: payments

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `payments.session.open` |  | normal |  |  | Open and close your own till session | `box-office-staff`, and any role that may sell |
| `payments.session.view` | `payments.session` | normal | grants |  | See sessions and their counts | `finance-officer`, `box-office-manager` |
| `payments.session.close-any` | `payments.session` | privileged | refuses | `session.view` | Close someone else's session, or countersign a variance | `finance-officer`, `front-of-house-manager` |
| `payments.refund.request` |  | normal |  |  | Ask for a refund from Payments' own screens. It names no module's record: an owning module guards refunds of its own records with its own ability | `finance-officer` |
| `payments.refund.approve` | `payments.refund` | privileged | refuses |  | Approve a refund; never your own above the stored limit | `box-office-manager`, `finance-officer` |
| `payments.attempt.reconcile` |  | privileged |  |  | Answer an unknown attempt from the provider's own records | `finance-officer`, `box-office-manager` |
| `payments.attempt.attest` |  | normal |  |  | Record a cash or standalone-card payment | `box-office-staff`, and any role that may sell |
| `payments.provider.manage` |  | privileged |  |  | Add providers, pair readers, switch test mode | `administrator`, `finance-officer` |
| `payments.settings.manage` |  | privileged |  |  | Change payments settings | `administrator` |

## Abilities: finance

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `finance.ledger.view` | `core.production` | normal |  |  | Read the ledger and statements | `finance-officer`; `production-lead` and `visiting-company` by grant on their production |
| `finance.ledger.export` |  | privileged |  | `ledger.view` | Export postings | `finance-officer` |
| `finance.posting.correct` |  | privileged |  | `ledger.view` | Post a reversal or correction by hand | `finance-officer` |
| `finance.account.manage` |  | privileged |  |  | Rename and recode accounts, and add an account for a module | `finance-officer` |
| `finance.period.close` | `finance.period` | privileged |  | `ledger.view` | Close a period | `finance-officer` |
| `finance.period.reopen` | `finance.period` | privileged |  |  | Reopen a closed period, with a reason | `finance-officer`, and the theatre may require a second role |
| `finance.settings.manage` |  | privileged |  |  | Change finance settings | `administrator` |

The holders are keys of Identity's fifteen preset roles (integration ruling R-03). No module here declares a role, and none needs a role Identity does not have.

## Facts

These modules declare **no facts**. They rely on one from another module: `front-of-house.on-shift` (holds for an account on a performance during its confirmed shift). A theatre maps `box-office.ticket.admit` and `box-office.order.view` to it, so tonight's stewards can scan tonight's show and nobody needs a standing grant. Because it is a `uses` link, the box office works without it: with Front of house switched off, admission needs an ordinary grant.

## Secrets and credentials

| Name | Kind | Needed | For |
| --- | --- | --- | --- |
| `box-office.door-code` | signing purpose (kit, story F-37) | always | Signing door codes so a device can check one offline. The kit owns and rotates the keys (`rotateEvery` 90 days, `keepFor` 48 months, both proposed); Box office holds no signing secret |
| `PAYMENTS_<PROVIDER>_SECRET_KEY`, `PAYMENTS_<PROVIDER>_WEBHOOK_SECRET` | secret | when-used | An integrated provider joined by API key. The only way to connect in the first release |
| `payments.<provider>` | credential (`oauth` or `api-key`) | when-used | An integrated provider connected from inside the app, held in the core's encrypted credential store. Later |

The access note uses the kit's `col.special` encryption and needs no secret of its own.
