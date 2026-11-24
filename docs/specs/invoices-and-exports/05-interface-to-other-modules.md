# 4. Interface to other modules

The module requires Finance and Payments and uses Companies, Budgets and Fundraising. Other modules reach it only through three points it declares and the events it announces; it reaches them only through their contributions and events. Two built modules need amendments, written in full at the end: Finance (F-A1, F-A2) and Payments (P-A1, P-A2).

## Manifest

| Field | Value |
| --- | --- |
| `id` | `invoicing` (tables `invoicing_*`, routes `/api/invoicing/*`); menu label "Invoices and exports" |
| `requires` | `finance`, `payments` |
| `uses` | `companies`, `budgets`, `fundraising` (all three to be added to Foundations' reserved module ids when their specs are accepted) |
| `switchable` | true; off by default in every preset except `student``-society`, which switches it on for the exports |
| `stability` | experimental |
| Record types | `invoicing.invoice` (owner none; covers bills and credit notes), `invoicing.party`, `invoicing.series`, `invoicing.export-profile` |
| Address prefix | `/invoice` for the public invoice page, reached by token. A new entry for Foundations' reserved-prefix table |

## Ledger accounts declared through `finance.system-account`

| Key | Name | Kind | Used for |
| --- | --- | --- | --- |
| `invoicing.receivable` | Invoices owed to us | asset | Every invoice out, whoever raised it |
| `invoicing.payable` | Bills we owe | liability | Every approved bill |
| `invoicing.bad-debts` | Bad debts written off | expense | Write-offs |
| `invoicing.other-income` | Other invoiced income | income | Lines a person types with no owner; the treasurer adds more income accounts given to `invoicing` in Finance's accounts screen |
| `invoicing.general-expenses` | General expenses | expense | Bill lines with no owner; the treasurer adds more (set materials, lighting hire) |

VAT goes to Finance's two accounts, `finance.vat-output` and `finance.vat-input` (amendment F-A2), never to accounts of this module, so the theatre has one VAT balance whichever module charged or paid the tax.

## Postings

One posting per business fact, each sealed in the same batch as the state change that caused it. The kind column below is the posting's purpose (amendment F-A1): each is posted with Finance's existing kind `transfer` and that purpose, so no append-only table is rebuilt.

| Fact | Posting kind | Debit | Credit | Idempotency key |
| --- | --- | --- | --- | --- |
| Invoice out issued | `invoice` | `invoicing.receivable`, the total | Each line: its own income account, or the owner's entries (`for_module` set) | `invoicing:invoice:<id>:issue` |
| Bill approved | `bill` | Each line: its own expense account (tagged with production and budget line), or the owner's entries | `invoicing.payable`, the total | `invoicing:invoice:<id>:approve` |
| Credit note out issued | `credit_note` | Each named line's account, or the owner's reversing entries | `invoicing.receivable` | `invoicing:invoice:<id>:issue` |
| Credit note in (from a supplier) approved | `credit_note` | `invoicing.payable` | Each named line's account, or the owner's | `invoicing:invoice:<id>:approve` |
| Money in against an invoice | Payments' own kind | Payments' money account | `invoicing.receivable` (this module's settlement entries) | Payments' key |
| Money out against a bill | `disbursement` (P-A1) | `invoicing.payable` (this module's disbursement entries) | Payments' bank or cash account | Payments' key |
| Write-off | `write_off` | `invoicing.bad-debts` | `invoicing.receivable` | `invoicing:allocation:<id>` |

While the theatre is VAT-registered (rule I-44), the receivable and payable take the gross; each line's account or owner takes the net, its entry carrying the line's `tax_code` and `tax_minor`; and one more entry takes the VAT: Cr `finance.vat-output` on issue of an invoice out, Dr `finance.vat-input` on approval of a bill, each reversed by a credit note. VAT entries carry `for_module` = `finance`.

## Points this module declares

| Point | Kind | Contract | Contributed by |
| --- | --- | --- | --- |
| `invoicing.line-owner` | code | `lines(sourceType, sourceId)` answers `{ counterparty: { module, id }, direction: 'out' or 'in', reference?, lines: [{ key, description, quantityMilli, unitMinor, productionId?, performanceId?``, taxCode?`` }] }` or null when there is nothing to invoice; `entries(unit, { sourceType, sourceId, key, netMinor, action: 'issue' or 'credit' })` adds nothing but returns ledger entries on the owner's own accounts totalling minus `netMinor` for an invoice out (plus it for a bill), reversed for credit. Never commits. One contribution per owner module | Companies (settlement), Fundraising (sponsorship) |
| `invoicing.counterparty` | code | `details(id)` answers `{ name, addressLines, postcode, country, invoiceEmail, taxNumber }` or null; `picker` names a component that chooses a party of that module | Companies; core accounts (contributed by this module itself, reading the account's name and a postal address typed on the party row); Fundraising for a sponsor when Companies is off |
| `invoicing.cost-coding` | code | `picker` (a component), `check(lineId, { amountMinor, productionId? })` answers `{ ok, lineName, budgetName, remainingMinor, overByMinor }` and warns, never blocks; `fulfil(unit, requestId, { module, type, id, amountMinor })` | Budgets (agreed: BudgetLinePicker, check, fulfil) |

A fourth point, `invoicing.export-format`, is later (IE-39): a theatre's own module could add a layout for a parent body this spec has never seen, with a `columns()` and a `write(rows)` function.

## Points this module contributes to

| Point | Contribution |
| --- | --- |
| `finance.system-account` | The five accounts above |
| `finance.period-close-check` | A period with bills still `submitted` whose supplier date is in it, or drafts dated in it, says so (warns; closing is still allowed) |
| `payments.settlement` | `invoicing`: settles a part whose record is an invoice id; credits `invoicing.receivable`, allocates (rule I-20) |
| `payments.disbursement` (P-A1) | `invoicing`: a disbursement part whose record is a bill id; debits `invoicing.payable`, allocates (rule I-24) |
| `invoicing.counterparty` | `core`: a person's account as a party |
| `core.record-resolver` | `invoicing.invoice` (title "Invoice INV-0042" or "Bill from Lamps Ltd, 7781"), `invoicing.party`, `invoicing.export-profile` |
| `core.navigation` | Console, Money group: Invoices, Bills, Debtors, VAT, Exports. Admin, Modules: Invoice series, Export profiles |
| `core.notification-type` | `invoicing.invoice-sent` (to the party, with the PDF and the link token as a sealed variable), `invoicing.reminder` (to the party), `invoicing.bill-waiting` (to approvers, bulk lane), `invoicing.export-ready` (to a schedule's address) |
| `core.vocabulary` | `invoicing.write-off-reason`: Customer gone, Disputed and settled, Too small to chase, Other |
| `core.health-check` | `invoicing.ledger-agrees` (rule I-40) and `invoicing.unmapped-accounts` (a profile with accounts that have entries and no code) |
| `core.measure` | `invoicing.outstanding` and `invoicing.overdue` (money, level, by month and `invoicing.party-kind`), `invoicing.invoiced` (money, sum, net of VAT, by month, production and `invoicing.direction`), to Reports' contract |
| `core.search-source` | Invoices and bills by number, party name and reference, console only, under `invoicing.invoice.view` |
| `core.erasure-handler` | Deletes a person's drafts and their files; the rest is column rules |

## Events

| Event | Announced when | Payload | Internal |
| --- | --- | --- | --- |
| `invoicing.invoice.issued` | An invoice out or credit note is issued | `invoiceId`, `direction`, `source` | no |
| `invoicing.bill.approved` | A bill or supplier credit note is approved | `invoiceId`, `source` | no |
| `invoicing.invoice.paid` | It closes with every allocation a payment | `invoiceId`, `direction`, `source`, `amountMinor` | no |
| `invoicing.invoice.credited` | A credit note is issued against it (whether or not it closes) | `invoiceId`, `creditNoteId`, `source`, `amountMinor` | no |
| `invoicing.invoice.settled` | It closes with any other mix | `invoiceId`, `source` | no |
| `invoicing.invoice.written-off` | A write-off is allocated | `invoiceId`, `source`, `amountMinor` | no |
| `invoicing.export.taken` | An export run is written | `runId`, `profileId` | yes |

No payload carries a name, address, email or note. `source` is `{ module, type, id }` or null.

| Heard | From | Does |
| --- | --- | --- |
| `companies.settlement.approved` | Companies | Asks `invoicing.line-owner` and makes a draft (rule I-19) |
| `companies.settlement.withdrawn` | Companies | Deletes the draft it made; an issued invoice is left for a person to credit |
| `fundraising.sponsorship.agreed` | Fundraising | As for a settlement (payload `sponsorshipId`, `companyId`) |
| `finance.period.closed` | Finance | Wakes scheduled exports waiting on that period (rule E-12) |

## Export formats

Each format is a fixed layout; the profile chooses codes, granularity, dates and signs. Header names for packages were checked against each vendor's import help on 23 November 2026 (Sources tab); a format's exact header row is confirmed against the package's own downloadable template before IE-21 is built, because vendors rename columns.

| Format | One row is | Columns, in order |
| --- | --- | --- |
| `journal` | A ledger entry, or a daily line | Date, Journal (posting id or day), Account code, Account name, Description, Debit, Credit, Currency, Production, Source |
| `xero` | A manual journal line; blank date and narration continue the journal above | Narration, Date, Description, AccountCode, TaxRate, Amount, Tracking (production) |
| `quickbooks` | A journal entry line | Journal No., Journal Date, Account Name, Journal/Description, Debits, Credits |
| `sage` | An audit-trail journal line | Type (JD or JC), Account Reference (nominal code), Date, Reference, Details, Net Amount, Tax Code (from the tax map, rule E-16) |
| `freeagent` | A journal line | Date, Category (nominal code), Description, Debit, Credit |
| `custom` | As the profile's columns say | Chosen from: date, day, posting, kind, kind label, account code, mapped code, code name, account name, description, debit, credit, signed amount, amount in minor units, currency, production title, performance, source title, money or not (the old "tender"), time |

One constraint drives the daily granularity: Xero refuses manual journals that touch its bank, receivable and payable system accounts, so a theatre that keeps its bank in Xero maps money accounts to a clearing code it chooses, and the profile screen says so for the `xero` format.

**The students' union preset.** A `custom` profile reproducing old Proscenium's export (decision 0130, story I-108): columns date, kind label, money or not, mapped code, amount in minor units, amount, then time, source title, production title, reference; one row per entry; total line = the money accounts' net, labelled "Card total, the same as the money dashboard's revenue" (made a setting of the profile); period rule finance-year (1 August to 31 July for NNT). Its six leading columns never move. The kind label maps Finance's posting kinds and accounts to the old categories (Ticket collection, Walk-up, Pass sale, Bar item, Refund), listed in the preset.

## Amendments asked of built modules

### F-A1: Finance lets Invoices write entries for a line owner

Today the trigger `finance_entries_account_module` allows an entry on another module's account only when the posting's source module is `payments`. Invoices needs the same: an owner's half of an invoice's issue posting (rule I-36).

- The trigger's `p.source_module = 'payments'` becomes `p.source_module IN ('payments', 'invoicing')`. It stays a fixed list in the migration; a third collector needs another amendment, which keeps the rule visible.
- No new posting kinds. Adding values to the CHECK on `finance_postings.kind` would rebuild an append-only table, which Foundations' rule G6 and decision 0010 refuse. Instead Budgets' amendment (spec 8, tab 4, its question 11) adds `finance_postings.purpose` and `finance_entries.budget_line_id` by ALTER TABLE ADD COLUMN, no rebuild, with `purpose` checked in `postEntries`. This module's postings use existing kinds with a purpose: `transfer` with purpose `invoice`, `bill`, `credit_note` or `write_off`. For Payments' disbursements I recommend kind `transfer` with purpose `disbursement` rather than `payout`, because Finance's reconciliation (FIN-06) treats any asset account a payout has emptied as a clearing account, and the bank would then show there; this view goes to Integration with Budgets' question 11.
- Finance's export (FIN-05) and statements are unchanged; exports here map by account and posting kind, and may also map by purpose once the column exists (rule E-06 extends to purpose).

### F-A2: Finance lets a theatre register for VAT

Finance today holds `finance.tax.registered` false through its setting rule `tax-not-yet` and ships only the tax code `none`; the entry columns `tax_code` and `tax_minor` were built so that tax needs no ledger migration. VAT on invoices and bills is in the first release, so F-A2 brings forward the part of FIN-07 they need, as its first slice.

- The setting rule `tax-not-yet` goes. In its place, `finance.tax.registered` cannot be turned on while `finance.tax.number` is unset.
- Two new settings: `finance.tax.number` (text, GB followed by 9 or 12 digits, staff audience) and `finance.tax.scheme` (choice: standard or cash accounting; default standard), which the VAT report follows (rule I-46).
- `finance_tax_codes` gains the rows `standard` (2000 basis points), `reduced` (500), `zero`, `exempt` and `outside` beside `none`, and a column `in_scope` (boolean, default true; false for `none` and `outside`) added by ALTER TABLE ADD COLUMN. The table is plain, so nothing append-only is rebuilt. A trigger refuses changing a code's rate once any entry uses it; a new rate is a new code and the old one is made inactive.
- Finance declares two system accounts: `finance.vat-output` (VAT on sales, liability) and `finance.vat-input` (VAT on purchases, asset). This module writes entries on them with `for_module` = `finance`, which F-A1's trigger change already allows.
- A Tax codes list under Admin, Modules, Finance, changed under Finance's settings ability.
- Two read functions added to what Finance exports as #modules/finance, because no module reads another's tables and today only balances() reads the ledger (no entry rows, no tax): entryRows(range, { afterId?, limit }) returns sealed entries oldest first, paged, each with posting id, kind, purpose, source, occurred time, account id, code and name, amount, currency, production and performance tags, for\_module, tax\_code and tax\_minor; taxTotals(range, { basis }) returns net and tax sums grouped by tax code and account kind, by posting date (under cash accounting this module apportions its own invoices' and bills' VAT by its allocation dates, since only it knows which payment met which invoice). The exports (rules E-01 to E-03) read entryRows, and the VAT report (rule I-46, S15) reads taxTotals; neither touches finance\_entries.
- Tax on box office, bar and other sales (the rest of FIN-07) is also in the first release (Integration question 12), written in Finance's and the consolidation spec's stories, not here; it builds on F-A2's codes and accounts, so F-A2 lands first. Sending returns to HMRC stays later (IE-43).

### P-A1: Payments records money going out

Payments today moves money in, refunds it and records payouts from providers. Bills and Budgets' reimbursements both need "the theatre paid someone", by bank transfer or otherwise. Written here for both, at the Budgets thread's request.

****: id prefix `pdb`; realm operational; subject none (the payee is a party reference); append-only, corrected by a reversing row.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `method` | text | `bank-transfer`, `cheque`, `theatre-card`, `petty-cash`, `parent-body` | internal | keep |  |
| `amount_minor` | minor units | not null, above 0 | internal | keep |  |
| `currency` | currency | not null | internal | keep |  |
| `owner_module`, `owner_record` | text | not null | internal | keep | `invoicing` and a bill id; `budgets` and a claim id |
| `payee_id` | ref `payments_payees` | nullable | internal | keep |  |
| `paid_on` | local date | not null | internal | keep |  |
| `reference` | text | 0 to 40 characters | internal | keep | The bank reference or cheque number |
| `reverses_id` | ref `payments_disbursements` | nullable, unique | internal | keep |  |
| `posting_id` | text | not null | internal | keep |  |
| `by` | account, actor | not null | internal | keep | On merge: alias |
| `created_at` | timestamp | not null | internal | keep |  |

****: id prefix `ppy`; realm operational; subject `account_id` where the payee is a person, unlinked rows for staff (redact `payments.payee.manage`); retention `payments.payees.keep-for` (proposed 2 years after last use); not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `party_module`, `party_id` | text | unique together | internal | keep | `core` and an account id, or `companies` and a company id |
| `account_id` | account, subject | nullable | internal | keep | On merge: move |
| `account_name` | text, encrypted | not null | personal | clear | The name on the bank account |
| `sort_code` | text, encrypted | 6 digits | personal | clear |  |
| `account_number` | text, encrypted | 8 digits | personal | clear |  |
| `last_used_on` | local date | nullable | internal | keep |  |
| `created_at`, `updated_at` | timestamp | not null | internal | keep |  |

- **Point ****** (code), one contribution per owner module: `settle(unit, { ownerRecord, amountMinor, method })` returns the owner's debit entries on its own accounts and may refuse. Payments writes the posting: credit `payments.bank` for bank transfer, cheque and theatre card; `payments.cash` for petty cash; a new account `payments.parent-body` (asset, the balance the parent body holds for the theatre) for parent-body.
- **Abilities:** `payments.disbursement.record` (privileged), `payments.payee.read` (privileged, `audit: 'read'`), `payments.payee.manage` (privileged). Bank details are shown masked except to `payee.read`, and are never in an export, event, job payload or log.
- **Not built here:** sending money. Payments records a payment a person made in their bank, and never initiates one (decision 0005's spirit: no money moves from the platform).

### P-A2: an office channel for money recorded away from the desk

Payments' methods run on two channels, `online` and `desk`. A bank transfer received against an invoice is recorded by the treasurer at home, not at a till. P-A2 adds a channel `office` that offers `other_attested` only, needs no till session, and is used by this module's "Record a payment" screen. Nothing else changes in Payments.

## Agreements and what is still open

| With | State |
| --- | --- |
| Companies | Agreed: events `companies.settlement.approved` and `.withdrawn`; contributions to `invoicing.line-owner` and `invoicing.counterparty`; deposits stay in Payments |
| Fundraising | Agreed: `fundraising.sponsorship.agreed` { sponsorshipId, companyId }; contributions to `invoicing.line-owner` (source type `sponsorship`, account `fundraising.sponsorship-income`) and to `invoicing.counterparty` when Companies is off |
| Budgets and claims | Agreed: budget line tagging through `invoicing.cost-coding`; P-A1 written here, and claims are paid as `disbursement` too; one Finance migration, written in Budgets' tab 4; the parent body's claims schedule is Budgets' download |
| Reports | Agreed: three figures to `core.measure`; schedules reuse `reports_schedules`' shape |
| Foundations | Asked: reserve `/invoice`, and the module ids `companies`, `budgets`, `fundraising` and `invoicing` once their specs are accepted |
| Finance (built) | Accepted by Integration: F-A1 (R3-14) and F-A2 (VAT registration, codes and the two VAT accounts). The rest of FIN-07, VAT on every other sale, is in the same release (Integration question 12) |
