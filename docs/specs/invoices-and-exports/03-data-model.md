# 2. Data model

Ten tables, all prefixed `invoicing_`, in the Foundations layout. Six hold invoices and bills; four hold exports. Money is integer minor units with a currency column, as in Finance. The amounts on an invoice are copies made for the document; the ledger stays the record of money, and rule I-40 checks the two agree.

## Id prefixes

| Prefix | Table | Time-sorted or random |
| --- | --- | --- |
| `ivs` | series | time-sorted |
| `ivp` | parties | time-sorted |
| `ivc` | invoices | time-sorted |
| `ivl` | lines | time-sorted |
| `iva` | allocations | time-sorted |
| `ivn` | reminders | time-sorted |
| `ivx` | export\_profiles | time-sorted |
| `ivm` | export\_codes | time-sorted |
| `ivr` | export\_runs | time-sorted |
| `ivh` | export\_schedules | time-sorted |

All ten checked free against Foundations' index (tab 4 of Foundations) and the prefixes declared in `layers/*/server/db` on `next` on 23 November 2026. Payments' amendment P-A1 (tab 4) adds `pdb` and `ppy`, also free.

## Invoices and bills

****: id prefix `ivs`; realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | not null, 1 to 60 characters | internal | keep | "Invoices", "Credit notes", "Hire invoices" |
| `kind` | text | `invoice` or `credit_note` | internal | keep | Bills take the supplier's number and need no series |
| `prefix` | text | not null, 0 to 12 characters, letters, digits and `-` `/` | internal | keep | "INV-", "NNT/CN-" |
| `pad` | integer | 1 to 8 | internal | keep | Digits shown: 4 gives INV-0042 |
| `next_number` | integer | not null, at least 1 | internal | keep | Moved only by the issuing unit's conditional write (rule I-12) |
| `is_default` | boolean | at most one default per kind (partial unique index) | internal | keep |  |
| `archived_at` | timestamp | nullable | internal | keep | An archived series issues nothing; its numbers stay |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

****: id prefix `ivp`; realm operational; subject `account_id` where the party is a person, otherwise none (a Companies record holds its own details); not append-only; on merge: move.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `party_module` | text | `companies` or `core` | internal | keep |  |
| `party_id` | text | not null; unique with `party_module` | internal | keep | A Companies id, or an account id when `party_module` is core. Plain text, not a ref: Companies is a `uses`, not a `requires` |
| `account_id` | account, subject | nullable; equals `party_id` when the party is a person | internal | keep | On merge: move |
| `terms_days` | integer | nullable, 0 to 120 | internal | keep | Null uses `invoicing.terms.days` |
| `standing_reference` | text | 0 to 60 characters | internal | keep | A purchase-order or customer reference to print on every invoice |
| `default_account_id` | ref `finance_accounts` | nullable | internal | keep | For a supplier: the expense account a new bill line starts on |
| default\_tax\_code | text | nullable; a code in finance\_tax\_codes | internal | keep | The code a new line starts on for this party, such as outside for a supplier that is not VAT-registered (rule I-06). Shown only while the theatre is registered |
| `send_reminders` | boolean | not null, default true | internal | keep |  |
| `note` | text | 0 to 500 characters | free text | redact | Staff only. Retention: `invoicing.records.keep-for` |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

****: id prefix `ivc`; realm operational; subject `{ account: 'party_account_id', email: 'bill_to_email' }`, unlinked rows for staff (redact ability `invoicing.invoice.redact`); retention `invoicing.records.keep-for`, counted from the end of the finance year the invoice was issued in; not append-only, but a trigger freezes every column below marked **frozen** once `state` leaves `draft` (rule I-14).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `direction` | text | `out` or `in` | internal | keep | Out: invoice. In: bill. Frozen |
| `kind` | text | `invoice` or `credit_note` | internal | keep | Frozen |
| `credits_id` | ref `invoicing_invoices` | nullable; set exactly when kind is credit\_note; same direction and party as the original | internal | keep | Frozen |
| `series_id` | ref `invoicing_series` | nullable; not null for direction out | internal | keep | Frozen |
| `number` | text | nullable until issue; unique per direction out | internal | keep | Given at issue. For a bill, the supplier's number, typed |
| `party_module`, `party_id` | text | nullable together: null for a one-off party | internal | keep | Frozen |
| `party_account_id` | account, subject | nullable | internal | keep | A person party. On merge: move |
| `bill_to_name` | text | not null, 1 to 120 characters | personal | retain, then anonymise | Copied from the party at issue; typed for a one-off. Frozen. Retain until `invoicing.records.keep-for`, reason `invoicing.erasure.legal-record` |
| `bill_to_address` | text | 0 to 400 characters, lines joined by newline | personal | retain, then clear | As above |
| `bill_to_email` | email | nullable | personal | retain, then clear | Where the invoice and reminders go. Not frozen: a corrected address may be set after issue (rule I-15) |
| `tax_number` | text | 0 to 30 characters | internal | keep | The party's VAT number, copied at issue. Frozen |
| seller\_tax\_number | text | nullable; set at issue while registered | internal | keep | The theatre's VAT number from finance.tax.number, copied at issue (rule I-41). Frozen |
| `reference` | text | 0 to 60 characters | internal | keep | Their purchase-order number. Frozen |
| `issue_on` | local date | nullable until issue | internal | keep | The invoice date. Frozen |
| `due_on` | local date | nullable until issue; on or after `issue_on` | internal | keep | Frozen |
| supplied\_on | local date | nullable | internal | keep | The time of supply, when it differs from issue\_on (a hire that ended before the invoice); printed on a VAT invoice and used by the VAT report (rules I-41, I-46). Frozen |
| `currency` | currency | not null | internal | keep | The core's currency in the first release. Frozen |
| `net_minor` | minor units | not null, at least 0 | internal | keep | Sum of lines. Frozen |
| `tax_minor` | minor units | not null, sum of the lines' tax; 0 while the theatre is not VAT-registered | internal | keep | Frozen |
| `total_minor` | minor units | not null, equals net plus tax (CHECK) | internal | keep | Frozen |
| `allocated_minor` | minor units | not null, 0 to `total_minor` (CHECK) | internal | keep | Kept by the unit that adds an allocation, with the predicate on the statement (rule I-22) |
| `state` | text | one of the list in part 3 | internal | keep |  |
| `notes` | text | 0 to 1,000 characters | free text | redact | Printed on the invoice. Frozen |
| `internal_note` | text | 0 to 1,000 characters | free text | redact | Never printed |
| `source_module`, `source_type`, `source_id` | text | nullable together | internal | keep | The record that raised it: `companies`, `settlement`, `cst_...`. Frozen |
| `owner_module` | text | nullable | internal | keep | Set when another module raised it; that module's `invoicing.line-owner` is called (part 4). Frozen |
| `pdf_file_id` | ref `core_files` | nullable | internal | keep | Out: made at issue. In: the supplier's file, required before approval |
| `posting_id` | text | nullable | internal | keep | Finance's posting made at issue or approval |
| `pay_token_hash` | text | nullable | internal | clear | Link token T1 for the public invoice page; cleared when the invoice is settled or credited |
| `pay_token_expires_at` | timestamp | nullable | internal | keep |  |
| `reminders_on` | boolean | not null, default from the party | internal | keep |  |
| `created_by` | account, actor | nullable | internal | keep | On merge: alias |
| `issued_by` | account, actor | nullable | internal | keep | For a bill, the approver. On merge: alias |
| `issued_at` | timestamp | nullable | internal | keep |  |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

Indexes: unique (`direction`, `number`) where direction is out; unique (`party_module`, `party_id`, `number`) where direction is in, so a supplier's invoice is logged once; (`state`, `due_on`) for the debtors list; (`source_module`, `source_type`, `source_id`).

****: id prefix `ivl`; realm operational; subject `{ via: 'invoice_id' }`; not append-only, frozen with its invoice by the same trigger.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `invoice_id` | ref `invoicing_invoices` | not null | internal | keep |  |
| `position` | integer | not null; unique with `invoice_id` | internal | keep |  |
| `description` | text | 1 to 300 characters | free text | redact |  |
| `quantity_milli` | integer | not null, 1 to 1,000,000,000 | internal | keep | Thousandths: 2.5 hours is 2500 |
| `unit_minor` | minor units | not null, at least 0 | internal | keep |  |
| `net_minor` | minor units | not null; equals quantity times unit, rounded half away from zero (rule I-05) | internal | keep |  |
| `tax_code` | text | not null; a code in `finance_tax_codes`: `none` while the theatre is not VAT-registered, otherwise an active code other than `none` (rule I-06) | internal | keep |  |
| `tax_minor` | minor units | not null, 0 when `tax_code` is none (CHECK) | internal | keep |  |
| tax\_rate\_bp | integer | not null, default 0; 0 to 10,000 | internal | keep | The code's rate in basis points, copied when the line is saved, so 20% is 2000 (rule I-42). For a bill, tax\_minor is typed and this is only the check (rule I-43) |
| `account_id` | ref `finance_accounts` | nullable; set when `owner_key` is null | internal | keep | An account this module may post to (rule I-07) |
| `owner_key` | text | nullable | internal | keep | The owner module's own key for the line, passed back to its `invoicing.line-owner` |
| `production_id`, `performance_id` | text | nullable | internal | keep | Tags carried onto the ledger entry |
| `budget_line_id` | text | nullable; bills only | internal | keep | Budgets' `bgl_...` id, carried onto the entry once Finance has the column |
| `budget_request_id` | text | nullable; bills only | internal | keep | A Budgets spending request this line fulfils |
| `created_at` | timestamp | not null | internal | keep |  |

****: id prefix `iva`; realm operational; subject `{ via: 'invoice_id' }`; append-only (an allocation is undone by a reversing row, rule I-25).

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `invoice_id` | ref `invoicing_invoices` | not null | internal | keep |  |
| `kind` | text | `payment`, `credit`, `write_off`, `reversal` | internal | keep |  |
| `amount_minor` | minor units | not null, not 0; negative only for kind reversal | internal | keep |  |
| `reverses_id` | ref `invoicing_allocations` | nullable; unique | internal | keep |  |
| `intent_id` | text | nullable | internal | keep | Payments' intent, for money in |
| `disbursement_id` | text | nullable | internal | keep | Payments' disbursement (P-A1), for money out |
| `credit_note_id` | ref `invoicing_invoices` | nullable | internal | keep |  |
| `posting_id` | text | nullable | internal | keep | The write-off's posting; payments post through Payments |
| `on_date` | local date | not null | internal | keep | When the money arrived or left |
| `by` | account, actor | nullable | internal | keep | On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

CHECK: exactly one of `intent_id`, `disbursement_id`, `credit_note_id`, `posting_id`, `reverses_id` is set, matching `kind`.

****: id prefix `ivn`; realm operational; subject `{ via: 'invoice_id' }`; append-only; retention as the invoice.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `invoice_id` | ref `invoicing_invoices` | not null | internal | keep |  |
| `step` | text | `before-due`, `overdue-1`, `overdue-2`, `manual` | internal | keep |  |
| `notification_id` | ref `core_notifications` | not null | internal | keep |  |
| `sent_by` | account, actor | nullable; null for the scheduled task | internal | keep | On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

Unique (`invoice_id`, `step`) where step is not manual, so the daily task sends each step once however often it runs.

## Exports

****: id prefix `ivx`; realm operational; subject none; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `name` | text | 1 to 60 characters, unique | internal | keep | "Students' union return", "Xero" |
| `format` | text | `journal`, `xero`, `quickbooks`, `sage`, `freeagent`, `custom` | internal | keep | Part 4 gives each layout |
| `granularity` | text | `entry` or `daily` | internal | keep | Every ledger entry, or one line per account, tag set and day |
| `columns` | JSON | not null for custom; validated against the column list in part 4 | internal | keep | Order, header text, and which fields |
| `date_format` | text | `iso`, `dmy`, `mdy` | internal | keep | 2026-11-23, 23/11/2026, 11/23/2026 |
| `signs` | text | `split`, `signed` or `credit` | internal | keep | Debit and credit columns, one amount with debits positive, or one with credits positive (the union's return, where sales read positive) |
| `split_by` | text | `none`, `production`, `source-module` | internal | keep | A tracking column some packages take |
| `total_line` | text | `none`, `net`, or a money account's code | internal | keep | The old SU export's card-total line is a preset of this |
| `total_label` | text | 0 to 80 characters | internal | keep | The total line's words; the union preset's is the old file's |
| tax\_map | JSON | not null, default {}; keys are Finance tax codes, values 1 to 50 characters | internal | keep | The other books' name for each tax code, such as 20% (VAT on Income) or T1 (rule E-16). Each change audited with old and new value, as codes are |
| `kind_labels` | JSON | not null, default {}; keys a posting kind, or a kind and the module or account the posting is for (`sale:bar`, `sale:box-office.pass-income`) | internal | keep | What the custom kind label column says; the closest key wins |
| `unmapped_code` | text | 1 to 20 characters, default `UNMAPPED` | internal | keep |  |
| `period_rule` | text | `custom`, `period`, `finance-year`, `season` | internal | keep | What the screen opens on. `season` is accepted by the table but not offered until Seasons' dates can be read by other modules |
| `archived_at` | timestamp | nullable | internal | keep |  |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

****: id prefix `ivm`; realm operational; subject none; not append-only; every change audited with the old and new code.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `profile_id` | ref `invoicing_export_profiles` | not null | internal | keep |  |
| `account_id` | ref `finance_accounts` | not null | internal | keep |  |
| `posting_kind` | text | nullable; one of Finance's posting kinds | internal | keep | Null maps every kind; set overrides for that kind, so refunds can take their own code (rule E-06) |
| `code` | text | nullable, 1 to 50 characters | internal | keep | Null is explicitly unmapped |
| `code_name` | text | 0 to 80 characters | internal | keep | The other books' name for it, shown beside the code |
| `updated_by` | account, actor | nullable | internal | keep | On merge: alias |
| `updated_at` | timestamp | not null | internal | keep |  |

Unique (`profile_id`, `account_id`, coalesce(`posting_kind`, '')).

****: id prefix `ivr`; realm operational; subject none; append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `profile_id` | ref `invoicing_export_profiles` | not null | internal | keep |  |
| `from_on`, `to_on` | local date | not null; to on or after from | internal | keep |  |
| `rows` | integer | not null | internal | keep | Ledger lines, before any total line |
| `unmapped_rows` | integer | not null | internal | keep |  |
| `closed` | boolean | not null | internal | keep | Every day of the range lay in a period closed at the time |
| `map_version` | text | not null | internal | keep | A digest of the profile and its codes at the time |
| `sha256` | text | not null | internal | keep | Of the file's bytes |
| `file_id` | ref `core_files` | nullable | internal | keep | Kept copy; removed by the sweep after `invoicing.exports.keep-files-for` |
| `schedule_id` | ref `invoicing_export_schedules` | nullable | internal | keep | Set when the run was scheduled |
| `by` | account, actor | nullable | internal | keep | On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

****: id prefix `ivh`; realm operational; subject none; not append-only. The cadence columns are Reports' `reports_schedules` shape (cadence, on\_day, send\_at, period\_rule, next\_due\_at), so both modules schedule alike; one slot runs once by a conditional write on `next_due_at`.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `profile_id` | ref `invoicing_export_profiles` | not null | internal | keep |  |
| cadence columns | as Reports | as Reports | internal | keep | Usually monthly, a few days after the month ends |
| `send_to` | email | not null | personal | clear | Usually a role address (the union's finance office). Retention: none needed, the row is staff-managed and its address is cleared if the person asks |
| `only_closed` | boolean | not null, default true | internal | keep | Wait for the period's close before sending (rule E-12) |
| `paused_at` | timestamp | nullable | internal | keep |  |
| `created_by` | account, actor | nullable | internal | keep | On merge: alias |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

## Erasure and merge in one paragraph each

**Erasure.** An invoice is a legal record for six years, so its personal columns are kept until `invoicing.records.keep-for` has run from the end of the finance year it was issued in, then anonymised or cleared by the retention sweep; erasing a person before then leaves those columns and is shown on the erasure screen as "kept as a legal record until 31 July 2032". Drafts are not legal records: erasure deletes a person's drafts outright. Free text is redacted as soon as the person is erased, because nothing legal rests on a note. No personal free text is written to audit detail.

**Merge.** Party rows and invoices move to the surviving account; actor columns alias. If both accounts have a party row, the older row survives and the newer one's terms fill only what the older left empty.
