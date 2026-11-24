# 6. Settings and abilities

Twelve settings in five groups, and fourteen abilities. Every operational number ships as its proposed value below; a key with no agreed value ships unset rather than guessed, and says what unset means.

## Settings

Placement follows Foundations' settings format: the manifest declares groups `claims`, `requests`, `reminders`, `close` and `retention`. All take the default placement, the module's generated settings page reached from the cog on Budgets and on Approvals, one section per group; none is advanced. All are changed by holders of `budgets.settings.manage` and have audience staff. The two retention settings are `onChange: 'confirm'`, because shortening one erases records at the next run. Durations use the kit's DurationInput; money uses the money input and is stored in minor units.

| Key | Kind | Default | Limits | Quotable | Purpose |
|---|---|---|---|---|---|
| `budgets.claims.receipt-required` | boolean | true |  | Yes | An item without a receipt needs a reason. Off: no receipt and no reason asked |
| `budgets.claims.late-after` | duration | 90 days | 7 days to 2 years | Yes | Items spent longer ago than this are marked late. Never refused |
| `budgets.claims.second-approval-above` | money | unset | £1 to £100,000 | Yes | Above it, a second approver with `budgets.claim.approve-any` (C4). Unset: one approver |
| `budgets.claims.routes` | choice, several | bank-transfer | bank-transfer, parent-body, cash, cheque | No | How claims may be paid. Each needs the matching Payments method |
| `budgets.claims.default-route` | choice | bank-transfer | one of the offered routes | No | Preselected on a new claim. NNT: parent-body, if the SU pays (question 7) |
| `budgets.requests.lapse-after` | duration | 60 days | 7 days to 1 year | No | An approved, unfulfilled request stops counting as committed after this |
| `budgets.requests.expected-above` | money | unset | £1 to £10,000 | Yes | A claim above it with no request is marked "not asked first". Unset: never marked |
| `budgets.reminders.approver-after` | duration | 7 days | 1 day to 60 days | No | When an undecided claim or request is chased |
| `budgets.close.after` | duration | 60 days | 7 days to 1 year | No | After a production's last performance, its budget is offered for closing |
| `budgets.retention.claims` | duration | 6 years | 2 to 10 years | No | How long a claim, its items and receipts are kept after its last event, then anonymised |
| `budgets.retention.requests` | duration | 2 years | 6 months to 7 years | No | How long a decided request keeps its requester and description |
| `budgets.awards.respond-within` (later) | duration | 14 days | 1 day to 90 days | No | Sets an award's `respond_by` when offered |

Setting rules (checked together with every pending change, as built in PR 562): `default-route` must be among `routes`; `routes` may not be emptied.

The six-year claim retention is a starting point, not legal advice. The page says so and that it is the theatre's decision, often set by its auditor or parent body.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
|---|---|---|---|---|---|---|
| `budgets.claim.make` | site | normal | grants |  | Make, edit, submit and withdraw one's own claims; see them | Fact `core.member`; preset `volunteer` |
| `budgets.request.make` | site | normal | grants |  | Ask to spend; see one's own requests | Fact `core.member`; preset `volunteer` |
| `budgets.budget.view` | `budgets.budget` | normal | ignored |  | See a budget, its lines and figures, no claimant names | `committee-member`; `production-lead` with fact `core.production-team`, for their production |
| `budgets.budget.hold` | `budgets.budget` | normal | refuses | budget.view | Approve, send back or decline claims and requests on its lines, within budget; propose revisions | `production-lead` with fact `core.production-team`; granted per budget to department heads |
| `budgets.budget.manage` | site | normal | ignored | budget.view | Create budgets, edit drafts, propose, grant holders | `finance-officer` |
| `budgets.budget.approve` | site | privileged | refuses | budget.view | Approve, revise, close and reopen budgets | `finance-officer` |
| `budgets.claim.approve-any` | site | privileged | refuses | claim.view-all | Approve any claim or request, including over budget and the second approval (C3, C4); void an approved claim | `finance-officer` |
| `budgets.claim.view-all` | site | privileged | ignored |  | See every claim with its claimant and receipts. `audit: 'read'` | `finance-officer` |
| `budgets.claim.pay` | site | privileged, fresh | refuses | claim.view-all | Record payments and download the parent-body schedule. Payments' `payments.payee.read` is needed as well to see bank details | `finance-officer` |
| `budgets.category.manage` | site | normal | ignored |  | Edit categories and their accounts | `finance-officer` |
| `budgets.award.manage` (later) | site | normal | ignored | budget.view | Draft, offer, withdraw and close awards; approve claims against them | `finance-officer` |
| `budgets.award.respond` (later) | `budgets.award` | normal | ignored |  | Accept or decline an award; claim against it | Fact `companies.contact-of`, on the award's company |
| `budgets.export` | site | privileged | ignored | budget.view | Download budgets and figures as CSV | `finance-officer`; `committee-member` |
| `budgets.settings.manage` | site | privileged | ignored |  | Change the settings above | `finance-officer`; `administrator` |

Notes:

- **Owner refuses** on `budget.hold`, `budget.approve`, `claim.approve-any` and `claim.pay` is what stops anyone approving or paying their own claim, request or proposal. These are four-eyes rules, so `ownRecordExempt` is not consulted and the Owner is refused like anyone else (Matt, 23 November 2026, the exemption list in PR 643).
- **Owner grants** on `claim.make` and `request.make` lets the person see their own records only; the service limits what they see.
- **A production lead holds their own production's budget**, so a producer approves their crew's claims. Their own claims go to the other holders or the treasurer.
- **Claim view is privileged and audited** because a claim names a person and shows their receipts. `budget.view` shows only aggregates.
- **Bank details are Payments'.** Paying a claim needs both `budgets.claim.pay` and `payments.payee.read`; neither alone shows an account number.
