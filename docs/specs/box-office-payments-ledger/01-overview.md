# Box office, payments and ledger: specification

Nov 16, 2026 · @Matthew Adcock

Workstream 4 of the detailed-design stage. It specifies ticketing, the payment provider interface and the money ledger for the new platform, and reports the last-seat proof on D1.

## Summary

- **Three modules:** Box office, Payments and Finance (the ledger only). Bar and Membership take money through Payments and the ledger without the box office existing.
- **The last seat sells once because the database refuses a second sale.** Claims are rows, a trigger keeps a counter, and a CHECK caps it at capacity. Proved on local D1 and on a deployed D1 database: 11 of 11 cases on each, including 40 buyers racing for one seat.
- **Paid means ticketed.** A payment's success, the order's confirmation, its tickets and its ledger posting are one database batch. The one way it can fail (money arriving after the seats have gone) ends in an automatic refund, never an oversell.
- **Reserve now, pay on arrival** is a first-class way to sell, because it is how the first theatre sells. A reservation claims seats exactly as a sale does and posts nothing until it is paid at the desk.
- **Every payment attempt ends in a recorded answer**, from the provider or from a named person. "No answer" is its own state, and the seats stay held until it is resolved.
- **One payment can have several owners.** An intent is split into parts, so one tap on the one card reader can pay for tickets and bar items, and each part settles and refunds on its own.
- **The ledger is double entry and append-only.** A posting balances or does not exist. Periods are closed by adding a row; late facts post into the next open period.
- **Buying needs no sign-in.** An order is still keyed to an account, which Identity creates unclaimed for the buyer's address. The audience screens say nothing of membership, except the provider's own phrase inside a ticket type that depends on one.
- **Size:** 38 tables, 69 stories (63 in the first release), 92 named never-regress tests, 11 questions for Matt, all answered.

The parts can be read in any order. **9. Questions for Matt** records the eleven answers the rest is written to.

## At a glance

```mermaid
---
title: "Three modules, each ignorant of the others' business"
---
flowchart LR
  subgraph bo["Box office"]
    direction TB
    bo1["Pools, holds and claims<br/>capacity is a database constraint"]
    bo2["Orders and lines<br/>one line per ticket"]
    bo3["Tickets and scans<br/>signed codes, offline door"]
    bo4["Also codes, passes, comps<br/>and the waiting list"]
    bo1 ~~~ bo2 ~~~ bo3 ~~~ bo4
  end
  subgraph pay["Payments"]
    direction TB
    pay1["Intents<br/>one amount, a part per owner"]
    pay2["Attempts<br/>always a recorded answer"]
    pay3["Refunds<br/>never more than was paid"]
    pay4["Providers plug in: cash,<br/>card online, card reader"]
    pay1 ~~~ pay2 ~~~ pay3 ~~~ pay4
  end
  subgraph fin["Finance: the ledger"]
    direction TB
    fin1["Postings and entries<br/>double entry, append-only"]
    fin2["Seals<br/>balanced or it does not exist"]
    fin3["Periods<br/>closed by an appended row"]
    fin4["Knows nothing of tickets<br/>or providers"]
    fin1 ~~~ fin2 ~~~ fin3 ~~~ fin4
  end
  bo -->|"1"| pay
  pay -->|"2"| bo
  pay -->|"3"| fin
  bo -->|"4"| fin
  key["1 Box office asks Payments to collect or refund an amount. It never talks to a provider.<br/>2 When the money is in, Payments runs Box office's settle step: paid, ticketed and posted in one batch.<br/>3 Payments writes the one sealed posting for each sale and refund, and posts fees and cash differences.<br/>4 Box office returns the ledger entries for sales and refunds, and posts earned income itself."]
  fin ~~~ key
```

*module map · 3 modules, 4 links*

Payments reaches Box office only through an extension point, so it does not depend on it. The same point will serve the Bar and Membership.

## Status

Draft 2, 16 November 2026. All nine parts and the proof are written, Matt's eleven answers are in, and the integration rulings and consistency worklist items W-128 to W-168 are applied. Nothing waits on another workstream.

| Part | State |
| --- | --- |
| 1. Scope | Written |
| 2. Data model | Written, in the Foundations format: 38 tables |
| 3. States and rules | Written, three life-cycle diagrams |
| 4. Interface to other modules | Written; agreed with Foundations, Identity, Core domain, Interface, Form builder, Communications, Front of house, Bar and Membership |
| 5. Screens | Written, three wireframes; the door is a Live page |
| 6. Settings and abilities | Written; abilities are mapped to Identity's preset role keys |
| 7. Stories | 69 stories |
| 8. Test plan | 92 never-regress cases |
| 9. Questions for Matt | Eleven questions, all answered |
| Proof: last seat on D1 | Passed locally and on deployed D1 |

**What this specification does not do.** It names no visual design. Its defaults in part 6 are proposals. Its claims about Stripe, SumUp, pretix and Cloudflare are sourced to their own documentation where they appear; nothing was tested against a real provider.
