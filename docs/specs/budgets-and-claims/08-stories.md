# 7. Stories

Forty-six stories, BC-01 to BC-46: 5 gate, 33 first release, 8 later. `BC` is a new prefix, checked against every story prefix in `docs/` on 23 November 2026. Budgets is roadmap phase 6, so "first release" means the module's own. The gate stories are the ones Invoices and exports and Reports wait on and can be built first.

## Gate

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-01 | As the platform, a ledger entry can carry a budget line | `finance_entries.budget_line_id` exists; `postEntries` accepts it; `balances({ budgetLineIds })` sums by it with a subquery; an entry without it is unchanged | Finance amendment, part 4 |
| BC-02 | As the platform, Finance records a posting's purpose | `finance_postings.purpose` is added without rebuilding the table; postings with purpose `expense`, `disbursement`, `bill`, `invoice`, `credit_note` or `write_off` post and seal under existing kinds; the append-only triggers still refuse update and delete | BC-01; Integration's ruling on the migration (question 11) |
| BC-03 | As a treasurer, I keep the categories money is spent on, each mapped to an expense account | Preset categories are seeded on enable; each names an account given to Budgets or falls back to `budgets.expenses`; archive and restore work | Finance `accountsOf` |
| BC-04 | As the platform, Budgets makes its system accounts | Enabling the module creates `claims-payable` and `expenses`, locked to `budgets` | Finance `finance.system-account` |
| BC-05 | As Invoices and exports, I can code a bill line to a budget line | Budgets' contribution to `invoicing.cost-coding` returns the picker, `check` and `fulfil`; `check` never refuses; `fulfil` raises a request's fulfilled amount in the caller's unit | BC-01, BC-07, BC-12 |

## First release

### Budgets

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-06 | As a treasurer, I create a budget for a production, a department and year, a season, or a general purpose | Uniqueness per scope holds among budgets not closed; the finance year comes from `finance.year.starts` | BC-03 |
| BC-07 | As a budget's author, I add expense and income lines with amounts | Lines reorder by drag and drop; draft amounts change freely; an income line names ledger accounts to read | BC-06 |
| BC-08 | As an author, I propose a budget; as the treasurer, I approve it or send it back | Proposer cannot approve; approval copies draft amounts as the first approved amounts; event announced | BC-07 |
| BC-09 | As a treasurer, I revise an approved line with a reason | A new approved amount row; the history shows both; revising below spent plus committed asks to confirm | BC-08 |
| BC-10 | As anyone who may view it, I see budgeted, committed, pending, spent and remaining per line | Spent equals Finance's sum of tagged entries, to the penny, in a named test; each figure opens what makes it up | BC-01, BC-08 |
| BC-11 | As a producer, I see my production's budget on its page | Record tab and record fact appear only with `budgets.budget.view` on it; income lines show ticket and bar income to date | BC-10 |
| BC-12 | As a season's treasurer, I fund production budgets from a season line | A sub-budget's approved total counts as committed on the parent line | BC-08 |
| BC-13 | As a treasurer, I close a budget, and reopen it with a reason | Close refused while claims, requests or awards are open on it, listing them; production budgets are offered `budgets.close.after` past the last performance | BC-08 |
| BC-14 | As a treasurer, I grant people as holders of a budget | A record-scoped grant of `budgets.budget.hold`; it ends at the role year end like any grant | Identity grants |

### Spending requests

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-15 | As a member, I ask to spend an amount on a line before spending it | Only lines of approved budgets are offered; the holders are told | BC-08 |
| BC-16 | As a holder, I approve or decline a request; it counts as committed | Not one's own; over budget needs the treasurer; declined needs a note | BC-15 |
| BC-17 | As the platform, unfulfilled approved requests lapse | The daily task sets lapsed after `lapses_on`; the line's committed figure drops | BC-16 |
| BC-18 | As the platform, a licence fee falling due becomes a commitment | `productions.licence.fee-due` makes or replaces one approved request on category `rights`; keyed on the fee id, a re-announcement replaces it and fee-withdrawn withdraws it; the same event twice leaves one | BC-16; Productions |

### Claims

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-19 | As a member, I make a claim on my phone, photographing each receipt | Items, photos, line suggestions, the declaration; saved as draft without submitting | BC-08; core files |
| BC-20 | As a claimant, I submit my claim | Guards of part 3 hold; it gets its number; approvers are told; content is fixed | BC-19 |
| BC-21 | As an approver, I review a claim with each receipt beside its item | Only approvers of its lines and `claim.view-all` open it; the read is audited for `claim.view-all` | BC-20 |
| BC-22 | As an approver, I approve a claim in whole or in part | C1 to C3 and C5 hold; the expense posts in the same unit, one debit per item tagged with its line; claimant told | BC-21, BC-01, BC-02 |
| BC-23 | As an approver, I send a claim back or decline it with a note | Returned claims are editable; resubmission is logged; declined claims post nothing | BC-21 |
| BC-24 | As a claimant, I withdraw a claim not yet decided | Nothing posted; holders' queues update | BC-20 |
| BC-25 | As a treasurer, I void an approved, unpaid claim | The expense posting is reversed in the same unit; refused once anything is paid | BC-22 |
| BC-26 | As a treasurer, I set a second approval above an amount | With the setting set, a claim above it stays submitted after the first approval and is approved by a second, different person | BC-22 |
| BC-27 | As a claimant, I link my claim to the request I made | `request_id` set; on approval the request's fulfilled amount rises; any excess over the request needs the usual approver | BC-16, BC-22 |
| BC-28 | As an approver, I see late and "not asked first" marks | Marks follow the two settings; nothing is refused | BC-21 |
| BC-45 | As a treasurer of a VAT-registered theatre, I reclaim the input VAT on claim receipts | Each claim item takes a tax code (standard, reduced, zero, exempt, outside) and its VAT amount; at approval the VAT posts to finance.vat-input and the net to the category account, so the budget counts the net. Offered only while finance.tax.number is set. Cites Finance amendment F-A2; first release, since Integration Q12 (answered 24 November 2026) puts VAT registration in the first release. | Finance F-A2 |

### Paying

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-29 | As a treasurer, I see approved claims to pay, grouped by claimant and route | Not my own; totals by route; the bank details state shows as "on file" or "missing", never the details | BC-22 |
| BC-30 | As a treasurer, I record a payment for one or more claims | Payments' outgoing payment is made with one part per claim; Budgets' handler raises `paid_minor` and debits `claims-payable`; a full payment sets paid; the claimant is told | BC-29; Payments amendment |
| BC-31 | As the platform, a reversed payment returns the claim to approved | Handler lowers `paid_minor`; logged as payment-reversed | BC-30 |
| BC-32 | As a treasurer at a theatre whose parent body pays claims, I download the schedule | CSV as part 5 says; formula injection guarded; audited; the route's claims marked paid when the parent body confirms, through BC-30 with method "paid by the parent body" | BC-29 |

### Around the edges

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-33 | As the platform, a claim is a financial record for its retention, then anonymised | Erasure holds for unpaid and open claims; others retain until `budgets.retention.claims`, then anonymise, redact and delete receipts in one unit | BC-20; core erasure |
| BC-34 | As holders and the treasurer, we are told when a line goes over budget | One notification per crossing; none again until it comes back under and crosses again | BC-10 |
| BC-35 | As Reports, I read Budgets' figures | `core.measure` contributions answer by the keys in part 4, aggregates only | BC-10; Reports |
| BC-36 | As a treasurer closing a period, I am warned of claims still to come | `finance.period-close-check` lists old undecided claims with items in the period; it never blocks | BC-20 |
| BC-37 | As a committee member, I export budgets and figures | CSV of budgets with line figures; formula-injection guarded; audited | BC-10 |

## Later

| Id | Story | Done when | Needs |
|---|---|---|---|
| BC-38 | As a treasurer, I offer a funding award to an act from a budget line | Draft, offer, withdraw; the company's contacts are told; it counts as committed once accepted | BC-08; Companies |
| BC-39 | As a company contact, I accept or decline an award and claim against it | Claims against an award never exceed what is left; approved by the award's manager under C1 to C5 | BC-38, BC-22 |
| BC-40 | As a treasurer, I pay an award as a lump sum | On acceptance a one-item claim is made for the company and paid through Payments to the company's payee | BC-38, BC-30 |
| BC-41 | As Companies, a settlement shows awards on the engagement | Contribution to `companies.settlement-note`, information only | BC-38 |
| BC-42 | As a treasurer, I copy a department's budget into next year | A draft with the same lines and last year's approved amounts | BC-08 |
| BC-43 | As a member, I claim mileage or a per-day allowance | An item computed from distance or days at a rate the theatre sets; receipt not required for it | BC-19 |
| BC-44 | As a module, I commit money without a spending request | Point `budgets.commitment-source` declared once a second module needs it | Inventory or Spaces |
| BC-46 | As a production lead, I see grant income expected and received against my production's budget | Listens to fundraising.grant.awarded and fundraising.grant.closed (keyed on applicationId; productionId optional, unassigned awards stay off production budgets) and shows awarded but not yet received as expected income on a grants income line. Received income stays the ledger balance of Fundraising's fundraising.grant-income account for the production (Fundraising M7 tags each grant payment with production\_id), through budgets\_line\_sources, so it is never counted twice. Never reads Fundraising's tables (R3-06 as amended). | Fundraising |

A bank payment file (a batch for the theatre's bank) is left to Payments' outgoing payments, where the details live; Budgets asks for it there rather than holding a story.
