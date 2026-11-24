# 3. States and rules

An invoice, a bill and a credit note each have four stored states at most, and everything a person reads beyond that (overdue, part paid, credited) is worked out from the allocations. Rules have ids: I for invoices and bills, E for exports. Every contended change is a conditional write with its predicate on the statement, in one D1 batch with the ledger posting (decisions 0001, 0003).

## Stored states

| State | Invoice out | Bill in | Credit note | Posts to the ledger | May change content |
| --- | --- | --- | --- | --- | --- |
| `draft` | Being written | Being logged | Being written | No | Yes; may be deleted |
| `submitted` | not used | Waiting for approval | Bill credit notes only | No | No; only approve or send back |
| `open` | Issued, something outstanding | Approved, something unpaid | Issued with an amount left to refund | Yes, once, on entering | No |
| `closed` | Nothing outstanding | Nothing unpaid | Fully used | Already did | No |

## What the screens say

| Shown as | When |
| --- | --- |
| Draft | `draft` |
| Waiting for approval | `submitted` |
| Issued, or Approved for a bill | `open` and nothing allocated |
| Part paid | `open` and some payment allocated |
| Overdue | `open`, past `due_on` in the theatre's time zone; shown beside the above, with the days |
| Paid | `closed` and every allocation a payment |
| Credited | `closed` and every allocation a credit |
| Written off | `closed` with a write-off among the allocations |
| Settled | `closed` with any other mix |

## Life cycle of an invoice out

_Diagram in the source doc: invoice out · 3 stored states and a credit note_

Nothing moves an invoice back to Draft: once a number is used, only a credit note undoes it, and the credit note is itself a numbered document from its own series.

## Life cycle of a bill

_Diagram in the source doc: bill in · 4 stored states, one send-back loop_

A bill sent back returns to Draft with the approver's reason on it; the person who logged it fixes it and submits again. A rejected supplier invoice that should never be paid is deleted as a draft, with its file, and the audit keeps that it was.

## Raising from another module

_Diagram in the source doc: raised invoice · owner event to issue, rules I-19 and I-36 to I-39_

A bill raised for a company's share runs the same way, with the payable in place of the receivable and approval in place of issue.

## Rules for drafting and issuing

| Id | Rule |
| --- | --- |
| I-01 | A draft needs a party (a Companies record, an account, or a one-off name) and at least one line before it can be issued or submitted |
| I-02 | A line's quantity is at least 0.001 and its unit amount at least 0; a line of 0 is allowed (a comp hire shown at nothing), but an invoice totalling 0 is refused at issue |
| I-03 | Every line of one invoice is in one currency, the core's, in the first release |
| I-04 | A line with an owner (`owner_key` set) cannot be edited in a draft except its description; its amount is the owner's. Removing it is refused while the owner's record is still waiting on the invoice; the owner withdraws it through its own screen |
| I-05 | A line's net is quantity times unit, rounded half away from zero to the minor unit, computed once on the server; the screen's figure is sent as the expected total and a mismatch refuses quoting both (decision 0004) |
| I-06 | Tax: while `finance.tax.registered` is false, every line's tax code is `none` and nothing about VAT is shown or printed. While it is true, every line carries an active code other than `none` (refused as `invoicing.tax-``code-needed`), starting from the party's `default_tax_code`, else the code the line owner suggests, else `invoicing.tax.default-code`; the VAT rules I-41 to I-46 then apply |
| I-07 | A line without an owner names an active account whose module is `invoicing`: an income account for an invoice out, an expense account for a bill |
| I-08 | Issue date defaults to today; it may be set up to `invoicing.issue.backdate-limit` earlier, never later. Due date is issue date plus the party's terms, or the theatre's |
| I-09 | Issuing an invoice out needs `invoicing.invoice.issue`; an invoice over `invoicing.issue.second-person-over` (unset by default) also needs someone other than its creator (owner: refuses) |
| I-10 | Approving a bill needs `invoicing.bill.approve`, and the approver is never the person who logged it (owner: refuses; an Owner included: this is a four-eyes rule, not an own-record refusal, so the Owner exemption of 23 November 2026 does not apply; ruling R3-17) |
| I-11 | A bill needs the supplier's file attached before it can be submitted, and its supplier number is unique for that supplier (refused as `invoicing.bill.duplicate`, naming the earlier bill) |
| I-12 | Issue takes the series' next number by `UPDATE invoicing_series SET next_number = next_number + 1 WHERE id = ? AND next_number = ? AND archived_at IS NULL`, expecting one row, in the same batch as the state change and the posting. Two people issuing at once: one wins, the other's batch fails whole and is retried with the new number. No number is ever skipped or reused |
| I-13 | Issue or approval and its ledger posting are one batch: the invoice is never `open` without its posting, nor the posting there without the invoice. The posting's idempotency key is `invoicing:invoice:<id>:issue` |
| I-14 | Once out of `draft`, a trigger refuses any change to a frozen column (part 2) and refuses deleting the row or its lines |
| I-15 | After issue only these may change: `bill_to_email` (a corrected address, audited, then the invoice may be sent again), `internal_note`, `reminders_on`, and the token columns |
| I-16 | The PDF of an invoice out is made in the issuing request after the batch commits, from the frozen row, and stored as a core file. If making it fails, the invoice stays issued and a job retries; the email waits for the PDF |
| I-17 | Issuing sends the invoice by email when `bill_to_email` is set and the person issuing leaves "Send now" ticked; otherwise it is marked to send by hand, and a printed copy is the PDF |
| I-18 | The public invoice page is reached by a T1 link token (Foundations' link-token rules): it shows the frozen invoice, the outstanding amount, and a card payment button when Stripe is set up and `invoicing.pay-online` is on |
| I-19 | Another module raises an invoice or bill by announcing its own event (such as `companies.settlement.approved`), which this module lists in its listens; the listener asks that module's `invoicing.line-owner` for the party and lines and makes a draft in its own unit. A raised draft is never issued automatically: a person checks it. If the owner later answers null for that record, the draft is deleted and the issue refused |

## Rules for money against an invoice or bill

| Id | Rule |
| --- | --- |
| I-20 | Money in for an invoice is a Payments intent whose one part is owned by `invoicing`, record = the invoice id; Payments' settlement calls this module, which credits `invoicing.receivable` and adds a payment allocation in the same unit |
| I-21 | Recording a bank transfer or cheque received is a Payments intent settled by the `other_attested` method on the office channel (amendment P-A2), with the date it arrived and the bank reference |
| I-22 | An allocation adds to `allocated_minor` with `WHERE allocated_minor + ? <= total_minor`; an amount over the outstanding is refused, quoting both figures. A card payment through the public page that arrives after the invoice was settled some other way is refused at settlement, and Payments returns the money (its unfulfilled path) |
| I-23 | When `allocated_minor` reaches `total_minor` in that statement, the same batch moves the invoice to `closed`, clears the pay token, and announces `invoicing.invoice.paid` (or `.credited`, or `.settled` for a mix) |
| I-24 | Money out for a bill is a Payments disbursement (P-A1) whose part is owned by `invoicing`; the disbursement handler debits `invoicing.payable` and adds a payment allocation |
| I-25 | An allocation is never edited or deleted. A payment recorded against the wrong invoice is undone by a reversal row in the same batch as Payments' own correction, and the invoice reopens |
| I-26 | A write-off needs `invoicing.invoice.write-off`, a reason from the vocabulary `invoicing.write-off-reason`, is never made by the person who issued the invoice (an Owner included, ruling R3-17), and is made only on an invoice out that is overdue by at least `invoicing.write-off.min-overdue`. It posts Dr `invoicing.bad-debts`, Cr `invoicing.receivable` |
| I-27 | A credit note is made from an `open` or `closed` invoice or bill, for any lines or part amounts up to that original's total less earlier credit notes. Its lines mirror the original's accounts and owners |
| I-28 | Issuing a credit note posts the reverse of the lines it names, calls each line owner's `credit` handler, and allocates against the original up to the original's outstanding. Any rest stays `open` on the credit note as money to give back |
| I-29 | Money to give back on a credit note out is returned through Payments: a refund of the card payment it came from, or a disbursement for a bank transfer. Money to come back on a bill credit note is received like an invoice payment |
| I-30 | Money against a VAT invoice or bill is allocated against its gross total, VAT included; a part payment is never split between net and VAT in this module, and the VAT report (rule I-46) apportions it only under cash accounting |

## Rules for reminders and the debtors list

| Id | Rule |
| --- | --- |
| I-31 | A daily task at `invoicing.reminders.send-at` sends, for each open invoice out with reminders on and an email: a reminder `invoicing.reminders.before-due` before the due date, a first overdue reminder that many days after, and a second after `invoicing.reminders.second-after`. Each step is sent once (unique index) |
| I-32 | A reminder carries the same link token as the invoice; if the token has expired a new one is issued and the old one dies (T1) |
| I-33 | Reminders never go to a party whose invoices are all paid by the time the task runs, nor on a day the theatre marked as closed in core |
| I-34 | Ageing counts days past due in the theatre's time zone, in bands 0 to 30, 31 to 60, 61 to 90 and over 90; the debtors list sorts by days overdue, largest first |
| I-35 | Staff may send a reminder by hand at any time; it is recorded as step `manual` |

## Rules for line owners

| Id | Rule |
| --- | --- |
| I-36 | An owner's handler gets the unit and the line, and returns entries on its own accounts only; the total of its entries for a line is exactly minus that line's net on issue of an invoice out, and plus it on approval of a bill, reversed on credit. A wrong total refuses the batch |
| I-37 | An owner may refuse (its record has moved on); the issue or approval then fails whole and the person is told the owner's reason |
| I-38 | When the owner module is switched off, its lines cannot be issued, approved or credited, and the screen says which module to switch back on; money may still be received against an issued invoice, because that touches only this module's accounts |
| I-39 | `invoicing.invoice.paid`, `.credited` and `.settled` carry the source record, so the owner can update its own record in its own listener; Invoices never writes an owner's tables |
| I-40 | A health check compares `invoicing.receivable`'s ledger balance with the sum of outstanding invoices out, and `invoicing.payable`'s with outstanding bills; any difference is a failing check naming the amount |

## Rules for VAT

VAT is in the first release. These rules apply only while Finance's `finance.tax.registered` is true; an unregistered theatre sees no VAT anywhere (rule I-06). Tax codes, their rates, the theatre's VAT number and scheme, and the two VAT accounts are Finance's (amendment F-A2, tab 4). Every contended write is still one batch with its posting.

| Id | Rule |
| --- | --- |
| I-41 | An invoice or credit note out issued while registered is a full VAT invoice, whatever its size: the number, the issue date, the time of supply where it differs (`supplied_on`), the theatre's name, address and VAT number, the party's name and address, and per line the description, quantity, unit price, rate and net, then the net total, the VAT total in sterling and the gross total. Issue is refused while `finance.tax.number` is unset (`invoicing.tax-number-missing`); the number is copied into `seller_tax_number` at issue and frozen |
| I-42 | A line's rate is copied from its code into `tax_rate_bp` when the line is saved and frozen at issue. A line's VAT is its net times that rate, rounded half away from zero to the penny, worked once per line on the server; the invoice's VAT is the sum of its lines. The expected total the screen sends is the gross, and a mismatch refuses quoting both (decision 0004). A code's rate is never edited once used (F-A2), so a change of rate is a new code and issued invoices keep theirs |
| I-43 | A bill's VAT is typed per line from the supplier's invoice, because what may be reclaimed is what the supplier charged. The screen shows the worked figure beside it and warns, never refuses, when they differ by more than a penny. A bill from a supplier that is not VAT-registered takes the code `outside` with no VAT |
| I-44 | Issue posts Dr `invoicing.receivable` the gross; Cr each line's account, or its owner's entries, the net, that entry carrying the line's `tax_code` and `tax_minor`; Cr `finance.vat-output` the VAT. Approving a bill posts Dr each line's account the net with its tax columns, Dr `finance.vat-input` the VAT, Cr `invoicing.payable` the gross. A credit note takes its original lines' codes and rates and reverses net and VAT alike. VAT entries carry `for_module` = `finance` (F-A1, F-A2). Line owners only ever see nets (rule I-36) |
| I-45 | A write-off posts the whole outstanding, VAT included, to bad debts (rule I-26). Under the standard scheme, the VAT report lists a written-off VAT invoice once six months have passed since the later of its due date and its time of supply, with its VAT part, as bad debt relief the treasurer may claim. Claiming it is the treasurer's journal in Finance, recorded against the invoice so it is listed once. Under cash accounting nothing is listed, because VAT is due only on money received |
| I-46 | The VAT report gives, for a range of dates: output VAT less credit notes, input VAT, and net sales and purchases by tax code, from every entry on Finance's two VAT accounts and the entries carrying their codes, whichever module posted them, read through Finance's taxTotals and never from Finance's tables (F-A2). Under `finance.tax.scheme` standard it counts by time of supply (`supplied_on`, else `issue_on`); under cash, by the date of each payment allocation, apportioning VAT in proportion to the gross. Box office, bar and other sales carry their codes through Finance's FIN-07, which is in the same release (Integration question 12), and count by the date of the sale on either scheme. It is a report to copy into a return; nothing is sent to HMRC (IE-43, later) |

## Rules for exports

_Diagram in the source doc: export run · by hand and scheduled, rules E-05, E-08, E-09, E-12, E-13_

A schedule with `only_closed` off skips the question and marks the file `-open`.

| Id | Rule |
| --- | --- |
| E-01 | An export reads sealed postings only, through Finance's entryRows (F-A2), never Finance's tables, between two theatre-local dates inclusive, by the posting's `occurred_at`, as Finance's own export does |
| E-02 | Every ledger entry in the range appears exactly once in an `entry` export, and in exactly one line of a `daily` export; nothing is dropped, filtered or invented |
| E-03 | A daily line is the sum of entries with the same day, account, code, posting kind override and tag set; a line summing to 0 is still written, so the count of accounts per day is stable |
| E-04 | The file balances: in a split-signs profile the debit column total equals the credit column total; in a signed profile the amounts sum to 0. An optional total line comes after and is excluded from that check |
| E-05 | An account with no code in the profile goes out with `unmapped_code` on its line; the screen warns with the number of lines and the accounts, before download |
| E-06 | A code is looked up by account and posting kind first, then by account alone |
| E-07 | A range of more than 50,000 entries is refused with the count, as Finance's export is; the screen offers one period at a time |
| E-08 | The screen shows before download: first and last day, lines, unmapped lines, and whether every day lies in a closed period |
| E-09 | Every download writes an export run with the profile's map digest and the file's SHA-256; taking the same closed range again with the same map gives the same bytes, and the screen says so by matching an earlier run |
| E-10 | Cells that start with `=`, `+`, `-`, `@`, tab or return are prefixed with an apostrophe, except amount columns, which are written as plain numbers so a spreadsheet adds them |
| E-11 | Amounts are written in major units with the currency's decimals, a dot as decimal point and no thousands separator, whatever the date format |
| E-12 | A scheduled export with `only_closed` waits until every day of its range is closed, then sends once; it never sends a range that is still open unless `only_closed` is off, and then marks the file name with `-open` |
| E-13 | A scheduled export emails a link to the kept file, not the file, because the file may hold names of productions not yet announced; the link is a T1 token for `invoicing.export.take` holders only after sign-in |
| E-14 | Changing a code is audited with the old and new code; it never changes a past run's file, and the next run's map digest differs |
| E-15 | Exports never contain a person's name, email, address or any free text; descriptions are the posting's source title from `core.record-resolver` and the account's name |
| E-16 | A package format's tax column comes from the profile's tax map (Finance's code to the package's name for that rate); a code with no entry is written as the profile's unmapped code and counted with the unmapped lines (E-05). Lines with code none take the map's entry for none, which the presets fill (Sage T9, Xero No VAT) |
