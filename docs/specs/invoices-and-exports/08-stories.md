# 7. Stories

Forty-three stories, IE-01 to IE-43. The gate is the exports half, because NNT used the students' union export in the old system and has had only Finance's plain CSV since the 19 November cutover. Invoices and bills follow in the first release, with VAT on both (IE-31, IE-41, IE-42); ten stories are later.

|  | Gate | Rest of first release | Later | All |
| --- | --- | --- | --- | --- |
| Stories | 6 | 27 | 10 | 43 |

## Order of work

1. Gate, IE-01 to IE-06: the module, profiles, the union preset, coverage, runs. Needs nothing from any other spec.
2. Finance amendment F-A1 and Payments P-A2 (each its own pull request into the built module, tests first), then invoices out, IE-07 to IE-18.
3. Payments P-A1, then bills, IE-19 to IE-24.
4. Finance amendment F-A2 (its own pull request, tests first), then VAT on invoices and bills, IE-31, IE-41 and IE-42.
5. Line owners and the rest, IE-25 to IE-30, as Companies and Fundraising are built.

Cut order if the first release must shrink, last cut first: IE-30, IE-26, IE-21 (keep `journal` only), IE-27, IE-17, IE-12.

The VAT stories are not in the cut order: VAT is in the first release by decision, and a VAT-registered theatre could not issue an invoice without them.

## Gate

| Id | As | I want | So that | Acceptance | Rests on |
| --- | --- | --- | --- | --- | --- |
| IE-01 | developer | the module declared: manifest, ten tables, record types, abilities, settings, the five ledger accounts | everything else has somewhere to stand | Switching it on makes the accounts, the default series and (student-society) the union profile; switching it off hides every screen and keeps every row | Finance, kit |
| IE-02 | treasurer | an export profile with a code for each ledger account, and an override per posting kind | each line goes out under the other books' code | Every account with entries is listed, grouped by module; a code is up to 50 characters; clearing it makes the account explicitly unmapped; each change is audited with old and new code (E-06, E-14) | IE-01 |
| IE-03 | treasurer | to see before downloading what the file covers | I know whether it is final and complete | The screen shows the first and last day, line count, unmapped lines and accounts, and Closed or Open, and updates as the period changes (E-05, E-08); a range over 50,000 entries is refused with the count (E-07) | IE-02 |
| IE-04 | treasurer at NNT | the students' union export as the old system made it | the union's yearly return costs one download | The preset's six leading columns and the rest are as old Proscenium's decision 0130 and story I-108; one row per entry, refunds negative, the total line last; a test compares a fixture year against a file from the old system byte for byte, apart from the trace columns' new sources | IE-02, IE-03 |
| IE-05 | treasurer | every export recorded with its fingerprint | taking a closed year again proves it is the same file | A run row is written per download with range, rows, closed, map digest and SHA-256; S8 says Same file or Would differ for each past run (E-09) | IE-03 |
| IE-06 | treasurer | the `journal` format and a daily summary | any accounting package can take the ledger | Entry and daily granularity; the file balances (E-04); amounts as plain numbers in major units (E-11); formula guard on text cells (E-10); no personal data (E-15) | IE-02 |

## Rest of the first release

| Id | As | I want | So that | Acceptance | Rests on |
| --- | --- | --- | --- | --- | --- |
| IE-07 | treasurer | invoice series with a prefix and padding | numbers follow the theatre's style with no gaps | Make, rename, archive a series; one default per kind; numbers given only at issue (I-12) | IE-01 |
| IE-08 | treasurer | to draft an invoice to a company, a person or a one-off name | I can prepare it before sending | Party picker from `invoicing.counterparty`; lines with quantity, price and account; totals by the server; drafts may be deleted (I-01 to I-07) | IE-07 |
| IE-09 | treasurer | to issue an invoice | it is numbered, frozen and in the ledger once | One batch: number, state, posting (I-12, I-13); the frozen columns cannot change afterwards (I-14); 50 people issuing at once get 50 consecutive numbers | IE-08, F-A1 |
| IE-10 | customer | a PDF of the invoice | I can file and pay it | Made from the frozen row at issue, stored as a core file, retried by a job if it fails (I-16) | IE-09 |
| IE-11 | customer | the invoice by email with a link to a page | I can see what I owe and download it | Email with PDF and T1 link; page shows outstanding and the theatre's bank details (I-17, I-18) | IE-10 |
| IE-12 | customer | to pay by card from that page | paying takes a minute | Payments' card form, offered only once the treasurer turns `invoicing.pay-online` on, which is off by default even with Stripe set up; a payment that arrives after the invoice closed is refused and returned (I-22) | IE-11, Stripe |
| IE-13 | treasurer | to record a bank transfer or cheque received | the invoice shows paid | Office channel (P-A2); date and reference; over-payment refused quoting both figures (I-21, I-22) | IE-09, P-A2 |
| IE-14 | treasurer | part payments, and to undo a payment recorded against the wrong invoice | the outstanding figure is always right | Allocations add up; a reversal row reopens the invoice (I-22, I-25) | IE-13 |
| IE-15 | treasurer | credit notes for invoices out and from suppliers | a mistake is corrected without editing history | Any lines or part amounts up to what is left; the reverse posting; owners' credit handlers called; two people (owner refuses) (I-27, I-28) | IE-09 |
| IE-16 | treasurer | to give back money on a credit note | the customer is repaid | A card refund through Payments, or a disbursement (I-29) | IE-15, IE-22 |
| IE-17 | treasurer | reminders before and after the due date | I chase less | The daily task sends each step once; not to paid invoices or on closed days (I-31 to I-35) | IE-11 |
| IE-18 | treasurer | a debtors list with ageing | I know who owes what and for how long | Bands and sort as I-34; a row per party expanding to invoices | IE-09 |
| IE-19 | technical manager | to log a supplier's bill with its PDF | the treasurer can pay it | PDF required; duplicate supplier number refused naming the earlier bill (I-11) | IE-01 |
| IE-20 | treasurer | to approve or send back a bill | only checked bills reach the ledger | Approver is never the logger (I-10); approval posts once; send-back needs a reason | IE-19, F-A1 |
| IE-21 | treasurer | Xero, QuickBooks, Sage and FreeAgent layouts | I can import without editing the file | Each format's header row matches the vendor's downloadable template on the day the story is built; Xero's system-account restriction explained on S11 | IE-06 |
| IE-22 | treasurer | to record paying a bill | the payable clears | Payments' disbursement (P-A1) with method, date and reference; bank details from payees, masked | IE-20, P-A1 |
| IE-23 | treasurer at a society | to mark a bill paid by the parent body | the union's payments are recorded | Method parent-body posts to `payments.parent-body`; a filter on S5 lists bills for the union | IE-22 |
| IE-24 | producer | to charge a bill line to a budget line | spend shows against the budget | Picker and warning from `invoicing.cost-coding`; the entry carries `budget_line_id`; a spending request is fulfilled in the approving unit | IE-20, Budgets |
| IE-25 | treasurer | invoices and bills raised from Companies' settlements | hire fees and company shares are invoiced without retyping | Draft made on `companies.settlement.approved`; owner lines locked; Companies' entries posted at issue; paid and credited events reach Companies (I-19, I-36 to I-39) | IE-09, Companies |
| IE-26 | fundraising lead | sponsorship invoices | sponsors are invoiced the same way | As IE-25 for `fundraising.sponsorship.agreed` | IE-25, Fundraising |
| IE-27 | chair | to write off a debt | the books stop carrying money that will not come | After `write-off.min-overdue`; a reason; never by whoever issued it (I-26) | IE-09 |
| IE-28 | treasurer | a check that invoices and the ledger agree | a fault is found the day it happens | Health check `invoicing.ledger-agrees` (I-40) and `invoicing.unmapped-accounts` | IE-09 |
| IE-29 | treasurer | a party's terms, reference and default account on its own page | I set them once | Record tab on Companies' page and the account page; never shown twice | IE-08 |
| IE-30 | treasurer | a scheduled export to the union | the monthly return sends itself | Reports' cadence shape; waits for close (E-12); emails a link, not the file (E-13) | IE-05 |
| IE-31 | treasurer of a VAT-registered theatre | VAT on invoices and bills, with a VAT invoice's legal fields | what we charge and reclaim is right and every invoice is a valid VAT invoice | Codes per line from party, owner or setting; VAT worked per line (I-42), typed on bills with a warning (I-43); posted to Finance's VAT accounts (I-44); the PDF carries every field of I-41; issue refused without the theatre's VAT number; nothing about VAT shows while unregistered (I-06) | IE-09, IE-20, F-A2 |
| IE-41 | treasurer of a VAT-registered theatre | a VAT report for any range of dates | I can fill in the VAT return from one screen | S15's figures by code, on the standard or cash basis (I-46); bad debt relief listed once due (I-45); download as CSV; agrees with the movement on Finance's VAT accounts from this module | IE-31 |
| IE-42 | treasurer | each export profile to map tax codes to the other books' names | the package imports VAT without editing | Tax map on S11; package presets filled; unmapped codes counted (E-16) | IE-21, IE-31 |

## Later

| Id | Story | Why later |
| --- | --- | --- |
| IE-32 | Matching bank statement lines to invoices and bills | Needs a bank feed or a statement import |
| IE-33 | Invoices in another currency | The ledger is single-currency per site today |
| IE-34 | A company contact sees and pays its invoices from Companies' contact view | Follows Companies' contact view |
| IE-35 | Logging a bill by forwarding the supplier's email to an address (Email Routing) | Useful, not needed to start |
| IE-36 | Statements of account sent to a party | Reminders cover the need at first |
| IE-37 | Recurring invoices (a monthly rehearsal-room hire) | Few theatres need it at first |
| IE-38 | Sending exports to Xero or QuickBooks by their API | Credentials in-app, OAuth, and a supported connection; files first |
| IE-39 | The point `invoicing.export-format` for a fork's own parent body layout | Custom columns cover the known cases |
| IE-40 | Purchase orders the theatre raises, matched to bills | A bigger process than a society runs |
| IE-43 | Sending VAT returns to HMRC through Making Tax Digital | Needs HMRC's API and credentials in-app; the report (IE-41) is enough to file by hand |

## As built: the gate (IE-01 to IE-06)

Built in layer `layers/invoicing`. Where the build differs from the parts above:

- The gate made only the three export tables (profiles, codes, runs); schedules and `invoicing.exports.keep-files-for` arrive with IE-30. Runs carry `file_id` for kept copies, still unused.
- Switching on makes the five ledger accounts and one profile. Presets are not applied at run time yet, so the `student-society` preset works through the setting `invoicing.exports.starter`; S10 can also make the union profile at any time.
- Formats `journal` and `custom` only; the package formats are IE-21.
- `signs` gains `credit` (one amount, credits positive), so the union return keeps sales positive and refunds negative while the ledger is double entry. The total line is always money in positive.
- The union return has one row per ledger entry, so each sale shows twice: once on its money account (tender "Money") and once on its income account ("Not money"). Filtering the tender column on "Not money" gives the old file's rows. Categories come from `kind_labels`; the ledger no longer tells a collected ticket from a walk-up, so both read "Ticket sale".
- The source column is the posting's source record (type and id) and the reference the posting id, rather than a title from `core.record-resolver`: resolving every source of a year's file would take more queries than one Worker request may make.
- A code is letters and digits joined by dots, dashes or underscores, so it can be written to the audit row (E-14).
- Taking an export and checking a past run are GET routes, as Finance's own export is: `invoicing.export.take` skips the fresh sign-in, which the kit allows only for reads. The run row is the audited record of the read.
- Coverage counts entries through Finance's new `entryCounts`; Finance also exports `rangeOf`, `rangeClosed`, `listPeriods` and `ledgerAccounts` for the exports.
- E-07's refusal at 50,000 entries is in place but not exercised by a test, which would need 50,001 entries.

## As built: invoices out, slice 1 (IE-07 to IE-09, IE-13, IE-14)

Series, drafts, issuing and money received, with screens S1, S2, S6 and S9. Where the build differs from
the parts above:

- Tables `invoicing_series`, `invoicing_parties`, `invoicing_invoices`, `invoicing_lines` and
  `invoicing_allocations` (append-only). Bills (`direction = 'in'`) and credit notes share the tables
  and arrive with their stories.
- An issued invoice is frozen by its service, not a trigger: every change is predicated on
  `state = 'draft'` and the version, and issue on the total shown as well (decision 0004).
- An invoice's subject is its party's account, with unlinked rows staff-only. A one-off party's
  email is a personal column on the row rather than a second subject, which the kit does not allow.
- Money received is Payments' new `recordReceived`: a desk intent with no till session and an
  attested attempt on an Other payment-method account, settled through Invoices' `payments.settlement`
  handler in the same batch. No new `office` channel was needed. Payments' `Part` gains `receivedOn`,
  so the allocation and the posting carry the day the money arrived rather than the day it was typed.
- A refund of that payment (Payments' own refund flow) reverses the allocation and reopens the
  invoice. A payment may be reversed in parts, so `reverses_id` is indexed but not unique.
- VAT uses Finance's `finance.tax.default-code`; there is no `invoicing.tax.default-code`. A party's
  own default code is read from `invoicing_parties`, which has no screen yet.
- Issue posts kind `transfer`, purpose `invoice`: Dr Debtors the gross; Cr each line's income account
  its net with its VAT code and VAT; Cr Finance's output VAT account the VAT.
- Lines post to Invoices' own income accounts (`accountsOf('invoicing', 'income')`); choosing any
  income account in the ledger waits for Finance to offer one list for every module.
- The treasurer's role template gains `invoicing.invoice.issue` and `invoicing.payment.record`.
- Not yet: card payment on the public page (IE-12) and the over-payment give-back, then bills,
  credit notes and write-offs.

## As built: sending, slice 2 (IE-10, IE-11, IE-17, IE-18)

The PDF, the email and its public page, reminders, and Owed to us (S5's debtors half). Where the build
differs from the parts above:

- The PDF is made by the job `invoicing.after-issue`, queued in the issuing batch, rather than in the
  issuing request; the queue retries it, and the email waits for it. It is drawn with `pdf-lib` and
  the standard Helvetica, so a letter outside Windows-1252 loses its accent or prints as a question
  mark. The theatre's name, address and numbers come from the organisation settings when it is made,
  not from the frozen row; no logo yet.
- The email carries the link to the page, not the PDF: core's email has no attachments yet. The page
  offers the PDF.
- The link's token is derived from the invoice and the link's expiry with the kit's keyed hash, and
  only its hash is stored, so each message sent while the link lasts carries the same link (I-32). A
  send after it lapses makes a new one, and the old dies. Paying the invoice keeps the link, so the
  page can say nothing is owed.
- `invoicing_reminders` records the first send as step `sent` as well as the reminder steps, each
  unique per invoice, so a retried job never sends twice. Only an invoice whose first email went is
  chased; one marked to send by hand waits for a person, who can send it from S2.
- Reminders run hourly and send once the theatre's local time passes `reminders.send-at`. Core has
  no closed days yet, so I-33's closed-day rule waits for it.
- Ageing adds a "Not yet due" band before I-34's four. S5's creditors tab follows with bills.
- `/invoice` joins the reserved address prefixes.

## As built: bills, slice 3 (IE-19, IE-20)

Logging a supplier's bill with their invoice, submitting it, and approving or sending it back. Where
the build differs from the parts above:

- A bill is a row of `invoicing_invoices` with direction `in`, no series, and the supplier's own
  invoice number in `number`. The supplier is a one-off name for now; a supplier as a party (an
  account or a company) follows with Companies.
- I-11's duplicate check matches a party's bills by party and a one-off supplier's by name, ignoring
  case, and runs when the bill is saved as well as when it is submitted, so the unique index never
  refuses first. The refusal names the earlier bill.
- The supplier's file goes into the file slot `invoicing.bill-file` (PDF, PNG or JPEG, cleaned) and
  is checked before it can be attached; the screen waits for the check. Submitting needs the file,
  the supplier's number and date, and a line with an amount. With no due date given, the bill falls
  due after the usual terms.
- Lines take any active expense account in the ledger, from every module. While VAT-registered each
  line keeps the VAT typed from the supplier's invoice (I-43); with none typed it takes the rate's.
- I-10 is a guard in the service over the logger's merged accounts, so it binds an Owner too. A send
  back needs a reason, which is kept in `returned_note` and shown on the draft until it is submitted
  again.
- Approval posts at the moment of approval, with purpose `bill`: Dr each line's account its net with
  the line's code and VAT, Dr `finance.vat-input` the VAT (for Finance), Cr `invoicing.payable` the
  gross. It announces `invoicing.bill.approved` with the total rather than a source.
- `invoicing.bill.log` implies `invoicing.bill.view`, as part 7 says, so whoever logs bills sees them
  all. The treasurer's role template gains log and approve; the producer's gains log.
- Not yet: the `invoicing.bill-waiting` notification to approvers, paying a bill (IE-22, which needs
  Budgets' disbursement route), budget lines on bill lines (IE-24) and S5's creditors tab.

## As built: credit notes and write-offs, slice 4 (IE-15, IE-27)

Credit notes out and writing off a debt. Where the build differs from the parts above:

- A credit note out has no draft: making one numbers it from the default credit note series, posts
  it and allocates it in one batch. Its lines name the original's lines, each whole or for part of
  its net; a part takes VAT at the rate copied onto the original line (a code's rate cannot change
  once used, so the original rate and today's are the same). A predicate on the insert keeps credit
  notes together within the original's total.
- The posting is the reverse of issue with purpose `credit_note`. What is allocated is the least of
  the credit and what is outstanding; a credit note with money left over stays `open`, shown "To give
  back". Giving it back (IE-16) waits for Payments' refund and disbursement routes. Its PDF is made
  by the after-issue job, titled "Credit note" with the invoice it is against; it is not emailed.
- Line owners' credit handlers wait until another module raises invoices with owned lines.
- A write-off records its reason as a term of `invoicing.write-off-reason` on the allocation
  (`reason_term`, added by ALTER TABLE). It posts at once with purpose `write_off`.
- An invoice's shown state gains Credited and Written off, from the last allocation that settled it.
- Supplier credit notes (bill credit notes, approved like a bill) follow with paying bills.
- The treasurer's role template gains `invoicing.invoice.credit`; write-off is left to the Owner.
