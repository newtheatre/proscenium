# 1. Scope

This specification covers three modules that ship together in roadmap phase 3: Box office, Payments, and the ledger half of Finance. It follows the design paper's Module catalogue and Decisions tabs, and it is designed from scratch.

## The three modules

| Module | Id and table prefix | Owns | Requires |
| --- | --- | --- | --- |
| Box office | `box-office`, `box_office_` | What is for sale, capacity, holds, orders, tickets, passes, comps, codes, the waiting list, door scanning | Payments, Finance |
| Payments | `payments`, `payments_` | Provider accounts, payment intents, attempts and their outcomes, refunds, webhooks, till sessions | Finance |
| Finance (ledger only) | `finance`, `finance_` | Chart of accounts, the append-only double-entry ledger, periods and period close | none |

Payments never knows what was bought. Box office never talks to a provider. Finance never knows what a ticket is. Each of the three can be replaced without touching the other two.

## In scope

- **Selling:** ticket types, concessions, price bands, prices per production or per performance, on-sale windows, limits per order, an optional booking fee.
- **Capacity:** general admission pools and the seat model for allocated seating, enforced in the database so the last seat sells once.
- **Holds:** baskets that expire, staff holds, holds for waiting-list offers, and holds kept alive while a payment is in flight.
- **Channels:** online by the customer, at the desk, and by phone on the customer's behalf; paid at once, or reserved now and paid on arrival. Checkout needs no sign-in.
- **After the sale:** cancellation, refund, exchange, reissue, and what happens when a performance is cancelled, rescheduled or moved.
- **Entitlements:** ticket types that depend on a requirement such as membership, passes and season tickets, complimentary requests with approval, promotional codes, companion tickets and wheelchair spaces.
- **The door:** e-tickets with a signed code, scanning that works offline, a door list, and sales at the door.
- **Money:** the provider interface and its first providers (cash, attested card, Stripe online, the SumUp reader), one payment shared between modules, refunds by the original method, and reconciliation at the end of a session.
- **The ledger:** accounts, postings, reversals, periods, period close, and a trial balance. Every posting carries its production and performance.
- **Externally ticketed and unticketed performances** are the core's: it keeps the external booking link, and the box office simply has no sales record for them.

## Out of scope

| Left out | Why | Where it goes |
| --- | --- | --- |
| Building allocated seating (plan editor, seat picker) | Roadmap phase 6. NNT sells unreserved seats | The seat model and its constraint are specified and proved here, so nothing is reworked later |
| Gift vouchers and a donation at checkout | Roadmap phase 6 | An order line already has a donation kind and the ledger a donation account. A voucher needs a line kind and a liability account when it is built |
| Embeddable booking widget, wallet tickets, agent and promoter allocations | Later items in the design paper's module catalogue | Not scheduled, and no stories are written for them |
| Budgets, expense claims, invoices, exports to accounting packages, bank and payout reconciliation | The rest of Finance | They read and post to the ledger specified here |
| The bar till | The Bar module's own specification | It uses `payments.desk-basket`, `payments.settlement` and the ledger as specified here |
| Membership rules and prices | The Membership module's own specification | Membership is a source for `core.requirement`. A ticket type names a requirement, and with no source for it the type is withheld |
| Mailing segments and marketing consent | Communications | Box office announces events, offers the checkout consent point and contributes audience sources |
| Direct Debit | Suits memberships and regular giving, not tickets (Research: Payment providers) | Membership and Fundraising |
| Tax beyond "none" | No first theatre needs it | Columns and accounts exist from the start; only the "none" mode is built first |

## What this relies on from other workstreams

| Workstream | Relied on | Status |
| --- | --- | --- |
| 1. Foundations | The manifest and registries; a unit of work that lets a posting, an order and a payment outcome commit in one batch; generated triggers for append-only tables; `externalCall` for provider calls; `core.requirement`; the signing service; the encrypted credential store | Agreed |
| 2. Identity and accounts | The account is the person, and a sign-in is optional: `findOrCreateAccount` gives every named buyer an account, claimed or not. Record-scoped ability checks, the preset role keys, account merge and erasure | Agreed. A desk sale with no details has no account; orders declare `unlinked: 'staff'` (integration ruling R-15) |
| 3. Core domain | Productions and performances, whose states are draft, scheduled, cancelled and completed. Sale state belongs to Box office. The points `core.booking-action`, `core.change-impact` and `core.change-guard`; vocabularies; `notify`; the suppression list. An externally ticketed performance is the core's case | Agreed |
| 5. Form builder | Questions attached to a ticket type through `forms.slot` | Agreed; later release, and nothing else waits on it (R-17) |
| 6. Interface | The menus, list conventions, the Live page pattern for the door | Agreed (R-22) |
| Communications, Front of house, Bar, Membership | The contracts in part 4 | Agreed with each |

## Terms used in this document

| Term | Meaning |
| --- | --- |
| Band | A priced part of the house for one production, such as Stalls or Standing. A general admission show usually has one |
| Pool | The capacity of one band at one performance. The thing that can sell out |
| Claim | One unit of a pool, or one seat, taken by somebody. Held, then confirmed, then possibly released |
| Hold | A set of claims with one reason and, usually, one expiry: a basket, a reservation, a staff hold, a waiting-list offer |
| Order | What one customer is buying or has bought, in one currency |
| Ticket | The entitlement to enter, issued when a claim is confirmed. It carries the code that is scanned |
| Intent | A request to collect one amount, split into one part for each record it pays for. It has one or more attempts |
| Attempt | One try at taking the money through one provider, with a recorded outcome |
| Posting | One balanced set of ledger entries |
