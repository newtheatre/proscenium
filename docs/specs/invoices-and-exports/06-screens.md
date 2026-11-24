# 5. Screens

Fifteen screens: nine in the console's Money group, three in Admin, one public page, one email and one PDF. All use Interface's page types (list, record, form in a slide-over), Nuxt UI components, and the conventions Matt has set: settings on their subject's page, archived rows below a collapsible divider, right-click menus on list rows, toasts with Undo where an action can be undone, inline validation with no browser pop-ups, fixed choices as dropdowns.

## Inventory

| # | Screen | Address | Type | Who sees it |
| --- | --- | --- | --- | --- |
| S1 | Invoices | `/console/invoicing/invoices` | List | `invoicing.invoice.view` |
| S2 | Invoice | `/console/invoicing/invoices/[id]` | Record, with a draft editor | `invoicing.invoice.view`; editing a draft `invoicing.invoice.draft` |
| S3 | Bills | `/console/invoicing/bills` | List, with a "Waiting for my approval" view | `invoicing.bill.view` |
| S4 | Bill | `/console/invoicing/bills/[id]` | Record: the supplier's PDF beside the coded lines | `invoicing.bill.view` |
| S5 | Debtors and creditors | `/console/invoicing/owed` | Two tabs: owed to us (with ageing) and we owe (by due date) | `invoicing.invoice.view` and `invoicing.bill.view` |
| S6 | Record a payment | slide-over from S2 or S4 | Form | `invoicing.payment.record` (and `payments.disbursement.record` for a bill) |
| S7 | Credit note | slide-over from S2 or S4 | Form | `invoicing.invoice.credit` |
| S8 | Exports | `/console/invoicing/exports` | A form above a list of past runs | `invoicing.export.take` |
| S9 | Invoice series | `/admin/modules/invoicing/series` | List with an editor | `invoicing.settings.manage` |
| S10 | Export profiles | `/admin/modules/invoicing/exports` | List | `invoicing.export.manage` |
| S11 | Export profile | `/admin/modules/invoicing/exports/[id]` | Record: format, columns, then the code map | `invoicing.export.manage` |
| S12 | Public invoice | `/invoice/[token]` | Public page, no sign-in | Whoever holds the link |
| S13 | Invoice email | email | `invoicing.invoice-sent` and `invoicing.reminder` | The party |
| S14 | Invoice PDF | file | Made at issue | The party, staff |
| S15 | VAT | `/console/invoicing/vat` | Report with a download; only while the theatre is VAT-registered | `invoicing.invoice.view` and `invoicing.bill.view` |

The party's own settings (terms, standing reference, default expense account, reminders) live on the party's page: a "Invoicing" record tab contributed to Companies' company page through `core.record-tab`, and on a person's account page for a person party. They are never shown on a second screen (Matt's rule that a setting lives on its subject's page).

The module's own settings (part 6) live in the cog modal on S1 and S8, scoped to those pages, and in full under Admin, Modules, Invoices and exports.

## S1 Invoices and S3 Bills

Columns: number, party, issue date, due date, total, outstanding, status badge (part 3's words; Overdue in the warning colour with the days). Filters: status, party, production, date range. The New button opens S2 as a draft. Right-click on a row: Open, Send again, Record a payment, Make a credit note, Copy number. Drafts list first in their own group; closed invoices after open ones. Raised drafts carry a small tag naming their source ("From settlement: Lamps Ltd, Autumn hire").

S3 opens on "Waiting for my approval" for an approver, and shows nothing of their own bills there (rule I-10).

## S2 Invoice

A draft is a form: party picker (from `invoicing.counterparty`, or "Someone else" for a one-off name and address), reference, issue date, due date (filled from terms), lines (description, quantity, unit price, account; owner lines locked with their source shown), notes. The total and lines update as you type; the server's total is sent back with Issue and a mismatch refuses quoting both. Buttons: Issue (primary, default colour), Save draft, Delete draft. Issue opens a confirmation: "Issue INV-0043 to Lamps Ltd for £420.00? It will be numbered, posted to the ledger and emailed to accounts@lamps.example." with "Send by email now" ticked.

While the theatre is VAT-registered, each line gains a VAT dropdown (Finance's active codes, labelled with their rate, starting on the party's default) and a VAT amount worked by the server; the draft gains a "Time of supply" date, hidden behind "Supplied on a different date" because it is rarely needed; and the totals read Net, VAT and Total. The confirmation names the gross: "Issue INV-0043 to Lamps Ltd for £504.00 (£420.00 plus £84.00 VAT)?". If the theatre's VAT number is not set, Issue is disabled with a link to Finance's settings (rule I-41).

An issued invoice is a record page: the PDF preview, then the facts (number, dates, party, total, outstanding), then a timeline of what happened (issued, sent, reminders, payments, credit notes) from the allocations, reminders and audit. Actions: Record a payment, Send again, Make a credit note, Write off (when overdue long enough), Copy payment link.

## S4 Bill

Two panes on a wide screen, stacked on a phone: the supplier's PDF on the left, the form on the right. Lines carry an expense account, production and, when Budgets is on, a budget line through the Budgets picker, with its warning inline ("Over by £35.00 on Set materials"). Submit sends it to approvers; an approver sees Approve (primary) and Send back (asks for a reason inline). Logging a duplicate supplier number is refused inline naming the earlier bill.

While registered, each bill line has a VAT dropdown and a VAT amount typed from the supplier's invoice, with the worked figure in muted text beside it; a difference of more than a penny shows an inline warning ("The rate gives £14.00; you typed £14.20"), never a refusal (rule I-43). A supplier whose party default is `outside` starts every line on it.

_Diagram in the source doc: S4 Bill · wireframe, illustrative figures_

## S5 Debtors and creditors

Owed to us: one row per party, with columns Current, 1 to 30, 31 to 60, 61 to 90, Over 90 and Total, sorted by the oldest overdue amount; a row expands to its invoices. We owe: bills by due date, with what is due this week highlighted, and a "Paid by the parent body" filter so a society can hand the union one list.

## S8 Exports

_Diagram in the source doc: S8 Exports · wireframe, illustrative figures_

The screen opens on the default profile and its period rule (for NNT, the finance year 1 August to 31 July). Changing the profile or period redraws the coverage line. Export downloads the file and adds a row to Past exports. A past run that matches the coverage now (same range, map and fingerprint) is marked "Same as the file taken on 3 August"; one that would differ is marked "Would differ: 2 codes changed since". Schedules appear under the past runs with their next date and the address, each with Pause.

## S11 Export profile

The code map lists every ledger account that has entries, grouped by module, with an input for its code and the other books' name, and "Add a code for one kind of posting" under each (rule E-06). Accounts with no code show first, with the count in the tab's badge. A Preview button shows the first 20 lines of the file for the last closed period. Formats other than custom hide the columns editor.

Below the code map, a Tax codes section lists each Finance tax code with an input for the other books' name for it (rule E-16). The package presets fill it (Xero's rate names, Sage's T codes); the union preset leaves it empty, since the union's file has no tax column.

## S12 Public invoice and S13 the email

The public page shows the theatre's branding, the frozen invoice, what is outstanding, a Download PDF link and, when the treasurer has turned card payment on (it is off by default, even when Stripe is set up), "Pay £420.00 by card" using Payments' card form. Bank details for a transfer are the theatre's own, from the setting `invoicing.pay.bank-details`, never a payee's. Paid or credited invoices show "Nothing to pay" and keep the PDF link until the token expires. The email has the PDF attached, the total, the due date, and a button to the page.

## S14 The PDF

A4, the theatre's logo, name, address and charity or company number from branding settings; "Invoice" or "Credit note" and its number; party block; dates and reference; lines table; totals; the theatre's payment instructions; notes. Made with a pure JavaScript PDF library in the Worker (no browser rendering), from the frozen row only, so making it twice gives the same content.

While registered, the PDF is headed "VAT invoice" (or "Credit note"), prints the theatre's VAT number under its address, the party's VAT number where known, the time of supply where it differs from the date, a Rate and a VAT column on every line, and below the lines a summary by rate (net, VAT) above the gross total, as rule I-41 lists. Unregistered, none of this appears.

## S15 VAT

Opens on the last closed Finance period, with a date range picker for a VAT quarter. Three blocks: VAT on sales (output VAT by code, from invoices out less credit notes and from box office, bar and other sales, which carry codes through Finance's FIN-07 in the same release, Integration question 12), VAT on purchases (input VAT on bills, by code), and the difference to pay or reclaim; then net sales and net purchases in scope. Each figure opens the records behind it. A section "Bad debt relief you may claim" lists written-off VAT invoices past six months (rule I-45), each with "Record the claim", which opens Finance's journal prefilled. Download gives the same figures as a CSV. Nothing is sent to HMRC.
