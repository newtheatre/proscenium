# 1. Scope

The module covers money owed between the theatre and other parties, and the ledger's journey to other books. It takes no card payment itself, keeps no budget and holds no bank details.

## In

| Area | What is in |
| --- | --- |
| Invoices out | Drafting by hand or raised by another module; numbering in series; issue with a frozen PDF; email to the customer with a link to a public invoice page that can take a card payment once the treasurer turns it on; reminders before and after the due date; recording a bank transfer or cheque; part payments; credit notes; writing off a bad debt |
| Bills in | Logging a supplier's invoice with its PDF, the supplier's own number and due date; coding each line to an expense account, a production and (with Budgets) a budget line; approval by a second person; recording payment through Payments' outgoing payments, including "paid by the parent body"; supplier credit notes |
| Parties | Invoicing details per customer or supplier (payment terms, a standing purchase-order reference, a default expense account) keyed to a Companies record, an account, or typed on the invoice for a one-off |
| Debtors and creditors | Who owes what and for how long (ageing in 0 to 30, 31 to 60, 61 to 90, over 90 days); what the theatre owes and when it falls due |
| Accounting exports | Export profiles: an account-to-code map, a format, a granularity (every entry, or one line per account per day), dates and signs as the other books want them; a coverage check before download; a record of every export with a fingerprint; scheduled exports to an email address |
| A parent body's format | A profile whose columns, header names, code map and total line the theatre sets, with a preset reproducing the old system's students' union export |
| VAT | For a VAT-registered theatre: a VAT code and amount on every invoice and bill line, full VAT invoices, VAT posted to Finance's two VAT accounts, a VAT report to fill in the return from, bad debt relief listed when due, and tax codes in export files. Registration, the codes and their rates are Finance's (amendment F-A2) |

## Out

| Not here | Where it lives |
| --- | --- |
| Taking a card payment, refunds of card money, payment links' mechanics | Payments (this module asks for an intent) |
| Budgets, expense claims, reimbursing members | Budgets and claims (spec 8) |
| Working out a visiting company's share or a hire fee | Companies (spec 3); it raises the invoice here |
| Deposits held against a hire | Payments, through Companies; an invoice may show one as a note, never as an amount |
| Gift Aid claim schedules | Fundraising (spec 10) |
| VAT on box office, bar and other sales; sending VAT returns to HMRC; the flat rate scheme | Sales VAT is Finance's FIN-07, in the same release but not this module's (Integration question 12); returns are IE-43 (later); the flat rate scheme is not planned |
| Statistics, returns and their downloads | Reports (spec 12) |
| Sending files to an accounting package by its API | Later (IE-38); the first release writes files people upload |
| Purchase orders raised by the theatre | Later (IE-40) |
| Statements of account sent to customers | Later (IE-36) |
| Recurring invoices | Later (IE-37) |

## What it assumes of other modules

| Module | Assumed | State |
| --- | --- | --- |
| Finance (built) | Posts sealed, balanced postings in the caller's unit; accounts locked to one module; account `code` is the theatre's nominal code and the treasurer may recode it; periods and close | Built. Needs amendments F-A1 and F-A2 (tab 4) |
| Payments (built) | Intents with parts and owner settlement; Stripe; `other_attested` for a bank transfer at the desk | Built. Needs amendment P-A1, outgoing payments, and P-A2, an office channel (tab 4) |
| Core (built) | Files in R2 (`core_files`), notifications with sealed variables for link tokens, `siteUrl`, record resolvers, theatre time zone and the 04:00 night | Built |
| Companies (spec 3) | `companies.billingDetails`, a company picker, record types `companies.company` and `companies.settlement` | Agreed this round |
| Budgets and claims (spec 8) | `invoicing.cost-coding` (picker, check, fulfil), contributed by Budgets; Budgets' Finance migration adding `purpose` and `budget_line_id` | Agreed this round |
| Fundraising (spec 10) | Raises sponsorship invoices | Agreed this round |

## Glossary of the words this module owns

| Word | Meaning |
| --- | --- |
| Invoice | A request for payment the theatre sends. In the data, an invoice with direction out |
| Bill | A supplier's invoice to the theatre. In the data, an invoice with direction in. The screens say bill so the two are never confused |
| Credit note | A document that reduces or cancels an issued invoice or approved bill. The only way either is undone |
| Party | Whoever an invoice is to or a bill is from: a Companies record, a person's account, or a one-off name and address |
| Series | A numbering sequence, such as INV-0001 upwards; numbers are given at issue, with no gaps |
| Draft | An invoice or bill that has no number and posts nothing; it may be changed or deleted |
| Issue | Giving an invoice its number, freezing it and posting it. For a bill the word is approve |
| VAT invoice | An invoice or credit note out issued while the theatre is VAT-registered, carrying every field the law asks for (rule I-41). Always a full one, never a simplified one |
| Due date | The date payment is due, from the party's or the theatre's payment terms |
| Overdue | Unpaid after its due date. Worked out, never stored |
| Allocation | An amount applied to an invoice or bill: a payment, a credit note or a write-off |
| Outstanding | Total less allocations |
| Write-off | Giving up an unpaid amount on an invoice out; posts to bad debts |
| Line owner | The module whose record a line came from and whose accounts take its other side |
| Receivable, payable | This module's two ledger accounts holding what is owed to and by the theatre |
| Export profile | A saved recipe for a file: format, code map, granularity, columns |
| Code map | For one profile, each ledger account's code in the other books |
| Unmapped | A ledger account with no code in a profile; its lines still go out, marked |
| Export run | One file taken, with what it covered and its fingerprint |

Five words are another module's and are used here as they define them: **settlement** (Companies), **budget line** (Budgets), **tax code** (Finance; amendment F-A2 adds the VAT codes), **intent** and **disbursement** (Payments; disbursement is added by amendment P-A1).
