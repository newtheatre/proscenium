# 4. Interface

Budgets calls Finance's services, reaches Payments through a point it contributes to, and offers three services of its own. It never reads another module's table.

## The manifest

| Field | Value |
|---|---|
| `id` | `budgets` |
| Name | Budgets and claims |
| Kind | switchable |
| `requires` | `finance` |
| `uses` | `payments` (outgoing payments, payees), `companies` (awards, later), `productions` (licence fees) |
| Roadmap phase | 6 (design paper roadmap; integration ruling R-27) |
| Story prefix | `BC` |
| Records | `budgets.budget`, `budgets.line`, `budgets.category`, `budgets.request`, `budgets.claim`, `budgets.claim-item`, `budgets.award` |

Without `payments` switched on, claims are approved and posted but cannot be marked paid in the app; the payments-to-make screen says so and the treasurer pays outside it. That keeps a theatre that only wants budgets free of Payments.

## Services Budgets offers

Imported as `#modules/budgets` by modules that list `budgets` in `requires`. Writes take the caller's unit and never commit.

| Service | Shape | For |
|---|---|---|
| `checkLine(lineId, { amountMinor, productionId? })` | `{ ok, lineName, budgetName, budgetedMinor, committedMinor, spentMinor, remainingMinor, overByMinor, open }` | Invoices' bill form: the warning before a bill line is charged. Never refuses; `open` false means the budget is not approved |
| `fulfilRequest(unit, requestId, { module, type, id, amountMinor })` | void; refuses `budgets.request.not-approved` | Invoices, when an approved bill names a spending request |
| `linesFor({ productionId? , budgetId? })` | `[{ lineId, name, budgetName, kind, categorySlug }]` | Pickers in other modules |

A component `<BudgetLinePicker>` is exported from the layer for those pickers. It shows remaining money beside each line and greys a line of a budget that is not approved.

**No module that matters requires Budgets, so these are mostly reached through points.** Invoices and exports only uses Budgets (a theatre may invoice without budgets), so Budgets contributes one entry to Invoices' point `invoicing.cost-coding`: `{ picker: 'BudgetLinePicker', check, fulfil }`, where `check` and `fulfil` are `checkLine` and `fulfilRequest` above (agreed 23 November 2026). Companies likewise does not require Budgets, so Budgets contributes to `companies.settlement-note` rather than offering a service. The services stay exported for any later module that does require Budgets.

## Points Budgets declares

None in the first release. Spend arrives through the ledger tag, and commitments from other modules arrive as spending requests made by a listener. A point `budgets.commitment-source` for modules that commit money without a request (Inventory purchases planned, a hire deposit) is left to a later story (BC-44) until a second module needs it.

## Points Budgets contributes to

| Point | Contribution |
|---|---|
| `finance.system-account` | `claims-payable` (liability, "Expense claims to pay"), `expenses` (expense, "General expenses"), `grants` (expense, "Funding awarded", later) |
| `finance.period-close-check` | Warns, never blocks: claims submitted more than `budgets.reminders.approver-after` ago with items spent in the period, so a treasurer knows costs are still to come |
| `payments.disbursement` (Payments amendment, Invoices' tab 4) | Owner handler for `budgets.claim`: given a disbursement's parts, returns the debit to `budgets.claims-payable` per claim and raises `paid_minor`; on reversal, lowers it. Refuses a part larger than what is owed |
| `core.navigation` | Members' area "Expenses"; console group Money: Budgets, Approvals, Payments to make, Awards (later); Admin > Modules > Budgets: Categories |
| `core.record-tab` | "Budget" on `core.production`, for holders of `budgets.budget.view` on it |
| `core.record-fact` | "Budget: £1,200 of £1,500 spent" on `core.production` (asked for by Productions) |
| `core.home-card` | Console: "Claims to approve" and "Claims to pay". Members' area: "Your claims" while one is open, "Asked to change" when one is returned |
| `core.quick-action` | "Make a claim", "Ask to spend" |
| `core.file-slot` | `budgets.receipt` on `budgets.claim-item`: images and PDF, at most 5, 10 MB each, access record |
| `core.file-access` | A receipt is readable by its claimant, the approvers of its lines, and holders of `budgets.claim.view-all` or `budgets.claim.pay` |
| `core.vocabulary` | Nothing: departments are core's shared vocabulary `core.department` (Integration's provisional ruling, 23 November 2026), asked of core below |
| `core.erasure-hold` | `budgets.unpaid-claim`, `budgets.open-claim` (part 2) |
| `core.erasure-handler` | Deletes a claim's receipts when its retention ends |
| `core.notification-type` | Below |
| `core.setup-step` | "Check your spending categories", "Make your first budget" (optional) |
| `core.record-resolver`, `core.search-source` | Claims by number and title; budgets by name |
| `core.measure` (Reports' contract) | `budgets.budgeted` (level, money, by production, season, month, `budgets.line`, `budgets.department`), `budgets.committed` (level, money, same keys), `budgets.spent` (sum, money: Finance entries tagged with a line, so bills count too), `budgets.claims-pending` (level, count and money). Aggregates only. Reports declares the ratio of spent to budgeted |
| `companies.settlement-note` (later) | One line per award on the engagement: "Bursary: £300, £120 claimed". Information only, never posted |
| `core.policy-fact` | Quotable: the late-claim period and the receipt rule, for the theatre's expenses policy page |

## Events

Payloads hold ids and money only, never a name or a description.

| Event | Payload | Internal |
|---|---|---|
| `budgets.budget.approved` | `{ budgetId, scope, productionId?, totalMinor, currency }` | no |
| `budgets.budget.closed` | `{ budgetId }` | no |
| `budgets.claim.submitted` | `{ claimId, totalMinor, currency, lineIds }` | yes |
| `budgets.claim.decided` | `{ claimId, decision: approved, declined, returned, voided, approvedMinor? }` | yes |
| `budgets.claim.paid` | `{ claimId, paidMinor, disbursementId }` | yes |
| `budgets.request.decided` | `{ requestId, decision, amountMinor }` | yes |
| `budgets.award.offered`, `.accepted`, `.declined` (later) | `{ awardId, productionId, companyId, amountMinor }` | no |

Heard:

| Event | Handler |
|---|---|
| `productions.licence.fee-due` | Makes or replaces an approved spending request on the production's budget, category `rights`, keyed on the fee id, so a re-announcement with a new amount, date or estimate replaces it. productions.licence.fee-withdrawn withdraws it. Waits, as a job, until the production has an approved budget |
| `core.module.enabled` (budgets) | Finance makes the system accounts; Budgets seeds the preset categories |
| `finance.period.closed` | Nothing is stored; the approvals queue stops offering to backdate (it never does) |

## Notifications

| Type | To | When |
|---|---|---|
| `budgets.claim-to-approve` | Approvers of the claim's lines | Submitted; reminder after `budgets.reminders.approver-after` |
| `budgets.claim-decided` | Claimant | Approved, part approved, declined, returned, voided, with the note |
| `budgets.claim-paid` | Claimant | Paid, with method and reference, never bank details |
| `budgets.request-decided` | Requester | Approved or declined |
| `budgets.over-budget` | Holders of the budget, and the treasurer | A line's spent plus committed passes its budgeted amount, once per line per crossing |
| `budgets.award-offered` (later) | The company's contacts | Offered; reminder before `respond_by` |

## Asked of Finance

One amendment, written here so Finance changes once for spec 8 and spec 9. Agreed with Invoices and exports on 23 November 2026.

1. **A budget line dimension.** `finance_entries.budget_line_id`: text, nullable, `col.internal`, kept on erasure, a partial index where not null, opaque like `production_id`. Added with ALTER TABLE ADD COLUMN, so the append-only table is not rebuilt. `postEntries` accepts it per entry; `balances` takes a `budgetLineIds` filter, run as a subquery, never an id list of more than 90.
2. **A posting purpose, without new kinds.** `finance_postings.purpose`: text, nullable, added with ALTER TABLE ADD COLUMN (no rebuild), checked in `postEntries` against a list: `expense` (Budgets: an approved claim), `disbursement` (Payments: money paid out for any owner), `bill`, `invoice`, `credit_note`, `write_off` (Invoices and exports). The existing `kind` CHECK is untouched: all these postings use kind `transfer`, a disbursement included. Not `payout`: Finance's reconcile screen lists any asset account a payout empties as a clearing account, which would put the bank there. Reports and exports read `purpose` where set. This is question 11's recommendation; the alternative, new kinds through a rebuild, would break Foundations rule G6.
3. **Accounts given to a module.** A service `accountsOf(module, kind?)` returning the module's active accounts, so a category can offer the expense accounts a treasurer has given to `budgets` without reading `finance_accounts`.

All three are additive and none rebuilds an append-only table (Foundations G6, part 3; data-class registry). Integration puts question 11 to Matt with spec 9's answer.

## Asked of Payments

The "outgoing payments" amendment written by Invoices and exports (spec 9), tab 4, which Budgets cites and does not restate: `payments_disbursements` with methods bank transfer, cheque, theatre card, petty cash and paid by the parent body; the point `payments.disbursement` mirroring `payments.settlement`; and `payments_payees`, one encrypted store of bank details keyed by account or by `{ module, id }`, read under `payments.payee.read` with read audit. Budgets stores no bank details. A claimant enters theirs on Payments' payee form, linked from their claim.

## Asked of others

| Of | What | State |
|---|---|---|
| Companies | Point `companies.settlement-note`; fact `companies.contact-of` on `companies.company`; service `companies.contactsOf` (called only when `companies` is on) | Agreed 23 November 2026 |
| Productions | Event `productions.licence.fee-due` { feeId, licenceId, productionId, kind, amountMinor, currency, dueOn, estimated }, re-announced on change, and productions.licence.fee-withdrawn { feeId, licenceId, productionId }; both internal, ids and money only | Agreed 23 November 2026 |
| Reports | `core.measure` as drafted | Agreed 23 November 2026 |
| Identity | Preset abilities below, added to the role keys through this module's manifest | Through the manifest |
| Inventory, Integration | Core amendment: a shared vocabulary `core.department` (Technical, Publicity, Front of house, Bar, Social, General; editable), owned by core domain, used by Budgets and by Inventory's kit departments | Ruled provisionally by Integration, 23 November 2026 |

Preset abilities: `finance-officer` holds every Budgets ability; `committee-member` holds `budgets.budget.view` site-wide; `production-lead`, with fact `core.production-team`, holds `budgets.budget.hold` on their production's budget; every member (fact `core.member`) and `volunteer` hold `budgets.claim.make` and `budgets.request.make`; `visiting-company` holds nothing here, and a company's contacts act on awards through the fact `companies.contact-of`.
