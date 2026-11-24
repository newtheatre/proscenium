# 3. States and rules

Four records have life cycles: the budget, the spending request, the claim and the award. Every change is one unit of work with its predicate on the statement (decision 0003), so two people acting at once leave one result and the loser is refused with the state they lost to.

## The claim

_Diagram in the source doc: claim life cycle · 8 states_

The expense is posted at approval; payment only clears the debt. A claim may also be withdrawn from returned or submitted, before anyone decides it.

| From | To | Who | Guard |
|---|---|---|---|
| (none) | draft | Claimant | Holds `budgets.claim.make`, or `budgets.award.claim` for a claim against an award |
| draft | submitted | Claimant | At least one item; every item has a receipt or a `no_receipt_reason` (unless `budgets.claims.receipt-required` is off); every item names a line in an approved budget; declaration ticked. Gets its number here |
| submitted | returned | Approver | A note. The claim is editable again by its claimant |
| returned | submitted | Claimant | As draft to submitted. Logged as resubmitted |
| submitted | approved | Approver (C1 to C5) | Every item has a line and an approved amount. Posts the expense in the same unit |
| submitted | declined | Approver | A note the claimant sees |
| draft, submitted, returned | withdrawn | Claimant | Nothing posted, nothing to undo |
| approved | voided | Treasurer (`budgets.claim.approve-any`) | A note. Reverses the expense posting in the same unit. Refused once any payment is recorded |
| approved | paid | Payments' handler | `paid_minor` reaches `approved_minor`. A part payment leaves it approved |
| paid | approved | Payments' handler | The outgoing payment was reversed (a bounced transfer). Logged as payment-reversed |

**The content of a claim is fixed once submitted.** Items, amounts and receipts change only in draft or returned. A mistake after approval is a void and a new claim, never an edit (old I-202 criterion 4).

### Who may approve (C1 to C5)

- **C1. Never your own.** The approver is not the claimant, and not the person who asked for the request it fulfils. The Owner is not exempt: four-eyes rules stay (Matt, 23 November 2026, PR 643).
- **C2. The holder of every line it touches.** A budget holder approves items on lines of budgets they hold. A claim with items on two budgets needs both holders, or the treasurer. Approval is per claim, so the second holder's approval is what moves it; the first is recorded as an event with no state change.
- **C3. Over budget widens the approver.** If approving would take a line's spent plus committed above its budgeted amount, only a holder of `budgets.claim.approve-any` (the treasurer) may approve. The screen shows by how much. Never refused outright.
- **C4. Above the second-approval threshold, two people.** When `budgets.claims.second-approval-above` is set and the claim's approved total exceeds it, a second approver with `budgets.claim.approve-any` must approve after the first. Unset by default.
- **C5. One approval wins.** `UPDATE budgets_claims SET state = 'approved', version = version + 1 ... WHERE id = ? AND state = 'submitted' AND version = ?`, expecting one row. The posting's idempotency key is `budgets:claim:<id>:expense`. Two racing approvals give one posting and a refusal `budgets.claim.changed` (old I-202 criterion 5).

_Diagram in the source doc: who may approve a claim · C1 to C5_

### Late claims

An item whose `spent_on` is older than `budgets.claims.late-after` when submitted is marked late on the approver's screen. It is not refused: a theatre decides. A claim that names no spending request when its total is above `budgets.requests.expected-above` (unset by default) is marked "not asked first".

## What a claim posts

Kinds are Finance's existing ones; the purpose is the column asked of Finance in part 4, added without a rebuild (question 11). Postings go through Finance's `postEntries` in the caller's unit, are sealed in that unit, and never name a person.

| Moment | Kind | Entries | Tags |
|---|---|---|---|
| Claim approved | transfer, purpose `expense` | Debit each item's category account by its approved amount (`budgets.expenses` when the category has none); credit `budgets.claims-payable` by the total | Each debit carries `budget_line_id`, and `production_id` when its budget is a production's |
| Claim voided | Reversal of the above | Finance's `reversePosting` | As the original |
| Claim paid | transfer, purpose `disbursement` | Written by Payments: credit the method's account (bank, cash, parent-body balance), debit `budgets.claims-payable` returned by Budgets' handler | `for_module` budgets |
| Payment reversed | Reversal of the disbursement | Payments | As the original |

The expense is dated at approval, so it always lands in an open period, and is recognised once whatever happens to payment. `spent_on` stays on the item for the claimant's and approver's view and is not the ledger date (question 2).

## The spending request

_Diagram in the source doc: spending request life cycle · 6 states_

| From | To | Who | Guard |
|---|---|---|---|
| (none) | requested | Requester | Holds `budgets.request.make`; the line is in an approved budget and not archived |
| (none) | approved | A module (listener) | Made already approved for a module-raised commitment, such as a licence fee; keyed on its source so a repeat replaces rather than duplicates |
| requested | approved | Holder of the line's budget, not the requester | Over budget widens the approver to the treasurer, as C3. Sets `lapses_on` |
| requested | declined | As approved | A note |
| requested, approved | withdrawn | Requester, or the holder | Nothing spent against it yet |
| approved | fulfilled | Claim approval or a bill (`budgets.fulfilRequest`) | `fulfilled_minor` reaches the amount; a smaller claim leaves the rest committed until it lapses |
| approved | lapsed | Daily task | `lapses_on` passed. Its unspent amount stops counting as committed |

A claim that names a request may be bigger than the request; the difference is not pre-approved and C3 applies to it.

## The budget

_Diagram in the source doc: budget life cycle · 4 states_

| From | To | Who | Guard |
|---|---|---|---|
| (none) | draft | `budgets.budget.manage`, or the production's lead for their own production's budget | Unique per production, per season, and per department and year, among budgets not closed |
| draft | proposed | Same | At least one line with an amount |
| proposed | draft | Approver | A note: "too much on set" |
| proposed | approved | `budgets.budget.approve`, not the proposer | Copies each line's newest draft amount as its first approved amount |
| approved | approved (revision) | `budgets.budget.approve` | A new approved amount row with a reason. A line cannot be revised below its spent plus committed without the treasurer confirming |
| approved | closed | `budgets.budget.approve` | No claim or request on it is submitted, requested or approved-unpaid; no award on it is offered or accepted. Production budgets are offered for closing `budgets.close.after` past the last performance |
| closed | approved | Treasurer | A reason. For a late bill |

Charges are refused on a line of a budget that is not approved, with `budgets.line.not-open`. A sub-budget funded from a parent line counts its approved total as committed on that parent line, so a season's "Productions" line shows what is handed out.

## The award (later release)

_Diagram in the source doc: funding award life cycle · 6 states, later release_

| From | To | Who | Guard |
|---|---|---|---|
| (none) | draft | `budgets.award.manage` | The line is in an approved budget |
| draft | offered | Same, not alone above C4's threshold | Notifies the company's contacts (fact `companies.contact-of`) |
| offered | accepted, declined | A contact of the company | Before `respond_by` |
| offered | withdrawn | `budgets.award.manage` | A note |
| accepted | closed | Task, or `budgets.award.manage` | Fully claimed and paid, or `claim_by` passed; unclaimed money stops counting as committed |

An accepted award counts as committed on its line until claimed. Paid as receipts: contacts make claims with `award_id`, and C1 to C5 apply with the award's manager as approver. Paid as a lump sum: on acceptance, a claim with one item for the whole amount is made by the system for the company, approved by the offerer's action, and paid through Payments to the company's payee. A claim against an award never exceeds what is left of it.
