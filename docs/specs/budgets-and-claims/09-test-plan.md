# 8. Test plan

Thirty-six named cases. Tests use the stack Foundations proved: Vitest in workerd with a local D1 for services and routes, Playwright against the built Worker for journeys, run on CI only. Time is always injected; money is always integer minor units; no test reads the real clock.

## Money and the ledger

| Test | Checks |
|---|---|
| Spent is the ledger | A line's spent equals Finance's `balances({ budgetLineIds })` after claims, bills and reversals, to the penny |
| One approval, one posting | Two concurrent approvals of one claim leave one `expense` posting and one refusal `budgets.claim.changed` |
| Approval balances | The expense posting's debits per item equal the credit to `claims-payable`; the seal accepts it |
| Tags | Every debit carries its item's `budget_line_id` and, for a production budget, its `production_id`; the credit carries neither |
| Part approval | Approved less than claimed posts the approved amount only; the reason is required |
| Void reverses | Voiding posts Finance's reversal; spent returns to its earlier value; voiding a part-paid claim is refused |
| Pay once | Two concurrent payments of the same claim through Payments leave `paid_minor` at the approved amount and one refusal |
| Over-pay refused | A disbursement part larger than what is owed is refused by Budgets' handler and nothing is written |
| Reversal | A reversed payment lowers `paid_minor` and returns the claim to approved |
| Open period | An approval made when the item's spend date falls in a closed period posts at the approval date and succeeds |
| No person in the ledger | No posting, entry, event payload or audit detail made by Budgets holds a name, an email or a description |

## Who may act

| Test | Checks |
|---|---|
| Not your own claim | A claimant who holds the line, `approve-any` or `claim.pay` cannot approve or pay their own claim |
| The Owner too | The Owner is refused approving or paying their own claim (four-eyes rules are not exempt) |
| Not your own request | The requester cannot approve their request, nor approve the claim that fulfils it |
| Holder's reach | A holder of one budget cannot approve an item on another budget's line |
| Two budgets | A claim on two holders' lines needs both, or the treasurer; the first approval leaves it submitted |
| Over budget | A holder's approval that would go over is refused with `budgets.claim.needs-treasurer`; the treasurer's succeeds and the notice is sent once |
| Second approval | With the threshold set, a claim above it needs two different approvers; at the threshold exactly, one |
| Producer's scope | A production lead with the team fact holds only their production's budget, and loses it when the fact ends |
| Receipts are private | A receipt file is refused to a member who is not its claimant, an approver of its lines, or a holder of `claim.view-all` or `claim.pay` |
| Read audit | Opening a claim under `claim.view-all` writes a read audit row |

## Life cycles

| Test | Checks |
|---|---|
| Fixed once submitted | Editing an item of a submitted or approved claim is refused; of a returned claim, allowed |
| Submit guards | No items, an item without a line, a missing receipt with no reason, or no declaration each refuse with a field error |
| Closed line | Charging a line of a draft, proposed or closed budget is refused with `budgets.line.not-open` |
| Budget uniqueness | A second live budget for one production, season, or department and year is refused |
| Close guard | Closing a budget with an open claim, request or award is refused, listing them |
| Request lapse | An approved request lapses the day after `lapses_on`, in the theatre's time zone, across a clock change |
| Licence fee twice | The same `productions.licence.fee-due` twice leaves one request; a re-announcement with the same fee id and a changed amount replaces it; a deposit and a balance due the same day stay two; fee-withdrawn withdraws it |
| Claim numbers | Concurrent submissions get distinct consecutive numbers; the counter restarts each finance year |
| Sub-budget | An approved production budget counts as committed on its season line, and stops when closed |

## Privacy and records

| Test | Checks |
|---|---|
| Erasure hold | Erasing a person with an approved unpaid claim is held with `budgets.unpaid-claim` |
| Retention | After `budgets.retention.claims`, the claimant is anonymised, free text redacted and receipts deleted, in one unit; amounts and lines stay |
| Draft erasure | A person's draft, withdrawn and declined claims are erased at once with their files |
| Merge | A merge moves claims and requests to the survivor; actor columns alias |
| Export safety | The parent-body schedule and budget CSV neutralise cells starting with =, +, - or @, and are audited |
| Measures | Every `core.measure` row holds keys and a number only; budgeted by department equals the sum of its lines |
