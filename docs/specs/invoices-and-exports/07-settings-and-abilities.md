# 6. Settings and abilities

Sixteen settings and thirteen abilities, in Foundations' formats. Every number is a proposed value for the workshops, not a decision. All settings are changed by `invoicing.settings.manage` and live on the pages they govern (part 5), with the full set under Admin, Modules, Invoices and exports.

## Settings

| Key | Kind | Default | Range | Group | Meaning |
| --- | --- | --- | --- | --- | --- |
| `invoicing.terms.days` | integer | 30 | 0 to 120 | Invoices | Days from issue to due, where the party has no terms of its own |
| `invoicing.issue.backdate-limit` | duration | 30d | 0d to 365d | Invoices | How far before today an issue date may be set (rule I-08) |
| `invoicing.issue.second-person-over` | money | unset | £1 upwards | Invoices | An invoice out above this needs someone other than its creator to issue it. Unset: anyone with the ability issues any invoice |
| `invoicing.tax.default-code` | choice | standard | Finance's active codes other than none | Invoices | The VAT code a new line starts on when neither its party nor its owner suggests one (rule I-06). Shown only while finance.tax.registered is true |
| `invoicing.pay-online` | boolean | false |  | Payment | Offer card payment on the public invoice page. Off until the treasurer turns it on, even when a Stripe provider account exists; shown only when one does |
| `invoicing.pay.bank-details` | text | unset | 400 characters | Payment | The theatre's own details for a bank transfer, printed on every invoice. Not a secret, and never a Worker secret (Matt, 19 November 2026) |
| `invoicing.pay.link-valid-for` | duration | 180d | 30d to 730d | Payment | How long the link on an invoice and its reminders works; a reminder issues a fresh one |
| `invoicing.reminders.enabled` | boolean | true |  | Reminders | Off stops every scheduled reminder; manual ones still work |
| `invoicing.reminders.before-due` | duration | 3d | 0d to 30d | Reminders | 0d sends none before the due date |
| `invoicing.reminders.first-after` | duration | 7d | 1d to 60d | Reminders | First reminder after the due date |
| `invoicing.reminders.second-after` | duration | 21d | 1d to 120d; more than first-after | Reminders | Second and last automatic reminder |
| `invoicing.reminders.send-at` | time | 10:00 | 07:00 to 20:00 | Reminders | Theatre's local time |
| `invoicing.write-off.min-overdue` | duration | 90d | 0d to 730d | Invoices | An invoice may be written off only after this long overdue |
| `invoicing.records.keep-for` | duration | 2192d (6 years) | 2192d to 3653d | Records | How long issued invoices and bills keep their personal details after the end of their finance year (part 2) |
| `invoicing.exports.keep-files-for` | duration | 400d | 30d to 3653d | Exports | Kept copies of export files; the run's row and fingerprint stay for good |
| `invoicing.exports.default-profile` | reference | unset | the active profiles | Exports | What S8 opens on; set from S10's "Open Exports on this one" |
| `invoicing.exports.starter` | choice | journal | journal, union | Exports | The profile made when the module is first switched on; the `student-society` preset sets union |

Setting rules, checked together with every pending change: `second-after` is longer than `first-after`; `pay-online` cannot be on with no Stripe provider account; `keep-for` is never shorter than six years.

The theatre's VAT registration, its VAT number and its scheme (standard or cash accounting) are Finance's settings (amendment F-A2, tab 4), shown on Finance's page and never repeated here; this module reads them.

## Record types

| Record type | Table | Parent | Owner |
| --- | --- | --- | --- |
| `invoicing.invoice` | `invoicing_invoices` | none | none |
| `invoicing.party` | `invoicing_parties` | none | `account_id` |
| `invoicing.series` | `invoicing_series` | none | none |
| `invoicing.export-profile` | `invoicing_export_profiles` | none | none |

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Holders in the presets |
| --- | --- | --- | --- | --- | --- | --- |
| `invoicing.invoice.view` | `invoicing.invoice` | normal |  |  | See invoices and credit notes out, and the debtors list. Audited as a read, because bill-to details are personal | `treasurer`, `owner` |
| `invoicing.invoice.draft` | site | normal |  | `invoice.view` | Write and change drafts | `treasurer` |
| `invoicing.invoice.issue` | `invoicing.invoice` | privileged |  | `invoice.draft` | Issue invoices and credit notes out, send them again (rule I-09 adds a second person above a threshold) | `treasurer` |
| `invoicing.invoice.credit` | `invoicing.invoice` | privileged | refuses | `invoice.view` | Make a credit note against an invoice or bill. Never on an invoice one issued oneself, an Owner included, so cancelling takes two people (ruling R3-17, guard in the service) | `treasurer`, `owner` |
| `invoicing.invoice.write-off` | `invoicing.invoice` | privileged | refuses | `invoice.view` | Write off what is outstanding | `owner` (the treasurer asks the chair, who is given it per year) |
| `invoicing.payment.record` | `invoicing.invoice` | privileged |  | `invoice.view` | Record a bank transfer or cheque received; with `payments.disbursement.record`, record a bill paid | `treasurer` |
| `invoicing.bill.view` | `invoicing.invoice` | normal | grants |  | See bills; the person who logged a bill always sees it | `treasurer`, `owner` |
| `invoicing.bill.log` | site | normal |  | `bill.view` | Log and submit a bill | `treasurer`, `technical-manager`, `producer` |
| `invoicing.bill.approve` | `invoicing.invoice` | privileged | refuses | `bill.view` | Approve or send back a bill; never one's own, an Owner included (four-eyes, ruling R3-17; enforced by a guard in the service, since the Owner role bypasses `owner: refuses`) | `treasurer`, `owner` |
| `invoicing.export.take` | site | privileged |  |  | Take an export, see past runs and download kept files. Also needs finance.ledger.view, checked on every export and, for a schedule, against its creator at each send, because Finance's entryRows returns every sealed entry (F-A2). `fresh: false`, `audit: 'read'` | `treasurer` |
| `invoicing.export.manage` | `invoicing.export-profile` | privileged |  | `export.take` | Make and change profiles and code maps, and schedules | `treasurer` |
| `invoicing.settings.manage` | site | privileged |  |  | Settings and invoice series | `treasurer`, `owner` |
| `invoicing.invoice.redact` | site | privileged |  | `invoice.view` | Search unlinked invoices for a person and redact them; `grantAt: site` | `owner` |

Payments' P-A1 abilities (`payments.disbursement.record`, `payments.payee.read`, `payments.payee.manage`) go to `treasurer` in the presets.

## Presets

| Preset | Module | What it sets |
| --- | --- | --- |
| `student-society` | on | The students' union export profile (part 4) as the default, period rule finance year; `terms.days` 30; the disbursement method "paid by the parent body" listed first |
| `small-venue` | off | When switched on: a `journal` profile, a series INV-, reminders on |
| `amateur-company` | off | As small-venue, with `finance.year.starts` 01-01 already set by Finance's preset |

On switch-on the module makes a default invoice series "INV-" and credit note series "CN-", each padded to 4, and, under `student-society`, the union profile with every account unmapped, so the treasurer's first job is shown as a count on S8.
