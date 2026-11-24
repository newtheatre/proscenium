# 1. Scope

Budgets and claims (`budgets`) is a switchable module that requires `finance` and uses `payments`, `companies` and `productions`. It plans spending, holds promises to spend, and turns a person's receipts into a debt the theatre then pays.

## In scope

| Area | What it covers | Release |
|---|---|---|
| Categories | What money is spent on (set, costume, publicity, rights), each mapped to a Finance expense account | First |
| Budgets | One per production, per department per finance year, per season, or a general one; lines with amounts; propose, approve, revise, close | First |
| Income lines | A production budget's expected ticket and bar income, read from the ledger by production | First |
| Spend and remaining | Budgeted, committed, spent and remaining per line, live from the ledger and this module | First |
| Spending requests | "Can I spend £80 on paint?" asked of the budget holder before the money goes | First |
| Expense claims | Items with receipts, charged to lines, submitted, approved in whole or part, declined, sent back | First |
| Paying claims | Choosing approved claims to pay and recording the outgoing payment through Payments | First |
| Parent-body claims schedule | A download of claims for a students' union or other parent body that pays them | First |
| Funding awards to acts | A sum offered to a visiting company or festival act from a budget line, accepted, then claimed against with receipts or paid as a lump sum | Later, with the festival release (question 8) |
| Rollover | Copy a department's budget into the next finance year as a draft | Later |
| Mileage and per-diem claims | A claim item computed from a distance or a number of days at a set rate | Later |
| Bank payment file | A file of approved claims for the theatre's bank to pay in one batch | Asked of Payments' outgoing payments, where bank details live |

## Out of scope, and who owns it

| Not here | Owner |
|---|---|
| The ledger, accounts, periods, period close | Finance |
| Moving money out: the outgoing payment record, its methods, bank details of anyone paid | Payments, through the "outgoing payments" amendment written in Invoices and exports (spec 9) |
| Supplier bills, sales invoices, purchase orders to suppliers, accounting exports, a parent body's ledger return | Invoices and exports. A bill line may be charged to a budget line |
| Box office splits and hire fees with a company | Companies. An award shows on its settlement as information only |
| Licence terms and royalty rates | Productions, which announces a fee falling due |
| Donations, Gift Aid, sponsors | Fundraising. A theatre may budget expected donations as an income line later |
| Cross-module finance reports | Reports, reading this module's figures through `core.measure` |
| Taking money of any kind | Payments, on the SU's physical SumUp reader at NNT. Nothing in this module charges anyone |
| Payroll, paid staff, tax on expenses | Nothing. A theatre with employees runs payroll elsewhere |

## What it assumes of other modules

| Module | Assumption | State |
|---|---|---|
| Finance | Entries carry a nullable `budget_line_id`; `balances` filters by it; postings carry a purpose (`expense`, `disbursement`), all added without rebuilding an append-only table | Asked in part 4. Not built |
| Payments | An outgoing payment (`payments_disbursements`) with owner handlers through point `payments.disbursement`, and one encrypted payee store | Written by Invoices and exports in its tab 4; agreed 23 November 2026 |
| Core | Productions, seasons, terms, files with slots, notifications, home cards, record tabs and facts | Built |
| Identity | Record-scoped grants, facts, preset roles, `ownRecordExempt` (not used: four-eyes rules are not exempt) | Built |
| Companies | Point `companies.settlement-note`, fact `companies.contact-of`, service `companies.contactsOf` | Agreed 23 November 2026 |
| Productions | Event `productions.licence.fee-due` | Agreed 23 November 2026 |
| Reports | Kit point `core.measure` | Draft contract, 23 November 2026 |

## Principles

1. **The ledger says what was spent.** This module never stores a spent total. Two screens cannot disagree.
2. **Ask, then spend, then claim.** Each step is optional, but each is recorded, and the person who decides is never the person who asked.
3. **A receipt is the claim.** A photo taken on a phone at the till is enough; typing is kept to an amount, a date and what it was for.
4. **Warn, then widen.** Going over budget is allowed with a more senior approver, never silently and never by refusal.
5. **Money is promised once and paid once.** Approval and payment are conditional writes; a race leaves one posting.
6. **Financial records outlive the person.** A claim is kept for the theatre's accounting retention, then anonymised. The person's name never travels in an event, an export of ledger lines or audit detail.

## Glossary

Words this module owns. Words owned elsewhere are used as the shared glossary rules.

| Term | Meaning |
|---|---|
| Budget | A plan of spending and income for one production, one department in one finance year, one season, or a general purpose |
| Budget line | One heading of a budget with an amount: "Set and props: £400". What spend is charged to |
| Category | What money is spent on, mapped to a Finance expense account. A line has one; a claim item may name another |
| Department | A part of the theatre that holds a yearly budget (Technical, Publicity, Bar). A term in core's shared vocabulary `core.department` |
| Budget holder | A person granted `budgets.budget.hold` on a budget. Approves requests and claims within it |
| Budgeted | The line's current approved amount |
| Committed | Promised but not yet spent: approved spending requests not yet fulfilled, accepted awards not yet claimed |
| Pending | Claims and bills submitted and not yet decided |
| Spent | The sum of sealed ledger entries tagged with the line |
| Remaining | Budgeted minus committed minus spent. Pending is shown beside it, not taken from it |
| Spending request | A person asking a budget holder to spend an amount before spending it |
| Expense claim, claim | A request to be paid back money a person spent for the theatre, made of items |
| Claim item | One purchase on a claim: a date, an amount, what it was for, a line, a receipt |
| Claimant | The person who made the claim and is owed the money |
| Send back | Returning a submitted claim to its claimant to change, with a note |
| Part approval | Approving less than an item's amount, with a reason |
| Paying a claim | Recording that the theatre paid the claimant, through Payments' outgoing payment |
| Funding award, award | A sum offered to a company or act from a budget line, for an engagement |
| Parent body | An organisation that holds and pays the theatre's money, such as a students' union |

"Claim" alone means an expense claim here. Box office's capacity claim is always "capacity claim", as ruled in the shared glossary.
