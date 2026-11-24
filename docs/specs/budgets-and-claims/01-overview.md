# Budgets and claims: specification

2026-11-23 · Matthew Adcock

Budgets and claims (`budgets`) is the module that says what a theatre means to spend, shows what it has spent and promised, lets people ask before they spend, and pays back people who spent their own money. It records money and never moves it. This is its specification, spec 8 of the third round, written on 23 November 2026 in the nine parts of the first round.

## What this document settles

- **Spend is ledger truth.** What has been spent against a budget line is a sum of Finance's sealed entries carrying that line's id. Budgets keeps no running total of its own, so a bill from Invoices and a claim from Budgets land in the same figure. This needs one Finance amendment, written in part 4.
- **Committed is Budgets' own.** Approved spending requests, accepted funding awards not yet claimed and claims waiting for a decision are promises, not money, and live here.
- **A claim posts its cost when it is approved, and is paid later.** Approval writes an expense against the line and a debt to the claimant; paying it clears the debt through Payments' outgoing payments (written by Invoices and exports, spec 9). The SumUp rule is untouched: nothing here takes money.
- **Bank details are not stored here.** They live once, encrypted, in Payments' payee store, beside the outgoing payment that uses them.
- **Four-eyes, always.** Nobody approves or pays their own claim or request, and the Owner is not exempt (Matt, 23 November 2026).
- **Over budget is a warning and a wider approver, never a wall.** A claim that takes a line over budget needs the treasurer, not the budget holder.
- **Eleven tables, nine id prefixes, 46 stories** (5 gate, 33 first release, 8 later), and eleven questions for Matt in part 9: nine answered as recommended on 24 November 2026, two (bank details, the Finance purpose column) open with Integration.

## Combined and split

Matt asked each spec to think about what to join and what to split. Three were weighed.

| Option | Decision | Why |
|---|---|---|
| Split claims from budgets into two modules | Kept together | A claim's approver is the holder of the line it is charged to. Apart, every approval would cross a module boundary, and no theatre wants claims without something to claim against |
| Fold spending requests into Invoices' purchase orders | Kept here | A spending request is a person asking a budget holder; a purchase order is the theatre telling a supplier. Invoices links a bill to a request with `budgets.fulfilRequest` |
| Fold funding awards to acts into Companies | Kept here, agreed with Companies | An award is spend against a budget line and is claimed against with receipts, which is this module's flow. Companies shows it on a settlement as information only |

## How to read it

| Part | Holds |
|---|---|
| 1. Scope | What the module owns, what it leaves alone, its words |
| 2. Data model | Every table in the Foundations layout |
| 3. States and rules | Budgets, requests, claims, awards; the postings; the guards |
| 4. Interface | Manifest, services, points, events, and the Finance amendment |
| 5. Screens | Members' area, console, admin; three wireframes |
| 6. Settings and abilities | Registry formats |
| 7. Stories | BC-01 to BC-44 |
| 8. Test plan | Named cases that must never regress |
| 9. Questions for Matt | Eleven decisions: nine answered, two open with Integration |

## Written against

The built `finance` and `payments` layers on branch `next` of newtheatre/proscenium (commit cf7907e1), the Foundations formats, the Box office, payments and ledger specification, the design paper's catalogue (Finance section) and roadmap phase 6, old Proscenium's finance backlog stories I-201 to I-203, the map doc "Proscenium: the plan beyond what is built", and agreements made on 23 November 2026 with the Invoices and exports, Companies, Productions and Reports threads. Sources are listed in their tab.
