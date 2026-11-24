# 5. Screens

Claimants work on a phone in the members' area; approvers and the treasurer work in the console. Every screen follows Interface's page types and the project's rulings: primary buttons in the default colour, fixed choices as dropdowns, inline validation, money typed in pounds and stored in pence, settings on the subject's page through the cog, never shown twice.

## Inventory

| Screen | Shell, page type | Who sees it | What it does |
|---|---|---|---|
| Expenses | Members, list | `budgets.claim.make` | Your claims and requests, newest first; open ones on top; "Make a claim", "Ask to spend" |
| Make a claim | Members, form (phone first) | Same | Wireframe A. Items with photos, a line for each, the declaration, submit |
| Claim | Members, record | Its claimant | State, each item with its approved amount and reasons, the log, how and when it was paid. Edit while draft or returned; withdraw until decided |
| Ask to spend | Members, form | `budgets.request.make` | Line, amount, what for, needed by |
| Your bank details | Payments' payee form, linked | The claimant | Owned by Payments. Linked from a claim whose route is bank transfer |
| Budgets | Console, list | `budgets.budget.view` | By finance year; filter by scope and state; budgeted, spent, remaining and a bar per budget; archived below the divider |
| Budget | Console, record | Same, on that budget | Wireframe B. Lines with budgeted, committed, pending, spent, remaining; income lines; holders; history; propose, approve, revise, close |
| Budget editor | Console, form within the record | `budgets.budget.manage`, or the production's lead in draft | Lines added, dragged to order (`@dnd-kit/vue`), amounts typed; copy from another budget |
| Approvals | Console, queue | Holders of any budget; `budgets.claim.approve-any` | Claims and requests waiting on me, oldest first, with over-budget and late marks; right-click to open, approve, send back |
| Claim review | Console, record | Approvers of its lines, `budgets.claim.view-all` | Wireframe C. Receipt beside each item; line and category confirmed; part approval; approve, send back, decline |
| Payments to make | Console, list | `budgets.claim.pay` | Approved unpaid claims grouped by claimant and route; select some, "Record payment" opens Payments' outgoing-payment form with the parts filled; "Download for the parent body" |
| Parent-body schedule | Download from the list above | `budgets.claim.pay` | CSV: number, claimant's name, date approved, category, nominal code, amount, receipt count. Formula-injection guarded; audited |
| Production "Budget" tab | Console, record tab on a production | `budgets.budget.view` on it | The production's budget page, embedded; income lines beside ticket income to date |
| Awards (later) | Console, list and record | `budgets.award.manage` | Offer, track response, claims against it |
| Award (later) | Members' area for a company contact | Fact `companies.contact-of` | Accept or decline; make a claim against it |
| Categories | Admin > Modules > Budgets | `budgets.category.manage` | Name, description, expense account (searchable dropdown of accounts given to Budgets); archive |
| Settings | Cog modal on Budgets and Approvals | `budgets.settings.manage` | The groups in part 6 |

## Wireframe A: make a claim, on a phone

_Diagram in the source doc: wireframe A · make a claim, phone_

Adding an item opens the camera first; amount, date and shop are typed after. The line dropdown lists lines of approved budgets the person can charge, the production they are on first. An item without a photo asks why, inline. "Your bank details are on file" becomes "Add your bank details" when Payments has none.

## Wireframe B: a budget

_Diagram in the source doc: wireframe B · a production budget, desktop_

Each figure opens what makes it up: Spent opens Finance's ledger filtered by the line; Committed lists requests and awards; Pending lists claims and bills awaiting a decision. Over budget shows as a word and a full bar in the warning colour, never colour alone.

## Wireframe C: reviewing a claim

_Diagram in the source doc: wireframe C · reviewing a claim, desktop_

The receipt pane follows the selected item. Typing less than the amount asks for a reason inline. When approval would take a line over budget, the button reads "Approve, £13.00 over budget" and is offered only to the treasurer; a holder sees "Needs the treasurer" and can send it on. On a phone the receipt stacks above the items.
