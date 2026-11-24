# Invoices and exports: specification

2026-11-23 · Matthew Adcock

This is spec 9 of the third round: a new switchable module, `invoicing`, shown in menus as **Invoices and exports**. It does two jobs Finance's ledger does not: it keeps track of money owed between the theatre and other organisations (invoices out, supplier bills in), and it hands the ledger over to the books someone else keeps (an accounting package, or a parent body such as a students' union, in that body's own codes and layout). Written on 23 November 2026 from what is built on `next`; nothing here is built.

## The design in eight sentences

1. An invoice out is drafted by a person or raised by another module (a hire fee or a settlement from Companies, a sponsorship from Fundraising), checked, then issued: issuing gives it the next number in its series, freezes it as a PDF and posts it to the ledger once.
2. A supplier's invoice in (a bill) is logged with the supplier's own PDF, coded to expense accounts and, where Budgets is on, to a budget line, approved by someone other than the person who logged it, and only then posted.
3. An issued invoice or approved bill is never edited or deleted; it is reduced or cancelled only by a credit note, which posts the reverse.
4. Money received against an invoice goes through Payments (a card link on the invoice once the treasurer turns card payment on, or a bank transfer recorded by staff); money paid on a bill goes through a new Payments record of money going out, which Budgets' reimbursements share.
5. Invoices owns one receivable and one payable account, so the treasurer has one list of who owes the theatre and one of what it owes, with ageing; the module that raised a line posts the income or expense side on its own accounts.
6. An export profile maps each ledger account to a code in the other books and writes a file in a fixed format (Xero, QuickBooks, Sage, FreeAgent, a plain journal, or a parent body's own columns), every line exactly once, with a warning for anything unmapped.
7. Every export taken is recorded with a fingerprint, so taking the same closed period again proves it gives the same file.
8. A VAT-registered theatre charges and reclaims VAT on every invoice and bill line, posted to Finance's two VAT accounts, with a VAT report to fill in the return from; box office and bar sales carry VAT too, through Finance's own story in the same release.

## Why it is one module and not two

The map paired invoices with exports because both are the treasurer's dealings with books outside the platform. They are separable inside the module: a theatre that never raises an invoice still uses the exports, and NNT's students' union return needs only the exports half. It is one module with two menu entries, because the exports half has three tables and no screens a member ever sees, and the two halves share the treasurer, the Money group and the settings modal.

## What NNT gets first

The old system's students' union export (old Proscenium story I-108) is the one feature here that NNT already used and lost at the 19 November cutover; today's Finance export (FIN-05) has account codes but no mapping to the union's nominal codes and no union layout. So the exports half is first, as the gate for this module, and invoices follow.

## The parts

| Tab | Holds | Size |
| --- | --- | --- |
| 1. Scope | In, out, what it assumes of other modules, 18 words it owns |  |
| 2. Data model | Ten tables in the Foundations layout, erasure and merge | 10 tables, 10 id prefixes |
| 3. States and rules | Invoice, bill and export life cycles, every rule with an id | 4 diagrams, 62 rules |
| 4. Interface to other modules | Manifest, services, points, events, ledger postings, and the amendments asked of Finance and Payments | 4 amendments, 4 agreements |
| 5. Screens | Console, Admin, the public invoice page and the PDF | 15 screens, 2 wireframes |
| 6. Settings and abilities | Settings, abilities, presets | 16 settings, 13 abilities |
| 7. Stories | IE-01 to IE-43, with order of work and cut order | 6 gate, 27 first, 10 later |
| 8. Test plan | Never-regress cases | 60 cases |
| 9. Questions for Matt | Eight questions, all answered | None open |

Story prefix `IE` (Invoices and exports), checked unused across the repository.

## Agreed with other specs this round

| Spec | Agreed |
| --- | --- |
| Companies (3) | Companies owns names, addresses, invoice email and tax number (`companies.billingDetails`); it raises invoices and bills for settlements and hire fees by announcing `companies.settlement.approved`, and answers `invoicing.line-owner` and `invoicing.counterparty`; posting happens once, at issue; deposits stay in Payments, never on an invoice as an amount |
| Budgets and claims (8) | A bill line can carry a budget line through `invoicing.cost-coding`, which Budgets contributes (picker, check, fulfil); this spec writes the Payments amendment for money going out (P-A1), which claims share, including the one encrypted home for bank details (`payments_payees`); Budgets writes the Finance migration adding `purpose` and `budget_line_id`, which this module's postings use |
| Fundraising (10) | Sponsorship invoices are raised by Fundraising's event `fundraising.sponsorship.agreed` and its answers to `invoicing.line-owner`; the Gift Aid claim schedule is Fundraising's own, not an accounting export |
| Reports (12) | Ledger and parent-body exports are this module's; Reports owns statistics and returns. This module contributes three figures to `core.measure` and reuses Reports' schedule shape for scheduled exports |
