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
- **Channels:** online by the customer, at the desk, and by phone on the customer's behalf. Guest checkout with no account.
- **After the sale:** cancellation, refund, exchange, reissue, and what happens when a performance is cancelled or moved.
- **Entitlements:** passes and season tickets, complimentary requests with approval, promotional codes, companion tickets and wheelchair spaces.
- **The door:** e-tickets with a signed code, scanning that works offline, a door list, and sales at the door.
- **Money:** the provider interface, four first providers (online card, in-person reader, cash, none), refunds by the original method, and reconciliation at the end of a session.
- **The ledger:** accounts, postings, reversals, periods, period close, and a trial balance. Every posting carries its production and performance.
- **Externally ticketed and unticketed performances** are the core's: it keeps the external booking link, and the box office simply has no sales record for them.

## Out of scope

| Left out | Why | Where it goes |
| --- | --- | --- |
| Building allocated seating (plan editor, seat picker) | Roadmap phase 6. NNT sells unreserved seats | The seat model and its constraint are specified and proved here, so nothing is reworked later |
| Gift vouchers and a donation at checkout | Roadmap phase 6 | Order lines already allow both kinds; the ledger already has the accounts |
| Embeddable booking widget, wallet tickets, agent and promoter allocations | Later items in the catalogue | Listed in the later backlog in part 7 |
| Budgets, expense claims, invoices, exports to accounting packages, bank and payout reconciliation | The rest of Finance, a later round | They read and post to the ledger specified here |
| The bar till | Bar and kiosk module, a later round | It uses the same Payments and ledger services |
| Membership rules and prices | Membership module, a later round | Membership contributes a rule to the point box-office.eligibility; with no Membership module nobody qualifies |
| Mailing segments and marketing consent | Communications | Box office announces events and offers a ticket-holder query |
| Direct Debit | Suits memberships and regular giving, not tickets (Research: Payment providers) | Membership and Fundraising |
| Tax beyond "none" | No first theatre needs it | Columns and accounts exist from the start; only the "none" mode is built first |

## What this assumes of other workstreams

| Workstream | Relied on | Status on 16 November |
| --- | --- | --- |
| 1. Foundations | The manifest and registries; a unit of work that lets a posting, an order and a payment outcome commit in one batch; generated triggers for append-only tables; `externalCall` for provider calls; the encrypted credential store | Agreed in Foundations draft 1 and its later rulings |
| 2. Identity and accounts | The account is the person, and a sign-in is optional: `findOrCreateAccount` gives every named buyer an account, claimed or not. Record-scoped ability checks. Account merge and erasure | Agreed by message. Open: an anonymous desk sale with no account |
| 3. Core domain | Productions and performances, whose states are draft, scheduled, cancelled and completed. Sale state belongs to Box office. The points `core.booking-action`, `core.change-impact` and `core.change-guard`; vocabularies; the suppression list. An externally ticketed performance is the core's case | Agreed by message |
| 5. Form builder | A form attachable to a checkout | Later release; nothing else waits on it |
| 6. Interface | The three shells, list conventions, an offline-capable page for the door | Assumed; the wireframes show content and order only |

## Terms used in this document

| Term | Meaning |
| --- | --- |
| Band | A priced part of the house for one production, such as Stalls or Standing. A general admission show usually has one |
| Pool | The capacity of one band at one performance. The thing that can sell out |
| Claim | One unit of a pool, or one seat, taken by somebody. Held, then confirmed, then possibly released |
| Hold | A set of claims with one reason and one expiry: a basket, a staff hold, a waiting-list offer |
| Order | What one customer is buying or has bought, in one currency |
| Ticket | The entitlement to enter, issued when a claim is confirmed. It carries the code that is scanned |
| Intent | A request to collect one amount for one purpose. It has one or more attempts |
| Attempt | One try at taking the money through one provider, with a recorded outcome |
| Posting | One balanced set of ledger entries |
