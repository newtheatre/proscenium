# 2. Data model

Budgets owns eleven tables, all prefixed `budgets_`: nine with ids and two keyed by their own columns. No column holds a spent total; spend is read from Finance. Every table also has `created_at` and, unless append-only, `updated_at`; they are internal, kept on erasure, and left out below. Money is `col.minor` (integer minor units) with the theatre's one currency in `col.currency`.

## Id prefixes

Checked on 23 November 2026 against Foundations' index (part 4) and every `defineTable` on `next`: none is taken. To be registered with Foundations through Integration (spec 16). All are time-sorted.

| Prefix | Table | Holds |
|---|---|---|
| `bct` | `budgets_categories` | What money is spent on |
| `bgt` | `budgets_budgets` | A budget |
| `bgl` | `budgets_lines` | One line of a budget |
| `bga` | `budgets_line_amounts` | An amount set on a line (append-only) |
| none | `budgets_line_sources` | Which ledger accounts an income line reads; keyed by its two columns |
| `bsq` | `budgets_spending_requests` | A request to spend before spending |
| `ecl` | `budgets_claims` | An expense claim |
| `eci` | `budgets_claim_items` | One purchase on a claim |
| `ece` | `budgets_claim_events` | The decision log of a claim (append-only) |
| `bfa` | `budgets_awards` | A funding award to a company or act (later release) |
| none | `budgets_counters` | The next claim number per finance year; keyed by the year |

## Plan

**`budgets_categories`**: realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `slug` | text | not null, unique, kebab case | internal | keep | Stable key other modules may name: `rights`, `set`, `publicity` |
| `name` | text | not null, unique among live rows, at most 60 | internal | keep | "Set and props" |
| `description` | text | at most 300 | internal | keep | Shown when a claimant picks a category |
| `account_id` | text | nullable | internal | keep | A Finance expense account given to `budgets`. Null posts to `budgets.expenses`. Checked through Finance's service, never by reading `finance_accounts` |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep | An archived category takes no new lines or items |

**`budgets_budgets`**: realm operational; subject none; no retention; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, at most 80 | internal | keep | Defaults to the production's, department's or season's name |
| `scope` | text | one of production, department, season, general | internal | keep |  |
| `production_id` | ref `core_productions` | required when scope is production, else null | internal | keep | Unique among budgets not closed: one live budget per production |
| `season_id` | ref `core_seasons` | required when scope is season, else null | internal | keep | Unique among budgets not closed |
| `department_term_id` | ref `core_terms` | required when scope is department, else null | internal | keep | A term of core's shared vocabulary `core.department`, of kind organisation (ruling R3-07; pickers offer only that kind). Unique with `year_starts_on` |
| `year_starts_on` | local date | not null | internal | keep | The first day of the finance year it belongs to, from `finance.year.starts` |
| `parent_line_id` | ref `budgets_lines` | nullable, set null | internal | keep | The line of a larger budget this one is funded from: a production budget from the season's "Productions" line |
| `currency` | currency | not null | internal | keep |  |
| `state` | text | one of draft, proposed, approved, closed | internal | keep | Part 3 |
| `approved_by` | account | actor, nullable, on merge alias | internal | keep |  |
| `approved_at` | timestamp | nullable | internal | keep |  |
| `closed_at` | timestamp | nullable | internal | keep |  |

**`budgets_lines`**: realm operational; subject none.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep | Carried on ledger entries as `budget_line_id` |
| `budget_id` | ref `budgets_budgets` | not null | internal | keep |  |
| `name` | text | not null, at most 80, unique within the budget among live rows | internal | keep | "Lighting hire" |
| `kind` | text | one of expense, income | internal | keep |  |
| `category_id` | ref `budgets_categories` | required when kind is expense | internal | keep |  |
| `sort_order` | integer | not null | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep | Takes no new charges; its history stays |

**`budgets_line_amounts`**: realm operational; subject none; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `line_id` | ref `budgets_lines` | not null | internal | keep |  |
| `amount_minor` | money | not null, at least 0 | internal | keep |  |
| `stage` | text | one of draft, approved | internal | keep | Draft amounts are changed freely before approval; approved ones only by a revision |
| `reason` | text | required on a revision, at most 200 | internal | keep | Shown in the line's history. The screen says not to name anyone |
| `set_by` | account | actor, on merge alias | internal | keep |  |
| `set_at` | timestamp | not null | internal | keep | The newest row of a stage is the current amount |

**`budgets_line_sources`**: realm operational; subject none; key (`line_id`, `account_key`).

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `line_id` | ref `budgets_lines` | not null, an income line | internal | keep |  |
| `account_key` | text | not null | internal | keep | A Finance system key such as `box-office.ticket-income` or `bar.income`. Actual income is that account's balance for the budget's production, through Finance's `balances` |

## Promises

**`budgets_spending_requests`**: realm members; subject `{ account: 'requested_by' }`; retention `budgets.retention.requests`, from the decision; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `requested_by` | account | subject, nullable, on merge move | personal | anonymise | Null for a request a module made, such as a licence fee |
| `line_id` | ref `budgets_lines` | not null, an expense line | internal | keep |  |
| `amount_minor` | money | not null, greater than 0 | internal | keep |  |
| `description` | text | not null, at most 500 | free text | redact | "Black paint and brushes for the flats" |
| `needed_by` | local date | nullable | internal | keep |  |
| `state` | text | one of requested, approved, declined, withdrawn, fulfilled, lapsed | internal | keep | Part 3 |
| `decided_by` | account | actor, nullable, on merge alias | internal | keep |  |
| `decided_at` | timestamp | nullable | internal | keep |  |
| `decision_note` | text | at most 500; required on decline | free text | redact | Seen by the requester |
| `fulfilled_minor` | money | not null, default 0, at most `amount_minor` | internal | keep | Raised by claims and bills that name the request |
| `lapses_on` | local date | nullable | internal | keep | Set at approval from `budgets.requests.lapse-after` |
| `source_module`, `source_type`, `source_id` | text | all three or none; unique together when set | internal | keep | A request made by a module: `productions`, `licence-fee`, the fee id |

**`budgets_awards`** (later release): realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `production_id` | ref `core_productions` | not null | internal | keep | The engagement's production, as Companies keys it |
| `company_id` | text | not null | internal | keep | An opaque Companies id. Never joined; labelled through `core.record-resolver` |
| `line_id` | ref `budgets_lines` | not null, an expense line | internal | keep | The fund it comes from, such as "Festival bursaries" |
| `title` | text | not null, at most 80 | internal | keep | "Bursary for StuFF 2027" |
| `amount_minor` | money | not null, greater than 0 | internal | keep |  |
| `paid_as` | text | one of receipts, lump-sum | internal | keep | Claimed against with receipts, or paid whole |
| `conditions` | text | at most 2,000 | internal | keep | What the money is for. Shown to the company's contacts |
| `state` | text | one of draft, offered, accepted, declined, withdrawn, closed | internal | keep | Part 3 |
| `respond_by` | local date | nullable | internal | keep |  |
| `claim_by` | local date | nullable | internal | keep | After it, unclaimed money is released back to the line |
| `offered_by` | account | actor, nullable, on merge alias | internal | keep |  |
| `responded_by` | account | actor, nullable, on merge alias | internal | keep | A contact of the company |
| `offered_at`, `responded_at`, `closed_at` | timestamp | nullable | internal | keep |  |

Nothing on an award is personal: it is between the theatre and a company. Who answered is an actor reference, aliased on merge and anonymised with the account.

## Claims

**`budgets_claims`**: realm members; subject `{ account: 'claimant_id' }`; retention `budgets.retention.claims`, from the claim's last event; not append-only (its content is fixed once submitted, part 3).

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `number` | text | not null, unique | internal | keep | "2026-0042": finance year and a counter from `budgets_counters`, for talking about a claim |
| `claimant_id` | account | subject, on merge move | personal | retain until `budgets.retention.claims`, reason `budgets.retention.financial-record` | A financial record: the name stays while the accounts may be asked for |
| `award_id` | ref `budgets_awards` | nullable | internal | keep | A claim against a funding award |
| `request_id` | ref `budgets_spending_requests` | nullable | internal | keep | The request it fulfils |
| `title` | text | not null, at most 80 | free text | retain, as `claimant_id` | "Paint for Hamlet" |
| `state` | text | one of draft, submitted, returned, approved, declined, withdrawn, voided, paid | internal | keep | Part 3 |
| `total_minor` | money | not null, default 0 | internal | keep | Sum of items, kept in the same batch as each item change |
| `approved_minor` | money | nullable | internal | keep | Set at approval: what is owed |
| `paid_minor` | money | not null, default 0, at most `approved_minor` | internal | keep | Raised by Payments' disbursement handler |
| `pay_route` | text | one of bank-transfer, parent-body, cash, cheque | internal | keep | Defaulted from `budgets.claims.default-route`; the claimant may choose among those offered |
| `declared_at` | timestamp | nullable | internal | keep | When the claimant confirmed the claim is true and for the theatre. Required to submit |
| `submitted_at`, `decided_at` | timestamp | nullable | internal | keep |  |
| `expense_posting_id` | text | nullable, unique | internal | keep | Finance's posting made at approval |
| `version` | integer | not null, default 0 | internal | keep | Raised by every state change; each change predicates on it |

**`budgets_claim_items`**: realm members; subject `{ via: 'claim_id' }`; erased and retained with the claim.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep | Owner of the receipt files |
| `claim_id` | ref `budgets_claims` | not null | internal | keep |  |
| `spent_on` | local date | not null, not in the future | internal | keep |  |
| `description` | text | not null, at most 200 | free text | retain, as the claim | "Gaffer tape, 3 rolls" |
| `supplier` | text | at most 80 | internal | keep | Where it was bought. A shop, not a person |
| `amount_minor` | money | not null, greater than 0 | internal | keep | The receipt's total |
| `line_id` | ref `budgets_lines` | nullable until approval; then not null | internal | keep | The claimant suggests; the approver confirms |
| `category_id` | ref `budgets_categories` | nullable | internal | keep | Defaults to the line's; may differ (a line "Set" with an item of category "Travel") |
| `no_receipt_reason` | text | at most 300; required when there is no receipt file | free text | retain, as the claim | "Lost on the bus" |
| `approved_minor` | money | nullable, at most `amount_minor` | internal | keep | Less than the amount on a part approval |
| `part_reason` | text | required when `approved_minor` is less than `amount_minor`, at most 300 | free text | retain, as the claim | Seen by the claimant |

Receipts are rows of `core_files` in the slot `budgets.receipt`, owner `budgets.claim-item`, access `record`, text class personal, at most five per item, images and PDF only. Erasure of the files is the module's `core.erasure-handler` entry, run when the claim's retention ends, not when the person asks: a receipt is the evidence for a posted expense.

**`budgets_claim_events`**: realm members; subject `{ via: 'claim_id' }`; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
|---|---|---|---|---|---|
| `id` | id | primary key | internal | keep |  |
| `claim_id` | ref `budgets_claims` | not null | internal | keep |  |
| `action` | text | one of submitted, returned, resubmitted, approved, declined, withdrawn, voided, paid, payment-reversed | internal | keep |  |
| `by` | account | actor, nullable, on merge alias | internal | keep | Null when Payments' handler records a payment |
| `at` | timestamp | not null | internal | keep |  |
| `amount_minor` | money | nullable | internal | keep | Approved or paid amount |
| `note` | text | at most 500; required on returned, declined, voided | free text | retain, as the claim | Seen by the claimant |
| `disbursement_id` | text | nullable | internal | keep | Payments' outgoing payment |
| `posting_id` | text | nullable | internal | keep | Finance's posting |

**`budgets_counters`**: realm system; subject none; key `year_starts_on`. One column `next_number` (integer, not null), raised by a conditional update in the same batch that numbers a claim.

## Merge and erasure

| Column | On merge | Why |
|---|---|---|
| `budgets_claims.claimant_id` | move | The surviving account is owed the money |
| `budgets_spending_requests.requested_by` | move | The request is the person's |
| Every actor column | alias | It records who acted; nothing is unique by it |

Erasure is anonymisation in one transaction (decision 0011). A claim is a financial record, so its claimant and free text are `retain`ed until `budgets.retention.claims` passes, then anonymised and redacted, and the receipts deleted. Two cases hold erasure itself through `core.erasure-hold`: a claim approved and not yet paid (code `budgets.unpaid-claim`: the theatre owes the person money and must pay them first), and a claim submitted and not decided (code `budgets.open-claim`). A declined, withdrawn or draft claim has no financial effect and is erased at once.
